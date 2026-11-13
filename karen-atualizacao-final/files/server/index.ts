
import express from 'express'
import session from 'express-session'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import cors from 'cors'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'
import path from 'node:path'
import { assinaturaValida, checkoutSeguro, duracaoCheckout } from './payment.ts'
import { products } from '../src/products.ts'
import { homologacao, tokenPagamento, validarBancoHomologacao, validarVendedorTeste, destinatarioPermitido, notificacoesHabilitadas } from './homologation.ts'
import { LimiteLogin } from './loginRateLimit.ts'

declare module 'express-session' {
  interface SessionData {
    admin: boolean
  }
}

if (process.env.NODE_ENV !== 'test') dotenv.config({ path: '.env.local' })
validarBancoHomologacao()

if (!process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_SESSION_SECRET.length < 32) throw new Error('Configure ADMIN_SESSION_SECRET com pelo menos 32 caracteres.')
export const app = express()
const PORT = process.env.PORT || 3001

app.use(cors({ origin: process.env.PUBLIC_APP_URL || false, credentials: true }))
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1)
app.use(express.json({ limit: '20kb' }))
app.use(['/api/admin', '/api/me'], (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  const origem = req.get('origin')
  if (origem && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    let permitida = ''
    try { permitida = new URL(process.env.PUBLIC_APP_URL || '').origin } catch { /* Sem origem válida, recusa a alteração. */ }
    if (origem !== permitida) return res.status(403).json({ erro: 'Origem da solicitação não autorizada.' })
  }
  next()
})

app.use(session({
  name: 'karen_admin_session',
  secret: process.env.ADMIN_SESSION_SECRET!,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 60 * 60 * 1000
  }
}))

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SECRET_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Configure as variáveis do Supabase.')
}

const supabase = createClient(supabaseUrl, supabaseKey)
const PHOTO_BUCKET = process.env.PRODUCT_PHOTO_BUCKET || 'product-photos'
const configuredAdminPassword = process.env.ADMIN_PASSWORD

if (!configuredAdminPassword) {
  throw new Error('Configure a senha administrativa.')
}
const adminPassword: string = configuredAdminPassword

function senhaValida(senha: string) {
  const recebida = Buffer.from(senha)
  const cadastrada = Buffer.from(adminPassword)

  return recebida.length === cadastrada.length &&
    timingSafeEqual(recebida, cadastrada)
}

function requireAdmin(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.session.admin === true) {
    return next()
  }

  return res.status(401).json({
    erro: 'Acesso administrativo não autorizado.'
  })
}

function escaparHtml(valor: string | number) {
  const entidades: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return String(valor).replace(/[&<>"']/g, caractere => entidades[caractere])
}

function money(valor: number) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function precificacaoValida(body: Record<string, unknown>) {
  const precificacao = {
    custo_aquisicao: Number(body.custo_aquisicao ?? 0),
    custo_adicional: Number(body.custo_adicional ?? 0),
    taxa_mp_percentual: Number(body.taxa_mp_percentual ?? 0),
    taxas_adicionais_percentual: Number(body.taxas_adicionais_percentual ?? 0),
    margem_desejada_percentual: Number(body.margem_desejada_percentual ?? 30),
  }
  const valores = Object.values(precificacao)
  if (valores.some(valor => !Number.isFinite(valor) || valor < 0)) return null
  if (precificacao.taxa_mp_percentual + precificacao.taxas_adicionais_percentual + precificacao.margem_desejada_percentual >= 100) return null
  return precificacao
}

type ItemCheckout = { title: string; quantity: number; unit_price: string }

async function criarCheckoutMercadoPago(pedidoId: string, email: string, total: number, itens: ItemCheckout[], expiraEm: string) {
  const accessToken = tokenPagamento()
  const publicUrl = process.env.PUBLIC_APP_URL?.replace(/\/$/, '')
  if (!accessToken || !publicUrl || new URL(publicUrl).protocol !== 'https:') throw new Error('Pagamento ainda não configurado no servidor.')

  const urlRetorno = `${publicUrl}/?pagamento=retorno&pedido=${encodeURIComponent(pedidoId)}`
  const resposta = await fetch('https://api.mercadopago.com/v1/orders', {
    signal: AbortSignal.timeout(15000),
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': pedidoId,
    },
    body: JSON.stringify({
      expiration_time: duracaoCheckout(expiraEm),
      type: 'online',
      processing_mode: 'manual',
      capture_mode: 'automatic_async',
      total_amount: total.toFixed(2),
      external_reference: pedidoId,
      description: `Pedido Karen Beauty Shop ${pedidoId}`,
      payer: { email },
      items: itens,
      config: { online: { success_url: urlRetorno, failure_url: urlRetorno, pending_url: urlRetorno, auto_return: 'approved' } },
    }),
  })
  const resultado = await resposta.json().catch(() => ({})) as { id?: string; checkout_url?: string; message?: string }
  if (!resposta.ok || !resultado.id || !checkoutSeguro(resultado.checkout_url)) {
    console.error('Mercado Pago não criou o checkout:', resposta.status, resultado.message || 'resposta inválida')
    throw new Error('Não foi possível iniciar o pagamento. Confira a configuração do Mercado Pago e tente novamente.')
  }
  return { id: resultado.id, checkoutUrl: resultado.checkout_url }
}

function assinaturaMercadoPagoValida(req: express.Request) {
  return assinaturaValida(process.env.MERCADO_PAGO_WEBHOOK_SECRET, req.get('x-signature'), req.get('x-request-id'), req.query['data.id'])
}

type DadosEmailPedido = {
  numero: string | number
  nome: string
  email: string
  whatsapp: string
  tipoEntrega: string
  enderecoCompleto: string
  total: number
  itens: Array<{ nome_produto: string; quantidade: number; preco_unitario: number; total_item: number }>
}

type DadosWhatsAppPedido = DadosEmailPedido

function normalizarNumeroWhatsApp(numero: string) {
  const digitos = numero.replace(/\D/g, '')
  if (numero.trim().startsWith('+') || numero.trim().startsWith('00')) return digitos.startsWith('00') ? digitos.slice(2) : digitos
  if (digitos.startsWith('55') || digitos.length < 10 || digitos.length > 11) return digitos
  return `55${digitos}`
}

async function enviarTemplateWhatsApp(destino: string, nomeTemplate: string, parametros: string[]) {
  if (!notificacoesHabilitadas() || !destinatarioPermitido('whatsapp', destino)) return false
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v25.0'
  const idioma = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR'
  if (!token || !phoneNumberId || !destino || !nomeTemplate) return false

  try {
    const resposta = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      signal: AbortSignal.timeout(15000),
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: nomeTemplate,
          language: { code: idioma },
          components: [{ type: 'body', parameters: parametros.map(text => ({ type: 'text', text })) }],
        },
      }),
    })
    const resultado = await resposta.json().catch(() => ({})) as { error?: { code?: number; message?: string } }
    if (!resposta.ok) {
      console.error('Falha no envio de WhatsApp:', resultado.error?.code || resposta.status, resultado.error?.message || 'erro na API da Meta')
      return false
    }
    return true
  } catch (error) {
    console.error('Falha de conexão com a API do WhatsApp:', error instanceof Error ? error.message : 'erro de rede')
    return false
  }
}

async function enviarWhatsAppPedido(pedido: DadosWhatsAppPedido, aceitaAtualizacaoCliente: boolean) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const destinatarioLoja = process.env.WHATSAPP_ORDER_RECIPIENT
  const templateLoja = process.env.WHATSAPP_ORDER_STORE_TEMPLATE
  const templateCliente = process.env.WHATSAPP_ORDER_CUSTOMER_TEMPLATE
  const configurado = Boolean(token && phoneNumberId && destinatarioLoja && templateLoja)
  if (!configurado) return { configurado: false, loja: false, cliente: !aceitaAtualizacaoCliente }

  const itensResumo = pedido.itens.map(item => `${item.quantidade}x ${item.nome_produto}`).join('; ').slice(0, 800)
  const mensagens: Promise<boolean>[] = [
    enviarTemplateWhatsApp(normalizarNumeroWhatsApp(destinatarioLoja!), templateLoja!, [
      String(pedido.numero), pedido.nome, normalizarNumeroWhatsApp(pedido.whatsapp), itensResumo, money(pedido.total),
    ]),
  ]
  if (aceitaAtualizacaoCliente) {
    if (!templateCliente) {
      console.warn('WhatsApp do cliente não enviado: configure WHATSAPP_ORDER_CUSTOMER_TEMPLATE com um modelo aprovado pela Meta.')
      mensagens.push(Promise.resolve(false))
    } else {
      mensagens.push(enviarTemplateWhatsApp(normalizarNumeroWhatsApp(pedido.whatsapp), templateCliente, [
        pedido.nome, String(pedido.numero), money(pedido.total),
      ]))
    }
  }
  const [resultadoLoja, resultadoCliente] = await Promise.all(mensagens)
  return {
    configurado: true,
    loja: resultadoLoja,
    cliente: aceitaAtualizacaoCliente ? resultadoCliente : true,
  }
}

async function enviarEmailsPedido(pedido: DadosEmailPedido) {
  if (!notificacoesHabilitadas()) return { cliente: false, loja: false }
  const smtpHost = process.env.SMTP_HOST
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS
  const fromEmail = process.env.SMTP_FROM_EMAIL || smtpUser
  const emailLoja = process.env.ORDER_NOTIFICATION_EMAIL || smtpUser
  const smtpPort = Number(process.env.SMTP_PORT || 587)

  if (!smtpHost || !smtpUser || !smtpPass || !fromEmail || !emailLoja) {
    console.warn('Notificações de pedido por e-mail não enviadas: configure SMTP_HOST, SMTP_USER, SMTP_PASS e ORDER_NOTIFICATION_EMAIL no ambiente do servidor.')
    return { cliente: false, loja: false }
  }

  const transportador = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    connectionTimeout: 10000,
    socketTimeout: 15000,
    auth: { user: smtpUser, pass: smtpPass.replace(/\s/g, '') },
  })
  const itensTexto = pedido.itens.map(item => `${item.quantidade} x ${item.nome_produto} — ${money(item.total_item)}`).join('\n')
  const itensHtml = pedido.itens.map(item => `<li>${item.quantidade} × ${escaparHtml(item.nome_produto)} — ${money(item.total_item)}</li>`).join('')
  const cabecalhoHtml = `<h2>Pedido nº ${escaparHtml(pedido.numero)}</h2><p><strong>Cliente:</strong> ${escaparHtml(pedido.nome)}</p><p><strong>WhatsApp:</strong> ${escaparHtml(pedido.whatsapp)}</p><p><strong>Entrega:</strong> ${escaparHtml(pedido.tipoEntrega === 'pickup' ? 'Retirada na loja' : 'Entrega no endereço')}</p>${pedido.enderecoCompleto ? `<p><strong>Endereço:</strong> ${escaparHtml(pedido.enderecoCompleto)}</p>` : ''}<ul>${itensHtml}</ul><p><strong>Total: ${money(pedido.total)}</strong></p>`
  const remetente = `Karen Beauty Shop <${fromEmail}>`

  const [resultadoCliente, resultadoLoja] = await Promise.allSettled([
    destinatarioPermitido('email', pedido.email) ? transportador.sendMail({
      from: remetente,
      to: pedido.email,
      subject: `Recebemos seu pedido nº ${pedido.numero} | Karen Beauty Shop`,
      text: `Olá, ${pedido.nome}! O pagamento do pedido nº ${pedido.numero} foi confirmado.\n\n${itensTexto}\n\nTotal: ${money(pedido.total)}\nEntrega: ${pedido.tipoEntrega === 'pickup' ? 'Retirada na loja' : 'Entrega no endereço'}\n\nA Karen Beauty Shop dará andamento ao seu pedido.`,
      html: `<p>Olá, ${escaparHtml(pedido.nome)}! O pagamento do seu pedido foi confirmado.</p>${cabecalhoHtml}<p>A Karen Beauty Shop dará andamento ao seu pedido.</p>`,
    }) : Promise.reject(new Error('Destinatário fora da lista de homologação.')),
    destinatarioPermitido('email', emailLoja) ? transportador.sendMail({
      from: remetente,
      to: emailLoja,
      replyTo: pedido.email,
      subject: `Novo pedido nº ${pedido.numero} | Karen Beauty Shop`,
      text: `Novo pedido nº ${pedido.numero}\nPagamento confirmado pelo Mercado Pago\nCliente: ${pedido.nome}\nE-mail: ${pedido.email}\nWhatsApp: ${pedido.whatsapp}\nEntrega: ${pedido.tipoEntrega === 'pickup' ? 'Retirada na loja' : 'Entrega no endereço'}\n${pedido.enderecoCompleto ? `Endereço: ${pedido.enderecoCompleto}\n` : ''}\n${itensTexto}\n\nTotal: ${money(pedido.total)}`,
      html: `<p>Novo pedido recebido. <strong>Pagamento confirmado pelo Mercado Pago.</strong></p>${cabecalhoHtml}<p><strong>E-mail do cliente:</strong> ${escaparHtml(pedido.email)}</p>`,
    }) : Promise.reject(new Error('Destinatário fora da lista de homologação.')),
  ])

  if (resultadoCliente.status === 'rejected') console.error('Falha ao enviar confirmação ao cliente:', resultadoCliente.reason instanceof Error ? resultadoCliente.reason.message : 'erro SMTP')
  if (resultadoLoja.status === 'rejected') console.error('Falha ao enviar aviso à loja:', resultadoLoja.reason instanceof Error ? resultadoLoja.reason.message : 'erro SMTP')
  return {
    cliente: resultadoCliente.status === 'fulfilled',
    loja: resultadoLoja.status === 'fulfilled',
  }
}
const limiteLogin = new LimiteLogin()
app.post('/api/admin/login', (req, res) => {
  const origem = req.ip || 'desconhecida'
  const espera = limiteLogin.espera(origem)
  if (espera) {
    res.set('Retry-After', String(espera))
    return res.status(429).json({ erro: 'Muitas tentativas de acesso. Aguarde antes de tentar novamente.' })
  }
  const { senha } = req.body || {}

  if (typeof senha !== 'string' || !senhaValida(senha)) {
    limiteLogin.falhou(origem)
    return res.status(401).json({
      erro: 'Senha administrativa incorreta.'
    })
  }

  limiteLogin.limpar(origem)

  req.session.regenerate((error) => {
    if (error) {
      return res.status(500).json({
        erro: 'Não foi possível iniciar a sessão.'
      })
    }

    req.session.admin = true

    req.session.save((saveError) => {
      if (saveError) {
        return res.status(500).json({
          erro: 'Não foi possível salvar a sessão.'
        })
      }

      return res.json({
        mensagem: 'Login realizado com sucesso!'
      })
    })
  })
})

app.get('/api/admin/me', requireAdmin, (_req, res) => {
  res.json({ autenticado: true })
})

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        erro: 'Não foi possível encerrar a sessão.'
      })
    }

    res.clearCookie('karen_admin_session')
    return res.json({ mensagem: 'Logout realizado.' })
  })
})
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Servidor Karen Beauty Shop funcionando!'
  })
})

app.get('/api/produtos', async (_req, res) => {
  const { data, error } = await supabase.rpc('catalogo_disponivel')
  if (error) return res.status(503).json({ erro: 'Catálogo indisponível. Tente novamente em instantes.' })
  res.set('Cache-Control', 'no-store')
  return res.json({ produtos: data || [] })
})

async function clienteAutenticado(req: express.Request) {
  const authorization = req.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

app.get('/api/me/pedidos', async (req, res) => {
  try {
    const cliente = await clienteAutenticado(req)
    if (!cliente) return res.status(401).json({ erro: 'Entre na sua conta para consultar os pedidos.' })
    const { data, error } = await supabase
      .from('pedidos')
      .select('id,numero_pedido,total,status,criado_em,itens_pedido(id,nome_produto,nome_variacao,quantidade,total_item)')
      .eq('cliente_id', cliente.id)
      .order('criado_em', { ascending: false })
    if (error) throw error
    return res.json({ pedidos: data || [] })
  } catch (error) {
    console.error('Erro ao carregar pedidos do cliente:', error)
    return res.status(500).json({ erro: 'Não foi possível carregar seus pedidos.' })
  }
})

app.post('/api/pedidos', async (req, res) => {
  try {
    if (!(homologacao() ? process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN : process.env.MERCADO_PAGO_ACCESS_TOKEN) || !process.env.MERCADO_PAGO_WEBHOOK_SECRET || !process.env.PUBLIC_APP_URL) {
      return res.status(503).json({ erro: 'O pagamento online ainda não está configurado. Avise a loja para concluir a configuração.' })
    }
    const authorization = req.get('authorization')
    let clienteId: string | null = null
    if (authorization) {
      const cliente = await clienteAutenticado(req)
      if (!cliente) return res.status(401).json({ erro: 'Sua sessão expirou. Entre novamente para registrar o pedido na conta.' })
      clienteId = cliente.id
    }
    const {
      nome,
      whatsapp,
      email,
      tipo_entrega,
      cep,
      cidade,
      estado,
      endereco,
      numero,
      complemento,
      bairro,
      aceita_whatsapp,
      itens
    } = req.body

    if (
      typeof nome !== 'string' || !nome.trim() || nome.length > 160 ||
      typeof whatsapp !== 'string' || !/^\+?[\d\s()-]{10,25}$/.test(whatsapp) ||
      typeof email !== 'string' ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !['delivery', 'pickup'].includes(tipo_entrega) ||
      (aceita_whatsapp !== undefined && typeof aceita_whatsapp !== 'boolean') ||
      !Array.isArray(itens) ||
      itens.length === 0 ||
      itens.length > 50
    ) {
      return res.status(400).json({
        erro: 'Confira os dados do pedido.'
      })
    }

    if (tipo_entrega === 'delivery' && (
      !cidade || !estado || !endereco || !numero || !bairro
    )) {
      return res.status(400).json({
        erro: 'Preencha o endereço de entrega.'
      })
    }

    if (itens.some((item: Record<string, unknown>) => !item || !Number.isSafeInteger(item.produto_id) ||
      !Number.isSafeInteger(item.quantidade) || Number(item.quantidade)<1 || Number(item.quantidade)>10000 ||
      (item.variacao_id != null && (typeof item.variacao_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.variacao_id))))) {
      return res.status(400).json({ erro: 'Produto, variação ou quantidade inválida.' })
    }
    try { await validarVendedorTeste() } catch {
      return res.status(503).json({ erro: 'Pagamento bloqueado. Confira nos secrets a credencial e o ID do vendedor de teste.' })
    }
    const { data: pedido, error: erroPedido } = await supabase.rpc('criar_pedido_reservado', {
      p_dados: { nome: nome.trim(), whatsapp: whatsapp.trim(), email: email.trim().toLowerCase(), tipo_entrega,
        cep, cidade, estado, endereco, numero, complemento, bairro, cliente_id: clienteId, aceita_whatsapp: aceita_whatsapp === true },
      p_itens: itens.map((i: Record<string, unknown>) => ({ produto_id: i.produto_id, variacao_id: i.variacao_id || null, quantidade: i.quantidade })),
    })
    if (erroPedido || !pedido) return res.status(409).json({ erro: 'Não foi possível reservar os itens. Confira variações, quantidades e disponibilidade e tente novamente.' })
    const subtotal = Number(pedido.total)
    const itensValidados = pedido.itens as Array<{ nome_produto: string; nome_variacao?: string; quantidade: number; preco_unitario: number }>

    let checkoutMercadoPago: { id: string; checkoutUrl: string }
    try {
      checkoutMercadoPago = await criarCheckoutMercadoPago(
        pedido.id,
        email.trim().toLowerCase(),
        subtotal,
        itensValidados.map(item => ({
          title: [item.nome_produto, item.nome_variacao].filter(Boolean).join(' — ').slice(0, 250),
          quantity: item.quantidade,
          unit_price: Number(item.preco_unitario).toFixed(2),
        })),
        pedido.expira_em,
      )
    } catch (error) {
      console.error('Erro ao iniciar pagamento do pedido:', error instanceof Error ? error.message : 'erro do Mercado Pago')
      // Reserva mantida até expirar: uma falha de rede pode ocorrer após a criação no provedor.
      await supabase.from('pedidos').update({ pagamento_revisao: true }).eq('id', pedido.id)
      return res.status(502).json({ erro: error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento.' })
    }

    const { error: erroVinculoPagamento } = await supabase
      .from('pedidos')
      .update({ mercado_pago_order_id: checkoutMercadoPago.id })
      .eq('id', pedido.id)
    if (erroVinculoPagamento) {
      console.error('Erro ao vincular pagamento ao pedido:', erroVinculoPagamento)
      return res.status(500).json({ erro: 'O pagamento foi iniciado, mas não foi possível salvar a referência do pedido. Contate a loja antes de tentar novamente.' })
    }

    return res.status(201).json({
      mensagem: 'Pedido registrado com sucesso!',
      pedido: {
        id: pedido.id,
        numero: pedido.numero_pedido,
        total: subtotal,
        status: 'aguardando_pagamento',
      },
      reservaExpiraEm: pedido.expira_em,
      checkoutUrl: checkoutMercadoPago.checkoutUrl,
    })
  } catch (error) {
    console.error('Erro inesperado:', error)

    return res.status(500).json({
      erro: 'Ocorreu um erro ao processar o pedido.'
    })
  }
})

app.post('/api/pagamentos/mercado-pago/webhook', async (req, res) => {
  try {
    if (req.query.type !== 'order') return res.sendStatus(200)
    if (!assinaturaMercadoPagoValida(req)) return res.sendStatus(401)

    const orderId = String(req.query['data.id'] || '')
    const token = tokenPagamento()
    await validarVendedorTeste()
    if (!orderId || !token) return res.sendStatus(400)

    const resposta = await fetch(`https://api.mercadopago.com/v1/orders/${encodeURIComponent(orderId)}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    })
    if (!resposta.ok) {
      console.error('Não foi possível consultar a order notificada pelo Mercado Pago:', resposta.status)
      return res.sendStatus(502)
    }

    const order = await resposta.json() as { id?: string; status?: string; external_reference?: string; total_amount?: string; total_paid_amount?: string; currency?: string }
    if (order.id !== orderId || !order.external_reference || !order.total_amount || order.currency !== 'BRL') return res.sendStatus(400)

    const { data: pedidoLocal, error: erroPedidoLocal } = await supabase
      .from('pedidos')
      .select('id,numero_pedido,nome,email,whatsapp,tipo_entrega,endereco,numero,complemento,bairro,cidade,estado,cep,total,status,aceita_whatsapp,mercado_pago_order_id,itens_pedido(nome_produto,nome_variacao,quantidade,preco_unitario,total_item)')
      .eq('id', order.external_reference)
      .eq('mercado_pago_order_id', orderId)
      .maybeSingle()
    if (erroPedidoLocal) {
      console.error('Erro ao localizar pedido do webhook:', erroPedidoLocal)
      return res.sendStatus(500)
    }
    if (!pedidoLocal || Number(order.total_amount) !== Number(pedidoLocal.total)) return res.sendStatus(400)

    if (order.status === 'processed' && Number(order.total_paid_amount) !== Number(pedidoLocal.total)) return res.sendStatus(400)
    const { data: resultado, error } = await supabase.rpc('processar_pagamento_reservado', {
      p_pedido_id: pedidoLocal.id, p_order_id: orderId, p_status: order.status || 'unknown', p_total: Number(order.total_amount),
    })
    if (error) return res.sendStatus(500)
    res.sendStatus(200)
    if (resultado?.confirmado_agora) {
      const enderecoCompleto = pedidoLocal.tipo_entrega === 'delivery'
        ? [pedidoLocal.endereco, pedidoLocal.numero, pedidoLocal.complemento, pedidoLocal.bairro, pedidoLocal.cidade, pedidoLocal.estado, pedidoLocal.cep].filter(Boolean).join(', ')
        : ''
      const dadosPedido: DadosEmailPedido = {
        numero: pedidoLocal.numero_pedido,
        nome: pedidoLocal.nome,
        email: pedidoLocal.email,
        whatsapp: pedidoLocal.whatsapp,
        tipoEntrega: pedidoLocal.tipo_entrega,
        enderecoCompleto,
        total: Number(pedidoLocal.total),
        itens: (pedidoLocal.itens_pedido || []).map(item => ({ ...item, nome_produto: [item.nome_produto, item.nome_variacao].filter(Boolean).join(' — ') })),
      }
      void Promise.all([
        enviarEmailsPedido(dadosPedido),
        enviarWhatsAppPedido(dadosPedido, pedidoLocal.aceita_whatsapp === true),
      ]).catch(errorEnvio => {
        console.error('Erro ao enviar notificações do pedido pago:', errorEnvio instanceof Error ? errorEnvio.message : 'erro inesperado')
      })
    }
    return
  } catch (error) {
    console.error('Erro ao processar webhook do Mercado Pago:', error instanceof Error ? error.message : 'erro inesperado')
    return res.sendStatus(500)
  }
})

app.get('/api/admin/dashboard', requireAdmin, async (_req, res) => {
  try {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        numero_pedido,
        nome,
        whatsapp,
        total,
        status,pedido_teste,pagamento_revisao,
        criado_em
      `)
      .order('criado_em', { ascending: false })

    if (error) {
      console.error('Erro ao buscar pedidos:', error)
      return res.status(500).json({
        erro: 'Não foi possível carregar os pedidos.'
      })
    }

    const todosPedidos = pedidos || []
const lista = todosPedidos.filter(pedido => !pedido.pedido_teste)

    const valorTotal = lista.reduce(
      (soma, pedido) => soma + Number(pedido.total || 0),
      0
    )

    return res.json({
      resumo: {
        quantidadePedidos: lista.length,
        valorTotal,
        pedidosAguardando: lista.filter(
          pedido => pedido.status === 'aguardando_pagamento'
        ).length,
        pedidosConcluidos: lista.filter(
          pedido => pedido.status === 'concluido'
        ).length
      },
      pedidosRecentes: lista.slice(0, 10)
    })
  } catch (error) {
    console.error('Erro no dashboard:', error)
    return res.status(500).json({
      erro: 'Erro ao carregar o dashboard.'
    })
  }
})
app.get('/api/admin/pedidos-teste', requireAdmin, async (_req, res) => {
  try {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select(`
        id,
        numero_pedido,
        nome,
        whatsapp,
        total,
        status,
        pedido_teste,
        criado_em
      `)
      .eq('pedido_teste', true)
      .order('criado_em', { ascending: false })

    if (error) {
      console.error('Erro ao buscar pedidos de teste:', error)
      return res.status(500).json({
        erro: 'Não foi possível carregar os pedidos de teste.'
      })
    }

    return res.json({ pedidos: pedidos || [] })
  } catch (error) {
    console.error('Erro nos pedidos de teste:', error)
    return res.status(500).json({
      erro: 'Erro ao carregar pedidos de teste.'
    })
  }
})
app.patch('/api/admin/pedidos/:id/status', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const { status } = req.body

    const statusPermitidos = [
      'aguardando_pagamento',
      'falha_pagamento',
      'pagamento_recusado',
      'cancelado',
      'reembolsado',
      'confirmado',
      'preparando',
      'enviado',
      'concluido'
    ]

    if (!statusPermitidos.includes(status)) {
      return res.status(400).json({
        erro: 'Status inválido.'
      })
    }

    const { data, error } = await supabase.rpc('alterar_etapa_pedido', { p_pedido_id: id, p_status: status })

    if (error || !data) {
      console.error('Erro ao atualizar pedido:', error)

      return res.status(409).json({
        erro: 'Transição não permitida. Confira a etapa atual e trate pagamentos pelo Mercado Pago.'
      })
    }

    return res.json({
      mensagem: 'Status atualizado com sucesso!',
      pedido: data
    })
  } catch (error) {
    console.error('Erro ao atualizar status:', error)

    return res.status(500).json({
      erro: 'Erro inesperado ao atualizar o pedido.'
    })
  }
})
app.get('/api/admin/pedidos/:id', requireAdmin, async (req, res) => {
  try {
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        itens_pedido (*)
      `)
      .eq('id', req.params.id)
      .single()

    if (error) {
      return res.status(404).json({
        erro: 'Pedido não encontrado.',
      })
    }

    return res.json({ pedido })
  } catch (error) {
    console.error('Erro ao buscar detalhes do pedido:', error)

    return res.status(500).json({
      erro: 'Não foi possível carregar os detalhes do pedido.',
    })
  }
})
app.post('/api/admin/produtos/importar', requireAdmin, async (_req, res) => {
  try {
    const lista = products.map((produto) => ({
      id: produto.id,
      nome: produto.name,
      categoria: produto.category,
      preco: produto.price,
      descricao: produto.description,
      emoji: produto.emoji,
      estoque: produto.stock,
      ativo: true,
    }))

    const { error } = await supabase
      .from('produtos')
      .upsert(lista, {
        onConflict: 'id',
        ignoreDuplicates: true,
      })

    if (error) throw error

    return res.json({
      mensagem: 'Catálogo importado com sucesso!',
      quantidade: lista.length,
    })
  } catch (error) {
    console.error('Erro ao importar produtos:', error)

    return res.status(500).json({
      erro: 'Não foi possível importar os produtos.',
    })
  }
})
app.get('/api/admin/produtos', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('produtos')
     .select('*,produto_variacoes!produto_variacoes_produto_id_fkey(*)')
      .order('id', { ascending: true })

        if (error) throw error

    return res.json({ produtos: data })
  } catch (error) {
    console.error('Erro ao listar produtos:', error)

    return res.status(500).json({
      erro: 'Não foi possível carregar os produtos.',
    })
  }
})

app.post('/api/admin/produtos', requireAdmin, async (req, res) => {
  try {
    const { nome, categoria, preco, descricao, emoji, estoque, ativo } = req.body
    const precificacao = precificacaoValida(req.body)
    const nomeProduto = typeof nome === 'string' ? nome.trim() : ''
    const nomeCategoria = typeof categoria === 'string' ? categoria.trim() : ''
    if (!nomeProduto || !nomeCategoria || nomeProduto.length > 160 || !Number.isFinite(Number(preco)) || Number(preco) < 0 || !Number.isInteger(Number(estoque)) || Number(estoque) < 0 || typeof ativo !== 'boolean' || !precificacao) {
      return res.status(400).json({ erro: 'Confira os dados do produto.' })
    }
    const { data: categoriaEncontrada, error: erroCategoria } = await supabase.from('categorias').select('id').eq('nome', nomeCategoria).maybeSingle()
    if (erroCategoria || !categoriaEncontrada) return res.status(400).json({ erro: 'Selecione uma categoria cadastrada.' })
    const { data, error } = await supabase.from('produtos').insert({
      nome: nomeProduto, categoria: nomeCategoria, preco: Number(preco), descricao: descricao || '',
      emoji: emoji || '🛍️', estoque: Number(estoque), ativo, imagem: null,
      ...precificacao,
      criado_em: new Date().toISOString(), atualizado_em: new Date().toISOString(),
    }).select().single()
    if (error) throw error
    return res.status(201).json({ produto: data })
  } catch (error) {
    console.error('Erro ao cadastrar produto:', error)
    return res.status(500).json({ erro: 'Não foi possível cadastrar o produto.' })
  }
})

app.delete('/api/admin/produtos/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: 'Produto inválido.' })
    const { count, error: erroItens } = await supabase.from('itens_pedido').select('id', { count: 'exact', head: true }).eq('produto_id', id)
    if (erroItens) throw erroItens
    if ((count || 0) > 0) return res.status(409).json({ erro: 'Este produto tem histórico de pedidos. Desative-o em vez de excluí-lo.' })
    const { data: produto, error: erroBusca } = await supabase.from('produtos').select('imagem').eq('id', id).maybeSingle()
    if (erroBusca) throw erroBusca
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' })
    const { error } = await supabase.from('produtos').delete().eq('id', id)
    if (error) throw error
    const path = produto.imagem ? caminhoFotoDoBucket(produto.imagem) : null
    if (path) {
      const { error: erroFoto } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
      if (erroFoto) console.error('Não foi possível remover a foto do produto excluído:', erroFoto.message)
    }
    return res.json({ mensagem: 'Produto excluído.' })
  } catch (error) {
    console.error('Erro ao excluir produto:', error)
    return res.status(500).json({ erro: 'Não foi possível excluir o produto.' })
  }
})

function caminhoFotoDoBucket(url: string) {
  const marker = `/storage/v1/object/public/${PHOTO_BUCKET}/`
  const index = url.indexOf(marker)
  if (index < 0) return null
  try { return decodeURIComponent(url.slice(index + marker.length).split('?')[0]) } catch { return null }
}

app.get('/api/admin/categorias', requireAdmin, async (_req, res) => {
  const { data, error } = await supabase.from('categorias').select('id,nome').order('nome')
  if (error) return res.status(500).json({ erro: 'Não foi possível carregar categorias.' })
  return res.json({ categorias: data || [] })
})

app.post('/api/admin/categorias', requireAdmin, async (req, res) => {
  const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : ''
  if (!nome || nome.length > 80) return res.status(400).json({ erro: 'Informe um nome de até 80 caracteres.' })
  const { data, error } = await supabase.from('categorias').insert({ nome }).select('id,nome').single()
  if (error) return res.status(409).json({ erro: 'Não foi possível criar a categoria; verifique se o nome já existe.' })
  return res.status(201).json({ categoria: data })
})

app.patch('/api/admin/categorias/:id', requireAdmin, async (req, res) => {
  const nome = typeof req.body?.nome === 'string' ? req.body.nome.trim() : ''
  if (!nome || nome.length > 80) return res.status(400).json({ erro: 'Informe um nome de até 80 caracteres.' })
  const { data, error } = await supabase.rpc('renomear_categoria', { categoria_id: req.params.id, novo_nome: nome })
  if (error) return res.status(409).json({ erro: 'Não foi possível renomear a categoria.' })
  return res.json({ categoria: data })
})

app.delete('/api/admin/categorias/:id', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.rpc('excluir_categoria', { categoria_id: req.params.id })
  if (error || data === false) return res.status(409).json({ erro: 'A categoria pode estar em uso por produtos e não foi excluída.' })
  return res.json({ mensagem: 'Categoria excluída.' })
})

app.put('/api/admin/produtos/:id/foto', requireAdmin, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), async (req, res) => {
  const id = Number(req.params.id)
  const mime = req.headers['content-type']
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : ''
  if (!Number.isSafeInteger(id) || id < 1 || !ext || !Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ erro: 'Envie uma imagem JPG, PNG ou WebP de até 5 MB.' })
  const { data: produto, error: erroBusca } = await supabase.from('produtos').select('imagem').eq('id', id).maybeSingle()
  if (erroBusca) return res.status(500).json({ erro: 'Não foi possível localizar o produto.' })
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' })
  const path = `${id}/${randomUUID()}.${ext}`
  const { error: uploadError } = await supabase.storage.from(PHOTO_BUCKET).upload(path, req.body, { contentType: mime, upsert: false })
  if (uploadError) return res.status(500).json({ erro: 'Não foi possível enviar a foto.' })
  const { data: urlData } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path)
  const { data: produtoAtualizado, error: updateError } = await supabase.from('produtos').update({ imagem: urlData.publicUrl }).eq('id', id).select('id').maybeSingle()
  if (updateError || !produtoAtualizado) {
    await supabase.storage.from(PHOTO_BUCKET).remove([path])
    if (updateError) console.error('Erro ao vincular foto:', updateError.code, updateError.message)
    return res.status(500).json({ erro: 'Não foi possível vincular a foto ao produto.' })
  }
  const fotoAnterior = produto.imagem ? caminhoFotoDoBucket(produto.imagem) : null
  if (fotoAnterior) {
    const { error: erroFotoAnterior } = await supabase.storage.from(PHOTO_BUCKET).remove([fotoAnterior])
    if (erroFotoAnterior) console.error('Foto atualizada, mas a foto anterior não foi removida:', erroFotoAnterior.message)
  }
  return res.json({ imagem: urlData.publicUrl })
})

app.delete('/api/admin/produtos/:id/foto', requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ erro: 'Produto inválido.' })
  const { data: produto, error: erroBusca } = await supabase.from('produtos').select('imagem').eq('id', id).maybeSingle()
  if (erroBusca) return res.status(500).json({ erro: 'Não foi possível localizar a foto.' })
  if (!produto) return res.status(404).json({ erro: 'Produto não encontrado.' })
  const { error } = await supabase.from('produtos').update({ imagem: null }).eq('id', id)
  if (error) return res.status(500).json({ erro: 'Não foi possível desvincular a foto do produto.' })
  const path = produto.imagem ? caminhoFotoDoBucket(produto.imagem) : null
  if (path) {
    const { error: erroFoto } = await supabase.storage.from(PHOTO_BUCKET).remove([path])
    if (erroFoto) console.error('Foto desvinculada, mas não foi removida do Storage:', erroFoto.message)
  }
  return res.json({ mensagem: 'Foto removida.', imagem: null })
})

app.patch('/api/admin/produtos/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id)
    const { nome, categoria, preco, descricao, emoji, estoque, ativo } = req.body
    const precificacao = precificacaoValida(req.body)

    if (
      !Number.isInteger(id) ||
      !nome?.trim() ||
      !categoria?.trim() ||
      !Number.isFinite(Number(preco)) ||
      Number(preco) < 0 ||
      !Number.isInteger(Number(estoque)) ||
      Number(estoque) < 0 ||
      typeof ativo !== 'boolean' ||
      !precificacao
    ) {
      return res.status(400).json({
        erro: 'Confira os dados do produto.',
      })
    }

    const { data: atual, error: erroBusca } = await supabase.from('produtos').select('controla_variacoes').eq('id', id).single()
    if (erroBusca || !atual) return res.status(404).json({ erro: 'Produto não encontrado.' })

    const { data, error } = await supabase
      .from('produtos')
      .update({
        nome: nome.trim(),
        categoria: categoria.trim(),
        preco: Number(preco),
        descricao: descricao || '',
        emoji: emoji || '🛍️',
        ...(atual.controla_variacoes ? {} : { estoque: Number(estoque) }),
        ativo,
        ...precificacao,
        atualizado_em: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return res.json({
      mensagem: 'Produto atualizado com sucesso!',
      produto: data,
    })
    } catch (error) {
    console.error('Erro ao atualizar produto:', error)

    return res.status(500).json({
      erro: 'Não foi possível atualizar o produto.',
    })
  }
})

app.post('/api/admin/produtos/:id/converter-variacoes', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.rpc('converter_produto_para_variacoes', { p_produto_id: Number(req.params.id) })
  if (error) return res.status(409).json({ erro: error.message })
  return res.json(data)
})

app.post('/api/admin/produtos/:id/variacoes', requireAdmin, async (req, res) => {
  const body = req.body
  const preco = body.preco === '' || body.preco == null ? null : Number(body.preco)
  const promocional = body.preco_promocional === '' || body.preco_promocional == null ? null : Number(body.preco_promocional)
  if (!['cor','tamanho','fragrancia','acabamento','kit','outro'].includes(body.tipo) ||
    typeof body.nome !== 'string' || !body.nome.trim() || body.nome.trim().length>120 ||
    !Number.isSafeInteger(body.estoque) || body.estoque<0 || typeof body.ativo !== 'boolean' ||
    (preco !== null && (!Number.isFinite(preco) || preco<0)) ||
    (promocional !== null && (!Number.isFinite(promocional) || promocional<0 || preco===null || promocional>preco)) ||
    (body.imagem && (typeof body.imagem !== 'string' || !body.imagem.startsWith('https://')))) {
    return res.status(400).json({ erro: 'Confira tipo, nome, estoque, preço e promoção da variação.' })
  }
  const { data, error } = await supabase.rpc('salvar_variacao', {
    p_produto_id: Number(req.params.id), p_id: body.id || null,
    p_dados: { tipo: body.tipo, nome: body.nome.trim(), sku: body.sku || null, estoque: body.estoque,
      preco, preco_promocional: promocional, ativo: body.ativo, imagem: body.imagem || null },
  })
  if (error) return res.status(409).json({ erro: error.message })
  return res.json({ variacao: data })
})

// O mesmo servidor atende o build e a API em produção.
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist')))
  app.get(['/','/admin','/produto/:id'], (_req,res) => res.sendFile(path.resolve('dist/index.html')))
}

if (process.env.NODE_ENV !== 'test') app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})

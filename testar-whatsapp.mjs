// Executar na pasta principal do Codespaces. Um único envio ao destinatário autorizado.
import { homologacao, destinatarioPermitido, notificacoesHabilitadas } from './server/homologation.ts'

const destino = '5588988555358'
if (!homologacao() || !notificacoesHabilitadas() || !destinatarioPermitido('whatsapp', destino)) {
  throw new Error('Envio bloqueado: exige homologação, envios habilitados e seu número na lista autorizada.')
}
const token = process.env.WHATSAPP_ACCESS_TOKEN
const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID
const template = process.env.WHATSAPP_ORDER_CUSTOMER_TEMPLATE
const versao = process.env.WHATSAPP_API_VERSION || 'v25.0'
const idioma = process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'pt_BR'
if (!token || !phoneId || !template) throw new Error('Configuração incompleta do WhatsApp.')
if (!/^\d+$/.test(phoneId) || !/^v\d+\.\d+$/.test(versao)) throw new Error('ID do número ou versão da API em formato inválido.')

const resposta = await fetch(`https://graph.facebook.com/${versao}/${phoneId}/messages`, {
  method: 'POST',
  signal: AbortSignal.timeout(15000),
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messaging_product: 'whatsapp', to: destino, type: 'template',
    template: {
      name: template, language: { code: idioma },
      components: [{ type: 'body', parameters: ['João', '6', 'R$ 10,00'].map(text => ({ type:'text', text })) }],
    },
  }),
})
const resultado = await resposta.json().catch(() => ({}))
console.log('HTTP:', resposta.status)
if (resultado.error) {
  const mensagem = String(resultado.error.message || '').split(token).join('[OCULTO]')
  const detalhe = String(resultado.error.error_data?.details || '').split(token).join('[OCULTO]')
  console.log(JSON.stringify({codigo:resultado.error.code,subcodigo:resultado.error.error_subcode,mensagem,detalhe},null,2))
} else if (resposta.ok && resultado.messages?.[0]?.id) {
  console.log('Meta aceitou a solicitação. ID da mensagem:', resultado.messages[0].id)
  console.log('Isso ainda não confirma entrega. Confira o WhatsApp no aparelho e informe se recebeu.')
} else {
  console.log('Resposta inesperada, sem confirmação de aceite. Não repita o envio ainda.')
}

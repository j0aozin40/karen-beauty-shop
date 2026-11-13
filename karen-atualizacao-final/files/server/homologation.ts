type Env = Record<string, string | undefined>

export function homologacao(env: Env = process.env) {
  const modo = env.APP_ENV || 'homologation'
  if (!['homologation', 'production'].includes(modo)) throw new Error('APP_ENV inválido.')
  return modo === 'homologation'
}

export function tokenPagamento(env: Env = process.env) {
  const token = homologacao(env) ? env.MERCADO_PAGO_TEST_ACCESS_TOKEN : env.MERCADO_PAGO_ACCESS_TOKEN
  if (!token) throw new Error('Configure a credencial do ambiente de pagamento nos secrets do servidor.')
  return token
}

export function validarBancoHomologacao(env: Env = process.env) {
  if (homologacao(env) && (!env.HOMOLOGATION_SUPABASE_URL || env.HOMOLOGATION_SUPABASE_URL !== env.VITE_SUPABASE_URL)) {
    throw new Error('Confirme o projeto Supabase isolado em HOMOLOGATION_SUPABASE_URL.')
  }
}

// Não inferir ambiente pelo prefixo APP_USR: também existe nas credenciais de teste.
export async function validarVendedorTeste(env: Env = process.env) {
  const token = tokenPagamento(env)
  if (!homologacao(env)) return
  const response = await fetch('https://api.mercadopago.com/users/me', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error('Não foi possível validar a conta de teste do Mercado Pago.')
  const user = await response.json() as { id?: number; tags?: string[]; site_id?: string }
  if (!env.MERCADO_PAGO_TEST_SELLER_ID || String(user.id) !== env.MERCADO_PAGO_TEST_SELLER_ID ||
      user.site_id !== 'MLB' || !user.tags?.includes('test_user')) {
    throw new Error('Pagamento bloqueado: a credencial não identifica o vendedor de teste brasileiro autorizado.')
  }
}

export function destinatarioPermitido(canal: 'email' | 'whatsapp', destino: string, env: Env = process.env) {
  if (!homologacao(env)) return true
  const normalize = (v: string) => canal === 'email' ? v.trim().toLowerCase() : v.replace(/\D/g, '')
  const lista = canal === 'email' ? env.TEST_EMAIL_RECIPIENTS : env.TEST_WHATSAPP_RECIPIENTS
  return Boolean(destino && lista?.split(',').some(v => normalize(v) === normalize(destino)))
}

export function notificacoesHabilitadas(env: Env = process.env) {
  return homologacao(env)
    ? env.HOMOLOGATION_SEND_NOTIFICATIONS === 'true'
    : env.PRODUCTION_SEND_NOTIFICATIONS === 'true'
}

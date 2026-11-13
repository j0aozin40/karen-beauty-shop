import { createHmac, timingSafeEqual } from 'node:crypto'

export function assinaturaValida(secret: string | undefined, signature: string | undefined, requestId: string | undefined, dataId: unknown) {
  if (!secret || !signature || !requestId || typeof dataId !== 'string' || !dataId) return false
  const partes = Object.fromEntries(signature.split(',').map(p => p.trim().split('=', 2)))
  if (!/^\d+$/.test(partes.ts || '') || !/^[a-f0-9]{64}$/i.test(partes.v1 || '')) return false
  // Eventos Orders observados assinam o ID original. Aceita também a
  // normalização histórica, sempre exigindo HMAC válido com o mesmo segredo.
  const recebida = Buffer.from(partes.v1, 'hex')
  for (const id of new Set([dataId, dataId.toLowerCase()])) {
    const manifesto = `id:${id};request-id:${requestId};ts:${partes.ts};`
    const esperado = createHmac('sha256', secret).update(manifesto).digest()
    if (timingSafeEqual(esperado, recebida)) return true
  }
  return false
}

export function checkoutSeguro(valor: unknown): valor is string {
  if (typeof valor !== 'string') return false
  try {
    const url = new URL(valor)
    return url.protocol === 'https:' && !url.username && !url.password &&
      (url.hostname === 'mercadopago.com.br' || url.hostname.endsWith('.mercadopago.com.br'))
  } catch { return false }
}

export function duracaoCheckout(expiraEm: string, agora = Date.now()) {
  // Margem para criação no provedor: nunca estende o prazo local da reserva.
  const segundos = Math.floor((Date.parse(expiraEm) - agora) / 1000) - 20
  if (!Number.isFinite(segundos) || segundos < 30) throw new Error('Reserva próxima de expirar. Refaça o pedido.')
  return `PT${segundos}S`
}

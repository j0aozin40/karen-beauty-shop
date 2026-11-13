import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { assinaturaValida, checkoutSeguro, duracaoCheckout } from '../server/payment.ts'

test('assinatura normaliza ID e rejeita payload adulterado', () => {
  const hash=createHmac('sha256','local-secret').update('id:ordabc;request-id:req1;ts:123;').digest('hex')
  assert.equal(assinaturaValida('local-secret',`ts=123,v1=${hash}`,'req1','ORDABC'),true)
  assert.equal(assinaturaValida('local-secret',`ts=123,v1=${hash}`,'req1','OUTRO'),false)
  assert.equal(assinaturaValida('local-secret','ts=123,v1=zz','req1','ORDABC'),false)
  assert.equal(assinaturaValida(undefined,undefined,undefined,undefined),false)
})

test('Orders aceita ID original assinado sem enfraquecer validação', () => {
  const id='ORDTST01M76ZC4EAE7VCZ9E8H712REDC'
  const hash=createHmac('sha256','local-secret').update(`id:${id};request-id:req1;ts:123;`).digest('hex')
  const signature=`ts=123,v1=${hash}`
  assert.equal(assinaturaValida('local-secret',signature,'req1',id),true)
  assert.equal(assinaturaValida('outro-secret',signature,'req1',id),false)
  assert.equal(assinaturaValida('local-secret',signature,'req2',id),false)
  assert.equal(assinaturaValida('local-secret',signature,'req1',id+'X'),false)
  assert.equal(assinaturaValida('local-secret',signature.replace('ts=123','ts=124'),'req1',id),false)
  assert.equal(assinaturaValida('local-secret',undefined,'req1',id),false)
})
test('redirecionamento aceita somente HTTPS do Mercado Pago Brasil', () => {
  assert.equal(checkoutSeguro('https://www.mercadopago.com.br/checkout/v1/redirect?order_id=1'),true)
  for (const url of ['http://mercadopago.com.br','https://mercadopago.com.br.evil.test','https://evil.test','javascript:alert(1)','https://user:pass@mercadopago.com.br']) assert.equal(checkoutSeguro(url),false)
})
test('checkout não ultrapassa validade local e rejeita reserva vencida', () => {
  assert.equal(duracaoCheckout(new Date(1800000).toISOString(),0),'PT1780S')
  assert.throws(()=>duracaoCheckout(new Date(1000).toISOString(),2000))
})

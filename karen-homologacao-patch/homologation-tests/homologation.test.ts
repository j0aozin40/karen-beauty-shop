import { test } from 'node:test'
import assert from 'node:assert/strict'
import { homologacao, tokenPagamento, validarBancoHomologacao, validarVendedorTeste, destinatarioPermitido, notificacoesHabilitadas } from '../server/homologation.ts'

test('homologação padrão não usa credencial de produção e exige banco declarado',()=>{
  assert.equal(homologacao({}),true)
  assert.throws(()=>homologacao({APP_ENV:'typo'}))
  assert.throws(()=>tokenPagamento({MERCADO_PAGO_ACCESS_TOKEN:'production'}))
  assert.equal(tokenPagamento({MERCADO_PAGO_TEST_ACCESS_TOKEN:'sandbox'}),'sandbox')
  assert.throws(()=>validarBancoHomologacao({VITE_SUPABASE_URL:'https://prod.invalid'}))
  assert.throws(()=>validarBancoHomologacao({VITE_SUPABASE_URL:'a',HOMOLOGATION_SUPABASE_URL:'b'}))
})

test('notificações exigem habilitação explícita e destinatário exato',()=>{
  assert.equal(notificacoesHabilitadas({}),false)
  const env={TEST_EMAIL_RECIPIENTS:'authorized@example.test',TEST_WHATSAPP_RECIPIENTS:'+55 11 99999-9999',HOMOLOGATION_SEND_NOTIFICATIONS:'true'}
  assert.equal(notificacoesHabilitadas(env),true)
  assert.equal(destinatarioPermitido('email','AUTHORIZED@example.test',env),true)
  for(const email of ['client@example.test','authorized@example.test,client@example.test','Name <authorized@example.test>']) assert.equal(destinatarioPermitido('email',email,env),false)
  assert.equal(destinatarioPermitido('whatsapp','5511999999999',env),true)
  assert.equal(destinatarioPermitido('whatsapp','5511888888888',env),false)
  assert.equal(destinatarioPermitido('email','authorized@example.test',{}),false)
})

test('vendedor exige identidade, país e tag de teste; prefixo APP_USR não decide',async()=>{
  const original=globalThis.fetch
  const env={MERCADO_PAGO_TEST_ACCESS_TOKEN:'APP_USR-test',MERCADO_PAGO_TEST_SELLER_ID:'12'}
  try {
    for(const user of [{id:13,site_id:'MLB',tags:['test_user']},{id:12,site_id:'MLA',tags:['test_user']},{id:12,site_id:'MLB',tags:[]}]) {
      globalThis.fetch=async()=>Response.json(user)
      await assert.rejects(validarVendedorTeste(env))
    }
    globalThis.fetch=async()=>Response.json({id:12,site_id:'MLB',tags:['test_user']})
    await validarVendedorTeste(env)
    globalThis.fetch=async()=>new Response('',{status:401})
    await assert.rejects(validarVendedorTeste(env))
  } finally {globalThis.fetch=original}
})

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import nodemailer from 'nodemailer'

// Toda comunicação externa é interceptada. Nenhum .env é lido.
process.env.NODE_ENV='test'
process.env.APP_ENV='homologation'
process.env.HOMOLOGATION_SUPABASE_URL='https://supabase.invalid'
process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN='dedicated-test-only'
process.env.MERCADO_PAGO_TEST_SELLER_ID='123'
process.env.ADMIN_SESSION_SECRET='test-session-secret-32-characters-long'
process.env.ADMIN_PASSWORD='local-test-only'
process.env.VITE_SUPABASE_URL='https://supabase.invalid'
process.env.SUPABASE_SECRET_KEY='test-only'
process.env.MERCADO_PAGO_ACCESS_TOKEN='test-only'
process.env.MERCADO_PAGO_WEBHOOK_SECRET='test-secret'
process.env.PUBLIC_APP_URL='https://shop.invalid'
process.env.IMAGE_SEARCH_SHARED_SECRET='local-image-search-test-secret-with-32-characters'

const originalFetch=globalThis.fetch
const calls: Array<{ url: string; body: any }> = []
const id='22222222-2222-4222-8222-222222222222'
let falhaReserva=false
let valorPago='20.00'
let statusOrder='processed'
let vendedorTeste=true
let confirmarAgora=false
const emails: any[]=[]
const originalTransport=nodemailer.createTransport
nodemailer.createTransport=(()=>({sendMail:async(message: any)=>{emails.push(message);return {messageId:'local-only'} }})) as any
let catalogoSimulado: any[] = []
globalThis.fetch=async (input, init) => {
  const url=String(input instanceof Request ? input.url : input)
  if (url.startsWith('http://127.0.0.1:')) return originalFetch(input,init)
  const body=init?.body ? JSON.parse(String(init.body)) : undefined
  calls.push({url,body})
  const json=(v: unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}})
  if(url==='https://api.mercadopago.com/users/me') {
    assert.equal(new Headers(init?.headers).get('authorization'),'Bearer dedicated-test-only')
    return json({id:123,site_id:'MLB',tags:vendedorTeste?['test_user']:[]})
  }
  if(url.startsWith('https://graph.facebook.com/')) return json({messages:[{id:'local-only'}]})
  if(url.endsWith('/functions/v1/search-product-images')) {
    assert.equal(new Headers(init?.headers).get('x-image-search-secret'),process.env.IMAGE_SEARCH_SHARED_SECRET)
    return json({imagem:'https://images.example.com/p.png',metadata:{width:800,height:800,license:'contract'}})
  }
  if(url.endsWith('/rpc/criar_pedido_reservado')) return falhaReserva ? json({message:'saldo insuficiente'},400) : json({id,numero_pedido:12,total:20,expira_em:new Date(Date.now()+1800000).toISOString(),itens:[{nome_produto:'Produto local',nome_variacao:'Rosa',quantidade:2,preco_unitario:10}]})
  if(url==='https://api.mercadopago.com/v1/orders') {
    assert.equal(new Headers(init?.headers).get('X-Idempotency-Key'),id)
    assert.equal(body.total_amount,'20.00'); assert.match(body.expiration_time,/^PT\d+S$/)
    assert.equal(body.items[0].title,'Produto local — Rosa')
    return json({id:'ORDABC',checkout_url:'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDABC'})
  }
  if(url==='https://api.mercadopago.com/v1/orders/ORDABC') return json({id:'ORDABC',status:statusOrder,currency:'BRL',external_reference:id,total_amount:'20.00',total_paid_amount:valorPago})
  if(url.includes('/rest/v1/pedidos?') && init?.method==='PATCH') return json(null)
  if(url.includes('/rest/v1/pedidos?')) return json({id,numero_pedido:12,nome:'Cliente local',email:'authorized@example.test',whatsapp:'11999999999',aceita_whatsapp:true,tipo_entrega:'pickup',total:20,mercado_pago_order_id:'ORDABC',itens_pedido:[]})
  if(url.endsWith('/rpc/processar_pagamento_reservado')) return json({confirmado_agora:confirmarAgora})
  if(url.includes('/rest/v1/produtos?')) {
    if(init?.method==='PATCH' && body?.imagem) return json({id:1,imagem:body.imagem})
    if(init?.method==='PATCH') return json(new URL(url).searchParams.has('estoque') ? [] : [{id:1,estoque:3}])
    const select=new URL(url).searchParams.get('select') || ''
    if(select.includes('produto_variacoes')) {
      if(select!=='*,produto_variacoes!produto_variacoes_produto_id_fkey(*)') return json({code:'PGRST201',message:'Ambiguous relationship'},300)
      return json([{id:1,nome:'Produto local',variacao_principal_id:id,produto_variacoes:[{id,produto_id:1,nome:'Rosa'},{id:'33333333-3333-4333-8333-333333333333',produto_id:1,nome:'Preto'}]}])
    }
    return json({controla_variacoes:false})
  }
  if(url.includes('/rest/v1/produto_variacoes?')) return json(catalogoSimulado.flatMap(g=>g.variacoes||[]).map(v=>({id:v.id,preco:v.preco??v.price,preco_promocional:v.preco_promocional??null})))
  if(url.endsWith('/rpc/salvar_variacao_principal')) return json({sucesso:true,variacao_principal_id:id})
  if(url.endsWith('/rpc/excluir_variacao_segura')) return json({sucesso:true})
  if(url.endsWith('/rpc/salvar_grupo_variacoes')) return json({id:1,sucesso:true,estoque:8})
  if(url.endsWith('/rpc/catalogo_disponivel')) return json(catalogoSimulado)
  throw new Error(`Acesso externo não simulado bloqueado: ${new URL(url).hostname}`)
}
const {app}=await import('../server/index.ts')
const server=app.listen(0,'127.0.0.1')
await new Promise<void>(r=>server.on('listening',r))
const port=(server.address() as {port:number}).port
const base=`http://127.0.0.1:${port}`
after(async()=>{globalThis.fetch=originalFetch; nodemailer.createTransport=originalTransport; await new Promise<void>(r=>server.close(()=>r()))})
const dados={nome:'Cliente local',email:'local@example.test',whatsapp:'11999999999',tipo_entrega:'pickup',itens:[{produto_id:1,variacao_id:id,quantidade:2}]}

test('API: reserva antes do provedor e ignora preços e flags enviados pelo cliente',async()=>{
  const r=await fetch(base+'/api/pedidos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...dados,total:0,pedido_teste:true,usa_reservas_estoque:false})})
  assert.equal(r.status,201)
  const result=await r.json()
  assert.equal(result.pedido.total,20)
  const reserva=calls.find(c=>c.url.endsWith('/rpc/criar_pedido_reservado'))!
  assert.equal(reserva.body.p_dados.pedido_teste,undefined)
  assert.equal(reserva.body.p_dados.total,undefined)
  assert.equal(reserva.body.p_itens[0].variacao_id,id)
  assert.ok(calls.indexOf(reserva)<calls.findIndex(c=>c.url==='https://api.mercadopago.com/v1/orders'))
})

test('API: estoque insuficiente não cria checkout externo',async()=>{
  falhaReserva=true; const antes=calls.filter(c=>c.url==='https://api.mercadopago.com/v1/orders').length
  const r=await fetch(base+'/api/pedidos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)})
  falhaReserva=false
  assert.equal(r.status,409)
  assert.equal(calls.filter(c=>c.url==='https://api.mercadopago.com/v1/orders').length,antes)
})

test('API: webhook sem assinatura é rejeitado sem consultar o provedor',async()=>{
  const antes=calls.length
  const r=await fetch(base+'/api/pagamentos/mercado-pago/webhook?type=order&data.id=ORDABC',{method:'POST'})
  assert.equal(r.status,401); assert.equal(calls.length,antes)
})
function headers() {
  const hash=createHmac('sha256','test-secret').update('id:ordabc;request-id:local-req;ts:123;').digest('hex')
  return {'x-signature':`ts=123,v1=${hash}`,'x-request-id':'local-req'}
}

test('API: webhook consulta order e encaminha confirmação para RPC atômica',async()=>{
  const r=await fetch(base+'/api/pagamentos/mercado-pago/webhook?type=order&data.id=ORDABC',{method:'POST',headers:headers()})
  assert.equal(r.status,200)
  assert.equal(calls.at(-1)?.body.p_status,'processed')
})

test('API: pagamento parcial não confirma pedido',async()=>{
  valorPago='10.00'
  const antes=calls.filter(c=>c.url.endsWith('/rpc/processar_pagamento_reservado')).length
  const r=await fetch(base+'/api/pagamentos/mercado-pago/webhook?type=order&data.id=ORDABC',{method:'POST',headers:headers()})
  assert.equal(r.status,400)
  assert.equal(calls.filter(c=>c.url.endsWith('/rpc/processar_pagamento_reservado')).length,antes)
  valorPago='20.00'
})


test('API: vendedor real bloqueia reserva, cobrança e processamento de webhook',async()=>{
  vendedorTeste=false
  try {
    const antes=calls.filter(c=>c.url.endsWith('/rpc/criar_pedido_reservado')||c.url.endsWith('/v1/orders')).length
    assert.equal((await fetch(base+'/api/pedidos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)})).status,503)
    assert.equal(calls.filter(c=>c.url.endsWith('/rpc/criar_pedido_reservado')||c.url.endsWith('/v1/orders')).length,antes)
  } finally { vendedorTeste=true }
})


test('API: webhook encaminha recusa e pendência sem transformar em aprovação',async()=>{
  try {
    for(const status of ['failed','processing','created','canceled']) {
      statusOrder=status
      assert.equal((await fetch(base+'/api/pagamentos/mercado-pago/webhook?type=order&data.id=ORDABC',{method:'POST',headers:headers()})).status,200)
      assert.equal(calls.at(-1)?.body.p_status,status)
    }
  } finally { statusOrder='processed' }
})


test('API: confirmação envia somente aos destinatários autorizados; repetição não reenvia',async()=>{
  Object.assign(process.env,{HOMOLOGATION_SEND_NOTIFICATIONS:'true',TEST_EMAIL_RECIPIENTS:'authorized@example.test,store@example.test',TEST_WHATSAPP_RECIPIENTS:'5511999999999,5511888888888',SMTP_HOST:'smtp.invalid',SMTP_USER:'store@example.test',SMTP_PASS:'local-only',ORDER_NOTIFICATION_EMAIL:'store@example.test',WHATSAPP_ACCESS_TOKEN:'local-only',WHATSAPP_PHONE_NUMBER_ID:'123',WHATSAPP_ORDER_RECIPIENT:'5511888888888',WHATSAPP_ORDER_STORE_TEMPLATE:'store',WHATSAPP_ORDER_CUSTOMER_TEMPLATE:'customer'})
  const webhook=()=>fetch(base+'/api/pagamentos/mercado-pago/webhook?type=order&data.id=ORDABC',{method:'POST',headers:headers()})
  try {
    confirmarAgora=true
    assert.equal((await webhook()).status,200)
    await new Promise(r=>setImmediate(r))
    assert.deepEqual(emails.map(m=>m.to),['authorized@example.test','store@example.test'])
    const messages=()=>calls.filter(c=>c.url.startsWith('https://graph.facebook.com/'))
    assert.deepEqual(messages().map(c=>c.body.to),['5511888888888','5511999999999'])
    confirmarAgora=false
    await webhook(); await new Promise(r=>setImmediate(r))
    assert.equal(emails.length,2); assert.equal(messages().length,2)
    confirmarAgora=true
    process.env.TEST_EMAIL_RECIPIENTS='different@example.test'
    process.env.TEST_WHATSAPP_RECIPIENTS='5511777777777'
    await webhook(); await new Promise(r=>setImmediate(r))
    assert.equal(emails.length,2); assert.equal(messages().length,2)
  } finally { confirmarAgora=false;process.env.HOMOLOGATION_SEND_NOTIFICATIONS='false' }
})

test('API: origem externa não pode fazer login nem alterar sessão administrativa',async()=>{
  const login=(origin:string)=>fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({senha:'local-test-only'})})
  assert.equal((await login('https://evil.invalid')).status,403)
  const sucesso=await login('https://shop.invalid')
  assert.equal(sucesso.status,200)
  const cookie=sucesso.headers.get('set-cookie')!.split(';')[0]
  assert.equal((await fetch(base+'/api/admin/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://evil.invalid'}})).status,403)
  assert.equal((await fetch(base+'/api/admin/me',{headers:{Cookie:cookie}})).status,200)
  assert.equal((await fetch(base+'/api/admin/logout',{method:'POST',headers:{Cookie:cookie,Origin:'https://shop.invalid'}})).status,200)
  assert.equal((await fetch(base+'/api/admin/me',{headers:{Cookie:cookie}})).status,401)
})

test('API: excesso de senhas erradas bloqueia temporariamente até senha correta',async()=>{
  const login=(senha:string)=>fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({senha})})
  for(let i=0;i<5;i++) assert.equal((await login('errada')).status,401)
  const bloqueado=await login('local-test-only')
  assert.equal(bloqueado.status,429)
  assert.ok(Number(bloqueado.headers.get('retry-after'))>0)
})

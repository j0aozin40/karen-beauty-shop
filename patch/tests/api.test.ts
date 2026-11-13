import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'

// Toda comunicação externa é interceptada. Nenhum .env é lido.
process.env.NODE_ENV='test'
process.env.ADMIN_SESSION_SECRET='test-session-secret-32-characters-long'
process.env.ADMIN_PASSWORD='local-test-only'
process.env.VITE_SUPABASE_URL='https://supabase.invalid'
process.env.SUPABASE_SECRET_KEY='test-only'
process.env.MERCADO_PAGO_ACCESS_TOKEN='test-only'
process.env.MERCADO_PAGO_WEBHOOK_SECRET='test-secret'
process.env.PUBLIC_APP_URL='https://shop.invalid'

const originalFetch=globalThis.fetch
const calls: Array<{ url: string; body: any }> = []
const id='22222222-2222-4222-8222-222222222222'
let falhaReserva=false
let valorPago='20.00'
globalThis.fetch=async (input, init) => {
  const url=String(input instanceof Request ? input.url : input)
  if (url.startsWith('http://127.0.0.1:')) return originalFetch(input,init)
  const body=init?.body ? JSON.parse(String(init.body)) : undefined
  calls.push({url,body})
  const json=(v: unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}})
  if(url.endsWith('/rpc/criar_pedido_reservado')) return falhaReserva ? json({message:'saldo insuficiente'},400) : json({id,numero_pedido:12,total:20,expira_em:new Date(Date.now()+1800000).toISOString(),itens:[{nome_produto:'Produto local',nome_variacao:'Rosa',quantidade:2,preco_unitario:10}]})
  if(url==='https://api.mercadopago.com/v1/orders') {
    assert.equal(new Headers(init?.headers).get('X-Idempotency-Key'),id)
    assert.equal(body.total_amount,'20.00'); assert.match(body.expiration_time,/^PT\d+S$/)
    assert.equal(body.items[0].title,'Produto local — Rosa')
    return json({id:'ORDABC',checkout_url:'https://www.mercadopago.com.br/checkout/v1/redirect?order_id=ORDABC'})
  }
  if(url==='https://api.mercadopago.com/v1/orders/ORDABC') return json({id:'ORDABC',status:'processed',currency:'BRL',external_reference:id,total_amount:'20.00',total_paid_amount:valorPago})
  if(url.includes('/rest/v1/pedidos?') && init?.method==='PATCH') return json(null)
  if(url.includes('/rest/v1/pedidos?')) return json({id,total:20,mercado_pago_order_id:'ORDABC',itens_pedido:[]})
  if(url.endsWith('/rpc/processar_pagamento_reservado')) return json({confirmado_agora:false})
  if(url.includes('/rest/v1/produtos?')) {
    if(init?.method==='PATCH') return json(new URL(url).searchParams.has('estoque') ? [] : [{id:1,estoque:3}])
    return json({controla_variacoes:false})
  }
  if(url.endsWith('/rpc/excluir_variacao_segura')) return json({sucesso:true})
  if(url.endsWith('/rpc/catalogo_disponivel')) return json([])
  throw new Error(`Acesso externo não simulado bloqueado: ${new URL(url).hostname}`)
}
const {app}=await import('../server/index.ts')
const server=app.listen(0,'127.0.0.1')
await new Promise<void>(r=>server.on('listening',r))
const port=(server.address() as {port:number}).port
const base=`http://127.0.0.1:${port}`
after(async()=>{globalThis.fetch=originalFetch; await new Promise<void>(r=>server.close(()=>r()))})
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
})
test('API: catálogo usa disponibilidade; admin exige login',async()=>{
  assert.equal((await fetch(base+'/api/produtos')).status,200)
  assert.equal((await fetch(base+'/api/admin/produtos')).status,401)
})


test('API: edição comum omite inventário; ajuste com saldo antigo retorna conflito',async()=>{
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({senha:'local-test-only'})})
  assert.equal(login.status,200)
  const cookie=login.headers.get('set-cookie')!.split(';')[0]
  const body={nome:'Produto',categoria:'Teste',preco:10,ativo:true}
  const salvar=(v:object)=>fetch(base+'/api/admin/produtos/1',{method:'PATCH',headers:{'Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(v)})
  assert.equal((await salvar(body)).status,200)
  const patch=calls.findLast(c=>c.url.includes('/rest/v1/produtos?') && c.body)
  assert.equal(patch?.body.estoque,undefined)
  assert.equal((await salvar({...body,estoque:9,estoque_original:10})).status,409)
  const filtro=new URL(calls.findLast(c=>c.url.includes('/rest/v1/produtos?') && c.body)!.url)
  assert.equal(filtro.searchParams.get('estoque'),'eq.10')
  assert.equal(filtro.searchParams.get('controla_variacoes'),'eq.false')
})


test('API: excluir variação exige administrador e envia versão ao banco',async()=>{
  const endpoint=base+'/api/admin/produtos/1/variacoes/'+id
  const body={atualizado_em:'2026-11-11T00:00:00Z'}
  assert.equal((await fetch(endpoint,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).status,401)
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({senha:'local-test-only'})})
  const cookie=login.headers.get('set-cookie')!.split(';')[0]
  const headers={'Content-Type':'application/json',Cookie:cookie}
  assert.equal((await fetch(endpoint,{method:'DELETE',headers,body:JSON.stringify({})})).status,400)
  assert.equal((await fetch(endpoint,{method:'DELETE',headers,body:JSON.stringify(body)})).status,200)
  const chamada=calls.findLast(c=>c.url.endsWith('/rpc/excluir_variacao_segura'))!
  assert.equal(chamada.body.p_produto_id,1)
  assert.equal(chamada.body.p_id,id)
  assert.equal(chamada.body.p_atualizado_em_original,body.atualizado_em)
})

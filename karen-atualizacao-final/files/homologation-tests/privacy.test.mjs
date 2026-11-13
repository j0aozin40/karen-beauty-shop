import { test, after } from 'node:test'
import assert from 'node:assert/strict'

// Sem .env e sem serviços reais. Testa o filtro de identidade aplicado pela API.
Object.assign(process.env, {
  NODE_ENV:'test', APP_ENV:'homologation',
  VITE_SUPABASE_URL:'https://privacy.invalid', HOMOLOGATION_SUPABASE_URL:'https://privacy.invalid',
  SUPABASE_SECRET_KEY:'local-test-only', ADMIN_PASSWORD:'local-only',
  ADMIN_SESSION_SECRET:'local-test-only-session-at-least-32-characters',
})
const a='11111111-1111-4111-8111-111111111111'
const b='22222222-2222-4222-8222-222222222222'
const originalFetch=globalThis.fetch
const queries=[]
let authCalls=0
globalThis.fetch=async(input,init)=>{
  const url=new URL(input instanceof Request?input.url:String(input))
  if(url.hostname==='127.0.0.1')return originalFetch(input,init)
  assert.equal(url.hostname,'privacy.invalid','Rede externa não simulada bloqueada')
  if(url.pathname==='/auth/v1/user'){
    authCalls++
    const header=new Headers(init?.headers).get('authorization')
    const id=header==='Bearer account-a'?a:header==='Bearer account-b'?b:null
    return id?Response.json({id,aud:'authenticated',role:'authenticated'}):Response.json({msg:'Invalid JWT',code:'bad_jwt'},{status:401})
  }
  if(url.pathname==='/rest/v1/pedidos'){
    const filter=url.searchParams.get('cliente_id')
    queries.push(filter)
    assert.ok(filter===`eq.${a}`||filter===`eq.${b}`,'É obrigatório filtrar por cliente autenticado')
    return Response.json([{id:filter===`eq.${a}`?'pedido-a':'pedido-b',status:'aguardando_pagamento'}])
  }
  throw new Error('Rota externa não simulada bloqueada')
}
const {app}=await import('../server/index.ts')
const server=app.listen(0,'127.0.0.1')
await new Promise(resolve=>server.on('listening',resolve))
const base=`http://127.0.0.1:${server.address().port}`
after(async()=>{await new Promise(resolve=>server.close(resolve));globalThis.fetch=originalFetch})

test('sem login não consulta identidade nem pedidos',async()=>{
  const before=authCalls
  const r=await fetch(base+'/api/me/pedidos')
  assert.equal(r.status,401)
  assert.equal(r.headers.get('cache-control'),'no-store')
  assert.equal(authCalls,before)
  assert.equal(queries.length,0)
})
test('token inválido não permite consultar pedidos',async()=>{
  const before=queries.length
  const r=await fetch(base+'/api/me/pedidos',{headers:{Authorization:'Bearer invalid-token'}})
  assert.equal(r.status,401)
  assert.equal(queries.length,before)
})
test('conta A recebe somente consulta filtrada pela identidade A',async()=>{
  const r=await fetch(base+'/api/me/pedidos',{headers:{Authorization:'Bearer account-a'}})
  assert.equal(r.status,200)
  assert.equal(r.headers.get('cache-control'),'no-store')
  assert.deepEqual((await r.json()).pedidos.map(p=>p.id),['pedido-a'])
  assert.equal(queries.at(-1),`eq.${a}`)
})
test('parâmetro de cliente B enviado por A não troca a identidade da consulta',async()=>{
  const r=await fetch(base+`/api/me/pedidos?cliente_id=${b}`,{headers:{Authorization:'Bearer account-a'}})
  assert.equal(r.status,200)
  assert.deepEqual((await r.json()).pedidos.map(p=>p.id),['pedido-a'])
  assert.equal(queries.at(-1),`eq.${a}`)
})
test('conta B não reutiliza o filtro da conta A',async()=>{
  const r=await fetch(base+'/api/me/pedidos',{headers:{Authorization:'Bearer account-b'}})
  assert.equal(r.status,200)
  assert.deepEqual((await r.json()).pedidos.map(p=>p.id),['pedido-b'])
  assert.equal(queries.at(-1),`eq.${b}`)
})
test('token de cliente não abre rotas administrativas',async()=>{
  for(const endpoint of ['/api/admin/produtos','/api/admin/dashboard']){
    const r=await fetch(base+endpoint,{headers:{Authorization:'Bearer account-a'}})
    assert.equal(r.status,401)
  }
})

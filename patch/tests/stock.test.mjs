import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

// Banco em memória. Não lê .env e não abre conexão com Supabase.
const db = new PGlite()
after(() => db.close())
const one = async (sql, args=[]) => (await db.query(sql,args)).rows[0]
const run = (sql,args=[]) => db.query(sql,args)
const dados = { nome:'Cliente local', whatsapp:'11999999999', email:'local@example.test', tipo_entrega:'pickup' }
async function pedido(itens) {
  return (await one('select public.criar_pedido_reservado($1::jsonb,$2::jsonb) as p',[JSON.stringify(dados),JSON.stringify(itens)])).p
}
async function pagar(p,status='processed') {
  await run('update pedidos set mercado_pago_order_id=$2 where id=$1',[p.id,`ORD-${p.id}`])
  return (await one('select public.processar_pagamento_reservado($1,$2,$3,$4) as p',[p.id,`ORD-${p.id}`,status,p.total])).p
}

test('migrations, estoque, variações e pagamento no PostgreSQL isolado', async t => {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create sequence public.produtos_id_seq;`)
  await db.exec(await fs.readFile(new URL('../backup-seguranca/estrutura-public.sql',import.meta.url),'utf8'))
  await db.exec('alter table pedidos add column pedido_teste boolean not null default false;')
  await db.exec(`insert into produtos(id,nome,categoria,preco,estoque) values
    (1,'Geral','Teste',10,10),(2,'Com opções','Teste',20,5),(3,'Rascunho','Teste',15,4),(4,'Sem saldo','Teste',5,0);
    insert into pedidos(id,nome,whatsapp,email,tipo_entrega,total,status)
    values('11111111-1111-4111-8111-111111111111','Legado','1','old@example.test','pickup',10,'confirmado');`)
  await db.exec(`insert into pedidos(id,nome,whatsapp,email,tipo_entrega,total,status,pedido_teste)
    values('33333333-3333-4333-8333-333333333333','Teste antigo','1','test@example.test','pickup',10,'aguardando_pagamento',true);`)
  for (const nome of ['202611100001_product_variations.sql','202611100002_stock_reservations.sql','202611110001_safe_variation_edit.sql','202611110002_delete_variation_safely.sql'])
    await db.exec(await fs.readFile(new URL('../supabase/migrations/'+nome,import.meta.url),'utf8'))

  await t.test('migrações preservam estoque e pedidos legados',async()=>{
    assert.equal((await one('select estoque from produtos where id=1')).estoque,10)
    assert.equal((await one('select status from pedidos where id=$1',['11111111-1111-4111-8111-111111111111'])).status,'confirmado')
    assert.equal((await one('select count(*)::int as n from reservas_estoque')).n,0)
    assert.equal((await one("select pedido_teste from pedidos where id='33333333-3333-4333-8333-333333333333'")).pedido_teste,true)
    assert.equal((await one("select has_function_privilege('anon','public.criar_pedido_reservado(jsonb,jsonb)','execute') as permitido")).permitido,false)
  })
  let variacao
  await t.test('rascunho não exige variação; conversão preserva total',async()=>{
    variacao=(await one(`insert into produto_variacoes(produto_id,tipo,nome,estoque,preco,preco_promocional)
      values(2,'cor','Rosa',5,25,22) returning id`)).id
    await run("insert into produto_variacoes(produto_id,tipo,nome,estoque,ativo) values(3,'cor','Azul',4,false)")
    await assert.rejects(run('select converter_produto_para_variacoes(3)'),/Ative todas/)
    const p=await pedido([{produto_id:3,quantidade:1}])
    assert.equal(p.total,15)
    await assert.rejects(run('select converter_produto_para_variacoes(3)'),/Ative todas|aguardando/)
    await run('select converter_produto_para_variacoes(2)')
    assert.equal((await one('select estoque from produtos where id=2')).estoque,5)
    await assert.rejects(pedido([{produto_id:2,quantidade:1}]),/variação válida/)
  })
  let p
  await t.test('reserva 30 minutos, snapshot de promoção e saldo disponível',async()=>{
    p=await pedido([{produto_id:2,variacao_id:variacao,quantidade:2}])
    assert.equal(p.total,44)
    assert.equal(p.itens[0].nome_variacao,'Rosa')
    const delta=Date.parse(p.expira_em)-Date.now()
    assert.ok(delta>29*60*1000 && delta<=30*60*1000)
    const cat=(await one('select catalogo_disponivel() as c')).c
    assert.equal(cat.find(p=>p.id===2).variacoes[0].stock,3)
    assert.equal((await one('select estoque from produtos where id=2')).estoque,5)
    await assert.rejects(run('update produto_variacoes set estoque=1 where id=$1',[variacao]),/reservas ativas/)
  })
  await t.test('itens duplicados não permitem ultrapassar saldo; falha atômica',async()=>{
    const antes=(await one('select count(*)::int as n from pedidos')).n
    await assert.rejects(pedido([{produto_id:2,variacao_id:variacao,quantidade:2},{produto_id:2,variacao_id:variacao,quantidade:2}]),/Estoque insuficiente/)
    assert.equal((await one('select count(*)::int as n from pedidos')).n,antes)
  })
  await t.test('pagamento consome reserva antes do gatilho de proteção; repetição não baixa duas vezes',async()=>{
    assert.equal((await pagar(p)).confirmado_agora,true)
    assert.equal((await pagar(p)).ja_confirmado,true)
    assert.equal((await one('select estoque from produtos where id=2')).estoque,3)
    assert.equal((await one('select estoque from produto_variacoes where id=$1',[variacao])).estoque,3)
    assert.equal((await one('select status from pedidos where id=$1',[p.id])).status,'confirmado')
    await pagar(p,'failed')
    assert.equal((await one('select status from pedidos where id=$1',[p.id])).status,'confirmado')
  })
  await t.test('reserva expirada vai para revisão sem baixa ou confirmação',async()=>{
    const q=await pedido([{produto_id:1,quantidade:2}])
    await run("update reservas_estoque set expira_em=now()-interval '1 second' where pedido_id=$1",[q.id])
    assert.equal((await pagar(q)).revisao,true)
    assert.equal((await one('select estoque from produtos where id=1')).estoque,10)
    assert.equal((await one('select pagamento_revisao from pedidos where id=$1',[q.id])).pagamento_revisao,true)
  })
  await t.test('recusa e cancelamento liberam sem repor estoque físico',async()=>{
    const q=await pedido([{produto_id:1,quantidade:3}])
    await pagar(q,'canceled'); await pagar(q,'canceled')
    assert.equal((await one('select status from reservas_estoque where pedido_id=$1',[q.id])).status,'liberada')
    assert.equal((await one('select estoque from produtos where id=1')).estoque,10)
    assert.equal((await pagar(q)).revisao,true)
  })
  await t.test('reserva geral protege edição de estoque; pagamento baixa uma vez',async()=>{
    const q=await pedido([{produto_id:1,quantidade:8}])
    await assert.rejects(run('update produtos set estoque=7 where id=1'),/reservas ativas/)
    assert.equal((await pagar(q)).confirmado_agora,true)
    await pagar(q)
    assert.equal((await one('select estoque from produtos where id=1')).estoque,2)
  })
  await t.test('pedidos de teste e legados nunca movimentam estoque',async()=>{
    const q=await pedido([{produto_id:1,quantidade:1}])
    await run('update pedidos set pedido_teste=true where id=$1',[q.id])
    assert.equal((await pagar(q)).ignorado,true)
    await assert.rejects(run('select confirmar_reserva_pedido($1)',[q.id]),/teste/)
    await assert.rejects(run('select liberar_reserva_estoque_pedido($1)',[q.id]),/teste/)
    const id='11111111-1111-4111-8111-111111111111'
    assert.equal((await pagar({id,total:10})).legado,true)
    assert.equal((await one('select estoque from produtos where id=1')).estoque,2)
  })
  await t.test('estorno não repõe estoque nem permite regressão por evento atrasado',async()=>{
    await pagar(p,'refunded'); await pagar(p)
    assert.equal((await one('select status from pedidos where id=$1',[p.id])).status,'reembolsado')
    assert.equal((await one('select estoque from produtos where id=2')).estoque,3)
  })
  await t.test('histórico protegido e administração não confirma pagamento',async()=>{
    await assert.rejects(run('delete from produto_variacoes where id=$1',[variacao]),/histórico/)
    await assert.rejects(run('update produto_variacoes set produto_id=3 where id=$1',[variacao]),/transferir/)
    await assert.rejects(run("select alterar_etapa_pedido($1,'confirmado')",[p.id]),/Transição inválida/)
    await assert.rejects(run('update produtos set controla_variacoes=false where id=2'),/desfeita/)
  })
  await t.test('reserva parcialmente consumida ou divergente exige revisão sem baixa parcial',async()=>{
    await run("insert into produtos(id,nome,categoria,preco,estoque) values(5,'Local multi','Teste',10,10)")
    const q=await pedido([{produto_id:5,quantidade:1},{produto_id:5,quantidade:2}])
    await run("update reservas_estoque set status='consumida' where id=(select id from reservas_estoque where pedido_id=$1 limit 1)",[q.id])
    assert.equal((await pagar(q)).revisao,true)
    assert.equal((await one('select estoque from produtos where id=5')).estoque,10)
    const x=await pedido([{produto_id:5,quantidade:1}])
    await run('update reservas_estoque set quantidade=2 where pedido_id=$1',[x.id])
    assert.equal((await pagar(x)).revisao,true)
    assert.equal((await one('select estoque from produtos where id=5')).estoque,10)
  })
  await t.test('inativação após reserva reverte toda a confirmação',async()=>{
    await run("insert into produtos(id,nome,categoria,preco,estoque) values(6,'Local opções','Teste',10,2)")
    const v=(await one("insert into produto_variacoes(produto_id,tipo,nome,estoque) values(6,'cor','Verde',2) returning id")).id
    await run('select converter_produto_para_variacoes(6)')
    const q=await pedido([{produto_id:5,quantidade:1},{produto_id:6,variacao_id:v,quantidade:1}])
    await run('update produto_variacoes set ativo=false where id=$1',[v])
    assert.equal((await pagar(q)).revisao,true)
    assert.equal((await one('select estoque from produtos where id=5')).estoque,10)
    assert.equal((await one("select count(*)::int as n from reservas_estoque where pedido_id=$1 and status='consumida'",[q.id])).n,0)
  })
  await t.test('editar nome ou status sem estoque preserva inventário; edição antiga é rejeitada', async () => {
    const original = await one("select * from produto_variacoes where id=$1", [variacao])
    const payload = {tipo:original.tipo,nome:original.nome,sku:original.sku,preco:original.preco,preco_promocional:original.preco_promocional,imagem:original.imagem,ativo:original.ativo,atualizado_em_original:original.atualizado_em}
    await run('select salvar_variacao(2,$1,$2::jsonb)',[variacao,JSON.stringify(payload)])
    assert.equal((await one('select estoque from produto_variacoes where id=$1',[variacao])).estoque,original.estoque)
    await assert.rejects(run('select salvar_variacao(2,$1,$2::jsonb)',[variacao,JSON.stringify({...payload,estoque:99})]),/mudou durante/)
    assert.equal((await one('select estoque from produto_variacoes where id=$1',[variacao])).estoque,original.estoque)
  })

  const excluir = async (produtoId, v) => run('select excluir_variacao_segura($1,$2,$3)', [produtoId,v.id,v.atualizado_em])
  await t.test('excluir rascunho mantém estoque geral e exige versão atual',async()=>{
    await run("insert into produtos(id,nome,categoria,preco,estoque) values(7,'Rascunho removível','Teste',10,4)")
    const v=await one("insert into produto_variacoes(produto_id,tipo,nome,estoque) values(7,'tamanho','P',4) returning *")
    await assert.rejects(excluir(7,{...v,atualizado_em:'2000-01-01T00:00:00Z'}),/mudou durante/)
    await excluir(7,v)
    assert.equal((await one('select estoque from produtos where id=7')).estoque,4)
    assert.equal((await one('select count(*)::int as n from produto_variacoes where produto_id=7')).n,0)
    assert.equal((await one("select has_function_privilege('anon','public.excluir_variacao_segura(integer,uuid,timestamptz)','execute') as permitido")).permitido,false)
  })
  await t.test('exclusão de opção convertida não apaga estoque; opção vazia pode ser removida',async()=>{
    await run("insert into produtos(id,nome,categoria,preco,estoque) values(8,'Exclusão segura','Teste',10,3)")
    const a=await one("insert into produto_variacoes(produto_id,tipo,nome,estoque) values(8,'cor','Nude',3) returning *")
    const b=await one("insert into produto_variacoes(produto_id,tipo,nome,estoque) values(8,'cor','Rosa',0) returning *")
    await run('select converter_produto_para_variacoes(8)')
    await assert.rejects(excluir(8,a),/possui estoque/)
    await excluir(8,b)
    assert.equal((await one('select estoque from produtos where id=8')).estoque,3)
    assert.equal((await one('select count(*)::int as n from produto_variacoes where produto_id=8')).n,1)
  })
  await t.test('exclusão não apaga opção esgotada com histórico de compra',async()=>{
    await run("insert into produtos(id,nome,categoria,preco,estoque) values(9,'Histórico preservado','Teste',10,2)")
    let v=await one("insert into produto_variacoes(produto_id,tipo,nome,estoque) values(9,'cor','Rosa',1) returning *")
    await run("insert into produto_variacoes(produto_id,tipo,nome,estoque) values(9,'cor','Nude',1)")
    await run('select converter_produto_para_variacoes(9)')
    const q=await pedido([{produto_id:9,variacao_id:v.id,quantidade:1}])
    await pagar(q)
    v=await one('select * from produto_variacoes where id=$1',[v.id])
    assert.equal(v.estoque,0)
    await assert.rejects(excluir(9,v),/histórico/)
    assert.equal((await one('select estoque from produtos where id=9')).estoque,1)
  })

})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarControlePedidos } from '../src/customerOrders.ts'

test('resposta antiga não pode repor pedidos após logout',async()=>{
  const controle=criarControlePedidos()
  controle.definirCliente('conta-a')
  const consulta=controle.iniciar('conta-a')!
  let concluir!: (pedidos:string[])=>void
  const rede=new Promise<string[]>(resolve=>{concluir=resolve})
  let visiveis:string[]=[]
  const carregar=rede.then(pedidos=>{if(controle.atual(consulta))visiveis=pedidos})
  controle.definirCliente(null)
  concluir(['pedido-privado-a'])
  await carregar
  assert.deepEqual(visiveis,[])
})

test('troca de conta rejeita resposta atrasada e aceita apenas a nova conta',()=>{
  const controle=criarControlePedidos()
  controle.definirCliente('conta-a')
  const anterior=controle.iniciar('conta-a')!
  controle.definirCliente('conta-b')
  const nova=controle.iniciar('conta-b')!
  assert.equal(controle.atual(anterior),false)
  assert.equal(controle.atual(nova),true)
  assert.equal(controle.iniciar('conta-a'),null)
  assert.equal(controle.iniciar(null),null)
})

test('atualizações concorrentes não sobrescrevem a resposta mais recente',()=>{
  const controle=criarControlePedidos()
  controle.definirCliente('conta-a')
  const antiga=controle.iniciar('conta-a')!
  const recente=controle.iniciar('conta-a')!
  assert.equal(controle.atual(antiga),false)
  assert.equal(controle.atual(recente),true)
  assert.equal(controle.definirCliente('conta-a'),false)
  assert.equal(controle.atual(recente),true)
})

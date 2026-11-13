import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LimiteLogin } from '../server/loginRateLimit.ts'

test('tentativas falhas bloqueiam temporariamente, sem bloquear outras origens',()=>{
  const limite=new LimiteLogin(3,60000)
  for(let i=0;i<3;i++) { assert.equal(limite.espera('a',0),0);limite.falhou('a',0) }
  assert.equal(limite.espera('a',30000),30)
  assert.equal(limite.espera('b',30000),0)
  assert.equal(limite.espera('a',60000),0)
})

test('acesso válido limpa falhas anteriores; fim da janela não perpetua bloqueio',()=>{
  const limite=new LimiteLogin(2,60000)
  limite.falhou('a',0)
  limite.limpar('a')
  limite.falhou('a',10)
  assert.equal(limite.espera('a',20),0)
  limite.falhou('a',30)
  assert.ok(limite.espera('a',40)>0)
  assert.equal(limite.espera('a',60010),0)
  limite.falhou('a',60011)
  assert.equal(limite.espera('a',60012),0)
})

import fs from 'node:fs/promises';
import path from 'node:path';
const anterior="export function assinaturaValida(secret: string | undefined, signature: string | undefined, requestId: string | undefined, dataId: unknown) {\n  if (!secret || !signature || !requestId || typeof dataId !== 'string' || !dataId) return false\n  const partes = Object.fromEntries(signature.split(',').map(p => p.trim().split('=', 2)))\n  if (!/^\\d+$/.test(partes.ts || '') || !/^[a-f0-9]{64}$/i.test(partes.v1 || '')) return false\n  // A documentação exige IDs alfanuméricos em minúsculas no manifesto.\n  const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${partes.ts};`\n  const esperado = createHmac('sha256', secret).update(manifesto).digest()\n  return timingSafeEqual(esperado, Buffer.from(partes.v1, 'hex'))\n}\n\n";
const nova="export function assinaturaValida(secret: string | undefined, signature: string | undefined, requestId: string | undefined, dataId: unknown) {\n  if (!secret || !signature || !requestId || typeof dataId !== 'string' || !dataId) return false\n  const partes = Object.fromEntries(signature.split(',').map(p => p.trim().split('=', 2)))\n  if (!/^\\d+$/.test(partes.ts || '') || !/^[a-f0-9]{64}$/i.test(partes.v1 || '')) return false\n  // Eventos Orders observados assinam o ID original. Aceita também a\n  // normalização histórica, sempre exigindo HMAC válido com o mesmo segredo.\n  const recebida = Buffer.from(partes.v1, 'hex')\n  for (const id of new Set([dataId, dataId.toLowerCase()])) {\n    const manifesto = `id:${id};request-id:${requestId};ts:${partes.ts};`\n    const esperado = createHmac('sha256', secret).update(manifesto).digest()\n    if (timingSafeEqual(esperado, recebida)) return true\n  }\n  return false\n}\n\n";
const file=path.resolve('server/payment.ts');
const original=await fs.readFile(file,'utf8');
const texto=original.replace(/\r\n/g,'\n');
if(texto.includes(nova)){console.log('Correção de assinatura já instalada.');process.exit(0)}
if(texto.split(anterior).length!==2){console.error('Arquivo diferente do esperado; instalação interrompida sem alterar nada. Envie server/payment.ts para adaptar.');process.exit(1)}
await fs.mkdir('.homologacao-backups',{recursive:true});
const backup=path.resolve('.homologacao-backups','payment-antes-correcao-'+Date.now()+'.ts');
await fs.writeFile(backup,original,{flag:'wx'});
await fs.writeFile(file,texto.replace(anterior,nova));
console.log('Assinatura corrigida. Backup: '+path.relative(process.cwd(),backup));
console.log('HMAC obrigatório preservado; sem alteração de env, pedidos, estoque ou mensagens.');

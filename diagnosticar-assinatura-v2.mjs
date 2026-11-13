import fs from 'node:fs/promises'
import path from 'node:path'

const file=path.resolve('server/index.ts')
const original=await fs.readFile(file,'utf8')
const marker='// MP_ASSINATURA_DIAGNOSTICO_V2'
const anchor="app.post('/api/pagamentos/mercado-pago/webhook', async (req, res) => {"
if(original.includes(marker)){console.log('Diagnóstico V2 já instalado.');process.exit(0)}
if(original.split(anchor).length!==2 || !original.includes('assinaturaMercadoPagoValida')){
  throw new Error('Servidor diferente do esperado. Nenhum arquivo alterado.')
}
const addition=`
  ${marker}
  try {
    const fsDiag = await import('node:fs/promises')
    const cryptoDiag = await import('node:crypto')
    const textoDiag = await fsDiag.readFile('.env.local','utf8')
    const arquivoDiag = dotenv.parse(textoDiag)
    const secretDiag = process.env.MERCADO_PAGO_WEBHOOK_SECRET || ''
    const paresDiag = Object.fromEntries((req.get('x-signature') || '').split(',').map(p => p.trim().split('=',2)))
    const ridDiag = req.get('x-request-id') || ''
    const idDiag = typeof req.query['data.id'] === 'string' ? req.query['data.id'] : ''
    const formatoDiag = /^\\d+$/.test(paresDiag.ts || '') && /^[a-f0-9]{64}$/i.test(paresDiag.v1 || '')
    const conferirDiag = (secret: string, id: string) => {
      if (!secret || !id || !ridDiag || !formatoDiag) return false
      const manifesto = 'id:' + id + ';request-id:' + ridDiag + ';ts:' + paresDiag.ts + ';'
      const esperado = cryptoDiag.createHmac('sha256',secret).update(manifesto).digest()
      return cryptoDiag.timingSafeEqual(esperado, Buffer.from(paresDiag.v1,'hex'))
    }
    console.info('MP_ASSINATURA_V2:', JSON.stringify({
      linhas_segredo: (textoDiag.match(/^\\s*(?:export\\s+)?MERCADO_PAGO_WEBHOOK_SECRET\\s*=/gm) || []).length,
      segredo_servidor_igual_arquivo: Boolean(secretDiag) && secretDiag === arquivoDiag.MERCADO_PAGO_WEBHOOK_SECRET,
      segredo_tem_espaco_extremidades: secretDiag !== secretDiag.trim(),
      segredo_igual_access_token: Boolean(secretDiag) && secretDiag === process.env.MERCADO_PAGO_TEST_ACCESS_TOKEN,
      formato_assinatura_valido: formatoDiag,
      id_query_igual_body: idDiag === String(req.body?.data?.id || ''),
      assinatura_id_minusculo: conferirDiag(secretDiag,idDiag.toLowerCase()),
      assinatura_id_original: conferirDiag(secretDiag,idDiag),
      assinatura_segredo_arquivo: conferirDiag(arquivoDiag.MERCADO_PAGO_WEBHOOK_SECRET || '',idDiag.toLowerCase()),
    }))
  } catch {
    console.info('MP_ASSINATURA_V2: diagnóstico indisponível; nenhuma informação secreta foi registrada.')
  }
`
await fs.mkdir('.homologacao-backups',{recursive:true})
const backup=path.resolve('.homologacao-backups','index-antes-assinatura-v2-'+Date.now()+'.ts')
await fs.writeFile(backup,original,{flag:'wx'})
await fs.writeFile(file,original.replace(anchor,anchor+addition))
console.log('Diagnóstico V2 instalado. Backup: '+path.relative(process.cwd(),backup))
console.log('Nenhuma regra de autorização foi alterada. Nenhum secret é impresso.')

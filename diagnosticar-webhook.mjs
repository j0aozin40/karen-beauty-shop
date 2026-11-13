import fs from 'node:fs/promises'
import path from 'node:path'

const file = path.resolve('server/index.ts')
const original = await fs.readFile(file, 'utf8')
const marker = '// MP_DIAGNOSTICO_SEGURO_V1'
const anchor = "app.post('/api/pagamentos/mercado-pago/webhook', async (req, res) => {"
if (original.includes(marker)) {
  console.log('Diagnóstico já instalado. Repita a simulação e veja o terminal do servidor.')
  process.exit(0)
}
if (original.split(anchor).length !== 2 || !original.includes('function assinaturaMercadoPagoValida(')) {
  console.error('Instalação interrompida: formato do servidor diferente do esperado. Nenhum arquivo alterado.')
  process.exit(1)
}
const addition = `
  ${marker}
  const mpDiagnostico = {
    evento_query_order: req.query.type === 'order',
    evento_body_order: req.body?.type === 'order',
    id_query_presente: typeof req.query['data.id'] === 'string' && Boolean(req.query['data.id']),
    id_body_presente: Boolean(req.body?.data?.id),
    assinatura_recebida: Boolean(req.get('x-signature')),
    request_id_recebido: Boolean(req.get('x-request-id')),
    segredo_configurado: Boolean(process.env.MERCADO_PAGO_WEBHOOK_SECRET),
    assinatura_valida: assinaturaMercadoPagoValida(req),
  }
  console.info('MP_DIAGNOSTICO entrada:', JSON.stringify(mpDiagnostico))
  res.once('finish', () => console.info('MP_DIAGNOSTICO resposta HTTP:', res.statusCode))
`
const backupDir = path.resolve('.homologacao-backups')
await fs.mkdir(backupDir, {recursive:true})
const backup = path.join(backupDir, 'index-antes-diagnostico-' + Date.now() + '.ts')
await fs.writeFile(backup, original, {flag:'wx'})
await fs.writeFile(file, original.replace(anchor, anchor + addition))
console.log('Diagnóstico instalado. Backup: ' + path.relative(process.cwd(),backup))
console.log('Não altera autenticação, estoque, pedidos ou regras de envio. Não imprime secrets nem dados do comprador.')
console.log('Veja as linhas MP_DIAGNOSTICO no terminal de npm run server após simular a notificação.')

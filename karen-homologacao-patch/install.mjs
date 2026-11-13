import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const patchRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = process.cwd()
const expected = '313202160524e8500eb70ce6ed57fd42de86f80db0b1d5a336e815bb395a6127'
const files = ['server/homologation.ts','scripts/check-homologation.ts','homologation-tests/api.test.ts','homologation-tests/homologation.test.ts','server/index.ts']
const hash = value => createHash('sha256').update(value).digest('hex')
const original = await fs.readFile(path.join(projectRoot, 'server/index.ts'))
const replacement = await fs.readFile(path.join(patchRoot, 'server/index.ts'))
if (hash(original) !== expected && hash(original) !== hash(replacement)) {
  console.error('Instalação interrompida: server/index.ts mudou desde o arquivo enviado para revisão. Nenhum arquivo alterado. Envie a versão atual para adaptar a correção.')
  process.exit(1)
}
const prepared = await Promise.all(files.map(async file => {
  const contents = await fs.readFile(path.join(patchRoot, file))
  let previous = null
  try { previous = await fs.readFile(path.join(projectRoot, file)) } catch (error) { if (error.code !== 'ENOENT') throw error }
  return { file, contents, previous }
}))
const backup = path.join(projectRoot, '.homologacao-backups', new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid)
for (const item of prepared) {
  if (item.previous !== null) {
    const backupFile = path.join(backup, item.file)
    await fs.mkdir(path.dirname(backupFile), { recursive: true })
    await fs.writeFile(backupFile, item.previous, { flag: 'wx' })
  }
}
const written = []
try {
  for (const item of prepared) {
    const destination = path.join(projectRoot, item.file)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    written.push(item)
    await fs.writeFile(destination, item.contents)
  }
} catch (error) {
  for (const item of written.reverse()) {
    const destination = path.join(projectRoot, item.file)
    if (item.previous === null) await fs.unlink(destination).catch(() => {})
    else await fs.writeFile(destination, item.previous)
  }
  throw error
}
console.log('Correção instalada. Backup do código: ' + path.relative(projectRoot, backup))
console.log('Nenhum arquivo .env, dependência, banco ou serviço remoto foi alterado.')
console.log('Execute o verificador antes de iniciar compras. Em homologação, o servidor exige HOMOLOGATION_SUPABASE_URL igual à URL do projeto de testes separado.')

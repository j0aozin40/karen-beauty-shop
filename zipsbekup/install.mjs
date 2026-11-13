import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const serverFile = path.join(root, 'server', 'index.ts')
const storeFile = path.join(root, 'server', 'supabase-session-store.ts')
const migrationSource = path.join(path.dirname(new URL(import.meta.url).pathname), 'patch', 'supabase', 'migrations', '202611120001_admin_sessions.sql')
const storeSource = path.join(path.dirname(new URL(import.meta.url).pathname), 'patch', 'server', 'supabase-session-store.ts')
const migrationDir = path.join(root, 'supabase', 'migrations')
const migrationTarget = path.join(migrationDir, '202611120001_admin_sessions.sql')
const backupDir = path.join(root, '.homologacao-backups', `admin-sessions-${new Date().toISOString().replaceAll(':', '-')}`)

if (!fs.existsSync(serverFile) || !fs.existsSync(path.join(root, 'package.json'))) {
  throw new Error('Execute este instalador na raiz do projeto Karen Beauty Shop.')
}
if (fs.existsSync(storeFile) || fs.existsSync(migrationTarget)) {
  throw new Error('Um dos arquivos do patch já existe. Nenhum arquivo foi alterado; confira a instalação atual.')
}

let source = fs.readFileSync(serverFile, 'utf8')
const sessionBlock = /app\.use\(session\(\{\s*name: 'karen_admin_session',[\s\S]*?\n\}\)\)\s*/g
const matches = [...source.matchAll(sessionBlock)]
if (matches.length !== 1 || source.includes('SupabaseSessionStore')) {
  throw new Error('O bloco de sessão do projeto não corresponde ao esperado. Nenhum arquivo foi alterado.')
}

const importAnchor = "import path from 'node:path'"
const clientAnchor = 'const supabase = createClient(supabaseUrl, supabaseKey)'
if (!source.includes(importAnchor) || source.split(clientAnchor).length !== 2) {
  throw new Error('Não encontrei os pontos de inserção esperados no servidor. Nenhum arquivo foi alterado.')
}

const replacement = ''
source = source.replace(sessionBlock, replacement)
source = source.replace(importAnchor, `${importAnchor}\nimport { SupabaseSessionStore } from './supabase-session-store.ts'`)
source = source.replace(clientAnchor, `${clientAnchor}\napp.use(session({\n  store: new SupabaseSessionStore(supabase),\n  name: 'karen_admin_session',\n  secret: process.env.ADMIN_SESSION_SECRET!,\n  resave: false,\n  saveUninitialized: false,\n  cookie: {\n    httpOnly: true,\n    sameSite: 'lax',\n    secure: process.env.NODE_ENV === 'production',\n    maxAge: 8 * 60 * 60 * 1000\n  }\n}))`)

fs.mkdirSync(backupDir, { recursive: true })
fs.mkdirSync(path.dirname(storeFile), { recursive: true })
fs.mkdirSync(migrationDir, { recursive: true })
fs.copyFileSync(serverFile, path.join(backupDir, 'server-index.ts'))

try {
  fs.writeFileSync(storeFile, fs.readFileSync(storeSource, 'utf8'), { flag: 'wx' })
  fs.writeFileSync(migrationTarget, fs.readFileSync(migrationSource, 'utf8'), { flag: 'wx' })
  const tempFile = `${serverFile}.session-fix.tmp`
  fs.writeFileSync(tempFile, source, { flag: 'wx' })
  fs.renameSync(tempFile, serverFile)
} catch (error) {
  for (const file of [storeFile, migrationTarget, `${serverFile}.session-fix.tmp`]) {
    if (fs.existsSync(file)) fs.rmSync(file)
  }
  fs.copyFileSync(path.join(backupDir, 'server-index.ts'), serverFile)
  throw error
}

console.log('Patch instalado; backup do server/index.ts em .homologacao-backups.')
console.log('Nenhum secret, banco remoto, cobrança ou envio de mensagem foi alterado.')
console.log('A migration foi apenas copiada; ela ainda NÃO foi aplicada ao Supabase.')

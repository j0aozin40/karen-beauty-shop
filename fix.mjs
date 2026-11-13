import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const storePath = path.join(root, 'server', 'supabase-session-store.ts')
const indexPath = path.join(root, 'server', 'index.ts')

if (!fs.existsSync(storePath) || !fs.existsSync(indexPath)) {
  throw new Error('Execute na raiz do projeto Karen Beauty Shop. Nenhum arquivo foi alterado.')
}

let store = fs.readFileSync(storePath, 'utf8')
let index = fs.readFileSync(indexPath, 'utf8')

const getPattern = /  get\(sid: string, callback: GetCallback\): void \{[\s\S]*?\n  \}\n\n  set\(/
const destroyPattern = /  destroy\(sid: string, callback\?: WriteCallback\): void \{[\s\S]*?\n  \}\n\n  touch\(/
const storeLine = '  store: new SupabaseSessionStore(supabase),'

if (!getPattern.test(store) || !destroyPattern.test(store) || !index.includes(storeLine)) {
  throw new Error('Os arquivos não correspondem ao esperado. Nenhum arquivo foi alterado.')
}

const getReplacement = `  get(sid: string, callback: GetCallback): void {
    void (async () => {
      try {
        const { data, error } = await this.client
          .from('admin_sessions')
          .select('session_data,expires_at')
          .eq('sid', sid)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle()
        if (error) return callback(error)
        return callback(null, (data?.session_data as session.SessionData | undefined) ?? null)
      } catch (error) {
        callback(error)
      }
    })()
  }

  set(`
const destroyReplacement = `  destroy(sid: string, callback?: WriteCallback): void {
    void (async () => {
      try {
        const { error } = await this.client
          .from('admin_sessions')
          .delete()
          .eq('sid', sid)
        callback?.(error ?? undefined)
      } catch (error) {
        callback?.(error)
      }
    })()
  }

  touch(`

store = store.replace(getPattern, getReplacement).replace(destroyPattern, destroyReplacement)
index = index.replace(storeLine, "  store: (process.env.NODE_ENV === 'test' || process.env.NODE_TEST_CONTEXT !== undefined)\n    ? new session.MemoryStore()\n    : new SupabaseSessionStore(supabase),")

const backupDir = path.join(root, '.homologacao-backups', `admin-session-fix-${new Date().toISOString().replaceAll(':', '-')}`)
fs.mkdirSync(backupDir, { recursive: true })
fs.copyFileSync(storePath, path.join(backupDir, 'supabase-session-store.ts'))
fs.copyFileSync(indexPath, path.join(backupDir, 'server-index.ts'))

const storeTemp = `${storePath}.fix.tmp`
const indexTemp = `${indexPath}.fix.tmp`
try {
  fs.writeFileSync(storeTemp, store, { flag: 'wx' })
  fs.writeFileSync(indexTemp, index, { flag: 'wx' })
  fs.renameSync(storeTemp, storePath)
  fs.renameSync(indexTemp, indexPath)
} catch (error) {
  for (const file of [storeTemp, indexTemp]) if (fs.existsSync(file)) fs.rmSync(file)
  fs.copyFileSync(path.join(backupDir, 'supabase-session-store.ts'), storePath)
  fs.copyFileSync(path.join(backupDir, 'server-index.ts'), indexPath)
  throw error
}

console.log(`Correção aplicada. Backup em ${path.relative(root, backupDir)}.`)
console.log('Testes usam sessão em memória; homologação/produção continuam com sessão persistente no Supabase.')
console.log('Nenhum secret, banco, cobrança ou serviço remoto foi alterado.')

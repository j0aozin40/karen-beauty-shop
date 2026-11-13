import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'

const root = process.cwd()
const packageFile = path.join(root, 'package.json')
const envFile = path.join(root, '.env.local')
const configFile = path.join(root, 'wrangler.jsonc')

if (!fs.existsSync(packageFile) || JSON.parse(fs.readFileSync(packageFile, 'utf8')).name !== 'karen-beauty-shop') {
  throw new Error('Execute este arquivo na pasta raiz /workspaces/karen-beauty-shop.')
}
if (!fs.existsSync(envFile)) throw new Error('Não encontrei .env.local; não alterei wrangler.jsonc.')

const source = dotenv.parse(fs.readFileSync(envFile, 'utf8'))
if (source.APP_ENV !== 'homologation') throw new Error('APP_ENV precisa ser homologation para esta preparação segura.')
if (!source.VITE_SUPABASE_URL || !source.VITE_SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY está ausente em .env.local.')
}
if (source.HOMOLOGATION_SUPABASE_URL !== source.VITE_SUPABASE_URL) {
  throw new Error('HOMOLOGATION_SUPABASE_URL não corresponde à URL VITE do banco de homologação.')
}

const config = {
  name: 'karen-beauty-shop',
  main: 'cloudflare/worker.ts',
  compatibility_date: '2026-11-12',
  observability: { enabled: true },
  vars: {
    APP_ENV: 'homologation',
    NODE_ENV: 'production',
    PORT: '8080',
    HOMOLOGATION_SEND_NOTIFICATIONS: 'false',
    PRODUCTION_SEND_NOTIFICATIONS: 'false',
  },
  containers: [
    {
      class_name: 'KarenShopContainer',
      scheduling_policy: 'durable_object',
      images: {
        base: {
          dockerfile: './Dockerfile',
          build_vars: {
            VITE_SUPABASE_URL: source.VITE_SUPABASE_URL,
            VITE_SUPABASE_PUBLISHABLE_KEY: source.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        },
      },
    },
  ],
  durable_objects: {
    bindings: [{ name: 'KAREN_SHOP', class_name: 'KarenShopContainer' }],
  },
  exports: {
    KarenShopContainer: { type: 'durable-object', storage: 'sqlite' },
  },
}

if (fs.existsSync(configFile)) {
  const backupDir = path.join(root, '.homologacao-backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
  const backupFile = path.join(backupDir, `wrangler-jsonc-antes-correcao-${stamp}.jsonc`)
  fs.copyFileSync(configFile, backupFile, fs.constants.COPYFILE_EXCL)
  console.log(`Backup criado: ${path.relative(root, backupFile)}`)
}

fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
JSON.parse(fs.readFileSync(configFile, 'utf8'))
console.log('wrangler.jsonc refeito e validado para HOMOLOGATION.')
console.log('Foram usados somente URL e chave publicável do Supabase; nenhum secret foi exibido ou copiado.')

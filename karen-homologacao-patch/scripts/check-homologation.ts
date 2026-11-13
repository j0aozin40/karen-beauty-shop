import { homologacao, tokenPagamento, validarBancoHomologacao } from '../server/homologation.ts'
import { readFileSync } from 'node:fs'

// Executar com secrets injetados pelo ambiente. Não imprime valores e não usa rede.
const checks: Array<[string, boolean]> = []
let backend = ''
try { backend = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8') } catch { /* Ausência deve aparecer como pendência. */ }
checks.push(['proteções de homologação referenciadas no backend (inspeção estática)',
  backend.includes("from './homologation.ts'") && backend.includes('validarBancoHomologacao()') &&
  backend.includes('await validarVendedorTeste()') && backend.includes("destinatarioPermitido('email'") &&
  backend.includes("destinatarioPermitido('whatsapp'")])
for (const key of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','ADMIN_PASSWORD','PUBLIC_APP_URL','MERCADO_PAGO_WEBHOOK_SECRET','MERCADO_PAGO_TEST_SELLER_ID']) checks.push([key,Boolean(process.env[key])])
checks.push(['ADMIN_SESSION_SECRET (mínimo 32)',(process.env.ADMIN_SESSION_SECRET?.length || 0)>=32])
try { checks.push(['ambiente de homologação',homologacao()]) } catch { checks.push(['ambiente de homologação',false]) }
try { tokenPagamento(); checks.push(['credencial dedicada de teste',true]) } catch { checks.push(['credencial dedicada de teste',false]) }
try { validarBancoHomologacao(); checks.push(['banco isolado declarado',true]) } catch { checks.push(['banco isolado declarado',false]) }
try { checks.push(['URL pública HTTPS',new URL(process.env.PUBLIC_APP_URL || '').protocol==='https:']) } catch { checks.push(['URL pública HTTPS',false]) }
if (process.env.HOMOLOGATION_SEND_NOTIFICATIONS === 'true') {
  for (const key of ['TEST_EMAIL_RECIPIENTS','TEST_WHATSAPP_RECIPIENTS','SMTP_HOST','SMTP_USER','SMTP_PASS','WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_ORDER_RECIPIENT','WHATSAPP_ORDER_STORE_TEMPLATE','WHATSAPP_ORDER_CUSTOMER_TEMPLATE']) checks.push([key,Boolean(process.env[key])])
}
for (const [name,ok] of checks) console.log(`${ok?'OK':'PENDENTE'}: ${name}`)
console.log('Checagem local de configuração; não comprova autenticação, isolamento real ou entrega de mensagens.')
if (checks.some(([,ok])=>!ok)) process.exitCode=1

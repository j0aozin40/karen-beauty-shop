import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { IMAGE, MIGRATIONS, SNAPSHOT_SQL, CHECK_SQL, verificarBackup } from './validar-backup-karen-v2.mjs';

// Aplicação das duas migrations autorizada pelo proprietário neste chat.
// A senha é solicitada pelo próprio pg_dump/psql, nunca passada em URI ou gravada.
const PROJECT_REF = 'ccwerscgpytrztmavvrs';
const HOST = 'aws-1-sa-east-1.pooler.supabase.com';
const sha = dados => crypto.createHash('sha256').update(dados).digest('hex');

export function corpoMigration(texto) {
  const s = texto.trim();
  if (!/^begin;\s/i.test(s) || !/\scommit;$/i.test(s)) throw new Error('Formato inesperado de migration.');
  return s.replace(/^begin;\s*/i, '').replace(/\s*commit;$/i, '');
}

export function montarSQL(textos) {
  if (textos.length !== 2) throw new Error('São necessárias exatamente duas migrations.');
  return `-- Implantação Karen Beauty Shop: somente as duas migrations de 10/11/2026.
-- Transação única: qualquer falha antes do COMMIT reverte toda a instalação.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
SET LOCAL idle_in_transaction_session_timeout = '30s';
SET LOCAL search_path = public, pg_catalog;
SELECT pg_advisory_xact_lock(hashtext('karen_variacoes_reservas_20261110'));
DO $karen_preflight$ BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' THEN
   RAISE EXCEPTION 'Banco ou usuário diferente do esperado. Nenhuma alteração aplicada.';
 END IF;
 IF to_regclass('public.produto_variacoes') IS NOT NULL
    OR to_regclass('public.reservas_estoque') IS NOT NULL
    OR EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND (
        (table_name='produtos' AND column_name='controla_variacoes') OR
        (table_name='pedidos' AND column_name IN ('usa_reservas_estoque','pagamento_revisao')) OR
        (table_name='itens_pedido' AND column_name IN ('variacao_id','nome_variacao','sku_variacao'))
      )) THEN
   RAISE EXCEPTION 'Já há alterações dessas migrations. Não reaplique; confira o estado atual.';
 END IF;
END $karen_preflight$;

-- Bloqueia gravações durante a conferência e a alteração de estrutura.
LOCK TABLE public.produtos, public.pedidos, public.itens_pedido IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE karen_dados_antes(tabela,quantidade,hash) ON COMMIT DROP AS
${SNAPSHOT_SQL}

-- Primeira migration, sem o BEGIN/COMMIT individual.
${corpoMigration(textos[0])}

-- Segunda migration, sem o BEGIN/COMMIT individual.
${corpoMigration(textos[1])}

CREATE TEMP TABLE karen_dados_depois(tabela,quantidade,hash) ON COMMIT DROP AS
${SNAPSHOT_SQL}
DO $karen_integridade$ BEGIN
 IF EXISTS (
   SELECT 1 FROM pg_temp.karen_dados_antes a
   FULL JOIN pg_temp.karen_dados_depois d USING(tabela)
   WHERE a.quantidade IS DISTINCT FROM d.quantidade OR a.hash IS DISTINCT FROM d.hash
 ) THEN
   RAISE EXCEPTION 'Dados originais divergentes. A instalação será revertida.';
 END IF;
END $karen_integridade$;

-- Confere flags, ausência de reservas retroativas e permissões das novas funções.
${CHECK_SQL}
-- A API deve reconhecer as novas tabelas e funções após o COMMIT.
NOTIFY pgrst, 'reload schema';
COMMIT;
SELECT 'MIGRATIONS_APLICADAS' AS resultado;
`;
}

function docker(args, opcoes = {}) {
  const r = spawnSync('docker', args, {
    encoding: 'utf8', timeout: 300000, maxBuffer: 16*1024*1024,
    stdio: opcoes.interativo ? 'inherit' : 'pipe', windowsHide: true,
  });
  if (opcoes.log) fs.writeFileSync(opcoes.log, `${r.stdout || ''}\n${r.stderr || ''}`, {mode:0o600});
  if (r.error || r.status !== 0) throw new Error(opcoes.erro || 'A etapa não foi concluída.');
  return r.stdout || '';
}

export function main() {
  if (process.platform !== 'linux') throw new Error('Execute no terminal do Codespaces.');
  process.umask(0o077);
  const projeto = fs.realpathSync('/workspaces/karen-beauty-shop');
  const backup = fs.realpathSync('/workspaces/karen-backup-banco-C18nH3');
  const relatorioPath = '/workspaces/karen-validacao-local-MFwMGa/RESULTADO.json';
  const relatorio = JSON.parse(fs.readFileSync(relatorioPath, 'utf8'));
  if (relatorio.aprovado !== true || relatorio.bancoRemotoAcessado !== false || fs.realpathSync(relatorio.backup) !== backup) {
    throw new Error('Não foi encontrada a aprovação do teste de restauração esperado.');
  }
  verificarBackup(backup);
  const require = createRequire(path.join(projeto, 'package.json'));
  const config = require('dotenv').parse(fs.readFileSync(path.join(projeto, '.env.local')));
  if (new URL(config.VITE_SUPABASE_URL).hostname !== `${PROJECT_REF}.supabase.co`) {
    throw new Error('O projeto do .env.local é diferente do projeto autorizado.');
  }
  const textos = [];
  for (const [nome, hash] of Object.entries(MIGRATIONS)) {
    const bytes = fs.readFileSync(path.join(projeto, 'supabase/migrations', nome));
    if (sha(bytes) !== hash || relatorio.migrations?.[nome] !== hash) throw new Error(`A migration ${nome} não corresponde à versão validada.`);
    textos.push(bytes.toString('utf8'));
  }
  docker(['image','inspect',IMAGE]);
  const work = fs.mkdtempSync('/workspaces/karen-implantacao-');
  fs.chmodSync(work,0o700);
  fs.writeFileSync(path.join(work,'aplicar.sql'), montarSQL(textos), {mode:0o600});
  const registro = { status:'preparado', projeto:PROJECT_REF, backupValidado:backup, migrations:MIGRATIONS, iniciadoEm:new Date().toISOString() };
  const salvar = () => fs.writeFileSync(path.join(work,'RESULTADO-IMPLANTACAO.json'), JSON.stringify(registro,null,2)+'\n', {mode:0o600});
  salvar();
  const usuario = `${process.getuid()}:${process.getgid()}`;
  const conexao = ['-h',HOST,'-p','5432','-U',`postgres.${PROJECT_REF}`,'-d','postgres'];
  console.log('1/3 — Arquivos, backup e relatório da cópia conferidos.');
  console.log('Será solicitado Password duas vezes: backup atualizado e aplicação das migrations.');
  console.log('Os arquivos privados desta execução ficam em:',work);
  let aplicacaoIniciada = false;
  try {
    docker(['run','--rm','--pull=never','-it','--user',usuario,
      '--mount',`type=bind,source=${work},target=/implantacao`,
      '-e','PGSSLMODE=require','--entrypoint','pg_dump',IMAGE,
      ...conexao,'-W','--format=custom','--file=/implantacao/banco-antes.dump'],
      {interativo:true,erro:'O backup atualizado não foi concluído. Nenhuma migration foi enviada.'});
    const indice = docker(['run','--rm','--pull=never','--user',usuario,
      '--mount',`type=bind,source=${work},target=/implantacao,readonly`,
      '--entrypoint','pg_restore',IMAGE,'--list','/implantacao/banco-antes.dump']);
    for (const tabela of ['produtos','pedidos','itens_pedido']) {
      if (!new RegExp(` TABLE DATA public ${tabela}(?:\\s|$)`,'m').test(indice)) throw new Error('O índice do backup atualizado está incompleto. Nenhuma migration foi enviada.');
    }
    fs.writeFileSync(path.join(work,'indice-backup.txt'),indice,{mode:0o600});
    fs.chmodSync(path.join(work,'banco-antes.dump'),0o600);
    fs.writeFileSync(path.join(work,'SHA256SUMS.txt'), `${sha(fs.readFileSync(path.join(work,'banco-antes.dump')))}  banco-antes.dump\n${sha(fs.readFileSync(path.join(work,'aplicar.sql')))}  aplicar.sql\n`,{mode:0o600});
    console.log('2/3 — Backup atualizado gerado e índice conferido. Iniciando a transação de implantação.');
    console.log('Se houver espera por outra gravação, o bloqueio expira em 5 segundos e a transação falha.');
    registro.status='aplicacao_iniciada'; salvar(); aplicacaoIniciada=true;
    docker(['run','--rm','--pull=never','-it','--user',usuario,
      '--mount',`type=bind,source=${work},target=/implantacao,readonly`,
      '-e','PGSSLMODE=require','--entrypoint','psql',IMAGE,
      ...conexao,'-X','-W','-v','ON_ERROR_STOP=1','-f','/implantacao/aplicar.sql'],
      {interativo:true,erro:'Não foi possível confirmar a conclusão. Não repita automaticamente; envie a saída do terminal para conferência.'});
    registro.status='aplicado'; registro.concluidoEm=new Date().toISOString(); salvar();
    console.log('3/3 — IMPLANTAÇÃO CONCLUÍDA. Dados originais conferidos dentro da transação.');
    console.log('Backup atualizado e registro:',work);
    console.log('Nenhum produto foi convertido automaticamente e nenhum pedido antigo foi reprocessado.');
    console.log('Próxima etapa: conferir catálogo e painel e validar a configuração de checkout/webhook.');
  } catch (erro) {
    registro.status=aplicacaoIniciada?'conclusao_nao_confirmada':'interrompido_antes_das_migrations'; salvar();
    console.error(erro.message);
    console.error('Arquivos preservados em:',work);
    process.exitCode=1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try { main(); } catch(erro) { console.error(erro.message); process.exitCode=1; }
}

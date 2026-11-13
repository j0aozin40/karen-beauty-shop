import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Somente Docker local. Este programa não lê .env nem recebe a senha do banco da loja.
export const IMAGE = 'public.ecr.aws/supabase/postgres:17.11.0.018';
export const MIGRATIONS = {
  '202611100001_product_variations.sql': '9b6a8c2fafc3fdbe7f612bff2590bf085f1f964fd4472e2434e847a7e9112e6d',
  '202611100002_stock_reservations.sql': '6499f4a98ae39d4d4c8d25125308e9723ab3cf7532d226d686377eb3a32db9c4',
};
const digest = data => crypto.createHash('sha256').update(data).digest('hex');

export function verificarBackup(dir) {
  const esperados = new Set(['banco.dump', 'roles.sql', 'conteudo.txt']);
  const linhas = fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/);
  for (const linha of linhas) {
    const m = linha.match(/^([a-f0-9]{64})\s+\*?(.+)$/i);
    if (!m || !esperados.has(m[2])) throw new Error('O manifesto do backup não tem o formato esperado.');
    const arq = path.join(dir, m[2]);
    if (!fs.lstatSync(arq).isFile() || fs.lstatSync(arq).isSymbolicLink()) throw new Error('Tipo de arquivo de backup não permitido.');
    if (digest(fs.readFileSync(arq)) !== m[1].toLowerCase()) throw new Error(`Integridade divergente: ${m[2]}.`);
    esperados.delete(m[2]);
  }
  if (esperados.size) throw new Error('O manifesto do backup está incompleto.');
  const toc = fs.readFileSync(path.join(dir, 'conteudo.txt'), 'utf8');
  for (const nome of ['produtos', 'pedidos', 'itens_pedido']) {
    if (!new RegExp(` TABLE DATA public ${nome}(?:\\s|$)`, 'm').test(toc)) throw new Error(`O índice não contém os dados de ${nome}.`);
  }
}

export function prepararRoles(texto) {
  // A cópia local já tem postgres e pode ter outros papéis padrão do Supabase.
  // Mantém os ALTER/GRANT originais e torna apenas o CREATE tolerante a papéis existentes.
  return texto.replace(/^CREATE ROLE (.+);\r?$/gm, (_linha, identificador) => {
    if (!/^(?:[a-z_][a-z0-9_$]*|"(?:[^"]|"")+")$/i.test(identificador)) throw new Error('Identificador de papel inesperado.');
    const nome = identificador.startsWith('"') ? identificador.slice(1, -1).replaceAll('""', '"') : identificador.toLowerCase();
    const literal = nome.replaceAll("'", "''");
    let tag = '$karen_role$';
    while (identificador.includes(tag) || literal.includes(tag)) tag = `$karen_role_${crypto.randomBytes(4).toString('hex')}$`;
    return `DO ${tag} BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='${literal}') THEN CREATE ROLE ${identificador}; END IF; END ${tag};`;
  });
}

// SHA-256 de todas as colunas originais, incluindo estoque e identificação dos pedidos de teste.
// Exclui somente as colunas novas criadas pelas migrations desta atualização.
export const SNAPSHOT_SQL = `
WITH linhas AS (
 SELECT 'produtos' AS tabela, (to_jsonb(p)-'controla_variacoes')::text AS linha FROM public.produtos p
 UNION ALL
 SELECT 'pedidos', (to_jsonb(p)-'usa_reservas_estoque'-'pagamento_revisao')::text FROM public.pedidos p
 UNION ALL
 SELECT 'itens_pedido', (to_jsonb(i)-'variacao_id'-'nome_variacao'-'sku_variacao')::text FROM public.itens_pedido i
), nomes AS (SELECT unnest(ARRAY['produtos','pedidos','itens_pedido']) AS tabela)
SELECT n.tabela, count(l.linha),
 encode(sha256(convert_to(coalesce(string_agg(l.linha,E'\\n' ORDER BY l.linha COLLATE "C"),''),'UTF8')),'hex')
FROM nomes n LEFT JOIN linhas l ON l.tabela=n.tabela
GROUP BY n.tabela ORDER BY n.tabela COLLATE "C";
`;

export const CHECK_SQL = `
DO $karen_check$ BEGIN
 IF EXISTS (SELECT 1 FROM public.produtos WHERE controla_variacoes) THEN
   RAISE EXCEPTION 'Conversão automática de produto encontrada.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.pedidos WHERE usa_reservas_estoque OR pagamento_revisao) THEN
   RAISE EXCEPTION 'Pedido anterior marcado para processamento automático.';
 END IF;
 IF EXISTS (SELECT 1 FROM public.reservas_estoque) THEN
   RAISE EXCEPTION 'Reserva criada para pedido anterior.';
 END IF;
 IF has_function_privilege('anon','public.criar_pedido_reservado(jsonb,jsonb)','execute')
    OR has_function_privilege('authenticated','public.processar_pagamento_reservado(uuid,text,text,numeric)','execute') THEN
   RAISE EXCEPTION 'Uma função privada está exposta a clientes.';
 END IF;
 IF NOT has_function_privilege('service_role','public.criar_pedido_reservado(jsonb,jsonb)','execute') THEN
   RAISE EXCEPTION 'A função de checkout não está disponível ao servidor.';
 END IF;
END $karen_check$;
SELECT json_build_object(
 'produtos', (SELECT count(*) FROM public.produtos),
 'pedidos', (SELECT count(*) FROM public.pedidos),
 'itens_pedido', (SELECT count(*) FROM public.itens_pedido),
 'pedidos_teste', (SELECT count(*) FROM public.pedidos WHERE pedido_teste IS TRUE),
 'novas_reservas', (SELECT count(*) FROM public.reservas_estoque)
);
`;

function executar(args, { log, input, timeout = 240000 } = {}) {
  const r = spawnSync('docker', args, { encoding: 'utf8', input, timeout, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
  if (log) fs.writeFileSync(log, `${r.stdout || ''}\n${r.stderr || ''}`, { mode: 0o600 });
  if (r.error || r.status !== 0) {
    const erros = new Set((`${r.stdout || ''}\n${r.stderr || ''}`).match(/(?:ERROR|FATAL):\s+[0-9A-Z]{5}\b/g) || []);
    throw new Error(`Etapa local não concluída${erros.size ? ': '+[...erros].join(', ') : ''}.`);
  }
  return r.stdout || '';
}

export async function main(args = process.argv.slice(2)) {
  if (process.platform !== 'linux') throw new Error('Execute este arquivo no terminal Linux do Codespaces.');
  const opt = nome => { const i = args.indexOf(nome); return i < 0 ? undefined : args[i + 1]; };
  const backup = fs.realpathSync(opt('--backup') || '/workspaces/karen-backup-banco-C18nH3');
  const projeto = fs.realpathSync(opt('--projeto') || '/workspaces/karen-beauty-shop');
  const migrations = fs.realpathSync(path.join(projeto, 'supabase/migrations'));
  const parent = fs.realpathSync('/workspaces');
  for (const dir of [backup, projeto, migrations]) {
    if (dir.includes(',') || dir.includes('\n')) throw new Error('Caminho de trabalho inesperado.');
  }
  verificarBackup(backup);
  for (const [nome, hash] of Object.entries(MIGRATIONS)) {
    if (digest(fs.readFileSync(path.join(migrations, nome))) !== hash) throw new Error(`A migration ${nome} difere da versão revisada. Nenhuma migration foi executada.`);
  }
  console.log('1/6 — Integridade do backup e versões das migrations conferidas.');
  executar(['image', 'inspect', IMAGE]); // Usa apenas a imagem já baixada; não faz pull.
  const work = fs.mkdtempSync(path.join(parent, 'karen-validacao-local-'));
  fs.chmodSync(work, 0o700);
  const token = crypto.randomBytes(6).toString('hex');
  const container = `karen-validacao-${token}`;
  const admin = `karen_admin_${token}`;
  const localPassword = crypto.randomBytes(32).toString('hex');
  const banco = 'karen_copia_teste';
  const write = (nome, conteudo) => fs.writeFileSync(path.join(work, nome), conteudo, { mode: 0o600 });
  write('roles-compativeis.sql', prepararRoles(fs.readFileSync(path.join(backup, 'roles.sql'), 'utf8')));
  write('preparar-local.sql', `CREATE ROLE "${admin}" LOGIN SUPERUSER PASSWORD '${localPassword}';\n`);
  write('snapshot.sql', SNAPSHOT_SQL);
  write('conferir.sql', CHECK_SQL);
  let iniciado = false;
  let etapa = 'inicialização local';
  let aprovado = false;
  const psql = (db, sqlArgs, nomeLog) => executar([
    'exec', '--user', '0:0', container, 'psql', '-X', '-w', '-h', '127.0.0.1', '-p', '5432', '-U', admin, '-d', db,
    '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', ...sqlArgs,
  ], { log: path.join(work, nomeLog) });
  try {
    executar([
      'run', '--detach', '--rm', '--pull=never', '--user', '0:0', '--name', container, '--network', 'none',
      '--mount', `type=bind,source=${backup},target=/backup,readonly`,
      '--mount', `type=bind,source=${work},target=/validacao,readonly`,
      '--mount', `type=bind,source=${migrations},target=/migrations,readonly`,
      '-e', `POSTGRES_PASSWORD=${localPassword}`, '-e', `PGPASSWORD=${localPassword}`,
      '-e', 'POSTGRES_DB=postgres', '-e', 'PGDATABASE=postgres',
      '-e', 'POSTGRES_HOST=/var/run/postgresql', '-e', 'PGPORT=5432', '-e', 'POSTGRES_PORT=5432', '-e', 'JWT_EXP=3600',
      IMAGE, 'postgres', '-c', 'config_file=/etc/postgresql/postgresql.conf',
      '-c', 'listen_addresses=127.0.0.1', '-c', 'shared_preload_libraries=pg_stat_statements',
      '-c', 'log_min_messages=warning', '-c', 'log_statement=none',
    ], { log: path.join(work, 'inicializacao.log') });
    iniciado = true;
    const modo = executar(['inspect', '--format', '{{.HostConfig.NetworkMode}}', container]).trim();
    if (modo !== 'none') throw new Error('A cópia não ficou isolada da rede.');
    let pronto = false;
    for (let i = 0; i < 60; i++) {
      const r = spawnSync('docker', ['exec', '--user', '0:0', container, 'pg_isready', '-q', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      if (r.status === 0) { pronto = true; break; }
      await new Promise(r => setTimeout(r, 2000));
    }
    if (!pronto) throw new Error('O PostgreSQL local não iniciou no prazo esperado.');
    executar(['exec', '--user', '0:0', container, 'psql', '-X', '-w', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=sqlstate', '-f', '/validacao/preparar-local.sql'],
      { log: path.join(work, 'administrador-local.log') });
    console.log('2/6 — Banco temporário iniciado sem rede e sem portas públicas.');
    etapa = 'restauração dos papéis na cópia';
    psql('postgres', ['-f', '/validacao/roles-compativeis.sql'], 'roles.log');
    psql('postgres', ['-c', `CREATE DATABASE "${banco}" OWNER "${admin}" TEMPLATE template0;`], 'criar-banco.log');
    etapa = 'restauração do arquivo banco.dump';
    executar(['exec', '--user', '0:0', container, 'pg_restore', '--exit-on-error', '--clean', '--if-exists', '--no-owner',
      '--host=127.0.0.1', '--port=5432', `--username=${admin}`, `--dbname=${banco}`, '/backup/banco.dump'],
      { log: path.join(work, 'restauracao.log') });
    console.log('3/6 — Backup restaurado na cópia local.');
    etapa = 'conferência anterior às migrations';
    const antes = psql(banco, ['-A', '-t', '-F', '|', '-f', '/validacao/snapshot.sql'], 'dados-antes.log').trim();
    write('dados-antes.txt', antes+'\n');
    etapa = 'aplicação das migrations na cópia';
    for (const nome of Object.keys(MIGRATIONS)) psql(banco, ['-f', `/migrations/${nome}`], `${nome}.log`);
    console.log('4/6 — As duas migrations foram aplicadas apenas na cópia.');
    const depois = psql(banco, ['-A', '-t', '-F', '|', '-f', '/validacao/snapshot.sql'], 'dados-depois.log').trim();
    write('dados-depois.txt', depois+'\n');
    etapa = 'comparação dos dados';
    if (antes !== depois) throw new Error('Os dados originais diferem após as migrations na cópia.');
    const resumo = psql(banco, ['-A', '-t', '-f', '/validacao/conferir.sql'], 'conferencia.log');
    const linha = resumo.split(/\r?\n/).find(l => l.startsWith('{'));
    const contagens = linha ? JSON.parse(linha) : null;
    console.log('5/6 — Estoques, pedidos, itens e flags de teste preservados; permissões das novas funções conferidas.');
    write('RESULTADO.json', JSON.stringify({ aprovado: true, bancoRemotoAcessado: false, backup, migrations: MIGRATIONS, contagens }, null, 2)+'\n');
    aprovado = true;
    console.log('Contagens da cópia:', JSON.stringify(contagens));
  } catch (erro) {
    write('RESULTADO.json', JSON.stringify({ aprovado: false, etapa, bancoRemotoAcessado: false }, null, 2)+'\n');
    console.error(`VALIDAÇÃO INTERROMPIDA — etapa: ${etapa}. ${erro.message}`);
    console.error('Nenhuma migration foi enviada ao banco da loja.');
    process.exitCode = 1;
  } finally {
    if (iniciado) {
      const logs = spawnSync('docker', ['logs', container], { encoding: 'utf8', timeout: 10000, maxBuffer: 16*1024*1024, windowsHide: true });
      write('postgres-local.log', `${logs.stdout || ''}\n${logs.stderr || ''}`);
      // Remove somente o container descartável de nome aleatório criado por esta execução.
      const fim = spawnSync('docker', ['rm', '--force', '--volumes', container], { encoding: 'utf8', timeout: 30000, windowsHide: true });
      if (fim.status !== 0) { console.error('O container temporário precisa ser removido:', container); process.exitCode = 1; }
      else console.log('6/6 — Container temporário removido. Backup original preservado.');
    }
    console.log('Relatório e logs privados:', work);
    console.log('Compartilhe somente RESULTADO.json ou o resumo do terminal; os logs podem conter dados privados.');
    if (aprovado && !process.exitCode) console.log('VALIDAÇÃO APROVADA. A implantação no Supabase real continua pendente.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(erro => { console.error(erro.message); process.exitCode = 1; });
}

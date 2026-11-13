import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const origem = path.dirname(fileURLToPath(import.meta.url));
const target = fs.realpathSync(process.argv[2] || process.cwd());
const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
if (pkg.name !== 'karen-beauty-shop') throw new Error('Selecione a pasta do projeto Karen Beauty Shop.');
const manifest = JSON.parse(fs.readFileSync(path.join(origem, 'patch-manifest.json'), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const pendentes = [];
for (const item of manifest.files) {
  if (item.path.split('/').some(p => p === '..' || p === '.git' || p.startsWith('.env'))) throw new Error('Caminho inválido no pacote.');
  const destino = path.resolve(target, item.path);
  if (!destino.startsWith(target + path.sep)) throw new Error('Destino fora do projeto.');
  const content = fs.readFileSync(path.join(origem, 'patch', item.path));
  if (hash(content) !== item.sha256) throw new Error('Pacote com integridade inválida: ' + item.path);
  const exists = fs.existsSync(destino);
  if (exists && fs.lstatSync(destino).isSymbolicLink()) throw new Error('Arquivo simbólico exige revisão: ' + item.path);
  const current = exists ? fs.readFileSync(destino) : null;
  if (current && hash(current) === item.sha256) continue;
  if ((current ? hash(current) : null) !== item.previousSha256) {
    throw new Error('Arquivo diferente da entrega anterior: ' + item.path + '. Nada foi alterado. Preserve suas mudanças e faça uma comparação antes de atualizar.');
  }
  pendentes.push({ destino, content, current, relative: item.path });
}
if (!pendentes.length) { console.log('A atualização já está instalada.'); process.exit(0); }
const backup = fs.mkdtempSync(path.join(path.dirname(target), 'backup-interface-v2-'));
for (const file of pendentes) {
  if (file.current) {
    const dest = path.join(backup, file.relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, file.current);
  }
}
fs.writeFileSync(path.join(backup,'alteracoes.json'), JSON.stringify(pendentes.map(f=>({arquivo:f.relative,existia:!!f.current})), null, 2));
try {
  for (const file of pendentes) {
    fs.mkdirSync(path.dirname(file.destino), { recursive: true });
    fs.writeFileSync(file.destino, file.content);
    if (hash(fs.readFileSync(file.destino)) !== hash(file.content)) throw new Error('Falha na gravação de ' + file.relative);
  }
} catch (error) {
  for (const file of pendentes) {
    if (file.current) fs.writeFileSync(file.destino, file.current);
    else if (fs.existsSync(file.destino)) fs.unlinkSync(file.destino);
  }
  throw error;
}
console.log(`Atualizados ${pendentes.length} arquivos.`);
console.log(`Backup dos arquivos anteriores: ${backup}`);
console.log('Configurações e credenciais preservadas. Nenhuma migration aplicada; nenhum banco alterado.');
console.log('Execute npm test e npm run build nesta pasta; depois reinicie a API e o site.');

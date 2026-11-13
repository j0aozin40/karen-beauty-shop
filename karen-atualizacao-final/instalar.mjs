import fs from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'

const project=process.cwd()
const patch=path.dirname(fileURLToPath(import.meta.url))
const manifest=JSON.parse(await fs.readFile(path.join(patch,'manifest.json'),'utf8'))
const hash=(bytes,text)=>createHash('sha256').update(text?bytes.toString('utf8').replace(/\r\n/g,'\n'):bytes).digest('hex')
const changes=[]
// Confere o conjunto inteiro antes de gravar qualquer arquivo.
for(const item of manifest){
  if(path.isAbsolute(item.file)||item.file.split('/').some(part=>part==='..'||part===''))throw Error('Caminho inválido no pacote.')
  let current=project
  for(const part of item.file.split('/')){
    current=path.join(current,part)
    try{if((await fs.lstat(current)).isSymbolicLink())throw Error('Link simbólico não permitido: '+item.file)}catch(error){if(error.code!=='ENOENT')throw error}
  }
  const contents=await fs.readFile(path.join(patch,'files',item.file))
  if(hash(contents,item.text)!==item.after)throw Error('Arquivo do pacote divergente: '+item.file)
  let previous=null
  try{previous=await fs.readFile(path.join(project,item.file))}catch(error){if(error.code!=='ENOENT')throw error}
  const currentHash=previous===null?null:hash(previous,item.text)
  if(currentHash===item.after)continue
  if(currentHash!==item.before){
    console.error('Atualização interrompida: '+item.file+' mudou desde o ZIP enviado. Nenhum arquivo alterado. Envie a versão atual para adaptar.')
    process.exit(1)
  }
  changes.push({...item,contents,previous})
}
// Preserva as regras existentes e acrescenta apenas exclusões necessárias.
let gitignore=null
try {
  if((await fs.lstat(path.join(project,'.gitignore'))).isSymbolicLink())throw Error('.gitignore não pode ser link simbólico.')
  gitignore=await fs.readFile(path.join(project,'.gitignore'))
} catch(error) {if(error.code!=='ENOENT')throw error}
const ignoreText=gitignore?.toString('utf8') || ''
const missing=['.env.local','.homologacao-backups/'].filter(rule=>!ignoreText.split(/\r?\n/).includes(rule))
if(missing.length)changes.push({file:'.gitignore',previous:gitignore,contents:Buffer.from(ignoreText+(ignoreText&&!ignoreText.endsWith('\n')?'\n':'')+missing.join('\n')+'\n')})
if(!changes.length){console.log('Atualização já instalada. Nenhum arquivo alterado.');process.exit(0)}
const backup=path.join(project,'.homologacao-backups','revisao-final-'+Date.now())
for(const item of changes){
  if(item.previous===null)continue
  const destination=path.join(backup,item.file)
  await fs.mkdir(path.dirname(destination),{recursive:true})
  await fs.writeFile(destination,item.previous,{flag:'wx'})
}
const written=[]
try{
  for(const item of changes){
    const destination=path.join(project,item.file)
    await fs.mkdir(path.dirname(destination),{recursive:true})
    written.push(item)
    await fs.writeFile(destination,item.contents)
  }
}catch(error){
  for(const item of written.reverse()){
    const destination=path.join(project,item.file)
    if(item.previous===null)await fs.unlink(destination).catch(()=>{})
    else await fs.writeFile(destination,item.previous)
  }
  throw error
}
console.log('Atualização instalada: '+changes.length+' arquivos. Backup: '+path.relative(project,backup))
console.log('Nenhum .env.local, banco, dependência ou serviço remoto foi alterado.')
console.log('Execute npm test e npm run build antes de reiniciar os servidores.')

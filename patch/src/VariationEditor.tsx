import { useCallback, useEffect, useRef, useState } from 'react'
import { variationColor, variationTypes } from './variationTypes'

type Draft = { id?: string; atualizado_em?: string; tipo: string; nome: string; sku: string; estoque: number; preco: string | number; preco_promocional: string | number; imagem: string; ativo: boolean }
const novo = (): Draft => ({ tipo: 'cor', nome: '', sku: '', estoque: 0, preco: '', preco_promocional: '', imagem: '', ativo: true })
const currency = (n: string | number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function VariationEditor({ produtoId, convertido, estoqueOriginal, onUpdate, onEditingChange, onBusyChange }: { produtoId: number; convertido: boolean; estoqueOriginal: number; onEditingChange: (editing: boolean) => void; onBusyChange: (busy: boolean) => void; onUpdate: (convertido: boolean) => Promise<void> }) {
  const [lista, setLista] = useState<Draft[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [erro, setErro] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [carregado, setCarregado] = useState(false)
  const [estoqueInicial, setEstoqueInicial] = useState(0)
  const editor = useRef<HTMLFormElement>(null)
  const total = lista.reduce((s, v) => s + Number(v.estoque), 0)
  const meta = variationTypes[draft?.tipo || 'cor'] || variationTypes.outro
  const podeAtivar = carregado && lista.length > 0 && total === estoqueOriginal && lista.every(v => v.ativo) && !draft

  const carregar = useCallback(async () => {
    const r = await fetch('/api/admin/produtos', { cache: 'no-store' })
    const dados = await r.json()
    if (!r.ok) throw new Error(dados.erro || 'Não foi possível carregar as variações.')
    const p = dados.produtos.find((p: { id: number }) => p.id === produtoId)
    if (!p) throw new Error('Produto não encontrado. Feche e atualize a lista de produtos.')
    setLista((p.produto_variacoes || []).map((v: Draft) => ({ ...v, sku: v.sku || '', imagem: v.imagem || '', preco: v.preco ?? '', preco_promocional: v.preco_promocional ?? '' })))
    setCarregado(true)
  }, [produtoId])
  useEffect(() => { void carregar().catch(e => { setMensagem(e.message); setErro(true) }) }, [carregar])

  useEffect(() => { onEditingChange(!!draft) }, [draft, onEditingChange])
  useEffect(() => { onBusyChange(ocupado) }, [ocupado, onBusyChange])

  function editar(v?: Draft) {
    setDraft(v ? { ...v } : novo()); setEstoqueInicial(v?.estoque || 0); setMensagem(''); setErro(false)
    requestAnimationFrame(() => { editor.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }); editor.current?.querySelector<HTMLInputElement>('input[name="variation-name"]')?.focus({ preventScroll: true }) })
  }

  async function executar(path: string, method: string, body?: unknown, sucesso = 'Variação salva.') {
    if (ocupado) return
    setOcupado(true); setMensagem(''); setErro(false)
    let gravou = false
    try {
      const r = await fetch(`/api/admin/produtos/${produtoId}/${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
      const dados = await r.json()
      if (!r.ok) throw new Error(dados.erro || 'Não foi possível concluir a ação.')
      gravou = true; setDraft(null)
      await carregar(); await onUpdate(path === 'converter-variacoes' || convertido)
      setMensagem(sucesso)
    } catch (e) {
      setMensagem((gravou ? 'A alteração foi salva, mas a atualização da tela falhou. Clique em Atualizar lista. ' : '') + (e instanceof Error ? e.message : 'Erro ao salvar.')); setErro(true)
    } finally { setOcupado(false) }
  }

  function salvar() {
    if (!draft) return
    if (!draft.nome.trim() || !Number.isSafeInteger(draft.estoque) || draft.estoque < 0) { setMensagem('Informe o nome e um estoque inteiro igual ou maior que zero.'); setErro(true); return }
    void executar('variacoes', 'POST', { ...draft, estoque: draft.id && draft.estoque === estoqueInicial ? undefined : draft.estoque })
  }

  return <div className="variations-workspace" aria-busy={ocupado}>
    <div className="variation-section-heading"><div><span className="editor-eyebrow">OPÇÕES DE COMPRA</span><h3>Variações do produto</h3><p>Cada opção tem seu próprio estoque, preço e situação.</p></div><button type="button" className="admin-action primary" disabled={ocupado || !carregado || !!draft} onClick={() => editar()}><span aria-hidden="true">＋</span> Nova variação</button></div>

    <section className={`variation-publication ${convertido ? 'published' : ''}`} aria-label="Publicação das variações">
      <div><span className={`variation-badge ${convertido ? 'active' : 'draft'}`}>{convertido ? 'Disponíveis no catálogo' : 'Rascunho · ainda não aparecem na loja'}</span><h4>{convertido ? 'Estoque controlado por opção' : 'Falta ativar as variações no catálogo'}</h4><p>{convertido ? 'As opções ativas aparecem no produto. Desativar preserva o estoque e o histórico.' : 'Cadastrar uma opção não converte o produto automaticamente. Distribua o estoque existente e ative as opções abaixo para que o cliente possa escolher.'}</p></div>
      <div className="variation-metrics"><div><strong>{total}</strong><span>nas variações</span></div>{!convertido && <><div><strong>{estoqueOriginal}</strong><span>estoque original</span></div><div><strong>{estoqueOriginal - total}</strong><span>diferença</span></div></>}</div>
      {!convertido && <><button type="button" className="admin-action primary" disabled={ocupado || !podeAtivar} onClick={() => void executar('converter-variacoes', 'POST', {}, 'Variações ativadas no catálogo. Atualize a página do produto.')}><span aria-hidden="true">✓</span> Ativar variações no catálogo</button><small>{draft ? 'Salve ou cancele a edição em andamento antes de ativar.' : !lista.length ? 'Adicione pelo menos uma opção.' : total !== estoqueOriginal ? 'A soma precisa ser igual ao estoque original. Nenhuma quantidade será distribuída automaticamente.' : lista.some(v => !v.ativo) ? 'Todas as opções devem estar ativas para a primeira conversão.' : 'Estoque conferido. O servidor também verifica os pedidos e reservas antes de converter.'}</small></>}
    </section>

    <div className="variation-list-heading"><strong>{lista.length} {lista.length === 1 ? 'opção cadastrada' : 'opções cadastradas'}</strong><button type="button" className="admin-action subtle" disabled={ocupado || !!draft} onClick={() => { setErro(false); void carregar().then(() => onUpdate(convertido)).then(() => setMensagem('Lista atualizada.')).catch(e => { setMensagem(e.message); setErro(true) }) }}>↻ Atualizar lista</button></div>
    {!carregado && !erro && <p role="status">Carregando variações…</p>}
    {carregado && !lista.length && <div className="variation-empty"><span aria-hidden="true">◇</span><h4>Crie a primeira opção</h4><p>Adicione cores, tamanhos, fragrâncias ou kits para este produto.</p></div>}
    <ul className="variation-list">{lista.map(v => <li key={v.id} className={draft?.id === v.id ? 'editing' : ''}>
      <div className="variation-card-main">{v.imagem ? <img src={v.imagem} alt={v.nome} /> : <span className="variation-thumbnail" style={v.tipo === 'cor' && variationColor(v.nome) ? { background: variationColor(v.nome) } : undefined} aria-hidden="true">{v.tipo === 'cor' && variationColor(v.nome) ? '' : (variationTypes[v.tipo]?.label || 'Opção').slice(0, 1)}</span>}<div><span className="variation-kind">{variationTypes[v.tipo]?.label || v.tipo}</span><strong>{v.nome}</strong><small>SKU: {v.sku || 'Não informado'}</small></div><span className={`variation-badge ${v.ativo ? 'active' : 'inactive'}`}>{v.ativo ? 'Ativa' : 'Inativa'}</span></div>
      <div className="variation-card-details"><span><b>{v.estoque}</b> unidades</span><span>{v.preco === '' ? 'Preço do produto' : currency(v.preco_promocional !== '' ? v.preco_promocional : v.preco)}</span></div>
      <div className="variation-row-actions"><button type="button" className="admin-action secondary" disabled={ocupado || !!draft} onClick={() => editar(v)}>✎ Editar</button><button type="button" className="admin-action secondary" disabled={ocupado || !!draft} onClick={() => void executar('variacoes', 'POST', { ...v, ativo: !v.ativo, estoque: undefined }, v.ativo ? 'Variação desativada. Estoque preservado.' : 'Variação ativada.')}>{v.ativo ? '⏸ Desativar' : '▶ Ativar'}</button><button type="button" className="admin-action danger" disabled={ocupado || !!draft} onClick={() => { if (window.confirm(`Excluir a variação “${v.nome}”? Se houver estoque convertido ou histórico, a exclusão será bloqueada. Você pode desativá-la para preservar os registros.`)) void executar(`variacoes/${v.id}`, 'DELETE', { atualizado_em: v.atualizado_em }, 'Variação excluída.') }}>Excluir</button></div>
    </li>)}</ul>

    {draft && <form ref={editor} className="variation-edit-form" onSubmit={e => { e.preventDefault(); salvar() }}>
      <div className="variation-edit-toolbar"><div><span className="editor-eyebrow">{draft.id ? 'EDITANDO OPÇÃO' : 'NOVA OPÇÃO'}</span><h4>{draft.id ? draft.nome || 'Editar variação' : 'Adicionar variação'}</h4></div><div><button type="button" className="admin-action secondary" disabled={ocupado} onClick={() => setDraft(null)}>Cancelar edição</button><button type="submit" className="admin-action primary" disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar variação'}</button></div></div>
      <fieldset disabled={ocupado} className="variation-form-fields"><div className="variation-fields">
        <label>Tipo de variação<select aria-label="Tipo de variação" value={draft.tipo} onChange={e => setDraft({ ...draft, tipo: e.target.value })}>{Object.entries(variationTypes).map(([value, t]) => <option key={value} value={value}>{t.label}</option>)}</select></label>
        <label>{meta.field}<input aria-label={meta.field} name="variation-name" value={draft.nome} required maxLength={120} placeholder={meta.placeholder} onChange={e => setDraft({ ...draft, nome: e.target.value })} /></label>
        {meta.examples.length > 0 && <div className="variation-suggestions"><span>Sugestões de {meta.label.toLocaleLowerCase('pt-BR')}:</span>{meta.examples.map(example => <button className="variation-suggestion" type="button" key={example} onClick={() => setDraft({ ...draft, nome: example })}>{draft.tipo === 'cor' && <span className="variation-color-dot" style={{ background: variationColor(example) }} />}{example}</button>)}</div>}
        <label>SKU<input value={draft.sku} maxLength={100} placeholder="Código interno da opção" onChange={e => setDraft({ ...draft, sku: e.target.value })} /></label>
        <label>Estoque individual<input type="number" required min="0" step="1" value={draft.estoque} onChange={e => setDraft({ ...draft, estoque: Number(e.target.value) })} /></label>
        <label>Preço da opção<input type="number" min="0" step="0.01" value={draft.preco} placeholder="Vazio = preço do produto" onChange={e => setDraft({ ...draft, preco: e.target.value })} /><small>Deixe vazio para herdar o preço do produto.</small></label>
        <label>Preço promocional<input type="number" min="0" step="0.01" value={draft.preco_promocional} onChange={e => setDraft({ ...draft, preco_promocional: e.target.value })} /></label>
        <label>Foto desta opção (URL HTTPS)<input type="url" value={draft.imagem} placeholder="https://…" onChange={e => setDraft({ ...draft, imagem: e.target.value })} /></label>
        <label className="variation-active"><input type="checkbox" checked={draft.ativo} onChange={e => setDraft({ ...draft, ativo: e.target.checked })} /><span>Variação ativa<small>Visível após ativar o controle por variações.</small></span></label>
      </div></fieldset>
      <p className="editor-note">“Salvar variação” salva esta opção. “Salvar dados do produto” salva os campos das outras abas.</p>
    </form>}
    {mensagem && <p className={`variation-feedback ${erro ? 'error' : 'success'}`} role={erro ? 'alert' : 'status'}>{mensagem}</p>}
  </div>
}

import { useCallback, useEffect, useState } from 'react'

type Draft = { id?: string; tipo: string; nome: string; sku: string; estoque: number; preco: string | number; preco_promocional: string | number; imagem: string; ativo: boolean }
const novo = (): Draft => ({ tipo: 'cor', nome: '', sku: '', estoque: 0, preco: '', preco_promocional: '', imagem: '', ativo: true })

export default function VariationEditor({ produtoId, convertido, onUpdate }: { produtoId: number; convertido: boolean; onUpdate: (convertido: boolean) => Promise<void> }) {
  const [lista, setLista] = useState<Draft[]>([])
  const [draft, setDraft] = useState<Draft>(novo)
  const [mensagem, setMensagem] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const carregar = useCallback(async () => {
    const r = await fetch('/api/admin/produtos')
    const dados = await r.json()
    if (!r.ok) throw new Error(dados.erro || 'Não foi possível carregar as variações.')
    setLista((dados.produtos.find((p: { id: number }) => p.id === produtoId)?.produto_variacoes || []).map((v: Draft) => ({ ...v, sku: v.sku || '', imagem: v.imagem || '', preco: v.preco ?? '', preco_promocional: v.preco_promocional ?? '' })))
  }, [produtoId])
  useEffect(() => { void carregar().catch(e => setMensagem(e.message)) }, [carregar])
  async function executar(converter = false) {
    setOcupado(true); setMensagem('')
    try {
      const r = await fetch(`/api/admin/produtos/${produtoId}/${converter ? 'converter-variacoes' : 'variacoes'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(converter ? {} : draft),
      })
      const dados = await r.json()
      if (!r.ok) throw new Error(dados.erro || 'Não foi possível salvar.')
      setDraft(novo()); await carregar(); await onUpdate(converter || convertido); setMensagem('Alteração salva.')
    } catch (e) { setMensagem(e instanceof Error ? e.message : 'Erro ao salvar.') } finally { setOcupado(false) }
  }
  return <fieldset style={{ marginTop: 24, padding: 16 }} disabled={ocupado}>
    <legend>Variações do produto</legend>
    <p>{convertido ? 'O estoque geral é a soma das variações. Desative uma opção para ocultá-la da loja.' : 'Cadastre as opções e distribua o estoque atual. Depois converta o produto; o total deve ser preservado e não pode haver pedidos aguardando pagamento.'}</p>
    <ul>{lista.map(v => <li key={v.id}>{v.nome} · {v.estoque} unidades · {v.ativo ? 'ativa' : 'inativa'} <button type="button" onClick={() => setDraft(v)}>Editar</button></li>)}</ul>
    <div className="variation-fields">
      <label>Tipo<select value={draft.tipo} onChange={e => setDraft({ ...draft, tipo: e.target.value })}>{['cor','tamanho','fragrancia','acabamento','kit','outro'].map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Nome<input value={draft.nome} maxLength={120} onChange={e => setDraft({ ...draft, nome: e.target.value })} /></label>
      <label>SKU<input value={draft.sku} onChange={e => setDraft({ ...draft, sku: e.target.value })} /></label>
      <label>Estoque<input type="number" min="0" step="1" value={draft.estoque} onChange={e => setDraft({ ...draft, estoque: Number(e.target.value) })} /></label>
      <label>Preço (vazio usa o produto)<input type="number" min="0" step="0.01" value={draft.preco} onChange={e => setDraft({ ...draft, preco: e.target.value })} /></label>
      <label>Preço promocional<input type="number" min="0" step="0.01" value={draft.preco_promocional} onChange={e => setDraft({ ...draft, preco_promocional: e.target.value })} /></label>
      <label>URL da imagem (HTTPS)<input type="url" value={draft.imagem} onChange={e => setDraft({ ...draft, imagem: e.target.value })} /></label>
      <label><input type="checkbox" checked={draft.ativo} onChange={e => setDraft({ ...draft, ativo: e.target.checked })} /> Variação ativa</label>
    </div>
    <p><button type="button" onClick={() => executar()}>{draft.id ? 'Salvar variação' : 'Adicionar variação'}</button> <button type="button" onClick={() => setDraft(novo())}>Limpar edição</button></p>
    {!convertido && <button type="button" onClick={() => executar(true)}>Converter preservando estoque total</button>}
    <p role="status">{mensagem}</p>
  </fieldset>
}

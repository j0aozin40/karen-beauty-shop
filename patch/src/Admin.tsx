import ProductDialog from './ProductDialog'
import './Admin.css'
import VariationEditor from './VariationEditor'
import { useEffect, useMemo, useState } from 'react'

type Pedido = {
  id: string
  numero_pedido: number
  nome: string
  whatsapp: string
  total: number
  status: string
  pagamento_revisao?: boolean
  pedido_teste?: boolean
  criado_em: string
}

type Dashboard = {
  resumo: {
    quantidadePedidos: number
    valorTotal: number
    pedidosAguardando: number
    pedidosConcluidos: number
  }
  pedidosRecentes: Pedido[]
}

type Produto = {
  id: number
  nome: string
  categoria: string
  preco: number
  descricao?: string
  emoji?: string
  controla_variacoes?: boolean
  estoque: number
  atualizado_em?: string
  ativo: boolean
  imagem?: string | null
  custo_aquisicao?: number | null
  custo_adicional?: number | null
  taxa_mp_percentual?: number | null
  taxas_adicionais_percentual?: number | null
  margem_desejada_percentual?: number | null
}

type Categoria = { id: string; nome: string }

const dinheiro = (valor: number) => Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const rosa = '#b76e86'
const fundo = '#fff7fa'
const card: React.CSSProperties = { background: '#fff', borderRadius: 14, padding: 22, boxShadow: '0 3px 15px #00000008' }
const botao: React.CSSProperties = { border: 0, borderRadius: 10, padding: '11px 17px', background: 'linear-gradient(135deg, #a64f73, #bd7893)', color: '#fff', cursor: 'pointer', fontWeight: 700, boxShadow: '0 3px 9px #a64f731c' }
const campo: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: 11, border: '1px solid #e7d5dc', borderRadius: 8, background: '#fff', marginTop: 5 }
const produtoNovo = (categoria: string): Produto => ({ id: 0, nome: '', categoria, preco: 0, descricao: '', emoji: '🛍️', estoque: 0, ativo: true, imagem: null, custo_aquisicao: 0, custo_adicional: 0, taxa_mp_percentual: 0, taxas_adicionais_percentual: 0, margem_desejada_percentual: 30 })

function calcularPreco(produto: Produto) {
  const custo = Number(produto.custo_aquisicao || 0) + Number(produto.custo_adicional || 0)
  const taxaMp = Number(produto.taxa_mp_percentual || 0)
  const outrasTaxas = Number(produto.taxas_adicionais_percentual || 0)
  const margem = Number(produto.margem_desejada_percentual ?? 30)
  const divisor = 1 - (taxaMp + outrasTaxas + margem) / 100
  const sugerido = divisor > 0 ? custo / divisor : null
  const lucro = Number(produto.preco || 0) * (1 - (taxaMp + outrasTaxas) / 100) - custo
  const margemReal = Number(produto.preco || 0) > 0 ? lucro / Number(produto.preco) * 100 : 0
  return { custo, sugerido, lucro, margemReal, taxasValidas: taxaMp + outrasTaxas + margem < 100 }
}

export default function Admin() {
  const [senha, setSenha] = useState('')
  const [autenticado, setAutenticado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [pagina, setPagina] = useState<'inicio' | 'produtos' | 'categorias' | 'pedidos' | 'pedidos-teste'>('inicio')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [pedidosTeste, setPedidosTeste] = useState<Pedido[]>([])
  const [carregandoTestes, setCarregandoTestes] = useState(false)
  const [pedidoSelecionado, setPedidoSelecionado] = useState<any>(null)
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [carregandoProdutos, setCarregandoProdutos] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null)
  const [salvandoProduto, setSalvandoProduto] = useState(false)
  const [variacaoEditando, setVariacaoEditando] = useState(false)
  const [variacaoOcupada, setVariacaoOcupada] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('Todas')
  const [filtroStatus, setFiltroStatus] = useState('todos')
  const [categoriasSalvas, setCategoriasSalvas] = useState<Categoria[]>([])
  const [novaCategoria, setNovaCategoria] = useState('')
  const [abaProduto, setAbaProduto] = useState('Geral')
  const [estoqueOriginal, setEstoqueOriginal] = useState(0)
  const [foto, setFoto] = useState<File | null>(null)

  async function carregarDashboard() {
    const resposta = await fetch('/api/admin/dashboard', { credentials: 'same-origin' })
    if (!resposta.ok) throw new Error('Não foi possível carregar os pedidos.')
    setDashboard(await resposta.json())
  }
async function carregarPedidosTeste() {
  try {
    setCarregandoTestes(true)

    const resposta = await fetch('/api/admin/pedidos-teste', {
      credentials: 'same-origin'
    })

    const dados = await resposta.json()

    if (!resposta.ok) {
      throw new Error(dados.erro || 'Erro ao carregar pedidos de teste.')
    }

    setPedidosTeste(dados.pedidos || [])
  } catch (error) {
    alert(error instanceof Error ? error.message : 'Erro ao carregar pedidos de teste.')
  } finally {
    setCarregandoTestes(false)
  }
}

  async function carregarProdutos() {
    try {
      setCarregandoProdutos(true)
      const resposta = await fetch('/api/admin/produtos', { credentials: 'same-origin' })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.erro || 'Erro ao carregar produtos.')
      setProdutos(dados.produtos || [])
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao carregar produtos.')
    } finally {
      setCarregandoProdutos(false)
    }
  }

  async function carregarCategorias() {
    const resposta = await fetch('/api/admin/categorias', { credentials: 'same-origin' })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao carregar categorias.')
    setCategoriasSalvas(dados.categorias || [])
  }

  async function salvarCategoria(nome: string, id?: string) {
    const resposta = await fetch(id ? `/api/admin/categorias/${id}` : '/api/admin/categorias', {
      method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ nome }),
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao salvar categoria.')
    await Promise.all([carregarCategorias(), carregarProdutos()])
  }

  async function excluirCategoria(id: string) {
    const resposta = await fetch(`/api/admin/categorias/${id}`, { method: 'DELETE', credentials: 'same-origin' })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao excluir categoria.')
    await Promise.all([carregarCategorias(), carregarProdutos()])
  }

  async function enviarFoto() {
    if (!produtoEditando || !foto) return
    const resposta = await fetch(`/api/admin/produtos/${produtoEditando.id}/foto`, {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': foto.type }, body: foto,
    })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao enviar foto.')
    setProdutoEditando({ ...produtoEditando, imagem: dados.imagem })
    setFoto(null)
    await carregarProdutos()
  }

  async function excluirFoto() {
    if (!produtoEditando || !window.confirm(`Remover a foto de "${produtoEditando.nome}"?`)) return
    const resposta = await fetch(`/api/admin/produtos/${produtoEditando.id}/foto`, { method: 'DELETE', credentials: 'same-origin' })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao remover foto.')
    setProdutoEditando({ ...produtoEditando, imagem: null })
    await carregarProdutos()
  }

  async function salvarProduto() {
    if (!produtoEditando) return
    const criando = produtoEditando.id === 0
    try {
      setSalvandoProduto(true)
      const resposta = await fetch(criando ? '/api/admin/produtos' : `/api/admin/produtos/${produtoEditando.id}`, {
        method: criando ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({
          ...produtoEditando,
          preco: Number(produtoEditando.preco),
          estoque: criando || Number(produtoEditando.estoque) !== estoqueOriginal ? Number(produtoEditando.estoque) : undefined,
          estoque_original: estoqueOriginal,
          custo_aquisicao: Number(produtoEditando.custo_aquisicao || 0),
          custo_adicional: Number(produtoEditando.custo_adicional || 0),
          taxa_mp_percentual: Number(produtoEditando.taxa_mp_percentual || 0),
          taxas_adicionais_percentual: Number(produtoEditando.taxas_adicionais_percentual || 0),
          margem_desejada_percentual: Number(produtoEditando.margem_desejada_percentual ?? 30),
        }),
      })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.erro || 'Erro ao salvar produto.')
      await carregarProdutos()
      setProdutoEditando(null)
      alert(criando ? 'Produto cadastrado com sucesso!' : 'Produto atualizado com sucesso!')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao salvar produto.')
    } finally {
      setSalvandoProduto(false)
    }
  }

  async function excluirProduto(produto: Produto) {
    if (!window.confirm(`Excluir o produto "${produto.nome}"? Esta ação não pode ser desfeita.`)) return
    const resposta = await fetch(`/api/admin/produtos/${produto.id}`, { method: 'DELETE', credentials: 'same-origin' })
    const dados = await resposta.json()
    if (!resposta.ok) throw new Error(dados.erro || 'Erro ao excluir produto.')
    await carregarProdutos()
    setProdutoEditando(null)
    alert('Produto excluído com sucesso.')
  }

  async function abrirDetalhesPedido(id: string) {
    try {
      const resposta = await fetch(`/api/admin/pedidos/${id}`, { credentials: 'same-origin' })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.erro || 'Erro ao carregar pedido.')
      setPedidoSelecionado(dados.pedido)
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao carregar pedido.')
    }
  }

  async function atualizarStatus(id: string, status: string) {
    try {
      const resposta = await fetch(`/api/admin/pedidos/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ status }),
      })
      const dados = await resposta.json()
      if (!resposta.ok) throw new Error(dados.erro || 'Erro ao atualizar pedido.')
      await carregarDashboard()
      alert('Status do pedido atualizado com sucesso!')
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Erro ao atualizar pedido.')
    }
  }

  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'same-origin' })
      .then(async resposta => {
        if (resposta.ok) {
          setAutenticado(true)
          await carregarDashboard()
        }
      })
      .catch(() => setErro('Não foi possível conectar ao servidor.'))
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => {
  if (autenticado && (pagina === 'produtos' || pagina === 'categorias')) {
    carregarProdutos()
    carregarCategorias().catch(error => alert(error instanceof Error ? error.message : 'Erro ao carregar categorias.'))
  }

  if (autenticado && pagina === 'pedidos-teste') {
    carregarPedidosTeste()
  }
}, [autenticado, pagina])
  async function entrar(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErro('')
    try {
      const resposta = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ senha }),
      })
      const dados = await resposta.json()
      if (!resposta.ok) { setErro(dados.erro || 'Senha incorreta.'); return }
      setAutenticado(true)
      setSenha('')
      await carregarDashboard()
    } catch {
      setErro('Não foi possível conectar ao servidor.')
    }
  }

  async function sair() {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' })
    setAutenticado(false)
    setDashboard(null)
    setPagina('inicio')
  }

  const categorias = useMemo(() => ['Todas', ...categoriasSalvas.map(c => c.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'))], [categoriasSalvas])
  const produtosFiltrados = useMemo(() => produtos.filter(p => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    const combinaBusca = !termo || p.nome.toLocaleLowerCase('pt-BR').includes(termo) || (p.descricao || '').toLocaleLowerCase('pt-BR').includes(termo)
    const combinaCategoria = filtroCategoria === 'Todas' || p.categoria === filtroCategoria
    const combinaStatus = filtroStatus === 'todos' || (filtroStatus === 'ativos' && p.ativo) || (filtroStatus === 'inativos' && !p.ativo) || (filtroStatus === 'estoque' && Number(p.estoque) <= 0)
    return combinaBusca && combinaCategoria && combinaStatus
  }), [produtos, busca, filtroCategoria, filtroStatus])

  if (carregando) return <main style={{ padding: 40 }}>Carregando...</main>

  const nav = [
    { id: 'inicio', label: 'Visão geral', icon: '⌂' },
    { id: 'produtos', label: 'Produtos', icon: '▦' },
    { id: 'categorias', label: 'Categorias', icon: '◇' },
    { id: 'pedidos', label: 'Pedidos', icon: '▤' },
    { id: 'pedidos-teste', label: 'Pedidos de Teste', icon: '🧪' }
  ] as const

  return (
    <main className="admin-panel" style={{ minHeight: '100vh', background: fundo, padding: 24, fontFamily: 'Arial, sans-serif', color: '#49343d' }}>
      <div style={{ maxWidth: 1200, margin: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
          <div><h1 style={{ color: rosa, margin: 0 }}>Karen Beauty Shop</h1><p style={{ margin: '5px 0 0', color: '#8b737c' }}>Painel administrativo</p></div>
          {autenticado && <button onClick={sair} style={botao}>Sair</button>}
        </header>

        {!autenticado ? (
          <section style={{ ...card, maxWidth: 400, margin: '60px auto' }}>
            <h2>Acesso administrativo</h2>
            <form onSubmit={entrar}>
              <input type="password" placeholder="Digite sua senha" value={senha} onChange={e => setSenha(e.target.value)} required style={campo} />
              <button style={{ ...botao, width: '100%', marginTop: 14 }}>Entrar</button>
            </form>
            {erro && <p style={{ color: '#c0392b' }}>{erro}</p>}
          </section>
        ) : (
          <>
            <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, background: '#fff', borderRadius: 12, marginBottom: 24, boxShadow: '0 3px 15px #00000008' }}>
              {nav.map(item => <button key={item.id} onClick={() => { setPagina(item.id); setProdutoEditando(null) }} style={{ ...botao, background: pagina === item.id ? rosa : '#f8edf1', color: pagina === item.id ? '#fff' : '#805565' }}>{item.icon}　{item.label}</button>)}
            </nav>

            {erro && <p style={{ color: '#c0392b' }}>{erro}</p>}

            {pagina === 'inicio' && (
              <>
                <h2>Visão geral</h2>
                {dashboard ? <>
                  <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16 }}>
                    {[
                      ['Valor total dos pedidos', dinheiro(dashboard.resumo.valorTotal)],
                      ['Total de pedidos', dashboard.resumo.quantidadePedidos],
                      ['Aguardando pagamento', dashboard.resumo.pedidosAguardando],
                      ['Pedidos concluídos', dashboard.resumo.pedidosConcluidos],
                    ].map(([titulo, valor]) => <article key={titulo} style={card}><p style={{ color: '#8b737c', marginTop: 0 }}>{titulo}</p><strong style={{ fontSize: 25, color: rosa }}>{valor}</strong></article>)}
                  </section>
                  <section style={{ ...card, marginTop: 24, overflowX: 'auto' }}>
                    <h2>Pedidos recentes</h2>
                    <TabelaPedidos pedidos={dashboard.pedidosRecentes} atualizarStatus={atualizarStatus} abrirDetalhesPedido={abrirDetalhesPedido} />
                    <button onClick={() => setPagina('pedidos')} style={{ ...botao, marginTop: 16 }}>Ver todos os pedidos</button>
                  </section>
                </> : <p>Não foi possível carregar os dados do painel.</p>}
              </>
            )}

            {pagina === 'produtos' && (
              <section style={card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div><h2 style={{ margin: 0 }}>Produtos</h2><p style={{ color: '#8b737c', margin: '6px 0 0' }}>{produtos.length} produtos cadastrados</p></div>
                  <div style={{ display: 'flex', gap: 8 }}><button onClick={() => { setFoto(null); setVariacaoEditando(false); setVariacaoOcupada(false); setAbaProduto('Geral'); setEstoqueOriginal(0); setProdutoEditando(produtoNovo(categoriasSalvas[0]?.nome || '')) }} style={botao}>＋ Adicionar produto</button><button onClick={carregarProdutos} style={{ ...botao, background: '#f8edf1', color: '#805565' }}>↻ Atualizar lista</button></div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, margin: '22px 0' }}>
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar produto pelo nome..." style={campo} />
                  <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={campo}>{categorias.map(c => <option key={c} value={c}>{c === 'Todas' ? 'Todas as categorias' : c}</option>)}</select>
                  <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={campo}>
                    <option value="todos">Todos os status</option><option value="ativos">Ativos</option><option value="inativos">Inativos</option><option value="estoque">Sem estoque</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 18 }}>
                  <span style={{ background: '#f8edf1', color: '#805565', borderRadius: 20, padding: '7px 12px', fontSize: 13 }}>Todos: {produtos.length}</span>
                  <span style={{ background: '#edf7ef', color: '#39734a', borderRadius: 20, padding: '7px 12px', fontSize: 13 }}>Ativos: {produtos.filter(p => p.ativo).length}</span>
                  <span style={{ background: '#fff3e8', color: '#9b642d', borderRadius: 20, padding: '7px 12px', fontSize: 13 }}>Sem estoque: {produtos.filter(p => Number(p.estoque) <= 0).length}</span>
                </div>
                {produtoEditando && (
                  <ProductDialog onClose={() => { if (!salvandoProduto && !variacaoOcupada) { setProdutoEditando(null); setFoto(null); setVariacaoEditando(false) } }}>
                    <header className="product-editor-header"><div><small>KAREN BEAUTY SHOP / PRODUTOS</small><h2 id="product-editor-title">{produtoEditando.id === 0 ? 'Adicionar produto' : produtoEditando.nome || 'Editar produto'}</h2><p>Organize os detalhes e as opções de compra do seu produto.</p></div></header>
                    <div className="product-editor-tabs" role="tablist" aria-label="Edição do produto">{['Geral', 'Fotos', 'Variações', 'Preços', 'Status'].map(aba => <button type="button" role="tab" id={`tab-${aba}`} aria-controls={`panel-${aba}`} aria-selected={abaProduto === aba} tabIndex={abaProduto === aba ? 0 : -1} onKeyDown={e => {
                      const abas = ['Geral', 'Fotos', 'Variações', 'Preços', 'Status']
                      const i = abas.indexOf(aba)
                      const destino = e.key === 'ArrowRight' ? abas[(i + 1) % abas.length] : e.key === 'ArrowLeft' ? abas[(i + abas.length - 1) % abas.length] : e.key === 'Home' ? abas[0] : e.key === 'End' ? abas[abas.length - 1] : null
                      if (destino) { e.preventDefault(); setAbaProduto(destino); document.getElementById(`tab-${destino}`)?.focus() }
                    }} key={aba} onClick={() => setAbaProduto(aba)}>{aba}</button>)}</div>
                    <section role="tabpanel" id="panel-Geral" aria-labelledby="tab-Geral" hidden={abaProduto !== 'Geral'}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                      <label>Nome<input value={produtoEditando.nome} onChange={e => setProdutoEditando({ ...produtoEditando, nome: e.target.value })} style={campo} /></label>
                      <label>Categoria<select value={produtoEditando.categoria} onChange={e => setProdutoEditando({ ...produtoEditando, categoria: e.target.value })} style={campo}><option value="">Selecione uma categoria</option>{categoriasSalvas.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}</select></label>

                      <label>{produtoEditando.controla_variacoes ? 'Estoque total (edite nas variações)' : 'Estoque'}<input disabled={produtoEditando.controla_variacoes} type="number" min="0" step="1" value={produtoEditando.estoque} onChange={e => setProdutoEditando({ ...produtoEditando, estoque: Number(e.target.value) })} style={campo} /></label>
                    </div>
                    <label style={{ display: 'block', marginTop: 12 }}>Descrição<textarea value={produtoEditando.descricao || ''} onChange={e => setProdutoEditando({ ...produtoEditando, descricao: e.target.value })} style={{ ...campo, minHeight: 75 }} /></label>
                    </section>
                    <section role="tabpanel" id="panel-Preços" aria-labelledby="tab-Preços" hidden={abaProduto !== 'Preços'}>                      <label>Preço<input type="number" min="0" step="0.01" value={produtoEditando.preco} onChange={e => setProdutoEditando({ ...produtoEditando, preco: Number(e.target.value) })} style={campo} /></label>                    <div style={{ background: '#fff', border: '1px solid #ead4dc', borderRadius: 10, padding: 14, marginTop: 16 }}>
                      <h4 style={{ margin: '0 0 4px' }}>Custos, taxas e lucro estimado</h4>
                      <p style={{ color: '#80636f', fontSize: 12, margin: '0 0 10px' }}>Use a maior tarifa aplicável na sua conta do Mercado Pago como estimativa. A cobrança real varia conforme meio e prazo de recebimento.</p>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 10 }}>
                        <label>Custo de compra<input type="number" min="0" step="0.01" value={produtoEditando.custo_aquisicao ?? 0} onChange={e => setProdutoEditando({ ...produtoEditando, custo_aquisicao: Number(e.target.value) })} style={campo} /></label>
                        <label>Outros custos por unidade<input type="number" min="0" step="0.01" value={produtoEditando.custo_adicional ?? 0} onChange={e => setProdutoEditando({ ...produtoEditando, custo_adicional: Number(e.target.value) })} style={campo} /></label>
                        <label>Taxa Mercado Pago (%)<input type="number" min="0" max="99.99" step="0.01" value={produtoEditando.taxa_mp_percentual ?? 0} onChange={e => setProdutoEditando({ ...produtoEditando, taxa_mp_percentual: Number(e.target.value) })} style={campo} /></label>
                        <label>Taxas adicionais (%)<input type="number" min="0" max="99.99" step="0.01" value={produtoEditando.taxas_adicionais_percentual ?? 0} onChange={e => setProdutoEditando({ ...produtoEditando, taxas_adicionais_percentual: Number(e.target.value) })} style={campo} /></label>
                        <label>Margem de lucro desejada (%)<input type="number" min="0" max="99.99" step="0.01" value={produtoEditando.margem_desejada_percentual ?? 30} onChange={e => setProdutoEditando({ ...produtoEditando, margem_desejada_percentual: Number(e.target.value) })} style={campo} /></label>
                      </div>
                      {(() => {
                        const calculo = calcularPreco(produtoEditando)
                        return <div style={{ background: fundo, borderRadius: 8, padding: 12, marginTop: 12, fontSize: 13 }}>
                          {!calculo.taxasValidas ? <strong style={{ color: '#a64250' }}>A soma das taxas e da margem precisa ser menor que 100%.</strong> : <>
                            <div>Custo total por unidade: <strong>{dinheiro(calculo.custo)}</strong></div>
                            <div>Preço sugerido: <strong>{calculo.sugerido === null ? 'Não calculável' : dinheiro(calculo.sugerido)}</strong>{calculo.sugerido !== null && <button type="button" onClick={() => setProdutoEditando({ ...produtoEditando, preco: Number(calculo.sugerido!.toFixed(2)) })} style={{ ...botao, marginLeft: 10, padding: '6px 9px', fontSize: 12 }}>Aplicar preço sugerido</button>}</div>
                            <div>Lucro estimado no preço atual: <strong style={{ color: calculo.lucro >= 0 ? '#39734a' : '#a64250' }}>{dinheiro(calculo.lucro)}</strong> ({calculo.margemReal.toFixed(1)}% do preço)</div>
                          </>}
                          <small style={{ color: '#80636f', display: 'block', marginTop: 6 }}>Estimativa por unidade, sem frete, impostos ou outros custos que não forem informados.</small>
                        </div>
                      })()}
                    </div>
</section>
                    <section role="tabpanel" id="panel-Fotos" aria-labelledby="tab-Fotos" hidden={abaProduto !== 'Fotos'}><h3>Foto principal</h3><p>A imagem principal aparece no catálogo. Cada variação pode ter sua própria foto na aba Variações.</p>{produtoEditando.id === 0 && <p>Cadastre o produto para enviar fotos.</p>}
                    {produtoEditando.id > 0 && <><label style={{ display: 'block', marginTop: 12 }}>Foto do produto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFoto(e.target.files?.[0] || null)} style={campo} /></label>{produtoEditando.imagem && <><img src={produtoEditando.imagem} alt={`Foto de ${produtoEditando.nome}`} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 10, marginTop: 10, display: 'block' }} /><button onClick={() => excluirFoto().catch(error => alert(error instanceof Error ? error.message : 'Erro ao remover foto.'))} style={{ ...botao, marginTop: 8, background: '#a64250' }}>Excluir foto</button></>}<button onClick={() => enviarFoto().catch(error => alert(error instanceof Error ? error.message : 'Erro ao enviar foto.'))} disabled={!foto} style={{ ...botao, marginTop: 8 }}>Enviar foto</button></>}
                    </section><section role="tabpanel" id="panel-Status" aria-labelledby="tab-Status" hidden={abaProduto !== 'Status'}><h3>Disponibilidade na loja</h3><p>Desativar oculta o produto do catálogo e preserva o histórico de pedidos e estoque.</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}><button type="button" role="switch" aria-checked={produtoEditando.ativo} aria-label={produtoEditando.ativo ? 'Produto ativo' : 'Produto desativado'} onClick={() => setProdutoEditando({ ...produtoEditando, ativo: !produtoEditando.ativo })} style={{ width: 52, height: 30, border: 0, borderRadius: 16, padding: 3, cursor: 'pointer', background: produtoEditando.ativo ? '#34c759' : '#ff3b30', transition: 'background .2s', display: 'flex', alignItems: 'center', justifyContent: produtoEditando.ativo ? 'flex-end' : 'flex-start' }}><span style={{ display: 'block', width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px #0004' }} /></button><strong>{produtoEditando.ativo ? 'Produto ativo' : 'Produto desativado'}</strong></div>
                    </section><section role="tabpanel" id="panel-Variações" aria-labelledby="tab-Variações" hidden={abaProduto !== 'Variações'}>
                    {produtoEditando.id === 0 && <p>Cadastre o produto primeiro para distribuir seu estoque entre as variações.</p>}
                    {produtoEditando.id > 0 && <VariationEditor key={produtoEditando.id} produtoId={produtoEditando.id} convertido={!!produtoEditando.controla_variacoes} estoqueOriginal={estoqueOriginal} onEditingChange={setVariacaoEditando} onBusyChange={setVariacaoOcupada} onUpdate={async () => {
                      await carregarProdutos()
                      const resposta = await fetch('/api/admin/produtos')
                      if (!resposta.ok) throw new Error('Não foi possível atualizar o estoque. Reabra o produto.')
                      const dados = await resposta.json()
                      const atual = dados.produtos.find((p: Produto) => p.id === produtoEditando.id)
                      if (atual) { setProdutoEditando(p => p ? { ...p, estoque: atual.estoque, controla_variacoes: atual.controla_variacoes } : p); setEstoqueOriginal(atual.estoque) }
                    }} />}
                    <p className="editor-note">Fotos e variações são salvas ao confirmar suas próprias ações. O botão abaixo salva os demais dados do produto.</p></section>
                    <footer className="product-editor-footer"><button onClick={salvarProduto} disabled={variacaoEditando || variacaoOcupada || salvandoProduto || !calcularPreco(produtoEditando).taxasValidas} style={{ ...botao, opacity: salvandoProduto || !calcularPreco(produtoEditando).taxasValidas ? 0.6 : 1 }}>{salvandoProduto ? 'Salvando...' : produtoEditando.id === 0 ? 'Cadastrar produto' : 'Salvar dados do produto'}</button>{produtoEditando.id > 0 && <button onClick={() => excluirProduto(produtoEditando).catch(error => alert(error instanceof Error ? error.message : 'Erro ao excluir produto.'))} style={{ ...botao, background: '#a64250' }}>Excluir produto</button>}<button disabled={salvandoProduto || variacaoOcupada} onClick={() => { setProdutoEditando(null); setFoto(null); setVariacaoEditando(false) }} style={{ ...botao, background: '#eee', color: '#55434a' }}>Fechar</button></footer>
                  </ProductDialog>
                )}
                {carregandoProdutos ? <p>Carregando produtos...</p> : produtosFiltrados.length === 0 ? <p>Nenhum produto encontrado com esses filtros.</p> : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 700 }}>
                      <thead><tr>{['Produto', 'Categoria', 'Preço', 'Estoque', 'Status', 'Ações'].map(t => <th key={t} style={{ padding: 12, borderBottom: '1px solid #eee', color: '#80636f' }}>{t}</th>)}</tr></thead>
                      <tbody>{produtosFiltrados.map(p => <tr key={p.id}>
                        <td style={{ padding: 12, borderBottom: '1px solid #f3e9ed' }}><strong>{p.emoji || '🛍️'} {p.nome}</strong></td>
                        <td style={{ padding: 12, borderBottom: '1px solid #f3e9ed' }}>{p.categoria}</td>
                        <td style={{ padding: 12, borderBottom: '1px solid #f3e9ed' }}>{dinheiro(p.preco)}</td>
                        <td style={{ padding: 12, borderBottom: '1px solid #f3e9ed' }}>{p.estoque}</td>
                        <td style={{ padding: 12, borderBottom: '1px solid #f3e9ed' }}><span style={{ color: p.ativo ? '#39734a' : '#a04b4b' }}>{p.ativo ? 'Ativo' : 'Inativo'}</span></td>
                        <td style={{ padding: 12, borderBottom: '1px solid #f3e9ed' }}><div style={{ display: 'flex', gap: 6 }}><button onClick={() => { setFoto(null); setVariacaoEditando(false); setVariacaoOcupada(false); setAbaProduto('Geral'); setEstoqueOriginal(p.estoque); setProdutoEditando({ ...p }) }} style={botao}>Editar</button><button onClick={() => excluirProduto(p).catch(error => alert(error instanceof Error ? error.message : 'Erro ao excluir produto.'))} style={{ ...botao, background: '#a64250' }}>Excluir</button></div></td>
                      </tr>)}</tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            {pagina === 'categorias' && (
              <section style={card}>
                <h2 style={{ marginTop: 0 }}>Categorias</h2>
                <form onSubmit={e => { e.preventDefault(); salvarCategoria(novaCategoria).then(() => setNovaCategoria('')).catch(error => alert(error instanceof Error ? error.message : 'Erro ao criar categoria.')) }} style={{ display: 'flex', gap: 8, margin: '16px 0' }}><input aria-label="Nome da categoria" value={novaCategoria} onChange={e => setNovaCategoria(e.target.value)} placeholder="Nova categoria" style={campo} required /><button style={botao}>Criar</button></form>
                {carregandoProdutos ? <p>Carregando categorias...</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 12 }}>{categoriasSalvas.map(c => <article key={c.id} style={{ background: fundo, border: '1px solid #ead4dc', borderRadius: 12, padding: 16 }}><strong>{c.nome}</strong><p style={{ color: '#8b737c', marginBottom: 0, fontSize: 13 }}>{produtos.filter(p => p.categoria === c.nome).length} produtos</p><button onClick={() => { const nome = prompt('Novo nome da categoria', c.nome); if (nome?.trim()) salvarCategoria(nome.trim(), c.id).catch(error => alert(error instanceof Error ? error.message : 'Erro ao renomear categoria.')) }} style={{ ...botao, marginTop: 12, padding: '7px 10px', fontSize: 12 }}>Renomear</button> <button onClick={() => excluirCategoria(c.id).catch(error => alert(error instanceof Error ? error.message : 'Erro ao excluir categoria.'))} style={{ ...botao, background: '#eee', color: '#55434a', marginTop: 12, padding: '7px 10px', fontSize: 12 }}>Excluir</button> <button onClick={() => { setFiltroCategoria(c.nome); setPagina('produtos') }} style={{ ...botao, marginTop: 12, padding: '7px 10px', fontSize: 12 }}>Ver produtos</button></article>)}</div>}
              </section>
            )}

            {pagina === 'pedidos' && (
              <section style={{ ...card, overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}><h2 style={{ marginTop: 0 }}>Pedidos</h2><button onClick={carregarDashboard} style={botao}>↻ Atualizar pedidos</button></div>
                {dashboard ? <TabelaPedidos pedidos={dashboard.pedidosRecentes} atualizarStatus={atualizarStatus} abrirDetalhesPedido={abrirDetalhesPedido} /> : <p>Não foi possível carregar os pedidos.</p>}
                <p style={{ color: '#8b737c', fontSize: 12 }}>Esta lista mostra os pedidos recentes retornados pelo painel.</p>
              </section>
            )}
                        {pagina === 'pedidos-teste' && (
              <section style={{ ...card, overflowX: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <h2 style={{ marginTop: 0 }}>🧪 Pedidos de teste</h2>
                    <p style={{ color: '#8b737c' }}>Pedidos de teste separados das vendas reais.</p>
                  </div>
                  <button onClick={carregarPedidosTeste} style={botao}>
                    ↻ Atualizar testes
                  </button>
                </div>

                {carregandoTestes ? <p>Carregando pedidos de teste...</p> :
                  pedidosTeste.length === 0 ? <p>Nenhum pedido de teste encontrado.</p> : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 650 }}>
                      <thead>
                        <tr>
                          {['Pedido', 'Cliente', 'Valor', 'Status', 'Data'].map(t =>
                            <th key={t} style={{ padding: 12, borderBottom: '1px solid #eee' }}>{t}</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {pedidosTeste.map(pedido => (
                          <tr key={pedido.id}>
                            <td style={{ padding: 12 }}>#{pedido.numero_pedido}</td>
                            <td style={{ padding: 12 }}>{pedido.nome}</td>
                            <td style={{ padding: 12 }}>{dinheiro(pedido.total)}</td>
                            <td style={{ padding: 12 }}>{pedido.status}</td>
                            <td style={{ padding: 12 }}>{new Date(pedido.criado_em).toLocaleString('pt-BR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                }
              </section>
            )}
          </>
        )}
      </div>

      {pedidoSelecionado && (
        <div onClick={() => setPedidoSelecionado(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', padding: 24, borderRadius: 16, width: '100%', maxWidth: 550, maxHeight: '85vh', overflowY: 'auto' }}>
            <h2>Detalhes do pedido #{pedidoSelecionado.numero_pedido}</h2>
            <p><strong>Cliente:</strong> {pedidoSelecionado.nome}</p><p><strong>WhatsApp:</strong> {pedidoSelecionado.whatsapp}</p>
            <a href={`https://wa.me/${String(pedidoSelecionado.whatsapp).replace(/\D/g, '')}?text=${encodeURIComponent(`Olá, ${pedidoSelecionado.nome}! Estamos entrando em contato sobre seu pedido #${pedidoSelecionado.numero_pedido} na Karen Beauty Shop.`)}`} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginBottom: 12, padding: '9px 14px', background: '#25D366', color: 'white', borderRadius: 8, textDecoration: 'none', fontWeight: 'bold' }}>Conversar pelo WhatsApp</a>
            <p><strong>E-mail:</strong> {pedidoSelecionado.email || 'Não informado'}</p>
            <h3>Resumo da compra</h3><p><strong>Data:</strong> {new Date(pedidoSelecionado.criado_em).toLocaleString('pt-BR')}</p>
            <p><strong>Subtotal:</strong> {dinheiro(pedidoSelecionado.subtotal)}</p><p><strong>Frete:</strong> {dinheiro(pedidoSelecionado.frete)}</p><p><strong>Total:</strong> {dinheiro(pedidoSelecionado.total)}</p>
            <h3>Entrega</h3><p>{pedidoSelecionado.tipo_entrega}</p><p>{[pedidoSelecionado.endereco, pedidoSelecionado.numero, pedidoSelecionado.bairro, pedidoSelecionado.cidade, pedidoSelecionado.estado, pedidoSelecionado.cep].filter(Boolean).join(', ') || 'Endereço não informado'}</p>
            <h3>Produtos</h3>{pedidoSelecionado.pagamento_revisao && <p role="alert">Pagamento exige revisão manual. Confira o Mercado Pago e as reservas antes de separar o pedido.</p>}{pedidoSelecionado.itens_pedido?.map((item: any) => <p key={item.id}>{item.nome_produto}{item.nome_variacao ? ` — ${item.nome_variacao}` : ''} — {item.quantidade} x {dinheiro(item.preco_unitario)}</p>)}
            <h3>Total: {dinheiro(pedidoSelecionado.total)}</h3><button onClick={() => setPedidoSelecionado(null)} style={botao}>Fechar</button>
          </div>
        </div>
      )}
    </main>
  )
}

function TabelaPedidos({ pedidos, atualizarStatus, abrirDetalhesPedido }: { pedidos: Pedido[]; atualizarStatus: (id: string, status: string) => void; abrirDetalhesPedido: (id: string) => void }) {
  if (!pedidos.length) return <p>Nenhum pedido registrado ainda.</p>
  return <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 850 }}>
    <thead><tr>{['Pedido', 'Cliente', 'WhatsApp', 'Valor', 'Status', 'Data', 'Ações'].map(item => <th key={item} style={{ padding: 12, borderBottom: '1px solid #eee' }}>{item}</th>)}</tr></thead>
    <tbody>{pedidos.map(pedido => <tr key={pedido.id}>
      <td style={{ padding: 12 }}>#{pedido.numero_pedido}</td><td style={{ padding: 12 }}>{pedido.nome}</td><td style={{ padding: 12 }}>{pedido.whatsapp}</td><td style={{ padding: 12 }}>{dinheiro(pedido.total)}</td>
      <td style={{ padding: 12 }}>{pedido.pagamento_revisao && <strong role="alert">Revisão de pagamento · </strong>}<select disabled={pedido.pedido_teste || !['confirmado','preparando','enviado'].includes(pedido.status)} value={pedido.status} onChange={e => atualizarStatus(pedido.id, e.target.value)} style={{ padding: 9, borderRadius: 8 }}><option value={pedido.status}>{pedido.status.replaceAll('_', ' ')}</option>{pedido.status === 'confirmado' && <option value="preparando">Preparando</option>}{pedido.status === 'preparando' && <option value="enviado">Enviado</option>}{['preparando','enviado'].includes(pedido.status) && <option value="concluido">Concluído</option>}</select></td>
      <td style={{ padding: 12 }}>{new Date(pedido.criado_em).toLocaleDateString('pt-BR')}</td><td style={{ padding: 12 }}><button onClick={() => abrirDetalhesPedido(pedido.id)} style={botao}>Ver detalhes</button></td>
    </tr>)}</tbody>
  </table>
}

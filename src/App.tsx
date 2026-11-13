
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { type Product } from './products'
import { supabase } from './supabase'
import { criarControlePedidos } from './customerOrders'
import type { User } from '@supabase/supabase-js'
import './App.css'

type CartItem = {
  product: Product
  quantity: number
}

type CustomerOrder = {
  id: string
  numero_pedido: string | number
  total: number
  status: string
  criado_em: string
  itens_pedido: Array<{ nome_variacao?: string; nome_produto: string; quantidade: number; total_item: number }>
}

function money(value: number) {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

const cartKey = (p: Product) => `${p.id}:${p.variationId || ''}`

function App() {
  const [produtoIdSelecionado, setProdutoIdSelecionado] = useState<number | null>(() => {
    const match = window.location.pathname.match(/^\/produto\/(\d+)\/?$/)
    return match ? Number(match[1]) : null
  })
  const [category, setCategory] = useState('Todos')
  const [search, setSearch] = useState('')
  const [cart, setCart] = useState<CartItem[]>([])
  const [catalogo, setCatalogo] = useState<Product[]>([])
  const [catalogoCarregado, setCatalogoCarregado] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutSending, setCheckoutSending] = useState(false)
  const [produtoAdicionado, setProdutoAdicionado] = useState<{ product: Product; quantity: number } | null>(null)
  const [variacaoSelecionada, setVariacaoSelecionada] = useState('')
  const [erroCatalogo, setErroCatalogo] = useState(false)
  const [quantidadeProduto, setQuantidadeProduto] = useState(1)
  const [cliente, setCliente] = useState<User | null>(null)
  const [contaAberta, setContaAberta] = useState(false)
  const [emailLogin, setEmailLogin] = useState('')
  const [linkEnviado, setLinkEnviado] = useState(false)
  const [loginCarregando, setLoginCarregando] = useState(false)
  const [mensagemLogin, setMensagemLogin] = useState('')
  const [pedidosCliente, setPedidosCliente] = useState<CustomerOrder[]>([])
  const [pedidosCarregando, setPedidosCarregando] = useState(false)
  const [controlePedidos] = useState(criarControlePedidos)
  useEffect(() => {
    let ativo = true
    let eventoRecebido = false
    const atualizarCliente = (usuario: User | null) => {
      if (!ativo) return
      if (controlePedidos.definirCliente(usuario?.id || null)) {
        setPedidosCliente([])
        setPedidosCarregando(false)
        setMensagemLogin('')
        setLinkEnviado(false)
      }
      setCliente(usuario)
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      eventoRecebido = true
      atualizarCliente(session?.user || null)
    })
    supabase.auth.getSession().then(({ data }) => {
      if (!eventoRecebido) atualizarCliente(data.session?.user || null)
    })
    return () => { ativo = false; subscription.unsubscribe() }
  }, [controlePedidos])
  useEffect(() => {
    const parametros = new URLSearchParams(window.location.search)
    if (parametros.get('pagamento') !== 'retorno') return
    window.alert('O retorno do pagamento foi recebido. A confirmação final será atualizada pela loja após validação do Mercado Pago.')
    window.history.replaceState({}, '', window.location.pathname)
  }, [])
  useEffect(() => {
    if (cliente && contaAberta) void carregarPedidosCliente()
  }, [cliente, contaAberta])
  useEffect(() => {
    fetch('/api/produtos').then(r => r.ok ? r.json() : Promise.reject()).then(data => {
      if (Array.isArray(data.produtos)) setCatalogo(data.produtos)
    }).catch(() => setErroCatalogo(true)).finally(() => setCatalogoCarregado(true))
  }, [])
  useEffect(() => {
    const atualizarRota = () => {
      const match = window.location.pathname.match(/^\/produto\/(\d+)\/?$/)
      setProdutoIdSelecionado(match ? Number(match[1]) : null)
      setVariacaoSelecionada('')
      setQuantidadeProduto(1)
    }
    window.addEventListener('popstate', atualizarRota)
    return () => window.removeEventListener('popstate', atualizarRota)
  }, [])
  useEffect(() => {
    if (!produtoAdicionado) return
    const timer = window.setTimeout(() => setProdutoAdicionado(null), 6000)
    return () => window.clearTimeout(timer)
  }, [produtoAdicionado])
  const categories = useMemo(() => ['Todos', ...Array.from(new Set(catalogo.map(p => p.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'))], [catalogo])
  const filteredProducts = useMemo(() => {
    return catalogo.filter(product => {
      const matchesCategory =
        category === 'Todos' || product.category === category

      const matchesSearch =
        product.name.toLowerCase().includes(search.toLowerCase())

      return matchesCategory && matchesSearch
    })
  }, [catalogo, category, search])

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0)

  const total = cart.reduce(
    (sum, item) => sum + item.product.price * item.quantity,
    0
  )

  const produtoSelecionado = produtoIdSelecionado === null
    ? null
    : catalogo.find(product => product.id === produtoIdSelecionado) || null
  const variacaoAtual = produtoSelecionado?.variacoes?.find(v => v.id === variacaoSelecionada)
  const produtoCompra: Product | null = produtoSelecionado ? (variacaoAtual ? {
    ...produtoSelecionado, variationId: variacaoAtual.id, variationName: variacaoAtual.nome,
    price: variacaoAtual.price, stock: variacaoAtual.stock, imagem: variacaoAtual.imagem || produtoSelecionado.imagem,
  } : produtoSelecionado) : null
  const podeComprar = Boolean(produtoCompra && produtoCompra.stock > 0 && (!produtoCompra.controla_variacoes || variacaoAtual))
  useEffect(() => {
    document.title = produtoSelecionado
      ? `${produtoSelecionado.name} | Karen Beauty Shop`
      : 'Karen Beauty Shop'
  }, [produtoSelecionado])
  const produtosRelacionados = produtoSelecionado
    ? catalogo.filter(product => product.id !== produtoSelecionado.id && product.category === produtoSelecionado.category).slice(0, 4)
    : []
  const maisProdutos = produtoSelecionado
    ? catalogo.filter(product => product.id !== produtoSelecionado.id && product.category !== produtoSelecionado.category).slice(0, 8)
    : []

  function abrirProduto(product: Product) {
    window.history.pushState({}, '', `/produto/${product.id}`)
    setProdutoIdSelecionado(product.id)
    setVariacaoSelecionada('')
    setQuantidadeProduto(1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function voltarParaLoja(anchor?: string) {
    window.history.pushState({}, '', anchor ? `/#${anchor}` : '/')
    setProdutoIdSelecionado(null)
    if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' }), 0)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function addToCart(product: Product, quantity = 1) {
    if (product.controla_variacoes && !product.variationId) { abrirProduto(product); return }
    const currentQuantity = cart.find(item => cartKey(item.product) === cartKey(product))?.quantity || 0
    const available = Math.max(Number(product.stock) - currentQuantity, 0)
    const quantityToAdd = Math.min(quantity, available)
    if (quantityToAdd <= 0) {
      setProdutoAdicionado(null)
      window.alert('Este produto está sem estoque disponível.')
      return
    }
    setCart(current => {
      const existing = current.find(item => cartKey(item.product) === cartKey(product))

      if (existing) {
        return current.map(item =>
          cartKey(item.product) === cartKey(product)
            ? { ...item, quantity: Math.min(product.stock, item.quantity + quantityToAdd) }
            : item
        )
      }

      return [...current, { product, quantity: quantityToAdd }]
    })
    setCartOpen(false)
    setProdutoAdicionado({ product, quantity: quantityToAdd })
  }

  function renderProductCard(product: Product) {
    return (
      <article className="product-card" key={product.id}>
        <button className="product-image product-image-button" onClick={() => abrirProduto(product)} aria-label={`Ver detalhes de ${product.name}`}>
          {product.imagem ? <img src={product.imagem} alt={product.name} loading="lazy" /> : <span className="product-emoji">{product.emoji}</span>}
        </button>
        <div className="product-info">
          <small>{product.category}</small>
          <h3><button className="product-card-title" onClick={() => abrirProduto(product)}>{product.name}</button></h3>
          <p>{product.description}</p>
          <div className="price-line"><strong>{money(product.price)}</strong></div>
        </div>
        <button className="add-button" disabled={product.stock <= 0} onClick={() => addToCart(product)}>{product.controla_variacoes ? 'Escolher variação' : 'Adicionar ao carrinho +'}</button>
      </article>
    )
  }

  function changeQuantity(productId: string, amount: number) {
    setCart(current =>
      current
        .map(item =>
          cartKey(item.product) === productId
            ? { ...item, quantity: Math.min(item.product.stock, item.quantity + amount) }
            : item
        )
        .filter(item => item.quantity > 0)
    )
  }

  function removeItem(productId: string) {
    setCart(current =>
      current.filter(item => cartKey(item.product) !== productId)
    )
  }

  async function entrarNaConta(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoginCarregando(true)
    setMensagemLogin('')
    try {
      const { error } = await supabase.auth.signInWithOtp({ email: emailLogin.trim(), options: { shouldCreateUser: true, emailRedirectTo: window.location.origin } })
      if (error) throw error
      setLinkEnviado(true)
      setMensagemLogin('Enviamos um link de acesso para seu e-mail. Abra a mensagem neste dispositivo para entrar.')
    } catch (error) {
      setMensagemLogin(error instanceof Error ? error.message : 'Não foi possível entrar. Tente novamente.')
    } finally {
      setLoginCarregando(false)
    }
  }

  async function carregarPedidosCliente() {
    const consulta = controlePedidos.iniciar(cliente?.id || null)
    if (!consulta) return
    setPedidosCarregando(true)
    try {
      const { data } = await supabase.auth.getSession()
      if (!controlePedidos.atual(consulta) || data.session?.user.id !== consulta.cliente) return
      const resposta = await fetch(`${API_URL}/api/me/pedidos`, { headers: { Authorization: `Bearer ${data.session?.access_token || ''}` } })
      const resultado = await resposta.json()
      if (!controlePedidos.atual(consulta)) return
      if (!resposta.ok) throw new Error(resultado.erro || 'Não foi possível carregar seus pedidos.')
      setPedidosCliente(resultado.pedidos || [])
    } catch (error) {
      if (controlePedidos.atual(consulta)) setMensagemLogin(error instanceof Error ? error.message : 'Não foi possível carregar seus pedidos.')
    } finally {
      if (controlePedidos.atual(consulta)) setPedidosCarregando(false)
    }
  }

  return (
    <div className="store">
      <div className="top-strip">
        ✨ Beleza, cuidado e autoestima em um só lugar
      </div>

      <header className="header">
        <a className="brand" href="#inicio" onClick={event => { if (produtoIdSelecionado !== null) { event.preventDefault(); voltarParaLoja('inicio') } }}>
          <span className="brand-mark">K</span>
          <span>
            <strong>Karen Beauty Shop</strong>
            <small>BELEZA EM CADA DETALHE</small>
          </span>
        </a>

        <nav className="desktop-nav">
          <a href="#inicio" onClick={event => { if (produtoIdSelecionado !== null) { event.preventDefault(); voltarParaLoja('inicio') } }}>Início</a>
          <a href="#produtos" onClick={event => { if (produtoIdSelecionado !== null) { event.preventDefault(); voltarParaLoja('produtos') } }}>Produtos</a>
          <a href="#categorias" onClick={event => { if (produtoIdSelecionado !== null) { event.preventDefault(); voltarParaLoja('categorias') } }}>Categorias</a>
        </nav>

        <button className="cart-button" onClick={() => { setProdutoAdicionado(null); setCartOpen(true) }}>
          ♡ Carrinho <span>{cartCount}</span>
        </button>
        <button className="account-button" onClick={() => { setContaAberta(true); setMensagemLogin('') }}>{cliente ? 'Minha conta' : 'Entrar'}</button>
      </header>

      <main>
        {produtoIdSelecionado !== null ? (
          produtoSelecionado ? (
            <>
              <section className="product-detail-section">
                <button className="detail-back" onClick={() => voltarParaLoja('produtos')}>← Voltar para produtos</button>
                <div className="product-detail-layout">
                  <div className="product-detail-photo">
                    {produtoCompra?.imagem ? <img src={produtoCompra.imagem} alt={produtoSelecionado.name} /> : <span>{produtoSelecionado.emoji}</span>}
                  </div>
                  <div className="product-detail-copy">
                    <span className="eyebrow">{produtoSelecionado.category}</span>
                    <h1>{produtoSelecionado.name}</h1>
                    <p className="detail-price">{money(produtoCompra?.price || 0)}</p>
                    {produtoSelecionado.controla_variacoes && <label>Escolha a variação<select aria-label="Variação" value={variacaoSelecionada} onChange={e => { setVariacaoSelecionada(e.target.value); setQuantidadeProduto(1) }}><option value="">Selecione...</option>{produtoSelecionado.variacoes?.map(v => <option key={v.id} value={v.id} disabled={v.stock <= 0}>{v.nome} — {money(v.price)} ({v.stock} disponíveis)</option>)}</select></label>}
                    <p className="detail-stock">{(produtoCompra?.stock || 0) > 0 ? `${(produtoCompra?.stock || 0)} em estoque` : 'Produto indisponível no momento'}</p>
                    <p className="detail-description">{produtoSelecionado.description || 'Um item especial selecionado para sua rotina de beleza.'}</p>
                    {(produtoCompra?.stock || 0) > 0 && <div className="detail-buy-row"><label htmlFor="quantidade-produto">Quantidade</label><select id="quantidade-produto" value={quantidadeProduto} onChange={event => setQuantidadeProduto(Number(event.target.value))}>{Array.from({ length: Math.min(Number((produtoCompra?.stock || 0)), 10) }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></div>}
                    <button className="detail-add-button" disabled={!podeComprar} onClick={() => produtoCompra && addToCart(produtoCompra, quantidadeProduto)}>Adicionar ao carrinho</button>
                    <p className="detail-reassurance">Compra prática • Atendimento pelo WhatsApp</p>
                  </div>
                </div>
              </section>
              {produtosRelacionados.length > 0 && <section className="detail-recommendations"><div className="products-heading"><div><span className="eyebrow">DA MESMA CATEGORIA</span><h2>Produtos relacionados</h2></div></div><div className="product-grid">{produtosRelacionados.map(renderProductCard)}</div></section>}
              {maisProdutos.length > 0 && <section className="detail-recommendations"><div className="products-heading"><div><span className="eyebrow">MAIS PARA VOCÊ</span><h2>Explore outros produtos</h2></div></div><div className="product-grid">{maisProdutos.map(renderProductCard)}</div><button className="detail-back" onClick={() => voltarParaLoja('produtos')}>Ver todos os produtos →</button></section>}
            </>
          ) : <section className="product-detail-section"><button className="detail-back" onClick={() => voltarParaLoja('produtos')}>← Voltar para produtos</button><h1>{catalogoCarregado ? 'Produto não encontrado' : 'Carregando produto...'}</h1></section>
        ) : (
          <>
        <section className="hero" id="inicio">
          <div className="hero-copy">
            <span className="eyebrow">
              SUA ROTINA DE BELEZA COMEÇA AQUI
            </span>
            <h1>
              Realce sua beleza.
              <br />
              <em>Cuide de você.</em>
            </h1>
            <p>
              Encontre seus produtos favoritos de beleza, maquiagem e
              cuidados pessoais em um só lugar.
            </p>
            <a href="#produtos" className="primary-button">
              Descobrir produtos <span>→</span>
            </a>
            <div className="hero-note">♡ Escolhas especiais para você</div>
          </div>

          <div className="hero-art">
            <div className="hero-circle">
              <span className="hero-flower">✿</span>
              <span className="hero-k">K</span>
              <span className="hero-caption">BEAUTY & CARE</span>
            </div>
            <span className="decor decor-one">✧</span>
            <span className="decor decor-two">♡</span>
          </div>
        </section>

        <section className="benefits">
          <div>
            <span>♡</span>
            <p>
              <strong>Beleza e cuidado</strong>
              <small>Produtos selecionados</small>
            </p>
          </div>
          <div>
            <span>✧</span>
            <p>
              <strong>Compra prática</strong>
              <small>Peça sem sair de casa</small>
            </p>
          </div>
          <div>
            <span>⌂</span>
            <p>
              <strong>Entrega nacional</strong>
              <small>Consulte as condições</small>
            </p>
          </div>
        </section>

        <section className="categories-section" id="categorias">
          <div className="section-heading">
            <span className="eyebrow">EXPLORE A LOJA</span>
            <h2>Encontre o que você procura</h2>
          </div>

          <div className="category-list">
            {categories.map(item => (
              <button
                key={item}
                className={
                  category === item
                    ? 'category-chip active'
                    : 'category-chip'
                }
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        <section className="products-section" id="produtos">
          <div className="products-heading">
            <div>
              <span className="eyebrow">SELEÇÃO KAREN BEAUTY</span>
              <h2>Nossos produtos</h2>
            </div>
            <span className="product-count">
              {filteredProducts.length} produtos
            </span>
          </div>

          <div className="search-box">
            <span>⌕</span>
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Buscar produtos..."
            />
          </div>

          <div className="product-grid">
            {filteredProducts.map(renderProductCard)}
          </div>

          {filteredProducts.length === 0 && (
            <p className="empty">
              {erroCatalogo ? 'Não foi possível carregar o catálogo. Atualize a página para tentar novamente.' : catalogoCarregado ? 'Nenhum produto encontrado. Tente outra busca.' : 'Carregando catálogo...'}
            </p>
          )}
        </section>

        <section className="closing-banner">
          <span>UM CARINHO ESPECIAL PARA VOCÊ</span>
          <h2>Sua beleza merece esse cuidado.</h2>
          <a href="#produtos">Conhecer produtos →</a>
        </section>
          </>
        )}
      </main>

      <footer className="footer">
        <div className="brand footer-brand">
          <span className="brand-mark">K</span>
          <span>
            <strong>Karen Beauty Shop</strong>
            <small>BELEZA EM CADA DETALHE</small>
          </span>
        </div>
        <p>Beleza, cuidado e autoestima em cada escolha.</p>
        <small>© 2026 Karen Beauty Shop. Todos os direitos reservados.</small>
      </footer>

      {produtoAdicionado && <div className="cart-add-toast" role="status" aria-live="polite"><div className="cart-add-toast-heading"><span>✓</span><strong>Adicionado ao carrinho</strong><button onClick={() => setProdutoAdicionado(null)} aria-label="Fechar aviso">×</button></div><div className="cart-add-toast-product">{produtoAdicionado.product.imagem ? <img src={produtoAdicionado.product.imagem} alt="" /> : <span>{produtoAdicionado.product.emoji}</span>}<div><strong>{produtoAdicionado.product.name}{produtoAdicionado.product.variationName ? ` — ${produtoAdicionado.product.variationName}` : ''}</strong><small>{produtoAdicionado.quantity} × {money(produtoAdicionado.product.price)}</small></div><b>{money(produtoAdicionado.quantity * produtoAdicionado.product.price)}</b></div><div className="cart-add-toast-actions"><button className="continue-button" onClick={() => setProdutoAdicionado(null)}>Continuar comprando</button><button className="add-button" onClick={() => { setProdutoAdicionado(null); setCartOpen(true) }}>Ver carrinho ({cartCount})</button></div></div>}

      {contaAberta && <div className="account-overlay" onClick={() => setContaAberta(false)}><section className="account-panel" onClick={event => event.stopPropagation()}>
        <div className="checkout-heading"><div><span className="eyebrow">KAREN BEAUTY SHOP</span><h2>{cliente ? 'Minha conta' : 'Entrar ou criar conta'}</h2><p>{cliente ? cliente.email : 'Acesse seus pedidos usando seu e-mail.'}</p></div><button className="cart-close" onClick={() => setContaAberta(false)} aria-label="Fechar">×</button></div>
        {cliente ? <div className="account-content"><div className="account-orders-heading"><h3>Meus pedidos</h3><button type="button" onClick={() => void carregarPedidosCliente()}>Atualizar</button></div>
          {pedidosCarregando ? <p>Carregando seus pedidos...</p> : pedidosCliente.length === 0 ? <p>Você ainda não tem pedidos vinculados a esta conta.</p> : <div className="account-order-list">{pedidosCliente.map(order => <article className="account-order" key={order.id}><div><strong>Pedido nº {order.numero_pedido}</strong><span>{new Date(order.criado_em).toLocaleDateString('pt-BR')} · {order.status.replaceAll('_', ' ')}</span></div><b>{money(Number(order.total))}</b><ul>{order.itens_pedido?.map((item, index) => <li key={`${order.id}-${index}`}>{item.quantidade} × {item.nome_produto}{item.nome_variacao ? ` — ${item.nome_variacao}` : ''}</li>)}</ul></article>)}</div>}
          {mensagemLogin && <p className="account-message" role="status">{mensagemLogin}</p>}<button className="continue-button" type="button" onClick={async () => { await supabase.auth.signOut(); setPedidosCliente([]); setContaAberta(false) }}>Sair da conta</button>
        </div> : <form className="account-content account-form" onSubmit={entrarNaConta}>
          <label htmlFor="email-login">Seu e-mail</label><input id="email-login" type="email" required autoComplete="email" value={emailLogin} onChange={event => { setEmailLogin(event.target.value); setLinkEnviado(false); setMensagemLogin('') }} placeholder="voce@email.com" /><p>Enviaremos um link seguro para entrar. Não precisa criar senha.</p>
          {mensagemLogin && <p className="account-message" role="status">{mensagemLogin}</p>}<button className="checkout-button" type="submit" disabled={loginCarregando}>{loginCarregando ? 'Aguarde...' : linkEnviado ? 'Enviar link novamente' : 'Enviar link de acesso'}</button><p className="account-guest-note">Você também pode comprar sem criar conta.</p>
        </form>}
      </section></div>}

{checkoutOpen && (
  <div className="checkout-overlay">
    <section className="checkout-panel">
      <div className="checkout-heading">
        <div>
          <span className="eyebrow">KAREN BEAUTY SHOP</span>
          <h2>Finalizar pedido</h2>
          <p>Informe seus dados para continuar.</p>
        </div>
        <button
          className="cart-close"
          onClick={() => setCheckoutOpen(false)}
          type="button"
        >
          ×
        </button>
      </div>

      <form
        className="checkout-form"
        onSubmit={async event => {
  event.preventDefault()
  if (checkoutSending) return
  setCheckoutSending(true)

  const formData = new FormData(event.currentTarget)

  const pedido = {
    nome: String(formData.get('nome') || ''),
    whatsapp: String(formData.get('whatsapp') || ''),
    email: String(formData.get('email') || ''),
    tipo_entrega: String(formData.get('delivery') || 'delivery'),
    cep: String(formData.get('cep') || ''),
    cidade: String(formData.get('cidade') || ''),
    estado: String(formData.get('estado') || ''),
    endereco: String(formData.get('endereco') || ''),
    numero: String(formData.get('numero') || ''),
    complemento: String(formData.get('complemento') || ''),
    bairro: String(formData.get('bairro') || ''),
    aceita_whatsapp: formData.get('aceita_whatsapp') === 'on',
    itens: cart.map(item => ({
      produto_id: item.product.id,
      variacao_id: item.product.variationId || null,
      quantidade: item.quantity
    }))
  }

  try {
    const resposta = await fetch(`${API_URL}/api/pedidos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cliente ? { Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}` } : {})
      },
      body: JSON.stringify(pedido)
    })

    const resultado = await resposta.json()

    if (!resposta.ok) {
      alert(resultado.erro || 'Não foi possível registrar o pedido.')
      setCheckoutSending(false)
      return
    }

    setCart([])
    setCheckoutOpen(false)
    if (typeof resultado.checkoutUrl !== 'string' || !resultado.checkoutUrl.startsWith('https://')) {
      alert('O pedido foi registrado, mas o link de pagamento não foi recebido. Entre em contato com a loja antes de tentar novamente.')
      setCheckoutSending(false)
      return
    }
    window.location.assign(resultado.checkoutUrl)
  } catch {
    alert('Não foi possível conectar ao servidor. Tente novamente.')
    setCheckoutSending(false)
  }
}}
      >
        <h3>Seus dados</h3>

        <label>Nome completo</label>
        <input
  required
  name="nome"
  placeholder="Digite seu nome completo"
/>

        <label>WhatsApp</label>
        <input
  required
  name="whatsapp"
  type="tel"
  placeholder="(88) 99999-9999"
/>
<label className="whatsapp-optin"><input type="checkbox" name="aceita_whatsapp" /> Quero receber atualizações deste pedido pelo WhatsApp.</label>
<small className="whatsapp-optin-note">Opcional. Ao marcar, você autoriza a Karen Beauty Shop a enviar mensagens sobre este pedido. Você pode parar de recebê-las quando quiser.</small>
<label>E-mail</label>
<input
  required
  name="email"
  type="email"
  placeholder="seuemail@gmail.com"
  autoComplete="email"
  defaultValue={cliente?.email || ''}
  readOnly={Boolean(cliente?.email)}
/>
        <h3>Como deseja receber?</h3>

        <label className="delivery-option">
          <input type="radio" name="delivery" value="delivery" defaultChecked />
          Entrega no endereço
        </label>

        <label className="delivery-option">
          <input type="radio" name="delivery" value="pickup" />
          Retirar na loja
        </label>

        <h3>Endereço de entrega</h3>

        <label>cep</label>
        <input name="cep" placeholder="00000-000" />

        <div className="checkout-fields">
          <div>
            <label>cidade</label>
            <input name="cidade" placeholder="Sua cidade" />
          </div>
          <div>
            <label>estado</label>
            <input name="estado" placeholder="CE" maxLength={2} />
          </div>
        </div>

        <label>endereco</label>
        <input name="endereco" placeholder="Nome da rua" />

        <div className="checkout-fields">
          <div>
            <label>numero</label>
            <input name="numero" placeholder="Número" />
          </div>
          <div>
            <label>complemento</label>
            <input name="complemento" placeholder="Opcional" />
          </div>
        </div>

        <label>bairro</label>
        <input name="bairro" placeholder="Seu bairro" />

        <button className="checkout-button" type="submit" disabled={checkoutSending}>
          {checkoutSending ? 'Preparando pagamento...' : 'Reservar por 30 minutos e pagar →'}
        </button>

        <button
          className="continue-button"
          type="button"
          onClick={() => setCheckoutOpen(false)}
        >
          Voltar para a loja
        </button>
      </form>
    </section>
  </div>
)}

      {cartOpen && (
        <div className="cart-overlay" onClick={() => setCartOpen(false)}>
          <aside
            className="cart-drawer"
            onClick={event => event.stopPropagation()}
          >
            <div className="cart-header">
              <div>
                <span className="eyebrow">SUA SACOLA</span>
                <h2>Meu carrinho ({cartCount})</h2>
              </div>
              <button
                className="cart-close"
                onClick={() => setCartOpen(false)}
                aria-label="Fechar carrinho"
              >
                ×
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="cart-empty">
                <span>♡</span>
                <h3>Sua sacola está vazia</h3>
                <p>Adicione seus produtos favoritos para continuar.</p>
                <button
                  className="add-button"
                  onClick={() => setCartOpen(false)}
                >
                  Continuar comprando
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map(item => (
                    <div className="cart-item" key={cartKey(item.product)}>
                      <div className="cart-item-image">
                        {item.product.imagem ? <img src={item.product.imagem} alt="" /> : item.product.emoji}
                      </div>

                      <div className="cart-item-info">
                        <small>{item.product.category}</small>
                        <strong>{item.product.name}{item.product.variationName ? ` — ${item.product.variationName}` : ''}</strong>
                        <span>{money(item.product.price)}</span>

                        <div className="quantity-control">
                          <button
                            onClick={() => changeQuantity(cartKey(item.product), -1)}
                          >
                            −
                          </button>
                          <span>{item.quantity}</span>
                          <button
                            onClick={() => changeQuantity(cartKey(item.product), 1)}
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <button
                        className="remove-item"
                        onClick={() => removeItem(cartKey(item.product))}
                        aria-label="Remover produto"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>

                <div className="cart-summary">
                  <div>
                    <span>Subtotal</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <div>
                    <span>Entrega</span>
                    <span>A calcular</span>
                  </div>
                  <div className="cart-total">
                    <span>Total dos produtos</span>
                    <strong>{money(total)}</strong>
                  </div>
                  <button
  className="checkout-button"
  onClick={() => {
    setCartOpen(false)
    setCheckoutOpen(true)
  }}
>
  Continuar para finalizar →
</button>
                  <button
                    className="continue-button"
                    onClick={() => setCartOpen(false)}
                  >
                    Continuar comprando
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}

export default App
const API_URL = ''

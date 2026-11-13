import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
const Admin = lazy(() => import('./Admin.tsx'))

const pagina = window.location.pathname

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<main style={{ padding: 32 }}>Carregando painel…</main>}>
      {pagina === '/admin' ? <Admin /> : <App />}
    </Suspense>
  </StrictMode>,
)

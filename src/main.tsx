import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Admin from './Admin.tsx'

const pagina = window.location.pathname

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {pagina === '/admin' ? <Admin /> : <App />}
  </StrictMode>,
)
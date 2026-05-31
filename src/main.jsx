import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import UpdateBanner from './components/UpdateBanner.jsx'

// Registra o service worker SOMENTE nas rotas de painel (onde o push é usado),
// não no site público — limita o blast radius de um SW na marca principal.
if ('serviceWorker' in navigator) {
  const PANEL_HASHES = ['#participante', '#mentor', '#admin']
  let registered = false
  const maybeRegister = () => {
    if (registered) return
    const h = window.location.hash || ''
    if (!PANEL_HASHES.some((p) => h.startsWith(p))) return
    registered = true
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }
  window.addEventListener('load', maybeRegister)
  window.addEventListener('hashchange', maybeRegister)
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && e.data.url) {
      window.location.hash = e.data.url
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <UpdateBanner />
  </StrictMode>,
)

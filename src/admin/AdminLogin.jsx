import { useState } from 'react'

export default function AdminLogin({ onLogin, error: authError }) {
  const [mode, setMode] = useState('admin') // 'admin' | 'viewer'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    const loginEmail = mode === 'viewer' ? 'viewer' : email
    const success = await onLogin(loginEmail, password)
    if (success) {
      window.location.hash = '#admin'
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4">
      <div className="card-glass p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gradient-cyan font-display">
            HackIA SC
          </h1>
          <p className="text-white/60 mt-2 font-mono text-sm">Painel Admin</p>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setMode('admin')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'admin' ? 'bg-cyan/20 text-cyan border border-cyan/30' : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/70'}`}
          >
            Admin
          </button>
          <button
            type="button"
            onClick={() => setMode('viewer')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${mode === 'viewer' ? 'bg-electric/20 text-electric border border-electric/30' : 'bg-white/5 text-white/50 border border-white/10 hover:text-white/70'}`}
          >
            Organização
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {mode === 'admin' && (
            <div>
              <label className="block text-sm text-white/70 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 transition-colors"
                placeholder="admin@hackiasc.com"
              />
            </div>
          )}

          <div>
            <label className="block text-sm text-white/70 mb-1.5">Senha{mode === 'viewer' ? ' da organização' : ''}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {authError && (
            <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`w-full font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${mode === 'admin' ? 'bg-cyan/20 hover:bg-cyan/30 border border-cyan/40 text-cyan' : 'bg-electric/20 hover:bg-electric/30 border border-electric/40 text-electric'}`}
          >
            {loading ? 'Entrando...' : mode === 'viewer' ? 'Entrar como Organização' : 'Entrar como Admin'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.location.hash = '' }}
            className="text-white/40 hover:text-white/60 text-sm transition-colors"
          >
            Voltar ao site
          </a>
        </div>
      </div>
    </div>
  )
}

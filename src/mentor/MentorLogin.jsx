import { useState } from 'react'

export default function MentorLogin({ onLogin, error: authError, loading }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [localError, setLocalError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLocalError(null)
    if (!email.trim()) return setLocalError('Informe o email cadastrado.')
    if (!/^\d{4}$/.test(code.trim())) return setLocalError('O código de acesso tem 4 dígitos.')
    const ok = await onLogin(email, code)
    if (ok) window.location.hash = '#mentor'
  }

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center p-4 bg-grid">
      <div className="orb w-[400px] h-[400px] bg-violet/10 -top-20 -right-20 animate-pulse-glow pointer-events-none" />

      <div className="relative card-glass p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gradient-cyan font-display">HackIA SC</h1>
          <p className="text-white/60 mt-2 font-mono text-sm">Painel do Mentor</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm text-white/70 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 transition-colors"
              placeholder="mentor@email.com"
            />
          </div>

          <div>
            <label className="block text-sm text-white/70 mb-1.5">Código de acesso (4 dígitos)</label>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
              required
              maxLength={4}
              autoComplete="off"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 transition-colors font-mono tracking-[0.5em] text-center text-lg"
              placeholder="0000"
            />
          </div>

          {(localError || authError) && (
            <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">
              {localError || authError}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-cyan/20 hover:bg-cyan/30 border border-cyan/40 text-cyan"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-xs text-white/40 leading-relaxed">
          Use o email e o código de 4 dígitos fornecidos pela organização. Após múltiplas tentativas inválidas o acesso é bloqueado por 1 hora.
        </p>

        <div className="mt-6 text-center">
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); window.location.hash = '' }}
            className="block text-white/40 hover:text-white/60 text-sm transition-colors"
          >
            Voltar ao site
          </a>
        </div>
      </div>
    </div>
  )
}

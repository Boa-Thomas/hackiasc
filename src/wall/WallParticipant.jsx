import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import {
  useWallSession,
  maskCpf,
  cleanCpf,
  ECONOMIC_AXES,
  PHASE_LABELS,
} from './useWallDevice'

const POLL_MS = 3000

// Mapeia codigos de erro server-side para mensagens em pt-BR.
const ERROR_MESSAGES = {
  not_found_or_not_confirmed:
    'Inscrição não encontrada ou pagamento não confirmado. Verifique CPF e data de nascimento.',
  not_confirmed:
    'Sua inscrição não está confirmada. Procure a organização.',
  wall_not_open: 'O muro não está aberto para novas dores.',
  voting_not_open: 'A votação não está aberta.',
  title_required: 'Descreva a dor em uma frase.',
  already_voted: 'Você já votou nessa dor.',
  vote_limit_reached: 'Você já usou seus 3 votos.',
  vote_not_found: 'Você não votou nessa dor.',
  pain_not_found: 'Essa dor não está mais disponível.',
  rate_limited: 'Calma! Aguarde alguns segundos antes de tentar de novo.',
}

function friendlyError(err) {
  const raw = err?.message || ''
  for (const code of Object.keys(ERROR_MESSAGES)) {
    if (raw.includes(code)) return ERROR_MESSAGES[code]
  }
  return raw || 'Algo deu errado. Tente novamente.'
}

export default function WallParticipant() {
  const { session, identify, logout } = useWallSession()

  const [phase, setPhase] = useState(null)
  const [pains, setPains] = useState([])
  const [myVotes, setMyVotes] = useState([])
  const [votesLeft, setVotesLeft] = useState(3)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Form de nova dor
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [axis, setAxis] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busyVote, setBusyVote] = useState(null)

  const registrationId = session?.registration_id || null

  const load = useCallback(async () => {
    if (!supabase) {
      setError('Sistema indisponível no momento.')
      setLoading(false)
      return
    }
    if (!registrationId) {
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase.rpc('wall_list', {
      p_registration_id: registrationId,
    })
    if (err) {
      setError(friendlyError(err))
    } else if (data) {
      setError(null)
      setPhase(data.phase)
      setPains(data.pains || [])
      setMyVotes(data.my_votes || [])
      setVotesLeft(typeof data.votos_restantes === 'number' ? data.votos_restantes : 3)
    }
    setLoading(false)
  }, [registrationId])

  useEffect(() => {
    if (!registrationId) return
    load() // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load, registrationId])

  // Limpa o aviso temporario
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 2500)
    return () => clearTimeout(t)
  }, [notice])

  async function submitPain(e) {
    e.preventDefault()
    if (!supabase || !title.trim() || submitting || !registrationId) return
    setSubmitting(true)
    setError(null)
    const { error: err } = await supabase.rpc('wall_submit_pain', {
      p_registration_id: registrationId,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_axis: axis || null,
    })
    setSubmitting(false)
    if (err) {
      setError(friendlyError(err))
      return
    }
    setTitle('')
    setDescription('')
    setAxis('')
    setNotice('Dor registrada! Aparece no telão.')
    await load()
  }

  async function toggleVote(painId) {
    if (!supabase || busyVote || !registrationId) return
    const hasVoted = myVotes.includes(painId)
    setBusyVote(painId)
    setError(null)
    const rpc = hasVoted ? 'wall_unvote' : 'wall_vote'
    const { error: err } = await supabase.rpc(rpc, {
      p_registration_id: registrationId,
      p_pain_id: painId,
    })
    setBusyVote(null)
    if (err) {
      setError(friendlyError(err))
    }
    await load()
  }

  // Tela de IDENTIFICACAO: CPF + data de nascimento (exige inscricao confirmada)
  if (!session) {
    return <IdentifyScreen onIdentify={identify} />
  }

  return (
    <WallShell>
      <div className="w-full max-w-2xl space-y-5">
        {/* Cabecalho com phase */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-2xl font-display font-bold text-gradient-cyan">Muro de Dores</h2>
            <p className="text-white/50 text-sm">
              Oi, {session.full_name} 👋
              <button
                onClick={logout}
                className="ml-3 text-white/30 hover:text-white/60 text-xs underline transition-colors"
              >
                sair
              </button>
            </p>
          </div>
          <PhaseBadge phase={phase} />
        </div>

        {error && (
          <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>
        )}
        {notice && (
          <div className="bg-cyan/10 border border-cyan/30 rounded-lg px-4 py-2.5 text-cyan text-sm">{notice}</div>
        )}

        {/* Estado fechado */}
        {phase === 'closed' && (
          <div className="card-glass rounded-2xl p-8 text-center">
            <p className="text-white/70">
              O muro ainda não foi aberto. Aguarde a orientação na abertura. 🚀
            </p>
          </div>
        )}

        {/* Form de registro de dor */}
        {phase === 'wall_open' && (
          <form onSubmit={submitPain} className="card-glass rounded-2xl p-6 space-y-4">
            <div>
              <h3 className="font-display font-semibold text-white mb-1">Registre uma dor</h3>
              <p className="text-white/50 text-xs">
                Descreva um <strong>problema real</strong> — não a solução. Seja específico.
              </p>
            </div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="A dor em uma frase"
              maxLength={140}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan/50"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhe (opcional): quem sente, quando, por quê"
              rows={3}
              maxLength={500}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan/50 resize-none"
            />
            <select
              value={axis}
              onChange={(e) => setAxis(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white text-sm focus:outline-none focus:border-cyan/50"
            >
              <option value="">Eixo econômico (opcional)</option>
              {ECONOMIC_AXES.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <button
              type="submit"
              disabled={!title.trim() || submitting}
              className="w-full px-4 py-3 rounded-lg font-semibold bg-hot/20 text-hot border border-hot/40 hover:bg-hot/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Enviando...' : 'Publicar dor'}
            </button>
          </form>
        )}

        {/* Contador de votos */}
        {phase === 'voting_open' && (
          <div className="card-glass rounded-2xl p-4 flex items-center justify-between">
            <span className="text-white/70 text-sm">Vote nas dores que mais te tocam.</span>
            <span className="font-mono text-lg text-gold">{votesLeft} <span className="text-white/40 text-sm">votos restantes</span></span>
          </div>
        )}

        {/* Lista de dores */}
        {(phase === 'wall_open' || phase === 'voting_open') && (
          <div className="space-y-3">
            {loading && !pains.length && <p className="text-white/40 font-mono text-sm">Carregando...</p>}
            {!loading && !pains.length && (
              <p className="text-white/40 text-sm text-center py-6">Nenhuma dor registrada ainda. Seja o primeiro!</p>
            )}
            {pains.map((p) => {
              const voted = myVotes.includes(p.id)
              const canVote = phase === 'voting_open'
              return (
                <div
                  key={p.id}
                  className={`card-glass rounded-xl p-4 flex items-start gap-4 transition-colors ${voted ? 'border-cyan/40' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium">{p.title}</p>
                    {p.description && <p className="text-white/50 text-sm mt-1">{p.description}</p>}
                    <div className="flex items-center gap-2 mt-2 text-xs text-white/40 font-mono">
                      {p.axis && <span className="px-2 py-0.5 rounded-full bg-violet/15 text-violet">{p.axis}</span>}
                      {p.author_name && <span>por {p.author_name}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <span className="font-mono text-xl text-gold">{p.vote_count}</span>
                    {canVote && (
                      <button
                        onClick={() => toggleVote(p.id)}
                        disabled={busyVote === p.id || (!voted && votesLeft <= 0)}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          voted
                            ? 'bg-cyan/20 text-cyan border-cyan/40'
                            : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {voted ? '✓ votado' : 'votar'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </WallShell>
  )
}

// Tela inicial: identificacao por CPF + data de nascimento.
function IdentifyScreen({ onIdentify }) {
  const [cpf, setCpf] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const cpfDigits = cleanCpf(cpf)
  const canSubmit = cpfDigits.length === 11 && !!birthDate && !busy

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await onIdentify(cpf, birthDate)
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <WallShell>
      <form onSubmit={handleSubmit} className="card-glass rounded-2xl p-8 max-w-md w-full">
        <h2 className="text-2xl font-display font-bold text-gradient-cyan mb-2">Muro de Dores</h2>
        <p className="text-white/60 text-sm mb-6">
          Identifique-se para participar. Apenas inscritos com pagamento confirmado podem entrar.
        </p>

        <label className="block text-white/50 text-xs mb-1 font-mono uppercase tracking-wide">CPF</label>
        <input
          value={cpf}
          onChange={(e) => setCpf(maskCpf(e.target.value))}
          placeholder="000.000.000-00"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan/50 mb-4"
        />

        <label className="block text-white/50 text-xs mb-1 font-mono uppercase tracking-wide">Data de nascimento</label>
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-cyan/50 mb-4 [color-scheme:dark]"
        />

        {error && (
          <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm mb-4">{error}</div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full px-4 py-3 rounded-lg font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </WallShell>
  )
}

function PhaseBadge({ phase }) {
  const styles = {
    closed: 'text-white/50 border-white/20',
    wall_open: 'text-hot border-hot/40 bg-hot/10',
    voting_open: 'text-gold border-gold/40 bg-gold/10',
  }
  return (
    <span className={`text-xs font-mono px-3 py-1 rounded-full border ${styles[phase] || styles.closed}`}>
      {PHASE_LABELS[phase] || '...'}
    </span>
  )
}

function WallShell({ children }) {
  return (
    <div className="min-h-screen bg-dark bg-grid flex flex-col items-center px-4 py-10 relative overflow-hidden">
      <div className="orb w-[500px] h-[500px] bg-electric/15 -top-40 -left-40 animate-pulse-glow" aria-hidden />
      <div className="orb w-[400px] h-[400px] bg-violet/15 -bottom-32 -right-32 animate-pulse-glow" style={{ animationDelay: '1.5s' }} aria-hidden />
      <div className="relative z-10 w-full flex flex-col items-center">{children}</div>
    </div>
  )
}

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { ECONOMIC_AXES } from '../wall/useWallSession'

const PHASES = [
  { id: 'closed', label: 'Fechado', help: 'Ninguém registra nem vota.' },
  { id: 'wall_open', label: 'Muro aberto', help: 'Participantes registram dores.' },
  { id: 'voting_open', label: 'Votação aberta', help: 'Participantes votam (até 3).' },
]

// Painel de moderacao do Muro de Dores. Alterna a fase global, lista dores
// (inclui ocultas), oculta/reexibe, mostra ranking + quem votou, e permite
// cadastrar uma dor em nome de um participante confirmado.
export default function AdminWall() {
  const [phase, setPhase] = useState(null)
  const [pains, setPains] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const load = useCallback(async () => {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    const { data, error: err } = await supabase.rpc('wall_admin_list')
    if (err) setError(err.message)
    else if (data) {
      setError(null)
      setPhase(data.phase)
      setPains(data.pains || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    load() // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [load])

  async function setWallPhase(p) {
    if (!supabase || busy || p === phase) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.rpc('wall_set_phase', { p_phase: p })
    setBusy(false)
    if (err) { setError(err.message); return }
    setPhase(p)
    await load()
  }

  async function hide(id) {
    if (!supabase || !window.confirm('Ocultar essa dor do telão?')) return
    const { error: err } = await supabase.rpc('wall_hide_pain', { p_id: id })
    if (err) { alert(`Erro: ${err.message}`); return }
    await load()
  }

  async function unhide(id) {
    if (!supabase) return
    const { error: err } = await supabase.rpc('wall_unhide_pain', { p_id: id })
    if (err) { alert(`Erro: ${err.message}`); return }
    await load()
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  const visible = pains.filter(p => p.status === 'visible')
  const hidden = pains.filter(p => p.status === 'hidden')

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      {/* Controle de fase */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <h3 className="text-white font-semibold mb-1">Fase do muro</h3>
        <p className="text-white/50 text-xs mb-4">Controla o que os participantes podem fazer em <span className="font-mono">/#muro</span> e o que o telão (<span className="font-mono">/#telao</span>) exibe.</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {PHASES.map(p => (
            <button
              key={p.id}
              onClick={() => setWallPhase(p.id)}
              disabled={busy}
              className={`text-left rounded-xl border px-4 py-3 transition-colors disabled:opacity-50 ${
                phase === p.id
                  ? 'bg-cyan/20 text-cyan border-cyan/40'
                  : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="font-semibold flex items-center gap-2">
                {phase === p.id && <span>●</span>}
                {p.label}
              </div>
              <div className="text-xs text-white/40 mt-1">{p.help}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Cadastrar dor em nome de um participante */}
      <AddPainForm phase={phase} onAdded={load} />

      {/* Ranking / dores visiveis */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-white/5 text-white/60 text-xs uppercase font-mono flex justify-between">
          <span>Dores visíveis ({visible.length})</span>
          <span>ordenadas por votos</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {visible.map((p, i) => (
              <PainRow
                key={p.id}
                pain={p}
                index={i}
                expanded={expanded === p.id}
                onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
                onHide={() => hide(p.id)}
              />
            ))}
            {!visible.length && (
              <tr><td className="px-4 py-6 text-center text-white/40">Nenhuma dor registrada ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Dores ocultas */}
      {hidden.length > 0 && (
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-white/5 text-white/60 text-xs uppercase font-mono">
            Ocultas ({hidden.length})
          </div>
          <table className="w-full text-sm">
            <tbody>
              {hidden.map(p => (
                <tr key={p.id} className="border-t border-white/5 opacity-60">
                  <td className="px-2 py-3 w-16 text-center font-mono text-white/40">{p.vote_count}</td>
                  <td className="px-4 py-3 text-white/70 line-through">{p.title}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => unhide(p.id)} className="text-xs text-cyan hover:underline">reexibir</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// Linha de uma dor visivel + (quando expandida) a lista de votantes.
function PainRow({ pain, index, expanded, onToggle, onHide }) {
  const hasVoters = pain.voters && pain.voters.length > 0
  return (
    <>
      <tr className="border-t border-white/5">
        <td className="px-4 py-3 w-12 text-center font-mono text-white/40">#{index + 1}</td>
        <td className="px-2 py-3 w-16 text-center">
          <span className="font-mono text-xl text-gold">{pain.vote_count}</span>
        </td>
        <td className="px-4 py-3">
          <div className="text-white">{pain.title}</div>
          {pain.description && <div className="text-white/50 text-xs mt-0.5">{pain.description}</div>}
          <div className="flex gap-2 mt-1 text-xs text-white/40 font-mono items-center flex-wrap">
            {pain.axis && <span className="px-2 py-0.5 rounded-full bg-violet/15 text-violet">{pain.axis}</span>}
            {pain.author_name && <span>por {pain.author_name}</span>}
            {hasVoters && (
              <button onClick={onToggle} className="text-cyan hover:underline">
                {expanded ? 'ocultar votantes' : `ver votantes (${pain.voters.length})`}
              </button>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <button onClick={onHide} className="text-xs text-hot hover:underline">ocultar</button>
        </td>
      </tr>
      {expanded && hasVoters && (
        <tr className="border-t border-white/5 bg-white/5">
          <td colSpan={4} className="px-4 py-3">
            <VotersList voters={pain.voters} />
          </td>
        </tr>
      )}
    </>
  )
}

// Lista de votantes com nome + contato e botao de copiar.
function VotersList({ voters }) {
  function copyAll() {
    const text = voters.map(v => `${v.full_name}	${v.email}	${v.phone}`).join('\n')
    navigator.clipboard?.writeText(text)
  }
  return (
    <div>
      <div className="flex justify-between items-center mb-2">
        <span className="text-white/60 text-xs uppercase font-mono">{voters.length} votante(s)</span>
        <button onClick={copyAll} className="text-xs text-cyan hover:underline">copiar todos</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        {voters.map((v, i) => (
          <div key={i} className="bg-dark/40 border border-white/5 rounded-lg px-3 py-2">
            <div className="text-white text-sm">{v.full_name}</div>
            <div className="text-white/50 text-xs font-mono">{v.email}</div>
            <div className="text-white/50 text-xs font-mono">{v.phone}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Formulario: busca um inscrito confirmado e cadastra uma dor em nome dele.
function AddPainForm({ phase, onAdded }) {
  const enabled = phase === 'wall_open'
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [axis, setAxis] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function search(e) {
    e.preventDefault()
    if (!supabase || !query.trim()) return
    setSearching(true); setError(null)
    const q = query.trim()
    const digits = q.replace(/\D/g, '')
    const safe = q.replace(/[,()*%]/g, ' ').trim()
    const ors = []
    if (safe) ors.push(`full_name.ilike.%${safe}%`, `email.ilike.%${safe}%`)
    if (digits) ors.push(`cpf.ilike.%${digits}%`)
    if (!ors.length) { setSearching(false); setResults([]); return }
    const { data, error: err } = await supabase
      .from('registrations')
      .select('id, full_name, email, cpf, payment_status')
      .eq('payment_status', 'confirmed')
      .or(ors.join(','))
      .limit(8)
    setSearching(false)
    if (err) { setError(err.message); return }
    setResults(data || [])
  }

  async function submit() {
    if (!supabase || !selected || !title.trim() || submitting) return
    setSubmitting(true); setError(null)
    const { error: err } = await supabase.rpc('wall_admin_add_pain', {
      p_registration_id: selected.id,
      p_title: title.trim(),
      p_description: description.trim() || null,
      p_axis: axis || null,
    })
    setSubmitting(false)
    if (err) { setError(err.message); return }
    setNotice(`Dor adicionada em nome de ${selected.full_name}.`)
    setTitle(''); setDescription(''); setAxis(''); setSelected(null); setResults([]); setQuery('')
    await onAdded()
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <h3 className="text-white font-semibold mb-1">Adicionar dor por participante</h3>
      <p className="text-white/50 text-xs mb-4">A dor é registrada em nome do participante selecionado. Disponível apenas com o muro aberto.</p>

      {!enabled && (
        <div className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-2.5 text-gold text-sm">
          Disponível apenas na fase <span className="font-mono">Muro aberto</span>.
        </div>
      )}

      {enabled && (
        <div className="space-y-3">
          {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2 text-hot text-sm">{error}</div>}
          {notice && <div className="bg-cyan/10 border border-cyan/30 rounded-lg px-4 py-2 text-cyan text-sm">{notice}</div>}

          {!selected ? (
            <form onSubmit={search} className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar inscrito confirmado (nome, email ou CPF)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50"
                />
                <button type="submit" disabled={searching || !query.trim()} className="px-4 py-2.5 rounded-lg bg-cyan/20 text-cyan border border-cyan/40 text-sm disabled:opacity-50">
                  {searching ? '...' : 'Buscar'}
                </button>
              </div>
              {results.length > 0 && (
                <div className="border border-white/10 rounded-lg divide-y divide-white/5">
                  {results.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { setSelected(r); setResults([]) }}
                      className="w-full text-left px-4 py-2 hover:bg-white/5 transition-colors"
                    >
                      <div className="text-white text-sm">{r.full_name}</div>
                      <div className="text-white/40 text-xs font-mono">{r.email}</div>
                    </button>
                  ))}
                </div>
              )}
            </form>
          ) : (
            <div className="flex items-center justify-between bg-cyan/10 border border-cyan/30 rounded-lg px-4 py-2.5">
              <div>
                <div className="text-white text-sm">{selected.full_name}</div>
                <div className="text-white/40 text-xs font-mono">{selected.email}</div>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-white/50 hover:text-white underline">trocar</button>
            </div>
          )}

          {selected && (
            <div className="space-y-3">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="A dor em uma frase"
                maxLength={140}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhe (opcional)"
                rows={2}
                maxLength={500}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50 resize-none"
              />
              <select
                value={axis}
                onChange={(e) => setAxis(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-cyan/50"
              >
                <option value="">Eixo econômico (opcional)</option>
                {ECONOMIC_AXES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <button
                onClick={submit}
                disabled={!title.trim() || submitting}
                className="w-full px-4 py-2.5 rounded-lg font-semibold bg-hot/20 text-hot border border-hot/40 hover:bg-hot/30 disabled:opacity-50 transition-colors"
              >
                {submitting ? 'Adicionando...' : `Adicionar em nome de ${selected.full_name}`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

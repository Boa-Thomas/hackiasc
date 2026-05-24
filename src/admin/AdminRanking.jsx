import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EDITAL_RUBRIC } from '../lib/iaEvaluator'

// Ranking final do evento.
// OFICIAL = média das notas dos jurados humanos (evaluator_type='human').
// A IA Evaluator (evaluator_type='ai') é MENÇÃO complementar, exibida à parte
// e anunciada após o resultado oficial (edital 5.3 / metodologia 9.4).
// Desempate (edital cláusula 11): Execução Técnica e IA > Validação > Escala.

const TIE_ORDER = ['tecnica_ia', 'validacao_problema', 'escala_negocio']
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

function critScore(ev, key) {
  const s = Array.isArray(ev.scores) ? ev.scores.find(x => x.criterion_key === key) : null
  return s && Number.isFinite(Number(s.score)) ? Number(s.score) : null
}

export default function AdminRanking() {
  const [teams, setTeams] = useState([])
  const [evals, setEvals] = useState([])
  const [jurorCount, setJurorCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showAi, setShowAi] = useState(false)

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [t, e, j] = await Promise.all([
      supabase.from('teams').select('id, name, status').order('name'),
      supabase.from('team_evaluations').select('team_id, evaluator_type, total_score, scores, eliminated, summary, model, created_at'),
      supabase.from('jurors').select('id', { count: 'exact', head: true }).eq('active', true),
    ])
    const firstErr = [t, e, j].find(x => x.error)
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    setTeams(t.data ?? []); setEvals(e.data ?? []); setJurorCount(j.count ?? 0)
    setLoading(false)
  }
  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>
  if (error) return <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>

  // Agrega por equipe
  const rows = teams.map(t => {
    const teamEvals = evals.filter(ev => ev.team_id === t.id)
    const human = teamEvals.filter(ev => ev.evaluator_type === 'human')
    const ai = teamEvals
      .filter(ev => ev.evaluator_type === 'ai')
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0] || null

    const officialScore = round1(avg(human.map(ev => ev.total_score).filter(Number.isFinite)))
    const critAverages = {}
    for (const c of EDITAL_RUBRIC.criteria) {
      critAverages[c.key] = round1(avg(human.map(ev => critScore(ev, c.key)).filter(Number.isFinite)))
    }
    return {
      team: t,
      jurorsScored: human.length,
      officialScore,
      critAverages,
      eliminatedVotes: human.filter(ev => ev.eliminated).length,
      aiScore: ai ? round1(ai.total_score) : null,
      aiModel: ai?.model || null,
    }
  })

  // Ordena: maior nota oficial; sem nota vai pro fim; desempate por critério (edital)
  const ranked = [...rows].sort((a, b) => {
    if (a.officialScore == null && b.officialScore == null) return a.team.name.localeCompare(b.team.name)
    if (a.officialScore == null) return 1
    if (b.officialScore == null) return -1
    if (b.officialScore !== a.officialScore) return b.officialScore - a.officialScore
    for (const key of TIE_ORDER) {
      const av = a.critAverages[key] ?? -1
      const bv = b.critAverages[key] ?? -1
      if (bv !== av) return bv - av
    }
    return 0
  })

  // Menção IA Evaluator: maior nota da IA
  const aiTop = [...rows].filter(r => r.aiScore != null).sort((a, b) => b.aiScore - a.aiScore)[0]
  const scoredCount = rows.filter(r => r.officialScore != null).length
  const medalFor = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gradient-cyan font-display">Ranking final</h2>
          <p className="text-xs text-text-muted mt-1">
            Oficial = média de {jurorCount} jurado(s) ativos · {scoredCount} de {teams.length} equipes avaliadas ·
            desempate: Técnica → Validação → Escala
          </p>
        </div>
        <button onClick={fetchData} className="px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30">Atualizar</button>
      </div>

      <div className="bg-gold/5 border border-gold/20 rounded-xl px-4 py-3 text-sm text-gold/90">
        ⚠️ O resultado oficial é o dos <strong>jurados humanos</strong>. A nota da IA Evaluator é
        <strong> menção complementar</strong> e deve ser anunciada <strong>após</strong> o resultado oficial (edital 5.3).
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-white/60 text-xs uppercase">
            <tr>
              <th className="text-left px-4 py-2 w-16">#</th>
              <th className="text-left px-4 py-2">Equipe</th>
              <th className="text-right px-4 py-2">Nota oficial</th>
              <th className="text-right px-4 py-2">Jurados</th>
              {EDITAL_RUBRIC.criteria.map(c => (
                <th key={c.key} className="text-right px-4 py-2 whitespace-nowrap" title={c.label}>{c.label.split(' ')[0]}</th>
              ))}
              <th className="text-center px-4 py-2">Elim.</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((r, i) => {
              const podium = r.officialScore != null && i < 3
              return (
                <tr key={r.team.id} className={`border-t border-white/5 ${podium ? 'bg-gold/5' : ''}`}>
                  <td className="px-4 py-2 text-lg">{r.officialScore != null ? medalFor(i) : '—'}</td>
                  <td className="px-4 py-2 text-white font-medium">{r.team.name}</td>
                  <td className="px-4 py-2 text-right font-mono font-bold text-cyan">{r.officialScore != null ? r.officialScore : '—'}</td>
                  <td className="px-4 py-2 text-right text-white/60">{r.jurorsScored}</td>
                  {EDITAL_RUBRIC.criteria.map(c => (
                    <td key={c.key} className="px-4 py-2 text-right text-white/50 font-mono text-xs">{r.critAverages[c.key] != null ? r.critAverages[c.key] : '—'}</td>
                  ))}
                  <td className="px-4 py-2 text-center">
                    {r.eliminatedVotes > 0
                      ? <span className="text-hot text-xs" title="Jurados que marcaram eliminado no critério técnico">⚠ {r.eliminatedVotes}/{r.jurorsScored}</span>
                      : <span className="text-white/20">·</span>}
                  </td>
                </tr>
              )
            })}
            {!teams.length && <tr><td colSpan={6 + EDITAL_RUBRIC.criteria.length} className="px-4 py-6 text-center text-white/40">Nenhuma equipe.</td></tr>}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-muted">
        ⚠ na coluna Elim. = nº de jurados que marcaram a equipe como eliminada no critério técnico (eliminatório).
        A desclassificação final cabe ao facilitador/organização (edital), não é automática.
      </p>

      {/* Menção IA Evaluator — separada, revelar sob demanda */}
      <div className="card-glass rounded-2xl p-6 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-mono text-violet uppercase tracking-wider">Menção do IA Evaluator</p>
            <p className="text-xs text-text-muted mt-1">Análise complementar — revelar somente após o resultado oficial.</p>
          </div>
          <button onClick={() => setShowAi(v => !v)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-violet/20 text-violet border border-violet/40 hover:bg-violet/30">
            {showAi ? 'Ocultar' : 'Revelar IA'}
          </button>
        </div>
        {showAi && (
          aiTop ? (
            <>
              <p className="text-sm text-white">
                🏅 Melhor avaliada pela IA: <strong>{aiTop.team.name}</strong> — <span className="font-mono text-violet">{aiTop.aiScore}/100</span>
                {aiTop.aiModel ? <span className="text-text-muted text-xs"> ({aiTop.aiModel})</span> : null}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[...rows].filter(r => r.aiScore != null).sort((a, b) => b.aiScore - a.aiScore).map(r => (
                  <div key={r.team.id} className="flex justify-between bg-white/5 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-white/80">{r.team.name}</span>
                    <span className="font-mono text-violet">{r.aiScore}</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-text-muted">Nenhuma avaliação da IA registrada ainda.</p>
        )}
      </div>
    </div>
  )
}

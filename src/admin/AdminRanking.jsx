import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EDITAL_RUBRIC, aggregateTeamEvaluation, DELIVERABLE_UNITS } from '../lib/iaEvaluator'

// Ranking final do evento.
// OFICIAL = média das notas dos jurados humanos (evaluator_type='human').
// A IA Evaluator (evaluator_type='ai') é MENÇÃO complementar, exibida à parte
// e anunciada após o resultado oficial (edital 5.3 / metodologia 9.4).
// Desempate (edital cláusula 11): Execução Técnica e IA > Validação > Escala.

const TIE_ORDER = ['tecnica_ia', 'validacao_problema', 'escala_negocio']
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10)

function escapeCSV(v) {
  if (v == null) return ''
  const s = String(v)
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

function downloadCSV(rows, filename) {
  const BOM = '﻿'
  const blob = new Blob([BOM + rows.map(r => r.map(escapeCSV).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

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
    const [t, e, j, ar] = await Promise.all([
      supabase.from('teams').select('id, name, status').order('name'),
      supabase.from('team_evaluations').select('team_id, evaluator_type, deliverable, total_score, scores, eliminated, created_at'),
      supabase.from('jurors').select('id', { count: 'exact', head: true }).eq('active', true),
      supabase.from('registrations').select('team_id').not('team_id', 'is', null).neq('payment_status', 'cancelled'),
    ])
    const firstErr = [t, e, j, ar].find(x => x.error)
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    // Só equipes com >=1 membro ativo. O trigger sync_registration_team_id cria
    // linhas em teams que nunca são removidas quando a equipe esvazia (equipes-
    // fantasma, ex.: excluídas no admin) e não devem entrar no ranking.
    const activeTeamIds = new Set((ar.data ?? []).map(r => r.team_id))
    setTeams((t.data ?? []).filter(x => activeTeamIds.has(x.id))); setEvals(e.data ?? []); setJurorCount(j.count ?? 0)
    setLoading(false)
  }
  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>
  if (error) return <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>

  // Agrega por equipe
  const rows = teams.map(t => {
    const teamEvals = evals.filter(ev => ev.team_id === t.id)
    const human = teamEvals.filter(ev => ev.evaluator_type === 'human')
    const aiRows = teamEvals.filter(ev => ev.evaluator_type === 'ai' && ev.deliverable != null)
    const aiAgg = aggregateTeamEvaluation(aiRows)

    const officialScore = round1(avg(human.map(ev => ev.total_score).filter(Number.isFinite)))
    const critAverages = {}
    for (const c of EDITAL_RUBRIC.criteria) {
      critAverages[c.key] = round1(avg(human.map(ev => critScore(ev, c.key)).filter(Number.isFinite)))
    }
    // Notas da IA por entregável. São números completos por fase (a nota total do
    // edital só fecha com os 4 critérios / 3 fases). Exibidas como menção parcial,
    // sem contar para o ranking oficial — atende quem quer acompanhar durante o evento.
    const aiPhase = {}
    for (const ev of aiRows) {
      if (Number.isFinite(Number(ev.total_score))) aiPhase[ev.deliverable] = round1(Number(ev.total_score))
    }
    const aiPhaseVals = Object.values(aiPhase)
    return {
      team: t,
      jurorsScored: human.length,
      officialScore,
      critAverages,
      eliminatedVotes: human.filter(ev => ev.eliminated).length,
      aiScore: aiAgg.total_score,
      aiPartial: aiAgg.partial && aiAgg.scoredCriteria > 0,
      aiUnits: aiAgg.evaluatedUnits.length,
      aiPhase,
      aiPhaseCount: aiPhaseVals.length,
      aiPhaseAvg: aiPhaseVals.length ? round1(avg(aiPhaseVals)) : null,
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

  // Menção IA Evaluator — nota final agregada (0–100): só fecha quando os 4 critérios
  // do edital têm nota, o que exige as 3 fases avaliadas. Durante o evento fica vazia.
  const aiTop = [...rows].filter(r => r.aiScore != null).sort((a, b) => b.aiScore - a.aiScore)[0]
  // Quadro parcial: toda equipe com pelo menos 1 entregável avaliado pela IA.
  // Ordena por nº de fases avaliadas (mais completo primeiro) e depois pela média.
  const aiTeams = [...rows].filter(r => r.aiPhaseCount > 0).sort((a, b) =>
    (b.aiPhaseCount - a.aiPhaseCount) || ((b.aiPhaseAvg ?? -1) - (a.aiPhaseAvg ?? -1)) || a.team.name.localeCompare(b.team.name)
  )
  const scoredCount = rows.filter(r => r.officialScore != null).length
  const medalFor = (i) => (i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`)

  function exportRankingCSV() {
    const today = new Date().toISOString().slice(0, 10)
    const critHeaders = EDITAL_RUBRIC.criteria.map(c => c.label)
    const header = [
      'Posicao', 'Equipe',
      'Nota Oficial (media jurados)',
      'Nº Jurados',
      ...critHeaders,
      'Votos Eliminado',
      'Nota IA Evaluator',
    ]
    const dataRows = ranked.map((r, i) => [
      r.officialScore != null ? i + 1 : '',
      r.team.name,
      r.officialScore != null ? r.officialScore : '',
      r.jurorsScored,
      ...EDITAL_RUBRIC.criteria.map(c => r.critAverages[c.key] != null ? r.critAverages[c.key] : ''),
      r.eliminatedVotes,
      r.aiScore != null ? r.aiScore : '',
    ])
    downloadCSV([header, ...dataRows], `ranking-hackia-${today}.csv`)
  }

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
        <div className="flex gap-2">
          <button onClick={fetchData} className="px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30">Atualizar</button>
          <button onClick={exportRankingCSV} disabled={!ranked.length} className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed">Exportar notas (CSV)</button>
        </div>
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

      {/* Menção IA Evaluator — separada, revelar sob demanda. Mostra as notas por
          entregável (parciais durante o evento); a nota final só fecha com as 3 fases. */}
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
          aiTeams.length ? (
            <>
              {aiTop ? (
                <p className="text-sm text-white">
                  🏅 Melhor avaliada pela IA (nota final): <strong>{aiTop.team.name}</strong> — <span className="font-mono text-violet">{aiTop.aiScore}/100</span>
                  <span className="text-text-muted text-xs"> ({aiTop.aiUnits}/3 entregáveis)</span>
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  Parcial — a nota final do edital (0–100) só fecha quando a Fase 3 de cada equipe for avaliada.
                  Abaixo, as notas que a IA já atribuiu por entregável.
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border border-violet/15">
                <table className="w-full text-sm">
                  <thead className="bg-violet/10 text-violet/80 text-xs uppercase">
                    <tr>
                      <th className="text-left px-3 py-2">Equipe</th>
                      {DELIVERABLE_UNITS.map(u => (
                        <th key={u.id} className="text-right px-3 py-2 whitespace-nowrap" title={u.label}>{u.label.split(' · ')[0]}</th>
                      ))}
                      <th className="text-right px-3 py-2">Média*</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiTeams.map(r => (
                      <tr key={r.team.id} className="border-t border-violet/10">
                        <td className="px-3 py-2 text-white/85">{r.team.name}</td>
                        {DELIVERABLE_UNITS.map(u => (
                          <td key={u.id} className="px-3 py-2 text-right font-mono text-violet/90">
                            {r.aiPhase[u.id] != null ? r.aiPhase[u.id] : <span className="text-white/20">—</span>}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-mono font-bold text-violet">{r.aiPhaseAvg != null ? r.aiPhaseAvg : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-text-muted">
                * média das fases já avaliadas pela IA — <strong>não é</strong> a nota final do edital (que pondera os 4 critérios
                e só fecha com as 3 fases). Menção complementar: <strong>não conta</strong> para o ranking oficial.
              </p>
            </>
          ) : <p className="text-sm text-text-muted">Nenhuma avaliação da IA registrada ainda.</p>
        )}
      </div>
    </div>
  )
}

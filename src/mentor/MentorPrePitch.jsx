import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EDITAL_RUBRIC } from '../lib/iaEvaluator'
import PrePitchScorecard, { prePitchTotal } from '../components/PrePitchScorecard'

// Converte array de scores [{key, score, comment}] → objeto {[key]: {score, comment}}
function arrayToObj(arr) {
  const obj = {}
  if (Array.isArray(arr)) {
    arr.forEach(s => { obj[s.key] = { score: s.score ?? '', comment: s.comment ?? '' } })
  }
  return obj
}

// Estado inicial vazio para os 4 critérios
function emptyScores() {
  const obj = {}
  EDITAL_RUBRIC.criteria.forEach(c => { obj[c.key] = { score: '', comment: '' } })
  return obj
}

// Verifica se uma avaliação existe em my_evaluations para (team_id, round)
function findEval(evals, teamId, round) {
  return (evals || []).find(e => e.team_id === teamId && e.round === round) ?? null
}

export default function MentorPrePitch({ token }) {
  const [data, setData] = useState(null)      // { mentor, teams, my_evaluations }
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)

  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [round, setRound] = useState(1)

  const [scores, setScores] = useState(emptyScores)
  const [summary, setSummary] = useState('')

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [savedOk, setSavedOk] = useState(false)

  // Carrega lista ao montar
  useEffect(() => {
    if (!supabase || !token) { setLoading(false); return }
    supabase.rpc('mentor_prepitch_list', { p_token: token })
      .then(({ data: d, error: e }) => {
        if (e || !d) {
          setFetchError('Não foi possível carregar os dados. Tente recarregar a página.')
        } else {
          setData(d)
          // Pré-seleciona a primeira equipe
          if (d.teams && d.teams.length > 0) setSelectedTeamId(d.teams[0].id)
        }
        setLoading(false)
      })
  }, [token])

  // Quando muda equipe ou rodada: carrega avaliação existente ou limpa o form
  useEffect(() => {
    if (!data || !selectedTeamId) return
    const existing = findEval(data.my_evaluations, selectedTeamId, round)
    if (existing) {
      setScores(arrayToObj(existing.scores))
      setSummary(existing.summary ?? '')
    } else {
      setScores(emptyScores())
      setSummary('')
    }
    setSaveError(null)
    setSavedOk(false)
    // NAO incluir `data` nas deps: apos salvar, setData re-dispararia este
    // effect e apagaria o "Salvo OK". O form so precisa recarregar quando muda
    // equipe/rodada — o effect ja le o `data` mais recente quando roda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTeamId, round])

  function handleScoreChange(key, field, value) {
    setSavedOk(false)
    setScores(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }))
  }

  async function handleSave() {
    setSaveError(null)
    setSavedOk(false)

    // Validação client-side
    const criteria = EDITAL_RUBRIC.criteria
    for (const c of criteria) {
      const raw = scores[c.key]?.score
      const n = Number(raw)
      if (raw === '' || raw == null || !Number.isFinite(n) || n < 0 || n > 100) {
        setSaveError(`Preencha a nota de "${c.label}" com um valor entre 0 e 100.`)
        return
      }
    }

    if (!supabase) { setSaveError('Sistema indisponível.'); return }
    setSaving(true)

    const p_scores = criteria.map(c => ({
      key: c.key,
      score: Number(scores[c.key].score),
      comment: scores[c.key].comment ?? '',
    }))

    const { error: err } = await supabase.rpc('mentor_prepitch_submit', {
      p_token: token,
      p_team_id: selectedTeamId,
      p_round: round,
      p_scores,
      p_summary: summary.trim(),
    })

    setSaving(false)
    if (err) {
      setSaveError('Erro ao salvar. Tente novamente.')
      return
    }

    setSavedOk(true)

    // Atualiza my_evaluations localmente
    const total = prePitchTotal(scores)
    setData(prev => {
      if (!prev) return prev
      const existing = findEval(prev.my_evaluations, selectedTeamId, round)
      const newEntry = {
        team_id: selectedTeamId,
        round,
        scores: p_scores,
        total_score: total,
        summary: summary.trim(),
        updated_at: new Date().toISOString(),
      }
      let updated
      if (existing) {
        updated = prev.my_evaluations.map(e =>
          e.team_id === selectedTeamId && e.round === round ? newEntry : e
        )
      } else {
        updated = [...(prev.my_evaluations || []), newEntry]
      }
      return { ...prev, my_evaluations: updated }
    })
  }

  if (loading) {
    return (
      <div className="card-glass rounded-2xl p-8 flex items-center justify-center">
        <p className="text-sm text-text-muted font-mono animate-pulse">Carregando pré-pitches...</p>
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="card-glass rounded-2xl p-6">
        <p className="text-sm text-hot">{fetchError}</p>
      </div>
    )
  }

  if (!data || !data.teams || data.teams.length === 0) {
    return (
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-gold uppercase tracking-wider mb-2">Pré-Pitch</p>
        <p className="text-sm text-text-muted">Nenhuma equipe disponível para avaliação de pré-pitch.</p>
      </div>
    )
  }

  const selectedTeam = data.teams.find(t => t.id === selectedTeamId) ?? data.teams[0]

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-gold uppercase tracking-wider mb-1">Avaliação de Pré-Pitch</p>
        <p className="text-sm text-text-muted">
          Avalie qualquer equipe em até 2 rodadas. Selecione a equipe e a rodada abaixo.
        </p>
      </div>

      {/* Seletor de equipe */}
      <div className="card-glass rounded-2xl p-4 space-y-3">
        <p className="text-xs font-mono text-violet uppercase tracking-wider">Equipe</p>
        <div className="flex flex-wrap gap-2">
          {data.teams.map(t => {
            const hasR1 = !!findEval(data.my_evaluations, t.id, 1)
            const hasR2 = !!findEval(data.my_evaluations, t.id, 2)
            const isActive = selectedTeamId === t.id
            return (
              <button
                key={t.id}
                onClick={() => setSelectedTeamId(t.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                  isActive
                    ? 'border-gold/50 bg-gold/15 text-white'
                    : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
                }`}
              >
                <span className="text-sm">{t.name}</span>
                {(hasR1 || hasR2) && (
                  <span className="flex gap-1">
                    {hasR1 && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-cyan/20 text-cyan border border-cyan/30">R1</span>}
                    {hasR2 && <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-electric/20 text-electric border border-electric/30">R2</span>}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Seletor de rodada */}
      <div className="card-glass rounded-2xl p-4">
        <div className="flex gap-2">
          {[1, 2].map(r => {
            const hasEval = !!findEval(data.my_evaluations, selectedTeamId, r)
            return (
              <button
                key={r}
                onClick={() => setRound(r)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all ${
                  round === r
                    ? 'border-cyan/40 bg-cyan/10 text-cyan'
                    : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
                }`}
              >
                <span className="text-sm font-semibold">Rodada {r}</span>
                {hasEval && (
                  <span className="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-cyan/20 text-cyan border border-cyan/30">avaliada</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Contexto da equipe */}
      {selectedTeam && (
        <div className="card-glass rounded-2xl p-5 space-y-3">
          <div>
            <p className="text-xs font-mono text-violet uppercase tracking-wider mb-1">Contexto da equipe</p>
            <h2 className="text-xl font-bold text-white">{selectedTeam.name}</h2>
          </div>

          {selectedTeam.idea_description && (
            <div className="rounded-xl border border-violet/20 bg-violet/5 px-4 py-3">
              <p className="text-[10px] font-mono uppercase tracking-wider text-violet/70 mb-1">Ideia</p>
              <p className="text-sm text-white/80 whitespace-pre-wrap">{selectedTeam.idea_description}</p>
            </div>
          )}

          {selectedTeam.members && selectedTeam.members.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTeam.members.map((m, i) => (
                <span
                  key={i}
                  className="px-3 py-1 rounded-full text-xs bg-dark border border-dark-border text-text-muted"
                >
                  {m.full_name}{m.is_team_leader ? ' · líder' : ''}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Scorecard */}
      <div className="card-glass rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-xs font-mono text-gold uppercase tracking-wider">
            {selectedTeam?.name} · Rodada {round}
          </p>
          {findEval(data.my_evaluations, selectedTeamId, round) && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan/15 text-cyan border border-cyan/25">já avaliada</span>
          )}
        </div>

        <PrePitchScorecard
          scores={scores}
          summary={summary}
          onScoreChange={handleScoreChange}
          onSummaryChange={v => { setSummary(v); setSavedOk(false) }}
          readOnly={false}
        />

        {saveError && (
          <p className="mt-3 text-sm text-hot">{saveError}</p>
        )}

        <div className="mt-4 flex items-center justify-between flex-wrap gap-2">
          {savedOk ? (
            <span className="text-sm text-cyan font-semibold">Salvo ✓</span>
          ) : (
            <span />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar avaliação'}
          </button>
        </div>
      </div>
    </div>
  )
}

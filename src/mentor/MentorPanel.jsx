import { useState } from 'react'
import { PHASES, HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS, METHOD_PHASES } from '../participant/deliverableFields'
import DeliverableForm from '../participant/DeliverableForm'
import LearningDiary from '../participant/LearningDiary'
import MentorNotes from './MentorNotes'
import SectionMeta from '../participant/SectionMeta'
import { relativeTime } from '../lib/relativeTime'
import { aggregateTeamEvaluation, DELIVERABLE_UNITS } from '../lib/iaEvaluator'
import AiEvaluationView from '../lib/AiEvaluationView'
import EventEvaluationForm from '../lib/EventEvaluationForm'

export default function MentorPanel({ auth }) {
  const { mentor, teams } = auth
  const [sub, setSub] = useState('hypotheses')
  const [activeTeamId, setActiveTeamId] = useState(null)

  // Equipe ativa: a selecionada, senão a primeira. teams vem ordenado por nome.
  const team = teams.find(t => t.id === activeTeamId) ?? teams[0] ?? null
  const meta = team?.deliverable_meta
  // Notas só da equipe ativa (auth.notes traz todas as equipes do mentor).
  const teamNotes = (auth.notes || []).filter(n => n.team_id === team?.id)
  // Avaliacoes da IA da equipe ativa (auth.evaluations traz todas as equipes do mentor).
  const teamEvals = (auth.evaluations || []).filter(e => e.team_id === team?.id)
  const agg = aggregateTeamEvaluation(teamEvals)

  return (
    <div className="min-h-screen bg-dark text-white bg-grid">
      <div className="orb w-[500px] h-[500px] bg-violet/5 -top-40 -right-40 pointer-events-none" />

      <header className="sticky top-0 z-20 bg-dark/80 backdrop-blur border-b border-dark-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = '' }} className="font-mono text-lg font-bold tracking-tight">
              <span className="text-cyan">{'>'}</span>
              <span className="text-white">hack</span>
              <span className="text-gradient-cyan">IA</span>
              <span className="text-text-muted">.sc</span>
            </a>
            <span className="hidden sm:inline-block text-text-muted text-xs font-mono uppercase tracking-wider">/ Painel do Mentor</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm text-white truncate max-w-[200px]">{mentor?.name || mentor?.email}</p>
              <p className="text-xs text-text-muted truncate max-w-[200px]">{mentor?.email}</p>
            </div>
            <button
              onClick={() => { window.location.hash = '#mentor-guia' }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-violet/30 bg-violet/10 text-violet hover:bg-violet/20 transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
              </svg>
              <span className="hidden sm:inline">Guia do Mentor</span>
              <span className="sm:hidden">Guia</span>
            </button>
            <button onClick={auth.logout} className="px-3 py-1.5 text-sm rounded-lg border border-dark-border text-text-muted hover:text-white hover:border-text-muted transition-colors">
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {teams.length === 0 ? (
          <div className="card-glass rounded-2xl p-6">
            <p className="text-xs font-mono text-violet uppercase tracking-wider mb-2">Aguardando pareamento</p>
            <h1 className="text-xl font-bold">Você ainda não foi pareado a uma equipe</h1>
            <p className="text-sm text-text-muted mt-2">
              A organização fará o pareamento mentor↔equipe. Assim que sua equipe for definida, ela aparecerá aqui com os entregáveis e o espaço de ponderações.
            </p>
          </div>
        ) : (
          <>
            {teams.length > 1 && (
              <div className="card-glass rounded-2xl p-4">
                <p className="text-xs font-mono text-violet uppercase tracking-wider mb-2">Suas equipes ({teams.length})</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {teams.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTeamId(t.id)}
                      className={`px-4 py-2 rounded-xl border whitespace-nowrap transition-all ${
                        team?.id === t.id
                          ? 'border-violet/50 bg-violet/15 text-white'
                          : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="card-glass rounded-2xl p-6">
              <p className="text-xs font-mono text-violet uppercase tracking-wider">Sua equipe</p>
              <h1 className="text-2xl font-bold mt-1">{team.name}</h1>
              <div className="mt-4 flex flex-wrap gap-2">
                {(team.members || []).map((m, i) => (
                  <span key={i} className="px-3 py-1 rounded-full text-xs bg-dark border border-dark-border text-text-muted">
                    {m.full_name}{m.is_team_leader ? ' · líder' : ''}{m.is_remote ? ' · remoto' : ''}
                  </span>
                ))}
              </div>
              {team.updated_by_name && (
                <p className="text-xs text-text-muted mt-3">
                  Entregáveis · última edição por {team.updated_by_name} há {relativeTime(team.updated_at)}
                </p>
              )}
              {team.idea_description && (
                <div className="mt-4 rounded-xl border border-violet/20 bg-violet/5 px-4 py-3">
                  <p className="text-[10px] font-mono uppercase tracking-wider text-violet/70 mb-1">Ideia</p>
                  <p className="text-sm text-white/80 whitespace-pre-wrap">{team.idea_description}</p>
                </div>
              )}
            </div>

            <div className="card-glass rounded-2xl p-4">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {PHASES.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setSub(p.id)}
                    className={`flex flex-col items-start px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${
                      sub === p.id
                        ? 'border-cyan/40 bg-cyan/10 text-cyan'
                        : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
                    }`}
                  >
                    <span className="text-[10px] font-mono uppercase opacity-70">{p.phase}</span>
                    <span className="text-sm font-semibold">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {sub === 'hypotheses' && <div className="space-y-2"><SectionMeta meta={meta} field="hypotheses_canvas" /><DeliverableForm readOnly eyebrow="Fase 1 · Ignição" title="Canvas de Hipóteses" fields={HYPOTHESES_FIELDS} value={team.hypotheses_canvas} /></div>}
            {sub === 'slc' && <div className="space-y-2"><SectionMeta meta={meta} field="slc_ia_canvas" /><DeliverableForm readOnly eyebrow="Fase 2 · Construção" title="Canvas SLC-IA" fields={SLC_IA_FIELDS} value={team.slc_ia_canvas} /></div>}
            {sub === 'diary' && <div className="space-y-2"><SectionMeta meta={meta} field="learning_diary" /><LearningDiary readOnly value={team.learning_diary} /></div>}
            {sub === 'final' && <div className="space-y-2"><SectionMeta meta={meta} field="final_deliverables" /><DeliverableForm readOnly eyebrow="Fase 3 · Apresentação" title="Entregas finais" fields={FINAL_FIELDS} value={team.final_deliverables} gridClass="grid grid-cols-1 sm:grid-cols-2 gap-4"
              renderField={(f, ctx) => f.type === 'file-pdf' ? <MentorSlidesInfo deliverables={ctx.value} /> : null} /></div>}

            {/* Avaliação da IA — completa para o mentor (nota + justificativa + parecer) */}
            <div className="card-glass rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-mono text-gold uppercase tracking-wider">Avaliação da IA</p>
                <span className="text-[10px] text-text-muted font-mono">avaliação automática · orientativa</span>
              </div>

              {teamEvals.length === 0 ? (
                <p className="text-sm text-text-muted">A organização ainda não rodou a avaliação da IA desta equipe.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between flex-wrap gap-2 bg-white/5 rounded-xl px-4 py-3">
                    <span className="text-sm text-white/70">Nota IA agregada</span>
                    <span className="font-mono text-gold text-sm">
                      {agg.total_score != null
                        ? `${agg.total_score} / 100`
                        : agg.scoredCriteria > 0
                          ? `parcial (${agg.scoredCriteria}/4 critérios)`
                          : '—'}
                      {agg.eliminated && <span className="ml-2 text-hot">⚠ eliminado</span>}
                    </span>
                  </div>

                  {DELIVERABLE_UNITS.map(unit => {
                    const ev = teamEvals.find(e => e.deliverable === unit.id)
                    if (!ev) return null
                    return (
                      <div key={unit.id} className="border border-dark-border rounded-xl p-4">
                        <AiEvaluationView evaluation={ev} label={unit.label} />
                      </div>
                    )
                  })}

                  <p className="text-[11px] text-text-muted leading-relaxed">
                    Nota orientativa gerada por IA com base nos entregáveis da equipe. A avaliação oficial é feita pelos jurados.
                  </p>
                </>
              )}
            </div>

            <div className="card-glass rounded-2xl p-6 space-y-4">
              <div>
                <p className="text-xs font-mono text-violet uppercase tracking-wider">Minhas ponderações</p>
                <h3 className="text-lg font-bold text-white mt-1">Acompanhamento por fase</h3>
                <p className="text-sm text-text-muted mt-1">
                  Ponderações privadas ficam visíveis só para a organização. As públicas aparecem para a equipe.
                </p>
              </div>
              {METHOD_PHASES.map(mp => (
                <MentorNotes key={`${team.id}-${mp.id}`} phase={mp.id} phaseLabel={mp.label} notes={teamNotes} teamId={team.id} auth={auth} />
              ))}
            </div>
          </>
        )}

        <EventEvaluationForm respondentType="mentor" token={auth.token} />
      </main>
    </div>
  )
}

// Slides do pitch (PDF). O mentor não baixa o arquivo: a edge function
// team-slides valida token de participante (não de mentor), e o storage só
// libera download para admin/equipe. Mostramos o status do envio e, se houver,
// o link antigo (slides_url) de equipes anteriores à migração de upload.
function MentorSlidesInfo({ deliverables }) {
  const data = deliverables || {}
  if (data.slides_path) {
    return (
      <p className="text-sm text-white/80">
        PDF enviado: <span className="font-semibold">{data.slides_name || 'slides.pdf'}</span>
        <span className="text-text-muted"> · download disponível para a organização e a equipe.</span>
      </p>
    )
  }
  if (data.slides_url) {
    return (
      <a href={data.slides_url} target="_blank" rel="noopener noreferrer" className="text-sm text-electric hover:underline break-all">
        {data.slides_url}
      </a>
    )
  }
  return <p className="text-sm text-text-muted">Nenhum slide enviado.</p>
}

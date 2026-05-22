import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { relativeTime } from '../lib/relativeTime'
import { PHASES, HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS } from './deliverableFields'
import DeliverableForm from './DeliverableForm'
import LearningDiary from './LearningDiary'

export default function DeliverablesSection({ auth, goToTeam }) {
  const team = auth.team
  const [sub, setSub] = useState('hypotheses')

  if (!team) return <NoTeamEmptyState onGoToTeam={goToTeam} />

  async function saveDeliverable(field, data) {
    if (!supabase) throw new Error('unavailable')
    const { error } = await supabase.rpc('participant_save_team_deliverable', {
      p_token: auth.token, p_field: field, p_data: data,
    })
    if (error) throw error
    await auth.refreshMe()
  }

  return (
    <div className="space-y-6">
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-electric uppercase tracking-wider">Entregáveis da equipe</p>
        <h2 className="text-xl font-bold text-white mt-1">{team.name}</h2>
        {team.updated_by_name && (
          <p className="text-xs text-text-muted mt-1">
            Última edição por {team.updated_by_name} há {relativeTime(team.updated_at)}
          </p>
        )}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
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

      {sub === 'hypotheses' && (
        <DeliverableForm
          eyebrow="Fase 1 · Ignição" title="Canvas de Hipóteses"
          description="Os 3 saltos de fé: valor, crescimento e técnica de IA."
          fields={HYPOTHESES_FIELDS} value={team.hypotheses_canvas} updatedAt={team.updated_at}
          onSave={d => saveDeliverable('hypotheses_canvas', d)} saveLabel="Salvar Hipóteses"
        />
      )}
      {sub === 'slc' && (
        <DeliverableForm
          eyebrow="Fase 2 · Construção" title="Canvas SLC-IA"
          description="Simples, Adorável, Completo — com IA real rodando."
          fields={SLC_IA_FIELDS} value={team.slc_ia_canvas} updatedAt={team.updated_at}
          onSave={d => saveDeliverable('slc_ia_canvas', d)} saveLabel="Salvar SLC-IA"
        />
      )}
      {sub === 'diary' && (
        <LearningDiary
          value={team.learning_diary} updatedAt={team.updated_at}
          onSave={d => saveDeliverable('learning_diary', d)}
        />
      )}
      {sub === 'final' && (
        <DeliverableForm
          eyebrow="Fase 3 · Apresentação" title="Entregas finais"
          description="Links públicos das entregas exigidas no edital."
          fields={FINAL_FIELDS} value={team.final_deliverables} updatedAt={team.updated_at}
          onSave={d => saveDeliverable('final_deliverables', d)}
          gridClass="grid grid-cols-1 sm:grid-cols-2 gap-4" saveLabel="Salvar Entregas"
        />
      )}

      <PublicMentorNotes
        notes={team.public_notes}
        phase={PHASES.find(p => p.id === sub)?.methodPhase}
      />
    </div>
  )
}

function PublicMentorNotes({ notes, phase }) {
  const list = (notes || []).filter(n => n.phase === phase)
  if (!list.length) return null
  return (
    <div className="card-glass rounded-2xl p-6">
      <p className="text-xs font-mono text-violet uppercase tracking-wider mb-3">Comentários do mentor</p>
      <div className="space-y-3">
        {list.map(n => (
          <div key={n.id} className="rounded-lg border border-violet/20 bg-violet/5 p-3">
            <p className="text-sm text-white whitespace-pre-wrap">{n.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function NoTeamEmptyState({ onGoToTeam }) {
  return (
    <div className="card-glass rounded-2xl p-6">
      <p className="text-xs font-mono text-electric uppercase tracking-wider mb-2">Entregáveis</p>
      <h2 className="text-xl font-bold text-white">Os entregáveis são da equipe</h2>
      <p className="text-sm text-text-muted mt-2">
        Canvas de Hipóteses, SLC-IA, Diário de Aprendizado e as entregas finais são compartilhados
        entre os membros da sua equipe. Entre em uma equipe ou crie a sua para começar a preencher.
      </p>
      <button
        onClick={onGoToTeam}
        className="mt-4 px-4 py-2 rounded-xl text-sm font-semibold bg-electric/10 text-electric border border-electric/30 hover:bg-electric/20 transition-colors"
      >
        Ir para Equipe
      </button>
    </div>
  )
}

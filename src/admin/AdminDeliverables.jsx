import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DeliverableForm from '../participant/DeliverableForm'
import LearningDiary from '../participant/LearningDiary'
import { PHASES, HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS } from '../participant/deliverableFields'
import SectionMeta from '../participant/SectionMeta'
import { relativeTime } from '../lib/relativeTime'
import { buildDeliverablePrompt, parseDeliverableEvaluation, aggregateTeamEvaluation, EDITAL_RUBRIC, DELIVERABLE_UNITS } from '../lib/iaEvaluator'
import AiEvaluationView from '../lib/AiEvaluationView'
import AiAggregateView from '../lib/AiAggregateView'

const STATUS = [
  { id: 'draft', label: 'Rascunho', cls: 'bg-white/5 text-white/50 border-white/10' },
  { id: 'submitted', label: 'Enviada', cls: 'bg-electric/10 text-electric border-electric/30' },
  { id: 'reviewing', label: 'Em análise', cls: 'bg-gold/10 text-gold border-gold/30' },
  { id: 'evaluated', label: 'Avaliada', cls: 'bg-cyan/10 text-cyan border-cyan/30' },
]
const statusMeta = (id) => STATUS.find(s => s.id === id) || STATUS[0]
const PHASE_LABEL = { ignicao: 'Fase 1 · Ignição', construcao: 'Fase 2 · Construção', apresentacao: 'Fase 3 · Apresentação' }

// ISO (UTC, do banco) -> valor de <input type="datetime-local"> no fuso do admin.
function isoToLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminDeliverables({ readOnly = false }) {
  const [teams, setTeams] = useState([])
  const [members, setMembers] = useState([])
  const [notes, setNotes] = useState([])
  const [evals, setEvals] = useState([])
  const [deliverableMeta, setDeliverableMeta] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Prazo de envio dos slides (singleton slides_config; ISO UTC ou null)
  const [slidesDeadline, setSlidesDeadline] = useState(null)
  const [deadlineInput, setDeadlineInput] = useState('')
  const [deadlineSaving, setDeadlineSaving] = useState(false)
  const [deadlineMsg, setDeadlineMsg] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sub, setSub] = useState('hypotheses')
  // Switch global: notas da IA visiveis para os times (app_settings.team_scores_visible)
  const [scoresVisible, setScoresVisible] = useState(false)
  const [scoresSaving, setScoresSaving] = useState(false)

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [t, r, n, e, dm, sd, as] = await Promise.all([
      supabase.from('teams').select('id, name, status, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables, pitch_transcript, pitch_segments, pitch_transcribed_at, updated_at, updated_by').order('name', { ascending: true }),
      supabase.from('registrations').select('team_id, full_name, is_team_leader, payment_status, occupation_type, economic_axes, project_name'),
      supabase.from('mentor_notes').select('id, team_id, phase, body, is_public, created_at, mentors(name, email)').order('created_at', { ascending: false }),
      supabase.from('team_evaluations').select('id, team_id, evaluator_type, deliverable, rubric_version, total_score, eliminated, summary, scores, axes, model, status, created_at, updated_at').order('created_at', { ascending: false }),
      supabase.from('team_deliverable_meta').select('team_id, field, updated_by_name, updated_at'),
      supabase.rpc('get_slides_deadline'),
      supabase.rpc('get_team_scores_visible'),
    ])
    const firstErr = [t, r, n, e, dm, sd].find(x => x.error) // 'as' (flag) e tolerante: erro vira 'desligado', nao quebra a pagina
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    // Só equipes com >=1 membro ativo. O trigger sync_registration_team_id deixa
    // equipes-fantasma na tabela teams (nunca removidas ao esvaziar); filtramos
    // pela verdade (registrations) p/ não exibir equipes vazias/excluídas.
    const activeTeamIds = new Set((r.data ?? []).filter(m => m.team_id && m.payment_status !== 'cancelled').map(m => m.team_id))
    setTeams((t.data ?? []).filter(x => activeTeamIds.has(x.id))); setMembers(r.data ?? []); setNotes(n.data ?? []); setEvals(e.data ?? []); setDeliverableMeta(dm.data ?? [])
    setSlidesDeadline(sd.data ?? null); setDeadlineInput(isoToLocalInput(sd.data))
    setScoresVisible(as.data === true)
    setLoading(false)
  }
  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const memberCount = (teamId) => members.filter(m => m.team_id === teamId && m.payment_status === 'confirmed').length
  const notesFor = (teamId) => notes.filter(n => n.team_id === teamId)
  const evalsFor = (teamId) => evals.filter(ev => ev.team_id === teamId)
  // Meta por seção no mesmo formato consumido por SectionMeta:
  // { <field>: { updated_by_name, updated_at } }
  const metaFor = (teamId) => Object.fromEntries(
    deliverableMeta
      .filter(m => m.team_id === teamId)
      .map(m => [m.field, { updated_by_name: m.updated_by_name, updated_at: m.updated_at }])
  )
  const selected = teams.find(t => t.id === selectedId) || null

  // ---- IA Evaluator por entregável ----
  const aiEvalsFor = (teamId) => evals.filter(ev => ev.team_id === teamId && ev.evaluator_type === 'ai' && ev.deliverable != null)
  const aiEvalFor = (teamId, unitId) => evals.find(ev => ev.team_id === teamId && ev.evaluator_type === 'ai' && ev.deliverable === unitId) || null

  const UNIT_FIELDS = { fase1: ['hypotheses_canvas'], fase2: ['slc_ia_canvas', 'learning_diary'], fase3: ['final_deliverables'] }
  function unitFilled(team, unit) {
    if (unit.id === 'fase2') {
      const slc = team.slc_ia_canvas || {}
      const diary = team.learning_diary
      const slcFilled = Object.values(slc).some(v => v != null && String(v).trim() !== '')
      const diaryFilled = Array.isArray(diary) ? diary.length > 0 : (diary != null && Object.keys(diary || {}).length > 0)
      return slcFilled || diaryFilled
    }
    const obj = team[unit.source] || {}
    return Object.values(obj).some(v => v != null && String(v).trim() !== '')
  }
  function unitStale(team, unit, evalRow) {
    if (!evalRow) return false
    const fields = UNIT_FIELDS[unit.id]
    const evalAt = new Date(evalRow.updated_at || evalRow.created_at).getTime()
    const metaTimes = deliverableMeta
      .filter(m => m.team_id === team.id && fields.includes(m.field) && m.updated_at)
      .map(m => new Date(m.updated_at).getTime())
    return metaTimes.length ? Math.max(...metaTimes) > evalAt : false
  }
  // Fila de pendentes (equipe × entregável): preenchido e (sem avaliação OU editado depois).
  const pendingItems = teams.flatMap(t =>
    DELIVERABLE_UNITS.filter(u => unitFilled(t, u)).map(u => {
      const evalRow = aiEvalFor(t.id, u.id)
      if (!evalRow) return { team: t, unit: u, stale: false }
      return unitStale(t, u, evalRow) ? { team: t, unit: u, stale: true, existing: evalRow } : null
    }).filter(Boolean)
  )

  // Grava o prazo de envio dos slides. O input datetime-local é interpretado no
  // fuso do admin (provável BRT) e convertido para ISO UTC; toda a comparação de
  // tempo acontece no banco (slides_upload_allowed). p_deadline null remove o prazo.
  async function saveDeadline() {
    if (!supabase) return
    setDeadlineMsg(null)
    const iso = deadlineInput ? new Date(deadlineInput).toISOString() : null
    if (deadlineInput && Number.isNaN(new Date(deadlineInput).getTime())) {
      setDeadlineMsg({ kind: 'err', text: 'Data inválida.' }); return
    }
    setDeadlineSaving(true)
    const { data, error: err } = await supabase.rpc('set_slides_deadline', { p_deadline: iso })
    setDeadlineSaving(false)
    if (err) { setDeadlineMsg({ kind: 'err', text: `Erro: ${err.message}` }); return }
    setSlidesDeadline(data ?? null)
    setDeadlineInput(isoToLocalInput(data))
    setDeadlineMsg({ kind: 'ok', text: data ? `Prazo salvo: ${new Date(data).toLocaleString('pt-BR')}` : 'Prazo removido (sem data de corte).' })
  }

  async function clearDeadline() {
    if (!supabase) return
    setDeadlineMsg(null)
    setDeadlineSaving(true)
    const { error: err } = await supabase.rpc('set_slides_deadline', { p_deadline: null })
    setDeadlineSaving(false)
    if (err) { setDeadlineMsg({ kind: 'err', text: `Erro: ${err.message}` }); return }
    setSlidesDeadline(null); setDeadlineInput('')
    setDeadlineMsg({ kind: 'ok', text: 'Prazo removido (sem data de corte).' })
  }

  // Liga/desliga a visibilidade das notas da IA para os times (RPC admin-only).
  async function toggleScoresVisible() {
    if (!supabase || scoresSaving) return
    const next = !scoresVisible
    setScoresSaving(true)
    setScoresVisible(next)
    const { error: err } = await supabase.rpc('set_team_scores_visible', { p_visible: next })
    setScoresSaving(false)
    if (err) { setScoresVisible(!next); alert(`Erro ao salvar: ${err.message}`) }
  }

  async function changeStatus(teamId, status) {
    if (!supabase) return
    const { error: err } = await supabase.from('teams').update({ status }).eq('id', teamId)
    if (err) { alert(`Erro: ${err.message}`); return }
    setTeams(ts => ts.map(t => t.id === teamId ? { ...t, status } : t))
  }

  function exportCSV() {
    const flat = [
      ...HYPOTHESES_FIELDS.map(f => ({ field: 'hypotheses_canvas', key: f.key, label: `Hipóteses · ${f.label}` })),
      ...SLC_IA_FIELDS.map(f => ({ field: 'slc_ia_canvas', key: f.key, label: `SLC-IA · ${f.label}` })),
      ...FINAL_FIELDS.map(f => ({ field: 'final_deliverables', key: f.key, label: `Final · ${f.label}` })),
    ]
    const headers = ['Equipe', 'Status', 'Membros', 'Atualizado em', ...flat.map(c => c.label)]
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = teams.map(t => {
      const cells = [t.name, statusMeta(t.status).label, memberCount(t.id), t.updated_at || '']
      for (const c of flat) {
        const obj = t[c.field] || {}
        // O campo de slides é um upload: exporta o nome do arquivo (ou o link
        // antigo, p/ equipes anteriores à migração), não a chave inexistente.
        if (c.field === 'final_deliverables' && c.key === 'slides') {
          cells.push(obj.slides_name || obj.slides_url || '')
        } else {
          cells.push(obj[c.key] || '')
        }
      }
      return cells.map(esc).join(',')
    })
    const csv = '﻿' + [headers.map(esc).join(','), ...rows].join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `entregas-hackia-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <p className="text-white/60 font-mono">Carregando...</p>

  if (selected) {
    const tnotes = notesFor(selected.id)
    const tevals = evalsFor(selected.id)
    const tmeta = metaFor(selected.id)
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <button onClick={() => setSelectedId(null)} className="text-sm text-white/60 hover:text-white">← Todas as equipes</button>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50">Status:</span>
            {readOnly ? (
              <span className={`px-3 py-1 rounded-full text-xs border ${statusMeta(selected.status).cls}`}>{statusMeta(selected.status).label}</span>
            ) : (
              <select value={selected.status} onChange={e => changeStatus(selected.id, e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-cyan/50">
                {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            )}
          </div>
        </div>

        <div className="card-glass rounded-2xl p-6">
          <p className="text-xs font-mono text-cyan uppercase tracking-wider">Equipe</p>
          <h1 className="text-2xl font-bold mt-1">{selected.name}</h1>
          <p className="text-xs text-text-muted mt-2">{memberCount(selected.id)} membros · última edição {selected.updated_at ? `há ${relativeTime(selected.updated_at)}` : '—'}</p>
        </div>

        <div className="card-glass rounded-2xl p-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {PHASES.map(p => (
              <button key={p.id} onClick={() => setSub(p.id)} className={`flex flex-col items-start px-4 py-2 rounded-xl border transition-all whitespace-nowrap ${sub === p.id ? 'border-cyan/40 bg-cyan/10 text-cyan' : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'}`}>
                <span className="text-[10px] font-mono uppercase opacity-70">{p.phase}</span>
                <span className="text-sm font-semibold">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {sub === 'hypotheses' && <div className="space-y-2"><SectionMeta meta={tmeta} field="hypotheses_canvas" /><DeliverableForm readOnly eyebrow="Fase 1 · Ignição" title="Canvas de Hipóteses" fields={HYPOTHESES_FIELDS} value={selected.hypotheses_canvas} /></div>}
        {sub === 'slc' && <div className="space-y-2"><SectionMeta meta={tmeta} field="slc_ia_canvas" /><DeliverableForm readOnly eyebrow="Fase 2 · Construção" title="Canvas SLC-IA" fields={SLC_IA_FIELDS} value={selected.slc_ia_canvas} /></div>}
        {sub === 'diary' && <div className="space-y-2"><SectionMeta meta={tmeta} field="learning_diary" /><LearningDiary readOnly value={selected.learning_diary} /></div>}
        {sub === 'final' && <div className="space-y-2"><SectionMeta meta={tmeta} field="final_deliverables" /><DeliverableForm readOnly eyebrow="Fase 3 · Apresentação" title="Entregas finais" fields={FINAL_FIELDS} value={selected.final_deliverables} gridClass="grid grid-cols-1 sm:grid-cols-2 gap-4"
          renderField={(f, ctx) => f.type === 'file-pdf' ? <AdminSlidesDownload deliverables={ctx.value} /> : null} /></div>}

        <div className="card-glass rounded-2xl p-6 space-y-4">
          <div>
            <p className="text-xs font-mono text-violet uppercase tracking-wider">Comentários dos mentores</p>
            <h3 className="text-lg font-bold text-white mt-1">{tnotes.length} {tnotes.length === 1 ? 'comentário' : 'comentários'}</h3>
          </div>
          {!tnotes.length && <p className="text-sm text-text-muted">Nenhum comentário de mentor ainda.</p>}
          {tnotes.map(n => (
            <div key={n.id} className="border border-dark-border rounded-xl p-4">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <span className="text-sm font-semibold text-white">{n.mentors?.name || n.mentors?.email || 'Mentor'}</span>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/5 text-white/60 border border-white/10">{PHASE_LABEL[n.phase] || n.phase}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono uppercase border ${n.is_public ? 'bg-cyan/10 text-cyan border-cyan/30' : 'bg-hot/10 text-hot border-hot/30'}`}>{n.is_public ? 'pública' : 'privada'}</span>
                </div>
              </div>
              <p className="text-sm text-white/80 whitespace-pre-wrap">{n.body}</p>
              <p className="text-xs text-text-muted mt-2">há {relativeTime(n.created_at)}</p>
            </div>
          ))}
        </div>

        {(() => {
          const teamAi = aiEvalsFor(selected.id)
          const agg = aggregateTeamEvaluation(teamAi)
          const humanEvals = tevals.filter(ev => ev.evaluator_type === 'human')
          return (
            <div className="card-glass rounded-2xl p-6 space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs font-mono text-gold uppercase tracking-wider">Avaliações por entregável — IA Evaluator</p>
                <span className="text-[10px] text-text-muted font-mono">{EDITAL_RUBRIC.version} · Técnica 30% (elim.) · Validação 25% · Escala 25% · Pitch 20%</span>
              </div>

              {/* Nota IA agregada da equipe */}
              <AiAggregateView agg={agg} />

              {DELIVERABLE_UNITS.map(unit => (
                <DeliverableEvaluator
                  key={`${selected.id}:${unit.id}`}
                  unit={unit}
                  team={selected}
                  members={members}
                  notes={notes}
                  existing={aiEvalFor(selected.id, unit.id)}
                  onSaved={fetchData}
                  readOnly={readOnly}
                />
              ))}

              {/* Notas dos jurados (holístico, leitura) */}
              {humanEvals.length > 0 && (
                <div className="border-t border-dark-border pt-4 space-y-2">
                  <p className="text-xs font-mono text-electric uppercase tracking-wider">Notas dos jurados (oficial)</p>
                  {humanEvals.map(ev => (
                    <div key={ev.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-1.5 text-sm">
                      <span className="text-white/70">Jurado</span>
                      <span className="font-mono text-cyan">{ev.total_score != null ? `${ev.total_score} / 100` : ev.status}{ev.eliminated ? ' · ⚠' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })()}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

      <AllSlidesDownload teams={teams} />

      <div className="card-glass rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-xs font-mono text-gold uppercase tracking-wider">Prazo de envio dos slides (PDF)</p>
            <p className="text-sm text-white/70 mt-1">
              {slidesDeadline
                ? <>Data de corte atual: <span className="font-semibold text-white">{new Date(slidesDeadline).toLocaleString('pt-BR')}</span>{new Date(slidesDeadline) < new Date() && <span className="ml-2 text-hot">(encerrado)</span>}</>
                : 'Sem data de corte — equipes podem enviar a qualquer momento.'}
            </p>
          </div>
        </div>
        {!readOnly && (
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="text-xs text-text-muted block mb-1">Definir prazo (seu fuso horário)</label>
              <input type="datetime-local" value={deadlineInput} onChange={e => setDeadlineInput(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-cyan/50" />
            </div>
            <button onClick={saveDeadline} disabled={deadlineSaving}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-40">
              {deadlineSaving ? 'Salvando...' : 'Salvar prazo'}
            </button>
            {slidesDeadline && (
              <button onClick={clearDeadline} disabled={deadlineSaving}
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-dark-border text-text-muted hover:text-white disabled:opacity-40">
                Remover prazo
              </button>
            )}
          </div>
        )}
        {deadlineMsg && (
          <div className={`rounded-lg px-3 py-2 text-sm border ${deadlineMsg.kind === 'ok' ? 'bg-cyan/10 border-cyan/30 text-cyan' : 'bg-hot/10 border-hot/30 text-hot'}`}>{deadlineMsg.text}</div>
        )}
      </div>

      {!readOnly && (
        <div className="card-glass rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-mono text-gold uppercase tracking-wider">Notas da IA visíveis para os times</p>
              <p className="text-sm text-white/70 mt-1">
                {scoresVisible
                  ? 'Ligado — cada equipe vê a nota (0–100) de cada fase no painel.'
                  : 'Desligado — as notas ficam só aqui e no ranking.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={scoresVisible}
              onClick={toggleScoresVisible}
              disabled={scoresSaving}
              className={`relative inline-flex h-7 w-12 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-40 ${scoresVisible ? 'bg-cyan/80' : 'bg-white/15'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${scoresVisible ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-white/60">{teams.length} equipes</p>
            <button onClick={exportCSV} className="px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30">Exportar CSV</button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-white/60 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-2">Equipe</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Membros</th>
                  <th className="text-right px-4 py-2">Comentários</th>
                  <th className="text-left px-4 py-2">Atualizado</th>
                  <th className="text-right px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {teams.map(t => (
                  <tr key={t.id} className="border-t border-white/5 hover:bg-white/5 cursor-pointer" onClick={() => { setSelectedId(t.id); setSub('hypotheses') }}>
                    <td className="px-4 py-2 text-white font-medium">{t.name}</td>
                    <td className="px-4 py-2"><span className={`px-2.5 py-0.5 rounded-full text-xs border ${statusMeta(t.status).cls}`}>{statusMeta(t.status).label}</span></td>
                    <td className="px-4 py-2 text-right text-white/70">{memberCount(t.id)}</td>
                    <td className="px-4 py-2 text-right text-white/70">{notesFor(t.id).length}</td>
                    <td className="px-4 py-2 text-white/50 text-xs">{t.updated_at ? relativeTime(t.updated_at) : '—'}</td>
                    <td className="px-4 py-2 text-right"><span className="text-xs text-electric">ver →</span></td>
                  </tr>
                ))}
                {!teams.length && <tr><td colSpan={6} className="px-4 py-6 text-center text-white/40">Nenhuma equipe ainda.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {!readOnly && (
          <PendingQueue
            items={pendingItems}
            members={members}
            notes={notes}
            onSaved={fetchData}
          />
        )}
      </div>
    </div>
  )
}

// Download dos slides (PDF) pelo admin. Admin é authenticated e a policy de
// storage permite SELECT sob deliverables/ → gera signed URL direto.
// Compat: se a equipe só tem slides_url (URL antiga), mostra o link.
function AdminSlidesDownload({ deliverables }) {
  const data = deliverables || {}
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!data.slides_path) {
    if (data.slides_url) {
      return (
        <a href={data.slides_url} target="_blank" rel="noopener noreferrer" className="text-sm text-electric hover:underline break-all">
          {data.slides_url}
        </a>
      )
    }
    return <p className="text-sm text-text-muted">Nenhum slide enviado.</p>
  }

  async function download() {
    setError(null)
    if (!supabase) { setError('Supabase não configurado.'); return }
    setBusy(true)
    const { data: signed, error: err } = await supabase.storage.from('files').createSignedUrl(data.slides_path, 60)
    setBusy(false)
    if (err || !signed?.signedUrl) { setError('Falha ao gerar o link.'); return }
    window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm text-white/80">{data.slides_name || 'slides.pdf'}</span>
      <button type="button" onClick={download} disabled={busy}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-50">
        {busy ? '...' : 'Baixar slides'}
      </button>
      {error && <span className="text-xs text-hot">{error}</span>}
    </div>
  )
}

// Card central: baixar num lugar só o PDF de apresentação de cada equipe.
// Lista todas as equipes (marcando as pendentes), mostra a ORDEM DE ENTREGA
// (horário real do upload, lido do Storage) e oferece "Baixar todas", que
// dispara um download por equipe em sequência (sem zip, sem dependência nova).
// Reusa o bucket `files` (slides em deliverables/<team_id>/slides.pdf via slides_path).
function AllSlidesDownload({ teams }) {
  const [busyId, setBusyId] = useState(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const [error, setError] = useState(null)
  // Mapa team_id -> ISO do upload do PDF (created_at/updated_at do objeto no Storage).
  const [uploadedAt, setUploadedAt] = useState({})
  const [timesLoading, setTimesLoading] = useState(false)

  const hasSlides = (t) => { const d = t.final_deliverables || {}; return !!(d.slides_path || d.slides_url) }
  const withSlides = teams.filter(hasSlides)

  // Busca o horário real de upload de cada PDF no Storage (o admin é authenticated
  // e a policy permite listar deliverables/). É a fonte fiel da "ordem de entrega":
  // independe de edições posteriores de outros campos da entrega final.
  useEffect(() => {
    if (!supabase) return
    const pathTeams = teams.filter(t => t.final_deliverables?.slides_path)
    if (!pathTeams.length) { setUploadedAt({}); return } // eslint-disable-line react-hooks/set-state-in-effect
    let active = true
    setTimesLoading(true)
    Promise.all(pathTeams.map(async (t) => {
      const p = t.final_deliverables.slides_path
      const slash = p.lastIndexOf('/')
      if (slash < 0) return [t.id, null]
      const folder = p.slice(0, slash)
      const base = p.slice(slash + 1)
      const { data: list } = await supabase.storage.from('files').list(folder)
      const obj = (list || []).find(o => o.name === base)
      return [t.id, obj?.updated_at || obj?.created_at || null]
    })).then(pairs => {
      if (!active) return
      setUploadedAt(Object.fromEntries(pairs))
      setTimesLoading(false)
    }).catch(() => { if (active) setTimesLoading(false) })
    return () => { active = false }
  }, [teams])

  // Gera o link e dispara o download de UMA equipe. slides_path -> signed URL com
  // download forçado (nome certo); slides_url (legado) -> abre o link em nova aba.
  async function downloadOne(team) {
    const d = team.final_deliverables || {}
    if (d.slides_path) {
      const name = d.slides_name || `${team.name}.pdf`
      const { data: signed, error: err } = await supabase.storage.from('files').createSignedUrl(d.slides_path, 60, { download: name })
      if (err || !signed?.signedUrl) throw new Error('Falha ao gerar o link.')
      const a = document.createElement('a')
      a.href = signed.signedUrl
      a.download = name
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
      return
    }
    if (d.slides_url) window.open(d.slides_url, '_blank', 'noopener,noreferrer')
  }

  async function handleOne(team) {
    setError(null)
    if (!supabase) { setError('Supabase não configurado.'); return }
    setBusyId(team.id)
    try { await downloadOne(team) } catch (e) { setError(e.message) }
    setBusyId(null)
  }

  // Baixa todas na ordem de entrega, com um respiro entre elas (o navegador pede
  // permissão p/ múltiplos downloads na 1ª vez). Pendentes são ignoradas.
  async function handleAll() {
    setError(null)
    if (!supabase) { setError('Supabase não configurado.'); return }
    setBulkBusy(true)
    for (const { team } of rows) {
      if (!hasSlides(team)) continue
      try { await downloadOne(team) } catch { /* segue p/ as próximas */ }
      await new Promise(r => setTimeout(r, 600))
    }
    setBulkBusy(false)
  }

  // Ordena por horário de entrega: quem tem horário conhecido primeiro (asc),
  // depois enviados sem horário (legado/URL ou ainda carregando), pendentes por
  // último (alfabético). O número (#1, #2…) é a ordem de entrega.
  const enriched = teams.map(t => ({ team: t, at: uploadedAt[t.id] || null, has: hasSlides(t) }))
  const timed = enriched.filter(e => e.has && e.at).sort((a, b) => new Date(a.at) - new Date(b.at))
  const untimed = enriched.filter(e => e.has && !e.at).sort((a, b) => a.team.name.localeCompare(b.team.name, 'pt-BR'))
  const pending = enriched.filter(e => !e.has).sort((a, b) => a.team.name.localeCompare(b.team.name, 'pt-BR'))
  const orderOf = new Map(timed.map((e, i) => [e.team.id, i + 1]))
  const rows = [...timed, ...untimed, ...pending]

  const fmt = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="card-glass rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-mono text-electric uppercase tracking-wider">Apresentações (PDF)</p>
          <p className="text-sm text-white/70 mt-1">
            {withSlides.length} de {teams.length} equipes enviaram · em ordem de entrega
            {timesLoading && <span className="text-text-muted"> · carregando horários…</span>}
          </p>
        </div>
        <button onClick={handleAll} disabled={bulkBusy || !withSlides.length}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-40 disabled:cursor-not-allowed">
          {bulkBusy ? 'Baixando...' : `Baixar todas (${withSlides.length})`}
        </button>
      </div>
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-3 py-2 text-hot text-sm">{error}</div>}
      <div className="divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden">
        {rows.map(({ team: t, at }) => {
          const d = t.final_deliverables || {}
          const has = !!(d.slides_path || d.slides_url)
          const ord = orderOf.get(t.id)
          return (
            <div key={t.id} className="px-4 py-2.5 bg-white/5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`flex-shrink-0 w-8 text-center font-mono text-sm ${ord ? 'text-cyan font-bold' : 'text-white/30'}`}>{ord ? `#${ord}` : '—'}</span>
                  <div className="min-w-0">
                    <p className="text-sm text-white font-medium truncate">{t.name}</p>
                    <p className="text-xs text-text-muted truncate">
                      {has ? (at ? `enviado ${fmt(at)}` : (d.slides_name || d.slides_url || 'slides.pdf')) : 'Sem envio'}
                    </p>
                  </div>
                </div>
                {has ? (
                  d.slides_path ? (
                    <button onClick={() => handleOne(t)} disabled={busyId === t.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-50 whitespace-nowrap">
                      {busyId === t.id ? '...' : 'Baixar'}
                    </button>
                  ) : (
                    <a href={d.slides_url} target="_blank" rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 whitespace-nowrap">
                      Abrir
                    </a>
                  )
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-white/5 text-white/40 border border-white/10 whitespace-nowrap">Pendente</span>
                )}
              </div>
              {d.repo_url && <div className="mt-1.5 pl-11"><RepoLink url={d.repo_url} /></div>}
            </div>
          )
        })}
        {!teams.length && <div className="px-4 py-6 text-center text-white/40">Nenhuma equipe ainda.</div>}
      </div>
    </div>
  )
}

// Link do repositório no GitHub (final_deliverables.repo_url) com botão de copiar.
// Estado de "copiado" por linha; o feedback some após ~1.8s.
function RepoLink({ url }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800) } catch { /* clipboard indisponível */ }
  }
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="flex-shrink-0 text-[10px] font-mono uppercase tracking-wider text-white/40">GitHub</span>
      {/^https?:\/\//i.test(url)
        ? <a href={url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-xs text-electric hover:underline">{url}</a>
        : <span className="min-w-0 truncate text-xs text-white/70">{url}</span>}
      <button type="button" onClick={copy}
        className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold border border-white/10 text-white/60 hover:text-white hover:border-white/30">
        {copied ? '✓ copiado' : 'copiar'}
      </button>
    </div>
  )
}

// Avaliador de UM entregável (copiar pacote → colar JSON → gravar). Reutilizado no
// detalhe da equipe e no card lateral de pendentes. SELECT-then-UPDATE/INSERT
// (índice parcial não é conflict target confiável no PostgREST).
function DeliverableEvaluator({ unit, team, members, notes, existing, onSaved, readOnly, compact = false }) {
  const [pitchNotes, setPitchNotes] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [packageText, setPackageText] = useState('')
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const teamMembers = members.filter(m => m.team_id === team.id && m.payment_status === 'confirmed')
  const teamNotes = notes.filter(n => n.team_id === team.id && n.is_public)

  async function copyPackage() {
    setError(null)
    const pkg = buildDeliverablePrompt({ unit, team, members: teamMembers, mentorNotes: teamNotes, pitchNotes })
    try {
      await navigator.clipboard.writeText(pkg)
      setCopied(true); setPackageText(''); setTimeout(() => setCopied(false), 2500)
    } catch {
      setPackageText(pkg)
    }
  }

  async function save() {
    setError(null)
    let parsed
    try { parsed = parseDeliverableEvaluation(jsonInput, unit) }
    catch (e) { setError(e.message); return }
    if (!supabase) { setError('Supabase não configurado.'); return }
    setSaving(true)
    const payload = {
      team_id: team.id, evaluator_type: 'ai', deliverable: unit.id,
      rubric_version: EDITAL_RUBRIC.version, scores: parsed.scores,
      axes: parsed.axes ?? null,
      total_score: parsed.total_score, eliminated: parsed.eliminated,
      summary: parsed.summary, model: parsed.model, status: 'done',
      updated_at: new Date().toISOString(),
    }
    const { error: err } = existing
      ? await supabase.from('team_evaluations').update(payload).eq('id', existing.id)
      : await supabase.from('team_evaluations').insert(payload)
    setSaving(false)
    if (err) { setError(`Erro ao gravar: ${err.message}`); return }
    setJsonInput(''); setPitchNotes(''); setPackageText('')
    onSaved?.()
  }

  return (
    <div className="border border-dark-border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-semibold text-white">{unit.label}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {unit.criteria.map(k => {
            const c = EDITAL_RUBRIC.criteria.find(x => x.key === k)
            return <span key={k} className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/5 text-white/60 border border-white/10">{c.label} {c.weight}%</span>
          })}
        </div>
      </div>

      {/* Avaliação gravada (render compartilhado com o painel do mentor) */}
      <AiEvaluationView evaluation={existing} />

      {/* Controles (copiar → colar → gravar) */}
      {!readOnly && (
        <div className="space-y-2 pt-1">
          {unit.hasAxes && <PitchAudioPanel team={team} onTranscribed={onSaved} />}
          {unit.showsPitchNotes && (
            <textarea value={pitchNotes} onChange={e => setPitchNotes(e.target.value)} rows={compact ? 2 : 3}
              placeholder="Observações do pitch / demo ao vivo (entram no pacote): a IA rodou? evidências de tração? respostas aos jurados?"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={copyPackage} className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30">
              {copied ? '✓ copiado' : '1. Copiar pacote'}
            </button>
            <button onClick={save} disabled={saving || !jsonInput.trim()}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed">
              {saving ? 'Gravando...' : existing ? '3. Regravar' : '3. Gravar'}
            </button>
          </div>
          {packageText && (
            <textarea readOnly value={packageText} rows={4} onFocus={e => e.target.select()}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/70 text-xs font-mono" />
          )}
          <textarea value={jsonInput} onChange={e => setJsonInput(e.target.value)} rows={compact ? 3 : 5}
            placeholder='2. Cole o JSON do Claude: { "scores": [...], "summary": "...", "model": "..." }'
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan/50" />
          {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-3 py-2 text-hot text-sm">{error}</div>}
        </div>
      )}
    </div>
  )
}

// Card lateral: fila de (equipe × entregável) pendentes. Expande 1 por vez.
function PendingQueue({ items, members, notes, onSaved }) {
  const [activeKey, setActiveKey] = useState(null)
  return (
    <aside className="card-glass rounded-2xl p-4 lg:sticky lg:top-20 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-mono text-gold uppercase tracking-wider">Pendentes</p>
        <span className="text-xs font-mono text-white/50">{items.length}</span>
      </div>
      {!items.length && <p className="text-sm text-text-muted">Nada pendente — tudo avaliado. 🎉</p>}
      <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
        {items.map(({ team, unit, stale, existing }) => {
          const key = `${team.id}:${unit.id}`
          const open = activeKey === key
          return (
            <div key={key} className="border border-dark-border rounded-xl">
              <button onClick={() => setActiveKey(open ? null : key)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-white/5 rounded-xl">
                <span className="text-sm text-white truncate">▸ {team.name} <span className="text-white/40">· {unit.label.split(' · ')[0]}</span></span>
                {stale && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-mono bg-gold/10 text-gold border border-gold/30 whitespace-nowrap">atualizado</span>}
              </button>
              {open && (
                <div className="p-2 pt-0">
                  <DeliverableEvaluator
                    unit={unit}
                    team={team}
                    members={members}
                    notes={notes}
                    existing={existing || null}
                    onSaved={onSaved}
                    compact
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

// Upload do áudio do pitch + transcrição via Whisper (edge fn transcribe-pitch).
// Só aparece na Fase 3. Áudio em deliverables/<team_id>/pitch.<ext> (bucket `files`).
// O admin é authenticated → policy deliverables_storage_admin_insert permite o upload.
function PitchAudioPanel({ team, onTranscribed }) {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [msg, setMsg] = useState(null)
  const [showTranscript, setShowTranscript] = useState(false)

  const hasTranscript = !!team.pitch_transcribed_at

  async function uploadAudio() {
    setMsg(null)
    if (!file) return
    if (!supabase) { setMsg({ kind: 'err', text: 'Supabase não configurado.' }); return }
    if (file.size > 50 * 1024 * 1024) { setMsg({ kind: 'err', text: 'Áudio acima de 50MB.' }); return }
    setUploading(true)
    const ext = (file.name.split('.').pop() || 'webm').toLowerCase().replace(/[^a-z0-9]/g, '') || 'webm'
    const prefix = `deliverables/${team.id}`
    const { data: list } = await supabase.storage.from('files').list(prefix)
    const old = (list || []).filter(o => /^pitch\./i.test(o.name)).map(o => `${prefix}/${o.name}`)
    if (old.length) await supabase.storage.from('files').remove(old)
    const { error: upErr } = await supabase.storage.from('files').upload(`${prefix}/pitch.${ext}`, file, { contentType: file.type || 'audio/webm', upsert: true })
    setUploading(false)
    if (upErr) { setMsg({ kind: 'err', text: `Erro no upload: ${upErr.message}` }); return }
    setFile(null)
    setMsg({ kind: 'ok', text: 'Áudio enviado. Agora clique em Transcrever.' })
  }

  async function transcribe() {
    setMsg(null)
    if (!supabase) { setMsg({ kind: 'err', text: 'Supabase não configurado.' }); return }
    setTranscribing(true)
    const { data, error: err } = await supabase.functions.invoke('transcribe-pitch', { body: { team_id: team.id } })
    setTranscribing(false)
    if (err || data?.error) {
      // supabase-js lança em non-2xx: o corpo { error } vem em err.context (Response), não em data/err.message.
      let body = data
      if (err?.context && typeof err.context.json === 'function') {
        try { body = await err.context.json() } catch { /* mantém o body */ }
      }
      const code = body?.error || err?.message || 'erro'
      const human = code === 'no_audio' ? 'Nenhum áudio enviado para esta equipe.'
        : code === 'whisper_offline' ? 'O servidor Whisper está offline. Ligue a caixa e tente de novo.'
        : `Falha na transcrição: ${code}`
      setMsg({ kind: 'err', text: human }); return
    }
    setMsg({ kind: 'ok', text: `Transcrição pronta (${data.chars} caracteres).` })
    onTranscribed?.()
  }

  return (
    <div className="border border-dark-border rounded-xl p-3 space-y-2 bg-white/5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-mono text-gold uppercase tracking-wider">Áudio do pitch → transcrição (5.3)</span>
        {hasTranscript && <span className="text-[10px] font-mono text-cyan">transcrição ✓ · há {relativeTime(team.pitch_transcribed_at)}</span>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <input type="file" accept="audio/*" onChange={e => setFile(e.target.files?.[0] || null)}
          className="text-xs text-white/70 file:mr-2 file:px-2 file:py-1 file:rounded file:border-0 file:bg-electric/20 file:text-electric" />
        <button onClick={uploadAudio} disabled={!file || uploading}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30 disabled:opacity-40">
          {uploading ? 'Enviando...' : 'Enviar áudio'}
        </button>
        <button onClick={transcribe} disabled={transcribing}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gold/20 text-gold border border-gold/40 hover:bg-gold/30 disabled:opacity-40">
          {transcribing ? 'Transcrevendo...' : hasTranscript ? 'Re-transcrever' : 'Transcrever'}
        </button>
      </div>
      {hasTranscript && (
        <div>
          <button onClick={() => setShowTranscript(v => !v)} className="text-xs text-electric hover:underline">
            {showTranscript ? 'ocultar transcrição' : 'ver transcrição'}
          </button>
          {showTranscript && <p className="text-xs text-white/70 mt-1 whitespace-pre-wrap max-h-48 overflow-y-auto bg-dark/50 rounded p-2">{team.pitch_transcript}</p>}
        </div>
      )}
      {msg && <div className={`rounded-lg px-3 py-1.5 text-xs border ${msg.kind === 'ok' ? 'bg-cyan/10 border-cyan/30 text-cyan' : 'bg-hot/10 border-hot/30 text-hot'}`}>{msg.text}</div>}
    </div>
  )
}

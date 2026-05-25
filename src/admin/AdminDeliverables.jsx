import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DeliverableForm from '../participant/DeliverableForm'
import LearningDiary from '../participant/LearningDiary'
import { PHASES, HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS } from '../participant/deliverableFields'
import SectionMeta from '../participant/SectionMeta'
import { relativeTime } from '../lib/relativeTime'
import { buildEvaluationPrompt, parseEvaluation, EDITAL_RUBRIC } from '../lib/iaEvaluator'

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
  // IA Evaluator (human-in-the-loop) — estado por equipe selecionada
  const [pitchNotes, setPitchNotes] = useState('')
  const [jsonInput, setJsonInput] = useState('')
  const [packageText, setPackageText] = useState('')
  const [evalError, setEvalError] = useState(null)
  const [evalSaving, setEvalSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  // Limpa o fluxo de avaliação ao trocar de equipe
  useEffect(() => { setPitchNotes(''); setJsonInput(''); setPackageText(''); setEvalError(null); setCopied(false) }, [selectedId]) // eslint-disable-line react-hooks/set-state-in-effect

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [t, r, n, e, dm, sd] = await Promise.all([
      supabase.from('teams').select('id, name, status, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables, updated_at, updated_by').order('name', { ascending: true }),
      supabase.from('registrations').select('team_id, full_name, is_team_leader, payment_status, occupation_type, economic_axes, project_name'),
      supabase.from('mentor_notes').select('id, team_id, phase, body, is_public, created_at, mentors(name, email)').order('created_at', { ascending: false }),
      supabase.from('team_evaluations').select('id, team_id, evaluator_type, rubric_version, total_score, eliminated, summary, scores, model, status, created_at').order('created_at', { ascending: false }),
      supabase.from('team_deliverable_meta').select('team_id, field, updated_by_name, updated_at'),
      supabase.rpc('get_slides_deadline'),
    ])
    const firstErr = [t, r, n, e, dm, sd].find(x => x.error)
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    setTeams(t.data ?? []); setMembers(r.data ?? []); setNotes(n.data ?? []); setEvals(e.data ?? []); setDeliverableMeta(dm.data ?? [])
    setSlidesDeadline(sd.data ?? null); setDeadlineInput(isoToLocalInput(sd.data))
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

  async function changeStatus(teamId, status) {
    if (!supabase) return
    const { error: err } = await supabase.from('teams').update({ status }).eq('id', teamId)
    if (err) { alert(`Erro: ${err.message}`); return }
    setTeams(ts => ts.map(t => t.id === teamId ? { ...t, status } : t))
  }

  async function copyPackage(team) {
    setEvalError(null)
    const teamMembers = members.filter(m => m.team_id === team.id && m.payment_status === 'confirmed')
    const teamNotes = notes.filter(n => n.team_id === team.id && n.is_public)
    const pkg = buildEvaluationPrompt({ team, members: teamMembers, mentorNotes: teamNotes, pitchNotes })
    try {
      await navigator.clipboard.writeText(pkg)
      setCopied(true)
      setPackageText('')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Sem permissão de clipboard — expõe o texto para cópia manual
      setPackageText(pkg)
    }
  }

  async function saveEvaluation(team) {
    setEvalError(null)
    let parsed
    try {
      parsed = parseEvaluation(jsonInput)
    } catch (e) {
      setEvalError(e.message)
      return
    }
    setEvalSaving(true)
    const { error: err } = await supabase.from('team_evaluations').insert({
      team_id: team.id,
      evaluator_type: 'ai',
      rubric_version: EDITAL_RUBRIC.version,
      scores: parsed.scores,
      total_score: parsed.total_score,
      eliminated: parsed.eliminated,
      summary: parsed.summary,
      model: parsed.model,
      status: 'done',
    })
    setEvalSaving(false)
    if (err) { setEvalError(`Erro ao gravar: ${err.message}`); return }
    setJsonInput(''); setPitchNotes(''); setPackageText('')
    await fetchData()
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

        <div className="card-glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-xs font-mono text-gold uppercase tracking-wider">Avaliação — IA Evaluator</p>
            <span className="text-[10px] text-text-muted font-mono">{EDITAL_RUBRIC.version} · Técnica 30% (elim.) · Validação 25% · Escala 25% · Pitch 20%</span>
          </div>

          {!tevals.length && <p className="text-sm text-text-muted">Nenhuma avaliação registrada ainda.</p>}
          {tevals.map(ev => (
            <div key={ev.id} className="border border-dark-border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-white">{ev.evaluator_type === 'ai' ? 'IA Evaluator' : 'Humano'}{ev.model ? ` · ${ev.model}` : ''}</span>
                <span className="text-sm font-mono text-gold">{ev.total_score != null ? `${ev.total_score} / 100` : ev.status}</span>
              </div>
              {ev.eliminated && <span className="inline-block text-xs text-hot border border-hot/30 bg-hot/10 rounded px-2 py-0.5">Eliminado (critério técnico)</span>}
              {Array.isArray(ev.scores) && ev.scores.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                  {ev.scores.map(s => (
                    <div key={s.criterion_key} className="bg-white/5 rounded-lg p-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-white/70">{s.label} <span className="text-white/40">({s.weight}%)</span></span>
                        <span className="font-mono text-cyan">{s.score}</span>
                      </div>
                      {s.justification && <p className="text-[11px] text-text-muted mt-1 whitespace-pre-wrap">{s.justification}</p>}
                    </div>
                  ))}
                </div>
              )}
              {ev.summary && <p className="text-sm text-white/80 mt-1 whitespace-pre-wrap">{ev.summary}</p>}
            </div>
          ))}

          {!readOnly && (
            <div className="border-t border-dark-border pt-4 space-y-3">
              <p className="text-xs font-mono text-electric uppercase tracking-wider">Avaliar com o Claude</p>
              <div>
                <label className="text-xs text-text-muted">Observações do pitch / demo ao vivo (opcional — entram no pacote)</label>
                <textarea value={pitchNotes} onChange={e => setPitchNotes(e.target.value)} rows={3}
                  placeholder="O que você viu no pitch e na demo: a IA rodou de verdade? evidências de tração mostradas? clareza e respostas aos jurados?"
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-cyan/50" />
              </div>
              <button onClick={() => copyPackage(selected)} className="px-4 py-2 rounded-lg text-sm font-semibold bg-electric/20 text-electric border border-electric/40 hover:bg-electric/30">
                {copied ? '✓ Pacote copiado' : '1. Copiar pacote para o Claude'}
              </button>
              {packageText && (
                <div>
                  <p className="text-[11px] text-text-muted mb-1">Cópia automática bloqueada — selecione tudo e copie manualmente:</p>
                  <textarea readOnly value={packageText} rows={5} onFocus={e => e.target.select()}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white/70 text-xs font-mono" />
                </div>
              )}
              <div>
                <label className="text-xs text-text-muted">2. Cole o JSON que o Claude devolveu</label>
                <textarea value={jsonInput} onChange={e => setJsonInput(e.target.value)} rows={6}
                  placeholder={'{ "scores": [...], "eliminated": false, "summary": "...", "model": "..." }'}
                  className="w-full mt-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-cyan/50" />
              </div>
              {evalError && <div className="bg-hot/10 border border-hot/30 rounded-lg px-3 py-2 text-hot text-sm">{evalError}</div>}
              <button onClick={() => saveEvaluation(selected)} disabled={evalSaving || !jsonInput.trim()}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-40 disabled:cursor-not-allowed">
                {evalSaving ? 'Gravando...' : '3. Processar e gravar avaliação'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}

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

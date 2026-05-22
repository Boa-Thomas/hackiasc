import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import DeliverableForm from '../participant/DeliverableForm'
import LearningDiary from '../participant/LearningDiary'
import { PHASES, HYPOTHESES_FIELDS, SLC_IA_FIELDS, FINAL_FIELDS } from '../participant/deliverableFields'
import { relativeTime } from '../lib/relativeTime'

const STATUS = [
  { id: 'draft', label: 'Rascunho', cls: 'bg-white/5 text-white/50 border-white/10' },
  { id: 'submitted', label: 'Enviada', cls: 'bg-electric/10 text-electric border-electric/30' },
  { id: 'reviewing', label: 'Em análise', cls: 'bg-gold/10 text-gold border-gold/30' },
  { id: 'evaluated', label: 'Avaliada', cls: 'bg-cyan/10 text-cyan border-cyan/30' },
]
const statusMeta = (id) => STATUS.find(s => s.id === id) || STATUS[0]
const PHASE_LABEL = { ignicao: 'Fase 1 · Ignição', construcao: 'Fase 2 · Construção', apresentacao: 'Fase 3 · Apresentação' }

export default function AdminDeliverables({ readOnly = false }) {
  const [teams, setTeams] = useState([])
  const [members, setMembers] = useState([])
  const [notes, setNotes] = useState([])
  const [evals, setEvals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [sub, setSub] = useState('hypotheses')

  async function fetchData() {
    if (!supabase) { setError('Supabase não configurado.'); setLoading(false); return }
    setError(null)
    const [t, r, n, e] = await Promise.all([
      supabase.from('teams').select('id, name, status, hypotheses_canvas, slc_ia_canvas, learning_diary, final_deliverables, updated_at, updated_by').order('name', { ascending: true }),
      supabase.from('registrations').select('team_id, full_name, is_team_leader, payment_status'),
      supabase.from('mentor_notes').select('id, team_id, phase, body, is_public, created_at, mentors(name, email)').order('created_at', { ascending: false }),
      supabase.from('team_evaluations').select('id, team_id, evaluator_type, rubric_version, total_score, eliminated, summary, status, created_at').order('created_at', { ascending: false }),
    ])
    const firstErr = [t, r, n, e].find(x => x.error)
    if (firstErr) { setError(firstErr.error.message); setLoading(false); return }
    setTeams(t.data ?? []); setMembers(r.data ?? []); setNotes(n.data ?? []); setEvals(e.data ?? [])
    setLoading(false)
  }
  useEffect(() => { fetchData() }, []) // eslint-disable-line react-hooks/set-state-in-effect

  const memberCount = (teamId) => members.filter(m => m.team_id === teamId && m.payment_status === 'confirmed').length
  const notesFor = (teamId) => notes.filter(n => n.team_id === teamId)
  const evalsFor = (teamId) => evals.filter(ev => ev.team_id === teamId)
  const selected = teams.find(t => t.id === selectedId) || null

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
      for (const c of flat) cells.push((t[c.field] || {})[c.key] || '')
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

        {sub === 'hypotheses' && <DeliverableForm readOnly eyebrow="Fase 1 · Ignição" title="Canvas de Hipóteses" fields={HYPOTHESES_FIELDS} value={selected.hypotheses_canvas} />}
        {sub === 'slc' && <DeliverableForm readOnly eyebrow="Fase 2 · Construção" title="Canvas SLC-IA" fields={SLC_IA_FIELDS} value={selected.slc_ia_canvas} />}
        {sub === 'diary' && <LearningDiary readOnly value={selected.learning_diary} />}
        {sub === 'final' && <DeliverableForm readOnly eyebrow="Fase 3 · Apresentação" title="Entregas finais" fields={FINAL_FIELDS} value={selected.final_deliverables} gridClass="grid grid-cols-1 sm:grid-cols-2 gap-4" />}

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

        <div className="card-glass rounded-2xl p-6 space-y-3">
          <p className="text-xs font-mono text-gold uppercase tracking-wider">Avaliação por IA</p>
          {!tevals.length ? (
            <p className="text-sm text-text-muted">Estrutura pronta — agente de avaliação ainda não conectado. As avaliações aparecerão aqui (rubrica do edital: Técnica 30% · Validação 25% · Escala 25% · Pitch 20%).</p>
          ) : (
            tevals.map(ev => (
              <div key={ev.id} className="border border-dark-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">{ev.evaluator_type === 'ai' ? 'IA' : 'Humano'} · {ev.rubric_version}</span>
                  <span className="text-sm font-mono text-gold">{ev.total_score != null ? `${ev.total_score} pts` : ev.status}</span>
                </div>
                {ev.eliminated && <span className="text-xs text-hot">Eliminado (critério técnico)</span>}
                {ev.summary && <p className="text-sm text-white/80 mt-2 whitespace-pre-wrap">{ev.summary}</p>}
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-hot/10 border border-hot/30 rounded-lg px-4 py-2.5 text-hot text-sm">{error}</div>}
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

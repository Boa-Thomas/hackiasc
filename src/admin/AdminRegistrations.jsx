import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

const OCCUPATION_LABELS = {
  hacker: 'Hacker',
  hustler: 'Hustler',
  hipster: 'Hipster',
  enthusiast: 'Enthusiast',
}

const MODALITY_LABELS = {
  individual_form_team: 'Individual (p/ time)',
  individual_own: 'Individual',
  team: 'Time',
}

const TIER_LABELS = {
  early_bird: 'Early Bird',
  regular: 'Regular',
}

const METHOD_LABELS = {
  pix: 'Pix',
  card: 'Cartão',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBRL(cents) {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR')
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR')
}

function exportCSV(data) {
  const headers = ['Nome', 'Email', 'Telefone', 'CPF', 'Tipo', 'Modalidade', 'Time', 'Tier', 'Valor', 'Status', 'Data']
  const rows = data.map(r => [
    r.full_name, r.email, r.phone, r.cpf, r.occupation_type,
    r.inscription_modality, r.team_name || '', r.ticket_tier,
    (r.ticket_price / 100).toFixed(2), r.payment_status,
    new Date(r.created_at).toLocaleDateString('pt-BR'),
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `hackia-inscricoes-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function openPrintWindow(title, bodyHtml) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; padding: 20px; }
  h1 { font-size: 18px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 12px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; text-transform: uppercase; font-size: 10px; }
  tr:nth-child(even) { background: #fafafa; }
  .sig-col { width: 120px; }
  .badge-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .badge-card { border: 2px solid #333; border-radius: 8px; padding: 16px; text-align: center; page-break-inside: avoid; }
  .badge-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
  .badge-type { font-size: 12px; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 4px; }
  .badge-team { font-size: 11px; color: #666; }
  .team-section { page-break-inside: avoid; margin-bottom: 20px; }
  .team-title { font-size: 14px; font-weight: bold; border-bottom: 2px solid #333; padding-bottom: 4px; margin-bottom: 8px; }
  .team-meta { font-size: 11px; color: #666; margin-bottom: 6px; }
  .no-print { margin-bottom: 16px; }
  @media print { .no-print { display: none; } }
</style></head><body>
<div class="no-print"><button onclick="window.print()" style="padding:8px 16px;cursor:pointer;font-size:14px;">Imprimir</button></div>
${bodyHtml}
</body></html>`)
  win.document.close()
}

function exportAttendanceList(data) {
  const sorted = [...data]
    .filter(r => r.payment_status === 'confirmed')
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  const rows = sorted.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${r.full_name ?? ''}</td>
      <td>${r.team_name ?? '—'}</td>
      <td>${OCCUPATION_LABELS[r.occupation_type] ?? r.occupation_type ?? ''}</td>
      <td class="sig-col"></td>
    </tr>`).join('')

  openPrintWindow('Lista de Presença — HackIA SC', `
    <h1>Lista de Presença — HackIA SC</h1>
    <p class="subtitle">AI Venture Hackathon Blumenau 2026 — ${sorted.length} participantes confirmados</p>
    <table>
      <thead><tr><th>#</th><th>Nome</th><th>Time</th><th>Perfil</th><th class="sig-col">Assinatura</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `)
}

function exportBadges(data) {
  const sorted = [...data]
    .filter(r => r.payment_status === 'confirmed')
    .sort((a, b) => a.full_name.localeCompare(b.full_name))

  const typeColors = {
    hacker: { bg: '#e8f0ff', border: '#3a86ff', text: '#3a86ff' },
    hustler: { bg: '#e6faf3', border: '#06d6a0', text: '#06d6a0' },
    hipster: { bg: '#f0e8ff', border: '#8338ec', text: '#8338ec' },
    enthusiast: { bg: '#fff8e0', border: '#ffbe0b', text: '#b88a00' },
  }

  const cards = sorted.map(r => {
    const c = typeColors[r.occupation_type] ?? { bg: '#f5f5f5', border: '#999', text: '#333' }
    return `
      <div class="badge-card" style="border-color: ${c.border};">
        <div class="badge-name">${r.full_name ?? ''}</div>
        <div class="badge-type" style="background: ${c.bg}; color: ${c.text};">
          ${OCCUPATION_LABELS[r.occupation_type] ?? r.occupation_type ?? ''}
        </div>
        <div class="badge-team">${r.team_name ?? 'Individual'}</div>
      </div>`
  }).join('')

  openPrintWindow('Crachás — HackIA SC', `
    <h1>Crachás — HackIA SC</h1>
    <p class="subtitle">${sorted.length} participantes</p>
    <div class="badge-grid">${cards}</div>
  `)
}

function exportTeamReport(data) {
  const teams = {}
  const individuals = []

  data.filter(r => r.payment_status === 'confirmed').forEach(r => {
    if (r.team_name) {
      if (!teams[r.team_name]) teams[r.team_name] = []
      teams[r.team_name].push(r)
    } else {
      individuals.push(r)
    }
  })

  const teamSections = Object.entries(teams)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, members]) => {
      const leader = members.find(m => m.is_team_leader)
      const project = members.find(m => m.project_name)
      const axes = [...new Set(members.flatMap(m => m.economic_axes ?? []))]
      const memberRows = members
        .sort((a, b) => (b.is_team_leader ? 1 : 0) - (a.is_team_leader ? 1 : 0))
        .map(m => `<tr>
          <td>${m.full_name}${m.is_team_leader ? ' (líder)' : ''}</td>
          <td>${OCCUPATION_LABELS[m.occupation_type] ?? m.occupation_type ?? ''}</td>
          <td>${m.email ?? ''}</td>
        </tr>`).join('')

      return `
        <div class="team-section">
          <div class="team-title">${name} (${members.length} membros)</div>
          ${leader ? `<div class="team-meta">Líder: ${leader.full_name}</div>` : ''}
          ${project ? `<div class="team-meta">Projeto: ${project.project_name}</div>` : ''}
          ${axes.length > 0 ? `<div class="team-meta">Eixos: ${axes.join(', ')}</div>` : ''}
          <table>
            <thead><tr><th>Nome</th><th>Perfil</th><th>Email</th></tr></thead>
            <tbody>${memberRows}</tbody>
          </table>
        </div>`
    }).join('')

  openPrintWindow('Relatório de Times — HackIA SC', `
    <h1>Relatório de Times — HackIA SC</h1>
    <p class="subtitle">${Object.keys(teams).length} times, ${individuals.length} individuais</p>
    ${teamSections}
  `)
}

// ─── Export Dropdown ──────────────────────────────────────────────────────────

function ExportDropdown({ filtered }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="px-4 py-2 rounded-lg text-sm bg-electric/20 text-electric border border-electric/30 hover:bg-electric/30 transition-colors font-display whitespace-nowrap"
      >
        Exportar ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 card-glass rounded-xl border border-white/10 py-1 min-w-[200px] shadow-xl">
            {[
              { label: 'CSV', action: () => exportCSV(filtered) },
              { label: 'Lista de presença', action: () => exportAttendanceList(filtered) },
              { label: 'Crachás', action: () => exportBadges(filtered) },
              { label: 'Relatório de times', action: () => exportTeamReport(filtered) },
            ].map(item => (
              <button
                key={item.label}
                onClick={() => { item.action(); setOpen(false) }}
                className="w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white transition-colors"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Badge components ─────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    confirmed: 'bg-cyan/10 text-cyan border-cyan/30',
    pending: 'bg-gold/10 text-gold border-gold/30',
    cancelled: 'bg-hot/10 text-hot border-hot/30',
  }
  const labels = { confirmed: 'Confirmado', pending: 'Pendente', cancelled: 'Cancelado' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono ${map[status] ?? 'bg-white/5 text-white/60 border-white/10'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function OccupationBadge({ type }) {
  const map = {
    hacker: 'bg-cyan/10 text-cyan border-cyan/30',
    hustler: 'bg-gold/10 text-gold border-gold/30',
    hipster: 'bg-violet/10 text-violet border-violet/30',
    enthusiast: 'bg-electric/10 text-electric border-electric/30',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono ${map[type] ?? 'bg-white/5 text-white/60 border-white/10'}`}>
      {OCCUPATION_LABELS[type] ?? type}
    </span>
  )
}

// ─── Inline editable field ────────────────────────────────────────────────────

function EditableField({ label, value, onSave, type = 'text', options = null, readOnly = false }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [saving, setSaving] = useState(false)

  function startEdit() {
    if (readOnly) return
    setDraft(value ?? '')
    setEditing(true)
  }

  async function handleSave() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  function handleCancel() {
    setDraft(value ?? '')
    setEditing(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-white/40 font-mono uppercase tracking-wide">{label}</span>
      {editing ? (
        <div className="flex items-center gap-2">
          {options ? (
            <select
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="bg-dark border border-electric/30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-electric"
            >
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : type === 'checkbox' ? (
            <input
              type="checkbox"
              checked={draft === true || draft === 'true'}
              onChange={e => setDraft(e.target.checked)}
              className="accent-electric"
            />
          ) : (
            <input
              type={type}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              className="bg-dark border border-electric/30 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-electric min-w-[200px]"
            />
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-2 py-1 rounded text-xs bg-cyan/20 text-cyan border border-cyan/30 hover:bg-cyan/30 disabled:opacity-50 transition-colors"
          >
            {saving ? '...' : 'Salvar'}
          </button>
          <button
            onClick={handleCancel}
            className="px-2 py-1 rounded text-xs bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition-colors"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 group">
          <span className="text-sm text-white">
            {value == null || value === '' ? <span className="text-white/30 italic">—</span> : String(value)}
          </span>
          {!readOnly && (
            <button
              onClick={startEdit}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-electric text-xs"
              title="Editar"
            >
              ✏
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Read-only field ──────────────────────────────────────────────────────────

function ReadField({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-white/40 font-mono uppercase tracking-wide">{label}</span>
      <div className="text-sm text-white">{children ?? <span className="text-white/30 italic">—</span>}</div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-4">
      <h3 className="text-sm font-display font-semibold text-white/70 uppercase tracking-widest border-b border-white/10 pb-2">
        {title}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {children}
      </div>
    </div>
  )
}

// ─── Detail View ──────────────────────────────────────────────────────────────

function DetailView({ registration, onBack, onRefetch, readOnly }) {
  const [r, setR] = useState(registration)

  // Keep local state in sync when parent refetches
  useEffect(() => {
    setR(registration)
  }, [registration])

  async function updateField(field, value) {
    if (!supabase) return
    const { error } = await supabase
      .from('registrations')
      .update({ [field]: value })
      .eq('id', r.id)
    if (error) {
      alert(`Erro ao salvar: ${error.message}`)
      return
    }
    setR(prev => ({ ...prev, [field]: value }))
    onRefetch()
  }

  async function confirmPayment() {
    await updateField('payment_status', 'confirmed')
    await updateField('payment_confirmed_at', new Date().toISOString())
  }

  async function cancelRegistration() {
    if (!window.confirm(`Cancelar inscrição de ${r.full_name}?`)) return
    await updateField('payment_status', 'cancelled')
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
        >
          ← Voltar para lista
        </button>
        {!readOnly && (
          <div className="flex items-center gap-2 flex-wrap">
            {r.payment_status === 'pending' && (
              <button
                onClick={confirmPayment}
                className="px-4 py-2 rounded-lg text-sm bg-cyan/20 text-cyan border border-cyan/30 hover:bg-cyan/30 transition-colors font-display"
              >
                Confirmar Pagamento
              </button>
            )}
            {r.payment_status !== 'cancelled' && (
              <button
                onClick={cancelRegistration}
                className="px-4 py-2 rounded-lg text-sm bg-hot/10 text-hot border border-hot/30 hover:bg-hot/20 transition-colors font-display"
              >
                Cancelar Inscrição
              </button>
            )}
          </div>
        )}
      </div>

      {/* Title */}
      <div className="card-glass rounded-xl p-5 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-white">{r.full_name}</h2>
          <p className="text-white/50 text-sm font-mono mt-0.5">{r.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <OccupationBadge type={r.occupation_type} />
          <StatusBadge status={r.payment_status} />
        </div>
      </div>

      {/* Dados Pessoais */}
      <Section title="Dados Pessoais">
        <EditableField readOnly={readOnly}
          label="Nome completo"
          value={r.full_name}
          onSave={v => updateField('full_name', v)}
        />
        <EditableField readOnly={readOnly}
          label="Email"
          value={r.email}
          type="email"
          onSave={v => updateField('email', v)}
        />
        <EditableField readOnly={readOnly}
          label="Telefone"
          value={r.phone}
          onSave={v => updateField('phone', v)}
        />
        <ReadField label="CPF">{r.cpf}</ReadField>
        <ReadField label="Data de nascimento">{formatDate(r.birth_date)}</ReadField>
        <ReadField label="LinkedIn">
          {r.linkedin_url ? (
            <a href={r.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-electric hover:underline break-all">
              {r.linkedin_url}
            </a>
          ) : null}
        </ReadField>
      </Section>

      {/* Perfil */}
      <Section title="Perfil">
        <EditableField readOnly={readOnly}
          label="Tipo de ocupação"
          value={r.occupation_type}
          options={[
            { value: 'hacker', label: 'Hacker' },
            { value: 'hustler', label: 'Hustler' },
            { value: 'hipster', label: 'Hipster' },
            { value: 'enthusiast', label: 'Enthusiast' },
          ]}
          onSave={v => updateField('occupation_type', v)}
        />
        <EditableField readOnly={readOnly}
          label="Experiência em IA (1-10)"
          value={r.ai_experience_level}
          type="number"
          onSave={v => updateField('ai_experience_level', Number(v))}
        />
        <div className="sm:col-span-2">
          <ReadField label="Eixos econômicos">
            {r.economic_axes?.length > 0 ? (
              <div className="flex flex-wrap gap-1 mt-1">
                {r.economic_axes.map(ax => (
                  <span key={ax} className="px-2 py-0.5 rounded bg-electric/10 text-electric border border-electric/20 text-xs font-mono">
                    {ax}
                  </span>
                ))}
              </div>
            ) : null}
          </ReadField>
        </div>
      </Section>

      {/* Evento */}
      <Section title="Evento">
        <EditableField readOnly={readOnly}
          label="Restrições alimentares"
          value={r.dietary_restrictions}
          onSave={v => updateField('dietary_restrictions', v)}
        />
        <EditableField readOnly={readOnly}
          label="PCD"
          value={r.is_pcd ? 'Sim' : 'Não'}
          options={[
            { value: 'true', label: 'Sim' },
            { value: 'false', label: 'Não' },
          ]}
          onSave={v => updateField('is_pcd', v === 'true')}
        />
        <EditableField readOnly={readOnly}
          label="Tipo de PCD"
          value={r.pcd_type}
          onSave={v => updateField('pcd_type', v)}
        />
      </Section>

      {/* Projeto */}
      <Section title="Projeto">
        <ReadField label="Tem projeto">
          {r.has_project ? 'Sim' : 'Não'}
        </ReadField>
        <ReadField label="Nome do projeto">{r.project_name}</ReadField>
      </Section>

      {/* Inscrição */}
      <Section title="Inscrição">
        <ReadField label="Modalidade">{MODALITY_LABELS[r.inscription_modality] ?? r.inscription_modality}</ReadField>
        <EditableField readOnly={readOnly}
          label="Nome do time"
          value={r.team_name}
          onSave={v => updateField('team_name', v)}
        />
        <ReadField label="É líder do time">
          {r.is_team_leader == null ? null : r.is_team_leader ? 'Sim' : 'Não'}
        </ReadField>
        <ReadField label="Data de inscrição">{formatDateTime(r.created_at)}</ReadField>
      </Section>

      {/* Pagamento */}
      <Section title="Pagamento">
        <ReadField label="Método de pagamento">{METHOD_LABELS[r.payment_method] ?? r.payment_method}</ReadField>
        <ReadField label="Tier">{TIER_LABELS[r.ticket_tier] ?? r.ticket_tier}</ReadField>
        <ReadField label="Valor">{formatBRL(r.ticket_price)}</ReadField>
        <EditableField readOnly={readOnly}
          label="Status"
          value={r.payment_status}
          options={[
            { value: 'pending', label: 'Pendente' },
            { value: 'confirmed', label: 'Confirmado' },
            { value: 'cancelled', label: 'Cancelado' },
          ]}
          onSave={v => updateField('payment_status', v)}
        />
        <ReadField label="Confirmado em">{formatDateTime(r.payment_confirmed_at)}</ReadField>
        <ReadField label="Preço expira em">{formatDateTime(r.price_expires_at)}</ReadField>
        <div className="sm:col-span-2">
          <EditableField readOnly={readOnly}
            label="Notas de pagamento"
            value={r.payment_notes}
            onSave={v => updateField('payment_notes', v)}
          />
        </div>
      </Section>

      {/* LGPD / Termos */}
      <Section title="Aceites">
        <ReadField label="LGPD aceita">{r.accept_lgpd ? 'Sim' : 'Não'}</ReadField>
        <ReadField label="Código/IP aceito">{r.accept_code_ip ? 'Sim' : 'Não'}</ReadField>
      </Section>
    </div>
  )
}

// ─── List View ────────────────────────────────────────────────────────────────

function isStalePayment(r) {
  return r.payment_status === 'pending' && r.created_at && (new Date() - new Date(r.created_at)) > 3 * 86400000
}

function ListView({ registrations, onSelect, onRefetch, loading, readOnly }) {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterOccupation, setFilterOccupation] = useState('')
  const [filterModality, setFilterModality] = useState('')
  const [page, setPage] = useState(1)

  function updateSearch(v) { setSearch(v); setPage(1) }
  function updateFilterStatus(v) { setFilterStatus(v); setPage(1) }
  function updateFilterOccupation(v) { setFilterOccupation(v); setPage(1) }
  function updateFilterModality(v) { setFilterModality(v); setPage(1) }

  const filtered = useMemo(() => {
    let data = registrations
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter(r =>
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q)
      )
    }
    if (filterStatus) data = data.filter(r => r.payment_status === filterStatus)
    if (filterOccupation) data = data.filter(r => r.occupation_type === filterOccupation)
    if (filterModality) data = data.filter(r => r.inscription_modality === filterModality)
    return data
  }, [registrations, search, filterStatus, filterOccupation, filterModality])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  async function handleConfirm(r) {
    if (!supabase) return
    const { error } = await supabase
      .from('registrations')
      .update({ payment_status: 'confirmed', payment_confirmed_at: new Date().toISOString() })
      .eq('id', r.id)
    if (error) { alert(`Erro: ${error.message}`); return }
    onRefetch()
  }

  async function handleCancel(r) {
    if (!window.confirm(`Cancelar inscrição de ${r.full_name}?`)) return
    if (!supabase) return
    const { error } = await supabase
      .from('registrations')
      .update({ payment_status: 'cancelled' })
      .eq('id', r.id)
    if (error) { alert(`Erro: ${error.message}`); return }
    onRefetch()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="card-glass rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <input
          type="search"
          placeholder="Buscar por nome ou email..."
          value={search}
          onChange={e => updateSearch(e.target.value)}
          className="flex-1 min-w-[180px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-electric/50 transition-colors"
        />

        <select
          value={filterStatus}
          onChange={e => updateFilterStatus(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-electric/50 transition-colors"
        >
          <option value="">Todos os status</option>
          <option value="pending">Pendente</option>
          <option value="confirmed">Confirmado</option>
          <option value="cancelled">Cancelado</option>
        </select>

        <select
          value={filterOccupation}
          onChange={e => updateFilterOccupation(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-electric/50 transition-colors"
        >
          <option value="">Todos os tipos</option>
          <option value="hacker">Hacker</option>
          <option value="hustler">Hustler</option>
          <option value="hipster">Hipster</option>
          <option value="enthusiast">Enthusiast</option>
        </select>

        <select
          value={filterModality}
          onChange={e => updateFilterModality(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-electric/50 transition-colors"
        >
          <option value="">Todas as modalidades</option>
          <option value="individual_own">Individual</option>
          <option value="individual_form_team">Individual (p/ time)</option>
          <option value="team">Time</option>
        </select>

        <ExportDropdown filtered={filtered} />
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-xs text-white/40 font-mono px-1">
        <span>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
        {filtered.length !== registrations.length && (
          <span>(de {registrations.length} total)</span>
        )}
      </div>

      {/* Table */}
      <div className="card-glass rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/40 text-sm">
            Carregando...
          </div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <span className="text-white/20 text-3xl">—</span>
            <span className="text-white/40 text-sm">Nenhum registro encontrado</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Nome', 'Email', 'Tipo', 'Modalidade', 'Time', 'Tier', 'Valor', 'Status', 'Data', 'Ações'].map(h => (
                    <th key={h} className="text-left text-xs font-mono text-white/40 uppercase tracking-wide px-4 py-3 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`border-b border-white/5 hover:bg-white/3 transition-colors ${i % 2 === 0 ? '' : 'bg-white/[0.02]'} ${
                      isStalePayment(r)
                        ? 'border-l-2 border-l-gold bg-gold/[0.03]'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-3 text-white font-display max-w-[160px] truncate" title={r.full_name}>
                      {r.full_name}
                    </td>
                    <td className="px-4 py-3 text-white/70 font-mono text-xs max-w-[200px] truncate" title={r.email}>
                      {r.email}
                    </td>
                    <td className="px-4 py-3">
                      <OccupationBadge type={r.occupation_type} />
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs whitespace-nowrap">
                      {MODALITY_LABELS[r.inscription_modality] ?? r.inscription_modality}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs max-w-[120px] truncate" title={r.team_name}>
                      {r.team_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs whitespace-nowrap">
                      {TIER_LABELS[r.ticket_tier] ?? r.ticket_tier}
                    </td>
                    <td className="px-4 py-3 text-white/80 font-mono text-xs whitespace-nowrap">
                      {formatBRL(r.ticket_price)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-white/50 font-mono text-xs whitespace-nowrap">
                      {formatDate(r.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {!readOnly && r.payment_status === 'pending' && (
                          <button
                            onClick={() => handleConfirm(r)}
                            className="px-2 py-1 rounded text-xs bg-cyan/10 text-cyan border border-cyan/20 hover:bg-cyan/20 transition-colors whitespace-nowrap"
                          >
                            Confirmar
                          </button>
                        )}
                        {!readOnly && r.payment_status !== 'cancelled' && (
                          <button
                            onClick={() => handleCancel(r)}
                            className="px-2 py-1 rounded text-xs bg-hot/10 text-hot border border-hot/20 hover:bg-hot/20 transition-colors"
                          >
                            Cancelar
                          </button>
                        )}
                        <button
                          onClick={() => onSelect(r.id)}
                          className="px-2 py-1 rounded text-xs bg-electric/10 text-electric border border-electric/20 hover:bg-electric/20 transition-colors"
                        >
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <span className="text-xs text-white/40 font-mono">
            Página {page} de {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg text-sm bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg text-sm bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Próxima →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Root component ───────────────────────────────────────────────────────────

export default function AdminRegistrations({ selectedId, onClearSelection, onSelect, readOnly }) {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchRegistrations() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('registrations')
      .select('*')
      .order('created_at', { ascending: false })
    if (err) {
      setError(err.message)
    } else {
      setRegistrations(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchRegistrations() // eslint-disable-line react-hooks/set-state-in-effect

    // Realtime subscription
    if (!supabase) return
    const channel = supabase
      .channel('registrations-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchRegistrations()
      })
      .subscribe()

    return () => { channel?.unsubscribe() }
  }, [])

  const selectedRegistration = selectedId
    ? registrations.find(r => r.id === selectedId) ?? null
    : null

  // Error state (full-page)
  if (!loading && error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <span className="text-hot text-lg font-display">Erro ao carregar inscrições</span>
        <span className="text-white/50 text-sm font-mono">{error}</span>
        <button
          onClick={() => { setError(null); setLoading(true); fetchRegistrations() }}
          className="mt-2 px-4 py-2 rounded-lg text-sm bg-electric/20 text-electric border border-electric/30 hover:bg-electric/30 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  // Detail view
  if (selectedId) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-24 text-white/40 text-sm">
          Carregando...
        </div>
      )
    }
    if (!selectedRegistration) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <span className="text-white/40 text-sm">Inscrição não encontrada.</span>
          <button
            onClick={onClearSelection}
            className="px-4 py-2 rounded-lg text-sm bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition-colors"
          >
            ← Voltar
          </button>
        </div>
      )
    }
    return (
      <DetailView
        registration={selectedRegistration}
        onBack={onClearSelection}
        onRefetch={fetchRegistrations}
        readOnly={readOnly}
      />
    )
  }

  // List view
  return (
    <ListView
      registrations={registrations}
      loading={loading}
      onSelect={id => onSelect?.(id)}
      onRefetch={fetchRegistrations}
      readOnly={readOnly}
    />
  )
}

import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Editor de ponderações do mentor para uma fase da metodologia.
// `notes` são todas as notas da equipe; filtramos pela fase.
export default function MentorNotes({ phase, phaseLabel, notes, auth }) {
  const phaseNotes = (notes || []).filter(n => n.phase === phase)
  const [body, setBody] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  function startEdit(n) {
    setEditingId(n.id); setBody(n.body); setIsPublic(n.is_public); setError(null)
  }
  function resetForm() {
    setEditingId(null); setBody(''); setIsPublic(false); setError(null)
  }

  async function save(e) {
    e.preventDefault()
    setError(null)
    if (!body.trim()) return setError('Escreva a ponderação.')
    if (!supabase) return setError('Sistema indisponível.')
    setSaving(true)
    const { error: err } = await supabase.rpc('mentor_save_note', {
      p_token: auth.token, p_phase: phase, p_body: body.trim(), p_is_public: isPublic, p_note_id: editingId,
    })
    setSaving(false)
    if (err) return setError('Erro ao salvar. Tente novamente.')
    resetForm()
    await auth.refreshMe()
  }

  async function remove(id) {
    if (!supabase || !window.confirm('Remover esta ponderação?')) return
    const { error: err } = await supabase.rpc('mentor_delete_note', { p_token: auth.token, p_note_id: id })
    if (err) return setError('Erro ao remover. Tente novamente.')
    if (editingId === id) resetForm()
    await auth.refreshMe()
  }

  return (
    <div className="rounded-xl border border-dark-border bg-dark/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-violet uppercase tracking-wider">{phaseLabel}</span>
        <span className="text-[10px] text-text-muted">{phaseNotes.length} ponderação(ões)</span>
      </div>

      {phaseNotes.map(n => (
        <div key={n.id} className="rounded-lg border border-dark-border bg-dark p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${n.is_public ? 'bg-cyan/10 text-cyan border-cyan/20' : 'bg-gold/10 text-gold border-gold/20'}`}>
              {n.is_public ? 'pública' : 'privada'}
            </span>
            <div className="flex gap-2">
              <button onClick={() => startEdit(n)} className="text-[11px] text-text-muted hover:text-white transition-colors">editar</button>
              <button onClick={() => remove(n.id)} className="text-[11px] text-text-muted hover:text-hot transition-colors">remover</button>
            </div>
          </div>
          <p className="text-sm text-white whitespace-pre-wrap">{n.body}</p>
        </div>
      ))}

      <form onSubmit={save} className="space-y-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={3}
          maxLength={5000}
          className="w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-white text-sm placeholder-text-muted focus:outline-none focus:border-violet/50 focus:ring-1 focus:ring-violet/30 transition-colors"
          placeholder={editingId ? 'Editando ponderação...' : 'Nova ponderação para esta fase...'}
        />
        {error && <p className="text-xs text-hot">{error}</p>}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer">
            <input type="checkbox" checked={isPublic} onChange={e => setIsPublic(e.target.checked)} className="accent-cyan" />
            Visível para a equipe (pública)
          </label>
          <div className="flex gap-2">
            {editingId && (
              <button type="button" onClick={resetForm} className="px-3 py-1.5 text-xs rounded-lg border border-dark-border text-text-muted hover:text-white transition-colors">
                Cancelar
              </button>
            )}
            <button type="submit" disabled={saving || !body.trim()} className="px-3 py-1.5 text-xs rounded-lg font-semibold bg-violet/20 text-violet border border-violet/40 hover:bg-violet/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Adicionar'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

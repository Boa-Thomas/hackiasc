import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const INPUT = 'w-full bg-dark border border-dark-border rounded-xl px-4 py-2.5 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 transition-colors'
const LBL = 'block text-sm font-semibold text-white mb-2'

export default function EditProfile({ auth }) {
  const { profile, token, refreshMe } = auth

  const [phone, setPhone] = useState(profile?.phone || '')
  const [linkedinUrl, setLinkedinUrl] = useState(profile?.linkedin_url || '')
  const [dietary, setDietary] = useState(profile?.dietary_restrictions || '')
  const [isPcd, setIsPcd] = useState(!!profile?.is_pcd)
  const [pcdType, setPcdType] = useState(profile?.pcd_type || '')

  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    if (!profile) return
    setPhone(profile.phone || '') // eslint-disable-line react-hooks/set-state-in-effect
    setLinkedinUrl(profile.linkedin_url || '')
    setDietary(profile.dietary_restrictions || '')
    setIsPcd(!!profile.is_pcd)
    setPcdType(profile.pcd_type || '')
  }, [profile])

  const dirty =
    phone !== (profile?.phone || '') ||
    linkedinUrl !== (profile?.linkedin_url || '') ||
    dietary !== (profile?.dietary_restrictions || '') ||
    isPcd !== !!profile?.is_pcd ||
    pcdType !== (profile?.pcd_type || '')

  async function onSubmit(e) {
    e.preventDefault()
    setFeedback(null)

    if (!phone.trim()) return setFeedback({ type: 'error', text: 'Telefone obrigatório.' })
    if (!dietary.trim()) return setFeedback({ type: 'error', text: 'Informe a restrição alimentar (ou "Não").' })
    if (linkedinUrl && !/^https?:\/\/(www\.)?linkedin\.com\//.test(linkedinUrl)) {
      return setFeedback({ type: 'error', text: 'URL do LinkedIn inválida.' })
    }
    if (!supabase) return setFeedback({ type: 'error', text: 'Sistema indisponível.' })

    setSaving(true)
    const { error } = await supabase.rpc('participant_update_profile', {
      p_token: token,
      p_phone: phone,
      p_linkedin_url: linkedinUrl,
      p_dietary_restrictions: dietary,
      p_is_pcd: isPcd,
      p_pcd_type: pcdType,
    })
    setSaving(false)

    if (error) {
      setFeedback({ type: 'error', text: 'Erro ao salvar. Tente novamente.' })
      return
    }
    setFeedback({ type: 'success', text: 'Dados atualizados.' })
    await refreshMe()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={onSubmit} className="card-glass rounded-2xl p-6 space-y-5">
        <div>
          <p className="text-xs font-mono text-electric uppercase tracking-wider">Editáveis</p>
          <h2 className="text-xl font-bold text-white mt-1">Meus dados</h2>
          <p className="text-sm text-text-muted mt-1">
            Você pode atualizar telefone, LinkedIn, restrição alimentar e PcD.
            Para alterar nome, email, CPF ou outros dados de identidade, fale com a organização.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Telefone WhatsApp *</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              maxLength={20}
              className={INPUT}
              placeholder="(47) 99999-9999"
            />
          </div>
          <div>
            <label className={LBL}>LinkedIn (opcional)</label>
            <input
              type="url"
              value={linkedinUrl}
              onChange={e => setLinkedinUrl(e.target.value)}
              maxLength={200}
              className={INPUT}
              placeholder="https://linkedin.com/in/..."
            />
          </div>
        </div>

        <div>
          <label className={LBL}>Restrição alimentar *</label>
          <input
            value={dietary}
            onChange={e => setDietary(e.target.value)}
            maxLength={200}
            className={INPUT}
            placeholder="Ex: Vegetariano, vegano, alergias... ou 'Não'"
          />
        </div>

        <div>
          <label className={LBL}>Pessoa com deficiência (PcD)?</label>
          <div className="grid grid-cols-2 gap-3">
            {[{ value: true, label: 'Sim' }, { value: false, label: 'Não' }].map(({ value, label }) => (
              <label
                key={String(value)}
                className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all ${
                  isPcd === value
                    ? 'border-cyan bg-cyan/5 text-white'
                    : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'
                }`}
              >
                <input
                  type="radio"
                  checked={isPcd === value}
                  onChange={() => setIsPcd(value)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {isPcd && (
          <div>
            <label className={LBL}>Tipo de deficiência (opcional)</label>
            <input
              value={pcdType}
              onChange={e => setPcdType(e.target.value)}
              maxLength={200}
              className={INPUT}
              placeholder="Tipo de deficiência"
            />
          </div>
        )}

        {feedback && (
          <div className={`rounded-xl px-4 py-3 text-sm border ${
            feedback.type === 'error'
              ? 'bg-hot/10 border-hot/30 text-hot'
              : 'bg-cyan/10 border-cyan/30 text-cyan'
          }`}>
            {feedback.text}
          </div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            type="submit"
            disabled={saving || !dirty}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
          {dirty && (
            <button
              type="button"
              onClick={() => {
                setPhone(profile?.phone || '')
                setLinkedinUrl(profile?.linkedin_url || '')
                setDietary(profile?.dietary_restrictions || '')
                setIsPcd(!!profile?.is_pcd)
                setPcdType(profile?.pcd_type || '')
                setFeedback(null)
              }}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-dark-border text-text-muted hover:text-white"
            >
              Descartar
            </button>
          )}
        </div>
      </form>

      {/* Read-only block */}
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-text-muted uppercase tracking-wider mb-3">
          Dados travados (contate a organização para alterar)
        </p>
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <ReadOnly label="Nome completo" value={profile?.full_name} />
          <ReadOnly label="Email" value={profile?.email} />
          <ReadOnly label="CPF" value={profile?.cpf} />
          <ReadOnly label="Data de nascimento" value={profile?.birth_date} />
          <ReadOnly label="Perfil" value={profile?.occupation_type} />
          <ReadOnly label="Nível IA" value={profile?.ai_experience_level && `${profile.ai_experience_level}/10`} />
        </dl>
      </div>
    </div>
  )
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="text-white truncate">{value || '—'}</dd>
    </div>
  )
}

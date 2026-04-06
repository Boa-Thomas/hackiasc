import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { useTicketPrice } from '../hooks/useTicketPrice'
import { EVENT_CONFIG } from '../lib/config'
import PaymentInfo from './PaymentInfo'

const INPUT = 'w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 transition-colors'
const LBL = 'block text-sm font-semibold text-white mb-2'
const ERR = 'text-hot text-xs mt-1'
const CHK_LABEL = 'flex items-start gap-3 p-3 rounded-xl border border-dark-border bg-dark hover:border-text-muted cursor-pointer transition-colors text-sm text-text-muted leading-relaxed'
const CHK_INPUT = 'mt-0.5 w-4 h-4 rounded border-dark-border bg-dark text-cyan accent-cyan flex-shrink-0'

const ORDINALS = ['2º', '3º', '4º', '5º', '6º']

const EMPTY_MEMBER = {
  full_name: '',
  email: '',
  phone: '',
  birth_date: '',
  linkedin_url: '',
  occupation_type: '',
  ai_experience_level: '',
  dietary_restrictions: '',
  is_pcd: 'no',
  pcd_type: '',
  accept_edital: false,
  accept_image: false,
  accept_responsibility: false,
}

function validateMember(member) {
  const errs = {}
  if (!member.full_name.trim()) errs.full_name = 'Nome obrigatório'
  if (!member.email.trim()) errs.email = 'E-mail obrigatório'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim())) errs.email = 'E-mail inválido'
  if (!member.phone.trim()) errs.phone = 'Telefone obrigatório'
  if (!member.birth_date) errs.birth_date = 'Data obrigatória'
  if (!member.linkedin_url.trim()) errs.linkedin_url = 'LinkedIn obrigatório'
  if (!member.occupation_type) errs.occupation_type = 'Selecione um perfil'
  if (!member.ai_experience_level) errs.ai_experience_level = 'Selecione um nível'
  if (!member.dietary_restrictions.trim()) errs.dietary_restrictions = 'Campo obrigatório'
  if (!member.accept_edital) errs.accept_edital = 'Obrigatório'
  if (!member.accept_image) errs.accept_image = 'Obrigatório'
  if (!member.accept_responsibility) errs.accept_responsibility = 'Obrigatório'
  return errs
}

// ─── MemberCard ──────────────────────────────────────────────────────────────

function MemberCard({ index, member, errors, onChange, onRemove }) {
  const [collapsed, setCollapsed] = useState(false)
  const ordinal = ORDINALS[index]
  const hasErrors = Object.keys(errors).length > 0

  return (
    <div
      id={`member-card-${index}`}
      className={`card-glass rounded-2xl overflow-hidden border ${hasErrors ? 'border-hot/40' : 'border-dark-border'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-surface/60 border-b border-dark-border">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-2 text-sm font-semibold text-white hover:text-cyan transition-colors"
        >
          <span className="font-mono text-cyan text-xs">{ordinal}</span>
          <span>Participante</span>
          {member.full_name && (
            <span className="text-text-muted font-normal">— {member.full_name}</span>
          )}
          {hasErrors && (
            <span className="text-hot text-xs font-mono ml-1">campos incompletos</span>
          )}
          <svg
            className={`w-4 h-4 text-text-muted transition-transform ${collapsed ? '-rotate-90' : ''}`}
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-text-muted hover:text-hot hover:bg-hot/10 transition-colors"
          title="Remover membro"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-5 space-y-4">

          {/* Nome + E-mail */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Nome Completo *</label>
              <input
                value={member.full_name}
                onChange={e => onChange('full_name', e.target.value)}
                className={INPUT}
                placeholder="Nome completo"
              />
              {errors.full_name && <p className={ERR}>{errors.full_name}</p>}
            </div>
            <div>
              <label className={LBL}>E-mail *</label>
              <input
                type="email"
                value={member.email}
                onChange={e => onChange('email', e.target.value)}
                className={INPUT}
                placeholder="email@exemplo.com"
              />
              {errors.email && <p className={ERR}>{errors.email}</p>}
            </div>
          </div>

          {/* Telefone + Data de Nascimento */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Telefone WhatsApp *</label>
              <input
                type="tel"
                value={member.phone}
                onChange={e => onChange('phone', e.target.value)}
                className={INPUT}
                placeholder="(47) 99999-9999"
              />
              {errors.phone && <p className={ERR}>{errors.phone}</p>}
            </div>
            <div>
              <label className={LBL}>Data de Nascimento *</label>
              <input
                type="date"
                value={member.birth_date}
                onChange={e => onChange('birth_date', e.target.value)}
                className={INPUT}
              />
              {errors.birth_date && <p className={ERR}>{errors.birth_date}</p>}
            </div>
          </div>

          {/* LinkedIn */}
          <div>
            <label className={LBL}>LinkedIn *</label>
            <input
              type="url"
              value={member.linkedin_url}
              onChange={e => onChange('linkedin_url', e.target.value)}
              className={INPUT}
              placeholder="https://linkedin.com/in/..."
            />
            {errors.linkedin_url && <p className={ERR}>{errors.linkedin_url}</p>}
          </div>

          {/* Perfil + Nível IA — compact side-by-side */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Perfil principal */}
            <div>
              <label className={LBL}>Perfil principal *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: 'hacker', label: 'Hacker' },
                  { value: 'hustler', label: 'Hustler' },
                  { value: 'hipster', label: 'Hipster' },
                  { value: 'enthusiast', label: 'Entusiasta' },
                ].map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex items-center justify-center py-2 px-3 rounded-lg border cursor-pointer transition-all text-xs font-semibold ${
                      member.occupation_type === value
                        ? 'border-cyan bg-cyan/5 text-white'
                        : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      value={value}
                      checked={member.occupation_type === value}
                      onChange={() => onChange('occupation_type', value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {errors.occupation_type && <p className={ERR}>{errors.occupation_type}</p>}
            </div>

            {/* Nível de experiência com IA */}
            <div>
              <label className={LBL}>Nível de experiência com IA *</label>
              <p className="text-xs text-text-muted mb-2">1 = Iniciante — 10 = Especialista</p>
              <div className="flex gap-1 flex-wrap">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <label
                    key={n}
                    className={`flex-1 min-w-[1.75rem] text-center py-1.5 rounded-md border cursor-pointer transition-all font-mono text-xs ${
                      parseInt(member.ai_experience_level) === n
                        ? 'border-cyan bg-cyan/10 text-cyan font-bold'
                        : 'border-dark-border bg-dark text-text-muted hover:border-text-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      value={n}
                      checked={parseInt(member.ai_experience_level) === n}
                      onChange={() => onChange('ai_experience_level', n)}
                      className="sr-only"
                    />
                    {n}
                  </label>
                ))}
              </div>
              {errors.ai_experience_level && <p className={ERR}>{errors.ai_experience_level}</p>}
            </div>
          </div>

          {/* Restrição alimentar + PcD */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={LBL}>Restrição alimentar *</label>
              <input
                value={member.dietary_restrictions}
                onChange={e => onChange('dietary_restrictions', e.target.value)}
                className={INPUT}
                placeholder="Ex: Vegetariano, ou 'Não'"
              />
              {errors.dietary_restrictions && <p className={ERR}>{errors.dietary_restrictions}</p>}
            </div>
            <div>
              <label className={LBL}>PcD? *</label>
              <div className="flex gap-2">
                {[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }].map(({ value, label }) => (
                  <label
                    key={value}
                    className={`flex-1 flex items-center justify-center py-2 rounded-lg border cursor-pointer transition-all text-xs font-semibold ${
                      member.is_pcd === value
                        ? 'border-cyan bg-cyan/5 text-white'
                        : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      value={value}
                      checked={member.is_pcd === value}
                      onChange={() => onChange('is_pcd', value)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>

          {member.is_pcd === 'yes' && (
            <div>
              <label className={LBL}>Tipo de deficiência (opcional)</label>
              <input
                value={member.pcd_type}
                onChange={e => onChange('pcd_type', e.target.value)}
                className={INPUT}
                placeholder="Tipo de deficiência"
              />
            </div>
          )}

          {/* Declaração de Ciência e Aceite */}
          <div>
            <label className={LBL}>Declaração de Ciência e Aceite *</label>
            <div className="space-y-2">
              <label className={`${CHK_LABEL} ${errors.accept_edital ? 'border-hot/40' : ''}`}>
                <input
                  type="checkbox"
                  checked={member.accept_edital}
                  onChange={e => onChange('accept_edital', e.target.checked)}
                  className={CHK_INPUT}
                />
                Li e compreendi o Edital de Participação, incluindo regras de equipe, desclassificação e critérios de julgamento
              </label>
              <label className={`${CHK_LABEL} ${errors.accept_image ? 'border-hot/40' : ''}`}>
                <input
                  type="checkbox"
                  checked={member.accept_image}
                  onChange={e => onChange('accept_image', e.target.checked)}
                  className={CHK_INPUT}
                />
                Autorizo o uso da minha imagem e voz para fins de divulgação do evento
              </label>
              <label className={`${CHK_LABEL} ${errors.accept_responsibility ? 'border-hot/40' : ''}`}>
                <input
                  type="checkbox"
                  checked={member.accept_responsibility}
                  onChange={e => onChange('accept_responsibility', e.target.checked)}
                  className={CHK_INPUT}
                />
                Estou ciente que a organização não se responsabiliza por perdas de equipamentos pessoais
              </label>
            </div>
            {(errors.accept_edital || errors.accept_image || errors.accept_responsibility) && (
              <p className={ERR}>Você precisa confirmar todas as declarações.</p>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

// ─── RegistrationForm ────────────────────────────────────────────────────────

export default function RegistrationForm() {
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    defaultValues: {
      inscription_modality: 'individual_form_team',
      payment_method: 'pix',
      has_project: 'no',
      is_pcd: 'no',
    },
  })

  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submittedData, setSubmittedData] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [memberErrors, setMemberErrors] = useState([])

  const { currentPrice, currentPriceFormatted, earlyBirdAvailable, earlyBirdSpotsLeft, tier, loading } = useTicketPrice()

  const inscriptionModality = watch('inscription_modality')
  const paymentMethod = watch('payment_method')
  const hasProject = watch('has_project')
  const isPcd = watch('is_pcd')

  // Price calculation — currentPrice is in centavos (15000 = R$ 150,00)
  const totalPeople = inscriptionModality === 'team' ? 1 + teamMembers.length : 1
  const totalPrice = currentPrice * totalPeople
  const totalPriceFormatted = `R$ ${(totalPrice / 100).toFixed(0)},00`
  const isTeamWithMembers = inscriptionModality === 'team' && teamMembers.length > 0

  // Team member helpers
  const addMember = () => {
    if (teamMembers.length >= 5) return
    setTeamMembers(prev => [...prev, { ...EMPTY_MEMBER }])
    setMemberErrors(prev => [...prev, {}])
  }

  const removeMember = (idx) => {
    setTeamMembers(prev => prev.filter((_, i) => i !== idx))
    setMemberErrors(prev => prev.filter((_, i) => i !== idx))
  }

  const updateMember = (idx, field, value) => {
    setTeamMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
    setMemberErrors(prev => prev.map((e, i) => {
      if (i !== idx) return e
      const next = { ...e }
      delete next[field]
      // Clear all accept errors together since they share one error message
      if (field === 'accept_edital' || field === 'accept_image' || field === 'accept_responsibility') {
        delete next.accept_edital
        delete next.accept_image
        delete next.accept_responsibility
      }
      return next
    }))
  }

  const onSubmit = async (data) => {
    setSubmitting(true)
    setSubmitError('')

    // Validate team members before proceeding
    if (inscriptionModality === 'team' && teamMembers.length > 0) {
      const allErrors = teamMembers.map(validateMember)
      setMemberErrors(allErrors)
      const firstErrorIdx = allErrors.findIndex(e => Object.keys(e).length > 0)
      if (firstErrorIdx !== -1) {
        const el = document.getElementById(`member-card-${firstErrorIdx}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setSubmitting(false)
        return
      }
    }

    const leaderBase = {
      full_name: data.full_name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      birth_date: data.birth_date,
      linkedin_url: data.linkedin_url?.trim() || null,
      occupation_type: data.occupation_type,
      ai_experience_level: parseInt(data.ai_experience_level),
      dietary_restrictions: data.dietary_restrictions?.trim() || '',
      is_pcd: data.is_pcd === 'yes',
      pcd_type: data.is_pcd === 'yes' ? (data.pcd_type?.trim() || null) : null,
      has_project: data.has_project === 'yes',
      project_name: data.has_project === 'yes' ? (data.project_name?.trim() || null) : null,
      economic_axes: data.economic_axes || [],
      inscription_modality: data.inscription_modality,
      team_name: data.inscription_modality === 'team' ? (data.team_name?.trim() || null) : null,
      payment_method: data.payment_method,
      ticket_tier: tier,
      ticket_price: currentPrice,
    }

    if (!supabase) {
      console.log('Supabase not configured. Registration data:', leaderBase)
      setSubmittedData({
        ...leaderBase,
        payment_method: data.payment_method,
        memberCount: totalPeople,
        totalPriceFormatted,
      })
      setSubmitted(true)
      setSubmitting(false)
      return
    }

    let insertError = null

    if (data.inscription_modality === 'team') {
      const leaderRow = { ...leaderBase, is_team_leader: true }
      const memberRows = teamMembers.map(m => ({
        full_name: m.full_name.trim(),
        email: m.email.trim().toLowerCase(),
        phone: m.phone.trim(),
        birth_date: m.birth_date,
        linkedin_url: m.linkedin_url?.trim() || null,
        occupation_type: m.occupation_type,
        ai_experience_level: parseInt(m.ai_experience_level),
        dietary_restrictions: m.dietary_restrictions?.trim() || '',
        is_pcd: m.is_pcd === 'yes',
        pcd_type: m.is_pcd === 'yes' ? (m.pcd_type?.trim() || null) : null,
        // Team-level fields — same as leader
        has_project: leaderBase.has_project,
        project_name: leaderBase.project_name,
        economic_axes: leaderBase.economic_axes,
        inscription_modality: 'team',
        team_name: leaderBase.team_name,
        payment_method: data.payment_method,
        ticket_tier: tier,
        ticket_price: currentPrice,
        is_team_leader: false,
      }))

      const { error } = await supabase.from('registrations').insert([leaderRow, ...memberRows])
      insertError = error
    } else {
      const { error } = await supabase.from('registrations').insert({ ...leaderBase, is_team_leader: false })
      insertError = error
    }

    if (insertError) {
      if (insertError.code === '23505') {
        setSubmitError('Um dos e-mails informados já está cadastrado. Verifique os dados e tente novamente.')
      } else {
        setSubmitError('Erro ao enviar inscrição. Tente novamente.')
        console.error(insertError)
      }
      setSubmitting(false)
      return
    }

    setSubmittedData({
      ...leaderBase,
      payment_method: data.payment_method,
      memberCount: totalPeople,
      totalPriceFormatted,
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  if (submitted) {
    return (
      <section id="inscricao" className="relative py-24 sm:py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <PaymentInfo
            paymentMethod={submittedData?.payment_method}
            price={currentPriceFormatted}
            email={submittedData?.email}
            totalPrice={submittedData?.totalPriceFormatted}
            memberCount={submittedData?.memberCount}
          />
        </div>
      </section>
    )
  }

  return (
    <section id="inscricao" className="relative py-24 sm:py-32 bg-grid">
      <div className="orb w-[400px] h-[400px] bg-cyan/10 -bottom-40 -left-40 animate-pulse-glow" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="font-mono text-sm text-cyan tracking-wider uppercase">Inscrição</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 mb-4">
            Garanta sua <span className="text-gradient-cyan">vaga</span>
          </h2>

          {/* Price badge */}
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-dark-border bg-surface">
            {loading ? (
              <span className="text-text-muted text-sm">Carregando...</span>
            ) : isTeamWithMembers ? (
              <>
                <span className="text-2xl font-bold font-mono text-white">{totalPriceFormatted}</span>
                <span className="text-text-muted text-sm">
                  ({currentPriceFormatted} &times; {totalPeople} pessoas)
                </span>
                {earlyBirdAvailable && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-cyan/10 text-cyan border border-cyan/20">
                    Early Bird &mdash; {earlyBirdSpotsLeft} vagas
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-3xl font-bold font-mono text-white">{currentPriceFormatted}</span>
                <span className="text-text-muted text-sm">/pessoa</span>
                {earlyBirdAvailable && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-cyan/10 text-cyan border border-cyan/20">
                    Early Bird &mdash; {earlyBirdSpotsLeft} vagas
                  </span>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-text-muted mt-3">Inclui alimentação completa, crachá e kit do participante</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* ===== DADOS PESSOAIS ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Dados Pessoais</legend>

            <div>
              <label className={LBL}>Nome Completo *</label>
              <input {...register('full_name', { required: 'Nome obrigatório' })} className={INPUT} placeholder="Seu nome completo" />
              {errors.full_name && <p className={ERR}>{errors.full_name.message}</p>}
            </div>

            <div>
              <label className={LBL}>Endereço de E-mail *</label>
              <input type="email" {...register('email', { required: 'E-mail obrigatório', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'E-mail inválido' } })} className={INPUT} placeholder="seu@email.com" />
              <p className="text-xs text-text-muted mt-1">Você receberá informações oficiais por esse email.</p>
              {errors.email && <p className={ERR}>{errors.email.message}</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LBL}>Número de Telefone para Contato *</label>
                <input type="tel" {...register('phone', { required: 'Telefone obrigatório' })} className={INPUT} placeholder="(47) 99999-9999" />
                {errors.phone && <p className={ERR}>{errors.phone.message}</p>}
              </div>
              <div>
                <label className={LBL}>Data de Nascimento *</label>
                <input type="date" {...register('birth_date', { required: 'Data obrigatória' })} className={INPUT} />
                {errors.birth_date && <p className={ERR}>{errors.birth_date.message}</p>}
              </div>
            </div>

            <div>
              <label className={LBL}>LinkedIn *</label>
              <input type="url" {...register('linkedin_url', { required: 'LinkedIn obrigatório' })} className={INPUT} placeholder="https://linkedin.com/in/..." />
              {errors.linkedin_url && <p className={ERR}>{errors.linkedin_url.message}</p>}
            </div>
          </fieldset>

          {/* ===== PERFIL ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Perfil</legend>

            <div>
              <label className={LBL}>Você se enquadra em qual perfil principal? *</label>
              <p className="text-xs text-text-muted mb-3">Recomendação Founders: Hacker, Hustler e Hipster.</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'hacker', label: 'Hacker', desc: 'Desenvolvedor/Técnico' },
                  { value: 'hustler', label: 'Hustler', desc: 'Negócios/Vendas' },
                  { value: 'hipster', label: 'Hipster', desc: 'Design/UX' },
                  { value: 'enthusiast', label: 'Entusiasta', desc: 'Outro' },
                ].map(({ value, label, desc }) => (
                  <label key={value} className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${watch('occupation_type') === value ? 'border-cyan bg-cyan/5 text-white' : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'}`}>
                    <input type="radio" value={value} {...register('occupation_type', { required: 'Selecione seu perfil' })} className="sr-only" />
                    <span className="font-semibold text-sm">{label}</span>
                    <span className="text-xs mt-1 opacity-70">{desc}</span>
                  </label>
                ))}
              </div>
              {errors.occupation_type && <p className={ERR}>{errors.occupation_type.message}</p>}
            </div>

            <div>
              <label className={LBL}>Qual seu nível de experiência com IA? *</label>
              <p className="text-xs text-text-muted mb-3">1 = Nenhum/Iniciante — 10 = Avançado/Especialista</p>
              <div className="flex gap-2 justify-between">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <label key={n} className={`flex-1 text-center py-2.5 rounded-lg border cursor-pointer transition-all font-mono text-sm ${parseInt(watch('ai_experience_level')) === n ? 'border-cyan bg-cyan/10 text-cyan font-bold' : 'border-dark-border bg-dark text-text-muted hover:border-text-muted'}`}>
                    <input type="radio" value={n} {...register('ai_experience_level', { required: 'Selecione seu nível' })} className="sr-only" />
                    {n}
                  </label>
                ))}
              </div>
              {errors.ai_experience_level && <p className={ERR}>{errors.ai_experience_level.message}</p>}
            </div>
          </fieldset>

          {/* ===== DISPONIBILIDADE E ACEITE ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Disponibilidade e Aceite</legend>

            <div>
              <label className={LBL}>Disponibilidade de Participação *</label>
              <div className="space-y-3">
                <label className={CHK_LABEL}>
                  <input type="checkbox" {...register('avail_physical', { required: 'Obrigatório' })} className={CHK_INPUT} />
                  Declaro que terei participação física no Centro de Inovação de Blumenau (CIB) durante a maior parte do evento (Mais de 80% do tempo)
                </label>
                <label className={CHK_LABEL}>
                  <input type="checkbox" {...register('avail_disqualification', { required: 'Obrigatório' })} className={CHK_INPUT} />
                  Entendo que a desclassificação pode ocorrer se a equipe não aparecer com nenhum membro no horário do cronograma
                </label>
              </div>
              {(errors.avail_physical || errors.avail_disqualification) && <p className={ERR}>Você precisa aceitar ambas as cláusulas.</p>}
            </div>

            <div>
              <label className={LBL}>Declaração de Ciência e Aceite *</label>
              <p className="text-xs text-text-muted mb-3">
                <a href={EVENT_CONFIG.editalGoogleDocsUrl} target="_blank" rel="noopener noreferrer" className="text-electric underline">Leia o edital completo</a>
              </p>
              <div className="space-y-3">
                <label className={CHK_LABEL}>
                  <input type="checkbox" {...register('accept_edital', { required: 'Obrigatório' })} className={CHK_INPUT} />
                  Declaro que li e compreendi o Edital de Participação, incluindo regras sobre composição de equipe, desclassificação, critérios de julgamento, e a natureza do prêmio (Capital Semente)
                </label>
                <label className={CHK_LABEL}>
                  <input type="checkbox" {...register('accept_image', { required: 'Obrigatório' })} className={CHK_INPUT} />
                  Autorizo, de forma gratuita, o uso da minha imagem e voz captadas durante o evento para fins de divulgação, conforme item 13.1 do Edital
                </label>
                <label className={CHK_LABEL}>
                  <input type="checkbox" {...register('accept_responsibility', { required: 'Obrigatório' })} className={CHK_INPUT} />
                  Estou ciente que a organização não se responsabiliza por perdas ou danos a equipamentos pessoais e que o uso do crachá é obrigatório
                </label>
              </div>
              {(errors.accept_edital || errors.accept_image || errors.accept_responsibility) && <p className={ERR}>Você precisa confirmar todas as declarações.</p>}
            </div>
          </fieldset>

          {/* ===== NECESSIDADES DO EVENTO ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Para o Evento</legend>

            <div>
              <label className={LBL}>Você tem alguma restrição alimentar? Se sim, qual? *</label>
              <input {...register('dietary_restrictions', { required: 'Campo obrigatório' })} className={INPUT} placeholder="Ex: Vegetariano, vegano, alergias... ou 'Não'" />
              {errors.dietary_restrictions && <p className={ERR}>{errors.dietary_restrictions.message}</p>}
            </div>

            <div>
              <label className={LBL}>Você se identifica como pessoa com deficiência (PcD)? *</label>
              <div className="grid grid-cols-2 gap-3">
                {[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }].map(({ value, label }) => (
                  <label key={value} className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all ${isPcd === value ? 'border-cyan bg-cyan/5 text-white' : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'}`}>
                    <input type="radio" value={value} {...register('is_pcd', { required: 'Obrigatório' })} className="sr-only" />
                    <span className="text-sm font-semibold">{label}</span>
                  </label>
                ))}
              </div>
              {errors.is_pcd && <p className={ERR}>{errors.is_pcd.message}</p>}
            </div>

            {isPcd === 'yes' && (
              <div>
                <label className={LBL}>Se sim, por favor, indique o tipo (opcional):</label>
                <input {...register('pcd_type')} className={INPUT} placeholder="Tipo de deficiência" />
              </div>
            )}
          </fieldset>

          {/* ===== PROJETO ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Projeto</legend>

            <div>
              <label className={LBL}>Você já tem um projeto? *</label>
              <div className="grid grid-cols-2 gap-3">
                {[{ value: 'yes', label: 'Sim' }, { value: 'no', label: 'Não' }].map(({ value, label }) => (
                  <label key={value} className={`flex items-center justify-center p-3 rounded-xl border cursor-pointer transition-all ${hasProject === value ? 'border-cyan bg-cyan/5 text-white' : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'}`}>
                    <input type="radio" value={value} {...register('has_project', { required: 'Obrigatório' })} className="sr-only" />
                    <span className="text-sm font-semibold">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {hasProject === 'yes' && (
              <div>
                <label className={LBL}>Seu projeto tem um nome? (opcional)</label>
                <input {...register('project_name')} className={INPUT} placeholder="Nome do projeto" />
              </div>
            )}
          </fieldset>

          {/* ===== CRITÉRIOS ELIMINATÓRIOS ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Compromisso com os Critérios *</legend>
            <p className="text-xs text-hot mb-3">Todos os itens abaixo são obrigatórios para participar do evento.</p>
            <div className="space-y-3">
              {[
                { name: 'commit_ia', text: 'Nossa solução terá como uso central e obrigatório tecnologias de Inteligência Artificial (IA)' },
                { name: 'commit_monetizable', text: 'Entendo que produtos não monetizáveis serão desclassificados' },
                { name: 'commit_sales', text: 'Estou ciente de que evidências de tração comercial (vendas, pré-vendas, LOIs) geram pontuação extra na avaliação' },
                { name: 'commit_edital', text: 'Eu li o edital completo e concordo com todas as cláusulas' },
              ].map(({ name, text }) => (
                <label key={name} className={CHK_LABEL}>
                  <input type="checkbox" {...register(name, { required: 'Obrigatório' })} className={CHK_INPUT} />
                  {text}
                </label>
              ))}
            </div>
            {(errors.commit_ia || errors.commit_monetizable || errors.commit_sales || errors.commit_edital) && (
              <p className={ERR}>Você precisa concordar com todos os critérios eliminatórios.</p>
            )}
          </fieldset>

          {/* ===== EIXOS ECONÔMICOS ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Eixos Econômicos (Opcional)</legend>
            <p className="text-xs text-text-muted mb-3">Quais Eixos Econômicos de Blumenau sua solução planeja abordar para pontuação extra?</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {['Metalmecânico', 'Têxtil', 'TIC', 'Turismo', 'Economia Criativa', 'Saúde', 'Nenhum'].map(axis => (
                <label key={axis} className="flex items-center gap-2 p-3 rounded-xl border border-dark-border bg-dark hover:border-text-muted cursor-pointer transition-colors text-sm text-text-muted">
                  <input type="checkbox" value={axis} {...register('economic_axes')} className={CHK_INPUT} />
                  {axis}
                </label>
              ))}
            </div>
          </fieldset>

          {/* ===== MODALIDADE ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Modalidade de Inscrição</legend>

            <div className="space-y-3">
              {[
                { value: 'individual_form_team', label: 'Inscrição Individual', desc: 'Formarei ou serei integrado a uma equipe na noite de abertura (22/05)' },
                { value: 'individual_own', label: 'Inscrição Individual (equipe já existe)', desc: 'Cada integrante da minha equipe se inscreverá por conta própria' },
                { value: 'team', label: 'Inscrição em Equipe', desc: 'Já possuo um time e inscreverei todos agora' },
              ].map(({ value, label, desc }) => (
                <label key={value} className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${inscriptionModality === value ? 'border-cyan bg-cyan/5 text-white' : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'}`}>
                  <input type="radio" value={value} {...register('inscription_modality')} className="sr-only" />
                  <span className="font-semibold text-sm">{label}</span>
                  <span className="text-xs mt-1 opacity-70">{desc}</span>
                </label>
              ))}
            </div>

            {inscriptionModality === 'team' && (
              <div className="space-y-5 pt-1">
                {/* Nome da equipe */}
                <div>
                  <label className={LBL}>Nome da Equipe *</label>
                  <input
                    {...register('team_name', {
                      validate: v => inscriptionModality !== 'team' || (!!v && v.trim().length > 0) || 'Nome da equipe obrigatório',
                    })}
                    className={INPUT}
                    placeholder="Nome da sua equipe"
                  />
                  {errors.team_name && <p className={ERR}>{errors.team_name.message}</p>}
                </div>

                {/* Membros da equipe */}
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      Membros da Equipe
                      <span className="ml-2 font-mono text-text-muted text-xs">
                        {teamMembers.length}/5 adicionais
                      </span>
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      Você (líder) + {teamMembers.length} {teamMembers.length === 1 ? 'membro' : 'membros'} = {totalPeople} {totalPeople === 1 ? 'pessoa' : 'pessoas'}
                    </p>
                  </div>

                  {teamMembers.map((member, idx) => (
                    <MemberCard
                      key={idx}
                      index={idx}
                      member={member}
                      errors={memberErrors[idx] || {}}
                      onChange={(field, value) => updateMember(idx, field, value)}
                      onRemove={() => removeMember(idx)}
                    />
                  ))}

                  {teamMembers.length < 5 && (
                    <button
                      type="button"
                      onClick={addMember}
                      className="w-full py-3 px-4 rounded-xl border border-dashed border-dark-border text-text-muted hover:border-cyan hover:text-cyan transition-all text-sm font-semibold flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Adicionar Membro
                      {teamMembers.length > 0 && (
                        <span className="text-xs font-mono opacity-60">
                          ({5 - teamMembers.length} restantes)
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )}
          </fieldset>

          {/* ===== PAGAMENTO ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Pagamento</legend>
            <div>
              <label className={LBL}>Forma de Pagamento *</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'pix', label: 'Pix', desc: 'Sem taxas' },
                  { value: 'card', label: 'Cartão', desc: 'Link de pagamento' },
                ].map(({ value, label, desc }) => (
                  <label key={value} className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${paymentMethod === value ? 'border-cyan bg-cyan/5 text-white' : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'}`}>
                    <input type="radio" value={value} {...register('payment_method')} className="sr-only" />
                    <span className="font-semibold text-sm">{label}</span>
                    <span className="text-xs mt-1 opacity-70">{desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          {/* Submit */}
          {submitError && (
            <div className="p-4 rounded-xl bg-hot/10 border border-hot/20 text-hot text-sm">{submitError}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 px-8 bg-gradient-to-r from-cyan to-electric text-dark font-bold text-lg rounded-xl transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(6,214,160,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {submitting
              ? 'Enviando...'
              : isTeamWithMembers
                ? `Finalizar Inscrição — ${totalPriceFormatted} (${totalPeople} pessoas)`
                : `Finalizar Inscrição — ${currentPriceFormatted}`
            }
          </button>

          <p className="text-xs text-text-muted text-center">
            Ao se inscrever, você concorda com o{' '}
            <a href={EVENT_CONFIG.editalUrl} target="_blank" className="text-electric underline underline-offset-2">edital do evento</a>.
          </p>
        </form>
      </div>
    </section>
  )
}

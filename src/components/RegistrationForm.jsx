import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { audit } from '../lib/auditLog'
import { useTicketPrice } from '../hooks/useTicketPrice'
import { EVENT_CONFIG } from '../lib/config'
import PaymentInfo from './PaymentInfo'

const INPUT = 'w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 transition-colors'
const LBL = 'block text-sm font-semibold text-white mb-2'
const ERR = 'text-hot text-xs mt-1'
const CHK_LABEL = 'flex items-start gap-3 p-3 rounded-xl border border-dark-border bg-dark hover:border-text-muted cursor-pointer transition-colors text-sm text-text-muted leading-relaxed'
const CHK_INPUT = 'mt-0.5 w-4 h-4 rounded border-dark-border bg-dark text-cyan accent-cyan flex-shrink-0'

const ORDINALS = ['2º', '3º', '4º', '5º', '6º']

function validateCPF(cpf) {
  const cleaned = cpf.replace(/\D/g, '')
  if (cleaned.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cleaned)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder >= 10) remainder = 0
  if (remainder !== parseInt(cleaned[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder >= 10) remainder = 0
  return remainder === parseInt(cleaned[10])
}

const EMPTY_MEMBER = {
  full_name: '',
  email: '',
  phone: '',
  birth_date: '',
  linkedin_url: '',
  cpf: '',
  occupation_type: '',
  ai_experience_level: '',
  dietary_restrictions: '',
  is_pcd: 'no',
  pcd_type: '',
  is_remote: false,
  accept_edital: false,
  accept_image: false,
  accept_responsibility: false,
  accept_lgpd: false,
  accept_code_ip: false,
}

function validateMember(member) {
  const errs = {}
  if (!member.full_name.trim()) errs.full_name = 'Nome obrigatório'
  if (!member.email.trim()) errs.email = 'E-mail obrigatório'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email.trim())) errs.email = 'E-mail inválido'
  if (!member.phone.trim()) errs.phone = 'Telefone obrigatório'
  if (!member.birth_date) errs.birth_date = 'Data obrigatória'
  if (!validateCPF(member.cpf)) errs.cpf = 'CPF inválido'
  if (!member.occupation_type) errs.occupation_type = 'Selecione um perfil'
  if (!member.ai_experience_level) errs.ai_experience_level = 'Selecione um nível'
  if (!member.dietary_restrictions.trim()) errs.dietary_restrictions = 'Campo obrigatório'
  if (!member.accept_edital) errs.accept_edital = 'Obrigatório'
  if (!member.accept_image) errs.accept_image = 'Obrigatório'
  if (!member.accept_responsibility) errs.accept_responsibility = 'Obrigatório'
  if (!member.accept_lgpd) errs.accept_lgpd = 'Obrigatório'
  if (!member.accept_code_ip) errs.accept_code_ip = 'Obrigatório'
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
                maxLength={120}
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
                maxLength={20}
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

          {/* CPF */}
          <div>
            <label className={LBL}>CPF *</label>
            <input
              maxLength={14}
              value={member.cpf}
              onChange={e => onChange('cpf', e.target.value)}
              className={INPUT}
              placeholder="000.000.000-00"
            />
            {errors.cpf && <p className={ERR}>{errors.cpf}</p>}
          </div>

          {/* LinkedIn */}
          <div>
            <label className={LBL}>LinkedIn (opcional)</label>
            <input
              type="url"
              maxLength={200}
              value={member.linkedin_url}
              onChange={e => onChange('linkedin_url', e.target.value)}
              className={INPUT}
              placeholder="https://linkedin.com/in/..."
            />
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

          {/* Participação remota */}
          <label className={CHK_LABEL}>
            <input
              type="checkbox"
              checked={member.is_remote}
              onChange={e => onChange('is_remote', e.target.checked)}
              className={CHK_INPUT}
            />
            <span>Este membro participará <strong>remotamente</strong> (máx. 1 por equipe — edital 2.2.1)</span>
          </label>

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
              <label className={`${CHK_LABEL} ${errors.accept_lgpd ? 'border-hot/40' : ''}`}>
                <input
                  type="checkbox"
                  checked={member.accept_lgpd}
                  onChange={e => onChange('accept_lgpd', e.target.checked)}
                  className={CHK_INPUT}
                />
                <span>
                  Li e concordo com a{' '}
                  <a href="#privacidade" className="text-electric underline" onClick={e => e.stopPropagation()}>Política de Privacidade</a>.
                  {' '}Autorizo a coleta e o tratamento dos meus dados pessoais pela MORPH3D INOVA SIMPLES (I.S.) para fins de organização do evento.
                </span>
              </label>
              <label className={`${CHK_LABEL} ${errors.accept_code_ip ? 'border-hot/40' : ''}`}>
                <input
                  type="checkbox"
                  checked={member.accept_code_ip}
                  onChange={e => onChange('accept_code_ip', e.target.checked)}
                  className={CHK_INPUT}
                />
                Declaro que todo código-fonte e material intelectual que eu utilizar durante o evento é de minha autoria ou possuo autorização legal para utilizá-lo.
              </label>
            </div>
            {(errors.accept_edital || errors.accept_image || errors.accept_responsibility || errors.accept_lgpd || errors.accept_code_ip) && (
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
  const { register, handleSubmit, watch, setValue, setError, clearErrors, formState: { errors } } = useForm({
    defaultValues: {
      inscription_modality: 'individual_form_team',
      payment_method: 'card',
      has_project: 'no',
      is_pcd: 'no',
    },
  })

  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitErrorAction, setSubmitErrorAction] = useState(null)
  const [submittedData, setSubmittedData] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [memberErrors, setMemberErrors] = useState([])

  const [termsExpanded, setTermsExpanded] = useState(false)

  // Recovery state
  const [recovering, setRecovering] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')

  // URL params — early access + DATI secret discount + voucher empresarial
  const urlParams = new URLSearchParams(window.location.search)
  const earlyCode = urlParams.get('early')
  const hasEarlyAccess = earlyCode === EVENT_CONFIG.earlyAccessCode
  const datiCode = urlParams.get('dati')
  const hasDatiDiscount = !!EVENT_CONFIG.datiDiscountCode && datiCode === EVENT_CONFIG.datiDiscountCode
  const voucherCode = (urlParams.get('voucher') || '').trim().toUpperCase()
  const isVoucherMode = !!voucherCode

  // Voucher lookup — validates code and fetches company info
  const [voucherState, setVoucherState] = useState(isVoucherMode ? { status: 'loading' } : null)
  useEffect(() => {
    if (!isVoucherMode || !supabase) {
      if (isVoucherMode && !supabase) setVoucherState({ status: 'error', reason: 'system_unavailable' })
      return
    }
    let cancelled = false
    supabase.rpc('lookup_voucher', { p_code: voucherCode }).then(({ data, error }) => {
      if (cancelled) return
      if (error || !data) {
        setVoucherState({ status: 'error', reason: 'lookup_failed' })
        return
      }
      if (!data.valid) {
        setVoucherState({ status: 'invalid', reason: data.reason })
        return
      }
      setVoucherState({
        status: 'valid',
        companyName: data.company_name,
        ticketPrice: data.ticket_price,
        ticketTier: data.ticket_tier,
      })
    })
    return () => { cancelled = true }
  }, [isVoucherMode, voucherCode])

  const { currentPrice, currentPriceFormatted, earlyBirdAvailable, earlyBirdSpotsLeft, tier, capacityFull, loading } = useTicketPrice({ hasDatiDiscount })

  // Waitlist state
  const [waitlistSubmitted, setWaitlistSubmitted] = useState(false)
  const [waitlistSubmitting, setWaitlistSubmitting] = useState(false)
  const [waitlistError, setWaitlistError] = useState('')

  const inscriptionModality = watch('inscription_modality')
  const hasProject = watch('has_project')
  const isPcd = watch('is_pcd')

  // Price calculation — currentPrice is in centavos (15000 = R$ 150,00)
  const totalPeople = inscriptionModality === 'team' ? 1 + teamMembers.length : 1
  const totalPrice = currentPrice * totalPeople
  const totalPriceFormatted = `R$ ${(totalPrice / 100).toFixed(0)},00`
  const isTeamWithMembers = inscriptionModality === 'team' && teamMembers.length > 0

  // Registration window — fallback to open if config fields not yet set
  const now = new Date()
  const regStart = EVENT_CONFIG.registrationStart ? new Date(EVENT_CONFIG.registrationStart) : null
  const earlyStart = hasEarlyAccess && EVENT_CONFIG.earlyAccessStart ? new Date(EVENT_CONFIG.earlyAccessStart) : null
  const effectiveStart = earlyStart || regStart
  const regEnd = EVENT_CONFIG.registrationEnd ? new Date(EVENT_CONFIG.registrationEnd) : null
  const registrationOpen = (!effectiveStart || !regEnd) ? true : (now >= effectiveStart && now <= regEnd)
  const registrationNotStarted = effectiveStart && now < effectiveStart
  const registrationEnded = regEnd && now > regEnd

  // Scroll to top when form is submitted
  useEffect(() => {
    if (submitted) {
      const el = document.getElementById('inscricao')
      if (el) el.scrollIntoView({ behavior: 'smooth' })
    }
  }, [submitted])

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
      if (field === 'accept_edital' || field === 'accept_image' || field === 'accept_responsibility' || field === 'accept_lgpd' || field === 'accept_code_ip') {
        delete next.accept_edital
        delete next.accept_image
        delete next.accept_responsibility
        delete next.accept_lgpd
        delete next.accept_code_ip
      }
      return next
    }))
  }

  // ─── Recovery helper ──────────────────────────────────────────────────────
  const recoverRegistration = async (email) => {
    if (!supabase || !email?.trim()) return { success: false, message: 'Informe um e-mail válido.' }
    setRecovering(true)
    setRecoveryError('')

    try {
      const { data, error } = await supabase.rpc('recover_pending_registration', {
        p_email: email.trim().toLowerCase(),
      })

      if (error) {
        setRecovering(false)
        return { success: false, message: 'Erro ao buscar inscrição. Tente novamente.' }
      }

      if (!data) {
        setRecovering(false)
        return { success: false, message: 'Nenhuma inscrição pendente encontrada para esse e-mail.' }
      }

      if (data.status === 'already_processed') {
        setRecovering(false)
        return { success: false, message: 'Essa inscrição já foi confirmada ou cancelada. Em caso de dúvidas, entre em contato.' }
      }

      const memberCount = data.member_count || 1
      const ticketPrice = data.ticket_price
      const perPersonFormatted = `R$ ${(ticketPrice / 100).toFixed(0)},00`
      const totalFormatted = `R$ ${(ticketPrice * memberCount / 100).toFixed(0)},00`

      setSubmittedData({
        registration_id: data.id,
        full_name: data.full_name,
        email: data.email,
        payment_method: data.payment_method,
        ticket_price: ticketPrice,
        ticket_tier: data.ticket_tier,
        team_name: data.team_name,
        memberCount,
        totalPriceFormatted: totalFormatted,
        priceFormatted: perPersonFormatted,
        price_expires_at: data.price_expires_at,
      })
      audit({
        action: 'registration.recover',
        actorType: 'public',
        actorEmail: email.trim().toLowerCase(),
        targetTable: 'registrations',
        targetId: data.id,
        targetEmail: data.email,
        newData: { ticket_tier: data.ticket_tier, ticket_price: data.ticket_price, member_count: memberCount },
      })

      setSubmitted(true)
      setRecovering(false)
      return { success: true }
    } catch (err) {
      setRecovering(false)
      return { success: false, message: 'Erro inesperado. Tente novamente.' }
    }
  }

  // ─── CPF availability check (defense in depth — DB also has UNIQUE) ──────
  // entries: [{ cpf, label, target: 'leader' | 'member', memberIdx? }]
  const checkCpfsAvailable = async (entries) => {
    // 1) Internal duplicate: same CPF appearing twice in the same submission
    const seen = new Map()
    for (const e of entries) {
      const clean = (e.cpf || '').replace(/\D/g, '')
      if (clean.length !== 11) continue
      if (seen.has(clean)) {
        return {
          ok: false,
          kind: 'internal_dup',
          message: `O CPF está repetido entre ${seen.get(clean)} e ${e.label}. Cada participante deve ter um CPF único.`,
          conflictA: seen.get(clean),
          conflictB: e,
        }
      }
      seen.set(clean, e.label)
    }

    if (!supabase) return { ok: true }

    // 2) DB lookup in parallel
    const checks = await Promise.all(entries.map(async (e) => {
      const clean = (e.cpf || '').replace(/\D/g, '')
      if (clean.length !== 11) return { ...e, exists: false }
      try {
        const { data: result, error } = await supabase.rpc('check_cpf_registered', { p_cpf: clean })
        if (error) return { ...e, exists: false, lookupError: true }
        return { ...e, exists: !!result?.exists, status: result?.status }
      } catch {
        return { ...e, exists: false, lookupError: true }
      }
    }))

    const conflict = checks.find(c => c.exists)
    if (conflict) return { ok: false, kind: 'db_conflict', conflict }
    return { ok: true }
  }

  const onSubmit = async (data) => {
    setSubmitting(true)
    setSubmitError('')
    setSubmitErrorAction(null)
    clearErrors('cpf')

    // ── Voucher mode — empresa já pagou; só insere registration confirmada
    if (isVoucherMode) {
      if (voucherState?.status !== 'valid') {
        setSubmitError('Voucher inválido ou expirado.')
        setSubmitting(false)
        return
      }
      const payload = {
        full_name: data.full_name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.trim(),
        birth_date: data.birth_date,
        linkedin_url: data.linkedin_url?.trim() || null,
        cpf: data.cpf?.trim() || '',
        occupation_type: data.occupation_type,
        ai_experience_level: parseInt(data.ai_experience_level),
        dietary_restrictions: data.dietary_restrictions?.trim() || '',
        is_pcd: data.is_pcd === 'yes',
        pcd_type: data.is_pcd === 'yes' ? (data.pcd_type?.trim() || null) : null,
        has_project: data.has_project === 'yes',
        project_name: data.has_project === 'yes' ? (data.project_name?.trim() || null) : null,
        economic_axes: data.economic_axes || [],
        is_remote: false,
        accept_lgpd: data.accept_lgpd || false,
        accept_code_ip: data.accept_code_ip || false,
      }

      if (!supabase) {
        setSubmitError('Sistema indisponível. Tente novamente mais tarde.')
        setSubmitting(false)
        return
      }

      const cpfCheck = await checkCpfsAvailable([
        { cpf: payload.cpf, label: 'sua inscrição', target: 'leader' },
      ])
      if (!cpfCheck.ok) {
        const c = cpfCheck.conflict
        const msg = c?.status === 'confirmed'
          ? 'Já existe uma inscrição confirmada com este CPF. Acesse o painel do participante para visualizar.'
          : 'Já existe uma inscrição com este CPF. Acesse o painel do participante para finalizar.'
        setError('cpf', { message: 'CPF já cadastrado em outra inscrição' })
        setSubmitError(msg)
        setSubmitErrorAction({ label: 'Ir para o painel do participante', href: '#participante-login' })
        setSubmitting(false)
        return
      }

      const { data: result, error: rpcError } = await supabase.rpc('redeem_voucher', {
        p_code: voucherCode,
        p_data: payload,
      })

      if (rpcError) {
        const msg = rpcError.message || ''
        if (msg.includes('voucher_already_redeemed')) setSubmitError('Este voucher já foi utilizado.')
        else if (msg.includes('voucher_cancelled')) setSubmitError('Este voucher foi cancelado.')
        else if (msg.includes('voucher_not_found')) setSubmitError('Voucher não encontrado.')
        else if (msg.includes('order_not_paid')) setSubmitError('O pagamento da empresa ainda não foi confirmado. Aguarde alguns minutos e tente novamente.')
        else if (msg.includes('uq_reg_cpf_active')) {
          setError('cpf', { message: 'CPF já cadastrado em outra inscrição' })
          setSubmitError('Já existe uma inscrição com este CPF. Acesse o painel do participante para visualizar.')
          setSubmitErrorAction({ label: 'Ir para o painel do participante', href: '#participante-login' })
        }
        else if (msg.includes('duplicate key value') || msg.includes('23505')) setSubmitError('Este e-mail já está cadastrado em outra inscrição.')
        else setSubmitError('Erro ao processar inscrição: ' + msg)
        setSubmitting(false)
        return
      }

      audit({
        action: 'registration.create_voucher',
        actorType: 'public',
        actorEmail: payload.email,
        targetTable: 'registrations',
        targetId: result.registration_id,
        targetEmail: payload.email,
        newData: {
          full_name: payload.full_name,
          company_name: result.company_name,
          ticket_tier: result.ticket_tier,
          ticket_price: result.ticket_price,
          voucher_code: voucherCode,
        },
      })

      setSubmittedData({
        ...payload,
        memberCount: 1,
        registration_id: result.registration_id,
        ticket_price: result.ticket_price,
        ticket_tier: result.ticket_tier,
        company_name: result.company_name,
        voucher_code: voucherCode,
      })
      setSubmitted(true)
      setSubmitting(false)
      return
    }

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

    // Minimum 3 total participants for team registration (edital 2.2)
    if (inscriptionModality === 'team' && teamMembers.length < 2) {
      setSubmitError('Equipes devem ter no mínimo 3 participantes (edital 2.2). Adicione pelo menos mais ' + (2 - teamMembers.length) + ' membro(s).')
      setSubmitting(false)
      return
    }

    // At most 1 remote member per team (edital 2.2.1)
    if (inscriptionModality === 'team') {
      const remoteCount = teamMembers.filter(m => m.is_remote).length
      if (remoteCount > 1) {
        setSubmitError('Apenas 1 membro por equipe pode participar remotamente (edital 2.2.1).')
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
      cpf: data.cpf?.trim() || '',
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
      price_expires_at: tier === 'early_bird' ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
      is_remote: false,
      accept_lgpd: data.accept_lgpd || false,
      accept_code_ip: data.accept_code_ip || false,
    }

    if (!supabase) {
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

    // CPF availability pre-check (avoid wasting submit on dup); DB UNIQUE
    // index `uq_reg_cpf_active` is the source of truth for race conditions.
    const cpfEntries = [{ cpf: leaderBase.cpf, label: 'sua inscrição', target: 'leader' }]
    if (data.inscription_modality === 'team') {
      teamMembers.forEach((m, idx) => {
        cpfEntries.push({
          cpf: m.cpf?.trim() || '',
          label: `${ORDINALS[idx]} membro`,
          target: 'member',
          memberIdx: idx,
        })
      })
    }
    const cpfCheck = await checkCpfsAvailable(cpfEntries)
    if (!cpfCheck.ok) {
      if (cpfCheck.kind === 'internal_dup') {
        setSubmitError(cpfCheck.message)
        const dup = cpfCheck.conflictB
        if (dup.target === 'leader') setError('cpf', { message: 'CPF repetido com outro participante' })
        else setMemberErrors(prev => prev.map((e, i) => i === dup.memberIdx ? { ...e, cpf: 'CPF repetido com outro participante' } : e))
      } else {
        const c = cpfCheck.conflict
        if (c.target === 'leader') {
          setError('cpf', { message: 'CPF já cadastrado em outra inscrição' })
          const msg = c.status === 'confirmed'
            ? 'Já existe uma inscrição confirmada com este CPF. Acesse o painel do participante para visualizar.'
            : 'Já existe uma inscrição com este CPF. Acesse o painel do participante para finalizar.'
          setSubmitError(msg)
          setSubmitErrorAction({ label: 'Ir para o painel do participante', href: '#participante-login' })
        } else {
          setMemberErrors(prev => prev.map((e, i) => i === c.memberIdx ? { ...e, cpf: 'CPF já cadastrado em outra inscrição' } : e))
          setSubmitError(`O CPF do ${c.label} já está em outra inscrição. Cada participante só pode estar em uma inscrição.`)
          const el = document.getElementById(`member-card-${c.memberIdx}`)
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
      }
      setSubmitting(false)
      return
    }

    let insertError = null
    const leaderId = crypto.randomUUID()

    if (data.inscription_modality === 'team') {
      const leaderRow = { id: leaderId, ...leaderBase, is_team_leader: true }
      const memberRows = teamMembers.map(m => ({
        id: crypto.randomUUID(),
        full_name: m.full_name.trim(),
        email: m.email.trim().toLowerCase(),
        phone: m.phone.trim(),
        birth_date: m.birth_date,
        linkedin_url: m.linkedin_url?.trim() || null,
        cpf: m.cpf?.trim() || '',
        occupation_type: m.occupation_type,
        ai_experience_level: parseInt(m.ai_experience_level),
        dietary_restrictions: m.dietary_restrictions?.trim() || '',
        is_pcd: m.is_pcd === 'yes',
        pcd_type: m.is_pcd === 'yes' ? (m.pcd_type?.trim() || null) : null,
        is_remote: m.is_remote || false,
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
        accept_lgpd: m.accept_lgpd || false,
        accept_code_ip: m.accept_code_ip || false,
      }))

      const { error } = await supabase.from('registrations').insert([leaderRow, ...memberRows])
      insertError = error
    } else {
      const { error } = await supabase.from('registrations').insert({ id: leaderId, ...leaderBase, is_team_leader: false })
      insertError = error
    }

    if (insertError) {
      if (import.meta.env.DEV) console.error('[RegistrationForm] Insert error:', insertError)
      if (insertError.code === '23505') {
        const errMsg = `${insertError.message || ''} ${insertError.details || ''}`
        if (errMsg.includes('uq_reg_cpf_active')) {
          setError('cpf', { message: 'CPF já cadastrado em outra inscrição' })
          setSubmitError('Já existe uma inscrição com este CPF. Acesse o painel do participante para visualizar.')
          setSubmitErrorAction({ label: 'Ir para o painel do participante', href: '#participante-login' })
        } else {
          const result = await recoverRegistration(data.email)
          if (!result.success) {
            setSubmitError(result.message)
          }
        }
      } else {
        setSubmitError('Erro ao enviar inscrição. Tente novamente.')
      }
      setSubmitting(false)
      return
    }

    audit({
      action: data.inscription_modality === 'team' ? 'registration.create_team' : 'registration.create',
      actorType: 'public',
      actorEmail: data.email,
      targetTable: 'registrations',
      targetId: leaderId,
      targetEmail: data.email,
      newData: {
        full_name: leaderBase.full_name,
        inscription_modality: data.inscription_modality,
        team_name: leaderBase.team_name,
        member_count: totalPeople,
        ticket_tier: tier,
        ticket_price: currentPrice,
        payment_method: data.payment_method,
      },
    })

    setSubmittedData({
      ...leaderBase,
      payment_method: data.payment_method,
      memberCount: totalPeople,
      totalPriceFormatted,
      registration_id: leaderId,
      price_expires_at: leaderBase.price_expires_at,
    })
    setSubmitted(true)
    setSubmitting(false)
  }

  // ─── Voucher loading / error states ────────────────────────────────────────
  if (isVoucherMode && voucherState?.status === 'loading') {
    return (
      <section id="inscricao" className="relative py-24 sm:py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="card-glass rounded-2xl p-8 sm:p-12 text-center">
            <p className="text-white/60 font-mono">Validando voucher...</p>
          </div>
        </div>
      </section>
    )
  }

  if (isVoucherMode && voucherState?.status !== 'valid' && !submitted) {
    const reason = voucherState?.reason
    const messages = {
      not_found: 'Voucher não encontrado. Verifique o código ou entre em contato com a empresa.',
      redeemed: 'Este voucher já foi utilizado por outro participante.',
      cancelled: 'Este voucher foi cancelado pela organização.',
      order_not_paid: 'O pagamento da empresa ainda não foi confirmado. Aguarde a confirmação ou entre em contato com o responsável.',
      lookup_failed: 'Erro ao validar voucher. Tente recarregar a página.',
      system_unavailable: 'Sistema indisponível no momento. Tente novamente mais tarde.',
    }
    return (
      <section id="inscricao" className="relative py-24 sm:py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="card-glass rounded-2xl p-8 sm:p-12 text-center">
            <span className="font-mono text-sm text-hot tracking-wider uppercase">Voucher inválido</span>
            <p className="mt-6 text-white">{messages[reason] || 'Voucher inválido.'}</p>
            <p className="text-text-muted mt-4 text-sm">
              Dúvidas: <a href={`mailto:${EVENT_CONFIG.organizer.email}`} className="text-electric underline">{EVENT_CONFIG.organizer.email}</a>
            </p>
          </div>
        </div>
      </section>
    )
  }

  // Voucher mode bypassa as checagens normais de janela e capacidade —
  // a empresa já pagou e o ingresso está reservado.
  if (!registrationOpen && !isVoucherMode) {
    return (
      <section id="inscricao" className="relative py-24 sm:py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="card-glass rounded-2xl p-8 sm:p-12 text-center">
            <span className="font-mono text-sm text-cyan tracking-wider uppercase">Inscrição</span>
            {registrationNotStarted ? (
              <p className="mt-6 text-lg text-white font-semibold">
                {hasEarlyAccess
                  ? 'Acesso antecipado — inscrições abrem às 11:30. Fique ligado!'
                  : 'Inscrições abrem em 08 de abril às 12h. Fique ligado!'}
              </p>
            ) : registrationEnded ? (
              <p className="mt-6 text-lg text-white font-semibold">
                Inscrições encerradas em 13/05 às 15h. Dúvidas:{' '}
                <a href="mailto:contato@hackiasc.com" className="text-electric underline">
                  contato@hackiasc.com
                </a>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    )
  }

  // ─── Waitlist submit handler ──────────────────────────────────────────────
  const handleWaitlistSubmit = async (e) => {
    e.preventDefault()
    setWaitlistSubmitting(true)
    setWaitlistError('')
    const form = new FormData(e.target)
    const name = form.get('wl_name')?.trim()
    const email = form.get('wl_email')?.trim()
    const phone = form.get('wl_phone')?.trim()
    if (!name || !email || !phone) {
      setWaitlistError('Preencha todos os campos.')
      setWaitlistSubmitting(false)
      return
    }
    if (!supabase) {
      setWaitlistError('Sistema indisponível. Tente novamente mais tarde.')
      setWaitlistSubmitting(false)
      return
    }
    const { error } = await supabase.from('waitlist').insert({ full_name: name, email: email.toLowerCase(), phone })
    if (error) {
      if (error.code === '23505') setWaitlistError('Este e-mail já está na lista de espera.')
      else setWaitlistError('Erro ao salvar. Tente novamente.')
      setWaitlistSubmitting(false)
      return
    }
    audit({
      action: 'waitlist.join',
      actorType: 'public',
      actorEmail: email.toLowerCase(),
      targetTable: 'waitlist',
      targetEmail: email.toLowerCase(),
      newData: { full_name: name, phone },
    })
    setWaitlistSubmitted(true)
    setWaitlistSubmitting(false)
  }

  // ─── Capacity full → waitlist ───────────────────────────────────────────────
  // Voucher mode bypassa: o ingresso já foi pago pela empresa, não precisa de vaga adicional.
  if (capacityFull && !submitted && !isVoucherMode) {
    return (
      <section id="inscricao" className="relative py-24 sm:py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="card-glass rounded-2xl p-8 sm:p-12 text-center">
            <span className="font-mono text-sm text-hot tracking-wider uppercase">Vagas esgotadas</span>
            <h2 className="text-2xl sm:text-3xl font-bold text-white mt-4">
              100 participantes inscritos
            </h2>
            <p className="text-text-muted mt-3 mb-8">
              As vagas foram preenchidas! Entre na lista de espera e te avisaremos se surgir uma vaga.
            </p>

            {waitlistSubmitted ? (
              <div className="bg-cyan/10 border border-cyan/20 rounded-xl p-6">
                <p className="text-cyan font-semibold">Você está na lista de espera!</p>
                <p className="text-text-muted text-sm mt-2">Entraremos em contato caso surja uma vaga.</p>
              </div>
            ) : (
              <form onSubmit={handleWaitlistSubmit} className="space-y-4 text-left max-w-md mx-auto">
                <div>
                  <label className={LBL}>Nome completo *</label>
                  <input name="wl_name" className={INPUT} placeholder="Seu nome" required />
                </div>
                <div>
                  <label className={LBL}>E-mail *</label>
                  <input name="wl_email" type="email" className={INPUT} placeholder="seu@email.com" required />
                </div>
                <div>
                  <label className={LBL}>Telefone *</label>
                  <input name="wl_phone" type="tel" className={INPUT} placeholder="(47) 99999-9999" required />
                </div>
                {waitlistError && <p className={ERR}>{waitlistError}</p>}
                <button
                  type="submit"
                  disabled={waitlistSubmitting}
                  className="w-full py-3 bg-gradient-to-r from-hot to-violet text-white font-bold rounded-xl transition-all hover:scale-[1.02] disabled:opacity-50"
                >
                  {waitlistSubmitting ? 'Enviando...' : 'Entrar na Lista de Espera'}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    )
  }

  if (submitted && isVoucherMode) {
    return (
      <section id="inscricao" className="relative py-24 sm:py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="card-glass rounded-2xl p-8 sm:p-12 text-center space-y-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan/20 border border-cyan/40 mx-auto">
              <svg className="w-8 h-8 text-cyan" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <span className="font-mono text-sm text-cyan tracking-wider uppercase">Inscrição confirmada</span>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">
                Você está dentro, <span className="text-gradient-cyan">{submittedData?.full_name?.split(' ')[0]}</span>!
              </h2>
            </div>
            <p className="text-text-muted">
              Sua inscrição foi confirmada via <strong className="text-white">{submittedData?.company_name}</strong>.
              {' '}Pagamento já está coberto pela empresa — não há nada a pagar.
            </p>
            <div className="card-glass rounded-xl p-5 text-left space-y-2 border border-cyan/20 bg-cyan/5">
              <p className="text-xs font-mono uppercase tracking-wider text-cyan">Próximos passos</p>
              <ul className="text-sm text-white/80 space-y-1.5 list-disc list-inside">
                <li>Você receberá informações oficiais no e-mail <strong>{submittedData?.email}</strong></li>
                <li>Acesse o <a href="#participante-login" className="text-electric underline">painel do participante</a> com seu e-mail e CPF para ver/editar dados e formar/entrar em uma equipe</li>
                <li>Chegue ao Centro de Inovação de Blumenau (CIB) na noite de abertura — 29/05 às 19h</li>
              </ul>
            </div>
            <p className="text-xs text-text-muted">
              Voucher: <span className="font-mono text-white/70">{submittedData?.voucher_code}</span>
              {' • '}
              Dúvidas: <a href={`mailto:${EVENT_CONFIG.organizer.email}`} className="text-electric underline">{EVENT_CONFIG.organizer.email}</a>
            </p>
          </div>
        </div>
      </section>
    )
  }

  if (submitted) {
    return (
      <section id="inscricao" className="relative py-24 sm:py-32">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <PaymentInfo
            price={submittedData?.priceFormatted || currentPriceFormatted}
            email={submittedData?.email}
            memberCount={submittedData?.memberCount}
            fullName={submittedData?.full_name}
            teamName={submittedData?.team_name}
            registrationId={submittedData?.registration_id}
            ticketPrice={submittedData?.ticket_price}
            priceExpiresAt={submittedData?.price_expires_at}
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
          {isVoucherMode && voucherState?.status === 'valid' && (
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full border border-cyan/30 bg-cyan/10 text-cyan text-sm font-mono">
              <span>🏢</span> Voucher empresarial — {voucherState.companyName}
            </div>
          )}
          {!isVoucherMode && hasEarlyAccess && (
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full border border-cyan/30 bg-cyan/10 text-cyan text-sm font-mono">
              <span>&#9889;</span> Acesso antecipado — Comunidade WhatsApp
            </div>
          )}
          {!isVoucherMode && hasDatiDiscount && (
            <div className="inline-flex items-center gap-2 px-4 py-2 mb-4 rounded-full border border-violet/30 bg-violet/10 text-violet text-sm font-mono">
              <span>&#9733;</span> DATI &mdash; {EVENT_CONFIG.datiDiscountPercent}% de desconto aplicado
            </div>
          )}
          <span className="font-mono text-sm text-cyan tracking-wider uppercase">Inscrição</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 mb-4">
            {isVoucherMode
              ? <>Complete sua <span className="text-gradient-cyan">inscrição</span></>
              : <>Garanta sua <span className="text-gradient-cyan">vaga</span></>
            }
          </h2>

          {isVoucherMode && voucherState?.status === 'valid' ? (
            <div className="inline-flex flex-col items-center gap-2 px-6 py-4 rounded-xl border border-cyan/30 bg-cyan/5 max-w-md">
              <p className="text-sm text-white">
                A empresa <strong className="text-cyan">{voucherState.companyName}</strong> já cobriu seu ingresso.
              </p>
              <p className="text-xs text-text-muted">
                Preencha apenas seus dados pessoais — não há pagamento a fazer.
              </p>
            </div>
          ) : (
          <>
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
                {hasDatiDiscount ? (
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-violet/10 text-violet border border-violet/20">
                    DATI &mdash; {EVENT_CONFIG.datiDiscountPercent}% off
                  </span>
                ) : earlyBirdAvailable && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-cyan/10 text-cyan border border-cyan/20">
                    Early Bird &mdash; {earlyBirdSpotsLeft} vagas
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="text-3xl font-bold font-mono text-white">{currentPriceFormatted}</span>
                <span className="text-text-muted text-sm">/pessoa</span>
                {hasDatiDiscount ? (
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-violet/10 text-violet border border-violet/20">
                    DATI &mdash; {EVENT_CONFIG.datiDiscountPercent}% off
                  </span>
                ) : earlyBirdAvailable && (
                  <span className="px-3 py-1 rounded-full text-xs font-mono bg-cyan/10 text-cyan border border-cyan/20">
                    Early Bird &mdash; {earlyBirdSpotsLeft} vagas
                  </span>
                )}
              </>
            )}
          </div>
          <p className="text-xs text-text-muted mt-3">Inclui alimentação completa, crachá e kit do participante</p>

          {/* Recovery link */}
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowRecovery(r => !r)}
              className="text-sm text-electric hover:text-cyan transition-colors underline underline-offset-2"
            >
              Já se inscreveu? Clique aqui para finalizar o pagamento
            </button>

            {showRecovery && (
              <div className="mt-4 card-glass rounded-2xl p-6 max-w-md mx-auto text-left">
                <p className="text-sm text-text-muted mb-3">
                  Digite o e-mail usado na inscrição para recuperar seus dados de pagamento.
                </p>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={e => setRecoveryEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className={INPUT}
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      const result = await recoverRegistration(recoveryEmail)
                      if (!result.success) setRecoveryError(result.message)
                    }}
                    disabled={recovering || !recoveryEmail.trim()}
                    className="px-4 py-3 bg-electric text-dark font-semibold text-sm rounded-xl hover:bg-cyan transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {recovering ? 'Buscando...' : 'Recuperar'}
                  </button>
                </div>
                {recoveryError && <p className="text-hot text-xs mt-2">{recoveryError}</p>}
              </div>
            )}
          </div>
          </>
          )}
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

          {/* ===== DADOS PESSOAIS ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Dados Pessoais</legend>

            <div>
              <label className={LBL}>Nome Completo *</label>
              <input maxLength={120} {...register('full_name', { required: 'Nome obrigatório' })} className={INPUT} placeholder="Seu nome completo" />
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
                <input type="tel" maxLength={20} {...register('phone', { required: 'Telefone obrigatório', pattern: { value: /^[\d\s()+-]{8,20}$/, message: 'Telefone inválido' } })} className={INPUT} placeholder="(47) 99999-9999" />
                {errors.phone && <p className={ERR}>{errors.phone.message}</p>}
              </div>
              <div>
                <label className={LBL}>Data de Nascimento *</label>
                <input type="date" {...register('birth_date', { required: 'Data obrigatória' })} className={INPUT} />
                {errors.birth_date && <p className={ERR}>{errors.birth_date.message}</p>}
              </div>
            </div>

            <div>
              <label className={LBL}>CPF *</label>
              <input maxLength={14} {...register('cpf', { validate: v => validateCPF(v) || 'CPF inválido' })} className={INPUT} placeholder="000.000.000-00" />
              {errors.cpf && <p className={ERR}>{errors.cpf.message}</p>}
            </div>

            <div>
              <label className={LBL}>LinkedIn (opcional)</label>
              <input type="url" maxLength={200} {...register('linkedin_url', { validate: v => !v || /^https?:\/\/(www\.)?linkedin\.com\//.test(v) || 'URL LinkedIn inválida' })} className={INPUT} placeholder="https://linkedin.com/in/..." />
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
              <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
                {[1,2,3,4,5,6,7,8,9,10].map(n => (
                  <label key={n} className={`text-center py-2.5 rounded-lg border cursor-pointer transition-all font-mono text-sm ${parseInt(watch('ai_experience_level')) === n ? 'border-cyan bg-cyan/10 text-cyan font-bold' : 'border-dark-border bg-dark text-text-muted hover:border-text-muted'}`}>
                    <input type="radio" value={n} {...register('ai_experience_level', { required: 'Selecione seu nível' })} className="sr-only" />
                    {n}
                  </label>
                ))}
              </div>
              {errors.ai_experience_level && <p className={ERR}>{errors.ai_experience_level.message}</p>}
            </div>
          </fieldset>

          {/* ===== NECESSIDADES DO EVENTO ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Para o Evento</legend>

            <div>
              <label className={LBL}>Você tem alguma restrição alimentar? Se sim, qual? *</label>
              <input maxLength={200} {...register('dietary_restrictions', { required: 'Campo obrigatório' })} className={INPUT} placeholder="Ex: Vegetariano, vegano, alergias... ou 'Não'" />
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
                <input maxLength={200} {...register('pcd_type')} className={INPUT} placeholder="Tipo de deficiência" />
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
                <input maxLength={120} {...register('project_name')} className={INPUT} placeholder="Nome do projeto" />
              </div>
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

          {/* ===== MODALIDADE ===== — escondida no fluxo de voucher (sempre individual) */}
          {!isVoucherMode && (
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Modalidade de Inscrição</legend>

            <div className="space-y-3">
              {[
                { value: 'individual_form_team', label: 'Inscrição Individual', desc: 'Formarei ou serei integrado a uma equipe na noite de abertura (29/05)' },
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
                    maxLength={120}
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
                      {totalPeople < 3 && <span className="text-hot ml-1">(mínimo 3)</span>}
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
          )}

          {/* ===== TERMOS E CONDIÇÕES ===== */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Termos e Condições</legend>

            {/* Master checkbox */}
            <label className={`${CHK_LABEL} ${(errors.accept_edital || errors.avail_physical || errors.commit_ia) ? 'border-hot/40' : 'border-cyan/30'}`}>
              <input
                type="checkbox"
                onChange={e => {
                  const v = e.target.checked
                  const fields = [
                    'avail_physical', 'avail_disqualification',
                    'accept_edital', 'accept_image', 'accept_responsibility', 'accept_lgpd', 'accept_code_ip',
                    'commit_ia', 'commit_monetizable', 'commit_sales', 'commit_edital',
                  ]
                  fields.forEach(f => setValue(f, v, { shouldValidate: true }))
                }}
                className={CHK_INPUT}
              />
              <span className="text-white font-semibold">
                Li e aceito todos os termos, condições e critérios do evento
              </span>
            </label>

            {/* Expand/collapse button */}
            <button
              type="button"
              onClick={() => setTermsExpanded(t => !t)}
              className="flex items-center gap-2 text-sm text-electric hover:text-cyan transition-colors"
            >
              <svg className={`w-4 h-4 transition-transform ${termsExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
              {termsExpanded ? 'Ocultar detalhes' : 'Ver todos os termos em detalhes'}
            </button>

            {/* Expanded terms */}
            {termsExpanded && (
              <div className="space-y-4 pt-2">
                <p className="text-xs text-text-muted">
                  <a href={EVENT_CONFIG.editalGoogleDocsUrl} target="_blank" rel="noopener noreferrer" className="text-electric underline">Leia o edital completo</a>
                  {' | '}
                  <a href="#privacidade" className="text-electric underline">Política de Privacidade</a>
                </p>

                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Disponibilidade</p>
                  <div className="space-y-2">
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('avail_physical', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Participação física no CIB durante mais de 80% do evento
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('avail_disqualification', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Desclassificação se nenhum membro comparecer no horário do cronograma
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Declarações e Aceites</p>
                  <div className="space-y-2">
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('accept_edital', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Li e compreendi o Edital (regras, desclassificação, julgamento, Capital Semente)
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('accept_image', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Autorizo uso de imagem e voz para divulgação (item 13.1 do Edital)
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('accept_responsibility', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Organização não se responsabiliza por equipamentos pessoais; uso de crachá obrigatório
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('accept_lgpd', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      <span>
                        Concordo com a{' '}
                        <a href="#privacidade" className="text-electric underline" onClick={e => e.stopPropagation()}>Política de Privacidade</a>
                        {' '}e autorizo tratamento de dados pela MORPH3D INOVA SIMPLES (I.S.)
                      </span>
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('accept_code_ip', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Código e material intelectual são de minha autoria ou possuo autorização
                    </label>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">Critérios do Evento</p>
                  <div className="space-y-2">
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('commit_ia', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Solução terá IA como uso central e obrigatório
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('commit_monetizable', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Produtos não monetizáveis serão desclassificados
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('commit_sales', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Evidências de tração comercial geram pontuação extra
                    </label>
                    <label className={CHK_LABEL}>
                      <input type="checkbox" {...register('commit_edital', { required: 'Obrigatório' })} className={CHK_INPUT} />
                      Li o edital completo e concordo com todas as cláusulas
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* Hidden fields for validation when collapsed */}
            {!termsExpanded && (
              <div className="hidden">
                <input type="checkbox" {...register('avail_physical', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('avail_disqualification', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('accept_edital', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('accept_image', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('accept_responsibility', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('accept_lgpd', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('accept_code_ip', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('commit_ia', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('commit_monetizable', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('commit_sales', { required: 'Obrigatório' })} />
                <input type="checkbox" {...register('commit_edital', { required: 'Obrigatório' })} />
              </div>
            )}

            {(errors.avail_physical || errors.accept_edital || errors.commit_ia) && (
              <p className={ERR}>Você precisa aceitar todos os termos para prosseguir ao checkout.</p>
            )}
          </fieldset>

          {/* Submit */}
          {submitError && (
            <div className="p-4 rounded-xl bg-hot/10 border border-hot/20 text-hot text-sm">
              <p>{submitError}</p>
              {submitErrorAction && (
                <a
                  href={submitErrorAction.href}
                  className="inline-block mt-3 px-4 py-2 rounded-lg bg-hot/20 hover:bg-hot/30 text-hot font-semibold transition-colors"
                >
                  {submitErrorAction.label} →
                </a>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 px-8 bg-gradient-to-r from-electric to-violet text-white font-bold text-lg rounded-xl transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(58,134,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {submitting
              ? 'Enviando...'
              : isVoucherMode
                ? 'Confirmar Inscrição'
                : isTeamWithMembers
                  ? `Ir para o Checkout — ${totalPriceFormatted} (${totalPeople} pessoas)`
                  : `Ir para o Checkout — ${currentPriceFormatted}`
            }
          </button>

          <p className="text-xs text-text-muted text-center">
            {isVoucherMode
              ? 'Sem pagamento — sua inscrição é coberta pela empresa.'
              : 'Pagamento seguro via Mercado Pago. Aceita Pix, cartão de crédito e débito.'}
          </p>
        </form>
      </div>
    </section>
  )
}

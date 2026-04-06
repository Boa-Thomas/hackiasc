import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { supabase } from '../lib/supabase'
import { useTicketPrice } from '../hooks/useTicketPrice'
import PaymentInfo from './PaymentInfo'

const INPUT_CLASS = 'w-full bg-dark border border-dark-border rounded-xl px-4 py-3 text-white text-sm placeholder-text-muted focus:outline-none focus:border-electric focus:ring-1 focus:ring-electric/30 transition-colors'
const LABEL_CLASS = 'block text-sm font-semibold text-white mb-2'
const ERROR_CLASS = 'text-hot text-xs mt-1'

export default function RegistrationForm() {
  const { register, handleSubmit, watch, formState: { errors }, reset } = useForm({
    defaultValues: {
      registration_type: 'individual',
      payment_method: 'pix',
      city: 'Blumenau',
    },
  })

  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submittedData, setSubmittedData] = useState(null)
  const { currentPrice, currentPriceFormatted, earlyBirdAvailable, earlyBirdSpotsLeft, tier, loading } = useTicketPrice()

  const registrationType = watch('registration_type')
  const paymentMethod = watch('payment_method')

  const onSubmit = async (data) => {
    setSubmitting(true)
    setSubmitError('')

    const registration = {
      full_name: data.full_name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      birth_date: data.birth_date,
      city: data.city.trim(),
      occupation_type: data.occupation_type,
      linkedin_url: data.linkedin_url?.trim() || null,
      github_url: data.github_url?.trim() || null,
      registration_type: data.registration_type,
      team_name: data.registration_type === 'team' ? data.team_name?.trim() : null,
      desired_role: data.desired_role,
      dietary_restrictions: data.dietary_restrictions?.trim() || null,
      accessibility_needs: data.accessibility_needs?.trim() || null,
      payment_method: data.payment_method,
      ticket_tier: tier,
      ticket_price: currentPrice,
    }

    if (!supabase) {
      console.log('Supabase not configured. Registration data:', registration)
      setSubmittedData({ ...registration, payment_method: data.payment_method })
      setSubmitted(true)
      setSubmitting(false)
      return
    }

    const { error } = await supabase.from('registrations').insert(registration)

    if (error) {
      if (error.code === '23505') {
        setSubmitError('Este e-mail ja esta cadastrado. Se ja fez sua inscricao, aguarde a confirmacao de pagamento.')
      } else {
        setSubmitError('Erro ao enviar inscricao. Tente novamente.')
        console.error(error)
      }
      setSubmitting(false)
      return
    }

    setSubmittedData({ ...registration, payment_method: data.payment_method })
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
          <span className="font-mono text-sm text-cyan tracking-wider uppercase">Inscricao</span>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mt-4 mb-4">
            Garanta sua <span className="text-gradient-cyan">vaga</span>
          </h2>

          {/* Price badge */}
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-xl border border-dark-border bg-surface">
            {loading ? (
              <span className="text-text-muted text-sm">Carregando...</span>
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
          <p className="text-xs text-text-muted mt-3">
            Inclui alimentacao completa, cracha e kit do participante
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Dados Pessoais */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Dados Pessoais</legend>

            <div>
              <label className={LABEL_CLASS}>Nome Completo *</label>
              <input
                {...register('full_name', { required: 'Nome obrigatorio' })}
                className={INPUT_CLASS}
                placeholder="Seu nome completo"
              />
              {errors.full_name && <p className={ERROR_CLASS}>{errors.full_name.message}</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LABEL_CLASS}>E-mail *</label>
                <input
                  type="email"
                  {...register('email', {
                    required: 'E-mail obrigatorio',
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'E-mail invalido' },
                  })}
                  className={INPUT_CLASS}
                  placeholder="seu@email.com"
                />
                {errors.email && <p className={ERROR_CLASS}>{errors.email.message}</p>}
              </div>
              <div>
                <label className={LABEL_CLASS}>Telefone *</label>
                <input
                  type="tel"
                  {...register('phone', { required: 'Telefone obrigatorio' })}
                  className={INPUT_CLASS}
                  placeholder="(47) 99999-9999"
                />
                {errors.phone && <p className={ERROR_CLASS}>{errors.phone.message}</p>}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LABEL_CLASS}>Data de Nascimento *</label>
                <input
                  type="date"
                  {...register('birth_date', { required: 'Data obrigatoria' })}
                  className={INPUT_CLASS}
                />
                {errors.birth_date && <p className={ERROR_CLASS}>{errors.birth_date.message}</p>}
              </div>
              <div>
                <label className={LABEL_CLASS}>Cidade *</label>
                <input
                  {...register('city', { required: 'Cidade obrigatoria' })}
                  className={INPUT_CLASS}
                  placeholder="Blumenau"
                />
                {errors.city && <p className={ERROR_CLASS}>{errors.city.message}</p>}
              </div>
            </div>
          </fieldset>

          {/* Perfil */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Perfil Profissional</legend>

            <div>
              <label className={LABEL_CLASS}>Perfil de Atuacao *</label>
              <select
                {...register('occupation_type', { required: 'Selecione seu perfil' })}
                className={INPUT_CLASS}
              >
                <option value="">Selecione...</option>
                <option value="dev">Desenvolvedor(a)</option>
                <option value="designer">Designer / UX</option>
                <option value="business">Negocios / Vendas</option>
                <option value="student">Estudante</option>
              </select>
              {errors.occupation_type && <p className={ERROR_CLASS}>{errors.occupation_type.message}</p>}
            </div>

            <div className="grid sm:grid-cols-2 gap-5">
              <div>
                <label className={LABEL_CLASS}>LinkedIn</label>
                <input
                  type="url"
                  {...register('linkedin_url')}
                  className={INPUT_CLASS}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>GitHub</label>
                <input
                  type="url"
                  {...register('github_url')}
                  className={INPUT_CLASS}
                  placeholder="https://github.com/..."
                />
              </div>
            </div>
          </fieldset>

          {/* Equipe */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Equipe</legend>

            <div>
              <label className={LABEL_CLASS}>Tipo de Inscricao *</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'individual', label: 'Individual', desc: 'Formo equipe no evento' },
                  { value: 'team', label: 'Em equipe', desc: 'Ja tenho equipe' },
                ].map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${
                      registrationType === value
                        ? 'border-cyan bg-cyan/5 text-white'
                        : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      value={value}
                      {...register('registration_type')}
                      className="sr-only"
                    />
                    <span className="font-semibold text-sm">{label}</span>
                    <span className="text-xs mt-1 opacity-70">{desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {registrationType === 'team' && (
              <div>
                <label className={LABEL_CLASS}>Nome da Equipe *</label>
                <input
                  {...register('team_name', {
                    validate: (v) => registrationType !== 'team' || (v && v.trim()) || 'Nome da equipe obrigatorio',
                  })}
                  className={INPUT_CLASS}
                  placeholder="Nome da sua equipe"
                />
                {errors.team_name && <p className={ERROR_CLASS}>{errors.team_name.message}</p>}
              </div>
            )}

            <div>
              <label className={LABEL_CLASS}>Papel Desejado na Equipe *</label>
              <select
                {...register('desired_role', { required: 'Selecione um papel' })}
                className={INPUT_CLASS}
              >
                <option value="">Selecione...</option>
                <option value="hacker">Hacker (Desenvolvedor)</option>
                <option value="hustler">Hustler (Negocios / Vendas)</option>
                <option value="hipster">Hipster (Design / UX)</option>
              </select>
              {errors.desired_role && <p className={ERROR_CLASS}>{errors.desired_role.message}</p>}
            </div>
          </fieldset>

          {/* Necessidades */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Para o Evento</legend>

            <div>
              <label className={LABEL_CLASS}>Restricoes Alimentares</label>
              <textarea
                {...register('dietary_restrictions')}
                className={`${INPUT_CLASS} resize-none`}
                rows={2}
                placeholder="Vegetariano, vegano, alergias, etc."
              />
            </div>

            <div>
              <label className={LABEL_CLASS}>Necessidades de Acessibilidade</label>
              <textarea
                {...register('accessibility_needs')}
                className={`${INPUT_CLASS} resize-none`}
                rows={2}
                placeholder="Informe caso precise de alguma adequacao"
              />
            </div>
          </fieldset>

          {/* Pagamento */}
          <fieldset className="card-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <legend className="text-sm font-mono text-electric tracking-wider uppercase mb-2">Pagamento</legend>

            <div>
              <label className={LABEL_CLASS}>Forma de Pagamento *</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { value: 'pix', label: 'Pix', desc: 'Sem taxas' },
                  { value: 'card', label: 'Cartao', desc: 'Link de pagamento' },
                ].map(({ value, label, desc }) => (
                  <label
                    key={value}
                    className={`flex flex-col p-4 rounded-xl border cursor-pointer transition-all ${
                      paymentMethod === value
                        ? 'border-cyan bg-cyan/5 text-white'
                        : 'border-dark-border bg-dark hover:border-text-muted text-text-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      value={value}
                      {...register('payment_method')}
                      className="sr-only"
                    />
                    <span className="font-semibold text-sm">{label}</span>
                    <span className="text-xs mt-1 opacity-70">{desc}</span>
                  </label>
                ))}
              </div>
            </div>
          </fieldset>

          {/* Submit */}
          {submitError && (
            <div className="p-4 rounded-xl bg-hot/10 border border-hot/20 text-hot text-sm">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 px-8 bg-gradient-to-r from-cyan to-electric text-dark font-bold text-lg rounded-xl transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(6,214,160,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            {submitting ? 'Enviando...' : `Finalizar Inscricao — ${currentPriceFormatted}`}
          </button>

          <p className="text-xs text-text-muted text-center">
            Ao se inscrever, voce concorda com o{' '}
            <a href="/V1. Edital de Participação do Hackathon de IA em Blumenau SC.pdf" target="_blank" className="text-electric underline underline-offset-2">
              edital do evento
            </a>{' '}
            e autoriza o uso de imagem durante o evento.
          </p>
        </form>
      </div>
    </section>
  )
}

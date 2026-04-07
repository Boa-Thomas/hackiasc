import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EVENT_CONFIG } from '../lib/config'

const EARLY_BIRD_LIMIT = 10
const REGULAR_PRICE = 20000

export default function PaymentInfo({ price, email, memberCount, teamName, fullName, registrationId, ticketPrice, priceExpiresAt }) {
  const isTeam = memberCount > 1

  // Early bird countdown with re-validation
  const [timeLeft, setTimeLeft] = useState(null)
  const [expired, setExpired] = useState(false)
  const [currentExpiresAt, setCurrentExpiresAt] = useState(priceExpiresAt)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!currentExpiresAt || ticketPrice === REGULAR_PRICE) return

    const expiresAt = new Date(currentExpiresAt).getTime()

    const tick = async () => {
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        // Timer expired — re-check early bird availability
        if (checking) return
        setChecking(true)
        setTimeLeft(null)

        try {
          if (supabase) {
            const { data: countData } = await supabase.rpc('get_confirmed_count')
            const confirmedCount = countData ?? 0

            if (confirmedCount >= EARLY_BIRD_LIMIT) {
              // No more early bird spots — expire
              setExpired(true)
            } else {
              // Still available — renew 30-min window
              const newExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString()
              setCurrentExpiresAt(newExpiry)
            }
          } else {
            setExpired(true)
          }
        } catch {
          setExpired(true)
        } finally {
          setChecking(false)
        }
      } else {
        const mins = Math.floor(remaining / 60000)
        const secs = Math.floor((remaining % 60000) / 1000)
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`)
      }
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [currentExpiresAt, ticketPrice, checking])

  const effectivePrice = expired ? REGULAR_PRICE : ticketPrice
  const effectivePriceFormatted = `R$ ${(effectivePrice / 100).toFixed(0)},00`
  const effectiveTotal = effectivePrice * (isTeam ? memberCount : 1)
  const effectiveTotalFormatted = `R$ ${(effectiveTotal / 100).toFixed(0)},00`

  const [redirecting, setRedirecting] = useState(false)
  const [cardError, setCardError] = useState('')

  const handlePayment = async () => {
    setRedirecting(true)
    setCardError('')

    try {
      if (!supabase) {
        window.open(EVENT_CONFIG.payment.cardPaymentUrl, '_blank')
        setRedirecting(false)
        return
      }

      const totalAmountCents = isTeam ? effectivePrice * memberCount : effectivePrice
      const description = isTeam
        ? `Inscrição equipe "${teamName}" — ${memberCount} participantes — AI Venture Hackathon 2026`
        : `Inscrição ${fullName} — AI Venture Hackathon 2026`

      const { data, error } = await supabase.functions.invoke('create-preference', {
        body: {
          registration_id: registrationId,
          email,
          full_name: fullName,
          amount: totalAmountCents,
          description,
        },
      })

      if (error || !data?.init_point) {
        console.error('Preference error:', error || data)
        setCardError('Erro ao gerar link de pagamento. Tente novamente.')
        setRedirecting(false)
        return
      }

      window.location.href = data.init_point
    } catch (err) {
      console.error('Payment error:', err)
      setCardError('Erro ao conectar com o Mercado Pago. Tente novamente.')
      setRedirecting(false)
    }
  }

  return (
    <div className="text-center">
      {/* Success header */}
      <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center">
        <svg className="w-10 h-10 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">
        Inscrição Enviada!
      </h2>

      {/* Status badge */}
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/30 bg-gold/5 text-gold text-sm font-mono mb-6">
        <span className="w-2 h-2 rounded-full bg-gold animate-pulse" />
        Pagamento Pendente
      </div>

      {/* Early bird countdown */}
      {priceExpiresAt && ticketPrice !== REGULAR_PRICE && !expired && timeLeft && (
        <div className="bg-cyan/5 border border-cyan/20 rounded-xl p-4 mb-6 inline-block">
          <p className="text-xs text-text-muted mb-1">Preço Early Bird garantido por</p>
          <p className="text-2xl font-bold font-mono text-cyan">{timeLeft}</p>
          <p className="text-xs text-text-muted mt-1">Após esse tempo, o preço será reavaliado conforme disponibilidade</p>
        </div>
      )}

      {expired && ticketPrice !== REGULAR_PRICE && (
        <div className="bg-gold/5 border border-gold/20 rounded-xl p-4 mb-6 inline-block">
          <p className="text-sm text-gold font-semibold">Período Early Bird expirado</p>
          <p className="text-xs text-text-muted mt-1">O valor foi atualizado para <strong className="text-white">R$ 200,00</strong> por pessoa.</p>
        </div>
      )}

      <p className="text-text-muted mb-8">
        {isTeam
          ? `Inscrição da equipe enviada com ${memberCount} participantes. Finalize o pagamento para garantir as vagas.`
          : 'Finalize o pagamento abaixo para garantir sua vaga.'}
      </p>

      {/* Registration summary */}
      <div className="card-glass rounded-2xl p-6 text-left mb-6">
        <h3 className="text-sm font-mono text-electric tracking-wider uppercase mb-4">Resumo da Inscrição</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-text-muted">Nome</span>
            <p className="text-white font-semibold">{fullName}</p>
          </div>
          <div>
            <span className="text-text-muted">E-mail</span>
            <p className="text-white font-semibold break-all">{email}</p>
          </div>
          {isTeam && (
            <>
              <div>
                <span className="text-text-muted">Equipe</span>
                <p className="text-white font-semibold">{teamName || '—'}</p>
              </div>
              <div>
                <span className="text-text-muted">Participantes</span>
                <p className="text-white font-semibold">{memberCount} pessoas</p>
              </div>
            </>
          )}
          <div>
            <span className="text-text-muted">Valor Total</span>
            <p className="text-white font-semibold font-mono text-lg">
              {effectiveTotalFormatted}
              {isTeam && <span className="text-xs text-text-muted font-normal ml-1">({effectivePriceFormatted} × {memberCount})</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Payment button */}
      <div className="card-glass rounded-2xl p-8 text-left mb-6">
        <h3 className="text-sm font-mono text-electric tracking-wider uppercase mb-6">Pagamento</h3>

        <div className="bg-electric/5 border border-electric/20 rounded-xl p-4 mb-4 text-center">
          <p className="text-xs text-text-muted mb-1">Valor total</p>
          <p className="text-3xl font-bold font-mono text-electric">{effectiveTotalFormatted}</p>
          {isTeam && <p className="text-xs text-text-muted mt-1">{effectivePriceFormatted} × {memberCount} participantes</p>}
        </div>

        <button
          onClick={handlePayment}
          disabled={redirecting}
          className="block w-full py-4 px-8 bg-gradient-to-r from-electric to-violet text-white font-bold text-center rounded-xl transition-all hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(58,134,255,0.3)] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {redirecting ? (
            <span className="inline-flex items-center gap-2">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Redirecionando para o Mercado Pago...
            </span>
          ) : (
            'Pagar com Mercado Pago'
          )}
        </button>

        <p className="text-xs text-text-muted mt-3 text-center">
          Você será redirecionado para o Mercado Pago. Aceita Pix, cartão de crédito e débito.
        </p>

        {cardError && (
          <div className="bg-hot/5 border border-hot/20 rounded-xl p-4 mt-4">
            <p className="text-sm text-hot">{cardError}</p>
          </div>
        )}
      </div>

      {/* Confirmation notice */}
      <div className="bg-violet/5 border border-violet/20 rounded-2xl p-6 text-left mb-6">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-violet flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-white mb-1">Confirmação automática</p>
            <p className="text-xs text-text-muted leading-relaxed">
              O pagamento é confirmado automaticamente pelo Mercado Pago. Você receberá um e-mail de confirmação e será adicionado(a) ao grupo oficial de WhatsApp do evento.
            </p>
          </div>
        </div>
      </div>

      {/* Next steps */}
      <div className="card-glass rounded-2xl p-6 text-left mb-6">
        <h3 className="text-sm font-bold text-white mb-4">Próximos Passos</h3>
        <ol className="space-y-3">
          {[
            'Clique em "Pagar com Mercado Pago" acima.',
            'Complete o pagamento (Pix, crédito ou débito).',
            'A confirmação é automática — você receberá um e-mail.',
            'Será adicionado(a) ao grupo oficial de WhatsApp.',
            'Dia 22/05, apareça no CIB às 18:30!',
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-text-muted">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-electric/10 text-electric text-xs font-mono flex items-center justify-center">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      {/* WhatsApp group */}
      <a
        href={EVENT_CONFIG.social.whatsappGroup}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-6 py-3 bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] rounded-xl hover:bg-[#25D366]/20 transition-colors text-sm font-semibold mb-6"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        Entrar no Grupo de Participantes
      </a>

      <p className="text-xs text-text-muted">
        Dúvidas? Entre em contato:{' '}
        <a href={`mailto:${EVENT_CONFIG.organizer.email}`} className="text-electric underline">
          {EVENT_CONFIG.organizer.email}
        </a>
      </p>
      <p className="text-xs text-text-muted mt-4">
        Pagamentos processados por {EVENT_CONFIG.organizer.company} — CNPJ {EVENT_CONFIG.organizer.cnpj}
      </p>
    </div>
  )
}

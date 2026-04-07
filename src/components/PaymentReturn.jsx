import { useEffect } from 'react'
import { EVENT_CONFIG } from '../lib/config'

const STATUS_CONFIG = {
  success: {
    icon: (
      <svg className="w-10 h-10 text-cyan" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
    iconBg: 'bg-cyan/10 border-cyan/20',
    title: 'Pagamento Confirmado!',
    badge: 'Pagamento Aprovado',
    badgeColor: 'border-cyan/30 bg-cyan/5 text-cyan',
    message: 'Seu pagamento foi processado com sucesso pelo Mercado Pago. Sua inscrição está confirmada!',
    steps: [
      'Pagamento confirmado automaticamente.',
      'Você receberá um e-mail de confirmação em breve.',
      'Será adicionado(a) ao grupo oficial de WhatsApp.',
      'Dia 29/05, apareça no CIB às 18:30!',
    ],
  },
  failure: {
    icon: (
      <svg className="w-10 h-10 text-hot" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    iconBg: 'bg-hot/10 border-hot/20',
    title: 'Pagamento não aprovado',
    badge: 'Pagamento Recusado',
    badgeColor: 'border-hot/30 bg-hot/5 text-hot',
    message: 'O pagamento não foi processado. Sua inscrição continua ativa — volte ao site e tente novamente.',
    steps: [
      'Verifique os dados do cartão e tente novamente.',
      'Tente novamente pelo site usando "Já se inscreveu?".',
      'Após a confirmação, você será adicionado(a) ao grupo de WhatsApp.',
      'Dúvidas? Entre em contato conosco.',
    ],
  },
  pending: {
    icon: (
      <svg className="w-10 h-10 text-gold" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
      </svg>
    ),
    iconBg: 'bg-gold/10 border-gold/20',
    title: 'Pagamento em processamento',
    badge: 'Aguardando Confirmação',
    badgeColor: 'border-gold/30 bg-gold/5 text-gold',
    message: 'Seu pagamento está sendo processado pelo Mercado Pago. Assim que for confirmado, você receberá um e-mail e será adicionado(a) ao grupo de WhatsApp.',
    steps: [
      'Aguarde a confirmação do Mercado Pago (pode levar alguns minutos).',
      'Você receberá um e-mail quando o pagamento for aprovado.',
      'Será adicionado(a) ao grupo oficial de WhatsApp.',
      'Dia 29/05, apareça no CIB às 18:30!',
    ],
  },
}

export default function PaymentReturn({ status, onBack }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <div className="min-h-screen bg-dark text-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16">

        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-white transition-colors mb-12"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
          Voltar ao site
        </button>

        <div className="text-center">
          {/* Icon */}
          <div className={`w-20 h-20 mx-auto mb-6 rounded-full border flex items-center justify-center ${config.iconBg}`}>
            {config.icon}
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            {config.title}
          </h1>

          {/* Status badge */}
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-mono mb-6 ${config.badgeColor}`}>
            <span className="w-2 h-2 rounded-full bg-current" />
            {config.badge}
          </div>

          <p className="text-text-muted mb-8 max-w-md mx-auto">
            {config.message}
          </p>

          {/* Steps */}
          <div className="card-glass rounded-2xl p-6 text-left mb-8">
            <h3 className="text-sm font-bold text-white mb-4">Próximos Passos</h3>
            <ol className="space-y-3">
              {config.steps.map((step, i) => (
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
        </div>
      </div>
    </div>
  )
}

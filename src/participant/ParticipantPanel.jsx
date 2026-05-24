import { useState, useEffect } from 'react'
import TeamSection from './TeamSection'
import EditProfile from './EditProfile'
import DeliverablesSection from './DeliverablesSection'
import { EVENT_CONFIG } from '../lib/config'
import { QRCodeSVG } from 'qrcode.react'

const ALL_TABS = [
  { id: 'team', label: 'Equipe', icon: 'team' },
  { id: 'event', label: 'Evento', icon: 'event' },
  { id: 'deliverables', label: 'Entregáveis', icon: 'deliverables' },
  { id: 'profile', label: 'Meus Dados', icon: 'profile' },
]

const UNPAID_TABS = ALL_TABS.filter(t => t.id === 'profile')

function TabIcon({ name }) {
  if (name === 'team') return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m6-2a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-12 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" />
    </svg>
  )
  if (name === 'profile') return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A4 4 0 0 1 8.875 15h6.25a4 4 0 0 1 3.754 2.804M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
    </svg>
  )
  if (name === 'deliverables') return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
    </svg>
  )
  // default: event icon (calendar/location pin)
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" />
    </svg>
  )
}

export default function ParticipantPanel({ auth }) {
  const profile = auth.profile
  const isPaid = profile?.payment_status === 'confirmed'
  const tabs = isPaid ? ALL_TABS : UNPAID_TABS
  const [tab, setTab] = useState(isPaid ? 'team' : 'profile')

  // Se o pagamento muda de confirmado para outra coisa (improvável mas possível
  // após refreshMe), garantimos que o usuário não fica em uma aba bloqueada.
  useEffect(() => {
    if (!tabs.some(t => t.id === tab)) setTab(tabs[0].id) // eslint-disable-line react-hooks/set-state-in-effect
  }, [tabs, tab])

  return (
    <div className="min-h-screen bg-dark text-white bg-grid">
      <div className="orb w-[500px] h-[500px] bg-electric/5 -top-40 -right-40 pointer-events-none" />

      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-dark/80 backdrop-blur border-b border-dark-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = '' }} className="font-mono text-lg font-bold tracking-tight">
              <span className="text-cyan">{'>'}</span>
              <span className="text-white">hack</span>
              <span className="text-gradient-cyan">IA</span>
              <span className="text-text-muted">.sc</span>
            </a>
            <span className="hidden sm:inline-block text-text-muted text-xs font-mono uppercase tracking-wider">
              / Painel do Participante
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm text-white truncate max-w-[200px]">{profile?.full_name}</p>
              <p className="text-xs text-text-muted truncate max-w-[200px]">{profile?.email}</p>
            </div>
            <button
              onClick={auth.logout}
              className="px-3 py-1.5 text-sm rounded-lg border border-dark-border text-text-muted hover:text-white hover:border-text-muted transition-colors"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Status banner */}
        <div className="card-glass rounded-2xl p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-mono text-cyan uppercase tracking-wider">Bem-vindo</p>
            <h1 className="text-xl sm:text-2xl font-bold mt-1">{profile?.full_name}</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <PaymentBadge status={profile?.payment_status} />
            {isPaid && profile?.team_name && (
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-electric/10 text-electric border border-electric/20">
                Equipe: {profile.team_name}
              </span>
            )}
            {isPaid && profile?.is_team_leader && (
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-gold/10 text-gold border border-gold/20">
                Líder
              </span>
            )}
          </div>
        </div>

        {!isPaid && <PaymentRequiredBanner status={profile?.payment_status} email={profile?.email} />}

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
          {tabs.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all whitespace-nowrap ${
                tab === id
                  ? 'border-cyan/40 bg-cyan/10 text-cyan'
                  : 'border-dark-border bg-dark text-text-muted hover:text-white hover:border-text-muted'
              }`}
            >
              <TabIcon name={icon} />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'team' && isPaid && <TeamSection auth={auth} />}
        {tab === 'event' && isPaid && <EventInfoSection profile={profile} />}
        {tab === 'deliverables' && isPaid && <DeliverablesSection auth={auth} goToTeam={() => setTab('team')} />}
        {tab === 'profile' && <EditProfile auth={auth} />}
      </main>
    </div>
  )
}

function EventInfoSection({ profile }) {
  return (
    <div className="space-y-4">
      {/* Credencial de check-in (QR) */}
      {profile?.id && (
        <div className="card-glass rounded-2xl p-6 border border-cyan/30">
          <p className="text-xs font-mono text-cyan uppercase tracking-wider mb-4">Sua credencial — apresente no check-in</p>
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="bg-white p-3 rounded-xl flex-shrink-0">
              <QRCodeSVG value={profile.id} size={160} level="M" />
            </div>
            <div className="text-center sm:text-left">
              <p className="text-lg font-bold text-white">{profile.full_name}</p>
              {profile.team_name && <p className="text-sm text-text-muted mt-1">Equipe: {profile.team_name}</p>}
              <p className="text-xs text-text-muted mt-3 leading-relaxed">
                Mostre este QR no credenciamento, na entrada do evento. Ele identifica sua inscrição e agiliza o check-in.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Local e datas */}
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-cyan uppercase tracking-wider mb-4">Informações do Evento</p>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-dark-border bg-dark/60">
            <p className="text-xs font-mono text-electric uppercase tracking-wider mb-2">Local</p>
            <p className="text-sm font-semibold text-white">{EVENT_CONFIG.location}</p>
            <p className="text-xs text-text-muted mt-1">{EVENT_CONFIG.city}</p>
          </div>

          <div className="p-4 rounded-xl border border-dark-border bg-dark/60">
            <p className="text-xs font-mono text-electric uppercase tracking-wider mb-2">Datas</p>
            <p className="text-sm font-semibold text-white">{EVENT_CONFIG.dates}</p>
          </div>
        </div>
      </div>

      {/* Cronograma resumido */}
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-violet uppercase tracking-wider mb-4">Cronograma Resumido</p>
        <div className="space-y-3">
          {[
            { day: 'Dia 1 — 29/Mai', desc: 'Abertura, formação de equipes e kick-off do desafio' },
            { day: 'Dia 2 — 30/Mai', desc: 'Desenvolvimento, mentorias e checkpoint intermediário' },
            { day: 'Dia 3 — 31/Mai', desc: 'Pitches finais, avaliação e premiação' },
          ].map(({ day, desc }) => (
            <div key={day} className="flex gap-3 items-start">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-violet mt-1.5" />
              <div>
                <p className="text-sm font-semibold text-white">{day}</p>
                <p className="text-xs text-text-muted mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* O que levar */}
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-gold uppercase tracking-wider mb-4">O que levar</p>
        <ul className="space-y-2">
          {[
            'Notebook + carregador',
            'Documento com foto (RG ou CNH)',
            'Fones de ouvido (opcional, mas recomendado)',
          ].map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-text-muted">
              <svg className="w-4 h-4 flex-shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Contato e comunidade */}
      <div className="card-glass rounded-2xl p-6">
        <p className="text-xs font-mono text-cyan uppercase tracking-wider mb-4">Contato e Comunidade</p>
        <div className="space-y-3">
          <a
            href={EVENT_CONFIG.social.whatsappGroup}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-xl border border-cyan/20 bg-cyan/5 hover:bg-cyan/10 transition-colors group"
          >
            <svg className="w-5 h-5 flex-shrink-0 text-cyan" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.522 5.849L0 24l6.335-1.502A11.93 11.93 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.782 9.782 0 0 1-5.002-1.37l-.36-.213-3.724.882.936-3.618-.234-.372A9.783 9.783 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-cyan">Grupo WhatsApp dos participantes</p>
              <p className="text-xs text-text-muted">Entre no grupo oficial do evento</p>
            </div>
            <svg className="w-4 h-4 text-text-muted ml-auto group-hover:text-cyan transition-colors" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>

          <a
            href={`mailto:${EVENT_CONFIG.organizer.email}`}
            className="flex items-center gap-3 p-3 rounded-xl border border-dark-border bg-dark/60 hover:border-electric/30 hover:bg-electric/5 transition-colors group"
          >
            <svg className="w-5 h-5 flex-shrink-0 text-electric" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 0 0 2.22 0L21 8M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-electric">E-mail da organização</p>
              <p className="text-xs text-text-muted">{EVENT_CONFIG.organizer.email}</p>
            </div>
          </a>
        </div>
      </div>
    </div>
  )
}

function PaymentRequiredBanner({ status, email }) {
  const isCancelled = status === 'cancelled'
  return (
    <div className={`rounded-2xl p-5 mb-6 border ${
      isCancelled
        ? 'bg-hot/5 border-hot/30'
        : 'bg-gold/5 border-gold/30'
    }`}>
      <div className="flex items-start gap-3">
        <svg className={`w-5 h-5 flex-shrink-0 mt-0.5 ${isCancelled ? 'text-hot' : 'text-gold'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M5.07 19h13.86a2 2 0 0 0 1.74-3L13.74 4a2 2 0 0 0-3.48 0L3.34 16a2 2 0 0 0 1.73 3z" />
        </svg>
        <div className="flex-1">
          <h3 className={`font-semibold ${isCancelled ? 'text-hot' : 'text-gold'}`}>
            {isCancelled ? 'Inscrição cancelada' : 'Pagamento pendente'}
          </h3>
          <p className="text-sm text-text-muted mt-1 leading-relaxed">
            {isCancelled
              ? 'Sua inscrição foi cancelada. Você ainda pode atualizar seus dados, mas o acesso à equipe e aos recursos do evento está bloqueado. Entre em contato com a organização caso seja um engano.'
              : 'Para acessar a área de equipe, recursos do evento e demais funcionalidades, é necessário ter o pagamento confirmado. Por enquanto você pode atualizar apenas seus dados pessoais abaixo.'}
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {!isCancelled && (
              <a
                href="#inscricao"
                onClick={(e) => { e.preventDefault(); window.location.hash = 'inscricao' }}
                className="px-4 py-2 text-sm rounded-lg border border-gold/40 bg-gold/10 text-gold hover:bg-gold/20 transition-colors"
              >
                Finalizar pagamento
              </a>
            )}
            <a
              href={`mailto:contato@hackiasc.com${email ? `?subject=${encodeURIComponent(`[HackIA SC] Dúvida sobre inscrição de ${email}`)}` : ''}`}
              className="px-4 py-2 text-sm rounded-lg border border-dark-border text-text-muted hover:text-white transition-colors"
            >
              Falar com a organização
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

function PaymentBadge({ status }) {
  if (status === 'confirmed') {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-mono bg-cyan/10 text-cyan border border-cyan/20">
        Pagamento confirmado
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-mono bg-gold/10 text-gold border border-gold/20">
        Pagamento pendente
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="px-3 py-1 rounded-full text-xs font-mono bg-hot/10 text-hot border border-hot/20">
        Cancelado
      </span>
    )
  }
  return null
}

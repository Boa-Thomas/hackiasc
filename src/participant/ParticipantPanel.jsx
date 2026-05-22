import { useState, useEffect } from 'react'
import TeamSection from './TeamSection'
import EditProfile from './EditProfile'
import DeliverablesSection from './DeliverablesSection'

const ALL_TABS = [
  { id: 'team', label: 'Equipe', icon: 'team' },
  { id: 'profile', label: 'Meus Dados', icon: 'profile' },
  { id: 'event', label: 'Entregáveis', icon: 'event' },
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
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M3 11h18M5 21h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z" />
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
        {tab === 'profile' && <EditProfile auth={auth} />}
        {tab === 'event' && isPaid && <DeliverablesSection auth={auth} goToTeam={() => setTab('team')} />}
      </main>
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
                onClick={() => { window.location.hash = '' }}
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

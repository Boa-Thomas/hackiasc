import { useState } from 'react'
import AdminDashboard from './AdminDashboard'
import AdminRegistrations from './AdminRegistrations'
import AdminTeams from './AdminTeams'
import AdminCheckin from './AdminCheckin'
import AdminAuditLog from './AdminAuditLog'
import AdminFinanceiro from './AdminFinanceiro'
import AdminBulkOrders from './AdminBulkOrders'
import AdminMentors from './AdminMentors'
import AdminDeliverables from './AdminDeliverables'
import AdminJurors from './AdminJurors'
import AdminPrePitchRooms from './AdminPrePitchRooms'
import AdminWall from './AdminWall'
import AdminSugarCubes from './AdminSugarCubes'
import AdminRanking from './AdminRanking'
import AdminResources from './AdminResources'
import AdminFacilitator from './AdminFacilitator'
import AdminEvaluation from './AdminEvaluation'
import AdminNotifications from './AdminNotifications'
import AdminAccess from './AdminAccess'
import NotificationBell from '../components/NotificationBell'

const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'facilitator', label: 'Facilitador', icon: '🎤', adminOnly: true },
  { id: 'notifications', label: 'Notificações', icon: '🔔', adminOnly: true },
  { id: 'registrations', label: 'Inscrições', icon: '📋' },
  { id: 'teams', label: 'Times', icon: '👥' },
  { id: 'deliverables', label: 'Entregas', icon: '📦' },
  { id: 'ranking', label: 'Ranking', icon: '🏆' },
  { id: 'evaluation', label: 'Avaliação', icon: '⭐' },
  { id: 'mentors', label: 'Mentores', icon: '🎓', adminOnly: true },
  { id: 'prepitch-rooms', label: 'Pré-Pitch', icon: '🎤', adminOnly: true },
  { id: 'jurors', label: 'Jurados', icon: '⚖️', adminOnly: true },
  { id: 'wall', label: 'Muro de Dores', icon: '🧱', adminOnly: true },
  { id: 'sugarcubes', label: 'Elogios', icon: '🧁', adminOnly: true },
  { id: 'resources', label: 'Recursos', icon: '📚', adminOnly: true },
  { id: 'financeiro', label: 'Financeiro', icon: '💰' },
  { id: 'bulk', label: 'Empresarial', icon: '🏢', adminOnly: true },
  { id: 'checkin', label: 'Check-in', icon: '✅', adminOnly: true },
  { id: 'logs', label: 'Logs', icon: '📜', adminOnly: true },
  { id: 'access', label: 'Acessos', icon: '🔑', adminOnly: true },
]

export default function AdminPanel({ onLogout, role = 'viewer' }) {
  const readOnly = role === 'viewer'
  const checkinOnly = role === 'checkin'
  const staffOnly = role === 'staff'
  const TABS = staffOnly
    ? ALL_TABS.filter(t => t.id === 'wall' || t.id === 'checkin')
    : checkinOnly
      ? ALL_TABS.filter(t => t.id === 'checkin')
      : readOnly
        ? ALL_TABS.filter(t => !t.adminOnly)
        : ALL_TABS
  const [activeTab, setActiveTab] = useState(staffOnly ? 'wall' : checkinOnly ? 'checkin' : 'dashboard')
  // Defense-in-depth: gate content rendering by the same role-filtered tab set
  // used for nav, so a forced activeTab cannot expose a tab the role can't see.
  // (RLS remains the real boundary.)
  const allowedTabs = new Set(TABS.map(t => t.id))
  const show = (id) => allowedTabs.has(id) && activeTab === id
  const [selectedRegistrationId, setSelectedRegistrationId] = useState(null)
  const [confirmedOnly, setConfirmedOnly] = useState(() => {
    try { return localStorage.getItem('admin.confirmedOnly') !== 'false' } catch { return true }
  })

  function toggleConfirmedOnly() {
    setConfirmedOnly(prev => {
      const next = !prev
      try { localStorage.setItem('admin.confirmedOnly', String(next)) } catch { /* ignore */ }
      return next
    })
  }

  function handleViewRegistration(id) {
    setSelectedRegistrationId(id)
    setActiveTab('registrations')
  }

  return (
    <div className="min-h-screen bg-dark">
      {/* Top bar */}
      <header className="bg-white/5 border-b border-white/10 px-4 sm:px-6 py-3 sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-base sm:text-lg font-bold text-gradient-cyan font-display flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <span>HackIA Admin</span>
            {readOnly && <span className="text-xs font-mono text-electric/60 border border-electric/20 px-2 py-0.5 rounded-full">visualização</span>}
            {checkinOnly && <span className="text-xs font-mono text-cyan/60 border border-cyan/20 px-2 py-0.5 rounded-full">check-in</span>}
            {staffOnly && <span className="text-xs font-mono text-violet/60 border border-violet/20 px-2 py-0.5 rounded-full">equipe</span>}
          </h1>

          <div className="flex items-center gap-3 flex-shrink-0">
            <NotificationBell auth={{ kind: 'admin' }} />
            {!checkinOnly && !staffOnly && (
              <button
                onClick={toggleConfirmedOnly}
                title="Mostrar apenas inscrições com pagamento confirmado (Inscrições e Times)"
                className={`flex items-center gap-2 text-xs font-mono px-2.5 py-1 rounded-full border transition-colors ${
                  confirmedOnly
                    ? 'bg-cyan/15 text-cyan border-cyan/30'
                    : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70'
                }`}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${confirmedOnly ? 'bg-cyan' : 'bg-white/30'}`} />
                Apenas confirmadas
              </button>
            )}
            <button
              onClick={onLogout}
              className="text-white/50 hover:text-hot text-sm transition-colors"
            >
              Sair
            </button>
          </div>
        </div>

        <nav className="flex gap-1 mt-3 overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pb-0.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setSelectedRegistrationId(null)
              }}
              className={`flex-shrink-0 whitespace-nowrap px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-cyan/20 text-cyan border border-cyan/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="mr-1.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* Content */}
      <main className="p-4 sm:p-6 max-w-[1400px] mx-auto">
        {show('dashboard') && (
          <AdminDashboard onViewRegistration={handleViewRegistration} readOnly={readOnly} />
        )}
        {show('registrations') && (
          <AdminRegistrations
            selectedId={selectedRegistrationId}
            onClearSelection={() => setSelectedRegistrationId(null)}
            onSelect={(id) => setSelectedRegistrationId(id)}
            readOnly={readOnly}
            confirmedOnly={confirmedOnly}
          />
        )}
        {show('teams') && <AdminTeams readOnly={readOnly} confirmedOnly={confirmedOnly} />}
        {show('deliverables') && <AdminDeliverables readOnly={readOnly} />}
        {show('ranking') && <AdminRanking />}
        {show('evaluation') && <AdminEvaluation readOnly={readOnly} />}
        {show('financeiro') && <AdminFinanceiro readOnly={readOnly} />}
        {show('bulk') && <AdminBulkOrders readOnly={readOnly} />}
        {!readOnly && show('mentors') && <AdminMentors />}
        {!readOnly && show('prepitch-rooms') && <AdminPrePitchRooms />}
        {!readOnly && show('jurors') && <AdminJurors />}
        {!readOnly && show('wall') && <AdminWall />}
        {!readOnly && show('sugarcubes') && <AdminSugarCubes />}
        {!readOnly && show('resources') && <AdminResources />}
        {!readOnly && show('facilitator') && <AdminFacilitator />}
        {!readOnly && show('notifications') && <AdminNotifications />}
        {!readOnly && show('checkin') && <AdminCheckin />}
        {!readOnly && show('logs') && <AdminAuditLog />}
        {role === 'admin' && show('access') && <AdminAccess />}
      </main>
    </div>
  )
}

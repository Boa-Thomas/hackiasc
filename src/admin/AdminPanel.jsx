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
import AdminWall from './AdminWall'
import AdminRanking from './AdminRanking'

const ALL_TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'registrations', label: 'Inscrições', icon: '📋' },
  { id: 'teams', label: 'Times', icon: '👥' },
  { id: 'deliverables', label: 'Entregas', icon: '📦' },
  { id: 'ranking', label: 'Ranking', icon: '🏆' },
  { id: 'mentors', label: 'Mentores', icon: '🎓', adminOnly: true },
  { id: 'jurors', label: 'Jurados', icon: '⚖️', adminOnly: true },
  { id: 'wall', label: 'Muro de Dores', icon: '🧱', adminOnly: true },
  { id: 'financeiro', label: 'Financeiro', icon: '💰' },
  { id: 'bulk', label: 'Empresarial', icon: '🏢', adminOnly: true },
  { id: 'checkin', label: 'Check-in', icon: '✅', adminOnly: true },
  { id: 'logs', label: 'Logs', icon: '📜', adminOnly: true },
]

export default function AdminPanel({ onLogout, role = 'viewer' }) {
  const readOnly = role === 'viewer'
  const TABS = readOnly ? ALL_TABS.filter(t => !t.adminOnly) : ALL_TABS
  const [activeTab, setActiveTab] = useState('dashboard')
  const [selectedRegistrationId, setSelectedRegistrationId] = useState(null)

  function handleViewRegistration(id) {
    setSelectedRegistrationId(id)
    setActiveTab('registrations')
  }

  return (
    <div className="min-h-screen bg-dark">
      {/* Top bar */}
      <header className="bg-white/5 border-b border-white/10 px-6 py-3 flex items-center justify-between sticky top-0 z-50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-gradient-cyan font-display">
            HackIA Admin
            {readOnly && <span className="ml-2 text-xs font-mono text-electric/60 border border-electric/20 px-2 py-0.5 rounded-full">visualização</span>}
          </h1>
          <nav className="flex gap-1 ml-6">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  setSelectedRegistrationId(null)
                }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
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
        </div>

        <button
          onClick={onLogout}
          className="text-white/50 hover:text-hot text-sm transition-colors"
        >
          Sair
        </button>
      </header>

      {/* Content */}
      <main className="p-6 max-w-[1400px] mx-auto">
        {activeTab === 'dashboard' && (
          <AdminDashboard onViewRegistration={handleViewRegistration} readOnly={readOnly} />
        )}
        {activeTab === 'registrations' && (
          <AdminRegistrations
            selectedId={selectedRegistrationId}
            onClearSelection={() => setSelectedRegistrationId(null)}
            onSelect={(id) => setSelectedRegistrationId(id)}
            readOnly={readOnly}
          />
        )}
        {activeTab === 'teams' && <AdminTeams readOnly={readOnly} />}
        {activeTab === 'deliverables' && <AdminDeliverables readOnly={readOnly} />}
        {activeTab === 'ranking' && <AdminRanking />}
        {activeTab === 'financeiro' && <AdminFinanceiro readOnly={readOnly} />}
        {activeTab === 'bulk' && <AdminBulkOrders readOnly={readOnly} />}
        {!readOnly && activeTab === 'mentors' && <AdminMentors />}
        {!readOnly && activeTab === 'jurors' && <AdminJurors />}
        {!readOnly && activeTab === 'wall' && <AdminWall />}
        {!readOnly && activeTab === 'checkin' && <AdminCheckin />}
        {!readOnly && activeTab === 'logs' && <AdminAuditLog />}
      </main>
    </div>
  )
}

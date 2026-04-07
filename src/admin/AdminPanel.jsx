import { useState } from 'react'
import AdminDashboard from './AdminDashboard'
import AdminRegistrations from './AdminRegistrations'
import AdminTeams from './AdminTeams'
import AdminCheckin from './AdminCheckin'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'registrations', label: 'Inscrições', icon: '📋' },
  { id: 'teams', label: 'Times', icon: '👥' },
  { id: 'checkin', label: 'Check-in', icon: '✅' },
]

export default function AdminPanel({ onLogout }) {
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
          <AdminDashboard onViewRegistration={handleViewRegistration} />
        )}
        {activeTab === 'registrations' && (
          <AdminRegistrations
            selectedId={selectedRegistrationId}
            onClearSelection={() => setSelectedRegistrationId(null)}
            onSelect={(id) => setSelectedRegistrationId(id)}
          />
        )}
        {activeTab === 'teams' && <AdminTeams />}
        {activeTab === 'checkin' && <AdminCheckin />}
      </main>
    </div>
  )
}

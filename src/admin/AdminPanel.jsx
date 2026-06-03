import { useState, useEffect } from 'react'
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
import { supabase } from '../lib/supabase'
import { ALL_TABS, tabsForRole, tabsForScope } from './adminTabs'

export default function AdminPanel({ onLogout, role = 'viewer' }) {
  const isViewer = role === 'viewer'
  const checkinOnly = role === 'checkin'
  const staffOnly = role === 'staff'

  // Live per-grant scope (SP3). null until loaded => unrestricted. Password accounts
  // don't bake scope in the JWT, so it's read live via the my_scope() RPC ({} when
  // there is no grant — e.g. a legacy hand-made admin — which means unrestricted).
  const [scope, setScope] = useState(null)
  useEffect(() => {
    if (!supabase) return undefined
    let active = true
    supabase.rpc('my_scope').then(({ data, error }) => {
      if (!active) return
      if (error) { console.error('[my_scope]', error.message); setScope({}) } // backend is the real gate
      else setScope(data || {})
    })
    return () => { active = false }
  }, [])

  // Write actions are hidden for viewers (role) AND read_only-scoped grants (live
  // scope). Tab VISIBILITY is by role only — a read_only admin still sees every
  // admin tab (reads stay broad per SP3 Option 2); only writes are hidden. The
  // backend (SP3 Phase 2 RPC guards + Phase 3 RLS) is the real gate; this is UX.
  const readOnly = isViewer || !!scope?.read_only
  // A read_only grant must not reach the Acessos (account provisioning) tab —
  // creating an account there would escalate past read_only. Defense-in-depth; the
  // access-account edge is also scope-gated server-side (the real boundary).
  const roleTabs = tabsForRole(role, ALL_TABS).filter(t => !(readOnly && t.id === 'access'))
  const TABS = tabsForScope(roleTabs, scope, ALL_TABS)
  const [activeTab, setActiveTab] = useState(staffOnly ? 'wall' : checkinOnly ? 'checkin' : 'dashboard')
  // Defense-in-depth: gate content rendering by the same tab set used for nav, so a
  // forced activeTab cannot expose a tab the role/scope can't see. (RLS remains the
  // real boundary.) If scope's allowed_tabs excludes the current tab, fall back to
  // the first allowed one without an extra effect/render.
  const allowedTabs = new Set(TABS.map(t => t.id))
  const effectiveActive = allowedTabs.has(activeTab) ? activeTab : (TABS[0]?.id ?? activeTab)
  const show = (id) => allowedTabs.has(id) && effectiveActive === id
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
            {isViewer && <span className="text-xs font-mono text-electric/60 border border-electric/20 px-2 py-0.5 rounded-full">visualização</span>}
            {!isViewer && scope?.read_only && <span className="text-xs font-mono text-gold/60 border border-gold/20 px-2 py-0.5 rounded-full">somente leitura</span>}
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
                effectiveActive === tab.id
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
        {show('mentors') && <AdminMentors />}
        {show('prepitch-rooms') && <AdminPrePitchRooms />}
        {show('jurors') && <AdminJurors />}
        {show('wall') && <AdminWall />}
        {show('sugarcubes') && <AdminSugarCubes />}
        {show('resources') && <AdminResources />}
        {show('facilitator') && <AdminFacilitator />}
        {show('notifications') && <AdminNotifications />}
        {show('checkin') && <AdminCheckin />}
        {show('logs') && <AdminAuditLog />}
        {role === 'admin' && !readOnly && show('access') && <AdminAccess />}
      </main>
    </div>
  )
}

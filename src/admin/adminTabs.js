// Canonical admin-tab registry — the single source of truth for AdminPanel's nav
// AND for the AdminAccess scope (`allowed_tabs`). The `id`s here are exactly the
// strings that `allowed_tabs` gates (and that the Phase-2 RPC `assert_tab('<id>')`
// guards check), so the admin UI can only ever emit real tab IDs.
export const ALL_TABS = [
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

// Tabs a ROLE may see (unchanged from the original inline logic). Scope is applied
// separately by tabsForScope — role visibility and write-permission are decoupled
// so a read_only ADMIN still sees every admin tab (read), only writes are hidden.
export function tabsForRole(role, allTabs = ALL_TABS) {
  if (role === 'staff') return allTabs.filter((t) => t.id === 'wall' || t.id === 'checkin')
  if (role === 'checkin') return allTabs.filter((t) => t.id === 'checkin')
  if (role === 'viewer') return allTabs.filter((t) => !t.adminOnly)
  return allTabs // admin (and any other role) sees all
}

// Narrow a role's tabs by a grant's `allowed_tabs` (live scope). Semantics:
// - empty/absent allowed_tabs => unrestricted (all role tabs).
// - UNKNOWN entries (not a real tab id) are no-ops; if ALL entries are unknown the
//   restriction is treated as absent (never silently blanks the panel).
// - otherwise show allowed ∩ role tabs; if that intersection is empty (the grant
//   only names tabs this role lacks) fall back to the role tabs — the backend
//   (Phase 2/3) is the real write gate, this is UX only.
export function tabsForScope(roleTabs, scope, allTabs = ALL_TABS) {
  const allowed = Array.isArray(scope?.allowed_tabs) ? scope.allowed_tabs : []
  const known = allowed.filter((id) => allTabs.some((t) => t.id === id))
  if (known.length === 0) return roleTabs
  const restricted = roleTabs.filter((t) => known.includes(t.id))
  return restricted.length ? restricted : roleTabs
}

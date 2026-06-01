const ROLE_ROUTE = {
  admin: '#admin',
  viewer: '#admin',
  checkin: '#admin',
  staff: '#admin',
  facilitator: '#facilitador',
  mentor: '#mentor',
  juror: '#jurado',
}
const RPC_TOKEN_ROLES = new Set(['mentor', 'juror'])

export function parseAccessToken(hash) {
  const m = String(hash || '').match(/^#acesso\?t=(.+)$/)
  return m ? m[1] : null
}

export function routeForRole(role) {
  return ROLE_ROUTE[role] ?? null
}

export function isExchangeRole(role) {
  return role in ROLE_ROUTE && !RPC_TOKEN_ROLES.has(role)
}

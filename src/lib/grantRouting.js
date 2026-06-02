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

// Grants with a backing Supabase user (jwt_exchange link sessions and password
// accounts) are revoked via the access-admin edge, which deletes the backing
// user to kill the live session. Token-only grants (rpc_token: mentor/juror)
// are revoked via the admin_revoke_grant RPC.
export function usesEdgeRevoke(authKind) {
  return authKind === 'jwt_exchange' || authKind === 'password'
}

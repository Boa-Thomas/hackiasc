// Shared wall constants used by WallScreen (PHASE_LABELS) and AdminWall (ECONOMIC_AXES).
// The CPF+birthdate identify flow (useWallSession hook) was removed in Option A —
// the wall now requires a confirmed participant session token.

export const ECONOMIC_AXES = [
  'Metalmecânico',
  'Têxtil',
  'TIC',
  'Turismo',
  'Economia Criativa',
  'Saúde',
]

export const PHASE_LABELS = {
  closed: 'Fechado',
  wall_open: 'Muro aberto',
  voting_open: 'Votação aberta',
  results: 'Resultado',
}

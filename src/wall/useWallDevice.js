// Identidade leve do participante para o Muro de Dores.
// Sem login Supabase: um UUID por dispositivo guardado em localStorage
// (chave `hackiasc_wall_device`) + nome digitado. Decisao do orquestrador —
// zero friccao na abertura presencial; fraude nao e risco critico (~100 pessoas).

const DEVICE_KEY = 'hackiasc_wall_device'
const NAME_KEY = 'hackiasc_wall_name'

function makeUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Fallback para navegadores sem crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export function getWallDevice() {
  if (typeof localStorage === 'undefined') return makeUuid()
  let token = localStorage.getItem(DEVICE_KEY)
  if (!token) {
    token = makeUuid()
    localStorage.setItem(DEVICE_KEY, token)
  }
  return token
}

export function getWallName() {
  if (typeof localStorage === 'undefined') return ''
  return localStorage.getItem(NAME_KEY) || ''
}

export function setWallName(name) {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(NAME_KEY, name)
}

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
}

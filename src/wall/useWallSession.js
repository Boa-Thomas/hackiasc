// Identidade FORTE do participante para o Muro de Dores.
// Substitui o antigo "device token" (UUID em localStorage, forjavel) por
// identificacao via CPF + DATA DE NASCIMENTO contra `registrations`: so entra
// quem esta inscrito e com pagamento CONFIRMADO. O RPC wall_identify resolve o
// registration_id no servidor; guardamos {registration_id, full_name} em
// sessionStorage (limpa ao fechar a aba — identidade nao vaza entre sessoes).
import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SESSION_KEY = 'hackiasc_wall_session'

function readSession() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && parsed.registration_id) return parsed
    return null
  } catch {
    return null
  }
}

function writeSession(session) {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

function clearSession() {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.removeItem(SESSION_KEY)
}

// Remove tudo que nao for digito (envia CPF limpo; o server tambem normaliza).
export function cleanCpf(value) {
  return (value || '').replace(/\D/g, '')
}

// Mascara progressiva 000.000.000-00 para exibicao no input.
export function maskCpf(value) {
  const d = cleanCpf(value).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1-$2')
}

// Hook de sessao do muro: estado da identidade + identify()/logout().
export function useWallSession() {
  const [session, setSession] = useState(() => readSession())

  const identify = useCallback(async (cpf, birthDate) => {
    if (!supabase) {
      throw new Error('Sistema indisponível no momento.')
    }
    const { data, error } = await supabase.rpc('wall_identify', {
      p_cpf: cleanCpf(cpf),
      p_birth_date: birthDate, // 'YYYY-MM-DD' do input date
    })
    if (error) throw error
    const next = {
      registration_id: data.registration_id,
      full_name: data.full_name,
    }
    writeSession(next)
    setSession(next)
    return next
  }, [])

  const logout = useCallback(() => {
    clearSession()
    setSession(null)
  }, [])

  return { session, identify, logout }
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
  results: 'Resultado',
}

import { useEffect, useState } from 'react'
import { isIOS, isStandalone, shouldShowPrompt, getSnoozeUntil, snooze, enablePush } from '../lib/push'

// auth: { kind: 'participant'|'mentor'|'admin', token?: string }
export default function EnablePushPrompt({ auth }) {
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)
  const iosNeedsInstall = isIOS() && !isStandalone()

  useEffect(() => {
    if (typeof Notification === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    const perm = Notification.permission
    if (perm === 'denied') return
    if (perm === 'granted') {
      enablePush(auth).catch(() => {})
      return
    }
    if (shouldShowPrompt(perm, getSnoozeUntil())) setVisible(true)
  }, [auth])

  if (!visible) return null

  async function handleEnable() {
    setBusy(true)
    try {
      const res = await enablePush(auth)
      if (res.permission === 'denied') setDenied(true)
      if (res.ok) setVisible(false)
    } catch {
      setVisible(false)
    } finally {
      setBusy(false)
    }
  }

  function handleLater() {
    snooze()
    setVisible(false)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] p-4 sm:p-6 flex justify-center pointer-events-none">
      <div className="pointer-events-auto card-glass max-w-md w-full p-5 rounded-2xl border border-cyan/20 shadow-xl">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔔</span>
          <div className="flex-1">
            <h3 className="font-display text-white font-semibold">Ative os avisos</h3>
            <p className="text-white/60 text-sm mt-1">
              Receba avisos do evento (mural liberado, notas, cronograma, votação) mesmo com o app fechado.
            </p>

            {denied && (
              <p className="text-hot/80 text-xs mt-2">
                As notificações estão bloqueadas no navegador. Habilite nas configurações do site para receber avisos.
              </p>
            )}

            {iosNeedsInstall ? (
              <div className="text-white/70 text-xs mt-3 space-y-1">
                <p className="font-medium text-white/90">No iPhone, primeiro instale o app:</p>
                <p>1. Toque em <strong>Compartilhar</strong> (ícone de seta para cima) no Safari.</p>
                <p>2. Escolha <strong>Adicionar à Tela de Início</strong>.</p>
                <p>3. Abra o app pela tela inicial e ative os avisos por aqui.</p>
                <button onClick={handleLater} className="mt-2 text-white/50 hover:text-white/80 text-xs">Agora não</button>
              </div>
            ) : (
              <div className="flex gap-2 mt-4">
                <button onClick={handleEnable} disabled={busy}
                  className="px-4 py-2 rounded-lg bg-cyan/20 text-cyan border border-cyan/30 text-sm font-medium hover:bg-cyan/30 disabled:opacity-50">
                  {busy ? 'Ativando…' : 'Ativar'}
                </button>
                <button onClick={handleLater}
                  className="px-4 py-2 rounded-lg text-white/50 hover:text-white/80 text-sm">Agora não</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

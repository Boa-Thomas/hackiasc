import { useVersionCheck } from '../hooks/useVersionCheck'

// Banner nao-intrusivo: aparece quando ha um deploy novo. Botao recarrega.
export default function UpdateBanner() {
  const updateAvailable = useVersionCheck()
  if (!updateAvailable) return null
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] card-glass rounded-full px-5 py-2.5 flex items-center gap-4 border border-cyan/30 shadow-lg">
      <span className="text-white/80 text-sm">Nova versão disponível</span>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1 rounded-full text-sm font-semibold bg-cyan/20 text-cyan border border-cyan/40 hover:bg-cyan/30 transition-colors"
      >
        Recarregar
      </button>
    </div>
  )
}

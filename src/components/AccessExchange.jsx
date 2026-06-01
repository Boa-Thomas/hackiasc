import { useGrantAccess } from '../hooks/useGrantAccess'

export default function AccessExchange() {
  const { status, error } = useGrantAccess()
  if (status === 'error') {
    return (
      <div className="min-h-screen grid place-items-center text-center p-6">
        <div>
          <p className="text-hot font-mono">Link inválido ou expirado.</p>
          <a href="#" className="text-electric underline">Voltar ao início</a>
        </div>
      </div>
    )
  }
  return (
    <div className="min-h-screen grid place-items-center">
      <p className="text-cyan font-mono animate-pulse">Validando acesso…</p>
    </div>
  )
}

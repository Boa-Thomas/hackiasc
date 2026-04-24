/**
 * DatiLogo — Logo oficial DATI (PNG branco, para fundos escuros)
 * Arquivo: /public/dati-logo.png
 */
export default function DatiLogo({ className = '', height = 36 }) {
  return (
    <img
      src="/dati-logo.png"
      alt="DATI — Agência de Desenvolvimento de TI"
      height={height}
      style={{ height: `${height}px`, width: 'auto', display: 'block' }}
      className={className}
    />
  )
}

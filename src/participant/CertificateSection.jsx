import { EVENT_CONFIG } from '../lib/config'

// Theme colors as hex (Tailwind v4 custom theme — not available at runtime in JS)
const COLORS = {
  dark:     '#050510',
  cyan:     '#06d6a0',
  electric: '#3a86ff',
  violet:   '#8338ec',
  gold:     '#ffbe0b',
  hot:      '#ff006e',
  white:    '#ffffff',
  muted:    '#8899aa',
}

/** Convert a full name into a URL-safe slug for the filename */
function toSlug(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Generate and download the participation certificate as a PDF */
async function downloadCertificate(profile) {
  // Lazy-load jspdf so it doesn't bloat the initial bundle
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4', // 297 × 210 mm
  })

  const W = 297
  const H = 210

  // ── Background ──────────────────────────────────────────────────────────
  doc.setFillColor(5, 5, 16) // #050510 dark
  doc.rect(0, 0, W, H, 'F')

  // ── Decorative corner accents ────────────────────────────────────────────
  // Top-left
  doc.setDrawColor(6, 214, 160)   // cyan
  doc.setLineWidth(0.8)
  doc.line(12, 12, 40, 12)
  doc.line(12, 12, 12, 40)

  // Top-right
  doc.setDrawColor(58, 134, 255)  // electric
  doc.line(W - 12, 12, W - 40, 12)
  doc.line(W - 12, 12, W - 12, 40)

  // Bottom-left
  doc.setDrawColor(131, 56, 236)  // violet
  doc.line(12, H - 12, 40, H - 12)
  doc.line(12, H - 12, 12, H - 40)

  // Bottom-right
  doc.setDrawColor(255, 190, 11)  // gold
  doc.line(W - 12, H - 12, W - 40, H - 12)
  doc.line(W - 12, H - 12, W - 12, H - 40)

  // ── Outer border ────────────────────────────────────────────────────────
  doc.setDrawColor(6, 214, 160)   // cyan
  doc.setLineWidth(0.3)
  doc.rect(8, 8, W - 16, H - 16)

  // ── Top accent bar ───────────────────────────────────────────────────────
  // Gradient-like: three color bars side by side
  const barY = 18
  const barH = 1.5
  const barW = (W - 24) / 3
  doc.setFillColor(6, 214, 160)
  doc.rect(12, barY, barW, barH, 'F')
  doc.setFillColor(58, 134, 255)
  doc.rect(12 + barW, barY, barW, barH, 'F')
  doc.setFillColor(131, 56, 236)
  doc.rect(12 + barW * 2, barY, barW, barH, 'F')

  // ── Brand / header ───────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(6, 214, 160) // cyan
  doc.text(EVENT_CONFIG.brand, W / 2, 32, { align: 'center' })

  // ── "CERTIFICADO DE PARTICIPAÇÃO" ────────────────────────────────────────
  doc.setFontSize(22)
  doc.setTextColor(255, 255, 255)
  doc.text('CERTIFICADO DE PARTICIPAÇÃO', W / 2, 50, { align: 'center' })

  // Underline accent below title
  doc.setDrawColor(58, 134, 255)
  doc.setLineWidth(0.5)
  const titleUnderlineW = 130
  doc.line((W - titleUnderlineW) / 2, 53, (W + titleUnderlineW) / 2, 53)

  // ── Intro text ───────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(136, 153, 170) // muted
  doc.text('Certificamos que', W / 2, 68, { align: 'center' })

  // ── Participant name ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(28)
  doc.setTextColor(255, 190, 11) // gold
  doc.text(profile.full_name, W / 2, 83, { align: 'center' })

  // Name underline
  doc.setDrawColor(255, 190, 11)
  doc.setLineWidth(0.4)
  const nameUnderlineW = 160
  doc.line((W - nameUnderlineW) / 2, 87, (W + nameUnderlineW) / 2, 87)

  // ── Body text ─────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(200, 210, 220)
  const body1 = `participou do ${EVENT_CONFIG.name}`
  doc.text(body1, W / 2, 100, { align: 'center' })

  doc.setFontSize(10)
  doc.setTextColor(136, 153, 170)
  doc.text(
    `realizado nos dias ${EVENT_CONFIG.dates}, em ${EVENT_CONFIG.city}.`,
    W / 2,
    110,
    { align: 'center' }
  )

  // ── Location pill ─────────────────────────────────────────────────────────
  doc.setDrawColor(131, 56, 236)
  doc.setFillColor(131, 56, 236, 0.15)
  doc.setLineWidth(0.3)
  const pillW = 100
  const pillX = (W - pillW) / 2
  doc.roundedRect(pillX, 117, pillW, 8, 2, 2, 'S')
  doc.setFontSize(8.5)
  doc.setTextColor(131, 56, 236)
  doc.text(EVENT_CONFIG.location, W / 2, 122.5, { align: 'center' })

  // ── Bottom bar ────────────────────────────────────────────────────────────
  const bottomY = H - 24
  doc.setDrawColor(6, 214, 160)
  doc.setLineWidth(0.2)
  doc.line(20, bottomY, W - 20, bottomY)

  // Organizer
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(136, 153, 170)
  doc.text(EVENT_CONFIG.organizer.company, W / 2, bottomY + 6, { align: 'center' })
  doc.text(EVENT_CONFIG.organizer.email, W / 2, bottomY + 11, { align: 'center' })

  // ── Bottom accent bar ─────────────────────────────────────────────────────
  const bBarY = H - 6
  doc.setFillColor(6, 214, 160)
  doc.rect(12, bBarY, barW, 1, 'F')
  doc.setFillColor(58, 134, 255)
  doc.rect(12 + barW, bBarY, barW, 1, 'F')
  doc.setFillColor(255, 190, 11)
  doc.rect(12 + barW * 2, bBarY, barW, 1, 'F')

  // ── Save ──────────────────────────────────────────────────────────────────
  const slug = toSlug(profile.full_name)
  doc.save(`certificado-hackia-sc-${slug}.pdf`)
}

export default function CertificateSection({ profile }) {
  const eventEndDate = new Date(EVENT_CONFIG.eventEndDate)
  const now = new Date()
  const isAvailable = now >= eventEndDate

  // Format the end date for display, e.g. "31/05"
  const endDateLabel = eventEndDate.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })

  return (
    <div className="card-glass rounded-2xl p-6 border border-gold/30">
      <div className="flex items-start gap-4">
        {/* Icon */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-gold uppercase tracking-wider mb-1">Certificado de Participação</p>
          <p className="text-sm text-white font-semibold leading-snug">
            {EVENT_CONFIG.name}
          </p>
          <p className="text-xs text-text-muted mt-1">
            {EVENT_CONFIG.dates} · {EVENT_CONFIG.city}
          </p>

          <div className="mt-4">
            {isAvailable ? (
              <button
                onClick={() => downloadCertificate(profile)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gold/40 bg-gold/10 text-gold text-sm font-semibold hover:bg-gold/20 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Baixar certificado (PDF)
              </button>
            ) : (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-border bg-dark/60 text-text-muted text-sm">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                Disponível após o evento ({endDateLabel})
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

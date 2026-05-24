import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import { supabase } from '../lib/supabase'

// UUID v4 regex — validates the scanned string before using it as a query key
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Constants ───────────────────────────────────────────────────────────────

const OCCUPATION_COLORS = {
  hacker:     { bg: 'bg-electric/15', text: 'text-electric', border: 'border-electric/30', label: 'Hacker' },
  hustler:    { bg: 'bg-cyan/15',     text: 'text-cyan',     border: 'border-cyan/30',     label: 'Hustler' },
  hipster:    { bg: 'bg-violet/15',   text: 'text-violet',   border: 'border-violet/30',   label: 'Hipster' },
  enthusiast: { bg: 'bg-gold/15',     text: 'text-gold',     border: 'border-gold/30',     label: 'Enthusiast' },
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

// Formats a DATE column ("YYYY-MM-DD") to "DD/MM/YYYY" without timezone shift.
function formatBirthDate(value) {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) {
    const [, y, m, d] = match
    return `${d}/${m}/${y}`
  }
  return value
}

// Formats a CPF to "000.000.000-00". Returns the raw value if it isn't 11 digits.
function formatCPF(value) {
  if (!value) return '—'
  const digits = String(value).replace(/\D/g, '')
  if (digits.length !== 11) return value
  return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function CheckinProgressBar({ checkedIn, total }) {
  const pct = total > 0 ? Math.round((checkedIn / total) * 100) : 0
  return (
    <div className="card-glass rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl font-display font-bold text-cyan">{checkedIn}</span>
          <span className="text-white/40 font-mono text-sm">/ {total} presentes</span>
        </div>
        <span className="text-lg font-mono font-bold text-cyan">{pct}%</span>
      </div>
      <div className="w-full h-3 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full bg-cyan rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function CheckinRow({ registration, onRequestCheckin, onUndo, busy }) {
  const isCheckedIn = !!registration.checked_in_at
  const occ = OCCUPATION_COLORS[registration.occupation_type] ?? { bg: 'bg-white/10', text: 'text-white/50', border: 'border-white/10', label: registration.occupation_type }

  return (
    <div className={`flex items-center gap-4 p-4 rounded-xl border transition-colors ${
      isCheckedIn
        ? 'bg-cyan/5 border-cyan/20'
        : 'bg-white/[0.02] border-white/5 hover:border-white/10'
    }`}>
      {/* Status indicator */}
      <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isCheckedIn ? 'bg-cyan animate-pulse' : 'bg-white/15'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`font-display font-medium text-sm ${isCheckedIn ? 'text-white' : 'text-white/80'}`}>
            {registration.full_name}
          </span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${occ.bg} ${occ.text} ${occ.border}`}>
            {occ.label}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 mt-0.5">
          <span className="text-xs text-white/40 font-mono">{registration.email}</span>
          {registration.team_name && (
            <span className="text-xs text-white/30 font-mono">
              {registration.team_name}
            </span>
          )}
          {isCheckedIn && (
            <span className="text-xs text-cyan/60 font-mono">
              Check-in: {formatTime(registration.checked_in_at)}
            </span>
          )}
        </div>
      </div>

      {/* Action */}
      {isCheckedIn ? (
        <button
          onClick={() => onUndo(registration.id)}
          disabled={busy}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-white/40 border border-white/10 hover:bg-white/10 hover:text-white/60 disabled:opacity-30 transition-colors whitespace-nowrap"
        >
          Desfazer
        </button>
      ) : (
        <button
          onClick={() => onRequestCheckin(registration)}
          disabled={busy}
          className="px-4 py-1.5 rounded-lg text-sm font-medium bg-cyan/20 text-cyan border border-cyan/30 hover:bg-cyan/30 disabled:opacity-30 transition-colors whitespace-nowrap"
        >
          Check-in
        </button>
      )}
    </div>
  )
}

function IdentityConfirmModal({ registration, onConfirm, onCancel, busy }) {
  const [verified, setVerified] = useState(false)

  if (!registration) return null

  const occ = OCCUPATION_COLORS[registration.occupation_type] ?? { bg: 'bg-white/10', text: 'text-white/50', border: 'border-white/10', label: registration.occupation_type }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="card-glass rounded-2xl p-6 w-full max-w-md flex flex-col gap-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs font-mono uppercase tracking-wider text-white/40">Conferir identidade</span>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-display font-bold text-white">{registration.full_name}</h3>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${occ.bg} ${occ.text} ${occ.border}`}>
              {occ.label}
            </span>
          </div>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/10 divide-y divide-white/5">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-mono uppercase tracking-wider text-white/40">CPF</span>
            <span className="text-base font-mono text-white tabular-nums">{formatCPF(registration.cpf)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-xs font-mono uppercase tracking-wider text-white/40">Nascimento</span>
            <span className="text-base font-mono text-white tabular-nums">{formatBirthDate(registration.birth_date)}</span>
          </div>
        </div>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={verified}
            onChange={e => setVerified(e.target.checked)}
            className="mt-0.5 w-5 h-5 rounded border-white/20 bg-white/5 text-cyan focus:ring-cyan/40 cursor-pointer accent-cyan"
          />
          <span className="text-sm text-white/70 leading-snug">
            Conferi o CPF e a data de nascimento com um documento de identificação do participante.
          </span>
        </label>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 hover:text-white/80 disabled:opacity-30 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(registration.id)}
            disabled={!verified || busy}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-cyan/20 text-cyan border border-cyan/30 hover:bg-cyan/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Confirmar check-in
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── QR Scanner Modal ────────────────────────────────────────────────────────

/**
 * Opens the device camera, scans for a QR code, and returns the scanned value
 * via onScan(registrationId). Calls onClose when dismissed or after a successful
 * scan. Requires HTTPS or localhost (getUserMedia constraint).
 *
 * html5-qrcode fires the success callback repeatedly while the QR is in frame,
 * so we use a `scannedRef` flag to guarantee single-shot behaviour and avoid
 * calling onScan more than once per open.
 */
function QrScannerModal({ onScan, onClose }) {
  const containerId = 'qr-reader-container'
  const scannerRef = useRef(null)
  const scannedRef = useRef(false)
  const [cameraError, setCameraError] = useState(null)
  const [hint, setHint] = useState('Aponte a câmera para o QR do participante')

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState()
        // State 2 = SCANNING, 3 = PAUSED — only stop when active
        if (state === 2 || state === 3) {
          await scannerRef.current.stop()
        }
        await scannerRef.current.clear()
      } catch {
        // ignore — may already be stopped
      }
      scannerRef.current = null
    }
  }, [])

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId)
    scannerRef.current = scanner

    const config = {
      fps: 10,
      qrbox: { width: 220, height: 220 },
      aspectRatio: 1.0,
      disableFlip: false,
    }

    const onSuccess = (decodedText) => {
      if (scannedRef.current) return   // guard against repeated fires
      const text = decodedText.trim()
      if (!UUID_RE.test(text)) {
        setHint('QR inválido — tente outro código')
        return
      }
      scannedRef.current = true
      stopScanner()
      onScan(text)
    }

    const onError = () => {
      // Called on every frame where no QR is found — not a real error, ignore
    }

    scanner.start(
      { facingMode: 'environment' },
      config,
      onSuccess,
      onError,
    ).catch((err) => {
      const msg = err?.message ?? String(err)
      if (/permission|notallowed/i.test(msg)) {
        setCameraError('Permissão de câmera negada. Autorize o acesso nas configurações do navegador.')
      } else if (/notfound|devicenotfound/i.test(msg)) {
        setCameraError('Nenhuma câmera encontrada neste dispositivo.')
      } else {
        setCameraError(`Erro ao iniciar câmera: ${msg}`)
      }
    })

    return () => {
      stopScanner()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="card-glass rounded-2xl p-6 w-full max-w-sm flex flex-col gap-4"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-mono uppercase tracking-wider text-white/40">Escanear QR</span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-white/50 hover:text-white/80 hover:bg-white/10 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Camera view or error */}
        {cameraError ? (
          <div className="rounded-xl bg-hot/10 border border-hot/30 p-4 text-sm text-hot/80 text-center">
            {cameraError}
            {/permiss|autorize/i.test(cameraError) && (
              <p className="mt-2 text-xs text-white/40">
                No Chrome: clique no ícone de câmera na barra de endereços e permita o acesso.
              </p>
            )}
          </div>
        ) : (
          <div
            id={containerId}
            className="w-full rounded-xl overflow-hidden bg-black min-h-[260px]"
          />
        )}

        {/* Hint */}
        {!cameraError && (
          <p className="text-xs text-white/40 text-center font-mono">{hint}</p>
        )}

        <p className="text-xs text-white/25 text-center">
          Requer HTTPS ou localhost (câmera bloqueada em HTTP puro)
        </p>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function AdminCheckin() {
  const [registrations, setRegistrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // 'all' | 'pending' | 'checked_in'
  const [busyId, setBusyId] = useState(null)
  const [confirming, setConfirming] = useState(null) // registration pending identity confirmation
  const [scannerOpen, setScannerOpen] = useState(false)

  async function fetchData() {
    if (!supabase) {
      setError('Supabase não configurado.')
      setLoading(false)
      return
    }
    const { data, error: err } = await supabase
      .from('registrations')
      .select('id, full_name, email, cpf, birth_date, occupation_type, team_name, payment_status, checked_in_at')
      .eq('payment_status', 'confirmed')
      .order('full_name', { ascending: true })

    if (err) {
      setError(err.message)
    } else {
      setRegistrations(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData() // eslint-disable-line react-hooks/set-state-in-effect

    // Realtime subscription
    if (!supabase) return
    const channel = supabase
      .channel('checkin-changes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'registrations' }, () => {
        fetchData()
      })
      .subscribe()

    return () => { channel?.unsubscribe() }
  }, [])

  // ─── Derived ────────────────────────────────────────────────────────────────

  const { filtered, checkedInCount, totalCount } = useMemo(() => {
    let data = registrations

    // Search
    if (search.trim()) {
      const q = search.toLowerCase()
      data = data.filter(r =>
        r.full_name?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.team_name?.toLowerCase().includes(q)
      )
    }

    // Filter
    if (filter === 'pending') {
      data = data.filter(r => !r.checked_in_at)
    } else if (filter === 'checked_in') {
      data = data.filter(r => !!r.checked_in_at)
    }

    // Sort: pending first, then by name
    data = [...data].sort((a, b) => {
      if (!a.checked_in_at && b.checked_in_at) return -1
      if (a.checked_in_at && !b.checked_in_at) return 1
      return a.full_name.localeCompare(b.full_name)
    })

    return {
      filtered: data,
      checkedInCount: registrations.filter(r => !!r.checked_in_at).length,
      totalCount: registrations.length,
    }
  }, [registrations, search, filter])

  // ─── Actions ────────────────────────────────────────────────────────────────

  // Presence is toggled through the set_checkin() RPC. It runs SECURITY DEFINER,
  // so it both restricts the write to checked_in_at and records the audit entry
  // with the operator's email taken from the JWT (works for admin and checkin roles).
  async function handleCheckin(id) {
    if (!supabase) return
    setBusyId(id)
    const { data, error: err } = await supabase.rpc('set_checkin', { p_id: id, p_present: true })
    if (err) alert(`Erro: ${err.message}`)
    else {
      const ts = data ?? new Date().toISOString()
      setRegistrations(prev => prev.map(r =>
        r.id === id ? { ...r, checked_in_at: ts } : r
      ))
      setConfirming(null)
    }
    setBusyId(null)
  }

  async function handleUndo(id) {
    if (!supabase) return
    setBusyId(id)
    const { error: err } = await supabase.rpc('set_checkin', { p_id: id, p_present: false })
    if (err) alert(`Erro: ${err.message}`)
    else {
      setRegistrations(prev => prev.map(r =>
        r.id === id ? { ...r, checked_in_at: null } : r
      ))
    }
    setBusyId(null)
  }

  // Called by QrScannerModal after a successful scan.
  // Looks up the registration in the already-loaded list and opens the SAME
  // identity-confirmation modal used by the manual search flow.
  function handleQrScan(id) {
    setScannerOpen(false)
    const reg = registrations.find(r => r.id === id)
    if (!reg) {
      alert('Inscrição não encontrada. Verifique se o pagamento foi confirmado.')
      return
    }
    if (reg.checked_in_at) {
      alert(`${reg.full_name} já fez check-in às ${formatTime(reg.checked_in_at)}.`)
      return
    }
    setConfirming(reg) // opens IdentityConfirmModal — same path as the manual flow
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-white/40 font-mono text-sm">
        Carregando participantes...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-hot font-mono text-sm">{error}</p>
        <button
          onClick={() => { setError(null); setLoading(true); fetchData() }}
          className="px-4 py-2 rounded-lg text-sm bg-white/5 text-white/60 border border-white/10 hover:bg-white/10 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Progress */}
      <CheckinProgressBar checkedIn={checkedInCount} total={totalCount} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome, email ou time..."
          className="flex-1 min-w-[200px] bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 pl-10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-cyan/50 focus:ring-1 focus:ring-cyan/30 transition-colors"
        />

        {/* QR scanner shortcut */}
        <button
          onClick={() => setScannerOpen(true)}
          title="Escanear QR do participante"
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium bg-violet/20 text-violet border border-violet/30 hover:bg-violet/30 transition-colors whitespace-nowrap"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 18.75h.75v.75h-.75v-.75ZM18.75 13.5h.75v.75h-.75v-.75ZM18.75 18.75h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
          </svg>
          Escanear QR
        </button>

        <div className="flex gap-1">
          {[
            { id: 'all', label: 'Todos' },
            { id: 'pending', label: 'Aguardando' },
            { id: 'checked_in', label: 'Presentes' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                filter === f.id
                  ? 'bg-cyan/20 text-cyan border-cyan/30'
                  : 'bg-white/5 text-white/50 border-white/10 hover:text-white/70'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Count */}
      <div className="text-xs text-white/40 font-mono px-1">
        {filtered.length} participante{filtered.length !== 1 ? 's' : ''}
        {filtered.length !== totalCount && ` (de ${totalCount} total)`}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-white/30 font-mono text-sm">
          {search ? 'Nenhum participante encontrado.' : 'Nenhum participante confirmado.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(reg => (
            <CheckinRow
              key={reg.id}
              registration={reg}
              onRequestCheckin={setConfirming}
              onUndo={handleUndo}
              busy={busyId === reg.id}
            />
          ))}
        </div>
      )}

      <IdentityConfirmModal
        key={confirming?.id ?? 'closed'}
        registration={confirming}
        onConfirm={handleCheckin}
        onCancel={() => setConfirming(null)}
        busy={busyId === confirming?.id}
      />

      {scannerOpen && (
        <QrScannerModal
          onScan={handleQrScan}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  )
}

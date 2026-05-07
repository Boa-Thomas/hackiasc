import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { audit } from '../lib/auditLog'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBRL(cents) {
  if (cents == null) return '—'
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function buildVoucherUrl(code) {
  const base = window.location.origin + window.location.pathname
  return `${base}?voucher=${code}#inscricao`
}

const STATUS_BADGE = {
  pending:   { label: 'Aguardando pagto',  text: 'text-gold',   bg: 'bg-gold/15',   border: 'border-gold/30'   },
  confirmed: { label: 'Pago',              text: 'text-cyan',   bg: 'bg-cyan/15',   border: 'border-cyan/30'   },
  cancelled: { label: 'Cancelado',         text: 'text-hot',    bg: 'bg-hot/15',    border: 'border-hot/30'    },
}

const VOUCHER_STATUS = {
  active:    { label: 'Disponível', text: 'text-electric', bg: 'bg-electric/15', border: 'border-electric/30' },
  redeemed:  { label: 'Resgatado',  text: 'text-cyan',     bg: 'bg-cyan/15',     border: 'border-cyan/30'     },
  cancelled: { label: 'Cancelado',  text: 'text-hot',      bg: 'bg-hot/15',      border: 'border-hot/30'      },
}

function StatusBadge({ status, map }) {
  const s = map[status] ?? { label: status, text: 'text-white/50', bg: 'bg-white/10', border: 'border-white/10' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-mono border ${s.bg} ${s.text} ${s.border}`}>
      {s.label}
    </span>
  )
}

// ─── Modal shell ─────────────────────────────────────────────────────────────

function ModalShell({ title, onClose, children, maxWidth = 'max-w-2xl' }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`card-glass rounded-2xl p-6 w-full ${maxWidth} space-y-4 max-h-[90vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display font-semibold text-white text-lg">{title}</h3>
          <button onClick={onClose} className="text-white/50 hover:text-white text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─── CreateOrderModal ────────────────────────────────────────────────────────

const INPUT = 'w-full bg-dark border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-electric'
const LBL = 'block text-xs font-mono uppercase tracking-wider text-white/50 mb-1.5'

function CreateOrderModal({ onClose, onCreated }) {
  const [companyName, setCompanyName] = useState('')
  const [cnpj, setCnpj] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [totalTickets, setTotalTickets] = useState(18)
  const [pricePerTicket, setPricePerTicket] = useState(200)
  const [paymentMethod, setPaymentMethod] = useState('pix')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const totalAmount = totalTickets * pricePerTicket

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!companyName.trim() || !contactName.trim() || !contactEmail.trim()) {
      setError('Razão social, nome e email do responsável são obrigatórios.')
      return
    }
    if (totalTickets < 1 || totalTickets > 100) {
      setError('Quantidade deve estar entre 1 e 100.')
      return
    }
    if (pricePerTicket <= 0) {
      setError('Preço por ingresso inválido.')
      return
    }

    setSubmitting(true)
    const { data, error: rpcError } = await supabase.rpc('admin_create_bulk_order', {
      p_company_name: companyName,
      p_cnpj: cnpj,
      p_contact_name: contactName,
      p_contact_email: contactEmail,
      p_contact_phone: contactPhone,
      p_total_tickets: totalTickets,
      p_ticket_price: pricePerTicket * 100,
      p_ticket_tier: 'corporate',
      p_payment_method: paymentMethod,
      p_payment_notes: paymentNotes,
    })

    if (rpcError) {
      setError('Erro ao criar pedido: ' + rpcError.message)
      setSubmitting(false)
      return
    }

    audit({
      action: 'bulk_order.create',
      actorType: 'admin',
      targetTable: 'bulk_orders',
      targetId: data.order_id,
      targetEmail: contactEmail.toLowerCase(),
      newData: {
        company_name: companyName,
        total_tickets: totalTickets,
        ticket_price: pricePerTicket * 100,
      },
    })

    onCreated(data.order_id)
  }

  return (
    <ModalShell title="Nova compra empresarial" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Razão social *</label>
            <input value={companyName} onChange={e => setCompanyName(e.target.value)} className={INPUT} maxLength={200} placeholder="Empresa LTDA" />
          </div>
          <div>
            <label className={LBL}>CNPJ</label>
            <input value={cnpj} onChange={e => setCnpj(e.target.value)} className={INPUT} maxLength={20} placeholder="00.000.000/0000-00" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Responsável *</label>
            <input value={contactName} onChange={e => setContactName(e.target.value)} className={INPUT} maxLength={120} placeholder="Nome completo" />
          </div>
          <div>
            <label className={LBL}>E-mail do responsável *</label>
            <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className={INPUT} maxLength={200} placeholder="contato@empresa.com" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Telefone</label>
            <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} className={INPUT} maxLength={20} placeholder="(47) 99999-9999" />
          </div>
          <div>
            <label className={LBL}>Forma de pagamento</label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={INPUT}>
              <option value="pix">PIX</option>
              <option value="transfer">Transferência bancária</option>
              <option value="boleto">Boleto</option>
              <option value="invoice">Nota fiscal / faturado</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={LBL}>Quantidade de ingressos *</label>
            <input type="number" min={1} max={100} value={totalTickets} onChange={e => setTotalTickets(parseInt(e.target.value) || 0)} className={INPUT} />
          </div>
          <div>
            <label className={LBL}>Preço por ingresso (R$) *</label>
            <input type="number" min={1} step={1} value={pricePerTicket} onChange={e => setPricePerTicket(parseInt(e.target.value) || 0)} className={INPUT} />
          </div>
        </div>

        <div>
          <label className={LBL}>Observações (opcional)</label>
          <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className={INPUT} rows={2} maxLength={500} placeholder="Ex: pedido referente à NF 1234, condição comercial..." />
        </div>

        <div className="card-glass rounded-lg p-4 border border-cyan/20 bg-cyan/5">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-mono uppercase tracking-wider text-white/50">Total a cobrar</span>
            <span className="text-2xl font-bold font-mono text-cyan">{formatBRL(totalAmount * 100)}</span>
          </div>
          <p className="text-xs text-white/40 mt-1">{totalTickets} ingressos × {formatBRL(pricePerTicket * 100)}</p>
        </div>

        {error && <p className="text-hot text-sm">{error}</p>}

        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white">
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-lg bg-electric text-white text-sm font-semibold hover:bg-cyan transition-colors disabled:opacity-50"
          >
            {submitting ? 'Criando...' : `Criar pedido + ${totalTickets} vouchers`}
          </button>
        </div>
      </form>
    </ModalShell>
  )
}

// ─── ConfirmPaymentModal ─────────────────────────────────────────────────────

function ConfirmPaymentModal({ order, onClose, onConfirmed }) {
  const [paymentMethod, setPaymentMethod] = useState(order.payment_method || 'pix')
  const [paymentNotes, setPaymentNotes] = useState(order.payment_notes || '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    setSubmitting(true)
    setError('')

    const { error: rpcError } = await supabase.rpc('admin_confirm_bulk_order', {
      p_order_id: order.id,
      p_payment_method: paymentMethod,
      p_payment_notes: paymentNotes,
    })

    if (rpcError) {
      setError('Erro ao confirmar: ' + rpcError.message)
      setSubmitting(false)
      return
    }

    audit({
      action: 'bulk_order.confirm_payment',
      actorType: 'admin',
      targetTable: 'bulk_orders',
      targetId: order.id,
      targetEmail: order.contact_email,
      newData: { payment_method: paymentMethod, payment_notes: paymentNotes },
    })

    onConfirmed()
  }

  return (
    <ModalShell title="Confirmar pagamento" onClose={onClose} maxWidth="max-w-md">
      <p className="text-sm text-white/60">
        Confirmar recebimento de <strong className="text-white">{formatBRL(order.total_tickets * order.ticket_price)}</strong> de <strong className="text-white">{order.company_name}</strong>?
      </p>
      <p className="text-xs text-gold/80 bg-gold/10 border border-gold/20 rounded-lg p-3">
        ⚠️ Após confirmar, os vouchers ficam ativos e os participantes podem se inscrever. Esta ação tem efeito imediato.
      </p>
      <div>
        <label className={LBL}>Forma de pagamento</label>
        <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className={INPUT}>
          <option value="pix">PIX</option>
          <option value="transfer">Transferência bancária</option>
          <option value="boleto">Boleto</option>
          <option value="invoice">Nota fiscal / faturado</option>
        </select>
      </div>
      <div>
        <label className={LBL}>Observações</label>
        <textarea value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className={INPUT} rows={2} maxLength={500} placeholder="Ex: comprovante #12345, recebido em 12/05..." />
      </div>
      {error && <p className="text-hot text-sm">{error}</p>}
      <div className="flex gap-2 justify-end pt-2">
        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white">
          Cancelar
        </button>
        <button
          onClick={handleConfirm}
          disabled={submitting}
          className="px-4 py-2 rounded-lg bg-cyan text-dark text-sm font-semibold hover:bg-electric transition-colors disabled:opacity-50"
        >
          {submitting ? 'Confirmando...' : 'Confirmar pagamento'}
        </button>
      </div>
    </ModalShell>
  )
}

// ─── OrderDetail ─────────────────────────────────────────────────────────────

function OrderDetail({ orderId, onBack, onChanged }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [showCancel, setShowCancel] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [copyFlash, setCopyFlash] = useState(null) // voucher id que acabou de ser copiado

  const load = useCallback(async () => {
    setLoading(true)
    const { data: result, error: rpcError } = await supabase.rpc('admin_get_bulk_order', { p_order_id: orderId })
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    setData(result)
    setLoading(false)
  }, [orderId])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  async function handleCancelOrder() {
    const { error: rpcError } = await supabase.rpc('admin_cancel_bulk_order', { p_order_id: orderId })
    if (rpcError) {
      alert('Erro ao cancelar: ' + rpcError.message)
      return
    }
    audit({
      action: 'bulk_order.cancel',
      actorType: 'admin',
      targetTable: 'bulk_orders',
      targetId: orderId,
      targetEmail: data?.order?.contact_email,
    })
    setShowCancel(false)
    await load()
    onChanged?.()
  }

  async function handleCancelVoucher(voucherId, code) {
    if (!confirm(`Cancelar voucher ${code}? Esta ação não pode ser desfeita.`)) return
    const { error: rpcError } = await supabase.rpc('admin_cancel_voucher', { p_voucher_id: voucherId })
    if (rpcError) {
      alert('Erro: ' + rpcError.message)
      return
    }
    audit({
      action: 'voucher.cancel',
      actorType: 'admin',
      targetTable: 'bulk_vouchers',
      targetId: voucherId,
      newData: { code },
    })
    await load()
    onChanged?.()
  }

  async function copyToClipboard(text, voucherId = null) {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFlash(voucherId ?? 'all')
      setTimeout(() => setCopyFlash(null), 1500)
    } catch {
      alert('Não foi possível copiar — copie manualmente: ' + text)
    }
  }

  function copyAllActiveLinks() {
    const lines = (data?.vouchers || [])
      .filter(v => v.status === 'active')
      .map(v => buildVoucherUrl(v.code))
    if (lines.length === 0) {
      alert('Nenhum voucher ativo para copiar.')
      return
    }
    copyToClipboard(lines.join('\n'))
  }

  function downloadCSV() {
    if (!data?.vouchers) return
    const rows = [
      ['Código', 'Link', 'Status', 'Resgatado em', 'Resgatado por (nome)', 'Resgatado por (email)'].join(','),
      ...data.vouchers.map(v => [
        v.code,
        buildVoucherUrl(v.code),
        v.status,
        v.redeemed_at ? new Date(v.redeemed_at).toLocaleString('pt-BR') : '',
        v.redeemed_by_name || '',
        v.redeemed_by_email || '',
      ].map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')),
    ].join('\n')
    const blob = new Blob([rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vouchers-${data.order.company_name.replace(/[^a-z0-9]/gi, '_')}-${orderId.slice(0, 8)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function buildEmailDraft() {
    if (!data) return ''
    const lines = data.vouchers
      .filter(v => v.status === 'active')
      .map(v => `• ${v.code} → ${buildVoucherUrl(v.code)}`)
      .join('\n')
    return encodeURIComponent(
      `Olá,\n\n` +
      `Seguem os ${data.vouchers.filter(v => v.status === 'active').length} vouchers de inscrição para o HackIA SC 2026:\n\n` +
      `${lines}\n\n` +
      `Cada voucher é único e pode ser usado uma única vez. Encaminhe um link para cada participante — basta abrir o link e preencher os dados pessoais.\n\n` +
      `Qualquer dúvida, estamos à disposição.\n`
    )
  }

  if (loading) return <div className="text-white/60 font-mono">Carregando...</div>
  if (error) return <div className="text-hot">Erro: {error}</div>
  if (!data?.order) return <div className="text-white/60">Pedido não encontrado.</div>

  const order = data.order
  const vouchers = data.vouchers || []
  const filteredVouchers = filterStatus === 'all'
    ? vouchers
    : vouchers.filter(v => v.status === filterStatus)
  const totalAmount = order.total_tickets * order.ticket_price
  const redeemedCount = vouchers.filter(v => v.status === 'redeemed').length
  const activeCount = vouchers.filter(v => v.status === 'active').length

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-electric hover:text-cyan">
        ← Voltar para lista
      </button>

      {/* Header card */}
      <div className="card-glass rounded-2xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-bold text-white">{order.company_name}</h2>
            <p className="text-sm text-white/60 mt-1">
              {order.cnpj && <span className="font-mono">{order.cnpj} • </span>}
              {order.contact_name} — <a href={`mailto:${order.contact_email}`} className="text-electric hover:underline">{order.contact_email}</a>
              {order.contact_phone && <span className="text-white/40"> • {order.contact_phone}</span>}
            </p>
          </div>
          <StatusBadge status={order.payment_status} map={STATUS_BADGE} />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-mono uppercase tracking-wider text-white/50">Ingressos</p>
            <p className="text-lg font-bold text-white mt-1">{order.total_tickets}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-mono uppercase tracking-wider text-white/50">Por ingresso</p>
            <p className="text-lg font-bold text-white mt-1">{formatBRL(order.ticket_price)}</p>
          </div>
          <div className="rounded-lg border border-cyan/20 bg-cyan/5 p-3">
            <p className="text-xs font-mono uppercase tracking-wider text-white/50">Total</p>
            <p className="text-lg font-bold text-cyan mt-1">{formatBRL(totalAmount)}</p>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="text-xs font-mono uppercase tracking-wider text-white/50">Resgatados</p>
            <p className="text-lg font-bold text-white mt-1">{redeemedCount} <span className="text-sm text-white/40">/ {order.total_tickets}</span></p>
          </div>
        </div>

        <div className="text-xs text-white/50 space-y-1">
          <p>Criado por <span className="font-mono text-white/70">{order.created_by_email}</span> em {formatDateTime(order.created_at)}</p>
          {order.payment_method && <p>Forma: <span className="font-mono text-white/70">{order.payment_method}</span></p>}
          {order.paid_at && <p>Pago em {formatDateTime(order.paid_at)}</p>}
          {order.payment_notes && <p className="text-white/60 italic">"{order.payment_notes}"</p>}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          {order.payment_status === 'pending' && (
            <button
              onClick={() => setShowConfirm(true)}
              className="px-4 py-2 rounded-lg bg-cyan text-dark text-sm font-semibold hover:bg-electric transition-colors"
            >
              Confirmar pagamento
            </button>
          )}
          {order.payment_status === 'confirmed' && activeCount > 0 && (
            <>
              <button
                onClick={copyAllActiveLinks}
                className="px-4 py-2 rounded-lg bg-electric text-white text-sm font-semibold hover:bg-cyan transition-colors"
              >
                {copyFlash === 'all' ? '✓ Copiados!' : `Copiar ${activeCount} link${activeCount > 1 ? 's' : ''} ativos`}
              </button>
              <a
                href={`mailto:${order.contact_email}?subject=${encodeURIComponent('Vouchers HackIA SC 2026 — ' + order.company_name)}&body=${buildEmailDraft()}`}
                className="px-4 py-2 rounded-lg border border-electric/40 text-electric text-sm font-semibold hover:bg-electric/10 transition-colors"
              >
                Abrir e-mail rascunho
              </a>
            </>
          )}
          <button
            onClick={downloadCSV}
            className="px-4 py-2 rounded-lg border border-white/15 text-white/70 text-sm hover:bg-white/5 transition-colors"
          >
            Baixar CSV
          </button>
          {order.payment_status !== 'cancelled' && (
            <button
              onClick={() => setShowCancel(true)}
              className="ml-auto px-4 py-2 rounded-lg border border-hot/40 text-hot text-sm hover:bg-hot/10 transition-colors"
            >
              Cancelar pedido
            </button>
          )}
        </div>
      </div>

      {/* Vouchers list */}
      <div className="card-glass rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="font-display font-semibold text-white">Vouchers</h3>
          <div className="flex gap-1">
            {[
              { id: 'all', label: `Todos (${vouchers.length})` },
              { id: 'active', label: `Ativos (${activeCount})` },
              { id: 'redeemed', label: `Resgatados (${redeemedCount})` },
              { id: 'cancelled', label: `Cancelados (${vouchers.filter(v => v.status === 'cancelled').length})` },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setFilterStatus(t.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterStatus === t.id
                    ? 'bg-cyan/20 text-cyan border border-cyan/30'
                    : 'text-white/50 hover:text-white border border-transparent'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50 text-xs uppercase tracking-wider border-b border-white/10">
                <th className="text-left py-2 px-2">Código</th>
                <th className="text-left py-2 px-2">Status</th>
                <th className="text-left py-2 px-2">Resgatado por</th>
                <th className="text-left py-2 px-2">Em</th>
                <th className="text-right py-2 px-2">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredVouchers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-white/40">Nenhum voucher nesta categoria.</td>
                </tr>
              )}
              {filteredVouchers.map(v => (
                <tr key={v.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="py-2 px-2 font-mono text-cyan">{v.code}</td>
                  <td className="py-2 px-2"><StatusBadge status={v.status} map={VOUCHER_STATUS} /></td>
                  <td className="py-2 px-2 text-white/70">
                    {v.redeemed_by_name ? (
                      <>
                        <div>{v.redeemed_by_name}</div>
                        <div className="text-xs text-white/40">{v.redeemed_by_email}</div>
                      </>
                    ) : '—'}
                  </td>
                  <td className="py-2 px-2 text-white/50 text-xs">{formatDateTime(v.redeemed_at)}</td>
                  <td className="py-2 px-2 text-right">
                    {v.status === 'active' && (
                      <div className="flex gap-1 justify-end">
                        <button
                          onClick={() => copyToClipboard(buildVoucherUrl(v.code), v.id)}
                          className="px-2 py-1 text-xs rounded border border-electric/30 text-electric hover:bg-electric/10"
                        >
                          {copyFlash === v.id ? '✓' : 'Copiar link'}
                        </button>
                        <button
                          onClick={() => handleCancelVoucher(v.id, v.code)}
                          className="px-2 py-1 text-xs rounded border border-hot/30 text-hot hover:bg-hot/10"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showConfirm && (
        <ConfirmPaymentModal
          order={order}
          onClose={() => setShowConfirm(false)}
          onConfirmed={async () => { setShowConfirm(false); await load(); onChanged?.() }}
        />
      )}

      {showCancel && (
        <ModalShell title="Cancelar pedido" onClose={() => setShowCancel(false)} maxWidth="max-w-md">
          <p className="text-sm text-white/70">
            Cancelar o pedido de <strong>{order.company_name}</strong>?
          </p>
          <p className="text-xs text-hot/80 bg-hot/10 border border-hot/20 rounded-lg p-3">
            Vouchers já resgatados continuam válidos (as inscrições não são canceladas). Vouchers ativos serão invalidados.
          </p>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCancel(false)} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white">
              Voltar
            </button>
            <button
              onClick={handleCancelOrder}
              className="px-4 py-2 rounded-lg bg-hot text-white text-sm font-semibold hover:bg-hot/80"
            >
              Confirmar cancelamento
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}

// ─── Main list view ──────────────────────────────────────────────────────────

export default function AdminBulkOrders({ readOnly = false }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: rpcError } = await supabase.rpc('admin_list_bulk_orders')
    if (rpcError) {
      setError(rpcError.message)
      setLoading(false)
      return
    }
    setOrders(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load]) // eslint-disable-line react-hooks/set-state-in-effect

  const totals = useMemo(() => {
    return orders.reduce((acc, o) => {
      const amount = o.total_tickets * o.ticket_price
      if (o.payment_status === 'confirmed') {
        acc.paidAmount += amount
        acc.paidTickets += o.total_tickets
      } else if (o.payment_status === 'pending') {
        acc.pendingAmount += amount
        acc.pendingTickets += o.total_tickets
      }
      acc.redeemedTickets += o.redeemed_count || 0
      return acc
    }, { paidAmount: 0, paidTickets: 0, pendingAmount: 0, pendingTickets: 0, redeemedTickets: 0 })
  }, [orders])

  if (selectedId) {
    return (
      <OrderDetail
        orderId={selectedId}
        onBack={() => setSelectedId(null)}
        onChanged={load}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Compras Empresariais</h2>
          <p className="text-sm text-white/60 mt-1">
            Gere vouchers para empresas que vão pagar por fora (PIX, transferência, NF). Cada voucher = 1 inscrição confirmada.
          </p>
        </div>
        {!readOnly && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-electric text-white text-sm font-semibold hover:bg-cyan transition-colors"
          >
            + Nova compra
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-white/50">Pago</p>
          <p className="text-xl font-bold text-cyan mt-1">{formatBRL(totals.paidAmount)}</p>
          <p className="text-xs text-white/40 mt-0.5">{totals.paidTickets} ingressos</p>
        </div>
        <div className="rounded-xl border border-gold/20 bg-gold/5 p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-white/50">Aguardando pagto</p>
          <p className="text-xl font-bold text-gold mt-1">{formatBRL(totals.pendingAmount)}</p>
          <p className="text-xs text-white/40 mt-0.5">{totals.pendingTickets} ingressos</p>
        </div>
        <div className="rounded-xl border border-electric/20 bg-electric/5 p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-white/50">Resgatados</p>
          <p className="text-xl font-bold text-electric mt-1">{totals.redeemedTickets}</p>
          <p className="text-xs text-white/40 mt-0.5">de {totals.paidTickets} pagos</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-white/50">Pedidos</p>
          <p className="text-xl font-bold text-white mt-1">{orders.length}</p>
          <p className="text-xs text-white/40 mt-0.5">total criados</p>
        </div>
      </div>

      {loading && <p className="text-white/50 font-mono">Carregando...</p>}
      {error && <p className="text-hot">Erro: {error}</p>}

      {!loading && orders.length === 0 && (
        <div className="card-glass rounded-2xl p-12 text-center">
          <p className="text-white/50">Nenhuma compra empresarial criada ainda.</p>
          {!readOnly && (
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-2 rounded-lg bg-electric text-white text-sm font-semibold hover:bg-cyan transition-colors"
            >
              + Criar primeira compra
            </button>
          )}
        </div>
      )}

      {orders.length > 0 && (
        <div className="card-glass rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/50 text-xs uppercase tracking-wider border-b border-white/10 bg-white/5">
                <th className="text-left py-3 px-4">Empresa</th>
                <th className="text-left py-3 px-4">Responsável</th>
                <th className="text-right py-3 px-4">Ingressos</th>
                <th className="text-right py-3 px-4">Total</th>
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-left py-3 px-4">Criado em</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr
                  key={o.id}
                  onClick={() => setSelectedId(o.id)}
                  className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="font-semibold text-white">{o.company_name}</div>
                    {o.cnpj && <div className="text-xs text-white/40 font-mono">{o.cnpj}</div>}
                  </td>
                  <td className="py-3 px-4 text-white/70">
                    <div>{o.contact_name}</div>
                    <div className="text-xs text-white/40">{o.contact_email}</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono">
                    <div className="text-white">{o.redeemed_count || 0} / {o.total_tickets}</div>
                    <div className="text-xs text-white/40">{o.active_count || 0} ativos</div>
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-white">
                    {formatBRL(o.total_tickets * o.ticket_price)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <StatusBadge status={o.payment_status} map={STATUS_BADGE} />
                  </td>
                  <td className="py-3 px-4 text-white/50 text-xs">{formatDateTime(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={async (id) => {
            setShowCreate(false)
            await load()
            setSelectedId(id)
          }}
        />
      )}
    </div>
  )
}

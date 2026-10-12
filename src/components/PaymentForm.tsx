import { useState } from 'react'
import { Modal } from './ui'
import { useData } from '../store/DataContext'
import type { PaymentMode } from '../lib/types'
import { money, toPaise, todayIso } from '../lib/format'
import { errorText } from '../lib/api'

const MODES: PaymentMode[] = ['UPI', 'Bank transfer', 'Cash', 'Cheque']

/** P1 + P8: record a full, partial or TDS payment against an open invoice. No gateway: entered by hand. */
export default function PaymentForm({ open, onClose, docId: fixedDocId, clientId: fixedClientId }: {
  open: boolean; onClose: () => void; docId?: string; clientId?: string
}) {
  const { documents, clients, summary, addPayment, clientById } = useData()
  const openInvoices = documents
    .filter((d) => d.type === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled')
    .filter((d) => !fixedClientId || d.clientId === fixedClientId)
    .map((d) => ({ d, s: summary(d) }))
    .filter((r) => r.s.balance > 0 || r.d.id === fixedDocId)

  const [docId, setDocId] = useState(fixedDocId ?? openInvoices[0]?.d.id ?? '')
  const current = openInvoices.find((r) => r.d.id === docId)
  const [amount, setAmount] = useState(current ? String(current.s.balance / 100) : '')
  const [date, setDate] = useState(todayIso())
  const [mode, setMode] = useState<PaymentMode>('UPI')
  const [reference, setReference] = useState('')
  const [isTds, setIsTds] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (saving) return
    const paise = toPaise(amount)
    if (!current) { setError('Choose an invoice'); return }
    if (paise <= 0) { setError('Enter an amount above zero'); return }
    if (paise > current.s.balance) { setError(`Amount is more than the balance of ${money(current.s.balance)}`); return }
    setSaving(true); setError('')
    try {
      await addPayment({ docId: current.d.id, amountPaise: paise, date, mode: isTds ? 'Bank transfer' : mode, reference: isTds ? `TDS deducted${reference ? ' · ' + reference : ''}` : reference, isTds })
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open} title="Record payment" onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={() => void submit()} disabled={!current || saving}>{saving ? 'Saving…' : 'Save payment'}</button></>}
    >
      {openInvoices.length === 0 ? (
        <p className="text-sm text-muted">No unpaid invoices{fixedClientId ? ' for this client' : ''}.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="field-label">Invoice</label>
            <select className="field" value={docId} disabled={!!fixedDocId} onChange={(e) => {
              setDocId(e.target.value)
              const r = openInvoices.find((x) => x.d.id === e.target.value)
              setAmount(r ? String(r.s.balance / 100) : '')
            }}>
              {!clients.length && <option />}
              {openInvoices.map(({ d, s }) => <option key={d.id} value={d.id}>{d.number} · {clientById(d.clientId)?.name} · balance {money(s.balance)}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Amount (₹)</label>
            <input className="field tnum" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))} autoFocus />
          </div>
          <div>
            <label className="field-label">Date</label>
            <input className="field tnum" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Mode</label>
            <select className="field" value={mode} disabled={isTds} onChange={(e) => setMode(e.target.value as PaymentMode)}>
              {MODES.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Reference (UTR, cheque no.)</label>
            <input className="field" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="accent-[#E9252A]" checked={isTds} onChange={(e) => setIsTds(e.target.checked)} />
            This is TDS deducted by the client (reduces the balance, not counted as cash)
          </label>
          {error && <p className="text-sm text-red-fg sm:col-span-2">{error}</p>}
        </div>
      )}
    </Modal>
  )
}

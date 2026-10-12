import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { ArrowLeft, Eye, Landmark, NotebookPen, Pencil, Plus, QrCode, Trash2, UserPlus, X } from 'lucide-react'
import { useData } from '../store/DataContext'
import ClientForm from '../components/ClientForm'
import InvoicePaper, { upiLink } from '../components/InvoicePaper'
import { Toggle } from '../components/ui'
import type { BillingDoc, DocType, LineItem, PaymentMode } from '../lib/types'
import { GST_RATES, STATES, computeTotals } from '../lib/gst'
import { addDays, money, rupeesInput, toPaise, todayIso, uid } from '../lib/format'
import { errorText } from '../lib/api'

const TITLES: Record<DocType, string> = {
  invoice: 'Create Sales Invoice', quotation: 'Create Quotation', proforma: 'Create Proforma Invoice', credit_note: 'Create Credit Note',
}
const MODES: PaymentMode[] = ['UPI', 'Bank transfer', 'Cash', 'Cheque']

function blankLine(): LineItem {
  return { id: uid('l'), description: '', sac: '', qty: 1, ratePaise: 0, discountPct: 0, gstRate: 18 }
}

export default function InvoiceEditor() {
  const { type: typeParam, id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const data = useData()
  const { company, clients, services, documents, nextNumber, saveDoc, saveClient, summary } = data

  const existing = id ? documents.find((d) => d.id === id) : undefined
  const type: DocType = existing?.type ?? ((typeParam as DocType) || 'invoice')
  const today = todayIso()

  // "Duplicate" opens the editor pre-filled from another document (?from=<id>)
  const source = params.get('from') ? documents.find((d) => d.id === params.get('from')) : undefined
  const [doc, setDoc] = useState<BillingDoc>(() => existing ?? {
    id: uid('d'), type, number: nextNumber(type, today), clientId: source?.clientId ?? params.get('client') ?? '', issueDate: today,
    linkedId: type === 'credit_note' ? params.get('invoice') ?? undefined : undefined,
    dueDate: addDays(today, 15), status: 'sent', gstEnabled: source?.gstEnabled ?? true,
    lines: source ? source.lines.map((l) => ({ ...l, id: uid('l') })) : [blankLine()],
    extraDiscountPaise: source?.extraDiscountPaise ?? 0, roundOff: source?.roundOff ?? true, notes: source?.notes ?? '',
    terms: source?.terms ?? company.defaultTerms, createdAt: new Date().toISOString(),
  })
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [showNotes, setShowNotes] = useState(!!doc.notes)
  const [showDiscount, setShowDiscount] = useState(doc.extraDiscountPaise > 0)
  const [clientOpen, setClientOpen] = useState(false)
  const [received, setReceived] = useState('')
  const [payMode, setPayMode] = useState<PaymentMode>('UPI')
  const [fullyPaid, setFullyPaid] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const client = clients.find((c) => c.id === doc.clientId)
  const interState = (client?.stateCode ?? company.stateCode) !== company.stateCode
  const totals = useMemo(() => computeTotals(doc.lines, {
    gstEnabled: doc.gstEnabled, interState, extraDiscountPaise: doc.extraDiscountPaise, roundOff: doc.roundOff,
  }), [doc.lines, doc.gstEnabled, interState, doc.extraDiscountPaise, doc.roundOff])

  const receivedPaise = fullyPaid ? totals.total : Math.min(toPaise(received), totals.total)
  const balance = totals.total - receivedPaise
  const clientInvoices = documents.filter((d) => d.type === 'invoice' && d.clientId === doc.clientId && d.status !== 'draft')

  const set = <K extends keyof BillingDoc>(k: K, v: BillingDoc[K]) => setDoc((d) => ({ ...d, [k]: v }))
  const setLine = (lid: string, patch: Partial<LineItem>) =>
    setDoc((d) => ({ ...d, lines: d.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) }))
  const pickService = (lid: string, sid: string) => {
    const s = services.find((x) => x.id === sid)
    if (!s) return setLine(lid, { serviceId: undefined })
    setLine(lid, { serviceId: s.id, description: s.name, sac: s.sac, ratePaise: s.ratePaise, gstRate: s.gstRate }) // F2
  }
  const pickClient = (cid: string) => {
    const c = clients.find((x) => x.id === cid)
    setDoc((d) => ({ ...d, clientId: cid, linkedId: undefined, dueDate: c && type === 'invoice' ? addDays(d.issueDate, c.paymentTermsDays) : d.dueDate }))
  }

  const validate = () => {
    const e: string[] = []
    if (!doc.clientId) e.push('Choose a client in Bill To')
    const filled = doc.lines.filter((l) => l.description.trim() && l.ratePaise > 0 && l.qty > 0)
    if (filled.length === 0) e.push('Add at least one item with a price')
    if (doc.lines.some((l) => (l.description.trim() || l.ratePaise) && !(l.description.trim() && l.ratePaise > 0 && l.qty > 0))) e.push('Every item needs a name, quantity and price')
    if (type === 'credit_note' && !doc.linkedId) e.push('Choose the invoice this credit note is against')
    if (type !== 'credit_note' && doc.dueDate < doc.issueDate) e.push('Due date cannot be before the invoice date')
    setErrors(e)
    return e.length === 0
  }

  const save = async (status: BillingDoc['status'], andNew = false) => {
    if (saving) return
    if (!validate()) { window.scrollTo({ top: 0, behavior: 'smooth' }); return }
    const clean = { ...doc, status, lines: doc.lines.filter((l) => l.description.trim() && l.ratePaise > 0) }
    const pay = type === 'invoice' && status === 'sent' && !existing && receivedPaise > 0 ? { amountPaise: receivedPaise, mode: payMode } : undefined
    setSaving(true)
    try {
      // The server assigns the final number (F6) and records the payment taken now, if any
      const saved = await saveDoc(clean, pay)
      if (andNew) navigate(`/new/${type}?t=${Date.now()}`, { replace: true })
      else navigate(`/documents/${saved.id}`, { replace: true })
    } catch (e) {
      setErrors([errorText(e)])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } finally {
      setSaving(false)
    }
  }

  if (existing && existing.status !== 'draft') {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="font-medium">{existing.number} is issued and locked</p>
          <p className="mt-1 text-sm text-muted">Issued documents can't be edited. Use a credit note to correct an invoice.</p>
          <button className="btn btn-outline mt-4" onClick={() => navigate(`/documents/${existing.id}`)}>Back to {existing.number}</button>
        </div>
      </div>
    )
  }

  const title = existing ? `Edit ${existing.number}` : TITLES[type]
  const isInvoice = type === 'invoice'

  return (
    <div className="min-h-full bg-canvas">
      {/* Top bar, as in MyBillBook: Exit · title · Edit/Preview · Save & New · Save */}
      <div className="no-print sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button className="btn btn-outline" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Exit</button>
        <h1 className="mr-auto text-lg font-semibold">{title}</h1>
        <div className="flex rounded-lg border border-line p-0.5 text-sm">
          <button className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${mode === 'edit' ? 'bg-brand-soft font-medium text-brand' : 'text-muted'}`} onClick={() => setMode('edit')}><Pencil size={14} /> Edit</button>
          <button className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 ${mode === 'preview' ? 'bg-brand-soft font-medium text-brand' : 'text-muted'}`} onClick={() => setMode('preview')}><Eye size={14} /> Preview</button>
        </div>
        {isInvoice && <button className="btn btn-outline" disabled={saving} onClick={() => void save('draft')}>Save draft</button>}
        {!existing && <button className="btn btn-outline" disabled={saving} onClick={() => void save('sent', true)}>Save & New</button>}
        <button className="btn btn-primary" disabled={saving} onClick={() => void save('sent')}>{saving ? 'Saving…' : existing ? 'Issue invoice' : 'Save'}</button>
      </div>

      {errors.length > 0 && (
        <div className="no-print mx-4 mt-4 rounded-xl border border-red-fg/20 bg-red-bg px-4 py-3 text-sm text-red-fg">
          {errors.map((e) => <div key={e}>• {e}</div>)}
        </div>
      )}

      {mode === 'preview' ? (
        <div className="p-4 sm:p-8">
          <InvoicePaper doc={doc} client={client} company={company} linkedNumber={documents.find((d) => d.id === doc.linkedId)?.number} />
        </div>
      ) : (
        <div className="p-4">
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {/* Bill To | Details */}
            <div className="grid md:grid-cols-2">
              <div className="border-b border-line md:border-r">
                <div className="border-b border-line px-4 py-2.5 text-xs font-medium text-muted">Bill To</div>
                <div className="p-4">
                  {client ? (
                    <div className="rounded-xl border border-line p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{client.name}</div>
                          <div className="mt-0.5 text-xs text-ink/70">{client.address}</div>
                          <div className="mt-1 text-xs text-ink/70">{client.gstin ? `GSTIN ${client.gstin} · ` : 'Unregistered · '}{STATES[client.stateCode]}</div>
                        </div>
                        <button className="btn-ghost rounded-md p-1" onClick={() => pickClient('')} aria-label="Change client"><X size={16} /></button>
                      </div>
                      <div className={`mt-2 inline-block rounded-md px-2 py-0.5 text-xs ${interState ? 'bg-blue-bg text-blue-fg' : 'bg-green-bg text-green-fg'}`}>
                        {doc.gstEnabled ? (interState ? 'Inter-state · IGST applies' : 'Same state · CGST + SGST apply') : 'Non-GST invoice'}
                      </div>
                    </div>
                  ) : (
                    <div className="dashed flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                      <select className="field" value="" onChange={(e) => pickClient(e.target.value)} aria-label="Choose client">
                        <option value="">Choose a client…</option>
                        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <button className="link-add shrink-0" onClick={() => setClientOpen(true)}><UserPlus size={16} /> New client</button>
                    </div>
                  )}
                  {type === 'credit_note' && client && (
                    <div className="mt-3">
                      <label className="field-label">Against invoice *</label>
                      <select className="field" value={doc.linkedId ?? ''} onChange={(e) => set('linkedId', e.target.value || undefined)}>
                        <option value="">Choose invoice…</option>
                        {clientInvoices.map((d) => <option key={d.id} value={d.id}>{d.number} · {money(summary(d).total)}</option>)}
                      </select>
                    </div>
                  )}
                </div>
              </div>
              <div className="border-b border-line">
                <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs font-medium text-muted">
                  <span>{type === 'quotation' ? 'Quotation' : type === 'credit_note' ? 'Credit note' : 'Invoice'} details</span>
                  <Toggle checked={doc.gstEnabled} onChange={(v) => set('gstEnabled', v)} label="GST invoice" />
                </div>
                <div className="grid gap-3 p-4 sm:grid-cols-2">
                  <div>
                    <label className="field-label">Number</label>
                    <input className="field tnum bg-subtle" value={doc.number} readOnly title="Assigned in sequence when you save. Cannot be edited." />
                  </div>
                  <div>
                    <label className="field-label">Date</label>
                    <input className="field tnum" type="date" value={doc.issueDate} onChange={(e) => {
                      const v = e.target.value
                      setDoc((d) => ({ ...d, issueDate: v, number: existing ? d.number : nextNumber(type, v), dueDate: client && isInvoice ? addDays(v, client.paymentTermsDays) : d.dueDate }))
                    }} />
                  </div>
                  {type !== 'credit_note' && (
                    <div className="sm:col-span-2">
                      <label className="field-label">{type === 'quotation' ? 'Valid till' : 'Due date'}</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input className="field tnum max-w-[180px]" type="date" value={doc.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
                        {[7, 15, 30, 45].map((n) => (
                          <button key={n} className={`rounded-full border px-2.5 py-1 text-xs ${doc.dueDate === addDays(doc.issueDate, n) ? 'border-brand bg-brand-soft text-brand' : 'border-line text-ink/70 hover:border-line-strong'}`} onClick={() => set('dueDate', addDays(doc.issueDate, n))}>{n} days</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Items table */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle text-left text-[11px] uppercase tracking-wide text-muted">
                    <th className="w-10 px-3 py-2.5 font-medium">No</th>
                    <th className="px-3 py-2.5 font-medium">Items</th>
                    <th className="w-28 px-3 py-2.5 font-medium">SAC</th>
                    <th className="w-20 px-3 py-2.5 font-medium">Qty</th>
                    <th className="w-32 px-3 py-2.5 font-medium">Price/item (₹)</th>
                    <th className="w-24 px-3 py-2.5 font-medium">Disc. %</th>
                    {doc.gstEnabled && <th className="w-24 px-3 py-2.5 font-medium">Tax</th>}
                    <th className="w-32 px-3 py-2.5 text-right font-medium">Amount (₹)</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((l, i) => (
                    <tr key={l.id} className="border-b border-line align-top">
                      <td className="px-3 py-3 text-muted">{i + 1}</td>
                      <td className="px-3 py-2">
                        <select className="field mb-1.5" value={l.serviceId ?? ''} onChange={(e) => pickService(l.id, e.target.value)} aria-label="Service">
                          <option value="">Custom item</option>
                          {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <input className="field" placeholder="Description" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} />
                      </td>
                      <td className="px-3 py-2"><input className="field tnum" value={l.sac} onChange={(e) => setLine(l.id, { sac: e.target.value.replace(/\D/g, '').slice(0, 8) })} /></td>
                      <td className="px-3 py-2"><input className="field tnum" type="number" min={0} step="any" value={l.qty} onChange={(e) => setLine(l.id, { qty: Math.max(0, parseFloat(e.target.value) || 0) })} /></td>
                      <td className="px-3 py-2"><input className="field tnum" inputMode="decimal" value={rupeesInput(l.ratePaise)} placeholder="0" onChange={(e) => setLine(l.id, { ratePaise: toPaise(e.target.value.replace(/[^\d.]/g, '')) })} /></td>
                      <td className="px-3 py-2"><input className="field tnum" type="number" min={0} max={100} value={l.discountPct || ''} placeholder="0" onChange={(e) => setLine(l.id, { discountPct: Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) })} /></td>
                      {doc.gstEnabled && (
                        <td className="px-3 py-2">
                          <select className="field tnum" value={l.gstRate} onChange={(e) => setLine(l.id, { gstRate: parseInt(e.target.value, 10) })}>
                            {GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                      )}
                      <td className="tnum px-3 py-3 text-right font-medium">{money(totals.lineAmounts[i])}</td>
                      <td className="px-2 py-2.5">
                        <button className="btn-ghost rounded-md p-1.5 text-muted hover:text-red-fg" onClick={() => setDoc((d) => ({ ...d, lines: d.lines.length > 1 ? d.lines.filter((x) => x.id !== l.id) : [blankLine()] }))} aria-label="Remove item"><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-b border-line p-3">
              <button className="dashed flex w-full items-center justify-center gap-2 py-2.5 text-sm font-medium text-brand hover:bg-brand-soft" onClick={() => setDoc((d) => ({ ...d, lines: [...d.lines, blankLine()] }))}>
                <Plus size={16} /> Add Item
              </button>
            </div>
            <div className="flex justify-end gap-8 border-b border-line bg-subtle px-6 py-2.5 text-sm">
              <span className="font-medium">Subtotal</span>
              <span className="tnum w-32 text-right font-medium">{money(totals.subtotal)}</span>
            </div>

            {/* Notes, terms, bank | totals panel */}
            <div className="grid md:grid-cols-2">
              <div className="divide-y divide-line border-b border-line md:border-b-0 md:border-r">
                <div className="p-4">
                  {showNotes ? (
                    <><label className="field-label">Notes</label><textarea className="field" rows={2} value={doc.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Shown on the invoice, e.g. campaign period or PO number" /></>
                  ) : <button className="link-add" onClick={() => setShowNotes(true)}><NotebookPen size={16} /> Add Notes</button>}
                </div>
                <div className="p-4">
                  <label className="field-label">Terms & Conditions</label>
                  <textarea className="field" rows={3} value={doc.terms} onChange={(e) => set('terms', e.target.value)} />
                </div>
                <div className="flex items-start gap-3 p-4 text-sm">
                  <Landmark size={18} className="mt-0.5 text-brand" />
                  <div><div className="font-medium">{company.bankName} · A/c {company.accountNumber}</div><div className="text-xs text-muted">IFSC {company.ifsc} · change in Settings</div></div>
                </div>
                {type !== 'credit_note' && (
                  <div className="flex items-center gap-4 p-4 text-sm">
                    {company.qrImage
                      ? <img src={company.qrImage} alt="Payment QR code" className="h-16 w-16 rounded bg-white object-contain p-0.5" />
                      : totals.total > 0 && company.upiId ? <QRCodeSVG value={upiLink(company, totals.total, doc.number)} size={64} /> : <div className="grid h-16 w-16 place-items-center rounded-lg bg-subtle-2 text-muted"><QrCode size={22} /></div>}
                    <div><div className="font-medium">Payment QR</div><div className="text-xs text-muted">{company.qrImage ? 'Your uploaded QR code' : company.upiId ? `UPI ${company.upiId}, with the exact amount` : 'Add a UPI ID or QR in Settings'} · printed on the invoice.</div></div>
                  </div>
                )}
              </div>

              <div className="text-sm">
                <div className="space-y-2.5 p-4">
                  {showDiscount ? (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-ink/70">Discount (₹)</span>
                      <input className="field tnum w-36 text-right" inputMode="decimal" value={rupeesInput(doc.extraDiscountPaise)} placeholder="0" onChange={(e) => set('extraDiscountPaise', toPaise(e.target.value.replace(/[^\d.]/g, '')))} />
                    </div>
                  ) : <button className="link-add" onClick={() => setShowDiscount(true)}><Plus size={16} /> Add Discount</button>}
                  <div className="flex justify-between"><span className="font-medium">Taxable Amount</span><span className="tnum">{money(totals.taxable)}</span></div>
                  {doc.gstEnabled && (interState
                    ? <div className="flex justify-between text-ink/70"><span>IGST</span><span className="tnum">{money(totals.igst)}</span></div>
                    : <><div className="flex justify-between text-ink/70"><span>CGST</span><span className="tnum">{money(totals.cgst)}</span></div>
                      <div className="flex justify-between text-ink/70"><span>SGST</span><span className="tnum">{money(totals.sgst)}</span></div></>)}
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="flex items-center gap-2"><input type="checkbox" className="accent-[#E9252A]" checked={doc.roundOff} onChange={(e) => set('roundOff', e.target.checked)} /> Auto round off</span>
                    <span className="tnum text-ink/70">{totals.roundOff ? `${totals.roundOff > 0 ? '+' : '-'}${money(Math.abs(totals.roundOff))}` : money(0)}</span>
                  </label>
                </div>
                <div className="flex items-center justify-between border-y border-line bg-subtle px-4 py-3.5">
                  <span className="text-lg font-semibold">Total Amount</span>
                  <span className="tnum text-xl font-semibold">{money(totals.total)}</span>
                </div>
                {isInvoice && !existing && (
                  <div className="space-y-3 p-4">
                    <div className="text-ink/70">Amount received now</div>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">₹</span>
                        <input className="field tnum pl-7" inputMode="decimal" placeholder="0" disabled={fullyPaid} value={fullyPaid ? rupeesInput(totals.total) : received} onChange={(e) => setReceived(e.target.value.replace(/[^\d.]/g, ''))} />
                      </div>
                      <select className="field w-36" value={payMode} onChange={(e) => setPayMode(e.target.value as PaymentMode)}>
                        {MODES.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-[#E9252A]" checked={fullyPaid} onChange={(e) => setFullyPaid(e.target.checked)} /> Mark as fully paid</label>
                  </div>
                )}
                {isInvoice && (
                  <div className="flex justify-between border-t border-line px-4 py-3 font-medium text-green-fg">
                    <span>Balance Amount</span><span className="tnum">{money(existing ? summary(existing).balance : balance)}</span>
                  </div>
                )}
                <div className="flex justify-end p-4">
                  <div className="dashed grid h-24 w-48 place-items-center p-2 text-center text-xs text-muted">
                    {company.signature ? <img src={company.signature} alt="Authorised signature" className="h-12 max-w-[160px] object-contain" /> : null}
                    <span>Authorised signatory<br />For {company.name}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <ClientForm
        key={clientOpen ? 'open' : 'closed'}
        open={clientOpen} onClose={() => setClientOpen(false)}
        onSave={async (c) => {
          const saved = await saveClient(c)
          setClientOpen(false)
          setDoc((d) => ({ ...d, clientId: saved.id, dueDate: type === 'invoice' ? addDays(d.issueDate, saved.paymentTermsDays) : d.dueDate }))
        }}
      />
    </div>
  )
}

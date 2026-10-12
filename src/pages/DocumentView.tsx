import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Ban, CheckCircle2, Copy, FileCheck2, Mail, MessageCircle, Pencil, Printer, Send, Undo2, Wallet, XCircle,
} from 'lucide-react'
import { useData } from '../store/DataContext'
import InvoicePaper from '../components/InvoicePaper'
import PaymentForm from '../components/PaymentForm'
import { Card, Empty, StatusChip } from '../components/ui'
import { fmtDate, money } from '../lib/format'
import { errorText } from '../lib/api'

const LABEL = { invoice: 'Invoice', quotation: 'Quotation', proforma: 'Proforma invoice', credit_note: 'Credit note' }

export default function DocumentView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { documents, payments, reminders, company, clientById, summary, setDocStatus, convertToInvoice, logReminder } = useData()
  const [payOpen, setPayOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')

  /** Runs a server action, shows its error on the page if it fails. */
  const run = async (fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true); setActionError('')
    try { await fn() } catch (e) { setActionError(errorText(e)) } finally { setBusy(false) }
  }

  const doc = documents.find((d) => d.id === id)
  if (!doc) return <Empty title="Document not found" action={<Link className="btn btn-outline" to="/invoices">Back to invoices</Link>} />

  const client = clientById(doc.clientId)
  const s = summary(doc)
  const linked = documents.find((d) => d.id === doc.linkedId)
  const docPayments = payments.filter((p) => p.docId === doc.id)
  const docReminders = reminders.filter((r) => r.docId === doc.id)
  const isInvoice = doc.type === 'invoice'
  const live = doc.status !== 'draft' && doc.status !== 'cancelled'

  // P5: reminder text with the amount, due date and Adlogues' UPI ID
  const message = isInvoice
    ? `Hello ${client?.contactPerson || client?.name},\n\nThis is a reminder from ${company.name} for invoice ${doc.number} dated ${fmtDate(doc.issueDate)}. Balance due: ${money(s.balance)}${s.daysOverdue ? ` (due on ${fmtDate(doc.dueDate)}, ${s.daysOverdue} days ago)` : `, due on ${fmtDate(doc.dueDate)}`}.\n\nPay by UPI to ${company.upiId}, or bank transfer to A/c ${company.accountNumber} (IFSC ${company.ifsc}).\n\nThank you,\n${company.name}`
    : `Hello ${client?.contactPerson || client?.name},\n\nPlease find ${LABEL[doc.type].toLowerCase()} ${doc.number} from ${company.name} for ${money(s.total)}${doc.type === 'quotation' ? `, valid till ${fmtDate(doc.dueDate)}` : ''}.\n\nThank you,\n${company.name}`

  const whatsapp = () => {
    const phone = client?.phone ? `91${client.phone}` : ''
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')
    if (isInvoice) void logReminder(doc.id, 'WhatsApp').catch(() => {})
  }
  const email = () => {
    const subject = isInvoice ? `Payment reminder: ${doc.number}` : `${LABEL[doc.type]} ${doc.number} from ${company.name}`
    window.location.href = `mailto:${client?.email ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
    if (isInvoice) void logReminder(doc.id, 'Email').catch(() => {})
  }
  const copyText = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  const duplicate = () => navigate(`/new/${doc.type}?from=${doc.id}`)
  const convert = () => run(async () => { const inv = await convertToInvoice(doc.id); navigate(`/documents/${inv.id}`) })

  return (
    <div className="mx-auto max-w-7xl p-4 lg:p-8">
      <div className="no-print mb-5 flex flex-wrap items-center gap-3">
        <button className="btn btn-outline" onClick={() => navigate(doc.type === 'quotation' || doc.type === 'proforma' ? '/quotations' : '/invoices')}><ArrowLeft size={16} /> Back</button>
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h1 className="tnum text-xl font-semibold">{doc.number}</h1>
            <StatusChip status={s.status} type={doc.type} />
          </div>
          <p className="text-sm text-muted">{LABEL[doc.type]} · {client?.name}</p>
        </div>
        <button className="btn btn-outline" onClick={() => window.print()}><Printer size={16} /> Print / PDF</button>
        {doc.status === 'draft' && <button className="btn btn-outline" onClick={() => navigate(`/documents/${doc.id}/edit`)}><Pencil size={16} /> Edit</button>}
        {doc.status === 'draft' && <button className="btn btn-primary" disabled={busy} onClick={() => run(() => setDocStatus(doc.id, 'sent'))}><Send size={16} /> Issue invoice</button>}
        {isInvoice && live && s.balance > 0 && <button className="btn btn-primary" onClick={() => setPayOpen(true)}><Wallet size={16} /> Record payment</button>}
        {doc.type === 'quotation' && doc.status === 'sent' && (
          <button className="btn btn-primary" disabled={busy} onClick={convert}><FileCheck2 size={16} /> Convert to invoice</button>
        )}
      </div>

      {actionError && <div className="no-print mb-4 rounded-xl border border-red-fg/20 bg-red-bg px-4 py-3 text-sm text-red-fg" role="alert">{actionError}</div>}

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="overflow-x-auto">
          <InvoicePaper doc={doc} client={client} company={company} balancePaise={isInvoice && live ? s.balance : undefined} linkedNumber={linked?.number} />
        </div>

        <div className="no-print space-y-4">
          {isInvoice && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-blue-bg p-4"><div className="text-xs text-black/60">Total</div><div className="tnum mt-1 font-semibold">{money(s.total)}</div></div>
              <div className={`rounded-2xl p-4 ${s.balance === 0 ? 'bg-green-bg' : s.status === 'overdue' ? 'bg-red-bg' : 'bg-yellow-bg'}`}>
                <div className="text-xs text-black/60">Balance</div><div className="tnum mt-1 font-semibold">{money(s.balance)}</div>
              </div>
            </div>
          )}

          {live && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold">{isInvoice && s.balance > 0 ? 'Send reminder' : 'Share'}</h2>
              <p className="mt-1 text-xs text-muted">Opens WhatsApp or your email app with the message filled in. Automatic sending comes in Phase 4.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn btn-outline" onClick={whatsapp}><MessageCircle size={16} className="text-green-fg" /> WhatsApp</button>
                <button className="btn btn-outline" onClick={email}><Mail size={16} className="text-blue-fg" /> Email</button>
              </div>
              <button className="link-add mt-3" onClick={copyText}><Copy size={14} /> {copied ? 'Copied' : 'Copy message'}</button>
            </Card>
          )}

          {doc.type === 'quotation' && doc.status === 'sent' && (
            <Card className="p-4">
              <h2 className="text-sm font-semibold">Client's reply</h2>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button className="btn btn-outline" disabled={busy} onClick={convert}><CheckCircle2 size={16} className="text-green-fg" /> Accepted</button>
                <button className="btn btn-outline" disabled={busy} onClick={() => run(() => setDocStatus(doc.id, 'rejected'))}><XCircle size={16} className="text-red-fg" /> Rejected</button>
              </div>
            </Card>
          )}

          {linked && (
            <Card className="p-4 text-sm">
              <span className="text-muted">{doc.type === 'quotation' ? 'Converted to ' : doc.type === 'credit_note' ? 'Against ' : 'From '}</span>
              <Link to={`/documents/${linked.id}`} className="font-medium text-brand hover:underline">{linked.number}</Link>
            </Card>
          )}

          {isInvoice && live && (
            <Card>
              <div className="border-b border-line px-4 py-3 text-sm font-semibold">Payments</div>
              {docPayments.length === 0 ? <p className="px-4 py-4 text-sm text-muted">No payments yet.</p> : (
                <ul className="divide-y divide-line">
                  {docPayments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div><div className="font-medium">{p.isTds ? 'TDS deducted' : p.mode}</div><div className="text-xs text-muted">{fmtDate(p.date)}{p.reference ? ` · ${p.reference}` : ''}</div></div>
                      <span className="tnum font-medium text-green-fg">{money(p.amountPaise)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {isInvoice && docReminders.length > 0 && (
            <Card>
              <div className="border-b border-line px-4 py-3 text-sm font-semibold">Reminder log</div>
              <ul className="divide-y divide-line">
                {docReminders.map((r) => (
                  <li key={r.id} className="flex justify-between px-4 py-2.5 text-sm">
                    <span>{r.channel}</span>
                    <span className="text-muted">{fmtDate(r.sentAt.slice(0, 10))} · {r.sentBy}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="p-2">
            {doc.type !== 'credit_note' && <button className="btn btn-ghost w-full justify-start" onClick={duplicate}><Copy size={16} /> Duplicate</button>}
            {isInvoice && live && (
              <button className="btn btn-ghost w-full justify-start" onClick={() => navigate(`/new/credit_note?client=${doc.clientId}&invoice=${doc.id}`)}><Undo2 size={16} /> Create credit note</button>
            )}
            {doc.status !== 'cancelled' && doc.status !== 'converted' && s.paid === 0 && (
              <button className="btn btn-ghost w-full justify-start text-red-fg" disabled={busy} onClick={() => { if (confirm(`Cancel ${doc.number}? The number stays used and cannot be re-issued.`)) void run(() => setDocStatus(doc.id, 'cancelled')) }}><Ban size={16} /> Cancel {LABEL[doc.type].toLowerCase()}</button>
            )}
          </Card>
        </div>
      </div>

      <PaymentForm key={payOpen ? 'open' : 'closed'} open={payOpen} onClose={() => setPayOpen(false)} docId={doc.id} />
    </div>
  )
}

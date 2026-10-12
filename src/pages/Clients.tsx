import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2, Wallet } from 'lucide-react'
import { useData } from '../store/DataContext'
import ClientForm from '../components/ClientForm'
import PaymentForm from '../components/PaymentForm'
import { Card, Chip, Empty, Modal, PageHeader, StatCard, StatusChip } from '../components/ui'
import { STATES } from '../lib/gst'
import { fmtDate, initials, money } from '../lib/format'
import { errorText } from '../lib/api'
import type { Client } from '../lib/types'

/** Confirms and deletes a client, listing exactly what goes with it. */
function DeleteClientModal({ client, onClose, onDeleted }: { client: Client | null; onClose: () => void; onDeleted: () => void }) {
  const { documents, payments, deleteClient } = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!client) return null
  const docs = documents.filter((d) => d.clientId === client.id)
  const count = (t: string) => docs.filter((d) => d.type === t).length
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
  const items = [
    count('invoice') && plural(count('invoice'), 'invoice', 'invoices'),
    count('quotation') && plural(count('quotation'), 'quotation', 'quotations'),
    count('proforma') && plural(count('proforma'), 'proforma invoice', 'proforma invoices'),
    count('credit_note') && plural(count('credit_note'), 'credit note', 'credit notes'),
  ].filter(Boolean) as string[]
  const pays = payments.filter((p) => docs.some((d) => d.id === p.docId))
  const paidTotal = pays.reduce((a, p) => a + p.amountPaise, 0)
  const remove = async () => {
    setBusy(true); setError('')
    try { await deleteClient(client.id); onDeleted() } catch (e) { setError(errorText(e)); setBusy(false) }
  }
  return (
    <Modal open title={`Delete ${client.name}?`} onClose={busy ? () => {} : onClose}
      footer={<>
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn bg-red-fg text-white hover:bg-[#a3171a]" onClick={() => void remove()} disabled={busy}><Trash2 size={16} /> {busy ? 'Deleting…' : 'Delete client'}</button>
      </>}>
      {docs.length === 0 ? (
        <p className="text-sm">This client has no invoices or quotations. It will be removed permanently.</p>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex gap-3 rounded-xl bg-red-bg p-3 text-red-fg">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" />
            <p>This also permanently deletes everything recorded for this client. It cannot be undone.</p>
          </div>
          <ul className="space-y-1 pl-1">
            {items.map((t) => <li key={t}>• {t}</li>)}
            {pays.length > 0 && <li>• {pays.length} payment record{pays.length === 1 ? '' : 's'} ({money(paidTotal)})</li>}
          </ul>
          <p className="text-muted">Use this for test or duplicate clients. For real invoices you have already issued, keep the client for your GST records.</p>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-fg" role="alert">{error}</p>}
    </Modal>
  )
}

function useClientBalances() {
  const { documents, summary } = useData()
  return (clientId: string) => {
    const inv = documents.filter((d) => d.clientId === clientId && d.type === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled')
    const rows = inv.map((d) => summary(d))
    return {
      billed: rows.reduce((a, s) => a + s.total, 0),
      balance: rows.reduce((a, s) => a + s.balance, 0),
      overdue: rows.filter((s) => s.status === 'overdue').reduce((a, s) => a + s.balance, 0),
      count: inv.length,
    }
  }
}

export function ClientsList() {
  const { clients, saveClient } = useData()
  const balances = useClientBalances()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [toDelete, setToDelete] = useState<Client | null>(null)
  const formOpen = params.get('new') === '1'
  const rows = clients
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.gstin.toLowerCase().includes(q.toLowerCase()))
    .map((c) => ({ c, b: balances(c.id) }))
    .sort((a, b) => b.b.balance - a.b.balance)

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <PageHeader title="Clients" subtitle="Who you bill, and what each owes" actions={<button className="btn btn-primary" onClick={() => setParams({ new: '1' })}><Plus size={16} /> Create client</button>} />
      <Card>
        <div className="border-b border-line p-3">
          <div className="relative sm:w-80">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field pl-9" placeholder="Search name or GSTIN" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {rows.length === 0 ? <Empty title="No clients found" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">GSTIN · State</th>
                  <th className="px-4 py-2.5 font-medium">Terms</th>
                  <th className="px-4 py-2.5 text-right font-medium">Billed</th>
                  <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, b }) => (
                  <tr key={c.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-neutral-50" onClick={() => navigate(`/clients/${c.id}`)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-violet-bg text-xs font-semibold text-violet-fg">{initials(c.name)}</div>
                        <div><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{c.contactPerson}</div></div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="tnum">{c.gstin || <span className="text-muted">Unregistered</span>}</div><div className="text-xs text-muted">{STATES[c.stateCode]}</div></td>
                    <td className="px-4 py-3 text-black/70">{c.paymentTermsDays} days</td>
                    <td className="tnum px-4 py-3 text-right">{money(b.billed, { compact: true })}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="tnum font-medium">{money(b.balance, { compact: true })}</div>
                      {b.overdue > 0 && <div className="mt-0.5"><Chip tone="red">{money(b.overdue, { compact: true })} overdue</Chip></div>}
                    </td>
                    <td className="px-2 py-3">
                      <button className="btn-ghost rounded-md p-1.5 text-muted hover:text-red-fg" aria-label={`Delete ${c.name}`} title="Delete client"
                        onClick={(e) => { e.stopPropagation(); setToDelete(c) }}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <DeleteClientModal key={toDelete?.id ?? 'none'} client={toDelete} onClose={() => setToDelete(null)} onDeleted={() => setToDelete(null)} />
      <ClientForm key={formOpen ? 'o' : 'c'} open={formOpen} onClose={() => setParams({})} onSave={async (c) => { const saved = await saveClient(c); setParams({}); navigate(`/clients/${saved.id}`) }} />
    </div>
  )
}

/** P3: client ledger with running balance. */
export function ClientLedger() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { clientById, documents, payments, summary, saveClient, company } = useData()
  const balances = useClientBalances()
  const [edit, setEdit] = useState(false)
  const [pay, setPay] = useState(false)
  const [del, setDel] = useState(false)
  const client = id ? clientById(id) : undefined
  if (!client) return <Empty title="Client not found" action={<Link className="btn btn-outline" to="/clients">Back to clients</Link>} />

  const b = balances(client.id)
  const docs = documents.filter((d) => d.clientId === client.id && (d.type === 'invoice' || d.type === 'credit_note') && d.status !== 'draft' && d.status !== 'cancelled')
  type Entry = { date: string; key: string; label: string; ref: string; link?: string; debit: number; credit: number }
  const entries: Entry[] = [
    ...docs.map((d) => ({
      date: d.issueDate, key: d.id, label: d.type === 'invoice' ? 'Invoice' : 'Credit note', ref: d.number, link: `/documents/${d.id}`,
      debit: d.type === 'invoice' ? summary(d).total : 0, credit: d.type === 'credit_note' ? summary(d).total : 0,
    })),
    ...payments.filter((p) => p.clientId === client.id).map((p) => ({
      date: p.date, key: p.id, label: p.isTds ? 'TDS deducted' : `Payment · ${p.mode}`,
      ref: documents.find((d) => d.id === p.docId)?.number ?? '', debit: 0, credit: p.amountPaise,
    })),
  ].sort((a, c) => a.date.localeCompare(c.date) || (a.debit ? -1 : 1))
  let running = 0
  const withBalance = entries.map((e) => { running += e.debit - e.credit; return { ...e, balance: running } })

  const quotes = documents.filter((d) => d.clientId === client.id && (d.type === 'quotation' || d.type === 'proforma'))
  const statement = `Hello ${client.contactPerson || client.name}, your outstanding balance with ${company.name} is ${money(b.balance)}${b.overdue ? `, of which ${money(b.overdue)} is overdue` : ''}. UPI: ${company.upiId}. Thank you.`

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <button className="btn btn-outline mb-5" onClick={() => navigate('/clients')}><ArrowLeft size={16} /> Clients</button>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-violet-bg text-lg font-semibold text-violet-fg">{initials(client.name)}</div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{client.name}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
              <span className="tnum">{client.gstin || 'Unregistered'} · {STATES[client.stateCode]}</span>
              {client.phone && <span className="flex items-center gap-1"><Phone size={13} />{client.phone}</span>}
              {client.email && <span className="flex items-center gap-1"><Mail size={13} />{client.email}</span>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-outline" onClick={() => setEdit(true)}><Pencil size={16} /> Edit</button>
          <button className="btn btn-outline text-red-fg" onClick={() => setDel(true)}><Trash2 size={16} /> Delete</button>
          {b.balance > 0 && <a className="btn btn-outline" target="_blank" rel="noopener" href={`https://wa.me/${client.phone ? '91' + client.phone : ''}?text=${encodeURIComponent(statement)}`}><MessageCircle size={16} className="text-green-fg" /> Send statement</a>}
          {b.balance > 0 && <button className="btn btn-outline" onClick={() => setPay(true)}><Wallet size={16} /> Record payment</button>}
          <button className="btn btn-primary" onClick={() => navigate(`/new/invoice?client=${client.id}`)}><Plus size={16} /> New invoice</button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard tone="blue" label="Total billed" value={money(b.billed, { compact: true })} hint={`${b.count} invoices`} />
        <StatCard tone={b.balance ? 'yellow' : 'green'} label="Balance" value={money(b.balance, { compact: true })} hint={`Payment terms ${client.paymentTermsDays} days`} />
        <StatCard tone={b.overdue ? 'red' : 'green'} label="Overdue" value={money(b.overdue, { compact: true })} hint={b.overdue ? 'Needs a reminder' : 'Nothing overdue'} />
      </div>

      <Card className="mt-6">
        <div className="border-b border-line px-5 py-4 font-semibold">Ledger</div>
        {withBalance.length === 0 ? <Empty title="No transactions yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Entry</th>
                  <th className="px-5 py-2.5 font-medium">Reference</th>
                  <th className="px-5 py-2.5 text-right font-medium">Debit</th>
                  <th className="px-5 py-2.5 text-right font-medium">Credit</th>
                  <th className="px-5 py-2.5 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {withBalance.map((e) => (
                  <tr key={e.key} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 text-black/70">{fmtDate(e.date)}</td>
                    <td className="px-5 py-3">{e.label}</td>
                    <td className="tnum px-5 py-3">{e.link ? <Link className="text-brand hover:underline" to={e.link}>{e.ref}</Link> : e.ref}</td>
                    <td className="tnum px-5 py-3 text-right">{e.debit ? money(e.debit) : ''}</td>
                    <td className="tnum px-5 py-3 text-right text-green-fg">{e.credit ? money(e.credit) : ''}</td>
                    <td className="tnum px-5 py-3 text-right font-medium">{money(e.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {quotes.length > 0 && (
        <Card className="mt-6">
          <div className="border-b border-line px-5 py-4 font-semibold">Quotations</div>
          <ul className="divide-y divide-line">
            {quotes.map((d) => (
              <li key={d.id}><Link to={`/documents/${d.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-neutral-50">
                <span className="tnum font-medium">{d.number}</span><span className="text-muted">{fmtDate(d.issueDate)}</span>
                <span className="tnum">{money(summary(d).total)}</span><StatusChip status={summary(d).status} type={d.type} />
              </Link></li>
            ))}
          </ul>
        </Card>
      )}

      {del && <DeleteClientModal client={client} onClose={() => setDel(false)} onDeleted={() => navigate('/clients', { replace: true })} />}
      <ClientForm key={edit ? 'e' : 'x'} open={edit} initial={client} onClose={() => setEdit(false)} onSave={async (c) => { await saveClient(c); setEdit(false) }} />
      <PaymentForm key={pay ? 'p' : 'q'} open={pay} onClose={() => setPay(false)} clientId={client.id} />
    </div>
  )
}

import { Link, useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowRight, BellRing, CalendarClock, FileSignature, Plus, Wallet } from 'lucide-react'
import { useData } from '../store/DataContext'
import { Card, PageHeader, StatCard, StatusChip } from '../components/ui'
import { fmtDate, money, todayIso } from '../lib/format'

export default function Dashboard() {
  const { documents, payments, summary, clientById } = useData()
  const navigate = useNavigate()
  const today = todayIso()
  const month = today.slice(0, 7)

  const invoices = documents.filter((d) => d.type === 'invoice' && d.status !== 'draft' && d.status !== 'cancelled')
  const rows = invoices.map((d) => ({ doc: d, s: summary(d) }))
  const open = rows.filter((r) => r.s.balance > 0)
  const outstanding = open.reduce((a, r) => a + r.s.balance, 0)
  const overdue = open.filter((r) => r.s.status === 'overdue')
  const overdueTotal = overdue.reduce((a, r) => a + r.s.balance, 0)
  const collected = payments.filter((p) => p.date.startsWith(month)).reduce((a, p) => a + p.amountPaise, 0)
  const quotes = documents.filter((d) => d.type === 'quotation' && d.status === 'sent')
  const quoteTotal = quotes.reduce((a, q) => a + summary(q).total, 0)

  // P4: ageing by days past due
  const buckets = [
    { label: 'Not yet due', tone: 'bg-blue-fg', amount: 0 },
    { label: '1–30 days', tone: 'bg-yellow-fg', amount: 0 },
    { label: '31–60 days', tone: 'bg-pink-fg', amount: 0 },
    { label: '61+ days', tone: 'bg-red-fg', amount: 0 },
  ]
  open.forEach((r) => {
    const d = r.s.daysOverdue
    const i = d === 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : 3
    buckets[i].amount += r.s.balance
  })
  const maxBucket = Math.max(...buckets.map((b) => b.amount), 1)

  const dueSoon = open
    .filter((r) => r.s.status !== 'overdue')
    .sort((a, b) => a.doc.dueDate.localeCompare(b.doc.dueDate))
    .slice(0, 4)

  const recent = [...documents.filter((d) => d.type === 'invoice')]
    .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number))
    .slice(0, 6)

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <PageHeader
        title="Dashboard"
        subtitle={`${new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}`}
        actions={<>
          <button className="btn btn-outline" onClick={() => navigate('/new/quotation')}><FileSignature size={16} /> New quotation</button>
          <button className="btn btn-primary" onClick={() => navigate('/new/invoice')}><Plus size={16} /> New invoice</button>
        </>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="blue" label="Total outstanding" value={money(outstanding, { compact: true })} hint={`${open.length} unpaid invoices`} icon={<Wallet size={18} />} />
        <StatCard tone="red" label="Overdue" value={money(overdueTotal, { compact: true })} hint={`${overdue.length} invoices past due`} icon={<AlertCircle size={18} />} />
        <StatCard tone="green" label="Collected this month" value={money(collected, { compact: true })} hint={`${payments.filter((p) => p.date.startsWith(month)).length} payments received`} icon={<Wallet size={18} />} />
        <StatCard tone="violet" label="Open quotations" value={money(quoteTotal, { compact: true })} hint={`${quotes.length} awaiting a reply`} icon={<FileSignature size={18} />} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="p-5 xl:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Receivables ageing</h2>
            <span className="tnum text-sm text-muted">{money(outstanding)} open</span>
          </div>
          <div className="mt-5 space-y-4">
            {buckets.map((b) => (
              <div key={b.label} className="grid grid-cols-[96px_1fr_110px] items-center gap-3 text-sm">
                <span className="text-black/70">{b.label}</span>
                <div className="h-2.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className={`h-full rounded-full ${b.tone}`} style={{ width: `${(b.amount / maxBucket) * 100}%` }} />
                </div>
                <span className="tnum text-right font-medium">{money(b.amount, { compact: true })}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-yellow-fg" />
            <h2 className="font-semibold">Due soon</h2>
          </div>
          <ul className="mt-4 space-y-2">
            {dueSoon.length === 0 && <li className="text-sm text-muted">Nothing due in the coming days.</li>}
            {dueSoon.map((r) => (
              <li key={r.doc.id}>
                <Link to={`/documents/${r.doc.id}`} className="flex items-center justify-between rounded-xl bg-yellow-bg px-3 py-2.5 hover:brightness-[0.98]">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{clientById(r.doc.clientId)?.name}</div>
                    <div className="text-xs text-black/60">Due {fmtDate(r.doc.dueDate)}</div>
                  </div>
                  <span className="tnum text-sm font-semibold">{money(r.s.balance, { compact: true })}</span>
                </Link>
              </li>
            ))}
          </ul>
          {overdue.length > 0 && (
            <Link to="/invoices?filter=overdue" className="mt-4 flex items-center justify-between rounded-xl bg-pink-bg px-3 py-2.5 text-sm text-pink-fg">
              <span className="flex items-center gap-2"><BellRing size={16} /> {overdue.length} overdue need a reminder</span>
              <ArrowRight size={16} />
            </Link>
          )}
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex items-center justify-between px-5 pt-5">
          <h2 className="font-semibold">Recent invoices</h2>
          <Link to="/invoices" className="link-add">View all <ArrowRight size={15} /></Link>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-5 py-2.5 font-medium">Invoice</th>
                <th className="px-5 py-2.5 font-medium">Client</th>
                <th className="px-5 py-2.5 font-medium">Date</th>
                <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                <th className="px-5 py-2.5 text-right font-medium">Balance</th>
                <th className="px-5 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((d) => {
                const s = summary(d)
                return (
                  <tr key={d.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-neutral-50" onClick={() => navigate(`/documents/${d.id}`)}>
                    <td className="tnum px-5 py-3 font-medium">{d.number}</td>
                    <td className="px-5 py-3">{clientById(d.clientId)?.name}</td>
                    <td className="px-5 py-3 text-black/70">{fmtDate(d.issueDate)}</td>
                    <td className="tnum px-5 py-3 text-right">{money(s.total)}</td>
                    <td className="tnum px-5 py-3 text-right">{money(s.balance)}</td>
                    <td className="px-5 py-3"><StatusChip status={s.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

import { Link, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { useData } from '../store/DataContext'
import PaymentForm from '../components/PaymentForm'
import { Card, Chip, Empty, PageHeader, StatCard } from '../components/ui'
import { fmtDate, money, todayIso } from '../lib/format'

export default function Payments() {
  const { payments, documents, clientById } = useData()
  const [params, setParams] = useSearchParams()
  const open = params.get('new') === '1'
  const month = todayIso().slice(0, 7)
  const sorted = [...payments].sort((a, b) => b.date.localeCompare(a.date))
  const thisMonth = payments.filter((p) => p.date.startsWith(month))
  const cash = (list: typeof payments) => list.filter((p) => !p.isTds).reduce((a, p) => a + p.amountPaise, 0)

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <PageHeader title="Payments In" subtitle="Recorded by hand. No payment gateway." actions={<button className="btn btn-primary" onClick={() => setParams({ new: '1' })}><Plus size={16} /> Record payment</button>} />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard tone="green" label="Collected this month" value={money(cash(thisMonth), { compact: true })} hint={`${thisMonth.length} payments`} />
        <StatCard tone="blue" label="Collected all time" value={money(cash(payments), { compact: true })} hint={`${payments.length} payments`} />
        <StatCard tone="pink" label="TDS deducted" value={money(payments.filter((p) => p.isTds).reduce((a, p) => a + p.amountPaise, 0), { compact: true })} hint="Claim against Form 26AS" />
      </div>
      <Card>
        {sorted.length === 0 ? <Empty title="No payments yet" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2.5 font-medium">Date</th><th className="px-5 py-2.5 font-medium">Client</th>
                  <th className="px-5 py-2.5 font-medium">Invoice</th><th className="px-5 py-2.5 font-medium">Mode</th>
                  <th className="px-5 py-2.5 font-medium">Reference</th><th className="px-5 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((p) => {
                  const d = documents.find((x) => x.id === p.docId)
                  return (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-3 text-black/70">{fmtDate(p.date)}</td>
                      <td className="px-5 py-3">{clientById(p.clientId)?.name}</td>
                      <td className="tnum px-5 py-3">{d ? <Link className="text-brand hover:underline" to={`/documents/${d.id}`}>{d.number}</Link> : '—'}</td>
                      <td className="px-5 py-3">{p.isTds ? <Chip tone="pink">TDS</Chip> : <Chip tone="grey">{p.mode}</Chip>}</td>
                      <td className="px-5 py-3 text-black/70">{p.reference || '—'}</td>
                      <td className="tnum px-5 py-3 text-right font-medium text-green-fg">{money(p.amountPaise)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <PaymentForm key={open ? 'o' : 'c'} open={open} onClose={() => setParams({})} />
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { useData } from '../store/DataContext'
import { Card, Empty, PageHeader, StatusChip } from '../components/ui'
import { fmtDate, money } from '../lib/format'
import type { DocType } from '../lib/types'

const TITLES: Record<string, { title: string; subtitle: string; types: DocType[]; cta: string; newType: DocType }> = {
  invoices: { title: 'Sales Invoices', subtitle: 'Tax invoices and credit notes', types: ['invoice', 'credit_note'], cta: 'Create invoice', newType: 'invoice' },
  quotations: { title: 'Quotations', subtitle: 'Quotations and proforma invoices', types: ['quotation', 'proforma'], cta: 'Create quotation', newType: 'quotation' },
}

const TYPE_LABEL: Record<DocType, string> = { invoice: 'Invoice', quotation: 'Quotation', proforma: 'Proforma', credit_note: 'Credit note' }

export default function DocumentsList({ kind }: { kind: 'invoices' | 'quotations' }) {
  const cfg = TITLES[kind]
  const { documents, summary, clientById } = useData()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const filter = params.get('filter') ?? 'all'
  const [q, setQ] = useState('')

  const tabs = kind === 'invoices'
    ? [['all', 'All'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['paid', 'Paid'], ['draft', 'Drafts']]
    : [['all', 'All'], ['sent', 'Open'], ['converted', 'Converted'], ['rejected', 'Rejected']]

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return documents
      .filter((d) => cfg.types.includes(d.type))
      .map((d) => ({ d, s: summary(d), c: clientById(d.clientId) }))
      .filter(({ d, s, c }) => {
        if (term && !(d.number.toLowerCase().includes(term) || c?.name.toLowerCase().includes(term))) return false
        if (filter === 'all') return true
        if (filter === 'unpaid') return d.type === 'invoice' && s.balance > 0 && s.status !== 'draft'
        return s.status === filter
      })
      .sort((a, b) => b.d.issueDate.localeCompare(a.d.issueDate) || b.d.number.localeCompare(a.d.number))
  }, [documents, cfg.types, summary, clientById, filter, q])

  const totalShown = rows.reduce((a, r) => a + (r.d.type === 'credit_note' ? -r.s.total : r.s.total), 0)

  return (
    <div className="mx-auto max-w-7xl p-6 lg:p-8">
      <PageHeader
        title={cfg.title} subtitle={cfg.subtitle}
        actions={<button className="btn btn-primary" onClick={() => navigate(`/new/${cfg.newType}`)}><Plus size={16} /> {cfg.cta}</button>}
      />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {tabs.map(([key, label]) => (
              <button
                key={key}
                className={`rounded-lg px-3 py-1.5 text-sm ${filter === key ? 'bg-brand-soft font-medium text-brand' : 'text-ink/70 hover:bg-subtle-2'}`}
                onClick={() => setParams(key === 'all' ? {} : { filter: key })}
              >{label}</button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className="field pl-9" placeholder="Search number or client" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {rows.length === 0 ? (
          <Empty title="Nothing here yet" hint="Try another filter, or create a new document." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Number</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">{kind === 'invoices' ? 'Due date' : 'Valid till'}</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  {kind === 'invoices' && <th className="px-4 py-2.5 text-right font-medium">Balance</th>}
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, s, c }) => (
                  <tr key={d.id} className="cursor-pointer border-b border-line last:border-0 hover:bg-subtle" onClick={() => navigate(`/documents/${d.id}`)}>
                    <td className="px-4 py-3 text-ink/70">{fmtDate(d.issueDate)}</td>
                    <td className="px-4 py-3">
                      <div className="tnum font-medium">{d.number}</div>
                      {d.type !== cfg.newType && <div className="text-xs text-muted">{TYPE_LABEL[d.type]}</div>}
                    </td>
                    <td className="px-4 py-3">{c?.name}</td>
                    <td className="px-4 py-3 text-ink/70">
                      {d.type === 'credit_note' ? '—' : fmtDate(d.dueDate)}
                      {s.daysOverdue > 0 && <div className="text-xs text-red-fg">{s.daysOverdue} days late</div>}
                    </td>
                    <td className="tnum px-4 py-3 text-right">{d.type === 'credit_note' ? '-' : ''}{money(s.total)}</td>
                    {kind === 'invoices' && <td className="tnum px-4 py-3 text-right">{d.type === 'invoice' ? money(s.balance) : '—'}</td>}
                    <td className="px-4 py-3"><StatusChip status={s.status} type={d.type} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <span>{rows.length} documents</span>
          <span className="tnum">Total {money(totalShown)}</span>
        </div>
      </Card>
    </div>
  )
}

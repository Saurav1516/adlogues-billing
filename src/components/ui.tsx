import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import type { DisplayStatus, DocType } from '../lib/types'

export type Tone = 'green' | 'yellow' | 'pink' | 'red' | 'blue' | 'violet' | 'grey'

const TONE: Record<Tone, string> = {
  green: 'bg-green-bg text-green-fg',
  yellow: 'bg-yellow-bg text-yellow-fg',
  pink: 'bg-pink-bg text-pink-fg',
  red: 'bg-red-bg text-red-fg',
  blue: 'bg-blue-bg text-blue-fg',
  violet: 'bg-violet-bg text-violet-fg',
  grey: 'bg-subtle-2 text-muted',
}

// PRD 9: green paid, yellow due soon, red overdue, blue info, pink credit notes/reminders, violet quotations
const STATUS: Record<DisplayStatus, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'grey' },
  sent: { label: 'Unpaid', tone: 'yellow' },
  partial: { label: 'Partially paid', tone: 'blue' },
  paid: { label: 'Paid', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  cancelled: { label: 'Cancelled', tone: 'grey' },
  accepted: { label: 'Accepted', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
  converted: { label: 'Converted', tone: 'violet' },
  issued: { label: 'Issued', tone: 'pink' },
}

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>
}

export function StatusChip({ status, type }: { status: DisplayStatus; type?: DocType }) {
  let s = STATUS[status]
  if (type && type !== 'invoice' && status === 'sent') s = { label: 'Sent', tone: type === 'quotation' ? 'violet' : 'blue' }
  return <Chip tone={s.tone}>{s.label}</Chip>
}

export function StatCard({ tone, label, value, hint, icon }: { tone: Tone; label: string; value: string; hint?: ReactNode; icon?: ReactNode }) {
  return (
    <div className={`rounded-2xl p-5 ${TONE[tone].split(' ')[0]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink/70">{label}</span>
        {icon && <span className={TONE[tone].split(' ')[1]}>{icon}</span>}
      </div>
      <div className="tnum mt-2 text-[26px] font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-[13px] text-ink/60">{hint}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>
}

export function Modal({ open, title, onClose, children, footer, width = 'max-w-lg' }: {
  open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div className={`w-full ${width} rounded-2xl bg-surface shadow-xl`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button className="btn-ghost rounded-md p-1" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <p className="font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <button
        type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      {label}
    </label>
  )
}

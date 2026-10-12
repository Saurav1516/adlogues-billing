const inr = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const inr0 = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })

/** 1234567 paise -> "₹12,345.67" */
export function money(paise: number, opts: { compact?: boolean } = {}): string {
  const sign = paise < 0 ? '-' : ''
  const v = Math.abs(paise) / 100
  return `${sign}₹${opts.compact ? inr0.format(v) : inr.format(v)}`
}

export function toPaise(rupees: string | number): number {
  const n = typeof rupees === 'number' ? rupees : parseFloat(rupees.replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export function rupeesInput(paise: number): string {
  return paise ? String(paise / 100) : ''
}

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export function fmtDate(iso: string): string {
  if (!iso) return '—'
  return dateFmt.format(new Date(iso + 'T00:00:00'))
}

export function todayIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00')
  d.setDate(d.getDate() + days)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + 'T00:00:00').getTime()
  const b = new Date(toIso + 'T00:00:00').getTime()
  return Math.round((b - a) / 86400000)
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')
}

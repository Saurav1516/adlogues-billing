// App data, loaded from the API once after sign-in and kept in sync after each change.
// Rules (numbering, locking, payment limits) are enforced by the server; errors come back as messages.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AppUser, BillingDoc, Client, Company, DisplayStatus, DocType, Payment, PaymentMode, ReminderLog, ServiceItem } from '../lib/types'
import { computeTotals, financialYear } from '../lib/gst'
import { todayIso } from '../lib/format'
import { api, errorText } from '../lib/api'

interface State {
  company: Company
  clients: Client[]
  services: ServiceItem[]
  documents: BillingDoc[]
  payments: Payment[]
  reminders: ReminderLog[]
  users: AppUser[]
}

export interface DocSummary {
  total: number
  paid: number
  credited: number
  balance: number
  status: DisplayStatus
  daysOverdue: number
}

interface Ctx extends State {
  clientById: (id: string) => Client | undefined
  summary: (doc: BillingDoc) => DocSummary
  /** Preview only. The server assigns the real number when the document is saved. */
  nextNumber: (type: DocType, date: string) => string
  saveDoc: (doc: BillingDoc, initialPayment?: { amountPaise: number; mode: PaymentMode }) => Promise<BillingDoc>
  setDocStatus: (id: string, status: BillingDoc['status']) => Promise<void>
  convertToInvoice: (quotationId: string) => Promise<BillingDoc>
  addPayment: (p: Omit<Payment, 'id' | 'clientId'>) => Promise<void>
  logReminder: (docId: string, channel: ReminderLog['channel']) => Promise<void>
  saveClient: (c: Client) => Promise<Client>
  /** Removes the client and all of its documents, payments and reminder logs. */
  deleteClient: (id: string) => Promise<void>
  saveService: (s: ServiceItem) => Promise<ServiceItem>
  saveCompany: (c: Company) => Promise<Company>
}

const DataContext = createContext<Ctx | null>(null)

const PREFIX: Record<DocType, string> = { invoice: '', quotation: 'Q/', proforma: 'PI/', credit_note: 'CN/' }
const upsert = <T extends { id: string }>(list: T[], item: T, front = false) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : front ? [item, ...list] : [...list, item]

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null)
  const [loadError, setLoadError] = useState('')

  const load = useCallback(() => {
    setLoadError('')
    api<State>('/bootstrap').then(setState).catch((e) => setLoadError(errorText(e)))
  }, [])
  useEffect(load, [load])

  const clientById = useCallback((id: string) => state?.clients.find((c) => c.id === id), [state?.clients])

  const summary = useCallback((doc: BillingDoc): DocSummary => {
    const s = state!
    const totalOf = (d: BillingDoc) => {
      const client = s.clients.find((c) => c.id === d.clientId)
      return computeTotals(d.lines, {
        gstEnabled: d.gstEnabled,
        interState: (client?.stateCode ?? s.company.stateCode) !== s.company.stateCode,
        extraDiscountPaise: d.extraDiscountPaise,
        roundOff: d.roundOff,
      }).total
    }
    const total = totalOf(doc)
    if (doc.type !== 'invoice') {
      const status: DisplayStatus = doc.type === 'credit_note' && doc.status === 'sent' ? 'issued' : doc.status
      return { total, paid: 0, credited: 0, balance: 0, status, daysOverdue: 0 }
    }
    const paid = s.payments.filter((p) => p.docId === doc.id).reduce((a, p) => a + p.amountPaise, 0)
    const credited = s.documents
      .filter((x) => x.type === 'credit_note' && x.linkedId === doc.id && x.status !== 'cancelled')
      .reduce((a, cn) => a + totalOf(cn), 0)
    const balance = Math.max(total - paid - credited, 0)
    const daysOverdue = Math.max(0, Math.round((Date.parse(todayIso()) - Date.parse(doc.dueDate)) / 86400000))
    let status: DisplayStatus
    if (doc.status === 'cancelled' || doc.status === 'draft') status = doc.status
    else if (balance === 0) status = 'paid'
    else if (daysOverdue > 0) status = 'overdue'
    else if (paid + credited > 0) status = 'partial'
    else status = 'sent'
    return { total, paid, credited, balance, status, daysOverdue: status === 'overdue' ? daysOverdue : 0 }
  }, [state])

  const nextNumber = useCallback((type: DocType, date: string) => {
    const head = `${state?.company.invoicePrefix ?? 'ADL'}/${PREFIX[type]}${financialYear(date)}/`
    const max = (state?.documents ?? [])
      .filter((x) => x.type === type && x.number.startsWith(head))
      .reduce((m, x) => Math.max(m, parseInt(x.number.slice(head.length), 10) || 0), 0)
    return `${head}${String(max + 1).padStart(4, '0')}`
  }, [state?.company.invoicePrefix, state?.documents])

  const saveDoc = useCallback(async (doc: BillingDoc, initialPayment?: { amountPaise: number; mode: PaymentMode }) => {
    const exists = state?.documents.some((d) => d.id === doc.id)
    if (exists) {
      const saved = await api<BillingDoc>(`/documents/${doc.id}`, { method: 'PUT', body: doc })
      setState((s) => s && { ...s, documents: upsert(s.documents, saved) })
      return saved
    }
    const r = await api<{ doc: BillingDoc; payment?: Payment }>('/documents', { body: { ...doc, initialPayment } })
    setState((s) => s && { ...s, documents: [r.doc, ...s.documents], payments: r.payment ? [r.payment, ...s.payments] : s.payments })
    return r.doc
  }, [state?.documents])

  const setDocStatus = useCallback(async (id: string, status: BillingDoc['status']) => {
    const saved = await api<BillingDoc>(`/documents/${id}/status`, { method: 'PATCH', body: { status } })
    setState((s) => s && { ...s, documents: upsert(s.documents, saved) })
  }, [])

  const convertToInvoice = useCallback(async (quotationId: string) => {
    const r = await api<{ invoice: BillingDoc; quotation: BillingDoc }>(`/documents/${quotationId}/convert`, { body: { today: todayIso() } })
    setState((s) => s && { ...s, documents: [r.invoice, ...upsert(s.documents, r.quotation)] })
    return r.invoice
  }, [])

  const addPayment = useCallback(async (p: Omit<Payment, 'id' | 'clientId'>) => {
    const saved = await api<Payment>('/payments', { body: p })
    setState((s) => s && { ...s, payments: [saved, ...s.payments] })
  }, [])

  const logReminder = useCallback(async (docId: string, channel: ReminderLog['channel']) => {
    const saved = await api<ReminderLog>('/reminders', { body: { docId, channel } })
    setState((s) => s && { ...s, reminders: [saved, ...s.reminders] })
  }, [])

  const saveClient = useCallback(async (c: Client) => {
    const exists = state?.clients.some((x) => x.id === c.id)
    const saved = await api<Client>(exists ? `/clients/${c.id}` : '/clients', { method: exists ? 'PUT' : 'POST', body: c })
    setState((s) => s && { ...s, clients: upsert(s.clients, saved) })
    return saved
  }, [state?.clients])

  const deleteClient = useCallback(async (id: string) => {
    await api(`/clients/${id}`, { method: 'DELETE' })
    setState((s) => {
      if (!s) return s
      const gone = new Set(s.documents.filter((d) => d.clientId === id).map((d) => d.id))
      return {
        ...s,
        clients: s.clients.filter((c) => c.id !== id),
        documents: s.documents.filter((d) => !gone.has(d.id)),
        payments: s.payments.filter((p) => !gone.has(p.docId)),
        reminders: s.reminders.filter((r) => !gone.has(r.docId)),
      }
    })
  }, [])

  const saveService = useCallback(async (sv: ServiceItem) => {
    const exists = state?.services.some((x) => x.id === sv.id)
    const saved = await api<ServiceItem>(exists ? `/services/${sv.id}` : '/services', { method: exists ? 'PUT' : 'POST', body: sv })
    setState((s) => s && { ...s, services: upsert(s.services, saved) })
    return saved
  }, [state?.services])

  const saveCompany = useCallback(async (c: Company) => {
    const saved = await api<Company>('/company', { method: 'PUT', body: c })
    setState((s) => s && { ...s, company: saved })
    return saved
  }, [])

  const value = useMemo<Ctx | null>(() => state && ({
    ...state, clientById, summary, nextNumber, saveDoc, setDocStatus, convertToInvoice,
    addPayment, logReminder, saveClient, deleteClient, saveService, saveCompany,
  }), [state, clientById, summary, nextNumber, saveDoc, setDocStatus, convertToInvoice, addPayment, logReminder, saveClient, deleteClient, saveService, saveCompany])

  if (!value) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        {loadError ? (
          <div>
            <p className="font-medium">Could not load your data</p>
            <p className="mt-1 text-sm text-muted">{loadError}</p>
            <button className="btn btn-primary mt-4" onClick={load}>Try again</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-sm text-muted">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" /> Loading Adlogues Billing…
          </div>
        )}
      </div>
    )
  }
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used inside DataProvider')
  return ctx
}

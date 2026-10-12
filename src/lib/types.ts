// All money is stored in paise (integer) to avoid rounding errors. PRD section 6.

export type DocType = 'invoice' | 'quotation' | 'proforma' | 'credit_note'

/** Stored status. Invoice payment states (partial, paid, overdue) are derived, never stored. */
export type StoredStatus =
  | 'draft'
  | 'sent'
  | 'cancelled'
  | 'accepted'
  | 'rejected'
  | 'converted'

export type DisplayStatus =
  | StoredStatus
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'issued'

export type PaymentMode = 'UPI' | 'Bank transfer' | 'Cash' | 'Cheque'

export type Role = 'owner' | 'admin'

export interface Company {
  name: string
  gstin: string
  address: string
  state: string
  stateCode: string
  email: string
  phone: string
  bankName: string
  accountName: string
  accountNumber: string
  ifsc: string
  upiId: string
  invoicePrefix: string
  defaultTerms: string
  /** Images uploaded in Settings, stored as data URLs (PNG/JPEG/WebP). */
  logo?: string
  signature?: string
  /** Optional uploaded payment QR. If empty, a UPI QR is generated from upiId with the exact amount. */
  qrImage?: string
}

export interface Client {
  id: string
  name: string
  gstin: string
  contactPerson: string
  email: string
  phone: string
  address: string
  stateCode: string
  paymentTermsDays: number
}

export interface ServiceItem {
  id: string
  name: string
  sac: string
  ratePaise: number
  gstRate: number
}

export interface LineItem {
  id: string
  serviceId?: string
  description: string
  sac: string
  qty: number
  ratePaise: number
  discountPct: number
  gstRate: number
}

export interface BillingDoc {
  id: string
  type: DocType
  number: string
  clientId: string
  issueDate: string // ISO yyyy-mm-dd
  dueDate: string // due date for invoices, validity date for quotations
  status: StoredStatus
  gstEnabled: boolean
  lines: LineItem[]
  extraDiscountPaise: number
  roundOff: boolean
  notes: string
  terms: string
  linkedId?: string // quotation -> invoice, credit note -> invoice
  createdAt: string
}

export interface Payment {
  id: string
  docId: string
  clientId: string
  amountPaise: number
  date: string
  mode: PaymentMode
  reference: string
  isTds: boolean
}

export interface ReminderLog {
  id: string
  docId: string
  channel: 'WhatsApp' | 'Email'
  sentAt: string
  sentBy: string
}

export interface AppUser {
  id: string
  name: string
  email?: string
  phone?: string
  role: Role
  status: 'active' | 'invited'
}

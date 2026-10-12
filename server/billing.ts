// Business rules enforced on the server (the browser can't be trusted for these).
import { oneOf } from './db.ts'
import type { Q } from './db.ts'
import { HttpError } from './auth.ts'
import { computeTotals, financialYear, validateGstin, stateFromGstin, STATES } from '../src/lib/gst.ts'
import type { BillingDoc, Client, Company, DocType, LineItem, Payment, ServiceItem } from '../src/lib/types.ts'

export const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`
const ISO = /^\d{4}-\d{2}-\d{2}$/
const DOC_TYPES: DocType[] = ['invoice', 'quotation', 'proforma', 'credit_note']
const PREFIX: Record<DocType, string> = { invoice: '', quotation: 'Q/', proforma: 'PI/', credit_note: 'CN/' }

export async function getCompany(q: Q): Promise<Company> {
  const row = await q.get<{ data: string }>('SELECT data FROM company WHERE id = 1')
  if (!row) throw new HttpError(500, 'Company settings are missing.')
  return JSON.parse(row.data) as Company
}

const str = (v: unknown, max = 500) => String(v ?? '').slice(0, max)
const int = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return min
  return Math.min(Math.max(n, min), max)
}

// ---------- Clients ----------
export function cleanClient(input: Partial<Client>, id: string): Client {
  const name = str(input.name, 200).trim()
  if (!name) throw new HttpError(400, 'Client name is required.')
  const gstin = str(input.gstin, 15).trim().toUpperCase()
  const gstErr = validateGstin(gstin)
  if (gstErr) throw new HttpError(400, gstErr)
  const stateCode = (gstin && stateFromGstin(gstin)) || str(input.stateCode, 2)
  if (!STATES[stateCode]) throw new HttpError(400, 'Choose a valid state.')
  const email = str(input.email, 200).trim()
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Client email looks wrong.')
  return {
    id, name, gstin, stateCode, email,
    contactPerson: str(input.contactPerson, 200).trim(),
    phone: str(input.phone, 15).replace(/\D/g, ''),
    address: str(input.address, 500).trim(),
    paymentTermsDays: int(input.paymentTermsDays, 0, 365),
  }
}

// ---------- Services ----------
export function cleanService(input: Partial<ServiceItem>, id: string): ServiceItem {
  const name = str(input.name, 200).trim()
  if (!name) throw new HttpError(400, 'Service name is required.')
  const sac = str(input.sac, 8).replace(/\D/g, '')
  if (sac && sac.length < 4) throw new HttpError(400, 'SAC should be 4 to 8 digits.')
  const gstRate = int(input.gstRate, 0, 28)
  if (![0, 5, 12, 18, 28].includes(gstRate)) throw new HttpError(400, 'GST rate must be 0, 5, 12, 18 or 28.')
  return { id, name, sac, gstRate, ratePaise: int(input.ratePaise, 0) }
}

// ---------- Company ----------
const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
function cleanImage(v: unknown, label: string): string | undefined {
  if (v === undefined || v === null || v === '') return undefined
  const s = String(v)
  if (!IMG.test(s)) throw new HttpError(400, `${label} must be a PNG, JPG or WebP image.`)
  if (s.length > 1_500_000) throw new HttpError(400, `${label} is too large. Use an image under 1 MB.`)
  return s
}
export function cleanCompany(input: Partial<Company>): Company {
  const gstin = str(input.gstin, 15).trim().toUpperCase()
  const gstErr = validateGstin(gstin)
  if (gstErr) throw new HttpError(400, gstErr)
  const stateCode = (gstin && stateFromGstin(gstin)) || str(input.stateCode, 2) || '09'
  const prefix = str(input.invoicePrefix, 10).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!prefix) throw new HttpError(400, 'Invoice prefix is required.')
  const upiId = str(input.upiId, 100).trim()
  if (upiId && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) throw new HttpError(400, 'UPI ID looks wrong (example: adlogues@hdfcbank).')
  return {
    name: str(input.name, 200).trim() || 'Adlogues',
    gstin, stateCode, state: STATES[stateCode] ?? '',
    address: str(input.address, 500).trim(),
    email: str(input.email, 200).trim(),
    phone: str(input.phone, 30).trim(),
    bankName: str(input.bankName, 100).trim(),
    accountName: str(input.accountName, 100).trim(),
    accountNumber: str(input.accountNumber, 30).replace(/\s/g, ''),
    ifsc: str(input.ifsc, 11).trim().toUpperCase(),
    upiId,
    invoicePrefix: prefix,
    defaultTerms: str(input.defaultTerms, 2000),
    logo: cleanImage(input.logo, 'Logo'),
    signature: cleanImage(input.signature, 'Signature'),
    qrImage: cleanImage(input.qrImage, 'QR code'),
  }
}

// ---------- Documents ----------
/** F6: next number for a type in the document's financial year, e.g. ADL/2026-27/0011. */
export async function nextNumber(q: Q, type: DocType, date: string): Promise<string> {
  if (!DOC_TYPES.includes(type)) throw new HttpError(400, 'Unknown document type.')
  if (!ISO.test(date)) throw new HttpError(400, 'Dates are not valid.')
  const head = `${(await getCompany(q)).invoicePrefix}/${PREFIX[type]}${financialYear(date)}/`
  const rows = await q.all<{ number: string }>('SELECT number FROM documents WHERE type = ? AND number LIKE ?', [type, `${head}%`])
  const max = rows.reduce((m, r) => Math.max(m, parseInt(r.number.slice(head.length), 10) || 0), 0)
  return `${head}${String(max + 1).padStart(4, '0')}`
}

function cleanLines(lines: unknown): LineItem[] {
  if (!Array.isArray(lines)) throw new HttpError(400, 'Items are missing.')
  const out = lines.slice(0, 200).map((l: Partial<LineItem>) => ({
    id: str(l.id, 40) || uid('l'),
    serviceId: l.serviceId ? str(l.serviceId, 40) : undefined,
    description: str(l.description, 500).trim(),
    sac: str(l.sac, 8).replace(/\D/g, ''),
    qty: Math.max(0, Math.min(Number(l.qty) || 0, 1_000_000)),
    ratePaise: int(l.ratePaise, 0),
    discountPct: Math.max(0, Math.min(Number(l.discountPct) || 0, 100)),
    gstRate: [0, 5, 12, 18, 28].includes(Number(l.gstRate)) ? Number(l.gstRate) : 18,
  })).filter((l) => l.description && l.ratePaise > 0 && l.qty > 0)
  if (out.length === 0) throw new HttpError(400, 'Add at least one item with a name, quantity and price.')
  return out
}

export async function totalOf(q: Q, doc: BillingDoc): Promise<number> {
  const client = await oneOf<Client>(q, 'clients', doc.clientId)
  const company = await getCompany(q)
  return computeTotals(doc.lines, {
    gstEnabled: doc.gstEnabled,
    interState: (client?.stateCode ?? company.stateCode) !== company.stateCode,
    extraDiscountPaise: doc.extraDiscountPaise,
    roundOff: doc.roundOff,
  }).total
}

/** Balance left on an invoice = total − payments (incl. TDS) − live credit notes. */
export async function invoiceBalance(q: Q, invoiceId: string): Promise<number> {
  const inv = await oneOf<BillingDoc>(q, 'documents', invoiceId)
  if (!inv) return 0
  const paid = (await q.all<{ data: string }>('SELECT data FROM payments WHERE doc_id = ?', [invoiceId]))
    .reduce((a, r) => a + (JSON.parse(r.data) as Payment).amountPaise, 0)
  const notes = (await q.all<{ data: string }>("SELECT data FROM documents WHERE type = 'credit_note'"))
    .map((r) => JSON.parse(r.data) as BillingDoc)
    .filter((d) => d.linkedId === invoiceId && d.status !== 'cancelled')
  let credited = 0
  for (const d of notes) credited += await totalOf(q, d)
  return Math.max((await totalOf(q, inv)) - paid - credited, 0)
}

export async function cleanDocument(q: Q, input: Partial<BillingDoc>, base: { id: string; number: string; createdAt: string }): Promise<BillingDoc> {
  const type = input.type as DocType
  if (!DOC_TYPES.includes(type)) throw new HttpError(400, 'Unknown document type.')
  const clientId = str(input.clientId, 40)
  if (!(await oneOf<Client>(q, 'clients', clientId))) throw new HttpError(400, 'Choose a client in Bill To.')
  const issueDate = str(input.issueDate, 10)
  const dueDate = str(input.dueDate, 10) || issueDate
  if (!ISO.test(issueDate) || !ISO.test(dueDate)) throw new HttpError(400, 'Dates are not valid.')
  if (type !== 'credit_note' && dueDate < issueDate) throw new HttpError(400, 'Due date cannot be before the document date.')
  const status = input.status === 'draft' && type === 'invoice' ? 'draft' : 'sent'
  let linkedId = input.linkedId ? str(input.linkedId, 40) : undefined
  if (type === 'credit_note') {
    const inv = linkedId ? await oneOf<BillingDoc>(q, 'documents', linkedId) : undefined
    if (!inv || inv.type !== 'invoice' || inv.clientId !== clientId) throw new HttpError(400, 'Choose the invoice this credit note is against.')
  } else if (type !== 'invoice') {
    linkedId = undefined
  }
  const doc: BillingDoc = {
    id: base.id, number: base.number, createdAt: base.createdAt,
    type, clientId, issueDate, dueDate, status,
    gstEnabled: input.gstEnabled !== false,
    lines: cleanLines(input.lines),
    extraDiscountPaise: int(input.extraDiscountPaise, 0),
    roundOff: input.roundOff !== false,
    notes: str(input.notes, 2000),
    terms: str(input.terms, 2000),
    linkedId,
  }
  if (doc.extraDiscountPaise > 0) {
    const sub = doc.lines.reduce((a, l) => a + l.qty * l.ratePaise * (1 - l.discountPct / 100), 0)
    if (doc.extraDiscountPaise > sub) throw new HttpError(400, 'Discount is more than the subtotal.')
  }
  if (type === 'credit_note' && linkedId) {
    const room = await invoiceBalance(q, linkedId)
    if ((await totalOf(q, doc)) > room) throw new HttpError(400, `Credit note is more than the invoice balance (₹${(room / 100).toFixed(2)}).`)
  }
  return doc
}

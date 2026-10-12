// npm run db:demo — adds the five Adlogues clients with DUMMY invoices in every status
// (paid, unpaid, partially paid, overdue), plus quotations and a draft.
// Safe to run on a database you already use: it skips if these clients are already there,
// and takes the next free invoice numbers so nothing collides. Delete clients from the app when done.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Q } from './db.ts'
import type { BillingDoc, Client, Company, DocType, LineItem, Payment, PaymentMode, ServiceItem } from '../src/lib/types.ts'

// Read .env BEFORE loading the database module, so it connects to Turso when configured
try { process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env')) } catch { /* no .env */ }
const { closeDb, db, initDb, tx, DB_LABEL } = await import('./db.ts')
const { seedIfEmpty } = await import('./seed.ts')
const { computeTotals, financialYear } = await import('../src/lib/gst.ts')

console.log(`Database: ${DB_LABEL}`)
await initDb()
await seedIfEmpty()

const company = JSON.parse(String((await db.get<{ data: string }>('SELECT data FROM company WHERE id = 1'))!.data)) as Company
const services = (await db.all<{ data: string }>('SELECT data FROM services')).map((r) => JSON.parse(String(r.data)) as ServiceItem)
const svc = (name: string) => {
  const s = services.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()))
  if (!s) throw new Error(`Service "${name}" not found. Check Services in the app.`)
  return s
}

// Dates relative to today, so statuses stay meaningful whenever this runs
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const day = (offset: number) => { const d = new Date(); d.setDate(d.getDate() + offset); return iso(d) }
const uid = (p: string) => `${p}_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`

// Contact details are dummy placeholders. Update them from the Clients page.
const CLIENTS: Client[] = [
  { id: 'demo_fueasia', name: 'Fueasia', contactPerson: 'Dr. Kavish Chouhan', gstin: '', email: 'kavish@example.com', phone: '9800000001', address: 'New Delhi', stateCode: '07', paymentTermsDays: 15 },
  { id: 'demo_dermaclinix', name: 'Dermaclinix', contactPerson: 'Dr. Amrendra Kumar', gstin: '', email: 'amrendra@example.com', phone: '9800000002', address: 'New Delhi', stateCode: '07', paymentTermsDays: 30 },
  { id: 'demo_kriida', name: 'Kriida', contactPerson: 'Abhinav', gstin: '', email: 'abhinav@example.com', phone: '9800000003', address: 'Noida, Uttar Pradesh', stateCode: '09', paymentTermsDays: 15 },
  { id: 'demo_rasoi', name: 'Rasoi', contactPerson: 'Harshita', gstin: '', email: 'harshita@example.com', phone: '9800000004', address: 'Noida, Uttar Pradesh', stateCode: '09', paymentTermsDays: 15 },
  { id: 'demo_abctalkies', name: 'Abc Talkies', contactPerson: 'Shalibhadra', gstin: '', email: 'shalibhadra@example.com', phone: '9800000005', address: 'Mumbai, Maharashtra', stateCode: '27', paymentTermsDays: 30 },
]

type Pay = { share: number; mode: PaymentMode; daysAfterIssue: number; ref: string }
interface Plan {
  client: string; type: DocType; issued: number; dueIn: number; status?: BillingDoc['status']
  lines: [string, number, number?][] // service, qty, discount %
  pays?: Pay[]; note?: string
}

// share = fraction of the total paid (1 = paid in full)
const PLANS: Plan[] = [
  // Fueasia: one paid, one overdue, one draft
  { client: 'demo_fueasia', type: 'invoice', issued: -75, dueIn: 15, lines: [['Website Design', 1], ['Social Media', 1]], pays: [{ share: 1, mode: 'Bank transfer', daysAfterIssue: 12, ref: 'NEFT UTR 4471' }] },
  { client: 'demo_fueasia', type: 'invoice', issued: -50, dueIn: 15, lines: [['Meta Ads', 1], ['Social Media', 1]], note: 'September retainer' },
  { client: 'demo_fueasia', type: 'invoice', issued: -1, dueIn: 15, status: 'draft', lines: [['Social Media', 1]], note: 'October retainer (draft)' },
  // Dermaclinix: partially paid and not yet due; overdue with part payment
  { client: 'demo_dermaclinix', type: 'invoice', issued: -10, dueIn: 30, lines: [['Social Media', 1], ['Meta Ads', 1]], pays: [{ share: 0.4, mode: 'UPI', daysAfterIssue: 3, ref: 'UPI 88213' }] },
  { client: 'demo_dermaclinix', type: 'invoice', issued: -55, dueIn: 30, lines: [['Video Production', 3]], pays: [{ share: 0.5, mode: 'Cheque', daysAfterIssue: 20, ref: 'Chq 004512' }] },
  // Kriida: unpaid and not yet due; open quotation
  { client: 'demo_kriida', type: 'invoice', issued: -4, dueIn: 15, lines: [['Brand Identity', 1, 10]] },
  { client: 'demo_kriida', type: 'quotation', issued: -3, dueIn: 15, lines: [['Website Design', 1], ['Social Media', 3]] },
  // Rasoi: paid (with TDS), unpaid, quotation
  { client: 'demo_rasoi', type: 'invoice', issued: -40, dueIn: 15, lines: [['Social Media', 1], ['Meta Ads', 1]], pays: [{ share: 0.9, mode: 'UPI', daysAfterIssue: 10, ref: 'UPI 55103' }, { share: 0.1, mode: 'Bank transfer', daysAfterIssue: 10, ref: 'TDS deducted' }] },
  { client: 'demo_rasoi', type: 'invoice', issued: -6, dueIn: 15, lines: [['Video Production', 2]] },
  { client: 'demo_rasoi', type: 'quotation', issued: -8, dueIn: 15, lines: [['Brand Identity', 1]] },
  // Abc Talkies: long overdue; partially paid; paid
  { client: 'demo_abctalkies', type: 'invoice', issued: -95, dueIn: 30, lines: [['Video Production', 6]] },
  { client: 'demo_abctalkies', type: 'invoice', issued: -20, dueIn: 30, lines: [['Event Branding', 2]], pays: [{ share: 0.3, mode: 'UPI', daysAfterIssue: 5, ref: 'UPI 66190' }] },
  { client: 'demo_abctalkies', type: 'invoice', issued: -60, dueIn: 30, lines: [['Meta Ads', 1]], pays: [{ share: 1, mode: 'Bank transfer', daysAfterIssue: 25, ref: 'NEFT UTR 7720' }] },
]

const exists = (await db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM clients WHERE id IN (${CLIENTS.map(() => '?').join(',')})`, CLIENTS.map((c) => c.id)))!
if (Number(exists.n) > 0) {
  console.log('The demo clients are already in the database. Nothing was added.')
  console.log('To start over, delete them from the Clients page, then run this again.')
  closeDb()
  process.exit(0)
}

const PREFIX: Record<DocType, string> = { invoice: '', quotation: 'Q/', proforma: 'PI/', credit_note: 'CN/' }
async function nextNumber(q: Q, type: DocType, date: string): Promise<string> {
  const head = `${company.invoicePrefix}/${PREFIX[type]}${financialYear(date)}/`
  const rows = await q.all<{ number: string }>('SELECT number FROM documents WHERE type = ? AND number LIKE ?', [type, `${head}%`])
  const max = rows.reduce((m, r) => Math.max(m, parseInt(String(r.number).slice(head.length), 10) || 0), 0)
  return `${head}${String(max + 1).padStart(4, '0')}`
}

let docs = 0, pays = 0
const now = Date.now()
await tx(async (q) => {
  for (const [i, c] of CLIENTS.entries()) await q.run('INSERT INTO clients (id, data, created_at) VALUES (?, ?, ?)', [c.id, JSON.stringify(c), now + i])

  // Oldest first so numbers run in date order
  const ordered = [...PLANS].sort((a, b) => a.issued - b.issued)
  for (const [i, p] of ordered.entries()) {
    const client = CLIENTS.find((c) => c.id === p.client)!
    const issueDate = day(p.issued)
    const lines: LineItem[] = p.lines.map(([name, qty, disc]) => {
      const s = svc(name)
      return { id: uid('l'), serviceId: s.id, description: s.name, sac: s.sac, qty, ratePaise: s.ratePaise, discountPct: disc ?? 0, gstRate: s.gstRate }
    })
    const doc: BillingDoc = {
      id: uid('d'), type: p.type, number: await nextNumber(q, p.type, issueDate), clientId: client.id, issueDate,
      dueDate: day(p.issued + p.dueIn), status: p.status ?? 'sent', gstEnabled: true, lines,
      extraDiscountPaise: 0, roundOff: true, notes: p.note ?? '', terms: company.defaultTerms, createdAt: new Date(now + i).toISOString(),
    }
    await q.run('INSERT INTO documents (id, type, number, client_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)', [doc.id, doc.type, doc.number, doc.clientId, JSON.stringify(doc), now + 100 + i])
    docs++

    if (p.pays) {
      const total = computeTotals(lines, { gstEnabled: true, interState: client.stateCode !== company.stateCode, extraDiscountPaise: 0, roundOff: true }).total
      let left = total
      for (const [j, pay] of p.pays.entries()) {
        // Round to whole rupees; a full share takes exactly what is left so "paid" is exact
        const amount = pay.share >= 1 || j === p.pays!.length - 1 && p.pays!.reduce((a, x) => a + x.share, 0) >= 1
          ? left
          : Math.round((total * pay.share) / 100) * 100
        left -= amount
        const isTds = pay.ref === 'TDS deducted'
        const payment: Payment = {
          id: uid('p'), docId: doc.id, clientId: client.id, amountPaise: amount, date: day(p.issued + pay.daysAfterIssue),
          mode: pay.mode, reference: pay.ref, isTds,
        }
        await q.run('INSERT INTO payments (id, doc_id, data, created_at) VALUES (?, ?, ?, ?)', [payment.id, payment.docId, JSON.stringify(payment), now + 200 + i * 10 + j])
        pays++
      }
    }
  }
})

console.log(`Added 5 demo clients, ${docs} documents and ${pays} payments (dummy data). Refresh the app to see them.`)
closeDb()

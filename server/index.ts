// Adlogues Billing API.  Dev: `npm run dev` (with Vite).  Production: `npm run build && npm start`.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import type { NextFunction, Request, Response } from 'express'
import type { BillingDoc, Client, Payment, PaymentMode, ReminderLog, ServiceItem } from '../src/lib/types.ts'
import type { Q } from './db.ts'

// Read .env before the other modules load, since they read settings from it.
try { process.loadEnvFile(resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env')) } catch { /* no .env (e.g. on the host): use its environment variables */ }

const { IS_PROD, PORT } = await import('./config.ts')
const { db, allOf, oneOf, tx, initDb, DB_LABEL, isRemote } = await import('./db.ts')
const auth = await import('./auth.ts')
const { HttpError, requireAuth, COOKIE } = auth
const bill = await import('./billing.ts')
const { seedIfEmpty } = await import('./seed.ts')
const { describeEmail } = await import('./mailer.ts')

await initDb()
await seedIfEmpty()

const app = express()
app.disable('x-powered-by')
app.set('trust proxy', 1) // behind the host's HTTPS proxy (Render, Hostinger, etc.)
app.use(express.json({ limit: '6mb' }))
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})

const api = express.Router()

// ---------- Public ----------
api.get('/health', (_req, res) => { res.json({ ok: true }) })

api.post('/auth/request-otp', async (req, res) => {
  await auth.requestOtp(req.body?.email)
  res.json({ ok: true })
})

api.post('/auth/verify-otp', async (req, res) => {
  const { token, user } = await auth.verifyOtp(req.body?.email, req.body?.code)
  res.cookie(COOKIE, token, auth.cookieOptions())
  res.json({ user: { email: user.email, name: user.name, role: user.role } })
})

api.get('/auth/me', async (req, res) => {
  const user = await auth.currentUser(req)
  if (!user) { res.status(401).json({ error: 'Please sign in.' }); return }
  res.json({ user: { email: user.email, name: user.name, role: user.role } })
})

api.post('/auth/logout', async (req, res) => {
  await auth.endSession(req)
  res.clearCookie(COOKIE, { path: '/' })
  res.json({ ok: true })
})

// ---------- Everything below needs a signed-in user ----------
api.use(requireAuth)

api.get('/bootstrap', async (_req, res) => {
  const [company, clients, services, documents, payments, reminders] = await Promise.all([
    bill.getCompany(db),
    allOf<Client>(db, 'clients'),
    allOf<ServiceItem>(db, 'services'),
    allOf<BillingDoc>(db, 'documents', 'created_at DESC'),
    allOf<Payment>(db, 'payments', 'created_at DESC'),
    allOf<ReminderLog>(db, 'reminders', 'created_at DESC'),
  ])
  res.json({ company, clients, services, documents, payments, reminders, users: auth.publicUsers() })
})

// Company settings, logo, signature and QR (Owner and Admin have the same access)
api.put('/company', async (req, res) => {
  const company = bill.cleanCompany(req.body ?? {})
  await db.run('UPDATE company SET data = ? WHERE id = 1', [JSON.stringify(company)])
  res.json(company)
})

// Clients
api.post('/clients', async (req, res) => {
  const client = bill.cleanClient(req.body ?? {}, bill.uid('c'))
  await db.run('INSERT INTO clients (id, data, created_at) VALUES (?, ?, ?)', [client.id, JSON.stringify(client), Date.now()])
  res.status(201).json(client)
})
api.put('/clients/:id', async (req, res) => {
  if (!(await oneOf<Client>(db, 'clients', req.params.id))) throw new HttpError(404, 'Client not found.')
  const client = bill.cleanClient(req.body ?? {}, req.params.id)
  await db.run('UPDATE clients SET data = ? WHERE id = ?', [JSON.stringify(client), client.id])
  res.json(client)
})

// Delete a client together with all of its documents, payments and reminder logs.
// The app asks for confirmation first and shows exactly what will be removed.
api.delete('/clients/:id', async (req, res) => {
  const id = req.params.id
  const removed = await tx(async (q) => {
    if (!(await oneOf<Client>(q, 'clients', id))) throw new HttpError(404, 'Client not found.')
    const docIds = (await q.all<{ id: string }>('SELECT id FROM documents WHERE client_id = ?', [id])).map((r) => String(r.id))
    let payments = 0, reminders = 0
    for (const docId of docIds) {
      payments += (await q.run('DELETE FROM payments WHERE doc_id = ?', [docId])).changes
      reminders += (await q.run('DELETE FROM reminders WHERE doc_id = ?', [docId])).changes
    }
    const documents = (await q.run('DELETE FROM documents WHERE client_id = ?', [id])).changes
    await q.run('DELETE FROM clients WHERE id = ?', [id])
    return { documents, payments, reminders }
  })
  console.log(`  Client ${id} deleted by ${req.user!.email}:`, removed)
  res.json({ ok: true, removed })
})

// Services
api.post('/services', async (req, res) => {
  const s = bill.cleanService(req.body ?? {}, bill.uid('s'))
  await db.run('INSERT INTO services (id, data, created_at) VALUES (?, ?, ?)', [s.id, JSON.stringify(s), Date.now()])
  res.status(201).json(s)
})
api.put('/services/:id', async (req, res) => {
  if (!(await oneOf<ServiceItem>(db, 'services', req.params.id))) throw new HttpError(404, 'Service not found.')
  const s = bill.cleanService(req.body ?? {}, req.params.id)
  await db.run('UPDATE services SET data = ? WHERE id = ?', [JSON.stringify(s), s.id])
  res.json(s)
})

// Payments (P1, P8): recorded by hand, never more than the balance
const MODES: PaymentMode[] = ['UPI', 'Bank transfer', 'Cash', 'Cheque']
async function addPayment(q: Q, input: { docId: string; amountPaise: number; date: string; mode: PaymentMode; reference: string; isTds: boolean }): Promise<Payment> {
  const inv = await oneOf<BillingDoc>(q, 'documents', String(input.docId ?? ''))
  if (!inv || inv.type !== 'invoice') throw new HttpError(400, 'Choose an invoice.')
  if (inv.status === 'draft' || inv.status === 'cancelled') throw new HttpError(409, 'Payments can only be recorded on issued invoices.')
  const amount = Math.round(Number(input.amountPaise))
  if (!Number.isFinite(amount) || amount <= 0) throw new HttpError(400, 'Enter an amount above zero.')
  const balance = await bill.invoiceBalance(q, inv.id)
  if (amount > balance) throw new HttpError(400, `Amount is more than the balance of ₹${(balance / 100).toFixed(2)}.`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(input.date))) throw new HttpError(400, 'Payment date is not valid.')
  const payment: Payment = {
    id: bill.uid('p'), docId: inv.id, clientId: inv.clientId, amountPaise: amount, date: input.date,
    mode: MODES.includes(input.mode) ? input.mode : 'UPI', reference: String(input.reference ?? '').slice(0, 200), isTds: Boolean(input.isTds),
  }
  await q.run('INSERT INTO payments (id, doc_id, data, created_at) VALUES (?, ?, ?, ?)', [payment.id, payment.docId, JSON.stringify(payment), Date.now()])
  return payment
}

// Documents: the server assigns the number (F6)
api.post('/documents', async (req, res) => {
  const out = await tx(async (q) => {
    const body = req.body ?? {}
    const id = bill.uid('d')
    const number = await bill.nextNumber(q, body.type, String(body.issueDate ?? ''))
    const doc = await bill.cleanDocument(q, body, { id, number, createdAt: new Date().toISOString() })
    await q.run('INSERT INTO documents (id, type, number, client_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [doc.id, doc.type, doc.number, doc.clientId, JSON.stringify(doc), Date.now()])
    // Optional payment taken at the moment of invoicing
    const p = body.initialPayment as { amountPaise?: number; mode?: PaymentMode } | undefined
    let payment: Payment | undefined
    if (doc.type === 'invoice' && doc.status === 'sent' && p && Number(p.amountPaise) > 0) {
      payment = await addPayment(q, { docId: doc.id, amountPaise: Number(p.amountPaise), date: doc.issueDate, mode: p.mode ?? 'UPI', reference: 'Recorded at invoice creation', isTds: false })
    }
    return { doc, payment }
  })
  res.status(201).json(out)
})

// Only drafts can be edited; issued documents are locked (PRD 6)
api.put('/documents/:id', async (req, res) => {
  const doc = await tx(async (q) => {
    const existing = await oneOf<BillingDoc>(q, 'documents', req.params.id)
    if (!existing) throw new HttpError(404, 'Document not found.')
    if (existing.status !== 'draft') throw new HttpError(409, 'Issued documents are locked. Use a credit note to correct an invoice.')
    const next = await bill.cleanDocument(q, { ...req.body, type: existing.type }, { id: existing.id, number: existing.number, createdAt: existing.createdAt })
    await q.run('UPDATE documents SET data = ?, client_id = ? WHERE id = ?', [JSON.stringify(next), next.clientId, next.id])
    return next
  })
  res.json(doc)
})

const TRANSITIONS: Record<string, string[]> = {
  'invoice:draft': ['sent', 'cancelled'],
  'invoice:sent': ['cancelled'],
  'quotation:sent': ['accepted', 'rejected', 'cancelled'],
  'quotation:accepted': ['rejected'],
  'proforma:sent': ['cancelled'],
  'credit_note:sent': ['cancelled'],
}
api.patch('/documents/:id/status', async (req, res) => {
  const next = await tx(async (q) => {
    const doc = await oneOf<BillingDoc>(q, 'documents', req.params.id)
    if (!doc) throw new HttpError(404, 'Document not found.')
    const to = String(req.body?.status ?? '')
    if (!TRANSITIONS[`${doc.type}:${doc.status}`]?.includes(to)) throw new HttpError(409, `Cannot change this ${doc.type.replace('_', ' ')} from ${doc.status} to ${to}.`)
    if (to === 'cancelled' && doc.type === 'invoice') {
      const paid = await q.get('SELECT 1 AS one FROM payments WHERE doc_id = ? LIMIT 1', [doc.id])
      if (paid) throw new HttpError(409, 'This invoice has payments. Issue a credit note instead of cancelling.')
    }
    const updated = { ...doc, status: to as BillingDoc['status'] }
    await q.run('UPDATE documents SET data = ? WHERE id = ?', [JSON.stringify(updated), doc.id])
    return updated
  })
  res.json(next)
})

// F8: quotation -> invoice, lines copied, both linked
api.post('/documents/:id/convert', async (req, res) => {
  const out = await tx(async (q) => {
    const quote = await oneOf<BillingDoc>(q, 'documents', req.params.id)
    if (!quote || quote.type !== 'quotation') throw new HttpError(404, 'Quotation not found.')
    if (quote.status !== 'sent' && quote.status !== 'accepted') throw new HttpError(409, 'Only an open quotation can be converted.')
    const client = await oneOf<Client>(q, 'clients', quote.clientId)
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body?.today ?? '')) ? String(req.body.today) : new Date().toISOString().slice(0, 10)
    const due = new Date(today + 'T00:00:00Z')
    due.setUTCDate(due.getUTCDate() + (client?.paymentTermsDays ?? 15))
    const invoice: BillingDoc = {
      ...quote, id: bill.uid('d'), type: 'invoice', number: await bill.nextNumber(q, 'invoice', today), issueDate: today,
      dueDate: due.toISOString().slice(0, 10), status: 'sent', linkedId: quote.id, createdAt: new Date().toISOString(),
      lines: quote.lines.map((l) => ({ ...l, id: bill.uid('l') })),
    }
    const quotation: BillingDoc = { ...quote, status: 'converted', linkedId: invoice.id }
    await q.run('INSERT INTO documents (id, type, number, client_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [invoice.id, invoice.type, invoice.number, invoice.clientId, JSON.stringify(invoice), Date.now()])
    await q.run('UPDATE documents SET data = ? WHERE id = ?', [JSON.stringify(quotation), quote.id])
    return { invoice, quotation }
  })
  res.status(201).json(out)
})

api.post('/payments', async (req, res) => {
  res.status(201).json(await tx((q) => addPayment(q, req.body ?? {})))
})

// Reminder log (P6)
api.post('/reminders', async (req, res) => {
  const doc = await oneOf<BillingDoc>(db, 'documents', String(req.body?.docId ?? ''))
  if (!doc) throw new HttpError(404, 'Document not found.')
  const channel = req.body?.channel === 'Email' ? 'Email' : 'WhatsApp'
  const r: ReminderLog = { id: bill.uid('r'), docId: doc.id, channel, sentAt: new Date().toISOString(), sentBy: req.user!.name }
  await db.run('INSERT INTO reminders (id, doc_id, data, created_at) VALUES (?, ?, ?, ?)', [r.id, r.docId, JSON.stringify(r), Date.now()])
  res.status(201).json(r)
})

app.use('/api', api)
app.use('/api', (_req, res) => { res.status(404).json({ error: 'Not found.' }) })

// Serve the built app (npm run build) from the same server
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')))
}

app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) { res.status(err.status).json({ error: err.message }); return }
  if (err.type === 'entity.too.large') { res.status(413).json({ error: 'That upload is too large.' }); return }
  if (err.type === 'entity.parse.failed') { res.status(400).json({ error: 'Bad request.' }); return }
  if (/UNIQUE constraint failed: documents\.number/.test(String(err.message))) { res.status(409).json({ error: 'That number was just used. Please save again.' }); return }
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on the server.' })
})

app.listen(PORT, () => {
  console.log(`\n  Adlogues Billing API  →  http://localhost:${PORT}`)
  console.log(`  Database             →  ${DB_LABEL}`)
  console.log(`  Sign-in emails       →  ${describeEmail()}${IS_PROD ? ' (production)' : ''}\n`)
  if (IS_PROD && !isRemote) console.warn('  ⚠ Production is using a local database file. On Render/Vercel it is wiped on restart: set TURSO_DATABASE_URL.\n')
})

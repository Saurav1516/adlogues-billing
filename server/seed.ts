// First-run setup: company details and the service rate card. No clients or invoices.
// Load sample data for testing with:  npm run db:demo
import { db, tx } from './db.ts'
import { company as sampleCompany, services as sampleServices } from '../src/data/mock.ts'

export async function seedIfEmpty(): Promise<void> {
  const has = await db.get('SELECT 1 AS one FROM company WHERE id = 1')
  if (has) return
  const now = Date.now()
  await tx(async (q) => {
    await q.run('INSERT INTO company (id, data) VALUES (1, ?)', [JSON.stringify(sampleCompany)])
    for (const [i, s] of sampleServices.entries()) {
      await q.run('INSERT INTO services (id, data, created_at) VALUES (?, ?, ?)', [s.id, JSON.stringify(s), now + i])
    }
  })
  console.log('  Database created with Adlogues settings and the service rate card.')
}

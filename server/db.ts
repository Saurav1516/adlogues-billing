// Database: Turso (hosted, SQLite-compatible) when TURSO_DATABASE_URL is set, otherwise a local
// SQLite file (server/data/adlogues.db) for development. Same tables and code either way.
// Each business record is stored as JSON in a `data` column, with the fields we search or
// enforce rules on (type, number, doc_id) kept in their own columns.
import { createClient } from '@libsql/client'
import type { Client as LibsqlClient, InValue, Transaction } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim()
const localPath = resolve(process.env.DB_PATH ?? resolve(here, 'data', 'adlogues.db'))

export const isRemote = Boolean(tursoUrl)
export const DB_LABEL = isRemote ? `Turso (${tursoUrl!.replace(/^libsql:\/\//, '')})` : `Local file ${localPath}`

if (!isRemote) mkdirSync(dirname(localPath), { recursive: true })

const client: LibsqlClient = createClient(
  isRemote ? { url: tursoUrl!, authToken: tursoToken } : { url: `file:${localPath.replace(/\\/g, '/')}` },
)

type Args = InValue[]
export interface Q {
  all<T>(sql: string, args?: Args): Promise<T[]>
  get<T>(sql: string, args?: Args): Promise<T | undefined>
  run(sql: string, args?: Args): Promise<{ changes: number }>
}

function wrap(ex: LibsqlClient | Transaction): Q {
  return {
    async all<T>(sql: string, args: Args = []) {
      const r = await ex.execute({ sql, args })
      return r.rows as unknown as T[]
    },
    async get<T>(sql: string, args: Args = []) {
      const r = await ex.execute({ sql, args })
      return (r.rows[0] as unknown as T) ?? undefined
    },
    async run(sql: string, args: Args = []) {
      const r = await ex.execute({ sql, args })
      return { changes: r.rowsAffected }
    },
  }
}

/** Use for single statements outside a transaction. */
export const db: Q = wrap(client)

/** Runs fn inside one write transaction; rolls back if it throws. */
export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const t = await client.transaction('write')
  try {
    const out = await fn(wrap(t))
    await t.commit()
    return out
  } catch (e) {
    await t.rollback().catch(() => {})
    throw e
  } finally {
    t.close()
  }
}

export async function allOf<T>(q: Q, table: string, order = 'created_at'): Promise<T[]> {
  const rows = await q.all<{ data: string }>(`SELECT data FROM ${table} ORDER BY ${order}`)
  return rows.map((r) => JSON.parse(r.data) as T)
}
export async function oneOf<T>(q: Q, table: string, id: string): Promise<T | undefined> {
  const r = await q.get<{ data: string }>(`SELECT data FROM ${table} WHERE id = ?`, [id])
  return r ? (JSON.parse(r.data) as T) : undefined
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS company (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS clients (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS services (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY, type TEXT NOT NULL,
    number TEXT NOT NULL UNIQUE,  -- F6: no duplicate numbers, ever
    client_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY, doc_id TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS otps (
    email TEXT PRIMARY KEY, code_hash TEXT, expires_at INTEGER,
    attempts INTEGER NOT NULL DEFAULT 0, last_sent_at INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL DEFAULT 0, sends_in_window INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_payments_doc ON payments(doc_id);
  CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
  CREATE INDEX IF NOT EXISTS idx_documents_client ON documents(client_id);
`

/** Creates tables if they don't exist. Safe to run on every start. */
export async function initDb(): Promise<void> {
  if (!isRemote) await client.execute('PRAGMA journal_mode = WAL')
  await client.executeMultiple(SCHEMA)
}

export function closeDb(): void {
  client.close()
}

// Email OTP sign-in for the two allowed users.
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { db } from './db.ts'
import {
  ALLOWED_USERS, IS_PROD, OTP_MAX_ATTEMPTS, OTP_MAX_SENDS_PER_WINDOW, OTP_RESEND_GAP_MS, OTP_TTL_MS,
  OTP_WINDOW_MS, SESSION_TTL_MS, findAllowedUser,
} from './config.ts'
import type { AllowedUser } from './config.ts'
import { sendOtpEmail } from './mailer.ts'

export const COOKIE = 'adl_session'
const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

interface OtpRow { email: string; code_hash: string | null; expires_at: number | null; attempts: number; last_sent_at: number; window_start: number; sends_in_window: number }

export async function requestOtp(rawEmail: string): Promise<void> {
  const email = String(rawEmail ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.')
  const user = findAllowedUser(email)
  if (!user) throw new HttpError(403, 'This email does not have access to Adlogues Billing.')

  const now = Date.now()
  const row = await db.get<OtpRow>('SELECT * FROM otps WHERE email = ?', [email])
  if (row && now - Number(row.last_sent_at) < OTP_RESEND_GAP_MS) {
    const wait = Math.ceil((OTP_RESEND_GAP_MS - (now - Number(row.last_sent_at))) / 1000)
    throw new HttpError(429, `Please wait ${wait} seconds before asking for a new code.`)
  }
  const inWindow = row && now - Number(row.window_start) < OTP_WINDOW_MS
  const sends = inWindow ? Number(row.sends_in_window) : 0
  if (sends >= OTP_MAX_SENDS_PER_WINDOW) throw new HttpError(429, 'Too many codes requested. Try again in 15 minutes.')

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  await db.run(`
    INSERT INTO otps (email, code_hash, expires_at, attempts, last_sent_at, window_start, sends_in_window)
    VALUES (?, ?, ?, 0, ?, ?, ?)
    ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at,
      attempts = 0, last_sent_at = excluded.last_sent_at, window_start = excluded.window_start,
      sends_in_window = excluded.sends_in_window
  `, [email, sha(`${email}:${code}`), now + OTP_TTL_MS, now, inWindow ? Number(row.window_start) : now, sends + 1])

  try {
    await sendOtpEmail(email, user.name, code)
  } catch (e) {
    console.error('Could not send OTP email:', e)
    await db.run('UPDATE otps SET code_hash = NULL, last_sent_at = 0 WHERE email = ?', [email])
    throw new HttpError(502, 'Could not send the email. Check the server email settings and try again.')
  }
}

/** Checks the code; on success creates a session and returns its raw token. */
export async function verifyOtp(rawEmail: string, rawCode: string): Promise<{ token: string; user: AllowedUser }> {
  const email = String(rawEmail ?? '').trim().toLowerCase()
  const code = String(rawCode ?? '').replace(/\D/g, '')
  const user = findAllowedUser(email)
  if (!user) throw new HttpError(403, 'This email does not have access to Adlogues Billing.')
  const row = await db.get<OtpRow>('SELECT * FROM otps WHERE email = ?', [email])
  if (!row?.code_hash || !row.expires_at) throw new HttpError(400, 'Ask for a new code first.')
  if (Date.now() > Number(row.expires_at)) throw new HttpError(400, 'This code has expired. Ask for a new one.')
  const attempts = Number(row.attempts)
  if (attempts >= OTP_MAX_ATTEMPTS) throw new HttpError(429, 'Too many wrong tries. Ask for a new code.')

  const a = Buffer.from(sha(`${email}:${code}`))
  const b = Buffer.from(String(row.code_hash))
  if (code.length !== 6 || a.length !== b.length || !timingSafeEqual(a, b)) {
    await db.run('UPDATE otps SET attempts = attempts + 1 WHERE email = ?', [email])
    const left = OTP_MAX_ATTEMPTS - attempts - 1
    throw new HttpError(400, left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Ask for a new code.')
  }

  await db.run('UPDATE otps SET code_hash = NULL, expires_at = NULL, attempts = 0 WHERE email = ?', [email])
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  await db.run('INSERT INTO sessions (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)', [sha(token), email, now + SESSION_TTL_MS, now])
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [now])
  return { token, user }
}

export function cookieOptions() {
  return { httpOnly: true, sameSite: 'lax' as const, secure: IS_PROD, maxAge: SESSION_TTL_MS, path: '/' }
}

function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return undefined
}

export async function currentUser(req: Request): Promise<AllowedUser | undefined> {
  const token = readCookie(req, COOKIE)
  if (!token) return undefined
  const row = await db.get<{ email: string; expires_at: number }>('SELECT email, expires_at FROM sessions WHERE token_hash = ?', [sha(token)])
  if (!row || Number(row.expires_at) < Date.now()) return undefined
  return findAllowedUser(String(row.email)) // someone removed from ALLOWED_USERS loses access at once
}

export async function endSession(req: Request): Promise<void> {
  const token = readCookie(req, COOKIE)
  if (token) await db.run('DELETE FROM sessions WHERE token_hash = ?', [sha(token)])
}

declare module 'express-serve-static-core' {
  interface Request { user?: AllowedUser }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = await currentUser(req)
  if (!user) { res.status(401).json({ error: 'Please sign in.' }); return }
  req.user = user
  next()
}

export const publicUsers = () => ALLOWED_USERS.map((u) => ({ id: u.email, name: u.name, email: u.email, role: u.role, status: 'active' as const }))

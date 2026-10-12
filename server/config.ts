// Who can sign in. Only these two people; every other email is refused.
// To change a role or add someone later, edit this list and restart the server.
import type { Role } from '../src/lib/types.ts'

export interface AllowedUser {
  email: string
  name: string
  role: Role
}

export const ALLOWED_USERS: AllowedUser[] = [
  { email: 'himanshudshukla@gmail.com', name: 'Himanshu Dev Shukla', role: 'owner' },
  { email: 'saurav.adlogues@gmail.com', name: 'Saurav', role: 'admin' },
]

export function findAllowedUser(email: string): AllowedUser | undefined {
  const e = email.trim().toLowerCase()
  return ALLOWED_USERS.find((u) => u.email === e)
}

export const OTP_TTL_MS = 5 * 60 * 1000 // code valid for 5 minutes
export const OTP_MAX_ATTEMPTS = 5 // wrong tries before the code is thrown away
export const OTP_RESEND_GAP_MS = 45 * 1000 // wait between sends
export const OTP_MAX_SENDS_PER_WINDOW = 5 // sends per 15 minutes
export const OTP_WINDOW_MS = 15 * 60 * 1000
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // stay signed in for 30 days

export const PORT = Number(process.env.PORT ?? 4000)
export const IS_PROD = process.env.NODE_ENV === 'production'

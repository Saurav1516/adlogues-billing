// Email OTP sign-in. Only the two people listed in server/config.ts can sign in.
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Role } from '../lib/types'
import { api } from '../lib/api'

export interface Session {
  email: string
  name: string
  role: Role
}

interface Ctx {
  session: Session | null
  loading: boolean
  requestOtp: (email: string) => Promise<void>
  verifyOtp: (email: string, code: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<Ctx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api<{ user: Session }>('/auth/me')
      .then((r) => setSession(r.user))
      .catch(() => setSession(null))
      .finally(() => setLoading(false))
    const onOut = () => setSession(null)
    window.addEventListener('adl:signed-out', onOut)
    return () => window.removeEventListener('adl:signed-out', onOut)
  }, [])

  const requestOtp = useCallback(async (email: string) => {
    await api('/auth/request-otp', { body: { email } })
  }, [])

  const verifyOtp = useCallback(async (email: string, code: string) => {
    const r = await api<{ user: Session }>('/auth/verify-otp', { body: { email, code } })
    setSession(r.user)
  }, [])

  const signOut = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }) } finally { setSession(null) }
  }, [])

  return <AuthContext.Provider value={{ session, loading, requestOtp, verifyOtp, signOut }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

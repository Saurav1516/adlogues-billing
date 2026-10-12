import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Mail, ShieldCheck } from 'lucide-react'
import { useAuth } from '../store/AuthContext'
import { errorText } from '../lib/api'
import ThemeToggle from '../components/ThemeToggle'

// Email + one-time code. Only the Adlogues owner and Saurav can sign in (server/config.ts).
export default function Login() {
  const { session, loading, requestOtp, verifyOtp } = useAuth()
  const location = useLocation()
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)
  const boxes = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  }

  const send = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const v = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(v)) { setError('Enter a valid email address'); return }
    setBusy(true); setError('')
    try {
      await requestOtp(v)
      setEmail(v); setStep('code'); setOtp(['', '', '', '', '', '']); setCooldown(45)
      setTimeout(() => boxes.current[0]?.focus(), 50)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const verify = async (digits = otp) => {
    const code = digits.join('')
    if (code.length < 6) { setError('Enter the 6-digit code'); return }
    setBusy(true); setError('')
    try {
      await verifyOtp(email, code)
    } catch (err) {
      setError(errorText(err))
      setOtp(['', '', '', '', '', ''])
      setTimeout(() => boxes.current[0]?.focus(), 50)
    } finally {
      setBusy(false)
    }
  }

  const setDigit = (i: number, v: string) => {
    const digits = v.replace(/\D/g, '')
    let next = [...otp]
    if (digits.length > 1) { // pasted the whole code
      const d = digits.slice(0, 6).split('')
      next = [...d, ...Array(6 - d.length).fill('')]
      boxes.current[Math.min(d.length, 5)]?.focus()
    } else {
      next[i] = digits
      if (digits && i < 5) boxes.current[i + 1]?.focus()
    }
    setOtp(next)
    if (next.every((x) => x)) void verify(next)
  }

  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-brand p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-bold text-brand">A</div>
          <span className="text-lg font-semibold">Adlogues Billing</span>
        </div>
        <div className="relative z-10 max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">GST invoices in under a minute. Payments you never lose track of.</h1>
          <p className="mt-4 text-white/80">Quotations, invoices, client ledgers and reminders for Adlogues, in one place.</p>
        </div>
        <div className="relative z-10 text-sm text-white/70">Private workspace · Adlogues, Noida</div>
        <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 right-20 h-80 w-80 rounded-full bg-black/10" />
      </div>

      <div className="relative flex items-center justify-center bg-surface p-6">
        <ThemeToggle className="absolute right-4 top-4" />
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand font-bold text-white">A</div>
            <span className="font-semibold">Adlogues Billing</span>
          </div>

          {step === 'email' ? (
            <form onSubmit={send} noValidate>
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="mt-1 text-sm text-muted">Enter your email. We'll send you a 6-digit code.</p>
              <label className="field-label mt-7" htmlFor="email">Email address</label>
              <input
                id="email" type="email" autoComplete="email" autoFocus className="field py-2.5"
                placeholder="you@gmail.com" value={email} onChange={(e) => { setEmail(e.target.value); setError('') }}
              />
              {error && <p className="mt-2 text-sm text-red-fg" role="alert">{error}</p>}
              <button className="btn btn-primary mt-4 w-full py-2.5" type="submit" disabled={busy}>
                <Mail size={17} /> {busy ? 'Sending code…' : 'Send code'}
              </button>
              <p className="mt-6 text-xs text-muted">Access is limited to the Adlogues team.</p>
            </form>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); void verify() }}>
              <button type="button" className="link-add mb-6 text-ink/70" onClick={() => { setStep('email'); setError('') }}>
                <ArrowLeft size={16} /> Use a different email
              </button>
              <h2 className="text-2xl font-semibold tracking-tight">Check your email</h2>
              <p className="mt-1 text-sm text-muted">We sent a 6-digit code to <span className="font-medium text-ink">{email}</span>. It expires in 5 minutes.</p>
              <div className="mt-6 flex justify-between gap-2">
                {otp.map((v, i) => (
                  <input
                    key={i} ref={(el) => { boxes.current[i] = el }} value={v} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    aria-label={`Digit ${i + 1}`} disabled={busy}
                    className="field tnum h-12 w-12 p-0 text-center text-lg font-semibold"
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Backspace' && !otp[i] && i > 0) boxes.current[i - 1]?.focus() }}
                  />
                ))}
              </div>
              {error && <p className="mt-3 text-sm text-red-fg" role="alert">{error}</p>}
              <button className="btn btn-primary mt-6 w-full py-2.5" type="submit" disabled={busy}>
                <ShieldCheck size={17} /> {busy ? 'Checking…' : 'Verify & sign in'}
              </button>
              <p className="mt-4 text-center text-sm text-muted">
                Didn't get it?{' '}
                {cooldown > 0 ? <span>Resend in {cooldown}s</span> : <button type="button" className="link-add" onClick={() => void send()}>Resend code</button>}
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

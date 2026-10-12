// Sends sign-in codes. Uses Resend if RESEND_API_KEY is set, otherwise Gmail SMTP if SMTP_USER/SMTP_PASS
// are set. With neither (or if sending fails during development), the code is printed in the terminal.
import nodemailer from 'nodemailer'
import { IS_PROD } from './config.ts'

const resendKey = process.env.RESEND_API_KEY?.trim()
const smtpUser = process.env.SMTP_USER?.trim()
const smtpPass = process.env.SMTP_PASS?.replace(/\s/g, '') // Gmail shows app passwords with spaces
const smtpHost = process.env.SMTP_HOST ?? 'smtp.gmail.com'
const smtpPort = Number(process.env.SMTP_PORT ?? 465)

export const emailProvider: 'resend' | 'smtp' | 'none' = resendKey ? 'resend' : smtpUser && smtpPass ? 'smtp' : 'none'
export const emailConfigured = emailProvider !== 'none'

// Resend: onboarding@resend.dev works without a domain, but only delivers to the Resend account's own email.
// Verify your domain at resend.com/domains, then set MAIL_FROM to an address on it (e.g. billing@adlogues.com).
const from = process.env.MAIL_FROM?.trim()
  || (emailProvider === 'resend' ? 'Adlogues Billing <onboarding@resend.dev>' : `Adlogues Billing <${smtpUser ?? 'no-reply@localhost'}>`)

const smtp = emailProvider === 'smtp'
  ? nodemailer.createTransport({ host: smtpHost, port: smtpPort, secure: smtpPort === 465, auth: { user: smtpUser, pass: smtpPass } })
  : null

export function describeEmail(): string {
  if (emailProvider === 'resend') return `sent by Resend from ${from}`
  if (emailProvider === 'smtp') return `sent by SMTP (${smtpHost}) as ${smtpUser}`
  return IS_PROD ? 'NOT configured: sign-in will fail until RESEND_API_KEY or SMTP is set' : 'NOT configured: codes print here'
}

function otpHtml(name: string, code: string) {
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:440px;margin:0 auto;padding:24px;color:#000">
    <div style="display:inline-block;background:#E9252A;color:#fff;font-weight:700;border-radius:10px;padding:8px 12px">Adlogues</div>
    <p style="margin:24px 0 8px">Hi ${name.split(' ')[0]},</p>
    <p style="margin:0 0 16px">Your Adlogues Billing sign-in code is:</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:700;background:#FDECEC;border-radius:12px;padding:16px;text-align:center">${code}</div>
    <p style="margin:16px 0 0;color:#6B6B6B;font-size:13px">It expires in 5 minutes. If you did not try to sign in, ignore this email.</p>
  </div>`
}

async function sendWithResend(to: string, subject: string, html: string, text: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string; name?: string }
    let hint = ''
    if (res.status === 403 && /own email|verify a domain/i.test(body.message ?? '')) {
      hint = '\n    → Resend can only send to your own Resend email until you verify a domain at resend.com/domains and set MAIL_FROM to an address on it.'
    } else if (res.status === 401 || res.status === 403) {
      hint = '\n    → Check RESEND_API_KEY in .env (it starts with re_).'
    } else if (res.status === 422 && /from/i.test(body.message ?? '')) {
      hint = '\n    → MAIL_FROM must use a domain verified in Resend, e.g. Adlogues Billing <billing@yourdomain.com>.'
    }
    throw new Error(`Resend error ${res.status}: ${body.message ?? res.statusText}${hint}`)
  }
}

export async function sendOtpEmail(to: string, name: string, code: string): Promise<void> {
  const subject = `${code} is your Adlogues Billing sign-in code`
  const text = `Your Adlogues Billing sign-in code is ${code}. It expires in 5 minutes.`
  const html = otpHtml(name, code)

  const printCode = (why: string) =>
    console.log(`\n  ┌─ Sign-in code for ${to}: ${code}  (${why})\n`)

  if (emailProvider === 'none') {
    if (IS_PROD) throw new Error('Email is not set up on the server (add RESEND_API_KEY or SMTP settings to .env).')
    printCode('email not configured, shown here instead')
    return
  }
  try {
    if (emailProvider === 'resend') await sendWithResend(to, subject, html, text)
    else await smtp!.sendMail({ from, to, subject, text, html })
    console.log(`  Sign-in code emailed to ${to}`)
  } catch (e) {
    console.error(`\n  ✖ Could not email the code to ${to}.\n    ${e instanceof Error ? e.message : String(e)}`)
    if (IS_PROD) throw e
    // Development: don't lock anyone out while email is being set up
    printCode('email failed, shown here instead')
  }
}

# Adlogues Billing

Internal GST billing, invoicing and payment tracking for Adlogues.

**Status:** Phase 1 (frontend) and Phase 2 (backend + email sign-in) are done.

## First-time setup (Windows, PowerShell or VS Code terminal)

Requires **Node.js 20 or newer** (check with `node -v`). Data is stored in Turso (hosted) when `TURSO_DATABASE_URL` is set in `.env`, otherwise in a local file.

```bash
npm install
copy .env.example .env      # then open .env and fill in SMTP_PASS (see "Sign-in emails" below)
npm run dev                 # starts the API (port 4000) and the app (http://localhost:5173)
```

Open http://localhost:5173 and sign in with your email.

To try it with sample clients and invoices on an **empty** database: `npm run db:demo` (it refuses to run if you already have clients).

## Who can sign in

Only these two emails. Everyone else gets "This email does not have access".

| Name | Email | Role |
|---|---|---|
| Himanshu Dev Shukla | himanshudshukla@gmail.com | Owner: can change Settings (logo, signature, QR, bank, GSTIN) |
| Saurav | saurav.adlogues@gmail.com | Admin: everything except Settings |

The list lives in `server/config.ts`. Edit it and restart the server to change a role.

Sign-in flow: enter email → a 6-digit code is emailed → enter the code. Codes expire in 5 minutes, allow 5 wrong tries, and a new one can be requested every 45 seconds. You stay signed in for 30 days on that browser.

## Sign-in emails

Pick one option in `.env`, then restart `npm run dev`. The terminal shows which one is active on the `Sign-in emails →` line.

**Option A: Resend** (free: 3,000 emails a month, 100 a day)
1. Sign up at https://resend.com with saurav.adlogues@gmail.com.
2. API Keys → Create API key → paste it into `.env` as `RESEND_API_KEY=re_...`.
3. That's enough for Saurav's codes. Resend's test sender (`onboarding@resend.dev`) only delivers to the email you signed up with.
4. For Himanshu's codes too: Domains → Add domain (e.g. adlogues.com) → add the DNS records it shows at your domain provider → wait for "Verified" → set `MAIL_FROM=Adlogues Billing <billing@adlogues.com>` in `.env`.

**Option B: Gmail** (free, no domain needed, delivers to both)
1. On the sending Gmail account, turn on 2-Step Verification.
2. Google Account → Security → App passwords → create one.
3. In `.env`: `SMTP_USER=that@gmail.com` and `SMTP_PASS=` the app password.

If an email fails while developing, the terminal shows the reason and prints the code so you can still sign in.

## Settings (owner only)

- **Logo**: shown in the sidebar and at the top of every invoice.
- **Digital signature**: printed above "Authorised signatory".
- **Payment QR code**: your bank/UPI QR image. If empty, a UPI QR with the exact invoice amount is generated from the UPI ID.
- Business details, GSTIN, bank account, invoice prefix, default terms.

Images are resized in the browser and stored in the database (PNG, JPG or WebP).

## Deploy to invoice.adlogues.com (Render + Turso)

The repo includes `render.yaml`, so Render sets everything up from it.

1. Push this folder to a **private** GitHub repository (`.env` and `server/data/` are ignored, so no secrets are uploaded).
2. On https://render.com: **New → Blueprint** → choose the repo → fill in the secrets it asks for:
   `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `RESEND_API_KEY`, and `MAIL_FROM` (leave empty until the domain is verified in Resend).
3. Wait for the deploy to finish, then open the `https://adlogues-billing.onrender.com` link Render shows.
4. Render → the service → **Settings → Custom Domains → Add** `invoice.adlogues.com`.
5. In Hostinger DNS for adlogues.com add a **CNAME** record: name `invoice`, target `adlogues-billing.onrender.com` (use the exact target Render shows).
6. Back in Render click **Verify**. HTTPS is issued automatically.

Updates: push to the `main` branch and Render redeploys on its own.

Free plan note: the app sleeps after 15 minutes without visits, and the next visit takes about a minute to wake up. Data is safe in Turso either way.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1. Frontend | Screens, live GST maths, A4 invoice | Done |
| 2. Backend + sign-in | Node API, SQLite database, server-side numbering and rules, email OTP for two users, logo/signature/QR uploads | Done |
| 3. PDF & exports | Server-side PDF, attach PDF to emails, CSV export | Next |
| 4. Emails & reminders | Send invoices by email from the app, reminder templates, daily scheduler | |

## Code map

```
server/
  index.ts      API routes (Express)
  auth.ts       Email OTP + sessions (httpOnly cookie)
  config.ts     Allowed users and OTP limits
  billing.ts    Validation, invoice numbering, balances
  db.ts         Database (Turso / local SQLite file via @libsql/client)
  mailer.ts     Gmail SMTP via nodemailer
  seed.ts       First-run company settings + service rate card
  demo.ts       Optional sample data (npm run db:demo)
src/
  lib/gst.ts    GST maths shared by app and server
  lib/api.ts    Fetch wrapper
  store/        AuthContext (session), DataContext (API data)
  pages/, components/
```

## Rules the server enforces

- Invoice numbers are assigned by the server, per type and financial year (`ADL/2026-27/0001`), and can never repeat.
- Issued invoices are locked; only drafts can be edited. Corrections go through credit notes.
- A payment can't exceed the invoice balance; an invoice with payments can't be cancelled.
- Same-state client → CGST + SGST; other state → IGST.
- No payment gateway. Payments, including TDS, are recorded by hand.

import { useRef, useState } from 'react'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useData } from '../store/DataContext'
import { useAuth } from '../store/AuthContext'
import { Card, Chip, PageHeader } from '../components/ui'
import type { Company } from '../lib/types'
import { STATES, stateFromGstin, validateGstin } from '../lib/gst'
import { errorText } from '../lib/api'
import { fileToDataUrl } from '../lib/image'

type ImageKey = 'logo' | 'signature' | 'qrImage'

const IMAGES: { key: ImageKey; title: string; hint: string; maxSide: number; box: string }[] = [
  { key: 'logo', title: 'Logo', hint: 'Shown in the app and at the top of every invoice. A transparent PNG works best.', maxSide: 800, box: 'h-20 w-40' },
  { key: 'signature', title: 'Digital signature', hint: 'Printed above “Authorised signatory”. Sign on white paper, photograph it, and crop tightly.', maxSide: 800, box: 'h-20 w-40' },
  { key: 'qrImage', title: 'Payment QR code', hint: 'Your bank or UPI app QR. If you leave this empty, a UPI QR with the exact amount is made from the UPI ID below.', maxSide: 900, box: 'h-28 w-28' },
]

function ImageField({ title, hint, value, box, maxSide, disabled, onChange }: {
  title: string; hint: string; value?: string; box: string; maxSide: number; disabled: boolean; onChange: (v: string | undefined) => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [err, setErr] = useState('')
  const pick = async (file?: File) => {
    if (!file) return
    setErr('')
    try { onChange(await fileToDataUrl(file, maxSide)) } catch (e) { setErr(errorText(e)) }
    if (input.current) input.current.value = ''
  }
  return (
    <div className="flex gap-4 rounded-xl border border-line p-4">
      <div className={`grid shrink-0 place-items-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-[repeating-conic-gradient(#f3f3f3_0%_25%,#fff_0%_50%)] bg-[length:16px_16px] ${box}`}>
        {value ? <img src={value} alt={title} className="h-full w-full object-contain p-1" /> : <ImagePlus size={22} className="text-muted" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <p className="mt-0.5 text-xs text-muted">{hint}</p>
        {!disabled && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-outline py-1.5 text-[13px]" onClick={() => input.current?.click()}>
              <ImagePlus size={15} /> {value ? 'Replace' : 'Upload'}
            </button>
            {value && <button type="button" className="btn btn-ghost py-1.5 text-[13px] text-red-fg" onClick={() => onChange(undefined)}><Trash2 size={15} /> Remove</button>}
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => void pick(e.target.files?.[0])} />
          </div>
        )}
        {err && <p className="mt-2 text-xs text-red-fg">{err}</p>}
      </div>
    </div>
  )
}

export default function Settings() {
  const { company, saveCompany, users } = useData()
  const { session } = useAuth()
  // Owner and Admin have the same access
  const isOwner = Boolean(session)
  const [c, setC] = useState<Company>(company)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const gstErr = validateGstin(c.gstin)
  const dirty = JSON.stringify(c) !== JSON.stringify(company)

  const set = <K extends keyof Company>(k: K, v: Company[K]) => { setC((p) => ({ ...p, [k]: v })); setStatus('idle') }
  const save = async () => {
    if (gstErr) return
    setStatus('saving'); setError('')
    const code = stateFromGstin(c.gstin) ?? c.stateCode
    try {
      const saved = await saveCompany({ ...c, stateCode: code, state: STATES[code] })
      setC(saved)
      setStatus('saved')
    } catch (e) {
      setError(errorText(e))
      setStatus('idle')
    }
  }

  const field = (label: string, k: keyof Company, opts: { span?: boolean; mono?: boolean } = {}) => (
    <div className={opts.span ? 'sm:col-span-2' : ''}>
      <label className="field-label">{label}</label>
      <input className={`field ${opts.mono ? 'tnum' : ''}`} value={String(c[k] ?? '')} disabled={!isOwner} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl p-6 pb-28 lg:p-8 lg:pb-28">
      <PageHeader title="Settings" subtitle="Changes here appear on every new invoice and quotation." />

      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">Logo, signature and QR</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-1">
          {IMAGES.map((im) => (
            <ImageField key={im.key} title={im.title} hint={im.hint} value={c[im.key]} box={im.box} maxSide={im.maxSide} disabled={!isOwner} onChange={(v) => set(im.key, v)} />
          ))}
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 font-semibold">Business details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('Business name', 'name')}
          <div>
            <label className="field-label">GSTIN</label>
            <input className="field tnum uppercase" value={c.gstin} disabled={!isOwner} onChange={(e) => set('gstin', e.target.value.toUpperCase().replace(/\s/g, '').slice(0, 15))} />
            {gstErr ? <p className="mt-1 text-xs text-red-fg">{gstErr}</p> : <p className="mt-1 text-xs text-muted">State: {STATES[stateFromGstin(c.gstin) ?? c.stateCode]}. Same-state clients get CGST + SGST.</p>}
          </div>
          {field('Address', 'address', { span: true })}
          {field('Email', 'email')}
          {field('Phone', 'phone')}
          {field('Invoice prefix', 'invoicePrefix', { mono: true })}
          {field('UPI ID', 'upiId', { mono: true })}
        </div>
        <h3 className="mb-3 mt-6 text-sm font-semibold">Bank account</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {field('Bank name', 'bankName')}
          {field('Account name', 'accountName')}
          {field('Account number', 'accountNumber', { mono: true })}
          {field('IFSC', 'ifsc', { mono: true })}
          <div className="sm:col-span-2">
            <label className="field-label">Default terms & conditions</label>
            <textarea className="field" rows={3} value={c.defaultTerms} disabled={!isOwner} onChange={(e) => set('defaultTerms', e.target.value)} />
          </div>
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="font-semibold">Who can sign in</h2>
        <p className="mb-4 mt-1 text-sm text-muted">Only these two emails can sign in, with a one-time code sent by email. Both have full access. Anyone else is refused.</p>
        <ul className="divide-y divide-line rounded-xl border border-line">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{u.name}</div>
                <div className="text-xs text-muted">{u.email}</div>
              </div>
              <Chip tone={u.role === 'owner' ? 'red' : 'blue'}>{u.role === 'owner' ? 'Owner' : 'Admin'}</Chip>
            </li>
          ))}
        </ul>
      </Card>

      {isOwner && (dirty || status === 'saved' || error) && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
          <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
            {error && <span className="mr-auto text-sm text-red-fg" role="alert">{error}</span>}
            {status === 'saved' && !dirty && <span className="text-sm text-green-fg">Saved</span>}
            {dirty && <button className="btn btn-outline" onClick={() => { setC(company); setError('') }}>Discard</button>}
            {dirty && <button className="btn btn-primary" onClick={() => void save()} disabled={!!gstErr || status === 'saving'}>{status === 'saving' ? 'Saving…' : 'Save changes'}</button>}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'
import { Modal } from './ui'
import type { Client } from '../lib/types'
import { STATES, stateFromGstin, validateGstin } from '../lib/gst'
import { uid } from '../lib/format'
import { errorText } from '../lib/api'

const EMPTY: Client = { id: '', name: '', gstin: '', contactPerson: '', email: '', phone: '', address: '', stateCode: '09', paymentTermsDays: 15 }

/** F1: client master. GSTIN is validated and fills the state automatically. */
export default function ClientForm({ open, initial, onClose, onSave }: {
  open: boolean; initial?: Client; onClose: () => void; onSave: (c: Client) => Promise<void> | void
}) {
  const [c, setC] = useState<Client>(initial ?? EMPTY)
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [serverErr, setServerErr] = useState('')
  const gstErr = validateGstin(c.gstin)
  const nameErr = c.name.trim() ? null : 'Client name is required'
  const emailErr = c.email && !/^\S+@\S+\.\S+$/.test(c.email) ? 'Email looks wrong' : null
  const set = <K extends keyof Client>(k: K, v: Client[K]) => setC((p) => ({ ...p, [k]: v }))

  const onGstin = (v: string) => {
    const up = v.toUpperCase().replace(/\s/g, '').slice(0, 15)
    const code = stateFromGstin(up)
    setC((p) => ({ ...p, gstin: up, stateCode: code && up.length >= 2 ? code : p.stateCode }))
  }

  const submit = async () => {
    setTouched(true)
    if (gstErr || nameErr || emailErr || saving) return
    setSaving(true); setServerErr('')
    try {
      await onSave({ ...c, id: c.id || uid('c'), name: c.name.trim() })
    } catch (e) {
      setServerErr(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open} title={initial ? 'Edit client' : 'Create client'} onClose={onClose} width="max-w-2xl"
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Saving…' : 'Save client'}</button></>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="field-label">Client / business name *</label>
          <input className="field" value={c.name} onChange={(e) => set('name', e.target.value)} autoFocus />
          {touched && nameErr && <p className="mt-1 text-xs text-red-fg">{nameErr}</p>}
        </div>
        <div>
          <label className="field-label">GSTIN (optional)</label>
          <input className="field tnum uppercase" value={c.gstin} onChange={(e) => onGstin(e.target.value)} placeholder="07AAACN1234K1Z2" />
          {c.gstin && gstErr && <p className="mt-1 text-xs text-red-fg">{gstErr}</p>}
          {c.gstin && !gstErr && <p className="mt-1 text-xs text-green-fg">Valid · {STATES[c.stateCode]}</p>}
        </div>
        <div>
          <label className="field-label">State (place of supply)</label>
          <select className="field" value={c.stateCode} onChange={(e) => set('stateCode', e.target.value)} disabled={!!c.gstin && !gstErr}>
            {Object.entries(STATES).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
          </select>
        </div>
        <div>
          <label className="field-label">Contact person</label>
          <input className="field" value={c.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
        </div>
        <div>
          <label className="field-label">Mobile (for WhatsApp)</label>
          <input className="field tnum" inputMode="numeric" value={c.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} />
        </div>
        <div>
          <label className="field-label">Email</label>
          <input className="field" type="email" value={c.email} onChange={(e) => set('email', e.target.value)} />
          {touched && emailErr && <p className="mt-1 text-xs text-red-fg">{emailErr}</p>}
        </div>
        <div>
          <label className="field-label">Payment terms (days)</label>
          <input className="field tnum" type="number" min={0} value={c.paymentTermsDays} onChange={(e) => set('paymentTermsDays', Math.max(0, parseInt(e.target.value || '0', 10)))} />
        </div>
        <div className="sm:col-span-2">
          <label className="field-label">Billing address</label>
          <textarea className="field" rows={2} value={c.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        {serverErr && <p className="text-sm text-red-fg sm:col-span-2" role="alert">{serverErr}</p>}
      </div>
    </Modal>
  )
}

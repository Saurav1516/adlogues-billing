import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Plus } from 'lucide-react'
import { useData } from '../store/DataContext'
import { Card, Chip, Modal, PageHeader } from '../components/ui'
import type { ServiceItem } from '../lib/types'
import { GST_RATES } from '../lib/gst'
import { money, rupeesInput, toPaise, uid } from '../lib/format'
import { errorText } from '../lib/api'

/** F2: service catalogue. Picking a service on an invoice fills rate, SAC and GST. */
function ServiceForm({ initial, onClose, onSave }: { initial?: ServiceItem; onClose: () => void; onSave: (s: ServiceItem) => Promise<void> }) {
  const [s, setS] = useState<ServiceItem>(initial ?? { id: '', name: '', sac: '', ratePaise: 0, gstRate: 18 })
  const [rate, setRate] = useState(rupeesInput(s.ratePaise))
  const [err, setErr] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!s.name.trim()) return setErr('Name is required')
    if (s.sac && !/^\d{4,8}$/.test(s.sac)) return setErr('SAC should be 4 to 8 digits')
    setSaving(true); setErr('')
    try {
      await onSave({ ...s, id: s.id || uid('s'), name: s.name.trim(), ratePaise: toPaise(rate) })
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Modal open title={initial ? 'Edit service' : 'Create service'} onClose={onClose}
      footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={() => void submit()}>{saving ? 'Saving…' : 'Save service'}</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><label className="field-label">Service name *</label><input className="field" autoFocus value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
        <div><label className="field-label">SAC code</label><input className="field tnum" value={s.sac} onChange={(e) => setS({ ...s, sac: e.target.value.replace(/\D/g, '').slice(0, 8) })} placeholder="998361" /></div>
        <div><label className="field-label">GST rate</label><select className="field" value={s.gstRate} onChange={(e) => setS({ ...s, gstRate: parseInt(e.target.value, 10) })}>{GST_RATES.map((r) => <option key={r} value={r}>{r}%</option>)}</select></div>
        <div className="sm:col-span-2"><label className="field-label">Default rate (₹, before GST)</label><input className="field tnum" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} /></div>
        {err && <p className="text-sm text-red-fg sm:col-span-2">{err}</p>}
      </div>
    </Modal>
  )
}

export default function Services() {
  const { services, saveService } = useData()
  const [params, setParams] = useSearchParams()
  const [editing, setEditing] = useState<ServiceItem | null>(null)
  const creating = params.get('new') === '1'
  return (
    <div className="mx-auto max-w-5xl p-6 lg:p-8">
      <PageHeader title="Services" subtitle="Your rate card. Used to fill invoice lines in one pick." actions={<button className="btn btn-primary" onClick={() => setParams({ new: '1' })}><Plus size={16} /> Create service</button>} />
      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-5 py-2.5 font-medium">Service</th><th className="px-5 py-2.5 font-medium">SAC</th>
              <th className="px-5 py-2.5 font-medium">GST</th><th className="px-5 py-2.5 text-right font-medium">Rate</th><th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {services.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="px-5 py-3 font-medium">{s.name}</td>
                <td className="tnum px-5 py-3">{s.sac || '—'}</td>
                <td className="px-5 py-3"><Chip tone="blue">{s.gstRate}%</Chip></td>
                <td className="tnum px-5 py-3 text-right">{money(s.ratePaise)}</td>
                <td className="px-3"><button className="btn-ghost rounded-md p-1.5" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}><Pencil size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {(creating || editing) && (
        <ServiceForm initial={editing ?? undefined} onClose={() => { setEditing(null); setParams({}) }} onSave={async (s) => { await saveService(s); setEditing(null); setParams({}) }} />
      )}
    </div>
  )
}

import { QRCodeSVG } from 'qrcode.react'
import type { BillingDoc, Client, Company } from '../lib/types'
import { STATES, amountInWords, computeTotals } from '../lib/gst'
import { fmtDate, money } from '../lib/format'

const TITLE: Record<BillingDoc['type'], string> = {
  invoice: 'Tax Invoice', quotation: 'Quotation', proforma: 'Proforma Invoice', credit_note: 'Credit Note',
}

/** UPI deep link from Adlogues' own UPI ID. No payment gateway (PRD A5). */
export function upiLink(company: Company, amountPaise: number, note: string): string {
  const p = new URLSearchParams({ pa: company.upiId, pn: company.name, am: (amountPaise / 100).toFixed(2), cu: 'INR', tn: note })
  return `upi://pay?${p.toString()}`
}

/** F9: the one Adlogues invoice theme. Used for Preview, the document page and print/PDF. */
export default function InvoicePaper({ doc, client, company, balancePaise, linkedNumber }: {
  doc: BillingDoc; client?: Client; company: Company; balancePaise?: number; linkedNumber?: string
}) {
  const interState = (client?.stateCode ?? company.stateCode) !== company.stateCode
  const t = computeTotals(doc.lines, { gstEnabled: doc.gstEnabled, interState, extraDiscountPaise: doc.extraDiscountPaise, roundOff: doc.roundOff })
  const title = doc.type === 'invoice' && !doc.gstEnabled ? 'Invoice' : TITLE[doc.type]
  const payable = balancePaise ?? t.total
  const showPay = (doc.type === 'invoice' || doc.type === 'proforma') && payable > 0 && Boolean(company.qrImage || company.upiId)

  return (
    <div className="print-area mx-auto w-full max-w-[820px] bg-white p-8 text-[13px] leading-relaxed text-black shadow-sm sm:p-10">
      <div className="flex items-start justify-between gap-6 border-b-4 border-brand pb-5">
        <div>
          <div className="flex items-center gap-3">
            {company.logo
              ? <img src={company.logo} alt={company.name} className="h-14 max-w-[220px] object-contain object-left" />
              : <>
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-lg font-bold text-white">{company.name.slice(0, 1)}</div>
                <div className="text-xl font-semibold tracking-tight">{company.name}</div>
              </>}
          </div>
          <div className="mt-3 max-w-xs text-xs text-black/70">
            {company.address}<br />
            {company.phone} · {company.email}
            {doc.gstEnabled && company.gstin && <><br /><span className="font-medium text-black">GSTIN {company.gstin}</span></>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-brand">{title}</div>
          <div className="tnum mt-1 text-lg font-semibold">{doc.number}</div>
          <table className="mt-2 ml-auto text-xs">
            <tbody>
              <tr><td className="pr-3 text-muted">Date</td><td className="tnum text-right">{fmtDate(doc.issueDate)}</td></tr>
              {doc.type !== 'credit_note' && <tr><td className="pr-3 text-muted">{doc.type === 'quotation' ? 'Valid till' : 'Due date'}</td><td className="tnum text-right">{fmtDate(doc.dueDate)}</td></tr>}
              {linkedNumber && <tr><td className="pr-3 text-muted">{doc.type === 'credit_note' ? 'Against' : 'Ref.'}</td><td className="tnum text-right">{linkedNumber}</td></tr>}
              {doc.gstEnabled && <tr><td className="pr-3 text-muted">Place of supply</td><td className="text-right">{STATES[client?.stateCode ?? company.stateCode]}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Bill to</div>
          <div className="mt-1 font-semibold">{client?.name ?? 'Select a client'}</div>
          {client && <div className="text-xs text-black/70">
            {client.address}<br />
            {client.contactPerson && <>{client.contactPerson} · </>}{client.phone}
            {doc.gstEnabled && client.gstin && <><br /><span className="font-medium text-black">GSTIN {client.gstin}</span></>}
          </div>}
        </div>
      </div>

      <table className="mt-6 w-full text-xs">
        <thead>
          <tr className="bg-brand-soft text-left">
            <th className="w-8 px-2 py-2 font-semibold">#</th>
            <th className="px-2 py-2 font-semibold">Service</th>
            <th className="px-2 py-2 font-semibold">SAC</th>
            <th className="px-2 py-2 text-right font-semibold">Qty</th>
            <th className="px-2 py-2 text-right font-semibold">Rate</th>
            {doc.lines.some((l) => l.discountPct) && <th className="px-2 py-2 text-right font-semibold">Disc.</th>}
            {doc.gstEnabled && <th className="px-2 py-2 text-right font-semibold">GST</th>}
            <th className="px-2 py-2 text-right font-semibold">Amount</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l, i) => (
            <tr key={l.id} className="border-b border-line align-top">
              <td className="px-2 py-2 text-muted">{i + 1}</td>
              <td className="px-2 py-2 font-medium">{l.description || '—'}</td>
              <td className="tnum px-2 py-2">{l.sac}</td>
              <td className="tnum px-2 py-2 text-right">{l.qty}</td>
              <td className="tnum px-2 py-2 text-right">{money(l.ratePaise)}</td>
              {doc.lines.some((x) => x.discountPct) && <td className="tnum px-2 py-2 text-right">{l.discountPct ? `${l.discountPct}%` : '—'}</td>}
              {doc.gstEnabled && <td className="tnum px-2 py-2 text-right">{l.gstRate}%</td>}
              <td className="tnum px-2 py-2 text-right">{money(t.lineAmounts[i])}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 grid grid-cols-[1fr_260px] gap-6">
        <div className="space-y-4 text-xs">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Amount in words</div>
            <div className="mt-0.5 font-medium">{amountInWords(t.total)}</div>
          </div>
          {doc.gstEnabled && t.tax > 0 && (
            <table className="w-full max-w-sm">
              <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Taxable</th>{interState ? <th className="py-1 font-medium">IGST</th> : <><th className="py-1 font-medium">CGST</th><th className="py-1 font-medium">SGST</th></>}</tr></thead>
              <tbody>{t.byRate.filter((r) => r.rate > 0).map((r) => (
                <tr key={r.rate} className="tnum">
                  <td className="py-0.5">{money(r.taxable)}</td>
                  {interState ? <td>{money(r.igst)} @{r.rate}%</td> : <><td>{money(r.cgst)} @{r.rate / 2}%</td><td>{money(r.sgst)} @{r.rate / 2}%</td></>}
                </tr>
              ))}</tbody>
            </table>
          )}
          {doc.notes && <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Notes</div><div className="mt-0.5 whitespace-pre-line">{doc.notes}</div></div>}
        </div>
        <table className="tnum h-fit w-full text-xs">
          <tbody>
            <tr><td className="py-1 text-muted">Subtotal</td><td className="py-1 text-right">{money(t.subtotal)}</td></tr>
            {t.extraDiscount > 0 && <tr><td className="py-1 text-muted">Discount</td><td className="py-1 text-right">-{money(t.extraDiscount)}</td></tr>}
            {doc.gstEnabled && (interState
              ? <tr><td className="py-1 text-muted">IGST</td><td className="py-1 text-right">{money(t.igst)}</td></tr>
              : <><tr><td className="py-1 text-muted">CGST</td><td className="py-1 text-right">{money(t.cgst)}</td></tr>
                <tr><td className="py-1 text-muted">SGST</td><td className="py-1 text-right">{money(t.sgst)}</td></tr></>)}
            {t.roundOff !== 0 && <tr><td className="py-1 text-muted">Round off</td><td className="py-1 text-right">{t.roundOff > 0 ? '+' : '-'}{money(Math.abs(t.roundOff))}</td></tr>}
            <tr className="border-t-2 border-black text-sm font-semibold"><td className="py-2">Total</td><td className="py-2 text-right">{money(t.total)}</td></tr>
            {balancePaise !== undefined && balancePaise !== t.total && (
              <tr className="font-semibold text-brand"><td className="py-1">Balance due</td><td className="py-1 text-right">{money(balancePaise)}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8 grid grid-cols-[1fr_auto] items-end gap-6 border-t border-line pt-5 text-xs">
        <div className="space-y-3">
          {doc.type !== 'credit_note' && (
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Bank details</div>
              <div className="mt-0.5">{company.accountName} · {company.bankName}<br />A/c {company.accountNumber} · IFSC {company.ifsc}<br />UPI {company.upiId}</div>
            </div>
          )}
          {doc.terms && <div><div className="text-[11px] font-semibold uppercase tracking-wider text-muted">Terms & conditions</div><div className="mt-0.5 whitespace-pre-line text-black/70">{doc.terms}</div></div>}
        </div>
        <div className="flex items-end gap-6">
          {showPay && (
            <div className="text-center">
              {company.qrImage
                ? <img src={company.qrImage} alt="Payment QR code" className="h-[84px] w-[84px] object-contain" />
                : <QRCodeSVG value={upiLink(company, payable, doc.number)} size={84} level="M" />}
              <div className="mt-1 text-[10px] text-muted">Scan to pay {money(payable, { compact: true })}</div>
            </div>
          )}
          <div className="w-40 text-center">
            {company.signature
              ? <img src={company.signature} alt="Authorised signature" className="mx-auto h-12 max-w-[150px] object-contain" />
              : <div className="h-12" />}
            <div className="border-t border-black/40 pt-1 text-[11px] text-black/70">For {company.name}<br />Authorised signatory</div>
          </div>
        </div>
      </div>
    </div>
  )
}

import type { LineItem } from './types'

/** GST state codes (first two digits of a GSTIN). */
export const STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
  '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
  '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
  '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka',
  '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
}

export const GST_RATES = [0, 5, 12, 18, 28]

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

/** F1: format check, plus a valid state code. */
export function validateGstin(gstin: string): string | null {
  const v = gstin.trim().toUpperCase()
  if (!v) return null // GSTIN is optional (unregistered clients)
  if (v.length !== 15) return 'GSTIN must be 15 characters'
  if (!GSTIN_RE.test(v)) return 'GSTIN format looks wrong'
  if (!STATES[v.slice(0, 2)]) return 'Unknown state code in GSTIN'
  return null
}

export function stateFromGstin(gstin: string): string | null {
  const code = gstin.trim().slice(0, 2)
  return STATES[code] ? code : null
}

export interface TaxRow {
  rate: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
}

export interface Totals {
  subtotal: number // after line discounts, before extra discount
  extraDiscount: number
  taxable: number
  cgst: number
  sgst: number
  igst: number
  tax: number
  roundOff: number
  total: number
  byRate: TaxRow[]
  lineAmounts: number[] // per line, after line discount, before tax
}

export function lineAmount(l: LineItem): number {
  return Math.round(l.qty * l.ratePaise * (1 - (l.discountPct || 0) / 100))
}

/**
 * F3/F4: live totals. Same state -> CGST + SGST (half each). Different state -> IGST.
 * The extra (invoice-level) discount is spread across lines in proportion to their value,
 * so tax is charged on the discounted amount.
 */
export function computeTotals(
  lines: LineItem[],
  opts: { gstEnabled: boolean; interState: boolean; extraDiscountPaise: number; roundOff: boolean },
): Totals {
  const lineAmounts = lines.map(lineAmount)
  const subtotal = lineAmounts.reduce((a, b) => a + b, 0)
  const extraDiscount = Math.min(Math.max(opts.extraDiscountPaise, 0), subtotal)
  const factor = subtotal > 0 ? (subtotal - extraDiscount) / subtotal : 0

  const groups = new Map<number, number>()
  lines.forEach((l, i) => {
    const rate = opts.gstEnabled ? l.gstRate : 0
    groups.set(rate, (groups.get(rate) ?? 0) + lineAmounts[i] * factor)
  })

  const byRate: TaxRow[] = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([rate, raw]) => {
      const taxable = Math.round(raw)
      const tax = Math.round((taxable * rate) / 100)
      if (opts.interState) return { rate, taxable, cgst: 0, sgst: 0, igst: tax }
      const cgst = Math.round(tax / 2)
      return { rate, taxable, cgst, sgst: tax - cgst, igst: 0 }
    })

  const taxable = byRate.reduce((a, r) => a + r.taxable, 0)
  const cgst = byRate.reduce((a, r) => a + r.cgst, 0)
  const sgst = byRate.reduce((a, r) => a + r.sgst, 0)
  const igst = byRate.reduce((a, r) => a + r.igst, 0)
  const tax = cgst + sgst + igst
  const exact = taxable + tax
  const total = opts.roundOff ? Math.round(exact / 100) * 100 : exact

  return {
    subtotal, extraDiscount, taxable, cgst, sgst, igst, tax,
    roundOff: total - exact, total, byRate, lineAmounts,
  }
}

/** Financial year label for a date, April to March: 2026-10-12 -> "2026-27". */
export function financialYear(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00')
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen']
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

function twoDigits(n: number): string {
  if (n < 20) return ONES[n]
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`
}
function threeDigits(n: number): string {
  const h = Math.floor(n / 100)
  const rest = n % 100
  return [h ? `${ONES[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ')
}

/** F11: Indian numbering (lakh, crore). 123456 rupees -> "One Lakh Twenty Three Thousand ...". */
export function amountInWords(paise: number): string {
  const rupees = Math.floor(Math.abs(paise) / 100)
  const p = Math.abs(paise) % 100
  if (rupees === 0 && p === 0) return 'Zero Rupees Only'
  const parts: string[] = []
  const crore = Math.floor(rupees / 1e7)
  const lakh = Math.floor((rupees % 1e7) / 1e5)
  const thousand = Math.floor((rupees % 1e5) / 1e3)
  const rest = rupees % 1000
  if (crore) parts.push(`${threeDigits(crore)} Crore`)
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`)
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`)
  if (rest) parts.push(threeDigits(rest))
  let words = parts.join(' ')
  words = words ? `${words} Rupees` : ''
  if (p) words = `${words}${words ? ' and ' : ''}${twoDigits(p)} Paise`
  return `${words} Only`
}

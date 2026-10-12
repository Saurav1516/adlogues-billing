// First-run defaults used by the server (server/seed.ts). Replace the company details in Settings.
// Sample clients and invoices live in server/demo.ts (npm run db:demo).
import type { Company, ServiceItem } from '../lib/types'

export const company: Company = {
  name: 'Adlogues',
  gstin: '09ABCDE1234F1Z5', // sample: replace in Settings
  address: 'Sector 63, Noida, Uttar Pradesh 201301',
  state: 'Uttar Pradesh',
  stateCode: '09',
  email: 'accounts@adlogues.com',
  phone: '+91 98765 43210',
  bankName: 'HDFC Bank',
  accountName: 'Adlogues',
  accountNumber: '50200012345678',
  ifsc: 'HDFC0001234',
  upiId: 'adlogues@hdfcbank',
  invoicePrefix: 'ADL',
  defaultTerms: '1. Payment due within the agreed credit period.\n2. Please quote the invoice number when paying.\n3. Subject to Noida jurisdiction.',
}

export const services: ServiceItem[] = [
  { id: 's1', name: 'Social Media Management (monthly)', sac: '998361', ratePaise: 4500000, gstRate: 18 },
  { id: 's2', name: 'Meta Ads Campaign Management', sac: '998361', ratePaise: 2500000, gstRate: 18 },
  { id: 's3', name: 'Website Design & Development', sac: '998314', ratePaise: 12000000, gstRate: 18 },
  { id: 's4', name: 'Brand Identity Design', sac: '998391', ratePaise: 6000000, gstRate: 18 },
  { id: 's5', name: 'Video Production (per video)', sac: '999612', ratePaise: 1800000, gstRate: 18 },
  { id: 's6', name: 'Event Branding & Collaterals', sac: '998391', ratePaise: 3500000, gstRate: 18 },
]

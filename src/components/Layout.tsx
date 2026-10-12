import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ChevronDown, CreditCard, FileText, FileSignature, LayoutDashboard, LogOut, Menu, Package,
  Plus, ReceiptText, Settings, Undo2, UserPlus, Users, Wallet, X,
} from 'lucide-react'
import { useAuth } from '../store/AuthContext'
import { useData } from '../store/DataContext'
import { initials } from '../lib/format'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/invoices', label: 'Sales Invoices', icon: ReceiptText },
  { to: '/quotations', label: 'Quotations', icon: FileSignature },
  { to: '/payments', label: 'Payments In', icon: Wallet },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/services', label: 'Services', icon: Package },
]

// Mirrors MyBillBook's create dropdown, trimmed to the agency MVP (PRD 9)
const CREATE = [
  { group: 'General', items: [
    { label: 'Create Client', to: '/clients?new=1', icon: UserPlus },
    { label: 'Create Service', to: '/services?new=1', icon: Package },
  ] },
  { group: 'Sales transactions', items: [
    { label: 'Quotation', to: '/new/quotation', icon: FileSignature },
    { label: 'Payment In', to: '/payments?new=1', icon: CreditCard },
    { label: 'Credit Note', to: '/new/credit_note', icon: Undo2 },
    { label: 'Proforma Invoice', to: '/new/proforma', icon: FileText },
  ] },
]

function CreateButton({ onNavigate }: { onNavigate: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  const go = (to: string) => { setOpen(false); onNavigate(); navigate(to) }
  return (
    <div className="relative" ref={ref}>
      <div className="flex overflow-hidden rounded-xl bg-brand text-white shadow-sm">
        <button className="flex flex-1 items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13.5px] font-medium hover:bg-brand-dark" onClick={() => go('/new/invoice')}>
          <Plus size={17} /> Create Sales Invoice
        </button>
        <button className="border-l border-white/25 px-2.5 hover:bg-brand-dark" onClick={() => setOpen((o) => !o)} aria-label="More create options" aria-expanded={open}>
          <ChevronDown size={17} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 rounded-xl border border-line bg-white py-2 shadow-lg">
          {CREATE.map((g) => (
            <div key={g.group} className="pb-1">
              <div className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</div>
              {g.items.map((it) => (
                <button key={it.label} className="flex w-full items-center gap-3 px-3.5 py-2 text-left text-sm hover:bg-brand-soft" onClick={() => go(it.to)}>
                  <it.icon size={16} className="text-muted" /> {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function Layout() {
  const { session, signOut } = useAuth()
  const { company } = useData()
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setMobileOpen(false), [location.pathname])

  const sidebar = (
    <aside className="flex h-full w-64 flex-col border-r border-line bg-white">
      <div className="px-4 pb-4 pt-5">
        {company.logo ? (
          <div>
            <img src={company.logo} alt={company.name} className="h-10 max-w-[200px] object-contain object-left" />
            <div className="mt-1.5 truncate text-xs text-muted">{company.gstin || 'GSTIN not set'}</div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-sm font-bold text-white">{initials(company.name)}</div>
            <div className="min-w-0">
              <div className="truncate font-semibold">{company.name}</div>
              <div className="truncate text-xs text-muted">{company.gstin || 'GSTIN not set'}</div>
            </div>
          </div>
        )}
      </div>
      <div className="px-4"><CreateButton onNavigate={() => setMobileOpen(false)} /></div>
      <nav className="mt-5 flex-1 space-y-0.5 overflow-y-auto px-3">
        <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">Billing</div>
        {NAV.map((n) => (
          <NavLink
            key={n.to} to={n.to} end={n.end}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${isActive ? 'bg-brand-soft font-medium text-brand' : 'text-black/80 hover:bg-neutral-100'}`}
          >
            <n.icon size={18} /> {n.label}
          </NavLink>
        ))}
        <div className="px-2 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">Business</div>
        <NavLink to="/settings" className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${isActive ? 'bg-brand-soft font-medium text-brand' : 'text-black/80 hover:bg-neutral-100'}`}>
          <Settings size={18} /> Settings
        </NavLink>
      </nav>
      <div className="border-t border-line p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-neutral-900 text-xs font-semibold text-white">{initials(session?.name ?? 'A')}</div>
          <div className="min-w-0 flex-1" title={session?.email}>
            <div className="truncate text-sm font-medium">Adlogues</div>
            <div className="truncate text-xs text-muted">{session?.email}</div>
          </div>
          <button className="btn-ghost rounded-md p-1.5" onClick={() => void signOut()} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
        </div>
      </div>
    </aside>
  )

  return (
    <div className="flex h-full">
      <div className="no-print hidden lg:block">{sidebar}</div>
      {mobileOpen && (
        <div className="no-print fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-64">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex items-center gap-3 border-b border-line bg-white px-4 py-3 lg:hidden">
          <button className="btn-ghost rounded-md p-1.5" onClick={() => setMobileOpen((o) => !o)} aria-label="Menu">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span className="font-semibold">{company.name} Billing</span>
        </header>
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

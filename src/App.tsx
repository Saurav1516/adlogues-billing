import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './store/AuthContext'
import { DataProvider } from './store/DataContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import DocumentsList from './pages/DocumentsList'
import InvoiceEditor from './pages/InvoiceEditor'
import DocumentView from './pages/DocumentView'
import { ClientLedger, ClientsList } from './pages/Clients'
import Services from './pages/Services'
import Payments from './pages/Payments'
import Settings from './pages/Settings'

function Splash() {
  return (
    <div className="grid h-full place-items-center">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-label="Loading" />
    </div>
  )
}

/** Signed-in area: checks the session, then loads data from the API. */
function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Splash />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <DataProvider><Outlet /></DataProvider>
}

/** Remount the editor on each visit so "Save & New" starts a clean form. */
function Editor() {
  const location = useLocation()
  return <InvoiceEditor key={location.key} />
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<RequireAuth />}>
            <Route path="/new/:type" element={<Editor />} />
            <Route path="/documents/:id/edit" element={<Editor />} />
            <Route element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="/invoices" element={<DocumentsList kind="invoices" />} />
              <Route path="/quotations" element={<DocumentsList kind="quotations" />} />
              <Route path="/documents/:id" element={<DocumentView />} />
              <Route path="/clients" element={<ClientsList />} />
              <Route path="/clients/:id" element={<ClientLedger />} />
              <Route path="/services" element={<Services />} />
              <Route path="/payments" element={<Payments />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

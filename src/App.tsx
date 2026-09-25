import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { StartupAnimation } from './features/startup/StartupAnimation'
import { LicenseActivation } from './features/license/LicenseActivation'
import { Login } from './features/auth/Login'
import { ResetPassword } from './features/auth/ResetPassword'
import { AppShell } from './components/layout/AppShell'
import { Toaster } from './components/Toaster'
import { useAuth } from './store/auth'
import { useDB } from './store/db'
import { currentStatus } from './services/license'
import { isSupabase } from './lib/supabase'
import { Wordmark } from './components/Logo'

import { ControlRoom } from './features/dashboard/ControlRoom'
import { PatientsList } from './features/patients/PatientsList'
import { PatientRegistration } from './features/patients/PatientRegistration'
import { PatientProfile } from './features/patients/PatientProfile'
import { Appointments } from './features/appointments/Appointments'
import { OpdQueue } from './features/queue/OpdQueue'
import { Emergency } from './features/emergency/Emergency'
import { Consultations } from './features/consultations/Consultations'
import { Lab } from './features/lab/Lab'
import { Pharmacy } from './features/pharmacy/Pharmacy'
import { Beds } from './features/beds/Beds'
import { Ipd } from './features/ipd/Ipd'
import { Billing } from './features/billing/Billing'
import { Reports } from './features/reports/Reports'
import { NotificationsPage } from './features/notifications/Notifications'
import { AuditLogPage } from './features/audit/Audit'
import { Settings } from './features/admin/Settings'
import { LicenseManager } from './features/admin/LicenseManager'
import { Support } from './features/support/Support'
import { Profile } from './features/profile/Profile'
import { Portal } from './features/portal/Portal'
import { PatientPortalLogin } from './features/portal/PatientPortalLogin'
import { isPatientHost } from './lib/host'

export default function App() {
  const [booted, setBooted] = useState(() => sessionStorage.getItem('nxt.booted') === '1')
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)
  const recovery = useAuth((s) => s.recovery)
  const restore = useAuth((s) => s.restore)
  const license = useDB((s) => s.db.license) // reactive dependency

  useEffect(() => { restore() }, [restore])

  if (!booted) {
    return (
      <>
        <StartupAnimation onDone={() => { sessionStorage.setItem('nxt.booted', '1'); setBooted(true) }} />
        <Toaster />
      </>
    )
  }

  // Wait for the Supabase session to be restored before deciding what to show.
  if (isSupabase && !ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-surface-muted">
        <div className="flex flex-col items-center gap-3">
          <Wordmark />
          <div className="h-1 w-32 overflow-hidden rounded-full bg-surface-line">
            <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-500" />
          </div>
        </div>
      </div>
    )
  }

  // Password recovery link opened the app — force set-new-password.
  if (isSupabase && recovery) {
    return (<><ResetPassword /><Toaster /></>)
  }

  const status = currentStatus()

  // Not signed in
  if (!user) {
    // On the dedicated patient subdomain (patient.<domain>), the site ROOT and
    // every path open the Patient Portal login. On the main domain, only
    // /patient-portal opens it (compatibility route) and everything else uses
    // the staff/combined sign-in.
    // Local DEV mode uses the client-side license gate; Supabase mode enforces
    // licensing server-side, so go straight to sign-in.
    if (isPatientHost()) {
      return (
        <>
          <Routes>
            <Route path="*" element={<PatientPortalLogin />} />
          </Routes>
          <Toaster />
        </>
      )
    }
    const staffEntry = (!isSupabase && status.status === 'unlicensed')
      ? <LicenseActivation onActivated={() => { /* re-renders via store */ }} />
      : <Login />
    return (
      <>
        <Routes>
          <Route path="/patient-portal" element={<PatientPortalLogin />} />
          <Route path="*" element={staffEntry} />
        </Routes>
        <Toaster />
      </>
    )
  }

  // Patient portal (canonical URL: /patient-portal — matches the SMS link)
  if (user.role === 'patient') {
    return (
      <>
        <Routes>
          <Route path="/patient-portal/*" element={<Portal />} />
          <Route path="/portal/*" element={<Portal />} />
          <Route path="*" element={<Navigate to="/patient-portal" replace />} />
        </Routes>
        <Toaster />
      </>
    )
  }

  // Staff app
  void license
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<ControlRoom />} />
          <Route path="/patients" element={<PatientsList />} />
          <Route path="/patients/new" element={<PatientRegistration />} />
          <Route path="/patients/:id" element={<PatientProfile />} />
          <Route path="/appointments" element={<Appointments />} />
          <Route path="/queue" element={<OpdQueue />} />
          <Route path="/emergency" element={<Emergency />} />
          <Route path="/consultations" element={<Consultations />} />
          <Route path="/lab" element={<Lab />} />
          <Route path="/pharmacy" element={<Pharmacy />} />
          <Route path="/beds" element={<Beds />} />
          <Route path="/ipd" element={<Ipd />} />
          <Route path="/billing" element={<Billing />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/audit" element={<AuditLogPage />} />
          <Route path="/admin" element={<Settings />} />
          <Route path="/admin/license" element={<LicenseManager />} />
          <Route path="/support" element={<Support />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
      <Toaster />
    </>
  )
}

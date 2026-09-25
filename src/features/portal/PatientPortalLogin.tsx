import { useState } from 'react'
import { LogIn, IdCard, Lock, HeartPulse } from 'lucide-react'
import { Wordmark } from '../../components/Logo'
import { Field } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'

/**
 * Public, mobile-first Patient Portal login — the page a patient reaches by
 * tapping the HTTPS link in their registration SMS/RCS. Opens in any browser
 * (no app/PWA install). Authentication is server-side (Supabase Auth); this
 * page only collects the Login ID + password. Distinct from the staff sign-in.
 */
export function PatientPortalLogin() {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const loginPatient = useAuth((s) => s.loginPatient)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!loginId.trim() || !password) return toast.error('Enter your Login ID and password')
    setBusy(true)
    const res = await loginPatient(loginId.trim(), password)
    setBusy(false)
    if (!res.ok) toast.error('Sign-in failed', res.reason)
    else toast.success('Welcome', res.mustChange ? 'Please set a new password.' : undefined)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-surface-muted to-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 py-8">
        {/* Brand */}
        <div className="flex flex-col items-center pt-6 text-center">
          <Wordmark />
          <div className="mt-4 flex items-center gap-2 rounded-full bg-brand-100 px-3.5 py-1.5 text-sm font-semibold text-brand-700">
            <HeartPulse size={16} /> Patient Portal
          </div>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-soft">
            Access your appointments, prescriptions, lab reports and health records securely.
          </p>
        </div>

        {/* Login card */}
        <div className="mt-8 rounded-2xl border border-surface-line bg-white p-6 shadow-card">
          <form className="space-y-4" onSubmit={submit}>
            <Field label="Login ID" required>
              <div className="relative">
                <IdCard size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  className="input h-12 pl-10 text-base"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="e.g. NH-000001"
                  autoFocus
                  autoComplete="username"
                  inputMode="text"
                />
              </div>
            </Field>
            <Field label="Password" required>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                <input
                  type="password"
                  className="input h-12 pl-10 text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </Field>
            <button className="btn-primary h-12 w-full text-base" type="submit" disabled={busy}>
              <LogIn size={18} /> {busy ? 'Signing in…' : 'Login'}
            </button>
          </form>
          <p className="mt-4 text-center text-xs leading-relaxed text-ink-faint">
            Use the Login ID and temporary password provided by your hospital.
          </p>
        </div>

        {/* Tagline + footer */}
        <div className="mt-auto pt-10 text-center">
          <p className="text-sm font-semibold text-brand-700">Smarter Care. Healthier Tomorrow.</p>
          <p className="mt-2 text-xs text-ink-faint">Powered by NxtGenSol</p>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { LogIn, User, Lock, UserRound, ShieldCheck, ChevronRight } from 'lucide-react'
import { Wordmark } from '../../components/Logo'
import { APP } from '../../config'
import { Field } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { currentStatus, daysRemaining } from '../../services/license'
import { useDB } from '../../store/db'
import { fmtDate } from '../../lib/format'
import { isSupabase } from '../../lib/supabase'

const STAFF_DEMO = isSupabase
  ? [
      ['Hospital Admin', 'admin@nxthealth.demo', 'Admin@12345'],
      ['Doctor', 'dr.mehta@nxthealth.demo', 'Doctor@12345'],
      ['Receptionist', 'reception@nxthealth.demo', 'Recep@12345'],
      ['Lab Manager', 'labmgr@nxthealth.demo', 'Lab@12345'],
      ['Pharmacist', 'pharma@nxthealth.demo', 'Pharma@12345'],
      ['Billing', 'billing@nxthealth.demo', 'Bill@12345'],
    ]
  : [
      ['Hospital Admin', 'admin', 'admin123'],
      ['Doctor', 'dr.mehta', 'doctor123'],
      ['Receptionist', 'reception', 'recep123'],
      ['Lab Manager', 'labmgr', 'lab123'],
      ['Pharmacist', 'pharma', 'pharma123'],
      ['Billing', 'billing', 'bill123'],
    ]

export function Login() {
  const [mode, setMode] = useState<'staff' | 'patient'>('staff')
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const login = useAuth((s) => s.login)
  const loginPatient = useAuth((s) => s.loginPatient)
  const sendReset = useAuth((s) => s.sendReset)

  async function forgot() {
    if (!u.includes('@')) return toast.info('Enter your email above', 'Type your staff email, then click “Forgot password”.')
    const res = await sendReset(u.trim())
    if (res.ok) toast.success('Reset email sent', 'Check your inbox for the reset link.')
    else toast.error('Could not send reset', res.reason)
  }
  const hospital = useDB((s) => s.db.hospital)
  const status = currentStatus()

  const [busy, setBusy] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const res = mode === 'staff' ? await login(u, p) : await loginPatient(u, p)
    setBusy(false)
    if (!res.ok) toast.error('Sign-in failed', res.reason)
    else toast.success('Welcome back', res.mustChange ? 'Please set a new password.' : undefined)
  }

  const daysLeft = status.license ? daysRemaining(status.license) : null

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-brand-800 via-brand-700 to-navy-800 lg:block">
        <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-400/20 blur-3xl" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-white/10 p-1"><Wordmark size="sm" /></div>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-white/60">{APP.poweredBy}</p>
            <h2 className="mt-4 text-4xl font-extrabold leading-tight">{APP.tagline}</h2>
            <p className="mt-4 max-w-md text-white/70">
              A single, connected platform for registration, OPD, IPD, diagnostics, pharmacy,
              billing and the patient portal — built for real hospital workflows.
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {['OPD & IPD', 'Diagnostics', 'Pharmacy', 'Billing', 'Patient Portal', 'Control Room'].map((x) => (
                <span key={x} className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">{x}</span>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/50">{APP.company} · {APP.support.phone} · {APP.support.email}</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="relative flex items-center justify-center bg-surface-muted p-6">
        <div className="pointer-events-none absolute inset-0 grid-bg opacity-60 lg:hidden" />
        <div className="relative w-full max-w-sm">
          <div className="mb-6 lg:hidden"><Wordmark /></div>

          {!isSupabase && status.license && (
            <div className="mb-4 flex items-center justify-between rounded-xl border border-surface-line bg-white px-3.5 py-2.5 text-xs">
              <span className="flex items-center gap-1.5 text-ink-soft"><ShieldCheck size={14} className="text-teal-600" /> {hospital.name}</span>
              <span className={`font-semibold ${status.status === 'trial' ? 'text-amber-600' : 'text-emerald-600'}`}>
                {status.status === 'trial' ? `Trial · ${daysLeft}d left` : status.license.type}
              </span>
            </div>
          )}

          <div className="card p-6">
            <h1 className="text-xl font-extrabold text-ink">Sign in</h1>
            <p className="mt-0.5 text-sm text-ink-faint">Access your NxtHealth workspace.</p>

            <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-surface-sunken p-1">
              <button
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${mode === 'staff' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}
                onClick={() => { setMode('staff'); setU(''); setP('') }}
              >
                <User size={15} /> Staff
              </button>
              <button
                className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition ${mode === 'patient' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}
                onClick={() => { setMode('patient'); setU(''); setP('') }}
              >
                <UserRound size={15} /> Patient Portal
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submit}>
              <Field label={mode === 'staff' ? (isSupabase ? 'Email' : 'Username') : 'Patient ID / Login ID'} required>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input className="input pl-9" value={u} onChange={(e) => setU(e.target.value)} placeholder={mode === 'staff' ? (isSupabase ? 'admin@nxthealth.demo' : 'admin') : 'NH-000001'} autoFocus />
                </div>
              </Field>
              <Field label="Password" required>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
                  <input type="password" className="input pl-9" value={p} onChange={(e) => setP(e.target.value)} placeholder="••••••••" />
                </div>
              </Field>
              <button className="btn-primary w-full" type="submit" disabled={busy}><LogIn size={17} /> {busy ? 'Signing in…' : 'Sign in'}</button>
              {isSupabase && mode === 'staff' && (
                <button type="button" onClick={forgot} className="w-full text-center text-xs font-semibold text-brand-600 hover:underline">Forgot password?</button>
              )}
            </form>

            {mode === 'staff' ? (
              <div className="mt-5">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Demo accounts (click to fill)</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {STAFF_DEMO.map(([label, un, pw]) => (
                    <button key={un} onClick={() => { setU(un); setP(pw) }} className="flex items-center justify-between rounded-lg border border-surface-line px-2.5 py-1.5 text-left text-[11px] hover:bg-surface-muted">
                      <span className="font-semibold text-ink">{label}</span>
                      <ChevronRight size={13} className="text-ink-faint" />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl bg-brand-50 p-3 text-xs text-brand-800">
                Demo patient: <b>NH-000001</b> / <b>{isSupabase ? 'Portal@123' : 'Nxt-demo1'}</b>. First login forces a password change.
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-xs text-ink-faint">
            {!isSupabase && status.license?.expiryDate && status.license.expiryDate !== 'LIFETIME' && (
              <>License valid to {fmtDate(status.license.expiryDate)} · </>
            )}
            © {new Date().getFullYear()} {APP.company}
          </p>
        </div>
      </div>
    </div>
  )
}

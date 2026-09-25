import { useState } from 'react'
import { KeyRound, Building2, ShieldCheck, Clock, LifeBuoy, Phone, Mail, AlertTriangle, ArrowRight } from 'lucide-react'
import { Wordmark } from '../../components/Logo'
import { APP } from '../../config'
import { Field, Modal } from '../../components/ui'
import { activate, startTrial, currentStatus, daysRemaining } from '../../services/license'
import { useDB } from '../../store/db'
import { toast } from '../../store/toast'
import { fmtDate } from '../../lib/format'

export function LicenseActivation({ onActivated }: { onActivated: () => void }) {
  const license = useDB((s) => s.db.license)
  const status = currentStatus()
  const [key, setKey] = useState('')
  const [hospitalId, setHospitalId] = useState(license?.hospitalId ?? '')
  const [trialOpen, setTrialOpen] = useState(false)
  const [trialName, setTrialName] = useState(useDB.getState().db.hospital.name)
  const [trialId, setTrialId] = useState('')
  const [supportOpen, setSupportOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const expired = status.status === 'expired'
  const invalid = status.status === 'invalid'

  function doActivate() {
    if (!key.trim()) return toast.error('License key required', 'Paste the license key issued by NxtGenSol.')
    if (!hospitalId.trim()) return toast.error('Hospital ID required')
    setBusy(true)
    const res = activate(key.trim(), hospitalId.trim(), 'Admin')
    setBusy(false)
    if (res.ok) {
      toast.success('License activated', `${res.license.type} license is now active.`)
      onActivated()
    } else {
      toast.error('Activation failed', res.reason)
    }
  }

  function doTrial() {
    if (!trialName.trim() || !trialId.trim()) return toast.error('Fill hospital name and ID')
    const res = startTrial(trialId.trim(), trialName.trim(), 'Admin')
    if (res.ok) {
      toast.success('15-day trial started', `Trial valid until ${fmtDate(res.license.expiryDate as string)}.`)
      setTrialOpen(false)
      onActivated()
    } else {
      toast.error('Could not start trial', res.reason)
    }
  }

  return (
    <div className="relative min-h-screen bg-surface-muted">
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-70" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8">
        <Wordmark size="md" showTagline />

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left — messaging */}
          <div className="hidden lg:block">
            <span className="chip bg-brand-50 text-brand-700">
              <ShieldCheck size={14} /> Secure licensing
            </span>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight tracking-tight text-ink">
              Activate <span className="text-brand-600">NxtHealth</span> for your hospital
            </h1>
            <p className="mt-3 max-w-md text-ink-soft">
              Every NxtHealth deployment runs on a signed, verifiable license. Activate an
              existing key, or start a one-time 15-day trial to explore the full platform.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-3">
              {[
                ['Signed & verified', 'Licenses are cryptographically signed by NxtGenSol.'],
                ['One-time trial', 'A fresh hospital gets exactly one 15-day trial.'],
                ['Module control', 'Enable only the modules the hospital has purchased.'],
                ['Expiry safeguards', 'Protected modules lock automatically on expiry.'],
              ].map(([t, d]) => (
                <div key={t} className="card p-4">
                  <p className="text-sm font-bold text-ink">{t}</p>
                  <p className="mt-1 text-xs text-ink-soft">{d}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right — activation card */}
          <div className="card mx-auto w-full max-w-md p-6 animate-fade-up">
            <div className="mb-1 flex items-center gap-2">
              <KeyRound className="text-brand-600" size={20} />
              <h2 className="text-lg font-extrabold text-ink">License Activation</h2>
            </div>
            <p className="mb-5 text-sm text-ink-faint">Enter the license issued for your hospital.</p>

            {(expired || invalid) && (
              <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3">
                <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-600" />
                <div className="text-sm text-rose-700">
                  {expired ? (
                    <>Your {license?.type === 'TRIAL' ? 'trial' : 'license'} expired on <b>{fmtDate(license?.expiryDate as string)}</b>. Activate a valid license to continue.</>
                  ) : (
                    <>The installed license failed verification. Please contact NxtGenSol support.</>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-4">
              <Field label="License Key" required hint="Paste the NXHLIC… token or key from NxtGenSol.">
                <textarea
                  className="input min-h-[70px] font-mono text-xs"
                  placeholder="NXHLIC.xxxxxxxx…"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </Field>
              <Field label="Hospital ID" required>
                <input className="input" placeholder="e.g. HOSP-DEMO" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} />
              </Field>

              <button className="btn-primary w-full" disabled={busy} onClick={doActivate}>
                <ShieldCheck size={17} /> Activate License
              </button>
            </div>

            <div className="my-5 flex items-center gap-3 text-xs text-ink-faint">
              <div className="h-px flex-1 bg-surface-line" /> OR <div className="h-px flex-1 bg-surface-line" />
            </div>

            <button className="btn-teal w-full" onClick={() => { setTrialId(''); setTrialOpen(true) }}>
              <Clock size={17} /> Start 15-Day Free Trial
            </button>

            <button className="btn-ghost mt-2 w-full" onClick={() => setSupportOpen(true)}>
              <LifeBuoy size={17} /> Contact Support
            </button>

            {status.license && (status.status === 'active' || status.status === 'trial') && (
              <button className="btn-outline mt-4 w-full" onClick={onActivated}>
                Continue with current license <ArrowRight size={16} />
              </button>
            )}
          </div>
        </div>

        <p className="pb-2 text-center text-xs text-ink-faint">
          {APP.company} · {APP.support.phone} · {APP.support.email} — {APP.tagline}
        </p>
      </div>

      {/* Trial modal */}
      <Modal
        open={trialOpen}
        onClose={() => setTrialOpen(false)}
        title="Start your 15-day trial"
        subtitle="Each hospital is entitled to exactly one free trial."
        footer={
          <>
            <button className="btn-outline" onClick={() => setTrialOpen(false)}>Cancel</button>
            <button className="btn-teal" onClick={doTrial}><Clock size={16} /> Start Trial</button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Hospital / Customer Name" required>
            <input className="input" value={trialName} onChange={(e) => setTrialName(e.target.value)} />
          </Field>
          <Field label="Hospital ID" required hint="A unique ID for this hospital, e.g. HOSP-CITY-01.">
            <input className="input" value={trialId} onChange={(e) => setTrialId(e.target.value)} placeholder="HOSP-DEMO" />
          </Field>
          <div className="rounded-xl bg-teal-50 p-3 text-sm text-teal-800">
            The trial enables all modules for 15 days. You'll see live countdown warnings at
            7, 3 and 1 day remaining before expiry.
          </div>
        </div>
      </Modal>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  )
}

export function SupportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="NxtGenSol Support" subtitle="We're here to help you get running.">
      <div className="space-y-3">
        <a href={`tel:${APP.support.phone}`} className="flex items-center gap-3 rounded-xl border border-surface-line p-3.5 hover:bg-surface-muted">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600"><Phone size={18} /></div>
          <div><p className="text-xs text-ink-faint">Phone</p><p className="font-semibold text-ink">{APP.support.phone}</p></div>
        </a>
        <a href={`mailto:${APP.support.email}`} className="flex items-center gap-3 rounded-xl border border-surface-line p-3.5 hover:bg-surface-muted">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-600"><Mail size={18} /></div>
          <div><p className="text-xs text-ink-faint">Email</p><p className="font-semibold text-ink">{APP.support.email}</p></div>
        </a>
        <p className="text-center text-xs text-ink-faint">{APP.product} by {APP.company}</p>
      </div>
    </Modal>
  )
}

/** Small helper reused by the license status page. */
export function trialDaysLeft() {
  const l = useDB.getState().db.license
  return l ? daysRemaining(l) : null
}

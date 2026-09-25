import { useState } from 'react'
import { Lock, ShieldCheck, Loader2 } from 'lucide-react'
import { Wordmark } from '../../components/Logo'
import { Card, Field } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'
import { APP } from '../../config'

/** Shown after a password-recovery email link opens the app (PASSWORD_RECOVERY). */
export function ResetPassword() {
  const changePassword = useAuth((s) => s.changePassword)
  const [n1, setN1] = useState('')
  const [n2, setN2] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (n1.length < 8) return toast.error('Use at least 8 characters')
    if (n1 !== n2) return toast.error('Passwords do not match')
    setBusy(true)
    const res = await changePassword('', n1)
    setBusy(false)
    if (res.ok) toast.success('Password updated', 'You can now use NxtHealth.')
    else toast.error('Could not update', res.reason)
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface-muted p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Wordmark /></div>
        <Card className="p-6">
          <div className="mb-1 flex items-center gap-2"><ShieldCheck className="text-brand-600" size={20} /><h1 className="text-lg font-extrabold text-ink">Set a new password</h1></div>
          <p className="mb-5 text-sm text-ink-faint">Choose a new password to finish resetting your account.</p>
          <form className="space-y-4" onSubmit={submit}>
            <Field label="New password" required hint="At least 8 characters.">
              <div className="relative"><Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" /><input type="password" className="input pl-9" value={n1} onChange={(e) => setN1(e.target.value)} autoFocus /></div>
            </Field>
            <Field label="Confirm new password" required>
              <input type="password" className="input" value={n2} onChange={(e) => setN2(e.target.value)} />
            </Field>
            <button className="btn-primary w-full" type="submit" disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} Update password</button>
          </form>
        </Card>
        <p className="mt-4 text-center text-xs text-ink-faint">© {new Date().getFullYear()} {APP.company}</p>
      </div>
    </div>
  )
}

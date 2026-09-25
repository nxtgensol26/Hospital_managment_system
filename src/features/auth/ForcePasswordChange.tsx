import { useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { Modal, Field } from '../../components/ui'
import { useAuth } from '../../store/auth'
import { toast } from '../../store/toast'

export function ForcePasswordChange() {
  const user = useAuth((s) => s.user)
  const changePassword = useAuth((s) => s.changePassword)
  const logout = useAuth((s) => s.logout)
  const [oldP, setOldP] = useState('')
  const [n1, setN1] = useState('')
  const [n2, setN2] = useState('')

  if (!user?.mustChangePassword) return null

  async function submit() {
    if (n1 !== n2) return toast.error('Passwords do not match')
    const res = await changePassword(oldP, n1)
    if (res.ok) toast.success('Password updated', 'Your new password is set.')
    else toast.error('Could not update', res.reason)
  }

  // Mandatory gate: the password change is required before dashboard access.
  // Dismissing (X / Escape) does NOT reveal protected data — it cancels the
  // sign-in and returns to the login gate, where signing in reopens this modal.
  async function cancelToGate() {
    await logout()
    toast.info('Sign-in cancelled', 'Change your temporary password to access the portal.')
  }

  return (
    <Modal
      open
      onClose={cancelToGate}
      closeOnBackdrop={false}
      title="Set a new password"
      subtitle="For your security, you must change the temporary password before continuing."
      footer={<>
        <button type="button" className="btn-outline mr-auto" onClick={cancelToGate}>Cancel &amp; sign out</button>
        <button type="button" className="btn-primary" onClick={submit}><ShieldCheck size={16} /> Update password</button>
      </>}
    >
      <div className="space-y-4">
        <Field label="Current / temporary password" required>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input type="password" className="input pl-9" value={oldP} onChange={(e) => setOldP(e.target.value)} />
          </div>
        </Field>
        <Field label="New password" required hint="At least 6 characters.">
          <input type="password" className="input" value={n1} onChange={(e) => setN1(e.target.value)} />
        </Field>
        <Field label="Confirm new password" required>
          <input type="password" className="input" value={n2} onChange={(e) => setN2(e.target.value)} />
        </Field>
      </div>
    </Modal>
  )
}

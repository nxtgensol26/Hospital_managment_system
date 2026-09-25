import { useState } from 'react'
import { UserRound, ShieldCheck, Lock } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, CardHeader, Field, Avatar, Badge } from '../../components/ui'
import { ROLE_LABELS, ROLE_PERMISSIONS } from '../../lib/rbac'
import { toast } from '../../store/toast'
import { fmtDateTime } from '../../lib/format'

export function Profile() {
  const user = useAuth((s) => s.user)!
  const changePassword = useAuth((s) => s.changePassword)
  const [oldP, setOldP] = useState('')
  const [n1, setN1] = useState('')
  const [n2, setN2] = useState('')

  async function submit() {
    if (n1 !== n2) return toast.error('Passwords do not match')
    const res = await changePassword(oldP, n1)
    if (res.ok) { toast.success('Password updated'); setOldP(''); setN1(''); setN2('') }
    else toast.error('Failed', res.reason)
  }

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Account details & security" icon={<UserRound size={22} />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <div className="flex flex-col items-center p-6 text-center">
            <Avatar name={user.name} size={72} />
            <h2 className="mt-3 text-lg font-extrabold text-ink">{user.name}</h2>
            <Badge tone="blue">{ROLE_LABELS[user.role]}</Badge>
            <p className="mt-2 text-sm text-ink-faint">{user.email || user.username}</p>
            {user.lastLoginAt && <p className="mt-1 text-xs text-ink-faint">Last login {fmtDateTime(user.lastLoginAt)}</p>}
          </div>
        </Card>

        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title="Change Password" subtitle="Keep your account secure" />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              <Field label="Current"><input type="password" className="input" value={oldP} onChange={(e) => setOldP(e.target.value)} /></Field>
              <Field label="New"><input type="password" className="input" value={n1} onChange={(e) => setN1(e.target.value)} /></Field>
              <Field label="Confirm"><input type="password" className="input" value={n2} onChange={(e) => setN2(e.target.value)} /></Field>
            </div>
            <div className="px-5 pb-5"><button className="btn-primary" onClick={submit}><Lock size={16} /> Update Password</button></div>
          </Card>

          <Card>
            <CardHeader title="Your Permissions" subtitle="What this role can access" action={<ShieldCheck size={16} className="text-teal-600" />} />
            <div className="flex flex-wrap gap-1.5 p-5">
              {ROLE_PERMISSIONS[user.role].map((p) => <Badge key={p} tone="slate">{p}</Badge>)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

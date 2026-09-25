import { useEffect, useState, type ReactNode } from 'react'
import { Settings as Cog, Building2, Stethoscope, FlaskConical, Pill, BellRing, Users, Save, Plus, RotateCcw, Loader2, MessageSquare, ShieldCheck, Send, PlugZap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader, Card, CardHeader, Field, Table, Badge, Modal, ConfirmDialog } from '../../components/ui'
import type { SaveMessagingInput } from '../../data/repository'
import { toast } from '../../store/toast'
import { ROLE_LABELS } from '../../lib/rbac'
import { inr } from '../../lib/format'
import type { Hospital, Role } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { isSupabase } from '../../lib/supabase'
import { useDB } from '../../store/db'

type Tab = 'hospital' | 'staff' | 'lab' | 'pharmacy' | 'templates' | 'integrations' | 'users'
const TABS: [Tab, string, typeof Cog][] = [
  ['hospital', 'Hospital', Building2], ['staff', 'Departments & Doctors', Stethoscope],
  ['lab', 'Lab Tests', FlaskConical], ['pharmacy', 'Medicines', Pill],
  ['templates', 'Notification Templates', BellRing], ['integrations', 'Integrations', MessageSquare],
  ['users', 'Users & Roles', Users],
]

export function Settings() {
  const [tab, setTab] = useState<Tab>('hospital')
  const [resetOpen, setResetOpen] = useState(false)

  return (
    <div>
      <PageHeader title="Administration" subtitle="Configure your hospital, catalogs, templates and users" icon={<Cog size={22} />}
        actions={!isSupabase && <button className="btn-outline" onClick={() => setResetOpen(true)}><RotateCcw size={15} /> Reset Demo Data</button>} />
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-surface-sunken p-1">
        {TABS.map(([t, label, Icon]) => (
          <button key={t} onClick={() => setTab(t)} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === t ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft hover:text-ink'}`}><Icon size={15} /> {label}</button>
        ))}
      </div>
      {tab === 'hospital' && <HospitalTab />}
      {tab === 'staff' && <StaffTab />}
      {tab === 'lab' && <LabTab />}
      {tab === 'pharmacy' && <PharmacyTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'integrations' && <IntegrationsTab />}
      {tab === 'users' && <UsersTab />}
      {!isSupabase && (
        <ConfirmDialog open={resetOpen} onClose={() => setResetOpen(false)} onConfirm={() => { useDB.getState().reset(); toast.success('Demo data reset') }} title="Reset all data?" message="This restores the local seed dataset (DEV mode only)." confirmLabel="Reset everything" danger />
      )}
    </div>
  )
}

function HospitalTab() {
  const repo = getRepository()
  const { data } = useQuery(() => repo.getHospital(), [])
  const [f, setF] = useState<Hospital | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setF(data) }, [data])
  if (!f) return <Card className="p-8 text-center text-sm text-ink-faint"><Loader2 size={16} className="mx-auto animate-spin" /></Card>
  async function save() {
    if (!f) return
    setBusy(true)
    try { await repo.updateHospital(f); toast.success('Saved') } catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-2xl p-5">
      <h3 className="mb-4 text-sm font-bold text-ink">Hospital Details</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hospital Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Registration No"><input className="input" value={f.registrationNo ?? ''} onChange={(e) => setF({ ...f, registrationNo: e.target.value })} /></Field>
        <Field label="Address"><input className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="City / State"><input className="input" value={f.city ?? ''} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="Phone"><input className="input" value={f.phone ?? ''} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Email"><input className="input" value={f.email ?? ''} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="GST Number"><input className="input" value={f.gstNumber ?? ''} onChange={(e) => setF({ ...f, gstNumber: e.target.value })} /></Field>
      </div>
      <button className="btn-primary mt-5" onClick={save} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes</button>
    </Card>
  )
}

function StaffTab() {
  const repo = getRepository()
  const { data: departments } = useQuery(() => repo.listDepartments(), [])
  const { data: doctors, reload } = useQuery(() => repo.listDoctors(), [])
  const [docOpen, setDocOpen] = useState(false)
  const [f, setF] = useState({ name: '', departmentId: '', qualification: '', consultationFee: 400, phone: '', timings: '' })
  const deptId = f.departmentId || departments?.[0]?.id || ''
  async function addDoctor() {
    if (!f.name.trim()) return toast.error('Doctor name required')
    try { await repo.addDoctor({ ...f, departmentId: deptId }); toast.success('Doctor added'); setDocOpen(false); setF({ ...f, name: '', qualification: '' }); reload() } catch (e) { toast.error('Failed', String((e as Error).message)) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardHeader title="Departments" />
        <Table head={<><th className="th">Department</th><th className="th">Code</th><th className="th">Doctors</th></>}>
          {(departments ?? []).map((d) => <tr key={d.id}><td className="td font-medium">{d.name}</td><td className="td"><Badge tone="slate">{d.code}</Badge></td><td className="td">{(doctors ?? []).filter((x) => x.departmentId === d.id).length}</td></tr>)}
        </Table>
      </Card>
      <Card><CardHeader title="Doctors" action={<button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setDocOpen(true)}><Plus size={13} /> Add</button>} />
        <Table head={<><th className="th">Name</th><th className="th">Dept</th><th className="th">Fee</th></>}>
          {(doctors ?? []).map((d) => <tr key={d.id}><td className="td font-medium">{d.name}<br /><span className="text-xs text-ink-faint">{d.qualification}</span></td><td className="td text-ink-soft">{(departments ?? []).find((x) => x.id === d.departmentId)?.name}</td><td className="td">{inr(d.consultationFee)}</td></tr>)}
        </Table>
      </Card>
      <Modal open={docOpen} onClose={() => setDocOpen(false)} title="Add Doctor" footer={<><button className="btn-outline" onClick={() => setDocOpen(false)}>Cancel</button><button className="btn-primary" onClick={addDoctor}>Add</button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Department"><select className="input" value={deptId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}>{(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Qualification"><input className="input" value={f.qualification} onChange={(e) => setF({ ...f, qualification: e.target.value })} /></Field>
          <Field label="Consultation Fee"><input type="number" className="input" value={f.consultationFee} onChange={(e) => setF({ ...f, consultationFee: Number(e.target.value) })} /></Field>
          <Field label="Timings"><input className="input" value={f.timings} onChange={(e) => setF({ ...f, timings: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  )
}

function LabTab() {
  const repo = getRepository()
  const { data: tests, reload } = useQuery(() => repo.listLabTests(), [])
  const [f, setF] = useState({ name: '', code: '', category: 'Biochemistry', price: 100, sampleType: 'Serum', unit: '', refRange: '' })
  async function add() {
    if (!f.name.trim()) return toast.error('Test name required')
    try { await repo.addLabTest(f); toast.success('Test added'); setF({ ...f, name: '', code: '' }); reload() } catch (e) { toast.error('Failed', String((e as Error).message)) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader title="Test Catalog" />
        <Table head={<><th className="th">Test</th><th className="th">Category</th><th className="th">Sample</th><th className="th">Price</th></>}>
          {(tests ?? []).map((t) => <tr key={t.id}><td className="td font-medium">{t.name} <span className="text-xs text-ink-faint">({t.code})</span></td><td className="td text-ink-soft">{t.category}</td><td className="td text-ink-soft">{t.sampleType}</td><td className="td">{inr(t.price)}</td></tr>)}
        </Table>
      </Card>
      <Card className="p-5"><h3 className="mb-3 text-sm font-bold text-ink">Add Test</h3>
        <div className="space-y-3">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Code"><input className="input" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} /></Field><Field label="Price"><input type="number" className="input" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value) })} /></Field></div>
          <Field label="Category"><input className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Unit"><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field><Field label="Ref Range"><input className="input" value={f.refRange} onChange={(e) => setF({ ...f, refRange: e.target.value })} /></Field></div>
          <button className="btn-primary w-full" onClick={add}><Plus size={16} /> Add Test</button>
        </div>
      </Card>
    </div>
  )
}

function PharmacyTab() {
  const repo = getRepository()
  const { data: medicines, reload } = useQuery(() => repo.listMedicines(), [])
  const [f, setF] = useState({ name: '', category: 'General', unit: 'Tablet', mrp: 5, reorderLevel: 100 })
  async function add() {
    if (!f.name.trim()) return toast.error('Medicine name required')
    try { await repo.addMedicine(f); toast.success('Medicine added'); setF({ ...f, name: '' }); reload() } catch (e) { toast.error('Failed', String((e as Error).message)) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2"><CardHeader title="Medicine Master" />
        <Table head={<><th className="th">Medicine</th><th className="th">Category</th><th className="th">Unit</th><th className="th">MRP</th><th className="th">Reorder</th></>}>
          {(medicines ?? []).map((m) => <tr key={m.id}><td className="td font-medium">{m.name}</td><td className="td text-ink-soft">{m.category}</td><td className="td">{m.unit}</td><td className="td">{inr(m.mrp)}</td><td className="td">{m.reorderLevel}</td></tr>)}
        </Table>
      </Card>
      <Card className="p-5"><h3 className="mb-3 text-sm font-bold text-ink">Add Medicine</h3>
        <div className="space-y-3">
          <Field label="Name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Category"><input className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Unit"><input className="input" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field><Field label="MRP"><input type="number" className="input" value={f.mrp} onChange={(e) => setF({ ...f, mrp: Number(e.target.value) })} /></Field></div>
          <Field label="Reorder Level"><input type="number" className="input" value={f.reorderLevel} onChange={(e) => setF({ ...f, reorderLevel: Number(e.target.value) })} /></Field>
          <button className="btn-primary w-full" onClick={add}><Plus size={16} /> Add Medicine</button>
        </div>
      </Card>
    </div>
  )
}

function TemplatesTab() {
  const repo = getRepository()
  const { data: templates, reload } = useQuery(() => repo.listNotificationTemplates(), [])
  async function toggle(key: string, active: boolean) {
    try { await repo.toggleTemplate(key, active); reload() } catch (e) { toast.error('Failed', String((e as Error).message)) }
  }
  return (
    <Card><CardHeader title="Notification Templates" subtitle="Approved DLT / RCS template IDs — edited here, used everywhere" />
      <Table head={<><th className="th">Key</th><th className="th">Template ID</th><th className="th">Channel</th><th className="th">Body</th><th className="th">Active</th></>}>
        {(templates ?? []).map((t) => (
          <tr key={t.key}>
            <td className="td font-mono text-xs font-semibold text-brand-700">{t.key}</td>
            <td className="td font-mono text-xs">{t.templateId}</td>
            <td className="td"><Badge tone={t.channel === 'rcs' ? 'blue' : 'teal'}>{t.channel.toUpperCase()}</Badge></td>
            <td className="td max-w-[360px] text-xs text-ink-soft">{t.body}</td>
            <td className="td">
              <button onClick={() => toggle(t.key, !t.active)} className={`h-6 w-11 rounded-full transition ${t.active ? 'bg-teal-500' : 'bg-slate-300'}`}>
                <span className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white transition ${t.active ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </td>
          </tr>
        ))}
      </Table>
    </Card>
  )
}

const PROVIDERS: { v: SaveMessagingInput['provider']; label: string }[] = [
  { v: 'sms_horizon', label: 'SMS Horizon (SMS / RCS)' },
  { v: 'whatsapp', label: 'WhatsApp API' },
  { v: 'custom', label: 'Custom Provider' },
  { v: 'disabled', label: 'Disabled' },
]
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} className={`h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-teal-500' : 'bg-slate-300'}`}>
      <span className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white transition ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )
}
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-surface-line py-2.5 last:border-0">
      <div><p className="text-sm font-medium text-ink">{label}</p>{hint && <p className="text-xs text-ink-faint">{hint}</p>}</div>
      {children}
    </div>
  )
}

function IntegrationsTab() {
  const repo = getRepository()
  const { data: cfg, reload } = useQuery(() => repo.getMessagingConfig(), [])
  const [f, setF] = useState<SaveMessagingInput | null>(null)
  const [cred, setCred] = useState('')
  const [waCred, setWaCred] = useState('')
  const [busy, setBusy] = useState(false)
  const [testTo, setTestTo] = useState('')
  const [showTest, setShowTest] = useState(false)

  useEffect(() => {
    if (cfg) setF({ provider: cfg.provider, enabled: cfg.enabled, baseUrl: cfg.baseUrl ?? '', smsEnabled: cfg.smsEnabled, rcsEnabled: cfg.rcsEnabled, whatsappEnabled: cfg.whatsappEnabled, smsFallbackEnabled: cfg.smsFallbackEnabled, providerUser: cfg.providerUser ?? '', whatsappProvider: cfg.whatsappProvider ?? '', whatsappBaseUrl: cfg.whatsappBaseUrl ?? '' })
  }, [cfg])

  if (!f || !cfg) return <Card className="p-8 text-center text-sm text-ink-faint"><Loader2 size={16} className="mx-auto animate-spin" /></Card>
  const set = (patch: Partial<SaveMessagingInput>) => setF({ ...f, ...patch })

  async function save() {
    if (!f) return
    setBusy(true)
    try { await repo.saveMessagingConfig({ ...f, credential: cred || undefined, whatsappCredential: waCred || undefined }); setCred(''); setWaCred(''); toast.success('Messaging gateway saved'); reload() }
    catch (e) { toast.error('Save failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  async function testConn() {
    setBusy(true)
    try { const r = await repo.testMessagingConnection(); r.ok ? toast.success('Connection OK', r.info) : toast.info('Test result', r.info) }
    catch (e) { toast.error('Test failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  async function sendTest() {
    if (!testTo.trim()) return toast.error('Enter a destination phone number')
    setBusy(true)
    try {
      const r = await repo.sendTestMessage({ to: testTo.trim(), templateKey: 'appt_confirm', vars: { name: 'Test User', doctor: 'Dr. Test', date: new Date().toISOString().slice(0, 10), time: '10:00', patientId: 'NH-000000' } })
      toast[r.ok ? 'success' : 'info'](`Test message: ${r.status ?? 'done'}`, r.providerMessageId ? `msgid ${r.providerMessageId}` : r.info)
      setShowTest(false)
    } catch (e) { toast.error('Send failed', String((e as Error).message)) } finally { setBusy(false) }
  }

  const isSms = f.provider === 'sms_horizon'
  const isWa = f.provider === 'whatsapp'

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <div className="mb-1 flex items-center gap-2"><MessageSquare size={18} className="text-brand-600" /><h3 className="text-sm font-bold text-ink">Messaging Gateway</h3></div>
        <p className="mb-4 text-xs text-ink-faint">Configure this hospital's SMS / RCS / WhatsApp provider. Credentials are stored encrypted server-side and are never shown after saving.</p>

        <Row label="Messaging enabled" hint="Turn all outbound messaging on/off for this hospital"><Toggle on={f.enabled} onChange={(v) => set({ enabled: v })} /></Row>
        <div className="grid gap-4 py-3 sm:grid-cols-2">
          <Field label="Provider"><select className="input" value={f.provider} onChange={(e) => set({ provider: e.target.value as SaveMessagingInput['provider'] })}>{PROVIDERS.map((p) => <option key={p.v} value={p.v}>{p.label}</option>)}</select></Field>
          {isSms && <Field label="Base URL" hint="Defaults to the official SMS Horizon RCS URL"><input className="input" value={f.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} placeholder="https://smshorizon.com/api/v2/rcs" /></Field>}
        </div>

        {isSms && (
          <div className="rounded-xl border border-surface-line p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-faint">Channels</p>
            <Row label="RCS enabled" hint="Approved RCS templates via SMS Horizon"><Toggle on={f.rcsEnabled} onChange={(v) => set({ rcsEnabled: v })} /></Row>
            <Row label="SMS enabled"><Toggle on={f.smsEnabled} onChange={(v) => set({ smsEnabled: v })} /></Row>
            <Row label="RCS → SMS fallback" hint="Fall back to SMS when RCS is unavailable"><Toggle on={f.smsFallbackEnabled} onChange={(v) => set({ smsFallbackEnabled: v })} /></Row>
            <div className="grid gap-4 pt-3 sm:grid-cols-2">
              <Field label="SMS Horizon Username" hint="Account username sent as `user` in the request (not a secret)">
                <input type="text" className="input" value={f.providerUser ?? ''} onChange={(e) => set({ providerUser: e.target.value })} placeholder="SMS Horizon account username" autoComplete="off" />
              </Field>
              <Field label="SMS Horizon API Key" hint={cfg.credentialConfigured ? `Configured ••••${cfg.credentialLast4 ?? ''} — leave blank to keep` : 'Stored encrypted; never displayed after saving'}>
                <input type="password" className="input" value={cred} onChange={(e) => setCred(e.target.value)} placeholder={cfg.credentialConfigured ? '•••••••••• (unchanged)' : 'Enter SMS Horizon API key'} autoComplete="new-password" />
              </Field>
            </div>
          </div>
        )}

        {isWa && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-3">
            <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-700">WhatsApp (provider spec pending)</p>
            <p className="mb-2 text-xs text-ink-soft">The provider abstraction and secure credential storage are ready. A live WhatsApp request is not implemented until the provider's API spec is supplied.</p>
            <Row label="WhatsApp enabled"><Toggle on={f.whatsappEnabled} onChange={(v) => set({ whatsappEnabled: v })} /></Row>
            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <Field label="WhatsApp provider"><input className="input" value={f.whatsappProvider} onChange={(e) => set({ whatsappProvider: e.target.value })} placeholder="e.g. provider name" /></Field>
              <Field label="Base URL"><input className="input" value={f.whatsappBaseUrl} onChange={(e) => set({ whatsappBaseUrl: e.target.value })} /></Field>
            </div>
            <Field label="API credential / token" hint={cfg.whatsappCredentialConfigured ? `Configured ••••${cfg.whatsappLast4 ?? ''} — leave blank to keep` : 'Stored encrypted; never displayed'}>
              <input type="password" className="input" value={waCred} onChange={(e) => setWaCred(e.target.value)} placeholder={cfg.whatsappCredentialConfigured ? '•••••••••• (unchanged)' : 'Enter WhatsApp API token'} autoComplete="new-password" />
            </Field>
          </div>
        )}

        {f.provider === 'custom' && <div className="rounded-xl border border-surface-line p-3 text-sm text-ink-soft">Custom provider selected. Provider request is not implemented — supply the API spec to enable it.</div>}

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="btn-primary" onClick={save} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Gateway</button>
          <button className="btn-outline" onClick={testConn} disabled={busy}><PlugZap size={16} /> Test Connection</button>
          <button className="btn-outline" onClick={() => setShowTest(true)} disabled={busy}><Send size={16} /> Send Test Message</button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><ShieldCheck size={16} className="text-teal-600" /> Security</h3>
          <ul className="space-y-1.5 text-xs text-ink-soft">
            <li>Credentials are encrypted at rest and never returned to the browser.</li>
            <li>Each hospital's gateway is isolated (tenant-scoped, RLS deny-all).</li>
            <li>All provider requests run server-side in edge functions.</li>
            <li>Test actions require the Integrations permission and are audited.</li>
          </ul>
        </Card>
        <Card className="p-5">
          <h3 className="mb-1 text-sm font-bold text-ink">Delivery Logs</h3>
          <p className="text-xs text-ink-faint">Outbound message attempts, statuses and provider message IDs.</p>
          <Link to="/notifications" className="btn-ghost mt-3 w-full"><BellRing size={15} /> Open Delivery Logs</Link>
        </Card>
      </div>

      <Modal open={showTest} onClose={() => setShowTest(false)} title="Send Test Message" subtitle="Sends via this hospital's configured provider (marked as TEST)"
        footer={<><button className="btn-outline" onClick={() => setShowTest(false)}>Cancel</button><button className="btn-primary" onClick={sendTest} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send</button></>}>
        <Field label="Destination phone" required hint="Uses the appt_confirm template with sample variables."><input className="input" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="9812345678" /></Field>
      </Modal>
    </div>
  )
}

function UsersTab() {
  const repo = getRepository()
  const { data: users, reload } = useQuery(() => repo.listUsers(), [])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ name: '', username: '', role: 'receptionist' as Role, password: 'welcome123', email: '' })
  const roles: Role[] = ['hospital_admin', 'receptionist', 'doctor', 'nurse', 'lab_technician', 'lab_manager', 'pharmacist', 'billing_staff', 'inventory_manager']
  async function add() {
    if (!f.name.trim() || !f.username.trim()) return toast.error('Name and username required')
    try { await repo.createUser(f); toast.success('User created', `Temp password: ${f.password}`); setOpen(false); setF({ ...f, name: '', username: '' }); reload() }
    catch (e) { toast.error('Could not create user', String((e as Error).message)) }
  }
  return (
    <Card><CardHeader title="Users & Roles" subtitle="Role-based access control" action={<button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setOpen(true)}><Plus size={13} /> Add User</button>} />
      <Table head={<><th className="th">Name</th><th className="th">Username</th><th className="th">Role</th><th className="th">Status</th></>}>
        {(users ?? []).filter((u) => u.role !== 'patient').map((u) => (
          <tr key={u.id}><td className="td font-medium">{u.name}</td><td className="td font-mono text-xs">{u.username}</td><td className="td"><Badge tone="blue">{ROLE_LABELS[u.role]}</Badge></td><td className="td">{u.active ? <Badge tone="green">Active</Badge> : <Badge tone="slate">Disabled</Badge>}</td></tr>
        ))}
      </Table>
      <Modal open={open} onClose={() => setOpen(false)} title="Create User" subtitle={isSupabase ? 'Staff accounts are provisioned server-side (Auth Admin API).' : 'New users must change password on first login'} footer={<><button className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={add}>Create</button></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Username" required><input className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></Field>
          <Field label="Role"><select className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></Field>
          <Field label="Temp Password"><input className="input" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        </div>
        {isSupabase && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">In Supabase mode, creating staff requires the Auth Admin API (service role). This is intentionally disabled in the browser client for security.</p>}
      </Modal>
    </Card>
  )
}

import { useState } from 'react'
import { KeyRound, ShieldCheck, Sparkles, AlertTriangle, Clock, CheckCircle2, Loader2 } from 'lucide-react'
import { PageHeader, Card, CardHeader, Field, Badge, Table } from '../../components/ui'
import { ALL_MODULES, type ModuleKey } from '../../config'
import { toast } from '../../store/toast'
import { fmtDate, fmtDateTime, todayISO } from '../../lib/format'
import type { LicenseType } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { isSupabase } from '../../lib/supabase'

/** Normalize a license object from either backend (snake_case or app camelCase). */
function norm(l: any) {
  if (!l) return null
  return {
    product: l.product ?? 'NxtHealth',
    type: l.type as string,
    hospitalName: l.hospital_name ?? l.hospitalName ?? '',
    hospitalId: l.hospital_id ?? l.hospitalId ?? '',
    startDate: l.start_date ?? l.startDate,
    expiryDate: l.expiry_date ?? l.expiryDate ?? null,
    userLimit: l.user_limit ?? l.userLimit,
    modules: (l.modules ?? []) as string[],
  }
}

export function LicenseManager() {
  const repo = getRepository()
  const { data: current, reload } = useQuery(() => repo.licenseCurrent(), [])
  const { data: acts, reload: reloadActs } = useQuery(() => repo.listLicenseActivations(), [])
  const [f, setF] = useState({ type: 'YEARLY' as LicenseType, startDate: todayISO(), userLimit: 25, modules: ALL_MODULES.map((m) => m.key) as ModuleKey[] })
  const [busy, setBusy] = useState(false)

  const status = current?.status ?? 'unlicensed'
  const lic = norm(current?.license)
  const daysLeft = current?.daysLeft ?? null

  function toggleMod(m: ModuleKey) { setF((s) => ({ ...s, modules: s.modules.includes(m) ? s.modules.filter((x) => x !== m) : [...s.modules, m] })) }

  async function issue() {
    setBusy(true)
    try { await repo.licenseIssue(f); toast.success('License issued', `${f.type} applied`); reload(); reloadActs() }
    catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  async function startTrial() {
    setBusy(true)
    try { await repo.licenseStartTrial(); toast.success('Trial started'); reload(); reloadActs() }
    catch (e) { toast.error('Could not start trial', String((e as Error).message)) } finally { setBusy(false) }
  }

  return (
    <div>
      <PageHeader title="License Manager" subtitle="Current license status, activation history & issuing" icon={<KeyRound size={22} />} />

      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Current License" subtitle={lic?.hospitalName} action={
            status === 'expired' ? <Badge tone="red"><AlertTriangle size={12} /> Expired</Badge>
              : status === 'trial' ? <Badge tone="amber"><Clock size={12} /> Trial</Badge>
              : status === 'active' ? <Badge tone="green"><ShieldCheck size={12} /> Active</Badge>
              : status === 'invalid' ? <Badge tone="red"><AlertTriangle size={12} /> Invalid</Badge>
              : <Badge tone="slate">{status}</Badge>} />
          {lic ? (
            <div className="grid gap-x-8 gap-y-2 p-5 sm:grid-cols-2">
              {[
                ['Product', lic.product], ['License Type', lic.type], ['Customer', lic.hospitalName],
                ['Start Date', fmtDate(lic.startDate)], ['Expiry', lic.expiryDate ? fmtDate(lic.expiryDate) : 'Lifetime'],
                ['User Limit', String(lic.userLimit)], ['Days Remaining', daysLeft == null ? '∞' : `${daysLeft} days`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-dashed border-surface-line py-1.5 text-sm"><span className="text-ink-faint">{k}</span><span className="font-semibold text-ink">{v}</span></div>
              ))}
              <div className="sm:col-span-2"><p className="mb-1.5 text-xs font-semibold uppercase text-ink-faint">Enabled Modules</p><div className="flex flex-wrap gap-1.5">{lic.modules.map((m) => <Badge key={m} tone="blue">{ALL_MODULES.find((x) => x.key === m)?.label ?? m}</Badge>)}</div></div>
            </div>
          ) : <div className="p-6 text-sm text-ink-faint">No license installed. Issue one below or start a trial.</div>}
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-2 rounded-xl bg-brand-50 p-3 text-sm text-brand-800">
            <ShieldCheck size={18} className="shrink-0" />
            <p>{isSupabase ? 'Licenses are issued & signed server-side by the licensing service (private key never in the browser). The 15-day trial is enforced in the database.' : 'DEV mode: licenses are signed locally with a dev key for testing.'}</p>
          </div>
          <button className="btn-teal mt-4 w-full" onClick={startTrial} disabled={busy}><Clock size={16} /> Start 15-Day Trial</button>
          <p className="mt-2 text-xs text-ink-faint">{status === 'trial' ? 'A trial is currently active.' : 'One trial per hospital (server-enforced).'}</p>
        </Card>
      </div>

      <Card className="mb-5">
        <CardHeader title="Issue License" subtitle={isSupabase ? 'Server-side issue (admin only)' : 'DEV generator'} action={<Badge tone={isSupabase ? 'green' : 'amber'}>{isSupabase ? 'Server-signed' : 'Dev signer'}</Badge>} />
        <div className="grid gap-5 p-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="License Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as LicenseType })}><option value="TRIAL">15-Day Trial</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option><option value="LIFETIME">Lifetime</option></select></Field>
              <Field label="Start Date"><input type="date" className="input" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
              <Field label="User Limit"><input type="number" className="input" value={f.userLimit} onChange={(e) => setF({ ...f, userLimit: Number(e.target.value) })} /></Field>
            </div>
            <div>
              <p className="label">Enabled Modules</p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_MODULES.map((m) => (<button key={m.key} onClick={() => toggleMod(m.key)} className={`chip ${f.modules.includes(m.key) ? 'bg-brand-100 text-brand-700' : 'bg-surface-sunken text-ink-faint'}`}>{m.label}</button>))}
              </div>
            </div>
            <button className="btn-primary" onClick={issue} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Issue & Apply License</button>
          </div>
          <div className="grid place-items-center rounded-xl border border-dashed border-surface-line p-6 text-center text-sm text-ink-faint">
            <div>
              <CheckCircle2 size={22} className="mx-auto mb-2 text-teal-500" />
              {isSupabase ? 'The signed license is stored server-side and validated on every check. No private key touches the browser.' : 'The dev-signed license is stored locally for testing.'}
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Activation History" />
        {(acts ?? []).length === 0 ? <div className="p-6 text-sm text-ink-faint">No activations recorded.</div> : (
          <Table head={<><th className="th">When</th><th className="th">Hospital ID</th><th className="th">By</th><th className="th">Key</th><th className="th">Result</th></>}>
            {(acts ?? []).map((a) => (
              <tr key={a.id}>
                <td className="td text-xs text-ink-soft">{fmtDateTime(a.activatedAt)}</td>
                <td className="td">{a.hospitalId}</td>
                <td className="td">{a.activatedBy}</td>
                <td className="td font-mono text-xs">{a.key}</td>
                <td className="td">{a.result === 'success' ? <Badge tone="green">success</Badge> : <Badge tone="red">failed{a.reason ? ` · ${a.reason}` : ''}</Badge>}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}

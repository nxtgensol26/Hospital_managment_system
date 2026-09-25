import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Siren, Plus, Clock, ArrowRight, Loader2 } from 'lucide-react'
import { PageHeader, Card, Badge, Modal, Field, EmptyState } from '../../components/ui'
import { toast } from '../../store/toast'
import { fmtDateTime, relTime } from '../../lib/format'
import type { Gender } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

const TRIAGE = { critical: { tone: 'red' as const, label: 'Critical' }, urgent: { tone: 'amber' as const, label: 'Urgent' }, stable: { tone: 'green' as const, label: 'Stable' } }

export function Emergency() {
  const repo = getRepository()
  const nav = useNavigate()
  const { doctorName } = useRefData()
  const [open, setOpen] = useState(false)
  const { data: cases, reload } = useQuery(() => repo.listEmergencies(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p.name])); return (id: string) => m.get(id) ?? id }, [patients])
  const active = (cases ?? []).filter((c) => c.status === 'active')
  const closed = (cases ?? []).filter((c) => c.status !== 'active')

  async function setStatus(id: string, status: any, msg: string, go?: string) {
    try { await repo.setEmergencyStatus(id, status); toast.success(msg); reload(); if (go) nav(go) } catch (e) { toast.error('Failed', String((e as Error).message)) }
  }

  return (
    <div>
      <PageHeader title="Emergency" subtitle="Rapid registration & triage — urgent care first, paperwork after" icon={<Siren size={22} />}
        actions={<button className="btn-danger" onClick={() => setOpen(true)}><Plus size={16} /> Quick Register</button>} />
      <div className="mb-4 grid grid-cols-3 gap-3">
        {(['critical', 'urgent', 'stable'] as const).map((t) => (
          <Card key={t} className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">{TRIAGE[t].label}</p><p className="mt-1 text-2xl font-extrabold text-ink">{active.filter((c) => c.triage === t).length}</p></Card>
        ))}
      </div>
      <Card>
        <div className="border-b border-surface-line px-5 py-3"><h3 className="text-sm font-bold text-ink">Active Cases</h3></div>
        {active.length === 0 ? <EmptyState icon={<Siren size={22} />} title="No active emergencies" /> : (
          <div className="divide-y divide-surface-line">
            {active.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Badge tone={TRIAGE[c.triage].tone} dot>{TRIAGE[c.triage].label}</Badge>
                <div className="min-w-0 flex-1">
                  <button onClick={() => nav(`/patients/${c.patientId}`)} className="font-semibold text-ink hover:text-brand-700">{patientName(c.patientId)}</button>
                  <p className="text-xs text-ink-faint">{c.code ?? c.id} · {doctorName(c.doctorId)}</p>
                  {c.notes && <p className="mt-0.5 text-sm text-ink-soft">{c.notes}</p>}
                </div>
                <span className="flex items-center gap-1 text-xs text-ink-faint"><Clock size={12} /> {relTime(c.arrivalTime)}</span>
                <div className="flex gap-1">
                  <button className="btn-outline !px-2.5 !py-1 text-xs" onClick={() => setStatus(c.id, 'admitted', 'Marked for admission', '/beds')}>Admit</button>
                  <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setStatus(c.id, 'discharged', 'Case closed')}>Discharge</button>
                  <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => nav(`/patients/${c.patientId}`)}>Open <ArrowRight size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      {closed.length > 0 && (
        <Card className="mt-4">
          <div className="border-b border-surface-line px-5 py-3"><h3 className="text-sm font-bold text-ink">Recent (closed)</h3></div>
          <div className="divide-y divide-surface-line">
            {closed.slice(0, 8).map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-2.5"><span className="text-sm">{patientName(c.patientId)} · <span className="text-ink-faint">{c.code ?? c.id}</span></span><div className="flex items-center gap-3"><Badge tone="slate">{c.status}</Badge><span className="text-xs text-ink-faint">{fmtDateTime(c.arrivalTime)}</span></div></div>
            ))}
          </div>
        </Card>
      )}
      {open && <QuickRegister onClose={() => setOpen(false)} onDone={reload} />}
    </div>
  )
}

function QuickRegister({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const repo = getRepository()
  const { doctors } = useRefData()
  const [f, setF] = useState({ name: '', mobile: '', gender: 'male' as Gender, triage: 'urgent' as 'critical' | 'urgent' | 'stable', notes: '', doctorId: '' })
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!f.name.trim()) return toast.error('Patient name is required')
    setBusy(true)
    try { const res = await repo.registerEmergency(f); toast.success('Emergency registered', `${res.case.code ?? res.case.id} · ${res.patient.code ?? res.patient.id}`); onDone(); onClose() }
    catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="Emergency Quick Registration" subtitle="Minimal details — complete the full profile later"
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-danger" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Siren size={16} />} Register & Triage</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Patient Name" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Name or 'Unknown'" /></Field>
        <Field label="Mobile / Emergency Contact"><input className="input" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        <Field label="Gender"><select className="input" value={f.gender} onChange={(e) => setF({ ...f, gender: e.target.value as Gender })}><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option></select></Field>
        <Field label="Triage" required><select className="input" value={f.triage} onChange={(e) => setF({ ...f, triage: e.target.value as any })}><option value="critical">Critical</option><option value="urgent">Urgent</option><option value="stable">Stable</option></select></Field>
        <Field label="Assign Doctor"><select className="input" value={f.doctorId} onChange={(e) => setF({ ...f, doctorId: e.target.value })}><option value="">Unassigned</option>{doctors.filter((d) => d.active).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Arrival Notes"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Presenting condition" /></Field>
      </div>
    </Modal>
  )
}

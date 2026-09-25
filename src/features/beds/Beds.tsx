import { useMemo, useState } from 'react'
import { BedDouble, UserPlus, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, Badge, Modal, Field } from '../../components/ui'
import { toast } from '../../store/toast'
import { inr } from '../../lib/format'
import type { Bed, BedState, Patient } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

const STATE_META: Record<BedState, { label: string; bg: string; text: string; dot: string }> = {
  available: { label: 'Available', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  reserved: { label: 'Reserved', bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500' },
  assigned: { label: 'Assigned', bg: 'bg-indigo-50 border-indigo-200', text: 'text-indigo-700', dot: 'bg-indigo-500' },
  occupied: { label: 'Occupied', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' },
  discharge_pending: { label: 'Discharge Pending', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500' },
  cleaning: { label: 'Cleaning', bg: 'bg-cyan-50 border-cyan-200', text: 'text-cyan-700', dot: 'bg-cyan-500' },
  inspection: { label: 'Inspection', bg: 'bg-violet-50 border-violet-200', text: 'text-violet-700', dot: 'bg-violet-500' },
}
const NEXT: Partial<Record<BedState, BedState>> = { cleaning: 'inspection', inspection: 'available', reserved: 'available' }

export function Beds() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const [admitBed, setAdmitBed] = useState<Bed | null>(null)
  const { data: beds, loading, reload } = useQuery(() => repo.listBeds(), [])
  const { data: wards } = useQuery(() => repo.listWards(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p.name])); return (id?: string) => (id ? m.get(id) ?? id : '') }, [patients])
  const allBeds = beds ?? []
  const counts = (Object.keys(STATE_META) as BedState[]).map((st) => ({ st, n: allBeds.filter((b) => b.state === st).length }))

  async function change(bedId: string, state: BedState, msg: string) {
    try { await repo.setBedState(bedId, state); toast.success(msg); reload() } catch (e) { toast.error('Failed', String((e as Error).message)) }
  }

  return (
    <div>
      <PageHeader title="Bed Management" subtitle="Live bed board across wards" icon={<BedDouble size={22} />} actions={loading ? <Loader2 size={16} className="animate-spin text-ink-faint" /> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        {counts.map(({ st, n }) => (
          <div key={st} className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold ${STATE_META[st].bg} ${STATE_META[st].text}`}><span className={`h-2 w-2 rounded-full ${STATE_META[st].dot}`} /> {STATE_META[st].label} · {n}</div>
        ))}
      </div>
      <div className="space-y-5">
        {(wards ?? []).map((ward) => {
          const wb = allBeds.filter((b) => b.wardId === ward.id)
          return (
            <Card key={ward.id}>
              <div className="flex items-center justify-between border-b border-surface-line px-5 py-3"><h3 className="text-sm font-bold text-ink">{ward.name} <span className="font-normal text-ink-faint">· {ward.type}</span></h3><Badge tone="slate">{wb.filter((b) => b.state === 'available').length} free / {wb.length}</Badge></div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4">
                {wb.map((bed) => {
                  const m = STATE_META[bed.state]
                  return (
                    <div key={bed.id} className={`rounded-xl border p-3.5 ${m.bg}`}>
                      <div className="flex items-center justify-between"><span className="font-bold text-ink">{bed.label}</span><BedDouble size={16} className={m.text} /></div>
                      <p className={`mt-1 flex items-center gap-1.5 text-xs font-semibold ${m.text}`}><span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} /> {m.label}</p>
                      {bed.patientId && <p className="mt-1 truncate text-xs text-ink-soft">{patientName(bed.patientId)}</p>}
                      <p className="mt-1 text-[11px] text-ink-faint">{inr(bed.chargePerDay)}/day</p>
                      {can('beds.manage') && (
                        <div className="mt-2 flex gap-1">
                          {bed.state === 'available' && can('ipd.manage') && <button className="btn-primary w-full !px-2 !py-1 text-[11px]" onClick={() => setAdmitBed(bed)}><UserPlus size={12} /> Admit</button>}
                          {NEXT[bed.state] && <button className="btn-ghost w-full !px-2 !py-1 text-[11px]" onClick={() => change(bed.id, NEXT[bed.state]!, `Bed → ${STATE_META[NEXT[bed.state]!].label}`)}>→ {STATE_META[NEXT[bed.state]!].label}</button>}
                          {bed.state === 'available' && <button className="btn-ghost !px-2 !py-1 text-[11px]" onClick={() => change(bed.id, 'reserved', 'Bed reserved')}>Reserve</button>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </Card>
          )
        })}
      </div>
      {admitBed && <AdmitModal bed={admitBed} onClose={() => setAdmitBed(null)} onDone={reload} />}
    </div>
  )
}

function AdmitModal({ bed, onClose, onDone }: { bed: Bed; onClose: () => void; onDone: () => void }) {
  const repo = getRepository()
  const { doctors } = useRefData()
  const [patientId, setPatientId] = useState('')
  const [psearch, setPsearch] = useState('')
  const [doctorId, setDoctorId] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: matches } = useQuery(() => (psearch.trim() ? repo.listPatients(psearch) : Promise.resolve([] as Patient[])), [psearch])
  const { data: selList } = useQuery(() => (patientId ? repo.getPatient(patientId).then((p) => (p ? [p] : [])) : Promise.resolve([])), [patientId])
  const selected = selList?.[0]

  async function submit() {
    if (!patientId) return toast.error('Select a patient')
    setBusy(true)
    try { const adm = await repo.admitPatient({ patientId, bedId: bed.id, doctorId: doctorId || undefined, reason }); toast.success('Patient admitted', `${adm.code ?? adm.id} · Bed ${bed.label}`); onDone(); onClose() }
    catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title={`Admit to ${bed.label}`} subtitle={`${inr(bed.chargePerDay)} / day`}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />} Admit</button></>}>
      <div className="space-y-4">
        <Field label="Patient" required>
          {selected ? <div className="flex items-center justify-between rounded-lg border border-surface-line px-3 py-2"><span className="text-sm"><b>{selected.name}</b> · {selected.code ?? selected.id}</span><button className="text-xs text-brand-600" onClick={() => setPatientId('')}>Change</button></div>
            : <><input className="input" placeholder="Search patient…" value={psearch} onChange={(e) => setPsearch(e.target.value)} />{(matches ?? []).slice(0, 6).map((p) => <button key={p.id} onClick={() => { setPatientId(p.id); setPsearch('') }} className="mt-1 flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"><span>{p.name}</span><span className="text-ink-faint">{p.code ?? p.id}</span></button>)}</>}
        </Field>
        <Field label="Attending Doctor"><select className="input" value={doctorId} onChange={(e) => setDoctorId(e.target.value)}><option value="">Unassigned</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Reason for admission"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

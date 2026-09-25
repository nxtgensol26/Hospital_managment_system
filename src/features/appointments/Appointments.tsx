import { useMemo, useState } from 'react'
import { CalendarDays, Plus, Search, Check, X, LogIn, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, Table, Badge, Modal, Field, EmptyState } from '../../components/ui'
import { toast } from '../../store/toast'
import { fmtDate, todayISO } from '../../lib/format'
import type { AppointmentStatus, Patient } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

const STATUS_TONE: Record<AppointmentStatus, 'blue' | 'teal' | 'amber' | 'green' | 'red' | 'slate' | 'violet'> = {
  booked: 'slate', confirmed: 'blue', checked_in: 'teal', in_consultation: 'violet', completed: 'green', cancelled: 'red', no_show: 'amber',
}

export function Appointments() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const { doctorName, deptName } = useRefData()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('today')
  const { data: appts, loading, reload } = useQuery(() => repo.listAppointments(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p.name])); return (id: string) => m.get(id) ?? id }, [patients])

  const rows = useMemo(() => {
    const today = todayISO()
    return (appts ?? [])
      .filter((a) => filter === 'all' || (filter === 'today' ? a.date === today : a.date >= today))
      .filter((a) => { const t = q.trim().toLowerCase(); return !t || (a.code ?? a.id).toLowerCase().includes(t) || patientName(a.patientId).toLowerCase().includes(t) })
  }, [appts, q, filter, patientName])

  async function setStatus(id: string, status: AppointmentStatus, msg: string) {
    try { await repo.setAppointmentStatus(id, status); toast.success(msg); reload() } catch (e) { toast.error('Update failed', String((e as Error).message)) }
  }

  return (
    <div>
      <PageHeader title="Appointments" subtitle="Schedule and manage OPD appointments" icon={<CalendarDays size={22} />}
        actions={can('appointments.manage') && <button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Book Appointment</button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-surface-line p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input className="input pl-9" placeholder="Search appointment ID or patient…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="flex gap-1 rounded-lg bg-surface-sunken p-1">
            {(['today', 'upcoming', 'all'] as const).map((ff) => (
              <button key={ff} onClick={() => setFilter(ff)} className={`rounded-md px-3 py-1.5 text-sm font-semibold capitalize ${filter === ff ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}>{ff}</button>
            ))}
          </div>
          {loading && <Loader2 size={16} className="animate-spin text-ink-faint" />}
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={<CalendarDays size={22} />} title="No appointments" hint="Book a new appointment to get started." />
        ) : (
          <Table head={<><th className="th">Appt ID</th><th className="th">Patient</th><th className="th">Doctor</th><th className="th">Dept</th><th className="th">Date / Time</th><th className="th">Type</th><th className="th">Status</th><th className="th">Actions</th></>}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="td font-mono text-xs font-semibold text-brand-700">{a.code ?? a.id}</td>
                <td className="td font-medium">{patientName(a.patientId)}</td>
                <td className="td">{doctorName(a.doctorId)}</td>
                <td className="td text-ink-soft">{deptName(a.departmentId)}</td>
                <td className="td">{fmtDate(a.date)} · {a.time}</td>
                <td className="td"><Badge tone={a.type === 'new' ? 'blue' : 'teal'}>{a.type === 'new' ? 'New' : 'Follow-up'}</Badge></td>
                <td className="td"><Badge tone={STATUS_TONE[a.status]}>{a.status.replace('_', ' ')}</Badge></td>
                <td className="td">
                  {can('appointments.manage') && a.status !== 'completed' && a.status !== 'cancelled' && (
                    <div className="flex gap-1">
                      {a.status === 'confirmed' && <button onClick={() => setStatus(a.id, 'checked_in', 'Patient checked in')} className="btn-ghost !px-2 !py-1 text-xs"><LogIn size={13} /> Check-in</button>}
                      {a.status === 'checked_in' && <button onClick={() => setStatus(a.id, 'completed', 'Marked completed')} className="btn-ghost !px-2 !py-1 text-xs"><Check size={13} /> Complete</button>}
                      <button onClick={() => setStatus(a.id, 'cancelled', 'Appointment cancelled')} className="btn-danger !px-2 !py-1 text-xs"><X size={13} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {open && <BookModal onClose={() => setOpen(false)} onBooked={reload} />}
    </div>
  )
}

function BookModal({ onClose, onBooked }: { onClose: () => void; onBooked: () => void }) {
  const repo = getRepository()
  const { departments, doctors } = useRefData()
  const [f, setF] = useState({ patientId: '', departmentId: '', doctorId: '', date: todayISO(), time: '10:00', type: 'new' as 'new' | 'follow_up', reason: '' })
  const [psearch, setPsearch] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: matches } = useQuery(() => (psearch.trim() ? repo.listPatients(psearch) : Promise.resolve([] as Patient[])), [psearch])
  const { data: selectedList } = useQuery(() => (f.patientId ? repo.getPatient(f.patientId).then((p) => (p ? [p] : [])) : Promise.resolve([])), [f.patientId])
  const selected = selectedList?.[0]
  const deptId = f.departmentId || departments[0]?.id || ''
  const deptDoctors = doctors.filter((d) => d.departmentId === deptId && d.active)

  async function book() {
    if (!f.patientId) return toast.error('Select a patient')
    if (!f.doctorId) return toast.error('Select a doctor')
    setBusy(true)
    try {
      const a = await repo.bookAppointment({ ...f, departmentId: deptId })
      toast.success('Appointment booked', `${a.code ?? a.id} · confirmation sent`)
      onBooked(); onClose()
    } catch (e) { toast.error('Booking failed', String((e as Error).message)) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} title="Book Appointment" subtitle="Confirmation is sent automatically via RCS/SMS"
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={book} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} />} Book</button></>}>
      <div className="space-y-4">
        <Field label="Patient" required>
          {selected ? (
            <div className="flex items-center justify-between rounded-lg border border-surface-line px-3 py-2">
              <span className="text-sm"><b>{selected.name}</b> · {selected.code ?? selected.id} · {selected.mobile}</span>
              <button className="text-xs text-brand-600" onClick={() => setF({ ...f, patientId: '' })}>Change</button>
            </div>
          ) : (
            <>
              <input className="input" placeholder="Search patient by name / ID / mobile…" value={psearch} onChange={(e) => setPsearch(e.target.value)} />
              {(matches ?? []).slice(0, 5).length > 0 && (
                <div className="mt-1 rounded-lg border border-surface-line">
                  {(matches ?? []).slice(0, 5).map((p) => (
                    <button key={p.id} onClick={() => { setF({ ...f, patientId: p.id }); setPsearch('') }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted">
                      <span>{p.name} · <span className="text-ink-faint">{p.code ?? p.id}</span></span><span className="text-xs text-ink-faint">{p.mobile}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Department"><select className="input" value={deptId} onChange={(e) => setF({ ...f, departmentId: e.target.value, doctorId: '' })}>{departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Doctor" required><select className="input" value={f.doctorId} onChange={(e) => setF({ ...f, doctorId: e.target.value })}><option value="">Select…</option>{deptDoctors.map((d) => <option key={d.id} value={d.id}>{d.name} — ₹{d.consultationFee}</option>)}</select></Field>
          <Field label="Date"><input type="date" className="input" min={todayISO()} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Time"><input type="time" className="input" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
          <Field label="Type"><select className="input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as 'new' | 'follow_up' })}><option value="new">New</option><option value="follow_up">Follow-up</option></select></Field>
          <Field label="Reason"><input className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Chief complaint" /></Field>
        </div>
      </div>
    </Modal>
  )
}

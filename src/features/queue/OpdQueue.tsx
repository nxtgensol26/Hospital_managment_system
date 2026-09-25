import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, ArrowRight, Clock, UserRound, Loader2 } from 'lucide-react'
import { PageHeader, Card, Badge, EmptyState, Avatar } from '../../components/ui'
import { todayISO } from '../../lib/format'
import { toast } from '../../store/toast'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'
import type { Appointment } from '../../types'

export function OpdQueue() {
  const repo = getRepository()
  const nav = useNavigate()
  const { doctorName, deptName } = useRefData()
  const { data: appts, loading, reload } = useQuery(() => repo.listAppointments(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p.name])); return (id: string) => m.get(id) ?? id }, [patients])
  const today = todayISO()
  const queue = (appts ?? []).filter((a) => a.date === today && (a.status === 'checked_in' || a.status === 'in_consultation' || a.status === 'confirmed'))
  const waiting = queue.filter((a) => a.status === 'checked_in')
  const inConsult = queue.filter((a) => a.status === 'in_consultation')
  const upcoming = queue.filter((a) => a.status === 'confirmed')

  const Col = ({ title, tone, items, empty }: { title: string; tone: 'teal' | 'violet' | 'blue'; items: Appointment[]; empty: string }) => (
    <Card>
      <div className="flex items-center justify-between border-b border-surface-line px-4 py-3"><h3 className="text-sm font-bold text-ink">{title}</h3><Badge tone={tone}>{items.length}</Badge></div>
      <div className="space-y-2 p-3">
        {items.length === 0 ? <p className="px-2 py-6 text-center text-sm text-ink-faint">{empty}</p> : items.map((a) => (
          <div key={a.id} className="rounded-xl border border-surface-line p-3">
            <div className="flex items-center gap-2.5">
              <Avatar name={patientName(a.patientId)} size={34} />
              <div className="min-w-0 flex-1"><p className="truncate font-semibold text-ink">{patientName(a.patientId)}</p><p className="truncate text-xs text-ink-faint">{a.code ?? a.id} · {deptName(a.departmentId)}</p></div>
              <span className="flex items-center gap-1 text-xs text-ink-faint"><Clock size={12} /> {a.time}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-ink-soft">{doctorName(a.doctorId)}</span>
              {a.status === 'confirmed' && <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={async () => { await repo.setAppointmentStatus(a.id, 'checked_in'); toast.success('Checked in'); reload() }}>Check-in</button>}
              {a.status === 'checked_in' && <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={async () => { await repo.setAppointmentStatus(a.id, 'in_consultation'); nav('/consultations') }}>Start <ArrowRight size={12} /></button>}
              {a.status === 'in_consultation' && <button className="btn-teal !px-2.5 !py-1 text-xs" onClick={() => nav('/consultations')}>Open <ArrowRight size={12} /></button>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )

  return (
    <div>
      <PageHeader title="OPD Queue" subtitle={`Live consultation queue · ${new Date().toLocaleDateString('en-IN', { dateStyle: 'medium' })}`} icon={<ClipboardList size={22} />}
        actions={loading ? <Loader2 size={16} className="animate-spin text-ink-faint" /> : undefined} />
      {queue.length === 0 ? (
        <Card><EmptyState icon={<UserRound size={22} />} title="Queue is empty" hint="Checked-in patients for today appear here. Check patients in from Appointments." /></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Col title="Upcoming (confirmed)" tone="blue" items={upcoming} empty="No upcoming today" />
          <Col title="Waiting" tone="teal" items={waiting} empty="Nobody waiting" />
          <Col title="In Consultation" tone="violet" items={inConsult} empty="No active consultations" />
        </div>
      )}
    </div>
  )
}

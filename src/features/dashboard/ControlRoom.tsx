import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Users, Stethoscope, BedDouble, Siren, FlaskConical, Pill, ReceiptText, TrendingUp,
  AlertTriangle, ArrowRight, Activity, IndianRupee,
} from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, StatCard, Card, CardHeader, Badge, EmptyState } from '../../components/ui'
import { MiniBars, Donut } from '../../components/charts'
import { inr, relTime, todayISO } from '../../lib/format'
import { ROLE_LABELS } from '../../lib/rbac'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

export function ControlRoom() {
  const repo = getRepository()
  const user = useAuth((s) => s.user)!
  const nav = useNavigate()
  const { doctorName } = useRefData()

  const { data: s } = useQuery(() => repo.dashboardStats(), [])
  const { data: rev } = useQuery(() => repo.revenueTrend(), [])
  const { data: visits } = useQuery(() => repo.visitsTrend(), [])
  const { data: low } = useQuery(() => repo.lowStock(), [])
  const { data: audit } = useQuery(() => repo.listAudit(), [])
  const { data: appts } = useQuery(() => repo.listAppointments(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p.name])); return (id: string) => m.get(id) ?? id }, [patients])

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'
  const today = todayISO()
  const todaysAppts = (appts ?? []).filter((a) => a.date === today)

  const S = s ?? { patientsTotal: 0, opdToday: 0, ipdActive: 0, emergencyActive: 0, admissionsToday: 0, dischargesToday: 0, bedsAvailable: 0, bedsOccupied: 0, bedsTotal: 0, labSamplesPending: 0, reportsPending: 0, pharmacyQueue: 0, pendingPayments: 0, revenueToday: 0, lowStock: 0 }

  return (
    <div>
      <PageHeader title="Hospital Control Room" subtitle={`${greeting}, ${user.name.split(' ')[0]} · ${ROLE_LABELS[user.role]} · ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} icon={<Activity size={22} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Patients" value={S.patientsTotal} sub="Registered master records" icon={<Users size={18} />} tone="blue" onClick={() => nav('/patients')} />
        <StatCard label="OPD Today" value={S.opdToday} sub="Appointments scheduled" icon={<Stethoscope size={18} />} tone="teal" onClick={() => nav('/appointments')} />
        <StatCard label="IPD Admitted" value={S.ipdActive} sub={`${S.admissionsToday} in · ${S.dischargesToday} out today`} icon={<BedDouble size={18} />} tone="violet" onClick={() => nav('/ipd')} />
        <StatCard label="Emergency Active" value={S.emergencyActive} sub="Cases in progress" icon={<Siren size={18} />} tone="red" onClick={() => nav('/emergency')} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Beds Available" value={`${S.bedsAvailable}/${S.bedsTotal}`} sub={`${S.bedsOccupied} occupied`} icon={<BedDouble size={18} />} tone="green" onClick={() => nav('/beds')} />
        <StatCard label="Lab Samples" value={S.labSamplesPending} sub={`${S.reportsPending} awaiting verify`} icon={<FlaskConical size={18} />} tone="amber" onClick={() => nav('/lab')} />
        <StatCard label="Pharmacy Queue" value={S.pharmacyQueue} sub={`${S.lowStock} low-stock items`} icon={<Pill size={18} />} tone="teal" onClick={() => nav('/pharmacy')} />
        <StatCard label="Pending Payments" value={inr(S.pendingPayments)} sub={`${inr(S.revenueToday)} collected today`} icon={<ReceiptText size={18} />} tone="red" onClick={() => nav('/billing')} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Revenue — last 7 days" subtitle="Collected payments across OPD, pharmacy & IPD" action={<Badge tone="green"><IndianRupee size={12} /> {inr(S.revenueToday)} today</Badge>} />
          <div className="p-5"><MiniBars data={rev ?? []} color="#0d8985" unit="₹" /></div>
        </Card>
        <Card>
          <CardHeader title="Bed Occupancy" subtitle="Live capacity" />
          <div className="grid place-items-center p-5">
            <Donut segments={[{ label: 'Available', value: S.bedsAvailable, color: '#16aaa4' }, { label: 'Occupied', value: S.bedsOccupied, color: '#1866e0' }, { label: 'Other', value: Math.max(0, S.bedsTotal - S.bedsAvailable - S.bedsOccupied), color: '#cbd5e1' }]} />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Patient footfall — 7 days" subtitle="Appointments + emergency" action={<TrendingUp size={16} className="text-brand-500" />} />
          <div className="p-5"><MiniBars data={visits ?? []} color="#1866e0" /></div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Recent activity" subtitle="Live audit stream" action={<Link to="/audit" className="text-xs font-semibold text-brand-600">View all</Link>} />
          <div className="divide-y divide-surface-line">
            {(audit ?? []).slice(0, 6).map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-2.5">
                <div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{a.action}</p><p className="truncate text-xs text-ink-faint">{a.actorName} · {a.entity}{a.entityId ? ` · ${a.entityId}` : ''}</p></div>
                <span className="shrink-0 text-xs text-ink-faint">{relTime(a.at)}</span>
              </div>
            ))}
            {(audit ?? []).length === 0 && <EmptyState title="No activity yet" hint="Actions across the hospital appear here." />}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Low-stock alerts" subtitle="Medicines at or below reorder level" action={<Link to="/pharmacy" className="text-xs font-semibold text-brand-600">Manage</Link>} />
          <div className="p-3">
            {(low ?? []).length === 0 ? <EmptyState title="Stock healthy" hint="No medicines below reorder level." /> : (
              <div className="space-y-1.5">
                {(low ?? []).slice(0, 5).map((m) => (
                  <div key={m.name} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2"><span className="text-sm font-medium text-ink">{m.name}</span><Badge tone="amber"><AlertTriangle size={11} /> {m.qty} left / reorder {m.reorderLevel}</Badge></div>
                ))}
              </div>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Today's appointments" subtitle="Upcoming consultations" action={<Link to="/appointments" className="text-xs font-semibold text-brand-600">Open</Link>} />
          <div className="p-3">
            {todaysAppts.length === 0 ? <EmptyState title="No appointments today" hint="Booked appointments for today show here." /> : (
              <div className="space-y-1.5">
                {todaysAppts.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center justify-between rounded-lg border border-surface-line px-3 py-2">
                    <div><p className="text-sm font-medium text-ink">{patientName(a.patientId)}</p><p className="text-xs text-ink-faint">{a.code ?? a.id} · {doctorName(a.doctorId)} · {a.time}</p></div>
                    <ArrowRight size={15} className="text-ink-faint" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}

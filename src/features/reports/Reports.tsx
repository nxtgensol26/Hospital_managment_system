import { useMemo } from 'react'
import { BarChart3, Timer, TrendingUp, Users, IndianRupee } from 'lucide-react'
import { PageHeader, Card, CardHeader, Badge, EmptyState } from '../../components/ui'
import { MiniBars, Donut } from '../../components/charts'
import { inr } from '../../lib/format'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

export function Reports() {
  const repo = getRepository()
  const { doctors, departments, deptName } = useRefData()
  const { data: friction } = useQuery(() => repo.frictionMap(), [])
  const { data: rev } = useQuery(() => repo.revenueTrend(), [])
  const { data: visits } = useQuery(() => repo.visitsTrend(), [])
  const { data: stats } = useQuery(() => repo.dashboardStats(), [])
  const { data: appts } = useQuery(() => repo.listAppointments(), [])
  const { data: consults } = useQuery(() => repo.listConsultations(), [])

  const fr = friction ?? []
  const maxFriction = Math.max(1, ...fr.map((f) => f.avgMin ?? 0))
  const deptColors = ['#1866e0', '#16aaa4', '#7c3aed', '#d97706', '#e11d48', '#0891b2', '#059669', '#64748b']
  const deptDist = useMemo(() => departments.map((d, i) => ({ label: d.name, value: (appts ?? []).filter((a) => a.departmentId === d.id).length, color: deptColors[i % deptColors.length] })).filter((x) => x.value > 0), [departments, appts])
  const topDoctors = useMemo(() => doctors.map((d) => ({ doc: d, count: (consults ?? []).filter((c) => c.doctorId === d.id).length })).sort((a, b) => b.count - a.count).slice(0, 5), [doctors, consults])

  return (
    <div>
      <PageHeader title="Reports & Patient Flow" subtitle="Operational analytics — identify bottlenecks and workload" icon={<BarChart3 size={22} />} />
      <Card className="mb-5">
        <CardHeader title="Patient Flow — Friction Map" subtitle="Average time patients spend at each stage (operational, not clinical)" action={<Badge tone="violet"><Timer size={12} /> Avg minutes</Badge>} />
        <div className="p-5">
          {fr.every((f) => f.avgMin == null) ? (
            <EmptyState icon={<Timer size={22} />} title="Not enough flow data yet" hint="As patients are checked in, consulted, lab-tested and billed with tracked visits, average stage durations appear here." />
          ) : (
            <div className="space-y-3">
              {fr.map((f) => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="w-52 shrink-0 text-sm text-ink-soft">{f.label}</span>
                  <div className="h-7 flex-1 overflow-hidden rounded-lg bg-surface-sunken">
                    {f.avgMin != null && <div className="flex h-full items-center justify-end rounded-lg bg-gradient-to-r from-brand-400 to-brand-600 px-2 text-xs font-bold text-white" style={{ width: `${Math.max(8, (f.avgMin / maxFriction) * 100)}%` }}>{f.avgMin}m</div>}
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs text-ink-faint">{f.samples ? `${f.samples} pts` : 'no data'}</span>
                </div>
              ))}
              <p className="pt-2 text-xs text-ink-faint">Longest waits highlight where to add capacity. Operational metric only — NxtHealth makes no clinical predictions.</p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Revenue — 7 days" subtitle="Collected payments" action={<Badge tone="green"><IndianRupee size={12} /> {inr(stats?.revenueToday ?? 0)} today</Badge>} /><div className="p-5"><MiniBars data={rev ?? []} color="#0d8985" unit="₹" /></div></Card>
        <Card><CardHeader title="Footfall — 7 days" subtitle="Appointments + emergency" action={<TrendingUp size={16} className="text-brand-500" />} /><div className="p-5"><MiniBars data={visits ?? []} color="#1866e0" /></div></Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card><CardHeader title="Appointments by Department" /><div className="grid place-items-center p-5">{deptDist.length === 0 ? <EmptyState title="No appointment data" /> : <Donut segments={deptDist} size={170} />}</div></Card>
        <Card><CardHeader title="Doctor Workload" subtitle="By completed consultations" action={<Users size={16} className="text-ink-faint" />} />
          <div className="divide-y divide-surface-line">
            {topDoctors.map(({ doc, count }, i) => (
              <div key={doc.id} className="flex items-center gap-3 px-5 py-3">
                <span className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${i === 0 ? 'bg-amber-100 text-amber-700' : 'bg-surface-sunken text-ink-soft'}`}>#{i + 1}</span>
                <div className="flex-1"><p className="text-sm font-semibold text-ink">{doc.name}</p><p className="text-xs text-ink-faint">{deptName(doc.departmentId)}</p></div>
                <Badge tone="teal">{count} consults</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import {
  LayoutDashboard, UserRound, CalendarDays, Stethoscope, Pill, FlaskConical, ReceiptText,
  Activity, LogOut, BellRing, FileText, Clock, AlertTriangle, Loader2,
} from 'lucide-react'
import { useAuth } from '../../store/auth'
import { Wordmark } from '../../components/Logo'
import { Card, CardHeader, Badge, Avatar, EmptyState, Table } from '../../components/ui'
import { ForcePasswordChange } from '../auth/ForcePasswordChange'
import { APP } from '../../config'
import type { TimelineEvent } from '../../lib/selectors'
import { ageFromDob, fmtDate, fmtDateTime, inr, relTime, todayISO } from '../../lib/format'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

type Section = 'dashboard' | 'profile' | 'appointments' | 'consultations' | 'prescriptions' | 'lab' | 'bills' | 'timeline' | 'notifications'
const NAV: [Section, string, typeof LayoutDashboard][] = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['profile', 'My Profile', UserRound],
  ['appointments', 'Appointments', CalendarDays], ['consultations', 'Consultations', Stethoscope],
  ['prescriptions', 'Prescriptions', Pill], ['lab', 'Lab Reports', FlaskConical],
  ['bills', 'Bills & Payments', ReceiptText], ['timeline', 'Health Timeline', Activity],
  ['notifications', 'Notifications', BellRing],
]

export function Portal() {
  const user = useAuth((s) => s.user)!
  const logout = useAuth((s) => s.logout)
  const repo = getRepository()
  const [section, setSection] = useState<Section>('dashboard')
  const { doctorName, deptName } = useRefData()

  const { data: patient, loading: pLoading, error: pErr } = useQuery(() => repo.getMyPatient(), [])
  const { data: record } = useQuery(() => (patient ? repo.getPatientRecord(patient.id) : Promise.resolve(null)), [patient?.id])
  const { data: hospital } = useQuery(() => repo.getHospital().catch(() => null), [])
  const { data: notifs } = useQuery(() => repo.listNotifications(), [])
  const { data: tests } = useQuery(() => repo.listLabTests(), [])
  const testName = useMemo(() => { const m = new Map((tests ?? []).map((t) => [t.id, t.name])); return (tid: string) => m.get(tid) ?? 'Test' }, [tests])

  if (pLoading && !patient) return <div className="grid min-h-screen place-items-center text-sm text-ink-faint"><span className="flex items-center gap-2"><Loader2 size={18} className="animate-spin" /> Loading your records…</span></div>
  if (pErr || !patient) return <div className="grid min-h-screen place-items-center p-6 text-center"><div><p className="font-semibold text-ink">Patient record not found</p><button className="btn-outline mt-3" onClick={() => logout()}>Sign out</button></div></div>

  const appts = record?.appointments ?? []
  const consults = record?.consultations ?? []
  const rxs = record?.prescriptions ?? []
  const orders = record?.labOrders ?? []
  const samples = record?.labSamples ?? []
  const bills = record?.bills ?? []
  const payments = record?.payments ?? []
  const timeline = record?.timeline ?? []
  const myNotifs = notifs ?? []
  const followUps = consults.filter((c) => c.followUpDate).map((c) => c.followUpDate!)
  const upcoming = appts.filter((a) => a.date >= todayISO() && a.status !== 'cancelled')
  const primaryDoctorId = consults[0]?.doctorId ?? appts[0]?.doctorId
  const primaryDoctor = primaryDoctorId ? doctorName(primaryDoctorId) : null

  return (
    <div className="flex min-h-screen bg-surface-muted">
      <ForcePasswordChange />
      <aside className="hidden w-64 shrink-0 flex-col border-r border-surface-line bg-white shadow-rail md:flex">
        <div className="flex h-16 items-center px-5"><Wordmark size="sm" /></div>
        <div className="px-4 pb-2"><p className="text-[10px] font-bold uppercase tracking-wider text-ink-faint">Patient Portal</p></div>
        <nav className="flex-1 space-y-0.5 px-3">
          {NAV.map(([s, label, Icon]) => (
            <button key={s} onClick={() => setSection(s)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${section === s ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-surface-muted'}`}><Icon size={17} /> {label}</button>
          ))}
        </nav>
        <div className="border-t border-surface-line p-3">
          <button onClick={() => logout()} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"><LogOut size={16} /> Sign out</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-surface-line bg-white px-5">
          <div className="md:hidden"><Wordmark size="sm" /></div>
          <select className="input max-w-[200px] md:hidden" value={section} onChange={(e) => setSection(e.target.value as Section)}>{NAV.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select>
          <div className="flex items-center gap-3">
            <div className="text-right"><p className="text-sm font-semibold text-ink">{patient.name}</p><p className="text-xs text-ink-faint">{patient.code ?? patient.id}</p></div>
            <Avatar name={patient.name} size={36} tone={patient.gender === 'female' ? 'violet' : 'blue'} />
            <button onClick={() => logout()} className="rounded-lg p-2 text-ink-faint hover:bg-surface-muted md:hidden"><LogOut size={16} /></button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          <div className="mx-auto max-w-5xl">
            {section === 'dashboard' && (
              <div>
                <div className="mb-5 rounded-2xl bg-gradient-to-br from-brand-700 to-navy-800 p-6 text-white">
                  <p className="text-sm text-white/70">Welcome,</p>
                  <h1 className="text-2xl font-extrabold">{patient.name}</h1>
                  <p className="mt-1 text-sm text-white/70">{patient.code ?? patient.id} · {ageFromDob(patient.dob, patient.ageYears)} · {patient.gender}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {hospital?.name && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">{hospital.name}</span>}
                    {primaryDoctor && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">Dr. {primaryDoctor.replace(/^Dr\.?\s*/i, '')}</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[['Appointments', appts.length, CalendarDays], ['Prescriptions', rxs.length, Pill], ['Lab Reports', orders.length, FlaskConical], ['Bills', bills.length, ReceiptText]].map(([l, v, I]: any) => (
                    <Card key={l} className="p-4"><div className="flex items-center justify-between"><div><p className="text-xs text-ink-faint">{l}</p><p className="text-2xl font-extrabold text-ink">{v}</p></div><I size={18} className="text-brand-500" /></div></Card>
                  ))}
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Card><CardHeader title="Upcoming Appointments" /><div className="p-4">{upcoming.length === 0 ? <p className="text-sm text-ink-faint">No upcoming appointments.</p> : upcoming.map((a) => <div key={a.id} className="mb-2 rounded-lg border border-surface-line p-3 text-sm"><p className="font-semibold">{doctorName(a.doctorId)}</p><p className="text-ink-faint">{a.code ?? a.id} · {fmtDate(a.date)} {a.time} · {deptName(a.departmentId)}</p></div>)}</div></Card>
                  <Card><CardHeader title="Follow-up Dates" /><div className="p-4">{followUps.length === 0 ? <p className="text-sm text-ink-faint">No follow-ups scheduled.</p> : followUps.map((d, i) => <div key={i} className="mb-2 flex items-center gap-2 rounded-lg bg-teal-50 p-3 text-sm text-teal-800"><Clock size={15} /> {fmtDate(d)}</div>)}</div></Card>
                </div>
              </div>
            )}

            {section === 'profile' && (
              <Card><CardHeader title="My Profile" />
                <div className="grid gap-x-8 gap-y-2 p-5 sm:grid-cols-2">
                  {[['Patient ID', patient.code ?? patient.id], ['Name', patient.name], ['Age / Gender', `${ageFromDob(patient.dob, patient.ageYears)} · ${patient.gender}`], ['Mobile', patient.mobile], ['Blood Group', patient.bloodGroup], ['Address', patient.address || '—'], ['Emergency Contact', `${patient.emergencyContactName || '—'} ${patient.emergencyContactPhone || ''}`]].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-dashed border-surface-line py-2 text-sm"><span className="text-ink-faint">{k}</span><span className="font-semibold text-ink">{v}</span></div>
                  ))}
                </div>
                {patient.allergies && <div className="mx-5 mb-5 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle size={15} /> Allergies: {patient.allergies}</div>}
              </Card>
            )}

            {section === 'appointments' && (
              <Card><CardHeader title="My Appointments" />
                {appts.length === 0 ? <EmptyState icon={<CalendarDays size={22} />} title="No appointments" /> : (
                  <Table head={<><th className="th">Appt ID</th><th className="th">Doctor</th><th className="th">Dept</th><th className="th">Date/Time</th><th className="th">Status</th></>}>
                    {appts.map((a) => <tr key={a.id}><td className="td font-mono text-xs text-brand-700">{a.code ?? a.id}</td><td className="td">{doctorName(a.doctorId)}</td><td className="td text-ink-soft">{deptName(a.departmentId)}</td><td className="td">{fmtDate(a.date)} {a.time}</td><td className="td"><Badge tone="blue">{a.status.replace('_', ' ')}</Badge></td></tr>)}
                  </Table>
                )}
              </Card>
            )}

            {section === 'consultations' && (
              <Card><CardHeader title="Doctor Consultations" />
                <div className="p-4">{consults.length === 0 ? <EmptyState icon={<Stethoscope size={22} />} title="No consultations" /> : consults.map((c) => (
                  <div key={c.id} className="mb-3 rounded-xl border border-surface-line p-4">
                    <div className="flex justify-between"><p className="font-semibold">{doctorName(c.doctorId)}</p><span className="text-xs text-ink-faint">{fmtDateTime(c.date)}</span></div>
                    {c.diagnosis && <p className="mt-1 text-sm"><b>Diagnosis:</b> {c.diagnosis}</p>}
                    {c.advice && <p className="text-sm text-ink-soft"><b>Advice:</b> {c.advice}</p>}
                    {c.followUpDate && <Badge tone="teal">Follow-up: {fmtDate(c.followUpDate)}</Badge>}
                  </div>
                ))}</div>
              </Card>
            )}

            {section === 'prescriptions' && (
              <Card><CardHeader title="My Prescriptions" />
                <div className="p-4">{rxs.length === 0 ? <EmptyState icon={<Pill size={22} />} title="No prescriptions" /> : rxs.map((rx) => (
                  <div key={rx.id} className="mb-3 rounded-xl border border-surface-line p-4">
                    <div className="mb-2 flex justify-between"><p className="font-semibold text-brand-700">{rx.code ?? rx.id}</p><Badge tone={rx.status === 'dispensed' ? 'green' : 'amber'}>{rx.status.replace('_', ' ')}</Badge></div>
                    <Table head={<><th className="th">Medicine</th><th className="th">Dosage</th><th className="th">Freq</th><th className="th">Duration</th></>}>{rx.items.map((it) => <tr key={it.id}><td className="td">{it.medicineName}</td><td className="td">{it.dosage}</td><td className="td">{it.frequency}</td><td className="td">{it.duration}</td></tr>)}</Table>
                  </div>
                ))}</div>
              </Card>
            )}

            {section === 'lab' && (
              <Card><CardHeader title="Lab & Imaging Reports" />
                <div className="p-4">{orders.length === 0 ? <EmptyState icon={<FlaskConical size={22} />} title="No lab reports" /> : orders.map((o) => {
                  const os = samples.filter((s) => s.orderId === o.id)
                  return (
                    <div key={o.id} className="mb-3 rounded-xl border border-surface-line p-4">
                      <div className="mb-2 flex justify-between"><p className="font-semibold text-brand-700">{o.code ?? o.id} <span className="text-xs font-normal text-ink-faint">{fmtDate(o.createdAt)}</span></p><Badge tone={o.status === 'reported' ? 'green' : 'amber'}>{o.status}</Badge></div>
                      {o.status === 'reported' ? (
                        <Table head={<><th className="th">Test</th><th className="th">Result</th><th className="th">Ref</th></>}>{os.map((s) => <tr key={s.id}><td className="td">{testName(s.testId)}</td><td className="td font-semibold">{s.result} {s.resultUnit} {s.flag && s.flag !== 'normal' && <Badge tone={s.flag === 'critical' ? 'red' : 'amber'}>{s.flag}</Badge>}</td><td className="td text-ink-faint">{s.refRange}</td></tr>)}</Table>
                      ) : <p className="text-sm text-ink-faint">Report will be available once released by the lab.</p>}
                    </div>
                  )
                })}</div>
              </Card>
            )}

            {section === 'bills' && (
              <div className="space-y-4">
                <Card><CardHeader title="Bills" />
                  {bills.length === 0 ? <EmptyState icon={<ReceiptText size={22} />} title="No bills" /> : (
                    <Table head={<><th className="th">Invoice</th><th className="th">Date</th><th className="th">Total</th><th className="th">Paid</th><th className="th">Status</th></>}>{bills.map((b) => <tr key={b.id}><td className="td font-mono text-xs text-brand-700">{b.code ?? b.id}</td><td className="td">{fmtDate(b.createdAt)}</td><td className="td font-semibold">{inr(b.total)}</td><td className="td">{inr(b.paid)}</td><td className="td"><Badge tone={b.status === 'paid' ? 'green' : b.status === 'partial' ? 'amber' : 'red'}>{b.status}</Badge></td></tr>)}</Table>
                  )}
                </Card>
                <Card><CardHeader title="Payment History" />
                  {payments.length === 0 ? <p className="p-4 text-sm text-ink-faint">No payments yet.</p> : (
                    <Table head={<><th className="th">Date</th><th className="th">Invoice</th><th className="th">Amount</th><th className="th">Method</th></>}>{payments.map((p) => <tr key={p.id}><td className="td">{fmtDateTime(p.at)}</td><td className="td">{p.billId}</td><td className="td font-semibold">{inr(p.amount)}</td><td className="td capitalize">{p.method}</td></tr>)}</Table>
                  )}
                </Card>
              </div>
            )}

            {section === 'timeline' && (
              <Card><CardHeader title="Health Timeline" subtitle="Your complete history at this hospital" />
                <div className="p-5">{timeline.length === 0 ? <EmptyState icon={<Activity size={22} />} title="No history yet" /> : (
                  <ol className="relative ml-3 border-l-2 border-surface-line">{timeline.map((e: TimelineEvent, i) => (
                    <li key={i} className="mb-5 ml-6">
                      <span className="absolute -left-[9px] h-4 w-4 rounded-full bg-brand-500 ring-4 ring-white" />
                      <p className="font-semibold text-ink">{e.title}</p>
                      {e.detail && <p className="text-sm text-ink-soft">{e.detail}</p>}
                      <p className="text-xs text-ink-faint">{fmtDateTime(e.at)}</p>
                    </li>
                  ))}</ol>
                )}</div>
              </Card>
            )}

            {section === 'notifications' && (
              <Card><CardHeader title="Notifications" />
                <div className="p-4">{myNotifs.length === 0 ? <EmptyState icon={<BellRing size={22} />} title="No notifications" /> : myNotifs.map((n) => (
                  <div key={n.id} className="mb-2 flex items-start gap-3 rounded-lg border border-surface-line p-3">
                    <FileText size={16} className="mt-0.5 text-brand-500" />
                    <div className="min-w-0 flex-1"><p className="text-sm text-ink">{n.message}</p><p className="text-xs text-ink-faint">{n.channel.toUpperCase()} · {relTime(n.at)}</p></div>
                  </div>
                ))}</div>
              </Card>
            )}
          </div>
          <footer className="mt-6 text-center text-xs text-ink-faint">{APP.product} Patient Portal · {APP.company} · {APP.support.phone}</footer>
        </main>
      </div>
    </div>
  )
}

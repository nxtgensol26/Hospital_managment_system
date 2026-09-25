import { useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, MapPin, Droplet, AlertTriangle, CalendarDays, FlaskConical, Pill,
  ReceiptText, Activity, Stethoscope, UserRound, ShieldAlert, Clock, Loader2,
} from 'lucide-react'
import { PageHeader, Card, CardHeader, Badge, Avatar, EmptyState, Table } from '../../components/ui'
import type { TimelineEvent } from '../../lib/selectors'
import { ageFromDob, fmtDate, fmtDateTime, inr } from '../../lib/format'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

const KIND_META: Record<TimelineEvent['kind'], { color: string; icon: typeof Activity; label: string }> = {
  registration: { color: '#1866e0', icon: UserRound, label: 'Registration' },
  appointment: { color: '#0d8985', icon: CalendarDays, label: 'Appointment' },
  vitals: { color: '#7c3aed', icon: Activity, label: 'Vitals' },
  consultation: { color: '#1866e0', icon: Stethoscope, label: 'Consultation' },
  lab: { color: '#d97706', icon: FlaskConical, label: 'Lab Order' },
  report: { color: '#0d8985', icon: FlaskConical, label: 'Report' },
  prescription: { color: '#7c3aed', icon: Pill, label: 'Prescription' },
  billing: { color: '#e11d48', icon: ReceiptText, label: 'Billing' },
  payment: { color: '#059669', icon: ReceiptText, label: 'Payment' },
  admission: { color: '#1866e0', icon: Activity, label: 'Admission' },
  discharge: { color: '#059669', icon: Activity, label: 'Discharge' },
  emergency: { color: '#e11d48', icon: ShieldAlert, label: 'Emergency' },
}

type Tab = 'timeline' | 'consultations' | 'prescriptions' | 'lab' | 'bills'

export function PatientProfile() {
  const { id } = useParams()
  const nav = useNavigate()
  const repo = getRepository()
  const [tab, setTab] = useState<Tab>('timeline')
  const { doctorName } = useRefData()
  const { data: tests } = useQuery(() => repo.listLabTests(), [])
  const { data: record, loading, error } = useQuery(() => repo.getPatientRecord(id!), [id])
  const testName = useMemo(() => { const m = new Map((tests ?? []).map((t) => [t.id, t.name])); return (tid: string) => m.get(tid) ?? 'Test' }, [tests])

  if (loading && !record) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-faint"><Loader2 size={18} className="animate-spin" /> Loading patient…</div>
  if (error || !record) {
    return <EmptyState icon={<UserRound size={22} />} title="Patient not found" hint={error} action={<button className="btn-outline" onClick={() => nav('/patients')}>Back to patients</button>} />
  }

  const patient = record.patient
  const timeline = record.timeline
  const consultations = record.consultations
  const prescriptions = record.prescriptions
  const labOrders = record.labOrders
  const bills = record.bills
  const lastVitals = record.vitals[0]

  return (
    <div>
      <button onClick={() => nav('/patients')} className="mb-3 flex items-center gap-1.5 text-sm font-medium text-ink-soft hover:text-ink"><ArrowLeft size={15} /> Back to patients</button>

      <Card className="mb-5 overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-brand-500 to-teal-500" />
        <div className="flex flex-wrap items-start gap-4 p-5">
          <Avatar name={patient.name} size={64} tone={patient.gender === 'female' ? 'violet' : 'blue'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold text-ink">{patient.name}</h1>
              <span className="font-mono text-sm font-bold text-brand-700">{patient.code ?? patient.id}</span>
              {patient.provisional && <Badge tone="amber">Provisional (Emergency)</Badge>}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
              <span>{ageFromDob(patient.dob, patient.ageYears)} · <span className="capitalize">{patient.gender}</span></span>
              <span className="flex items-center gap-1"><Phone size={13} /> {patient.mobile}</span>
              <span className="flex items-center gap-1"><Droplet size={13} className="text-rose-500" /> {patient.bloodGroup}</span>
              {patient.address && <span className="flex items-center gap-1"><MapPin size={13} /> {patient.address}</span>}
              <span className="flex items-center gap-1"><Clock size={13} /> Registered {fmtDate(patient.registeredAt)}</span>
            </div>
            {patient.allergies && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700">
                <AlertTriangle size={14} /> Allergies: {patient.allergies}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Link to="/appointments" className="btn-outline"><CalendarDays size={15} /> Book</Link>
            <Link to="/consultations" className="btn-primary"><Stethoscope size={15} /> Consult</Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Latest Vitals" subtitle={lastVitals ? fmtDateTime(lastVitals.recordedAt) : 'No vitals recorded'} />
            <div className="grid grid-cols-2 gap-px bg-surface-line">
              {[
                ['BP', lastVitals ? `${lastVitals.bpSystolic ?? '—'}/${lastVitals.bpDiastolic ?? '—'}` : '—', 'mmHg'],
                ['Pulse', lastVitals?.pulse ?? '—', 'bpm'], ['Temp', lastVitals?.tempF ?? '—', '°F'],
                ['SpO₂', lastVitals?.spo2 ?? '—', '%'], ['Weight', lastVitals?.weightKg ?? '—', 'kg'], ['Resp', lastVitals?.respRate ?? '—', '/min'],
              ].map(([k, v, u]) => (
                <div key={k as string} className="bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase text-ink-faint">{k}</p>
                  <p className="text-lg font-bold text-ink">{v as string} <span className="text-xs font-normal text-ink-faint">{u}</span></p>
                </div>
              ))}
            </div>
          </Card>
          <Card><CardHeader title="Clinical Notes" /><div className="p-4 text-sm text-ink-soft">{patient.medicalNotes || 'No clinical notes recorded.'}</div></Card>
          <Card><CardHeader title="Emergency Contact" /><div className="p-4 text-sm"><p className="font-semibold text-ink">{patient.emergencyContactName || '—'}</p><p className="text-ink-soft">{patient.emergencyContactPhone || '—'}</p></div></Card>
          <Card><CardHeader title="Patient Portal" /><div className="p-4 text-sm text-ink-soft"><p>Login ID: <b className="font-mono text-brand-700">{patient.code ?? patient.id}</b></p><p className="mt-1 text-xs">The patient can view this full history any time on the NxtHealth Patient Portal.</p></div></Card>
        </div>

        <div className="lg:col-span-2">
          <Card>
            <div className="flex gap-1 overflow-x-auto border-b border-surface-line p-2">
              {([['timeline', 'Health Timeline'], ['consultations', 'Consultations'], ['prescriptions', 'Prescriptions'], ['lab', 'Lab & Reports'], ['bills', 'Bills']] as [Tab, string][]).map(([t, label]) => (
                <button key={t} onClick={() => setTab(t)} className={`shrink-0 rounded-lg px-3.5 py-2 text-sm font-semibold transition ${tab === t ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-surface-muted'}`}>{label}</button>
              ))}
            </div>
            <div className="p-5">
              {tab === 'timeline' && (
                timeline.length === 0 ? <EmptyState icon={<Activity size={22} />} title="No history yet" hint="Events populate as the patient moves through the hospital." /> : (
                  <ol className="relative ml-3 border-l-2 border-surface-line">
                    {timeline.map((e, i) => {
                      const m = KIND_META[e.kind]; const Icon = m.icon
                      return (
                        <li key={i} className="mb-5 ml-6">
                          <span className="absolute -left-[13px] grid h-6 w-6 place-items-center rounded-full ring-4 ring-white" style={{ background: m.color }}><Icon size={13} className="text-white" /></span>
                          <div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-ink">{e.title}</p><Badge tone="slate">{m.label}</Badge></div>
                          {e.detail && <p className="mt-0.5 text-sm text-ink-soft">{e.detail}</p>}
                          <p className="mt-0.5 text-xs text-ink-faint">{fmtDateTime(e.at)}</p>
                        </li>
                      )
                    })}
                  </ol>
                )
              )}
              {tab === 'consultations' && (
                consultations.length === 0 ? <EmptyState icon={<Stethoscope size={22} />} title="No consultations" /> : (
                  <div className="space-y-3">
                    {consultations.map((c) => (
                      <div key={c.id} className="rounded-xl border border-surface-line p-4">
                        <div className="flex items-center justify-between"><p className="font-semibold text-ink">{doctorName(c.doctorId)}</p><span className="text-xs text-ink-faint">{fmtDateTime(c.date)}</span></div>
                        <div className="mt-2 grid gap-1 text-sm text-ink-soft">
                          {c.complaints && <p><b className="text-ink">Complaints:</b> {c.complaints}</p>}
                          {c.diagnosis && <p><b className="text-ink">Diagnosis:</b> {c.diagnosis}</p>}
                          {c.advice && <p><b className="text-ink">Advice:</b> {c.advice}</p>}
                          {c.followUpDate && <p className="text-teal-700"><b>Follow-up:</b> {fmtDate(c.followUpDate)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}
              {tab === 'prescriptions' && (
                prescriptions.length === 0 ? <EmptyState icon={<Pill size={22} />} title="No prescriptions" /> : (
                  <div className="space-y-3">
                    {prescriptions.map((rx) => (
                      <div key={rx.id} className="rounded-xl border border-surface-line p-4">
                        <div className="mb-2 flex items-center justify-between"><p className="font-semibold text-ink">{rx.code ?? rx.id}</p><Badge tone={rx.status === 'dispensed' ? 'green' : 'amber'}>{rx.status.replace('_', ' ')}</Badge></div>
                        <Table head={<><th className="th">Medicine</th><th className="th">Dosage</th><th className="th">Freq</th><th className="th">Duration</th></>}>
                          {rx.items.map((it) => (<tr key={it.id}><td className="td">{it.medicineName}</td><td className="td">{it.dosage}</td><td className="td">{it.frequency}</td><td className="td">{it.duration}</td></tr>))}
                        </Table>
                      </div>
                    ))}
                  </div>
                )
              )}
              {tab === 'lab' && (
                labOrders.length === 0 ? <EmptyState icon={<FlaskConical size={22} />} title="No lab orders" /> : (
                  <div className="space-y-3">
                    {labOrders.map((o) => {
                      const samples = record.labSamples.filter((sm) => sm.orderId === o.id)
                      return (
                        <div key={o.id} className="rounded-xl border border-surface-line p-4">
                          <div className="mb-2 flex items-center justify-between"><p className="font-semibold text-ink">{o.code ?? o.id} <span className="text-xs font-normal text-ink-faint">· {fmtDate(o.createdAt)}</span></p><Badge tone={o.status === 'reported' ? 'green' : 'amber'}>{o.status}</Badge></div>
                          <Table head={<><th className="th">Test</th><th className="th">Result</th><th className="th">Ref</th><th className="th">Status</th></>}>
                            {samples.map((sm) => (
                              <tr key={sm.id}>
                                <td className="td">{testName(sm.testId)}</td>
                                <td className="td font-semibold">{sm.result ? `${sm.result} ${sm.resultUnit ?? ''}` : '—'} {sm.flag && sm.flag !== 'normal' && <Badge tone={sm.flag === 'critical' ? 'red' : 'amber'}>{sm.flag}</Badge>}</td>
                                <td className="td text-ink-faint">{sm.refRange ?? '—'}</td>
                                <td className="td"><Badge tone="slate">{sm.status}</Badge></td>
                              </tr>
                            ))}
                          </Table>
                        </div>
                      )
                    })}
                  </div>
                )
              )}
              {tab === 'bills' && (
                bills.length === 0 ? <EmptyState icon={<ReceiptText size={22} />} title="No bills" /> : (
                  <Table head={<><th className="th">Invoice</th><th className="th">Date</th><th className="th">Total</th><th className="th">Paid</th><th className="th">Status</th></>}>
                    {bills.map((b) => (
                      <tr key={b.id}>
                        <td className="td font-semibold text-brand-700">{b.code ?? b.id}</td>
                        <td className="td text-ink-soft">{fmtDate(b.createdAt)}</td>
                        <td className="td font-semibold">{inr(b.total)}</td>
                        <td className="td">{inr(b.paid)}</td>
                        <td className="td"><Badge tone={b.status === 'paid' ? 'green' : b.status === 'partial' ? 'amber' : 'red'}>{b.status}</Badge></td>
                      </tr>
                    ))}
                  </Table>
                )
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}

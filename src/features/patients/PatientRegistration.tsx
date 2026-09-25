import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { UserPlus, Printer, CheckCircle2, ArrowRight, CalendarDays, Loader2 } from 'lucide-react'
import { PageHeader, Card, Field } from '../../components/ui'
import { toast } from '../../store/toast'
import { printDoc } from '../../lib/print'
import { fmtDate, fmtDateTime, todayISO } from '../../lib/format'
import type { BloodGroup, Gender, Patient } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'

const BLOOD: BloodGroup[] = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown']

export function PatientRegistration() {
  const repo = getRepository()
  const nav = useNavigate()
  const { data: departments } = useQuery(() => repo.listDepartments(), [])
  const { data: doctors } = useQuery(() => repo.listDoctors(), [])
  const [f, setF] = useState({
    name: '', mobile: '', gender: 'male' as Gender, dob: '', ageYears: '', bloodGroup: 'unknown' as BloodGroup,
    address: '', emergencyContactName: '', emergencyContactPhone: '', allergies: '', medicalNotes: '',
    idProofType: 'Aadhaar', idProofNumber: '',
  })
  const [bookNow, setBookNow] = useState(false)
  const [appt, setAppt] = useState({ departmentId: '', doctorId: '', date: todayISO(), time: '10:00' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ patient: Patient; loginId: string; tempPassword: string; appointmentId?: string } | null>(null)

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }))
  const deptId = appt.departmentId || departments?.[0]?.id || ''
  const doctorsInDept = (doctors ?? []).filter((d) => d.departmentId === deptId && d.active)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.name.trim() || !f.mobile.trim()) return toast.error('Name and mobile are required')
    if (bookNow && !appt.doctorId) return toast.error('Select a doctor for the appointment')
    setBusy(true)
    try {
      const res = await repo.registerPatient({
        name: f.name.trim(), mobile: f.mobile.trim(), gender: f.gender,
        dob: f.dob || undefined, ageYears: f.ageYears ? Number(f.ageYears) : undefined,
        bloodGroup: f.bloodGroup, address: f.address, emergencyContactName: f.emergencyContactName,
        emergencyContactPhone: f.emergencyContactPhone, allergies: f.allergies, medicalNotes: f.medicalNotes,
        idProofType: f.idProofType, idProofNumber: f.idProofNumber,
        appointment: bookNow && appt.doctorId ? { doctorId: appt.doctorId, departmentId: deptId, date: appt.date, time: appt.time, type: 'new' } : undefined,
      })
      toast.success('Patient registered', `${res.loginId} created · portal credentials generated`)
      setDone(res)
    } catch (err) {
      toast.error('Registration failed', String((err as Error).message))
    } finally {
      setBusy(false)
    }
  }

  function printSlip() {
    if (!done) return
    const doctor = done.appointmentId ? (doctors ?? []).find((d) => d.id === appt.doctorId) : undefined
    printDoc('Registration Slip', `
      <h2 class="title">Patient Registration Slip</h2>
      <div class="grid">
        <div><span>Patient ID</span><b>${done.loginId}</b></div>
        <div><span>Registered</span>${fmtDateTime(done.patient.registeredAt)}</div>
        <div><span>Name</span>${done.patient.name}</div>
        <div><span>Gender</span>${done.patient.gender}</div>
        <div><span>Mobile</span>${done.patient.mobile}</div>
        <div><span>Blood Group</span>${done.patient.bloodGroup}</div>
        ${done.patient.address ? `<div><span>Address</span>${done.patient.address}</div>` : ''}
        ${done.patient.allergies ? `<div><span>Allergies</span>${done.patient.allergies}</div>` : ''}
      </div>
      ${done.appointmentId ? `<div class="box"><b>Appointment booked</b><br/>${doctor?.name ?? ''} · ${fmtDate(appt.date)} ${appt.time}</div>` : ''}
      <div class="cred">
        <h2 class="title" style="margin-top:0">Patient Portal Login</h2>
        <div class="grid">
          <div><span>Login ID</span><b>${done.loginId}</b></div>
          <div><span>Temp Password</span><b>${done.tempPassword}</b></div>
        </div>
        <p style="font-size:12px;color:#42536e;margin:10px 0 0">
          Log in at the NxtHealth Patient Portal to view appointments, prescriptions, lab reports and bills.
          You will be asked to change this temporary password on first login.
        </p>
      </div>
    `)
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="p-8 text-center animate-fade-up">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={34} /></div>
          <h2 className="mt-4 text-2xl font-extrabold text-ink">Patient Registered</h2>
          <p className="mt-1 text-ink-soft">Permanent Patient ID <span className="font-mono font-bold text-brand-700">{done.loginId}</span> created.</p>
          <div className="mt-6 grid gap-3 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-surface-line p-4">
              <p className="text-xs font-semibold uppercase text-ink-faint">Patient</p>
              <p className="mt-1 font-bold text-ink">{done.patient.name}</p>
              <p className="text-sm text-ink-soft">{done.patient.mobile} · {done.patient.gender}</p>
            </div>
            <div className="rounded-xl border border-dashed border-brand-300 bg-brand-50 p-4">
              <p className="text-xs font-semibold uppercase text-brand-700">Portal Credentials</p>
              <p className="mt-1 text-sm text-ink"><span className="text-ink-faint">Login ID:</span> <b className="font-mono">{done.loginId}</b></p>
              <p className="text-sm text-ink"><span className="text-ink-faint">Temp password:</span> <b className="font-mono">{done.tempPassword}</b></p>
            </div>
          </div>
          {done.appointmentId && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-teal-50 p-3 text-sm text-teal-800">
              <CalendarDays size={16} /> Appointment booked · a confirmation was sent via RCS/SMS.
            </div>
          )}
          <p className="mt-4 text-xs text-ink-faint">A registration message with portal credentials was dispatched to the patient's mobile (RCS with SMS fallback).</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button className="btn-primary" onClick={printSlip}><Printer size={16} /> Print Registration Slip</button>
            <button className="btn-outline" onClick={() => nav(`/patients/${done.patient.id}`)}>Open Patient Profile <ArrowRight size={15} /></button>
            <button className="btn-ghost" onClick={() => { setDone(null); setF({ ...f, name: '', mobile: '', dob: '', ageYears: '', address: '', allergies: '', medicalNotes: '', idProofNumber: '' }) }}>Register Another</button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="New Patient Registration" subtitle="Create a permanent master profile with portal access" icon={<UserPlus size={22} />} />
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-4 text-sm font-bold text-ink">Patient Details</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full Name" required><input className="input" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ramesh Kulkarni" /></Field>
            <Field label="Mobile" required><input className="input" value={f.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="10-digit mobile" /></Field>
            <Field label="Gender" required>
              <select className="input" value={f.gender} onChange={(e) => set('gender', e.target.value)}>
                <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </select>
            </Field>
            <Field label="Blood Group">
              <select className="input" value={f.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
                {BLOOD.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </Field>
            <Field label="Date of Birth"><input type="date" className="input" value={f.dob} max={todayISO()} onChange={(e) => set('dob', e.target.value)} /></Field>
            <Field label="Age (if DOB unknown)"><input type="number" className="input" value={f.ageYears} onChange={(e) => set('ageYears', e.target.value)} placeholder="Years" /></Field>
            <Field label="Address"><input className="input" value={f.address} onChange={(e) => set('address', e.target.value)} placeholder="City / area" /></Field>
            <Field label="ID Proof">
              <div className="flex gap-2">
                <select className="input max-w-[130px]" value={f.idProofType} onChange={(e) => set('idProofType', e.target.value)}>
                  <option>Aadhaar</option><option>PAN</option><option>Passport</option><option>Voter ID</option><option>Driving Licence</option>
                </select>
                <input className="input" value={f.idProofNumber} onChange={(e) => set('idProofNumber', e.target.value)} placeholder="ID number" />
              </div>
            </Field>
          </div>
          <h3 className="mb-3 mt-6 text-sm font-bold text-ink">Emergency & Clinical</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Emergency Contact Name"><input className="input" value={f.emergencyContactName} onChange={(e) => set('emergencyContactName', e.target.value)} /></Field>
            <Field label="Emergency Contact Phone"><input className="input" value={f.emergencyContactPhone} onChange={(e) => set('emergencyContactPhone', e.target.value)} /></Field>
            <Field label="Allergies" hint="Comma-separated"><input className="input" value={f.allergies} onChange={(e) => set('allergies', e.target.value)} placeholder="e.g. Penicillin, Sulfa" /></Field>
            <Field label="Medical Notes"><input className="input" value={f.medicalNotes} onChange={(e) => set('medicalNotes', e.target.value)} placeholder="Chronic conditions, etc." /></Field>
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-5">
            <label className="flex items-center gap-2.5">
              <input type="checkbox" className="h-4 w-4 rounded border-surface-line" checked={bookNow} onChange={(e) => setBookNow(e.target.checked)} />
              <span className="text-sm font-semibold text-ink">Book an appointment now</span>
            </label>
            {bookNow && (
              <div className="mt-4 space-y-3">
                <Field label="Department">
                  <select className="input" value={deptId} onChange={(e) => setAppt({ ...appt, departmentId: e.target.value, doctorId: '' })}>
                    {(departments ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </Field>
                <Field label="Doctor" required>
                  <select className="input" value={appt.doctorId} onChange={(e) => setAppt({ ...appt, doctorId: e.target.value })}>
                    <option value="">Select doctor…</option>
                    {doctorsInDept.map((d) => <option key={d.id} value={d.id}>{d.name} — ₹{d.consultationFee}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Date"><input type="date" className="input" value={appt.date} min={todayISO()} onChange={(e) => setAppt({ ...appt, date: e.target.value })} /></Field>
                  <Field label="Time"><input type="time" className="input" value={appt.time} onChange={(e) => setAppt({ ...appt, time: e.target.value })} /></Field>
                </div>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-bold text-ink">Auto-generated on save</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-soft">
              <li className="flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-600" /> Permanent Patient ID (NH-…) from database</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-600" /> Patient portal login + temp password</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-600" /> Registration RCS/SMS with credentials</li>
              <li className="flex items-center gap-2"><CheckCircle2 size={15} className="text-teal-600" /> Printable registration slip</li>
            </ul>
            <button className="btn-primary mt-5 w-full" type="submit" disabled={busy}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> Registering…</> : <><UserPlus size={16} /> Register Patient</>}
            </button>
          </Card>
        </div>
      </form>
    </div>
  )
}

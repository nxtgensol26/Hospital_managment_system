import { useMemo, useState } from 'react'
import { Stethoscope, Plus, Trash2, Printer, Save, Activity, Search, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, CardHeader, Field, Badge, Avatar } from '../../components/ui'
import { toast } from '../../store/toast'
import { printDoc } from '../../lib/print'
import { ageFromDob, todayISO, fmtDate } from '../../lib/format'
import type { Patient, PrescriptionItem } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

export function Consultations() {
  const repo = getRepository()
  const user = useAuth((s) => s.user)!
  const { doctors, doctorName } = useRefData()
  const today = todayISO()

  const { data: appts } = useQuery(() => repo.listAppointments(), [])
  const { data: patientsAll } = useQuery(() => repo.listPatients(), [])
  const { data: medicines } = useQuery(() => repo.listMedicines(), [])
  const { data: tests } = useQuery(() => repo.listLabTests(), [])

  const inConsult = (appts ?? []).filter((a) => a.date === today && a.status === 'in_consultation')
  const [patientId, setPatientId] = useState<string>('')
  const [psearch, setPsearch] = useState('')
  const patientsMap = useMemo(() => new Map((patientsAll ?? []).map((p) => [p.id, p])), [patientsAll])
  const patient: Patient | undefined = patientId ? patientsMap.get(patientId) : undefined
  const matches = psearch.trim() ? (patientsAll ?? []).filter((p) => p.name.toLowerCase().includes(psearch.toLowerCase()) || (p.code ?? p.id).toLowerCase().includes(psearch.toLowerCase()) || p.mobile.includes(psearch)).slice(0, 6) : []

  const myDoctorId = user.doctorId ?? doctors[0]?.id ?? ''

  const [vitals, setVitals] = useState({ bpS: '', bpD: '', pulse: '', temp: '', spo2: '', weight: '' })
  const [c, setC] = useState({ complaints: '', examination: '', diagnosis: '', advice: '', followUpDate: '' })
  const [rxItems, setRxItems] = useState<Omit<PrescriptionItem, 'id'>[]>([])
  const [labIds, setLabIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function addRx() { setRxItems((s) => [...s, { medicineName: '', dosage: '', frequency: '1-0-1', duration: '5 days', quantity: 10 }]) }
  function updRx(i: number, k: keyof Omit<PrescriptionItem, 'id'>, v: string | number) { setRxItems((s) => s.map((it, idx) => idx === i ? { ...it, [k]: v } : it)) }
  function toggleLab(id: string) { setLabIds((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]) }

  async function saveAll(print = false) {
    if (!patientId) return toast.error('Select a patient first')
    setBusy(true)
    try {
      if (vitals.bpS || vitals.pulse || vitals.temp || vitals.spo2 || vitals.weight) {
        await repo.recordVitals({ patientId, bpSystolic: num(vitals.bpS), bpDiastolic: num(vitals.bpD), pulse: num(vitals.pulse), tempF: num(vitals.temp), spo2: num(vitals.spo2), weightKg: num(vitals.weight) })
      }
      const con = await repo.saveConsultation({ visitId: '', patientId, doctorId: myDoctorId, complaints: c.complaints, examination: c.examination, diagnosis: c.diagnosis, advice: c.advice, followUpDate: c.followUpDate || undefined })
      let rx
      const validRx = rxItems.filter((r) => r.medicineName.trim())
      if (validRx.length) rx = await repo.createPrescription({ patientId, doctorId: myDoctorId, consultationId: con.id, items: validRx })
      if (labIds.length) await repo.orderLab({ patientId, doctorId: myDoctorId, testIds: labIds })
      toast.success('Consultation saved', [validRx.length && 'prescription sent to pharmacy', labIds.length && 'lab order created'].filter(Boolean).join(' · ') || undefined)
      if (print && rx) printRx(rx)
      setVitals({ bpS: '', bpD: '', pulse: '', temp: '', spo2: '', weight: '' })
      setC({ complaints: '', examination: '', diagnosis: '', advice: '', followUpDate: '' })
      setRxItems([]); setLabIds([])
    } catch (e) { toast.error('Save failed', String((e as Error).message)) } finally { setBusy(false) }
  }

  function printRx(rx: { code?: string; id: string; items: { medicineName: string; dosage: string; frequency: string; duration: string; quantity: number }[] }) {
    if (!patient) return
    printDoc('Prescription', `
      <h2 class="title">Prescription — ${rx.code ?? rx.id}</h2>
      <div class="grid">
        <div><span>Patient</span><b>${patient.name}</b> (${patient.code ?? patient.id})</div>
        <div><span>Date</span>${fmtDate(new Date().toISOString())}</div>
        <div><span>Age / Gender</span>${ageFromDob(patient.dob, patient.ageYears)} · ${patient.gender}</div>
        <div><span>Doctor</span>${doctorName(myDoctorId)}</div>
      </div>
      ${c.diagnosis ? `<div class="box"><b>Diagnosis:</b> ${c.diagnosis}</div>` : ''}
      <h2 class="title">Rx</h2>
      <table><thead><tr><th>Medicine</th><th>Dosage</th><th>Frequency</th><th>Duration</th><th>Qty</th></tr></thead><tbody>
      ${rx.items.map((it) => `<tr><td>${it.medicineName}</td><td>${it.dosage}</td><td>${it.frequency}</td><td>${it.duration}</td><td>${it.quantity}</td></tr>`).join('')}
      </tbody></table>
      ${c.advice ? `<div class="box"><b>Advice:</b> ${c.advice}</div>` : ''}
      ${c.followUpDate ? `<p style="margin-top:12px"><span class="pill">Follow-up: ${fmtDate(c.followUpDate)}</span></p>` : ''}
    `)
  }

  return (
    <div>
      <PageHeader title="Consultation" subtitle="Examine, diagnose, prescribe & order investigations" icon={<Stethoscope size={22} />} />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Patient" />
            <div className="p-4">
              {patient ? (
                <div>
                  <div className="flex items-center gap-3">
                    <Avatar name={patient.name} size={44} tone={patient.gender === 'female' ? 'violet' : 'blue'} />
                    <div><p className="font-bold text-ink">{patient.name}</p><p className="text-xs text-ink-faint">{patient.code ?? patient.id} · {ageFromDob(patient.dob, patient.ageYears)} · {patient.gender}</p></div>
                  </div>
                  {patient.allergies && <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"><b>Allergies:</b> {patient.allergies}</div>}
                  {patient.medicalNotes && <div className="mt-2 rounded-lg bg-surface-muted px-3 py-2 text-sm text-ink-soft"><b>Notes:</b> {patient.medicalNotes}</div>}
                  <button className="mt-3 text-xs font-semibold text-brand-600" onClick={() => setPatientId('')}>Change patient</button>
                </div>
              ) : (
                <>
                  <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" /><input className="input pl-9" placeholder="Search patient…" value={psearch} onChange={(e) => setPsearch(e.target.value)} /></div>
                  {matches.map((p) => (<button key={p.id} onClick={() => { setPatientId(p.id); setPsearch('') }} className="mt-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"><span>{p.name} · <span className="text-ink-faint">{p.code ?? p.id}</span></span></button>))}
                  {inConsult.length > 0 && !psearch && (
                    <div className="mt-3"><p className="mb-1 text-xs font-semibold text-ink-faint">In consultation now</p>{inConsult.map((a) => (<button key={a.id} onClick={() => setPatientId(a.patientId)} className="flex w-full items-center gap-2 rounded-lg border border-surface-line px-3 py-2 text-left text-sm hover:bg-surface-muted"><Activity size={14} className="text-violet-500" /> {patientsMap.get(a.patientId)?.name ?? a.patientId}</button>))}</div>
                  )}
                </>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Vitals" subtitle="Record at this visit" />
            <div className="grid grid-cols-2 gap-3 p-4">
              <Field label="BP Sys"><input className="input" value={vitals.bpS} onChange={(e) => setVitals({ ...vitals, bpS: e.target.value })} placeholder="120" /></Field>
              <Field label="BP Dia"><input className="input" value={vitals.bpD} onChange={(e) => setVitals({ ...vitals, bpD: e.target.value })} placeholder="80" /></Field>
              <Field label="Pulse"><input className="input" value={vitals.pulse} onChange={(e) => setVitals({ ...vitals, pulse: e.target.value })} placeholder="72" /></Field>
              <Field label="Temp °F"><input className="input" value={vitals.temp} onChange={(e) => setVitals({ ...vitals, temp: e.target.value })} placeholder="98.4" /></Field>
              <Field label="SpO₂ %"><input className="input" value={vitals.spo2} onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })} placeholder="98" /></Field>
              <Field label="Weight kg"><input className="input" value={vitals.weight} onChange={(e) => setVitals({ ...vitals, weight: e.target.value })} placeholder="70" /></Field>
            </div>
          </Card>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <Card className="p-5">
            <div className="grid gap-4">
              <Field label="Chief Complaints"><textarea className="input min-h-[60px]" value={c.complaints} onChange={(e) => setC({ ...c, complaints: e.target.value })} placeholder="e.g. Fever and cough for 3 days" /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Examination"><textarea className="input min-h-[60px]" value={c.examination} onChange={(e) => setC({ ...c, examination: e.target.value })} /></Field>
                <Field label="Diagnosis"><textarea className="input min-h-[60px]" value={c.diagnosis} onChange={(e) => setC({ ...c, diagnosis: e.target.value })} placeholder="Provisional / confirmed diagnosis" /></Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                <Field label="Advice"><input className="input" value={c.advice} onChange={(e) => setC({ ...c, advice: e.target.value })} /></Field>
                <Field label="Follow-up Date"><input type="date" className="input" min={today} value={c.followUpDate} onChange={(e) => setC({ ...c, followUpDate: e.target.value })} /></Field>
              </div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Prescription" subtitle="Auto-sent to pharmacy on save" action={<button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={addRx}><Plus size={14} /> Add medicine</button>} />
            <div className="p-4">
              {rxItems.length === 0 ? <p className="py-3 text-center text-sm text-ink-faint">No medicines added.</p> : (
                <div className="space-y-2">
                  {rxItems.map((it, i) => (
                    <div key={i} className="grid grid-cols-12 items-end gap-2">
                      <div className="col-span-4"><input list="med-list" className="input !py-2" placeholder="Medicine" value={it.medicineName} onChange={(e) => updRx(i, 'medicineName', e.target.value)} /></div>
                      <div className="col-span-2"><input className="input !py-2" placeholder="Dosage" value={it.dosage} onChange={(e) => updRx(i, 'dosage', e.target.value)} /></div>
                      <div className="col-span-2"><input className="input !py-2" placeholder="1-0-1" value={it.frequency} onChange={(e) => updRx(i, 'frequency', e.target.value)} /></div>
                      <div className="col-span-2"><input className="input !py-2" placeholder="5 days" value={it.duration} onChange={(e) => updRx(i, 'duration', e.target.value)} /></div>
                      <div className="col-span-1"><input type="number" className="input !py-2 !px-2" value={it.quantity} onChange={(e) => updRx(i, 'quantity', Number(e.target.value))} /></div>
                      <button className="col-span-1 grid h-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" onClick={() => setRxItems((s) => s.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button>
                    </div>
                  ))}
                  <datalist id="med-list">{(medicines ?? []).map((m) => <option key={m.id} value={m.name} />)}</datalist>
                </div>
              )}
            </div>
          </Card>
          <Card>
            <CardHeader title="Lab Orders" subtitle="Select investigations to order" action={labIds.length > 0 && <Badge tone="amber">{labIds.length} selected</Badge>} />
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
              {(tests ?? []).filter((t) => t.active).map((t) => (
                <label key={t.id} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition ${labIds.includes(t.id) ? 'border-brand-300 bg-brand-50' : 'border-surface-line hover:bg-surface-muted'}`}>
                  <input type="checkbox" checked={labIds.includes(t.id)} onChange={() => toggleLab(t.id)} className="h-4 w-4" />
                  <span className="flex-1"><span className="font-medium text-ink">{t.name}</span><br /><span className="text-xs text-ink-faint">₹{t.price}</span></span>
                </label>
              ))}
            </div>
          </Card>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-outline" onClick={() => saveAll(true)} disabled={!patientId || busy}><Printer size={16} /> Save & Print Rx</button>
            <button className="btn-primary" onClick={() => saveAll(false)} disabled={!patientId || busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Consultation</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function num(s: string) { const n = Number(s); return isNaN(n) || !s ? undefined : n }

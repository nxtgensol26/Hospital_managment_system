import type { Database, Patient, FlowStage } from '../types'
import { todayISO } from './format'

export const getPatient = (db: Database, id?: string) => db.patients.find((p) => p.id === id)
export const getDoctor = (db: Database, id?: string) => db.doctors.find((d) => d.id === id)
export const getDept = (db: Database, id?: string) => db.departments.find((d) => d.id === id)
export const doctorName = (db: Database, id?: string) => getDoctor(db, id)?.name ?? '—'
export const patientName = (db: Database, id?: string) => getPatient(db, id)?.name ?? '—'

export interface TimelineEvent {
  at: string
  kind: 'registration' | 'appointment' | 'consultation' | 'lab' | 'report' | 'prescription' | 'billing' | 'payment' | 'admission' | 'discharge' | 'emergency' | 'vitals'
  title: string
  detail?: string
}

import type { Appointment, Vitals, Consultation, LabOrder, LabSample, Prescription, Bill, Payment, Admission, EmergencyCase } from '../types'

export interface TimelineInput {
  patient?: { id: string; code?: string; registeredAt: string }
  appointments?: Appointment[]
  vitals?: Vitals[]
  consultations?: Consultation[]
  labOrders?: LabOrder[]
  labSamples?: LabSample[]
  prescriptions?: Prescription[]
  bills?: Bill[]
  payments?: Payment[]
  admissions?: Admission[]
  emergencies?: EmergencyCase[]
  resolveDoctor?: (id?: string) => string
  resolveTest?: (id?: string) => string
}

/** Shared timeline builder — works on app-typed arrays (used by both repositories). */
export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const dn = input.resolveDoctor ?? (() => '—')
  const tn = input.resolveTest ?? (() => 'Test')
  const ev: TimelineEvent[] = []
  const p = input.patient
  if (p) ev.push({ at: p.registeredAt, kind: 'registration', title: 'Patient registered', detail: `ID ${p.code ?? p.id}` })

  ;(input.appointments ?? []).forEach((a) =>
    ev.push({ at: a.createdAt, kind: 'appointment', title: `Appointment ${a.code ?? a.id}`, detail: `${dn(a.doctorId)} · ${a.date} ${a.time} · ${a.status}` }))
  ;(input.vitals ?? []).forEach((v) =>
    ev.push({ at: v.recordedAt, kind: 'vitals', title: 'Vitals recorded', detail: [v.bpSystolic && `BP ${v.bpSystolic}/${v.bpDiastolic}`, v.pulse && `Pulse ${v.pulse}`, v.tempF && `Temp ${v.tempF}°F`, v.spo2 && `SpO₂ ${v.spo2}%`].filter(Boolean).join(' · ') }))
  ;(input.consultations ?? []).forEach((c) =>
    ev.push({ at: c.date, kind: 'consultation', title: 'Doctor consultation', detail: [c.diagnosis && `Dx: ${c.diagnosis}`, dn(c.doctorId)].filter(Boolean).join(' · ') }))
  ;(input.labOrders ?? []).forEach((o) =>
    ev.push({ at: o.createdAt, kind: 'lab', title: `Lab order ${o.code ?? o.id}`, detail: `${o.testIds.length} test(s) · ${o.status}` }))
  ;(input.labSamples ?? []).filter((s) => s.releasedAt).forEach((s) =>
    ev.push({ at: s.releasedAt!, kind: 'report', title: `Report: ${tn(s.testId)}`, detail: `${s.result ?? ''} ${s.resultUnit ?? ''}`.trim() }))
  ;(input.prescriptions ?? []).forEach((r) =>
    ev.push({ at: r.createdAt, kind: 'prescription', title: `Prescription ${r.code ?? r.id}`, detail: `${r.items.length} medicine(s) · ${r.status.replace('_', ' ')}` }))
  ;(input.bills ?? []).forEach((b) =>
    ev.push({ at: b.createdAt, kind: 'billing', title: `Bill ${b.id}`, detail: `₹${b.total} · ${b.status}` }))
  ;(input.payments ?? []).forEach((pmt) =>
    ev.push({ at: pmt.at, kind: 'payment', title: 'Payment received', detail: `₹${pmt.amount} · ${pmt.method}` }))
  ;(input.admissions ?? []).forEach((a) => {
    ev.push({ at: a.admittedAt, kind: 'admission', title: `Admitted (IPD ${a.id})`, detail: a.reason })
    if (a.dischargedAt) ev.push({ at: a.dischargedAt, kind: 'discharge', title: 'Discharged', detail: a.dischargeSummary?.slice(0, 60) })
  })
  ;(input.emergencies ?? []).forEach((c) =>
    ev.push({ at: c.arrivalTime, kind: 'emergency', title: `Emergency ${c.id}`, detail: `${c.triage} triage · ${c.status}` }))

  return ev.sort((a, b) => b.at.localeCompare(a.at))
}

/** Build the chronological medical timeline for a patient from the local DB. */
export function patientTimeline(db: Database, patientId: string): TimelineEvent[] {
  return buildTimeline({
    patient: getPatient(db, patientId),
    appointments: db.appointments.filter((a) => a.patientId === patientId),
    vitals: db.vitals.filter((v) => v.patientId === patientId),
    consultations: db.consultations.filter((c) => c.patientId === patientId),
    labOrders: db.labOrders.filter((o) => o.patientId === patientId),
    labSamples: db.labSamples.filter((s) => s.patientId === patientId),
    prescriptions: db.prescriptions.filter((r) => r.patientId === patientId),
    bills: db.bills.filter((b) => b.patientId === patientId),
    payments: db.payments.filter((pmt) => pmt.patientId === patientId),
    admissions: db.admissions.filter((a) => a.patientId === patientId),
    emergencies: db.emergencyCases.filter((c) => c.patientId === patientId),
    resolveDoctor: (id) => doctorName(db, id),
    resolveTest: (id) => db.labTests.find((t) => t.id === id)?.name ?? 'Test',
  })
}

/* ---------------- Dashboard / control room ---------------- */

export function dashboardStats(db: Database) {
  const today = todayISO()
  const isToday = (iso?: string) => !!iso && iso.slice(0, 10) === today
  const beds = db.beds
  return {
    patientsTotal: db.patients.length,
    opdToday: db.appointments.filter((a) => a.date === today).length,
    ipdActive: db.admissions.filter((a) => a.status !== 'discharged').length,
    emergencyActive: db.emergencyCases.filter((c) => c.status === 'active').length,
    admissionsToday: db.admissions.filter((a) => isToday(a.admittedAt)).length,
    dischargesToday: db.admissions.filter((a) => isToday(a.dischargedAt)).length,
    bedsAvailable: beds.filter((b) => b.state === 'available').length,
    bedsOccupied: beds.filter((b) => b.state === 'occupied').length,
    bedsTotal: beds.length,
    labSamplesPending: db.labSamples.filter((s) => ['pending', 'collected', 'processing'].includes(s.status)).length,
    reportsPending: db.labSamples.filter((s) => s.status === 'completed').length, // awaiting verify
    pharmacyQueue: db.prescriptions.filter((p) => p.status === 'sent_to_pharmacy').length,
    pendingPayments: db.bills.filter((b) => b.status === 'unpaid' || b.status === 'partial').reduce((s, b) => s + (b.total - b.paid), 0),
    revenueToday: db.payments.filter((p) => isToday(p.at)).reduce((s, p) => s + p.amount, 0),
    lowStock: lowStockMedicines(db).length,
  }
}

export function lowStockMedicines(db: Database) {
  return db.medicines
    .map((m) => ({ med: m, qty: db.medicineBatches.filter((b) => b.medicineId === m.id).reduce((s, b) => s + b.quantity, 0) }))
    .filter((x) => x.qty <= x.med.reorderLevel)
}

export function expiringBatches(db: Database, days = 60) {
  const cutoff = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
  return db.medicineBatches.filter((b) => b.quantity > 0 && b.expiry <= cutoff).sort((a, b) => a.expiry.localeCompare(b.expiry))
}

/* ---------------- Friction / flow map ---------------- */

const STAGE_PAIRS: { from: FlowStage; to: FlowStage; label: string }[] = [
  { from: 'registration', to: 'checkin', label: 'Registration → Check-in' },
  { from: 'checkin', to: 'consultation_start', label: 'Doctor waiting' },
  { from: 'consultation_start', to: 'consultation_end', label: 'Consultation' },
  { from: 'lab_ordered', to: 'lab_collected', label: 'Lab waiting (collection)' },
  { from: 'lab_collected', to: 'lab_reported', label: 'Lab processing → report' },
  { from: 'consultation_end', to: 'billing', label: 'Billing' },
  { from: 'billing', to: 'pharmacy', label: 'Pharmacy' },
]

export function frictionMap(db: Database) {
  return STAGE_PAIRS.map((pair) => {
    const durations: number[] = []
    db.visits.forEach((v) => {
      const a = v.stageTimes[pair.from]
      const b = v.stageTimes[pair.to]
      if (a && b) {
        const mins = (new Date(b).getTime() - new Date(a).getTime()) / 60000
        if (mins >= 0 && mins < 24 * 60) durations.push(mins)
      }
    })
    const avg = durations.length ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length) : null
    return { label: pair.label, avgMin: avg, samples: durations.length }
  })
}

export function last7DaysRevenue(db: Database) {
  const out: { day: string; value: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const value = db.payments.filter((p) => p.at.slice(0, 10) === d).reduce((s, p) => s + p.amount, 0)
    out.push({ day: new Date(d).toLocaleDateString('en-IN', { weekday: 'short' }), value })
  }
  return out
}

export function last7DaysVisits(db: Database) {
  const out: { day: string; value: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const value = db.appointments.filter((a) => a.date === d).length + db.emergencyCases.filter((c) => c.arrivalTime.slice(0, 10) === d).length
    out.push({ day: new Date(d).toLocaleDateString('en-IN', { weekday: 'short' }), value })
  }
  return out
}

export type Patient_ = Patient

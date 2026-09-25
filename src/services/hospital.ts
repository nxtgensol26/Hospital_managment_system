import type {
  Patient, Appointment, LabOrder, LabSample, Prescription, PrescriptionItem, Bill, BillItem,
  Payment, Admission, EmergencyCase, Visit, FlowStage, Vitals, Consultation, Gender, BloodGroup, BedState,
} from '../types'
import { useDB, nextSeq } from '../store/db'
import { useAuth } from '../store/auth'
import { pushAudit, type AuditActor } from './audit'
import { notify } from './notification'
import {
  patientId as fmtPatientId, apptId, rxId, labOrderId, sampleId, invoiceId, admissionId, erId, visitId as fmtVisitId,
} from '../lib/format'
import { tempPassword } from '../lib/crypto'
import { fmtDate } from '../lib/format'

function actor(): AuditActor {
  const u = useAuth.getState().user
  return u ? { id: u.id, name: u.name, role: u.role } : { id: 'system', name: 'System', role: 'hospital_admin' }
}
function rid(p: string) { return `${p}_${Math.random().toString(36).slice(2, 10)}` }
function nowISO() { return new Date().toISOString() }

/* ---------------- Patients ---------------- */

export interface NewPatientInput {
  name: string; mobile: string; gender: Gender; dob?: string; ageYears?: number
  bloodGroup: BloodGroup; address?: string; emergencyContactName?: string; emergencyContactPhone?: string
  allergies?: string; medicalNotes?: string; idProofType?: string; idProofNumber?: string; provisional?: boolean
}

export function createPatient(input: NewPatientInput): { patient: Patient; loginId: string; tempPass: string } {
  const a = actor()
  const tempPass = tempPassword()
  const result = useDB.getState().update((db) => {
    const seq = nextSeq(db, 'patient')
    const id = fmtPatientId(seq)
    const patient: Patient = {
      id, ...input, registeredAt: nowISO(), createdBy: a.id,
    }
    db.patients.unshift(patient)
    db.patientCredentials.push({ patientId: id, loginId: id, tempPassword: tempPass, passwordChanged: false })
    pushAudit(db, a, input.provisional ? 'Emergency quick-registration' : 'Patient registered', 'patient', id, patient.name)
    return { patient, loginId: id }
  })
  // fire registration notification (RCS → SMS fallback)
  void notify('registration', {
    patientId: result.patient.id, to: result.patient.mobile,
    vars: { name: result.patient.name, patientId: result.patient.id, loginId: result.loginId, tempPass },
  })
  return { patient: result.patient, loginId: result.loginId, tempPass }
}

export function updatePatient(id: string, patch: Partial<Patient>) {
  const a = actor()
  useDB.getState().update((db) => {
    const p = db.patients.find((x) => x.id === id)
    if (!p) return
    Object.assign(p, patch)
    pushAudit(db, a, 'Patient record modified', 'patient', id)
  })
}

/* ---------------- Vitals ---------------- */

export function recordVitals(v: Omit<Vitals, 'id' | 'recordedAt' | 'recordedBy'>) {
  const a = actor()
  useDB.getState().update((db) => {
    const rec: Vitals = { ...v, id: rid('vit'), recordedAt: nowISO(), recordedBy: a.id }
    db.vitals.unshift(rec)
    pushAudit(db, a, 'Vitals recorded', 'patient', v.patientId)
  })
}

/* ---------------- Appointments + visits ---------------- */

export function bookAppointment(input: {
  patientId: string; doctorId: string; departmentId: string; date: string; time: string
  type: 'new' | 'follow_up'; reason?: string
}): Appointment {
  const a = actor()
  const appt = useDB.getState().update((db) => {
    const seq = nextSeq(db, 'appt')
    const ap: Appointment = { id: apptId(seq), status: 'confirmed', createdAt: nowISO(), ...input }
    db.appointments.unshift(ap)
    pushAudit(db, a, 'Appointment booked', 'appointment', ap.id)
    return ap
  })
  const db = useDB.getState().db
  const patient = db.patients.find((p) => p.id === input.patientId)
  const doctor = db.doctors.find((d) => d.id === input.doctorId)
  if (patient) void notify('appt_confirm', {
    patientId: patient.id, to: patient.mobile,
    vars: { name: patient.name, apptId: appt.id, doctor: doctor?.name ?? 'your doctor', date: fmtDate(input.date), time: input.time },
  })
  return appt
}

export function setAppointmentStatus(id: string, status: Appointment['status']) {
  const a = actor()
  let appt: Appointment | undefined
  useDB.getState().update((db) => {
    const ap = db.appointments.find((x) => x.id === id)
    if (!ap) return
    ap.status = status
    appt = ap
    pushAudit(db, a, `Appointment ${status.replace('_', ' ')}`, 'appointment', id)
    if (status === 'checked_in') {
      // create / ensure an OPD visit for flow tracking
      const seq = nextSeq(db, 'visit')
      const v: Visit = {
        id: fmtVisitId(seq), patientId: ap.patientId, doctorId: ap.doctorId, departmentId: ap.departmentId,
        type: 'opd', appointmentId: ap.id, status: 'waiting',
        stageTimes: { registration: ap.createdAt, appointment: ap.createdAt, checkin: nowISO() }, createdAt: nowISO(),
      }
      db.visits.unshift(v)
    }
  })
  if (status === 'cancelled' && appt) {
    const p = useDB.getState().db.patients.find((x) => x.id === appt!.patientId)
    if (p) void notify('appt_cancel', { patientId: p.id, to: p.mobile, vars: { name: p.name, apptId: appt.id, date: fmtDate(appt.date) } })
  }
}

export function markVisitStage(visitId: string, stage: FlowStage) {
  useDB.getState().update((db) => {
    const v = db.visits.find((x) => x.id === visitId)
    if (v) v.stageTimes[stage] = nowISO()
  })
}

/* ---------------- Consultation + prescription ---------------- */

export function saveConsultation(input: Omit<Consultation, 'id' | 'date'>): Consultation {
  const a = actor()
  return useDB.getState().update((db) => {
    const c: Consultation = { ...input, id: rid('con'), date: nowISO() }
    db.consultations.unshift(c)
    const v = db.visits.find((x) => x.id === input.visitId)
    if (v) { v.status = 'completed'; v.stageTimes.consultation_end = nowISO() }
    pushAudit(db, a, 'Consultation recorded', 'consultation', c.id, `Patient ${input.patientId}`)
    return c
  })
}

export function createPrescription(input: {
  patientId: string; doctorId: string; consultationId?: string; items: Omit<PrescriptionItem, 'id'>[]; notes?: string
}): Prescription {
  const a = actor()
  const rx = useDB.getState().update((db) => {
    const seq = nextSeq(db, 'rx')
    const p: Prescription = {
      id: rxId(seq), patientId: input.patientId, doctorId: input.doctorId, consultationId: input.consultationId,
      createdAt: nowISO(), status: 'sent_to_pharmacy', notes: input.notes,
      items: input.items.map((it) => ({ ...it, id: rid('rxi') })),
    }
    db.prescriptions.unshift(p)
    pushAudit(db, a, 'Prescription created', 'prescription', p.id, `${p.items.length} item(s)`)
    return p
  })
  const db = useDB.getState().db
  const patient = db.patients.find((p) => p.id === input.patientId)
  const doctor = db.doctors.find((d) => d.id === input.doctorId)
  if (patient) void notify('prescription_ready', { patientId: patient.id, to: patient.mobile, vars: { name: patient.name, rxId: rx.id, doctor: doctor?.name ?? 'your doctor' } })
  return rx
}

/* ---------------- Diagnostics / Lab ---------------- */

export function orderLab(input: { patientId: string; doctorId?: string; visitId?: string; testIds: string[] }): LabOrder {
  const a = actor()
  return useDB.getState().update((db) => {
    const seq = nextSeq(db, 'labOrder')
    const order: LabOrder = { id: labOrderId(seq), status: 'ordered', createdAt: nowISO(), ...input }
    db.labOrders.unshift(order)
    input.testIds.forEach((testId) => {
      const s = nextSeq(db, 'sample')
      const test = db.labTests.find((t) => t.id === testId)
      const sample: LabSample = {
        id: sampleId(s), orderId: order.id, patientId: input.patientId, testId, status: 'pending',
        refRange: test?.refRange, resultUnit: test?.unit,
      }
      db.labSamples.unshift(sample)
    })
    if (input.visitId) { const v = db.visits.find((x) => x.id === input.visitId); if (v) v.stageTimes.lab_ordered = nowISO() }
    pushAudit(db, a, 'Lab order created', 'lab_order', order.id, `${input.testIds.length} test(s)`)
    return order
  })
}

export function collectSample(sampleId: string) {
  const a = actor()
  let patientId = ''
  useDB.getState().update((db) => {
    const s = db.labSamples.find((x) => x.id === sampleId)
    if (!s) return
    s.status = 'collected'; s.collectedAt = nowISO(); s.collectedBy = a.id
    patientId = s.patientId
    const order = db.labOrders.find((o) => o.id === s.orderId)
    const v = order?.visitId ? db.visits.find((x) => x.id === order.visitId) : undefined
    if (v) v.stageTimes.lab_collected = nowISO()
    pushAudit(db, a, 'Lab sample collected', 'lab_sample', sampleId)
  })
  const p = useDB.getState().db.patients.find((x) => x.id === patientId)
  if (p) void notify('lab_collected', { patientId: p.id, to: p.mobile, vars: { name: p.name, sampleId } })
}

export function enterResult(sampleId: string, result: string, flag: LabSample['flag']) {
  const a = actor()
  useDB.getState().update((db) => {
    const s = db.labSamples.find((x) => x.id === sampleId)
    if (!s) return
    s.status = 'completed'; s.result = result; s.flag = flag; s.processedAt = nowISO(); s.enteredBy = a.id
    pushAudit(db, a, 'Lab result entered', 'lab_sample', sampleId, `result=${result}`)
  })
}

export function verifyResult(sampleId: string) {
  const a = actor()
  useDB.getState().update((db) => {
    const s = db.labSamples.find((x) => x.id === sampleId)
    if (!s) return
    s.status = 'verified'; s.verifiedAt = nowISO(); s.verifiedBy = a.id
    pushAudit(db, a, 'Lab result verified', 'lab_sample', sampleId)
  })
}

export function releaseOrderReport(orderId: string) {
  const a = actor()
  let patientId = ''
  useDB.getState().update((db) => {
    const order = db.labOrders.find((o) => o.id === orderId)
    if (!order) return
    patientId = order.patientId
    const samples = db.labSamples.filter((s) => s.orderId === orderId)
    samples.forEach((s) => { if (s.status === 'verified') { s.status = 'released'; s.releasedAt = nowISO() } })
    order.status = 'reported'
    const v = order.visitId ? db.visits.find((x) => x.id === order.visitId) : undefined
    if (v) v.stageTimes.lab_reported = nowISO()
    pushAudit(db, a, 'Lab report released', 'lab_order', orderId)
  })
  const p = useDB.getState().db.patients.find((x) => x.id === patientId)
  if (p) void notify('lab_ready', { patientId: p.id, to: p.mobile, vars: { name: p.name, orderId } })
}

/* ---------------- Pharmacy ---------------- */

export function dispensePrescription(prescriptionId: string): boolean {
  const a = actor()
  return useDB.getState().update((db) => {
    const rx = db.prescriptions.find((p) => p.id === prescriptionId)
    if (!rx) return false
    const items: { medicineId: string; medicineName: string; batchNo: string; quantity: number; price: number }[] = []
    let total = 0
    for (const it of rx.items) {
      const med = it.medicineId ? db.medicines.find((m) => m.id === it.medicineId) : db.medicines.find((m) => m.name.toLowerCase() === it.medicineName.toLowerCase())
      let remaining = it.quantity
      if (med) {
        const batches = db.medicineBatches.filter((b) => b.medicineId === med.id && b.quantity > 0).sort((x, y) => x.expiry.localeCompare(y.expiry))
        for (const b of batches) {
          if (remaining <= 0) break
          const take = Math.min(b.quantity, remaining)
          b.quantity -= take; remaining -= take
          items.push({ medicineId: med.id, medicineName: med.name, batchNo: b.batchNo, quantity: take, price: med.mrp })
          total += take * med.mrp
        }
      }
    }
    rx.status = 'dispensed'
    db.dispenses.unshift({ id: rid('dsp'), prescriptionId, patientId: rx.patientId, dispensedAt: nowISO(), dispensedBy: a.id, items, total })
    pushAudit(db, a, 'Prescription dispensed', 'prescription', prescriptionId)
    return true
  })
}

export function addMedicineBatch(input: { medicineId: string; batchNo: string; expiry: string; quantity: number; purchasePrice: number; supplier?: string }) {
  const a = actor()
  useDB.getState().update((db) => {
    db.medicineBatches.unshift({ id: rid('bat'), receivedAt: nowISO(), ...input })
    pushAudit(db, a, 'Stock purchase entry', 'medicine', input.medicineId, `+${input.quantity} · batch ${input.batchNo}`)
  })
}

/* ---------------- Billing ---------------- */

export function createBill(input: {
  patientId: string; visitId?: string; admissionId?: string; items: Omit<BillItem, 'id' | 'amount'>[]
  discountPct: number; taxPct: number
}): Bill {
  const a = actor()
  const bill = useDB.getState().update((db) => {
    const seq = nextSeq(db, 'invoice')
    const items: BillItem[] = input.items.map((it) => ({ ...it, id: rid('bi'), amount: +(it.qty * it.unitPrice).toFixed(2) }))
    const subtotal = +items.reduce((s, it) => s + it.amount, 0).toFixed(2)
    const discountAmt = +((subtotal * input.discountPct) / 100).toFixed(2)
    const taxable = subtotal - discountAmt
    const taxAmt = +((taxable * input.taxPct) / 100).toFixed(2)
    const total = +(taxable + taxAmt).toFixed(2)
    const b: Bill = {
      id: invoiceId(seq), patientId: input.patientId, visitId: input.visitId, admissionId: input.admissionId,
      createdAt: nowISO(), createdBy: a.id, items, discountPct: input.discountPct, taxPct: input.taxPct,
      subtotal, discountAmt, taxAmt, total, paid: 0, status: total > 0 ? 'unpaid' : 'paid',
    }
    db.bills.unshift(b)
    const v = input.visitId ? db.visits.find((x) => x.id === input.visitId) : undefined
    if (v) v.stageTimes.billing = nowISO()
    pushAudit(db, a, 'Bill generated', 'bill', b.id, `total ${total}`)
    return b
  })
  const p = useDB.getState().db.patients.find((x) => x.id === input.patientId)
  if (p) void notify('bill_generated', { patientId: p.id, to: p.mobile, vars: { name: p.name, invId: bill.id, amount: `₹${bill.total.toLocaleString('en-IN')}` } })
  return bill
}

export function addPayment(input: { billId: string; amount: number; method: Payment['method']; reference?: string }): Payment {
  const a = actor()
  const pay = useDB.getState().update((db) => {
    const bill = db.bills.find((b) => b.id === input.billId)!
    const payment: Payment = { id: rid('pay'), billId: input.billId, patientId: bill.patientId, amount: input.amount, method: input.method, at: nowISO(), receivedBy: a.id, reference: input.reference }
    db.payments.unshift(payment)
    bill.paid = +(bill.paid + input.amount).toFixed(2)
    bill.status = bill.paid >= bill.total ? 'paid' : bill.paid > 0 ? 'partial' : 'unpaid'
    pushAudit(db, a, 'Payment received', 'bill', input.billId, `${input.method} ₹${input.amount}`)
    return payment
  })
  const p = useDB.getState().db.patients.find((x) => x.id === pay.patientId)
  if (p) void notify('payment_receipt', { patientId: p.id, to: p.mobile, vars: { name: p.name, invId: input.billId, amount: `₹${input.amount.toLocaleString('en-IN')}` } })
  return pay
}

/* ---------------- Beds / IPD ---------------- */

export function setBedState(bedId: string, state: BedState) {
  const a = actor()
  useDB.getState().update((db) => {
    const bed = db.beds.find((b) => b.id === bedId)
    if (!bed) return
    bed.state = state
    if (state === 'available') { bed.patientId = undefined; bed.admissionId = undefined }
    pushAudit(db, a, `Bed set ${state}`, 'bed', bedId)
  })
}

export function admitPatient(input: { patientId: string; bedId: string; doctorId?: string; reason?: string }): Admission {
  const a = actor()
  return useDB.getState().update((db) => {
    const seq = nextSeq(db, 'admission')
    const bed = db.beds.find((b) => b.id === input.bedId)!
    const adm: Admission = {
      id: admissionId(seq), patientId: input.patientId, bedId: bed.id, wardId: bed.wardId, doctorId: input.doctorId,
      admittedAt: nowISO(), reason: input.reason, status: 'admitted', nursingNotes: [],
    }
    bed.state = 'occupied'; bed.patientId = input.patientId; bed.admissionId = adm.id
    db.admissions.unshift(adm)
    pushAudit(db, a, 'Patient admitted (IPD)', 'admission', adm.id, input.patientId)
    return adm
  })
}

export function addNursingNote(admissionId: string, note: string) {
  const a = actor()
  useDB.getState().update((db) => {
    const adm = db.admissions.find((x) => x.id === admissionId)
    if (!adm) return
    adm.nursingNotes = adm.nursingNotes || []
    adm.nursingNotes.unshift({ at: nowISO(), by: a.id, note })
    pushAudit(db, a, 'Nursing note added', 'admission', admissionId)
  })
}

export function dischargePatient(admissionId: string, summary: string) {
  const a = actor()
  let patientId = ''
  useDB.getState().update((db) => {
    const adm = db.admissions.find((x) => x.id === admissionId)
    if (!adm) return
    adm.status = 'discharged'; adm.dischargedAt = nowISO(); adm.dischargeSummary = summary
    patientId = adm.patientId
    if (adm.bedId) { const bed = db.beds.find((b) => b.id === adm.bedId); if (bed) bed.state = 'cleaning' }
    pushAudit(db, a, 'Patient discharged', 'admission', admissionId)
  })
  const p = useDB.getState().db.patients.find((x) => x.id === patientId)
  if (p) void notify('discharge', { patientId: p.id, to: p.mobile, vars: { name: p.name } })
}

/* ---------------- Emergency ---------------- */

export function registerEmergency(input: {
  name: string; mobile: string; gender: Gender; triage: EmergencyCase['triage']; notes?: string; doctorId?: string
}): { case: EmergencyCase; patient: Patient } {
  const { patient } = createPatient({
    name: input.name, mobile: input.mobile || '0000000000', gender: input.gender, bloodGroup: 'unknown', provisional: true,
  })
  const a = actor()
  const erCase = useDB.getState().update((db) => {
    const seq = nextSeq(db, 'er')
    const c: EmergencyCase = {
      id: erId(seq), patientId: patient.id, arrivalTime: nowISO(), triage: input.triage, notes: input.notes,
      doctorId: input.doctorId, status: 'active',
    }
    db.emergencyCases.unshift(c)
    pushAudit(db, a, 'Emergency case registered', 'emergency', c.id, `${input.triage} triage`)
    return c
  })
  return { case: erCase, patient }
}

export function setEmergencyStatus(id: string, status: EmergencyCase['status']) {
  const a = actor()
  useDB.getState().update((db) => {
    const c = db.emergencyCases.find((x) => x.id === id)
    if (c) { c.status = status; pushAudit(db, a, `Emergency ${status}`, 'emergency', id) }
  })
}

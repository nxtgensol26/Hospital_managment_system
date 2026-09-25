import type {
  Repository, RegisterPatientInput, RegisterPatientResult, PatientRecord, DashboardStats, TrendPoint, LowStockRow,
  MessagingConfigView, SaveMessagingInput,
} from './repository'
import type {
  Appointment, AppointmentStatus, Consultation, Department, Doctor, LabOrder, LabSample, LabTest,
  Patient, Prescription, PrescriptionItem, Medicine, MedicineBatch, Ward, Room, Bed, Admission,
  EmergencyCase, Bill, BillItem, Payment, Vitals, Hospital, NotificationLog, AuditEntry, SupportTicket,
  User, NotificationTemplate, BedState, Gender, Role, TicketPriority, TicketStatus, LicenseType,
} from '../types'
import { supabase, invokeFn } from '../lib/supabase'
import { buildTimeline } from '../lib/selectors'
import { todayISO } from '../lib/format'

/* ------------------------- row → app mappers ------------------------- */
const mapHospital = (r: any): Hospital => ({ id: r.id, name: r.name, address: r.address ?? '', city: r.city ?? undefined, phone: r.phone ?? undefined, email: r.email ?? undefined, logoDataUrl: r.logo_url ?? undefined, gstNumber: r.gst_number ?? undefined, registrationNo: r.registration_no ?? undefined })
const mapDept = (r: any): Department => ({ id: r.id, name: r.name, code: r.code, active: r.active })
const mapDoctor = (r: any): Doctor => ({ id: r.id, name: r.name, departmentId: r.department_id, qualification: r.qualification ?? '', regNo: r.reg_no ?? undefined, consultationFee: Number(r.consultation_fee ?? 0), phone: r.phone ?? undefined, email: r.email ?? undefined, timings: r.timings ?? undefined, active: r.active })
const mapTest = (r: any): LabTest => ({ id: r.id, name: r.name, code: r.code ?? '', category: r.category ?? '', price: Number(r.price ?? 0), sampleType: r.sample_type ?? '', unit: r.unit ?? undefined, refRange: r.ref_range ?? undefined, active: r.active })
const mapMedicine = (r: any): Medicine => ({ id: r.id, name: r.name, category: r.category ?? '', unit: r.unit, mrp: Number(r.mrp ?? 0), reorderLevel: r.reorder_level, active: r.active })
const mapBatch = (r: any): MedicineBatch => ({ id: r.id, medicineId: r.medicine_id, batchNo: r.batch_no, expiry: r.expiry, quantity: r.quantity, purchasePrice: Number(r.purchase_price ?? 0), supplier: r.supplier ?? undefined, receivedAt: r.received_at })
const mapWard = (r: any): Ward => ({ id: r.id, name: r.name, type: r.type ?? '' })
const mapRoom = (r: any): Room => ({ id: r.id, wardId: r.ward_id, number: r.number })
const mapBed = (r: any): Bed => ({ id: r.id, roomId: r.room_id, wardId: r.ward_id, label: r.label, state: r.state, chargePerDay: Number(r.charge_per_day ?? 0), patientId: r.patient_id ?? undefined, admissionId: r.admission_id ?? undefined })
const mapPatient = (r: any): Patient => ({ id: r.id, code: r.patient_code, name: r.name, mobile: r.mobile, gender: r.gender, dob: r.dob ?? undefined, ageYears: r.age_years ?? undefined, bloodGroup: r.blood_group, address: r.address ?? undefined, emergencyContactName: r.emergency_contact_name ?? undefined, emergencyContactPhone: r.emergency_contact_phone ?? undefined, allergies: r.allergies ?? undefined, medicalNotes: r.medical_notes ?? undefined, idProofType: r.id_proof_type ?? undefined, idProofNumber: r.id_proof_number ?? undefined, provisional: r.provisional ?? false, registeredAt: r.registered_at, createdBy: r.created_by ?? '' })
const mapUser = (r: any): User => ({ id: r.id, name: r.name, username: r.username ?? '', email: r.email ?? undefined, role: r.role, doctorId: r.doctor_id ?? undefined, patientId: r.patient_id ?? undefined, passwordHash: '', active: r.active, mustChangePassword: r.must_change_password, createdAt: r.created_at, lastLoginAt: r.last_login_at ?? undefined })
const mapTemplate = (r: any): NotificationTemplate => ({ key: r.key, templateId: r.template_id, channel: r.channel, label: r.label ?? '', body: r.body, active: r.active })

const dbToAppStatus: Record<string, AppointmentStatus> = { scheduled: 'confirmed', checked_in: 'checked_in', waiting: 'checked_in', in_consultation: 'in_consultation', completed: 'completed', cancelled: 'cancelled', no_show: 'no_show' }
const appToDbStatus: Record<string, string> = { booked: 'scheduled', confirmed: 'scheduled', checked_in: 'checked_in', in_consultation: 'in_consultation', completed: 'completed', cancelled: 'cancelled', no_show: 'no_show' }
const mapAppt = (r: any): Appointment => ({ id: r.id, code: r.appt_code, patientId: r.patient_id, doctorId: r.doctor_id, departmentId: r.department_id, date: r.date, time: r.start_time, type: r.type, reason: r.reason ?? undefined, status: dbToAppStatus[r.status] ?? 'confirmed', createdAt: r.created_at })
const mapConsult = (r: any): Consultation => ({ id: r.id, visitId: r.visit_id ?? '', patientId: r.patient_id, doctorId: r.doctor_id ?? '', date: r.date, complaints: r.complaints ?? undefined, examination: r.examination ?? undefined, diagnosis: r.diagnosis ?? undefined, advice: r.advice ?? undefined, followUpDate: r.follow_up_date ?? undefined })
const mapVitals = (r: any): Vitals => ({ id: r.id, patientId: r.patient_id, visitId: r.visit_id ?? undefined, recordedAt: r.recorded_at, recordedBy: r.recorded_by ?? '', bpSystolic: r.bp_systolic ?? undefined, bpDiastolic: r.bp_diastolic ?? undefined, pulse: r.pulse ?? undefined, tempF: r.temp_f ?? undefined, spo2: r.spo2 ?? undefined, weightKg: r.weight_kg ?? undefined, heightCm: r.height_cm ?? undefined, respRate: r.resp_rate ?? undefined })
const mapRxItem = (r: any): PrescriptionItem => ({ id: r.id, medicineId: r.medicine_id ?? undefined, medicineName: r.medicine_name, dosage: r.dosage ?? '', frequency: r.frequency ?? '', duration: r.duration ?? '', instructions: r.instructions ?? undefined, quantity: r.quantity })
const mapRx = (r: any): Prescription => ({ id: r.id, code: r.rx_code, consultationId: r.consultation_id ?? undefined, patientId: r.patient_id, doctorId: r.doctor_id ?? '', createdAt: r.created_at, status: r.status, notes: r.notes ?? undefined, items: (r.prescription_items ?? []).map(mapRxItem) })
const mapOrder = (r: any): LabOrder => ({ id: r.id, code: r.order_code, patientId: r.patient_id, doctorId: r.doctor_id ?? undefined, visitId: r.visit_id ?? undefined, createdAt: r.created_at, status: r.status, testIds: (r.lab_samples ?? []).map((s: any) => s.test_id) })
const mapSample = (r: any): LabSample => { const res = Array.isArray(r.lab_results) ? r.lab_results[0] : r.lab_results; return { id: r.id, code: r.sample_code ?? undefined, orderId: r.order_id, patientId: r.patient_id, testId: r.test_id, status: r.status, collectedAt: r.collected_at ?? undefined, collectedBy: r.collected_by ?? undefined, processedAt: r.processed_at ?? undefined, result: res?.value ?? undefined, resultUnit: res?.unit ?? undefined, refRange: res?.ref_range ?? undefined, flag: res?.flag ?? undefined, verifiedAt: res?.verified_at ?? undefined, releasedAt: res?.released_at ?? undefined } }
const mapBillItem = (r: any): BillItem => ({ id: r.id, kind: r.kind, description: r.description, qty: Number(r.qty), unitPrice: Number(r.unit_price), amount: Number(r.amount) })
const mapBill = (r: any): Bill => ({ id: r.id, code: r.invoice_code, patientId: r.patient_id, visitId: r.visit_id ?? undefined, admissionId: r.admission_id ?? undefined, createdAt: r.created_at, createdBy: r.created_by ?? '', items: (r.billing_items ?? []).map(mapBillItem), discountPct: Number(r.discount_pct), taxPct: Number(r.tax_pct), subtotal: Number(r.subtotal), discountAmt: Number(r.discount_amt), taxAmt: Number(r.tax_amt), total: Number(r.total), paid: Number(r.paid), status: r.status })
const mapPayment = (r: any): Payment => ({ id: r.id, billId: r.invoice_id, patientId: r.patient_id, amount: Number(r.amount), method: r.method, at: r.at, receivedBy: r.received_by ?? '', reference: r.reference ?? undefined })
const mapAdmission = (r: any): Admission => ({ id: r.id, code: r.admission_code, patientId: r.patient_id, bedId: r.bed_id ?? undefined, wardId: r.ward_id ?? undefined, doctorId: r.doctor_id ?? undefined, admittedAt: r.admitted_at, reason: r.reason ?? undefined, status: r.status, dischargedAt: r.discharged_at ?? undefined, dischargeSummary: r.discharge_summary ?? undefined, nursingNotes: (r.nursing_notes ?? []).map((n: any) => ({ at: n.at, by: n.by_user ?? '', note: n.note })) })
const mapEmergency = (r: any): EmergencyCase => ({ id: r.id, code: r.er_code, patientId: r.patient_id, arrivalTime: r.arrival_time, triage: r.triage, notes: r.notes ?? undefined, doctorId: r.doctor_id ?? undefined, bedId: r.bed_id ?? undefined, status: r.status })
const mapNotification = (r: any): NotificationLog => ({ id: r.id, patientId: r.patient_id ?? undefined, to: r.recipient, templateKey: r.template_key, channel: r.channel, provider: r.provider ?? '', status: r.status, message: r.message ?? '', at: r.at })
const mapAudit = (r: any): AuditEntry => ({ id: r.id, at: r.at, actorId: r.actor_id ?? '', actorName: r.actor_name ?? 'System', actorRole: (r.actor_role ?? 'super_admin') as Role, action: r.action, entity: r.entity ?? '', entityId: r.entity_id ?? undefined, detail: r.detail ?? undefined })
const mapTicket = (r: any): SupportTicket => ({ id: r.id, code: r.ticket_code, subject: r.subject, description: r.description ?? '', priority: r.priority, status: r.status, createdAt: r.created_at, createdBy: r.created_by ?? '', history: r.history ?? [] })
const mapMsgCfg = (d: any): MessagingConfigView => ({
  configured: !!d?.configured, provider: d?.provider ?? 'disabled', enabled: !!d?.enabled, baseUrl: d?.base_url ?? undefined,
  smsEnabled: !!d?.sms_enabled, rcsEnabled: !!d?.rcs_enabled, whatsappEnabled: !!d?.whatsapp_enabled, smsFallbackEnabled: !!d?.sms_fallback_enabled,
  providerUser: d?.provider_user ?? undefined,
  credentialConfigured: !!d?.credential_configured, credentialLast4: d?.credential_last4 ?? undefined,
  whatsappProvider: d?.whatsapp_provider ?? undefined, whatsappBaseUrl: d?.whatsapp_base_url ?? undefined,
  whatsappCredentialConfigured: !!d?.whatsapp_credential_configured, whatsappLast4: d?.whatsapp_last4 ?? undefined,
})

async function myProfile(): Promise<{ id: string; hospital_id: string; role: string; name: string }> {
  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user!.id
  const { data } = await supabase().from('users').select('id,hospital_id,role,name').eq('id', uid).single()
  return { id: data!.id, hospital_id: data!.hospital_id, role: data!.role, name: data!.name }
}
const arr = async (table: string, cols = '*') => (await supabase().from(table).select(cols)).data ?? []

/** SupabaseRepository — production data access over Postgres + RLS + edge fns. */
export class SupabaseRepository implements Repository {
  readonly mode = 'supabase' as const

  async getHospital() { const { data } = await supabase().from('hospitals').select('*').limit(1).single(); return mapHospital(data) }
  async updateHospital(patch: Partial<Hospital>) {
    const me = await myProfile()
    const { error } = await supabase().from('hospitals').update({ name: patch.name, address: patch.address, city: patch.city, phone: patch.phone, email: patch.email, gst_number: patch.gstNumber, registration_no: patch.registrationNo }).eq('id', me.hospital_id)
    if (error) throw new Error(error.message)
    await this.audit('Hospital settings updated', 'hospital', me.hospital_id)
  }
  async listDepartments() { const { data } = await supabase().from('departments').select('*').order('name'); return (data ?? []).map(mapDept) }
  async listDoctors() { const { data } = await supabase().from('doctors').select('*').order('name'); return (data ?? []).map(mapDoctor) }
  async listLabTests() { const { data } = await supabase().from('lab_tests').select('*').order('name'); return (data ?? []).map(mapTest) }
  async listMedicines() { const { data } = await supabase().from('medicines').select('*').order('name'); return (data ?? []).map(mapMedicine) }
  async listMedicineBatches() { const { data } = await supabase().from('medicine_batches').select('*'); return (data ?? []).map(mapBatch) }
  async listWards() { const { data } = await supabase().from('wards').select('*').order('name'); return (data ?? []).map(mapWard) }
  async listRooms() { const { data } = await supabase().from('rooms').select('*'); return (data ?? []).map(mapRoom) }
  async listBeds() { const { data } = await supabase().from('beds').select('*').order('label'); return (data ?? []).map(mapBed) }
  async listNotificationTemplates() { const { data } = await supabase().from('notification_templates').select('*').order('key'); return (data ?? []).map(mapTemplate) }
  async listUsers() { const { data } = await supabase().from('users').select('*').order('name'); return (data ?? []).map(mapUser) }

  async addDoctor(i: { name: string; departmentId: string; qualification?: string; consultationFee: number; phone?: string; timings?: string }) {
    const me = await myProfile()
    const { error } = await supabase().from('doctors').insert({ hospital_id: me.hospital_id, name: i.name, department_id: i.departmentId, qualification: i.qualification ?? null, consultation_fee: i.consultationFee, phone: i.phone ?? null, timings: i.timings ?? null })
    if (error) throw new Error(error.message)
    await this.audit('Doctor added', 'doctor', undefined, i.name)
  }
  async addLabTest(i: { name: string; code: string; category: string; price: number; sampleType?: string; unit?: string; refRange?: string }) {
    const me = await myProfile()
    const { error } = await supabase().from('lab_tests').insert({ hospital_id: me.hospital_id, name: i.name, code: i.code, category: i.category, price: i.price, sample_type: i.sampleType ?? null, unit: i.unit ?? null, ref_range: i.refRange ?? null })
    if (error) throw new Error(error.message)
    await this.audit('Lab test added', 'lab_test', undefined, i.name)
  }
  async addMedicine(i: { name: string; category: string; unit: string; mrp: number; reorderLevel: number }) {
    const me = await myProfile()
    const { error } = await supabase().from('medicines').insert({ hospital_id: me.hospital_id, name: i.name, category: i.category, unit: i.unit, mrp: i.mrp, reorder_level: i.reorderLevel })
    if (error) throw new Error(error.message)
    await this.audit('Medicine added', 'medicine', undefined, i.name)
  }
  async addMedicineBatch(i: { medicineId: string; batchNo: string; expiry: string; quantity: number; purchasePrice: number; supplier?: string }) {
    const me = await myProfile()
    const { error } = await supabase().from('medicine_batches').insert({ hospital_id: me.hospital_id, medicine_id: i.medicineId, batch_no: i.batchNo, expiry: i.expiry, quantity: i.quantity, purchase_price: i.purchasePrice, supplier: i.supplier ?? null })
    if (error) throw new Error(error.message)
    await this.audit('Stock purchase entry', 'medicine', i.medicineId, `+${i.quantity} batch ${i.batchNo}`)
  }
  async toggleTemplate(key: string, active: boolean) {
    const me = await myProfile()
    await supabase().from('notification_templates').update({ active }).eq('hospital_id', me.hospital_id).eq('key', key)
    await this.audit('Template toggled', 'template', key, active ? 'active' : 'inactive')
  }
  async createUser(input: { name: string; username: string; role: Role; password: string; email?: string }) {
    await invokeFn('admin-users', { action: 'create', ...input })
  }

  async getMessagingConfig(): Promise<MessagingConfigView> {
    const { data, error } = await supabase().rpc('get_messaging_config')
    if (error) throw new Error(error.message)
    return mapMsgCfg(data)
  }
  async saveMessagingConfig(input: SaveMessagingInput): Promise<MessagingConfigView> {
    const p: Record<string, unknown> = {
      provider: input.provider, enabled: input.enabled, base_url: input.baseUrl ?? null,
      sms_enabled: input.smsEnabled, rcs_enabled: input.rcsEnabled, whatsapp_enabled: input.whatsappEnabled,
      sms_fallback_enabled: input.smsFallbackEnabled,
      provider_user: input.providerUser ?? '',
      whatsapp_provider: input.whatsappProvider ?? null, whatsapp_base_url: input.whatsappBaseUrl ?? null,
    }
    if (input.credential) p.credential = input.credential
    if (input.whatsappCredential) p.whatsapp_credential = input.whatsappCredential
    const { data, error } = await supabase().rpc('save_messaging_config', { p })
    if (error) throw new Error(error.message)
    return mapMsgCfg(data)
  }
  async testMessagingConnection() { return invokeFn('messaging-test', { action: 'test' }) }
  async sendTestMessage(input: { to: string; templateKey?: string; vars?: Record<string, string | number | undefined> }) {
    return invokeFn('messaging-test', { action: 'send_test', to: input.to, templateKey: input.templateKey ?? 'appt_confirm', vars: input.vars ?? {} })
  }

  async listPatients(search?: string) {
    let q = supabase().from('patients').select('*').order('registered_at', { ascending: false }).limit(300)
    const term = (search ?? '').trim()
    if (term) q = q.or(`name.ilike.%${term}%,patient_code.ilike.%${term}%,mobile.ilike.%${term}%`)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return (data ?? []).map(mapPatient)
  }
  async getPatient(id: string) { const { data } = await supabase().from('patients').select('*').eq('id', id).maybeSingle(); return data ? mapPatient(data) : null }
  async getMyPatient() { const { data } = await supabase().from('patients').select('*').limit(1).maybeSingle(); return data ? mapPatient(data) : null }

  async getPatientRecord(patientId: string): Promise<PatientRecord | null> {
    const patient = await this.getPatient(patientId)
    if (!patient) return null
    const [appts, vitals, cons, rxs, orders, samples, bills, pays, adms, doctors, tests] = await Promise.all([
      supabase().from('appointments').select('*').eq('patient_id', patientId).order('date', { ascending: false }),
      supabase().from('vitals').select('*').eq('patient_id', patientId).order('recorded_at', { ascending: false }),
      supabase().from('consultations').select('*').eq('patient_id', patientId).order('date', { ascending: false }),
      supabase().from('prescriptions').select('*, prescription_items(*)').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase().from('lab_orders').select('*, lab_samples(test_id)').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase().from('lab_samples').select('*, lab_results(value,unit,ref_range,flag,verified_at,released_at)').eq('patient_id', patientId),
      supabase().from('billing_invoices').select('*, billing_items(*)').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase().from('payments').select('*').eq('patient_id', patientId).order('at', { ascending: false }),
      supabase().from('admissions').select('*, nursing_notes(*)').eq('patient_id', patientId).order('admitted_at', { ascending: false }),
      supabase().from('doctors').select('id,name'), supabase().from('lab_tests').select('id,name'),
    ])
    const docMap = new Map((doctors.data ?? []).map((d: any) => [d.id, d.name]))
    const testMap = new Map((tests.data ?? []).map((t: any) => [t.id, t.name]))
    const P = { patient, appointments: (appts.data ?? []).map(mapAppt), vitals: (vitals.data ?? []).map(mapVitals), consultations: (cons.data ?? []).map(mapConsult), prescriptions: (rxs.data ?? []).map(mapRx), labOrders: (orders.data ?? []).map(mapOrder), labSamples: (samples.data ?? []).map(mapSample), bills: (bills.data ?? []).map(mapBill), payments: (pays.data ?? []).map(mapPayment), admissions: (adms.data ?? []).map(mapAdmission) }
    const timeline = buildTimeline({ ...P, emergencies: [], resolveDoctor: (id) => docMap.get(id ?? '') ?? '—', resolveTest: (id) => testMap.get(id ?? '') ?? 'Test' })
    return { ...P, timeline }
  }

  async registerPatient(input: RegisterPatientInput): Promise<RegisterPatientResult> {
    const res = await invokeFn<{ patient: any; loginId: string; tempPassword: string; appointment: any }>('register-patient', input)
    const patient = mapPatient(res.patient)
    // Registration RCS (nxthealth_reg_portal) is sent ONLY when the registration
    // created a real appointment: var_6/7/8 (doctor, date, time) MUST come from
    // that actual appointment record — never registeredAt, never placeholders.
    // Positional vars: name, hospital(server-side), patientId, loginId,
    // tempPassword, doctor, apptDate, apptTime. `hospital` is injected by notify
    // from the tenant record (never trusted from the client). The approved
    // template contains the fixed portal URL https://patient.nxtgensol.co.in.
    const appt = res.appointment
    if (appt?.doctor_id && appt?.date && appt?.start_time) {
      const { data: doc } = await supabase().from('doctors').select('name').eq('id', appt.doctor_id).maybeSingle()
      const doctorName = doc?.name ?? ''
      if (doctorName) {
        void invokeFn('notify', { templateKey: 'registration', patientId: patient.id, to: patient.mobile, ref: patient.code, vars: { name: patient.name, patientId: patient.code, loginId: res.loginId, tempPassword: res.tempPassword, doctor: doctorName, apptDate: appt.date, apptTime: appt.start_time } }).catch(() => {})
      }
    }
    return { patient, loginId: res.loginId, tempPassword: res.tempPassword, appointmentId: res.appointment?.id }
  }
  async updatePatient(id: string, patch: Partial<Patient>) {
    const row: any = {}
    const m: Record<string, string> = { name: 'name', mobile: 'mobile', gender: 'gender', dob: 'dob', ageYears: 'age_years', bloodGroup: 'blood_group', address: 'address', emergencyContactName: 'emergency_contact_name', emergencyContactPhone: 'emergency_contact_phone', allergies: 'allergies', medicalNotes: 'medical_notes', idProofType: 'id_proof_type', idProofNumber: 'id_proof_number', provisional: 'provisional' }
    for (const [k, v] of Object.entries(patch)) if (m[k]) row[m[k]] = v
    const { error } = await supabase().from('patients').update(row).eq('id', id)
    if (error) throw new Error(error.message)
    await this.audit('Patient record modified', 'patient', id)
  }
  async recordVitals(input: Omit<Vitals, 'id' | 'recordedAt' | 'recordedBy'>) {
    const me = await myProfile()
    const { error } = await supabase().from('vitals').insert({ hospital_id: me.hospital_id, patient_id: input.patientId, visit_id: input.visitId ?? null, recorded_by: me.id, bp_systolic: input.bpSystolic ?? null, bp_diastolic: input.bpDiastolic ?? null, pulse: input.pulse ?? null, temp_f: input.tempF ?? null, spo2: input.spo2 ?? null, weight_kg: input.weightKg ?? null, height_cm: input.heightCm ?? null, resp_rate: input.respRate ?? null })
    if (error) throw new Error(error.message)
  }

  async listAppointments() { const { data } = await supabase().from('appointments').select('*').order('date', { ascending: false }).limit(500); return (data ?? []).map(mapAppt) }
  async bookAppointment(input: Parameters<Repository['bookAppointment']>[0]) {
    const me = await myProfile()
    const { data, error } = await supabase().from('appointments').insert({ hospital_id: me.hospital_id, patient_id: input.patientId, doctor_id: input.doctorId, department_id: input.departmentId || null, date: input.date, start_time: input.time, type: input.type, reason: input.reason ?? null, status: 'scheduled', created_by: me.id }).select().single()
    if (error) throw new Error(error.message.includes('uq_appt_no_doublebook') ? 'That doctor already has an appointment at this time.' : error.message)
    const appt = mapAppt(data)
    await this.audit('Appointment booked', 'appointment', appt.code)
    const [{ data: p }, { data: d }] = await Promise.all([supabase().from('patients').select('name,mobile,patient_code').eq('id', input.patientId).single(), supabase().from('doctors').select('name').eq('id', input.doctorId).single()])
    // vars align with the approved SMS Horizon template var_order (nxthealth_appt);
    // ref = appointment code makes the send idempotent (no duplicate confirmations).
    if (p) void invokeFn('notify', { templateKey: 'appt_confirm', patientId: input.patientId, to: p.mobile, ref: appt.code, vars: { name: p.name, doctor: d?.name, date: input.date, time: input.time, patientId: (p as any).patient_code, apptId: appt.code } }).catch(() => {})
    return appt
  }
  async setAppointmentStatus(id: string, status: AppointmentStatus) {
    const { error } = await supabase().from('appointments').update({ status: appToDbStatus[status] ?? 'scheduled' }).eq('id', id)
    if (error) throw new Error(error.message)
    await this.audit(`Appointment ${status.replace('_', ' ')}`, 'appointment', id)
    if (status === 'cancelled') {
      const { data: a } = await supabase().from('appointments').select('appt_code,date,patient_id,patients(mobile,name)').eq('id', id).single()
      const pt: any = a?.patients
      if (pt) void invokeFn('notify', { templateKey: 'appt_cancel', patientId: a!.patient_id, to: pt.mobile, vars: { name: pt.name, apptId: a!.appt_code, date: a!.date } }).catch(() => {})
    }
  }

  async saveConsultation(input: Omit<Consultation, 'id' | 'date'>) {
    const me = await myProfile()
    const { data, error } = await supabase().from('consultations').insert({ hospital_id: me.hospital_id, visit_id: input.visitId || null, patient_id: input.patientId, doctor_id: input.doctorId || null, complaints: input.complaints ?? null, examination: input.examination ?? null, diagnosis: input.diagnosis ?? null, advice: input.advice ?? null, follow_up_date: input.followUpDate ?? null }).select().single()
    if (error) throw new Error(error.message)
    await this.audit('Consultation recorded', 'consultation', data.id, `Patient ${input.patientId}`)
    return mapConsult(data)
  }
  async createPrescription(input: { patientId: string; doctorId: string; consultationId?: string; items: Omit<PrescriptionItem, 'id'>[]; notes?: string }) {
    const me = await myProfile()
    const { data: rx, error } = await supabase().from('prescriptions').insert({ hospital_id: me.hospital_id, patient_id: input.patientId, doctor_id: input.doctorId || null, consultation_id: input.consultationId || null, status: 'sent_to_pharmacy', notes: input.notes ?? null }).select().single()
    if (error) throw new Error(error.message)
    if (input.items.length) {
      const { error: e2 } = await supabase().from('prescription_items').insert(input.items.map((it) => ({ hospital_id: me.hospital_id, prescription_id: rx.id, medicine_id: it.medicineId ?? null, medicine_name: it.medicineName, dosage: it.dosage, frequency: it.frequency, duration: it.duration, instructions: it.instructions ?? null, quantity: it.quantity })))
      if (e2) throw new Error(e2.message)
    }
    await this.audit('Prescription created', 'prescription', rx.rx_code, `${input.items.length} item(s)`)
    const { data: p } = await supabase().from('patients').select('mobile,name').eq('id', input.patientId).single()
    const { data: d } = await supabase().from('doctors').select('name').eq('id', input.doctorId).maybeSingle()
    if (p) void invokeFn('notify', { templateKey: 'prescription_ready', patientId: input.patientId, to: p.mobile, ref: rx.rx_code, vars: { name: p.name, rxId: rx.rx_code, doctor: d?.name } }).catch(() => {})
    return { ...mapRx(rx), items: input.items.map((it, i) => ({ ...it, id: `${rx.id}:${i}` })) }
  }
  async listPrescriptions() { const { data } = await supabase().from('prescriptions').select('*, prescription_items(*)').order('created_at', { ascending: false }).limit(300); return (data ?? []).map(mapRx) }
  async dispensePrescription(id: string) {
    const { error } = await supabase().rpc('dispense_prescription', { p_prescription: id })
    if (error) throw new Error(error.message)
    return true
  }

  async orderLab(input: { patientId: string; doctorId?: string; visitId?: string; testIds: string[] }) {
    const me = await myProfile()
    const { data: order, error } = await supabase().from('lab_orders').insert({ hospital_id: me.hospital_id, patient_id: input.patientId, doctor_id: input.doctorId ?? null, visit_id: input.visitId ?? null, status: 'ordered' }).select().single()
    if (error) throw new Error(error.message)
    if (input.testIds.length) {
      const { error: e2 } = await supabase().from('lab_samples').insert(input.testIds.map((testId) => ({ hospital_id: me.hospital_id, order_id: order.id, patient_id: input.patientId, test_id: testId, status: 'pending' })))
      if (e2) throw new Error(e2.message)
    }
    await this.audit('Lab order created', 'lab_order', order.order_code, `${input.testIds.length} test(s)`)
    return { ...mapOrder(order), testIds: input.testIds }
  }
  async listLabOrders() { const { data } = await supabase().from('lab_orders').select('*, lab_samples(test_id)').order('created_at', { ascending: false }).limit(300); return (data ?? []).map(mapOrder) }
  async listLabSamples() { const { data } = await supabase().from('lab_samples').select('*, lab_results(value,unit,ref_range,flag,verified_at,released_at)').order('id', { ascending: false }).limit(500); return (data ?? []).map(mapSample) }
  async collectSample(sampleId: string) {
    const me = await myProfile()
    const { error } = await supabase().from('lab_samples').update({ status: 'collected', collected_at: new Date().toISOString(), collected_by: me.id }).eq('id', sampleId)
    if (error) throw new Error(error.message)
    await this.audit('Lab sample collected', 'lab_sample', sampleId)
    const { data: s } = await supabase().from('lab_samples').select('patient_id, patients(mobile,name)').eq('id', sampleId).single()
    const pt: any = s?.patients
    if (pt) void invokeFn('notify', { templateKey: 'lab_collected', patientId: s!.patient_id, to: pt.mobile, vars: { name: pt.name, sampleId } }).catch(() => {})
  }
  // Atomic + server-enforced (perm + diagnostics module) via SECURITY DEFINER RPCs.
  async enterResult(sampleId: string, result: string, flag: LabSample['flag']) {
    const { error } = await supabase().rpc('enter_lab_result', { p_sample: sampleId, p_value: result, p_flag: flag ?? 'normal' })
    if (error) throw new Error(error.message)
  }
  async verifyResult(sampleId: string) {
    const { error } = await supabase().rpc('verify_lab_result', { p_sample: sampleId })
    if (error) throw new Error(error.message)
  }
  async releaseOrderReport(orderId: string) {
    const { error } = await supabase().rpc('release_lab_order', { p_order: orderId })
    if (error) throw new Error(error.message)
    const { data: order } = await supabase().from('lab_orders').select('order_code, patient_id').eq('id', orderId).single()
    const { data: p } = await supabase().from('patients').select('mobile,name').eq('id', order!.patient_id).single()
    if (p) void invokeFn('notify', { templateKey: 'lab_ready', patientId: order!.patient_id, to: p.mobile, ref: order!.order_code, vars: { name: p.name, orderId: order!.order_code } }).catch(() => {})
  }

  async listBills() { const { data } = await supabase().from('billing_invoices').select('*, billing_items(*)').order('created_at', { ascending: false }).limit(300); return (data ?? []).map(mapBill) }
  async listPayments() { const { data } = await supabase().from('payments').select('*').order('at', { ascending: false }).limit(300); return (data ?? []).map(mapPayment) }
  async createBill(input: { patientId: string; visitId?: string; admissionId?: string; items: Omit<BillItem, 'id' | 'amount'>[]; discountPct: number; taxPct: number }) {
    const me = await myProfile()
    const items = input.items.map((it) => ({ ...it, amount: +(it.qty * it.unitPrice).toFixed(2) }))
    const subtotal = +items.reduce((s, it) => s + it.amount, 0).toFixed(2)
    const discountAmt = +((subtotal * input.discountPct) / 100).toFixed(2)
    const taxable = subtotal - discountAmt
    const taxAmt = +((taxable * input.taxPct) / 100).toFixed(2)
    const total = +(taxable + taxAmt).toFixed(2)
    const { data: bill, error } = await supabase().from('billing_invoices').insert({ hospital_id: me.hospital_id, patient_id: input.patientId, visit_id: input.visitId ?? null, admission_id: input.admissionId ?? null, created_by: me.id, discount_pct: input.discountPct, tax_pct: input.taxPct, subtotal, discount_amt: discountAmt, tax_amt: taxAmt, total, paid: 0, status: total > 0 ? 'unpaid' : 'paid' }).select().single()
    if (error) throw new Error(error.message)
    if (items.length) await supabase().from('billing_items').insert(items.map((it) => ({ hospital_id: me.hospital_id, invoice_id: bill.id, kind: it.kind, description: it.description, qty: it.qty, unit_price: it.unitPrice, amount: it.amount })))
    await this.audit('Bill generated', 'bill', bill.invoice_code, `total ${total}`)
    const { data: p } = await supabase().from('patients').select('mobile,name').eq('id', input.patientId).single()
    if (p) void invokeFn('notify', { templateKey: 'bill_generated', patientId: input.patientId, to: p.mobile, ref: bill.invoice_code, vars: { name: p.name, invId: bill.invoice_code, amount: `₹${total.toLocaleString('en-IN')}` } }).catch(() => {})
    const { data: full } = await supabase().from('billing_invoices').select('*, billing_items(*)').eq('id', bill.id).single()
    return mapBill(full)
  }
  async addPayment(input: { billId: string; amount: number; method: Payment['method']; reference?: string }) {
    const { data: payId, error } = await supabase().rpc('record_payment', { p_invoice: input.billId, p_amount: input.amount, p_method: input.method, p_reference: input.reference ?? null })
    if (error) throw new Error(error.message)
    await this.audit('Payment received', 'bill', input.billId, `${input.method} ₹${input.amount}`)
    const { data: pay } = await supabase().from('payments').select('*').eq('id', payId).single()
    const { data: b } = await supabase().from('billing_invoices').select('invoice_code, patient_id, patients(mobile,name)').eq('id', input.billId).single()
    const pt: any = b?.patients
    if (pt) void invokeFn('notify', { templateKey: 'payment_receipt', patientId: b!.patient_id, to: pt.mobile, ref: String(payId), vars: { name: pt.name, invId: b!.invoice_code, amount: `₹${input.amount.toLocaleString('en-IN')}` } }).catch(() => {})
    return mapPayment(pay)
  }

  async setBedState(bedId: string, state: BedState) {
    const row: any = { state }
    if (state === 'available') { row.patient_id = null; row.admission_id = null }
    const { error } = await supabase().from('beds').update(row).eq('id', bedId)
    if (error) throw new Error(error.message)
    await this.audit(`Bed set ${state}`, 'bed', bedId)
  }
  async admitPatient(input: { patientId: string; bedId: string; doctorId?: string; reason?: string }) {
    const me = await myProfile()
    const { data: bed } = await supabase().from('beds').select('ward_id').eq('id', input.bedId).single()
    const { data: adm, error } = await supabase().from('admissions').insert({ hospital_id: me.hospital_id, patient_id: input.patientId, bed_id: input.bedId, ward_id: bed?.ward_id ?? null, doctor_id: input.doctorId ?? null, reason: input.reason ?? null, status: 'admitted' }).select().single()
    if (error) throw new Error(error.message)
    await supabase().from('beds').update({ state: 'occupied', patient_id: input.patientId, admission_id: adm.id }).eq('id', input.bedId)
    await this.audit('Patient admitted (IPD)', 'admission', adm.admission_code, input.patientId)
    return mapAdmission({ ...adm, nursing_notes: [] })
  }
  async listAdmissions() { const { data } = await supabase().from('admissions').select('*, nursing_notes(*)').order('admitted_at', { ascending: false }).limit(200); return (data ?? []).map(mapAdmission) }
  async addNursingNote(admissionId: string, note: string) {
    const me = await myProfile()
    const { error } = await supabase().from('nursing_notes').insert({ hospital_id: me.hospital_id, admission_id: admissionId, by_user: me.id, note })
    if (error) throw new Error(error.message)
    await this.audit('Nursing note added', 'admission', admissionId)
  }
  async dischargePatient(admissionId: string, summary: string) {
    const { data: adm } = await supabase().from('admissions').select('bed_id, patient_id, admission_code').eq('id', admissionId).single()
    await supabase().from('admissions').update({ status: 'discharged', discharged_at: new Date().toISOString(), discharge_summary: summary }).eq('id', admissionId)
    if (adm?.bed_id) await supabase().from('beds').update({ state: 'cleaning', patient_id: null, admission_id: null }).eq('id', adm.bed_id)
    await this.audit('Patient discharged', 'admission', adm?.admission_code)
    const { data: p } = await supabase().from('patients').select('mobile,name').eq('id', adm!.patient_id).single()
    if (p) void invokeFn('notify', { templateKey: 'discharge', patientId: adm!.patient_id, to: p.mobile, ref: adm!.admission_code, vars: { name: p.name } }).catch(() => {})
  }
  async listEmergencies() { const { data } = await supabase().from('emergency_cases').select('*').order('arrival_time', { ascending: false }).limit(200); return (data ?? []).map(mapEmergency) }
  async registerEmergency(input: { name: string; mobile: string; gender: Gender; triage: EmergencyCase['triage']; notes?: string; doctorId?: string }) {
    const me = await myProfile()
    const reg = await invokeFn<{ patient: any }>('register-patient', { name: input.name, mobile: input.mobile || '0000000000', gender: input.gender, bloodGroup: 'unknown', provisional: true })
    const patient = mapPatient(reg.patient)
    const { data: c, error } = await supabase().from('emergency_cases').insert({ hospital_id: me.hospital_id, patient_id: patient.id, triage: input.triage, notes: input.notes ?? null, doctor_id: input.doctorId ?? null, status: 'active' }).select().single()
    if (error) throw new Error(error.message)
    await this.audit('Emergency case registered', 'emergency', c.er_code, `${input.triage} triage`)
    return { case: mapEmergency(c), patient }
  }
  async setEmergencyStatus(id: string, status: EmergencyCase['status']) {
    const { error } = await supabase().from('emergency_cases').update({ status }).eq('id', id)
    if (error) throw new Error(error.message)
    await this.audit(`Emergency ${status}`, 'emergency', id)
  }

  async dashboardStats(): Promise<DashboardStats> {
    const today = todayISO()
    const isToday = (iso?: string) => !!iso && iso.slice(0, 10) === today
    const [{ count: patientsTotal }, appts, adms, ers, beds, samples, rx, bills, pays, meds, batches] = await Promise.all([
      supabase().from('patients').select('*', { count: 'exact', head: true }),
      arr('appointments', 'date'), arr('admissions', 'status,admitted_at,discharged_at'), arr('emergency_cases', 'status'),
      arr('beds', 'state'), arr('lab_samples', 'status'), arr('prescriptions', 'status'),
      arr('billing_invoices', 'total,paid,status'), arr('payments', 'amount,at'), arr('medicines', 'id,reorder_level'), arr('medicine_batches', 'medicine_id,quantity'),
    ])
    const stockByMed = new Map<string, number>()
    for (const b of batches as any[]) stockByMed.set(b.medicine_id, (stockByMed.get(b.medicine_id) ?? 0) + b.quantity)
    const lowStock = (meds as any[]).filter((m) => (stockByMed.get(m.id) ?? 0) <= m.reorder_level).length
    return {
      patientsTotal: patientsTotal ?? 0,
      opdToday: (appts as any[]).filter((a) => a.date === today).length,
      ipdActive: (adms as any[]).filter((a) => a.status !== 'discharged').length,
      emergencyActive: (ers as any[]).filter((c) => c.status === 'active').length,
      admissionsToday: (adms as any[]).filter((a) => isToday(a.admitted_at)).length,
      dischargesToday: (adms as any[]).filter((a) => isToday(a.discharged_at)).length,
      bedsAvailable: (beds as any[]).filter((b) => b.state === 'available').length,
      bedsOccupied: (beds as any[]).filter((b) => b.state === 'occupied').length,
      bedsTotal: (beds as any[]).length,
      labSamplesPending: (samples as any[]).filter((s) => ['pending', 'collected', 'processing'].includes(s.status)).length,
      reportsPending: (samples as any[]).filter((s) => s.status === 'completed').length,
      pharmacyQueue: (rx as any[]).filter((p) => p.status === 'sent_to_pharmacy').length,
      pendingPayments: (bills as any[]).filter((b) => b.status !== 'paid').reduce((s, b) => s + (Number(b.total) - Number(b.paid)), 0),
      revenueToday: (pays as any[]).filter((p) => isToday(p.at)).reduce((s, p) => s + Number(p.amount), 0),
      lowStock,
    }
  }
  async revenueTrend(): Promise<TrendPoint[]> {
    const pays = await arr('payments', 'amount,at')
    return last7((d) => (pays as any[]).filter((p) => p.at?.slice(0, 10) === d).reduce((s, p) => s + Number(p.amount), 0))
  }
  async visitsTrend(): Promise<TrendPoint[]> {
    const [appts, ers] = await Promise.all([arr('appointments', 'date'), arr('emergency_cases', 'arrival_time')])
    return last7((d) => (appts as any[]).filter((a) => a.date === d).length + (ers as any[]).filter((c) => c.arrival_time?.slice(0, 10) === d).length)
  }
  async lowStock(): Promise<LowStockRow[]> {
    const [meds, batches] = await Promise.all([arr('medicines', 'id,name,reorder_level'), arr('medicine_batches', 'medicine_id,quantity')])
    const stock = new Map<string, number>()
    for (const b of batches as any[]) stock.set(b.medicine_id, (stock.get(b.medicine_id) ?? 0) + b.quantity)
    return (meds as any[]).map((m) => ({ name: m.name, qty: stock.get(m.id) ?? 0, reorderLevel: m.reorder_level })).filter((x) => x.qty <= x.reorderLevel)
  }
  async frictionMap() {
    const { data } = await supabase().from('visits').select('stage_times')
    const PAIRS: [string, string, string][] = [
      ['registration', 'checkin', 'Registration → Check-in'], ['checkin', 'consultation_start', 'Doctor waiting'],
      ['consultation_start', 'consultation_end', 'Consultation'], ['lab_ordered', 'lab_collected', 'Lab waiting (collection)'],
      ['lab_collected', 'lab_reported', 'Lab processing → report'], ['consultation_end', 'billing', 'Billing'], ['billing', 'pharmacy', 'Pharmacy'],
    ]
    return PAIRS.map(([from, to, label]) => {
      const durations: number[] = []
      for (const v of (data ?? []) as any[]) {
        const st = v.stage_times || {}
        if (st[from] && st[to]) { const m = (new Date(st[to]).getTime() - new Date(st[from]).getTime()) / 60000; if (m >= 0 && m < 1440) durations.push(m) }
      }
      const avgMin = durations.length ? Math.round(durations.reduce((s, x) => s + x, 0) / durations.length) : null
      return { label, avgMin, samples: durations.length }
    })
  }
  async listConsultations() { const { data } = await supabase().from('consultations').select('*').order('date', { ascending: false }).limit(500); return (data ?? []).map(mapConsult) }
  async listNotifications() { const { data } = await supabase().from('notifications').select('*').order('at', { ascending: false }).limit(200); return (data ?? []).map(mapNotification) }
  async listAudit() { const { data } = await supabase().from('audit_logs').select('*').order('at', { ascending: false }).limit(300); return (data ?? []).map(mapAudit) }

  async listTickets() { const { data } = await supabase().from('support_tickets').select('*').order('created_at', { ascending: false }); return (data ?? []).map(mapTicket) }
  async createTicket(i: { subject: string; description: string; priority: TicketPriority }) {
    const me = await myProfile()
    const { data, error } = await supabase().from('support_tickets').insert({ hospital_id: me.hospital_id, subject: i.subject, description: i.description, priority: i.priority, status: 'open', created_by: me.id, history: [{ at: new Date().toISOString(), by: me.name, note: 'Ticket raised' }] }).select().single()
    if (error) throw new Error(error.message)
    await this.audit('Support ticket raised', 'ticket', data.ticket_code, i.subject)
    return mapTicket(data)
  }
  async setTicketStatus(id: string, status: TicketStatus) {
    const me = await myProfile()
    const { data: t } = await supabase().from('support_tickets').select('history').eq('id', id).single()
    const history = [{ at: new Date().toISOString(), by: me.name, note: `Status → ${status}` }, ...((t?.history as any[]) ?? [])]
    await supabase().from('support_tickets').update({ status, history }).eq('id', id)
  }

  async licenseCurrent() {
    const r = await invokeFn<{ status: string; license: any }>('licensing', { action: 'current' })
    const daysLeft = r.license?.expiry_date ? Math.max(0, Math.ceil((new Date(r.license.expiry_date + 'T23:59:59').getTime() - Date.now()) / 86400000)) : null
    return { status: r.status, license: r.license, daysLeft }
  }
  async licenseStartTrial() { return invokeFn('licensing', { action: 'start_trial' }) }
  async licenseIssue(i: { type: LicenseType; startDate?: string; userLimit?: number; modules?: string[] }) { return invokeFn('licensing', { action: 'issue', ...i }) }
  async listLicenseActivations() {
    const { data } = await supabase().from('license_activations').select('*').order('activated_at', { ascending: false }).limit(100)
    return (data ?? []).map((a: any) => ({ id: a.id, key: a.key ?? '', hospitalId: a.hospital_id, activatedAt: a.activated_at, activatedBy: a.activated_by ?? '', result: a.result, reason: a.reason ?? undefined }))
  }

  private async audit(action: string, entity: string, entityId?: string, detail?: string) {
    try {
      const me = await myProfile()
      await supabase().from('audit_logs').insert({ hospital_id: me.hospital_id, actor_id: me.id, actor_name: me.name, actor_role: me.role, action, entity, entity_id: entityId ?? null, detail: detail ?? null })
    } catch { /* non-blocking */ }
  }
}

function last7(valueFor: (dayISO: string) => number): TrendPoint[] {
  const out: TrendPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    out.push({ day: new Date(d).toLocaleDateString('en-IN', { weekday: 'short' }), value: valueFor(d) })
  }
  return out
}

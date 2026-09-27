import type {
  Repository, RegisterPatientInput, RegisterPatientResult, PatientRecord, DashboardStats, TrendPoint, LowStockRow,
  MessagingConfigView, SaveMessagingInput,
} from './repository'
import type {
  AppointmentStatus, BedState, BillItem, Consultation, EmergencyCase, Gender, Hospital, LabSample,
  Patient, Payment, PrescriptionItem, Role, SupportTicket, TicketStatus, TicketPriority, Vitals, LicenseType, NotificationTemplate,
} from '../types'
import { useDB, nextSeq } from '../store/db'
import { useAuth } from '../store/auth'
import * as H from '../services/hospital'
import * as SEL from '../lib/selectors'
import { hashPassword } from '../lib/crypto'
import { ticketId } from '../lib/format'
import { audit } from '../services/audit'
import { currentStatus, startTrial as licStartTrial, generateToken, activate } from '../services/license'
import { ALL_MODULES } from '../config'

/** LocalRepository — DEV/DEMO backend over the in-memory store + services. */
export class LocalRepository implements Repository {
  readonly mode = 'local' as const
  private db() { return useDB.getState().db }

  async getHospital() { return this.db().hospital }
  async updateHospital(patch: Partial<Hospital>) { useDB.getState().update((d) => { d.hospital = { ...d.hospital, ...patch } }); audit('Hospital settings updated', 'hospital') }
  async listDepartments() { return this.db().departments }
  async listDoctors() { return this.db().doctors }
  async listLabTests() { return this.db().labTests }
  async listMedicines() { return this.db().medicines }
  async listMedicineBatches() { return this.db().medicineBatches }
  async listWards() { return this.db().wards }
  async listRooms() { return this.db().rooms }
  async listBeds() { return this.db().beds }
  async listNotificationTemplates() { return this.db().notificationTemplates }
  async listUsers() { return this.db().users }

  async addDoctor(i: { name: string; departmentId: string; qualification?: string; consultationFee: number; phone?: string; timings?: string }) {
    useDB.getState().update((d) => d.doctors.push({ id: `doc_${rid()}`, active: true, qualification: '', ...i }))
    audit('Doctor added', 'doctor', undefined, i.name)
  }
  async addLabTest(i: { name: string; code: string; category: string; price: number; sampleType?: string; unit?: string; refRange?: string }) {
    useDB.getState().update((d) => d.labTests.push({ id: `lt_${rid()}`, active: true, sampleType: i.sampleType ?? '', ...i }))
    audit('Lab test added', 'lab_test', undefined, i.name)
  }
  async addMedicine(i: { name: string; category: string; unit: string; mrp: number; reorderLevel: number }) {
    useDB.getState().update((d) => d.medicines.push({ id: `med_${rid()}`, active: true, ...i }))
    audit('Medicine added', 'medicine', undefined, i.name)
  }
  async addMedicineBatch(i: { medicineId: string; batchNo: string; expiry: string; quantity: number; purchasePrice: number; supplier?: string }) { H.addMedicineBatch(i) }
  async toggleTemplate(key: string, active: boolean) {
    useDB.getState().update((d) => { const t = d.notificationTemplates.find((x) => x.key === (key as NotificationTemplate['key'])); if (t) t.active = active })
    audit('Template toggled', 'template', key)
  }
  async createUser(i: { name: string; username: string; role: Role; password: string; email?: string }) {
    useDB.getState().update((d) => d.users.push({ id: `u_${rid()}`, name: i.name, username: i.username, role: i.role, email: i.email, passwordHash: hashPassword(i.password), mustChangePassword: true, active: true, createdAt: new Date().toISOString() }))
    audit('User created', 'user', undefined, `${i.username} (${i.role})`)
  }

  // Messaging config — DEV mode stores non-secret flags in localStorage; credential
  // is stored locally only for testing and never returned (parity with Supabase mode).
  private msgKey = 'nxthealth.messaging.local'
  private readMsg(): any { try { return JSON.parse(localStorage.getItem(this.msgKey) || '{}') } catch { return {} } }
  async getMessagingConfig(): Promise<MessagingConfigView> {
    const m = this.readMsg()
    return {
      configured: !!m.provider, provider: m.provider ?? 'disabled', enabled: !!m.enabled, baseUrl: m.baseUrl,
      smsEnabled: !!m.smsEnabled, rcsEnabled: !!m.rcsEnabled, whatsappEnabled: !!m.whatsappEnabled, smsFallbackEnabled: !!m.smsFallbackEnabled,
      providerUser: m.providerUser ?? undefined,
      credentialConfigured: !!m.credential, credentialLast4: m.credential ? String(m.credential).slice(-4) : undefined,
      whatsappProvider: m.whatsappProvider, whatsappBaseUrl: m.whatsappBaseUrl,
      whatsappCredentialConfigured: !!m.whatsappCredential, whatsappLast4: m.whatsappCredential ? String(m.whatsappCredential).slice(-4) : undefined,
    }
  }
  async saveMessagingConfig(input: SaveMessagingInput): Promise<MessagingConfigView> {
    const prev = this.readMsg()
    const next = { ...prev, provider: input.provider, enabled: input.enabled, baseUrl: input.baseUrl, smsEnabled: input.smsEnabled, rcsEnabled: input.rcsEnabled, whatsappEnabled: input.whatsappEnabled, smsFallbackEnabled: input.smsFallbackEnabled, providerUser: input.providerUser, whatsappProvider: input.whatsappProvider, whatsappBaseUrl: input.whatsappBaseUrl }
    if (input.credential) next.credential = input.credential
    if (input.whatsappCredential) next.whatsappCredential = input.whatsappCredential
    try { localStorage.setItem(this.msgKey, JSON.stringify(next)) } catch { /* ignore */ }
    audit('Messaging config updated', 'messaging', undefined, input.provider)
    return this.getMessagingConfig()
  }
  async testMessagingConnection() { const m = this.readMsg(); return { ok: !!m.credential && m.provider === 'sms_horizon', provider: m.provider, credentialConfigured: !!m.credential, info: 'Local DEV mode — no live provider request is made.' } }
  async sendTestMessage() { return { ok: false, status: 'configuration_missing', info: 'Local DEV mode does not send real messages. Use Supabase mode.' } }

  async listPatients(search?: string) {
    const term = (search ?? '').trim().toLowerCase()
    const all = this.db().patients
    if (!term) return all
    return all.filter((p) => p.id.toLowerCase().includes(term) || p.name.toLowerCase().includes(term) || p.mobile.includes(term))
  }
  async getPatient(id: string) { return this.db().patients.find((p) => p.id === id) ?? null }
  async getMyPatient() { const u = useAuth.getState().user; return u?.patientId ? (this.db().patients.find((p) => p.id === u.patientId) ?? null) : null }
  async getPatientRecord(patientId: string): Promise<PatientRecord | null> {
    const db = this.db()
    const patient = db.patients.find((p) => p.id === patientId)
    if (!patient) return null
    return {
      patient,
      appointments: db.appointments.filter((a) => a.patientId === patientId),
      vitals: db.vitals.filter((v) => v.patientId === patientId),
      consultations: db.consultations.filter((c) => c.patientId === patientId),
      prescriptions: db.prescriptions.filter((r) => r.patientId === patientId),
      labOrders: db.labOrders.filter((o) => o.patientId === patientId),
      labSamples: db.labSamples.filter((s) => s.patientId === patientId),
      bills: db.bills.filter((b) => b.patientId === patientId),
      payments: db.payments.filter((p) => p.patientId === patientId),
      admissions: db.admissions.filter((a) => a.patientId === patientId),
      timeline: SEL.patientTimeline(db, patientId),
    }
  }
  async registerPatient(input: RegisterPatientInput): Promise<RegisterPatientResult> {
    const res = H.createPatient(input)
    let appointmentId: string | undefined
    if (input.appointment?.doctorId) {
      const a = H.bookAppointment({ patientId: res.patient.id, doctorId: input.appointment.doctorId, departmentId: input.appointment.departmentId ?? '', date: input.appointment.date, time: input.appointment.time, type: input.appointment.type ?? 'new', reason: input.appointment.reason })
      appointmentId = a.id
    }
    return { patient: res.patient, loginId: res.loginId, tempPassword: res.tempPass, appointmentId }
  }
  async updatePatient(id: string, patch: Partial<Patient>) { H.updatePatient(id, patch) }
  async recordVitals(input: Omit<Vitals, 'id' | 'recordedAt' | 'recordedBy'>) { H.recordVitals(input) }

  async listAppointments() { return this.db().appointments }
  async bookAppointment(i: Parameters<Repository['bookAppointment']>[0]) { return H.bookAppointment(i) }
  async setAppointmentStatus(id: string, status: AppointmentStatus) { H.setAppointmentStatus(id, status) }

  async saveConsultation(i: Omit<Consultation, 'id' | 'date'>) { return H.saveConsultation(i) }
  async createPrescription(i: { patientId: string; doctorId: string; consultationId?: string; items: Omit<PrescriptionItem, 'id'>[]; notes?: string }) { return H.createPrescription(i) }
  async listPrescriptions() { return this.db().prescriptions }
  async dispensePrescription(id: string) { return H.dispensePrescription(id) }

  async orderLab(i: { patientId: string; doctorId?: string; visitId?: string; testIds: string[] }) { return H.orderLab(i) }
  async listLabOrders() { return this.db().labOrders }
  async listLabSamples() { return this.db().labSamples }
  async collectSample(id: string) { H.collectSample(id) }
  async enterResult(id: string, result: string, flag: LabSample['flag']) { H.enterResult(id, result, flag) }
  async verifyResult(id: string) { H.verifyResult(id) }
  async releaseOrderReport(orderId: string) { H.releaseOrderReport(orderId) }
  async uploadLabReport(): Promise<{ ok: boolean; fileName: string }> { throw new Error('Report upload requires Supabase mode (secure private storage).') }
  async getLabReportUrl(): Promise<{ url: string; fileName?: string; mimeType?: string } | null> { return null }

  async listBills() { return this.db().bills }
  async listBillsForPatient(patientId: string) { return this.db().bills.filter((b) => b.patientId === patientId) }
  async listPayments() { return this.db().payments }
  async createBill(i: { patientId: string; visitId?: string; admissionId?: string; items: Omit<BillItem, 'id' | 'amount'>[]; discountPct: number; taxPct: number }) { return H.createBill(i) }
  async addPayment(i: { billId: string; amount: number; method: Payment['method']; reference?: string }) { return H.addPayment(i) }

  async setBedState(bedId: string, state: BedState) { H.setBedState(bedId, state) }
  async admitPatient(i: { patientId: string; bedId: string; doctorId?: string; reason?: string }) { return H.admitPatient(i) }
  async listAdmissions() { return this.db().admissions }
  async addNursingNote(admissionId: string, note: string) { H.addNursingNote(admissionId, note) }
  async dischargePatient(admissionId: string, summary: string) { H.dischargePatient(admissionId, summary) }
  async listEmergencies() { return this.db().emergencyCases }
  async registerEmergency(i: { name: string; mobile: string; gender: Gender; triage: EmergencyCase['triage']; notes?: string; doctorId?: string }) { return H.registerEmergency(i) }
  async setEmergencyStatus(id: string, status: EmergencyCase['status']) { H.setEmergencyStatus(id, status) }

  async dashboardStats(): Promise<DashboardStats> { return SEL.dashboardStats(this.db()) }
  async revenueTrend(): Promise<TrendPoint[]> { return SEL.last7DaysRevenue(this.db()) }
  async visitsTrend(): Promise<TrendPoint[]> { return SEL.last7DaysVisits(this.db()) }
  async lowStock(): Promise<LowStockRow[]> { return SEL.lowStockMedicines(this.db()).map((x) => ({ name: x.med.name, qty: x.qty, reorderLevel: x.med.reorderLevel })) }
  async frictionMap() { return SEL.frictionMap(this.db()) }
  async listConsultations() { return this.db().consultations }
  async listNotifications() { return this.db().notificationLogs }
  async listAudit() { return this.db().auditLog }

  async listTickets() { return this.db().tickets }
  async createTicket(i: { subject: string; description: string; priority: TicketPriority }): Promise<SupportTicket> {
    const u = useAuth.getState().user
    return useDB.getState().update((d) => {
      const seq = nextSeq(d, 'ticket')
      const t: SupportTicket = { id: ticketId(new Date().getFullYear(), seq), subject: i.subject, description: i.description, priority: i.priority, status: 'open', createdAt: new Date().toISOString(), createdBy: u?.id ?? 'system', history: [{ at: new Date().toISOString(), by: u?.name ?? 'System', note: 'Ticket raised' }] }
      d.tickets.unshift(t)
      return t
    })
  }
  async setTicketStatus(id: string, status: TicketStatus) {
    const u = useAuth.getState().user
    useDB.getState().update((d) => { const t = d.tickets.find((x) => x.id === id); if (t) { t.status = status; t.history.unshift({ at: new Date().toISOString(), by: u?.name ?? 'System', note: `Status → ${status}` }) } })
  }

  async licenseCurrent() { const s = currentStatus(); return { status: s.status, license: s.license, daysLeft: s.daysLeft } }
  async licenseStartTrial() { const h = this.db().hospital; const r = licStartTrial(h.id, h.name); if (!r.ok) throw new Error(r.reason); return { status: r.license.status, license: r.license } }
  async licenseIssue(i: { type: LicenseType; startDate?: string; userLimit?: number; modules?: string[] }) {
    const h = this.db().hospital
    const gen = generateToken({ hospitalId: h.id, hospitalName: h.name, type: i.type, startDate: i.startDate, userLimit: i.userLimit ?? 25, modules: (i.modules as any) ?? ALL_MODULES.map((m) => m.key) })
    const r = activate(gen.token, h.id, 'License Manager')
    if (!r.ok) throw new Error(r.reason)
    return { status: r.license.status, license: r.license }
  }
  async listLicenseActivations() {
    return this.db().licenseActivations.map((a) => ({ id: a.id, key: a.key, hospitalId: a.hospitalId, activatedAt: a.activatedAt, activatedBy: a.activatedBy, result: a.result, reason: a.reason }))
  }
}

function rid() { return Math.random().toString(36).slice(2, 9) }

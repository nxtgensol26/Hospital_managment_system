/**
 * Repository interface — the single seam between UI/services and the backend.
 *   LocalRepository     → in-memory zustand store (DEV/DEMO, VITE_DATA_MODE=local)
 *   SupabaseRepository  → Postgres + RLS + edge functions (VITE_DATA_MODE=supabase)
 * All methods are async so both backends share one shape; swapping backends is a
 * one-line change in ./index.ts and touches no screen.
 */
import type {
  Hospital, Department, Doctor, LabTest, Medicine, MedicineBatch, Ward, Room, Bed,
  Admission, EmergencyCase, Bill, BillItem, Payment, Vitals, Consultation, Prescription,
  PrescriptionItem, LabOrder, LabSample, Appointment, AppointmentStatus, Patient,
  NotificationLog, AuditEntry, SupportTicket, User, NotificationTemplate, BedState, Gender,
  Role, TicketPriority, TicketStatus, LicenseType,
} from '../types'
import type { TimelineEvent } from '../lib/selectors'

export interface RegisterPatientInput {
  name: string; mobile: string; gender: Gender; dob?: string; ageYears?: number
  bloodGroup: Patient['bloodGroup']; address?: string; emergencyContactName?: string
  emergencyContactPhone?: string; allergies?: string; medicalNotes?: string
  idProofType?: string; idProofNumber?: string; provisional?: boolean
  appointment?: { doctorId: string; departmentId?: string; date: string; time: string; type?: 'new' | 'follow_up'; reason?: string }
}
export interface RegisterPatientResult { patient: Patient; loginId: string; tempPassword: string; appointmentId?: string }

export interface PatientRecord {
  patient: Patient
  appointments: Appointment[]
  vitals: Vitals[]
  consultations: Consultation[]
  prescriptions: Prescription[]
  labOrders: LabOrder[]
  labSamples: LabSample[]
  bills: Bill[]
  payments: Payment[]
  admissions: Admission[]
  timeline: TimelineEvent[]
}

export interface MessagingConfigView {
  configured: boolean
  provider: 'sms_horizon' | 'whatsapp' | 'custom' | 'disabled'
  enabled: boolean
  baseUrl?: string
  smsEnabled: boolean
  rcsEnabled: boolean
  whatsappEnabled: boolean
  smsFallbackEnabled: boolean
  providerUser?: string // SMS Horizon account username (non-secret)
  credentialConfigured: boolean
  credentialLast4?: string
  whatsappProvider?: string
  whatsappBaseUrl?: string
  whatsappCredentialConfigured?: boolean
  whatsappLast4?: string
}
export interface SaveMessagingInput {
  provider: MessagingConfigView['provider']
  enabled: boolean
  baseUrl?: string
  smsEnabled: boolean
  rcsEnabled: boolean
  whatsappEnabled: boolean
  smsFallbackEnabled: boolean
  providerUser?: string // SMS Horizon account username (non-secret)
  credential?: string // write-only; omitted keeps existing
  whatsappProvider?: string
  whatsappBaseUrl?: string
  whatsappCredential?: string // write-only
}

export interface DashboardStats {
  patientsTotal: number; opdToday: number; ipdActive: number; emergencyActive: number
  admissionsToday: number; dischargesToday: number; bedsAvailable: number; bedsOccupied: number
  bedsTotal: number; labSamplesPending: number; reportsPending: number; pharmacyQueue: number
  pendingPayments: number; revenueToday: number; lowStock: number
}
export interface TrendPoint { day: string; value: number }
export interface LowStockRow { name: string; qty: number; reorderLevel: number }

export interface Repository {
  readonly mode: 'local' | 'supabase'

  // hospital / reference / catalog
  getHospital(): Promise<Hospital>
  updateHospital(patch: Partial<Hospital>): Promise<void>
  listDepartments(): Promise<Department[]>
  listDoctors(): Promise<Doctor[]>
  listLabTests(): Promise<LabTest[]>
  listMedicines(): Promise<Medicine[]>
  listMedicineBatches(): Promise<MedicineBatch[]>
  listWards(): Promise<Ward[]>
  listRooms(): Promise<Room[]>
  listBeds(): Promise<Bed[]>
  listNotificationTemplates(): Promise<NotificationTemplate[]>
  listUsers(): Promise<User[]>
  addDoctor(input: { name: string; departmentId: string; qualification?: string; consultationFee: number; phone?: string; timings?: string }): Promise<void>
  addLabTest(input: { name: string; code: string; category: string; price: number; sampleType?: string; unit?: string; refRange?: string }): Promise<void>
  addMedicine(input: { name: string; category: string; unit: string; mrp: number; reorderLevel: number }): Promise<void>
  addMedicineBatch(input: { medicineId: string; batchNo: string; expiry: string; quantity: number; purchasePrice: number; supplier?: string }): Promise<void>
  toggleTemplate(key: string, active: boolean): Promise<void>
  createUser(input: { name: string; username: string; role: Role; password: string; email?: string }): Promise<void>

  // messaging gateway (tenant-scoped; credentials never returned)
  getMessagingConfig(): Promise<MessagingConfigView>
  saveMessagingConfig(input: SaveMessagingInput): Promise<MessagingConfigView>
  testMessagingConnection(): Promise<{ ok: boolean; provider?: string; credentialConfigured?: boolean; info?: string }>
  sendTestMessage(input: { to: string; templateKey?: string; vars?: Record<string, string | number | undefined> }): Promise<{ ok: boolean; status?: string; provider?: string; providerMessageId?: string; info?: string }>

  // patients
  listPatients(search?: string): Promise<Patient[]>
  getPatient(id: string): Promise<Patient | null>
  getMyPatient(): Promise<Patient | null>
  getPatientRecord(patientId: string): Promise<PatientRecord | null>
  registerPatient(input: RegisterPatientInput): Promise<RegisterPatientResult>
  updatePatient(id: string, patch: Partial<Patient>): Promise<void>
  recordVitals(input: Omit<Vitals, 'id' | 'recordedAt' | 'recordedBy'>): Promise<void>

  // appointments
  listAppointments(): Promise<Appointment[]>
  bookAppointment(input: { patientId: string; doctorId: string; departmentId: string; date: string; time: string; type: 'new' | 'follow_up'; reason?: string }): Promise<Appointment>
  setAppointmentStatus(id: string, status: AppointmentStatus): Promise<void>

  // clinical
  saveConsultation(input: Omit<Consultation, 'id' | 'date'>): Promise<Consultation>
  createPrescription(input: { patientId: string; doctorId: string; consultationId?: string; items: Omit<PrescriptionItem, 'id'>[]; notes?: string }): Promise<Prescription>
  listPrescriptions(): Promise<Prescription[]>
  dispensePrescription(prescriptionId: string): Promise<boolean>

  // diagnostics
  orderLab(input: { patientId: string; doctorId?: string; visitId?: string; testIds: string[] }): Promise<LabOrder>
  listLabOrders(): Promise<LabOrder[]>
  listLabSamples(): Promise<LabSample[]>
  collectSample(sampleId: string): Promise<void>
  enterResult(sampleId: string, result: string, flag: LabSample['flag']): Promise<void>
  verifyResult(sampleId: string): Promise<void>
  releaseOrderReport(orderId: string): Promise<void>

  // billing
  listBills(): Promise<Bill[]>
  listPayments(): Promise<Payment[]>
  createBill(input: { patientId: string; visitId?: string; admissionId?: string; items: Omit<BillItem, 'id' | 'amount'>[]; discountPct: number; taxPct: number }): Promise<Bill>
  addPayment(input: { billId: string; amount: number; method: Payment['method']; reference?: string }): Promise<Payment>

  // beds / ipd / emergency
  setBedState(bedId: string, state: BedState): Promise<void>
  admitPatient(input: { patientId: string; bedId: string; doctorId?: string; reason?: string }): Promise<Admission>
  listAdmissions(): Promise<Admission[]>
  addNursingNote(admissionId: string, note: string): Promise<void>
  dischargePatient(admissionId: string, summary: string): Promise<void>
  listEmergencies(): Promise<EmergencyCase[]>
  registerEmergency(input: { name: string; mobile: string; gender: Gender; triage: EmergencyCase['triage']; notes?: string; doctorId?: string }): Promise<{ case: EmergencyCase; patient: Patient }>
  setEmergencyStatus(id: string, status: EmergencyCase['status']): Promise<void>

  // insights
  dashboardStats(): Promise<DashboardStats>
  revenueTrend(): Promise<TrendPoint[]>
  visitsTrend(): Promise<TrendPoint[]>
  lowStock(): Promise<LowStockRow[]>
  frictionMap(): Promise<{ label: string; avgMin: number | null; samples: number }[]>
  listConsultations(): Promise<Consultation[]>
  listNotifications(): Promise<NotificationLog[]>
  listAudit(): Promise<AuditEntry[]>

  // support
  listTickets(): Promise<SupportTicket[]>
  createTicket(input: { subject: string; description: string; priority: TicketPriority }): Promise<SupportTicket>
  setTicketStatus(id: string, status: TicketStatus): Promise<void>

  // licensing
  licenseCurrent(): Promise<{ status: string; license: any | null; daysLeft?: number | null }>
  licenseStartTrial(): Promise<{ status: string; license: any }>
  licenseIssue(input: { type: LicenseType; startDate?: string; userLimit?: number; modules?: string[] }): Promise<{ status: string; license: any }>
  listLicenseActivations(): Promise<{ id: string; key: string; hospitalId: string; activatedAt: string; activatedBy: string; result: string; reason?: string }[]>
}

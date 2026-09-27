import type { ModuleKey } from './config'

/* ------------------------------------------------------------------ *
 *  Domain types — mirror the normalized DB entities described in the
 *  product brief. Every table maps to a type here; the repository layer
 *  (lib/db.ts) is the single place that reads/writes them, so swapping
 *  localStorage for a REST/GraphQL backend touches only that layer.
 * ------------------------------------------------------------------ */

export type ID = string
export type ISODate = string // yyyy-mm-dd
export type ISODateTime = string // full ISO timestamp

/* -------------------------- RBAC -------------------------- */

export type Role =
  | 'super_admin'
  | 'hospital_admin'
  | 'receptionist'
  | 'doctor'
  | 'nurse'
  | 'lab_technician'
  | 'lab_manager'
  | 'pharmacist'
  | 'billing_staff'
  | 'inventory_manager'
  | 'patient'

export interface User {
  id: ID
  name: string
  username: string
  email?: string
  phone?: string
  role: Role
  hospitalId?: string // supabase: the user's hospital (from profile)
  /** For doctors — links to a Doctor record */
  doctorId?: ID
  /** For patients — links to Patient record */
  patientId?: ID
  passwordHash: string
  mustChangePassword?: boolean
  active: boolean
  createdAt: ISODateTime
  lastLoginAt?: ISODateTime
}

/* -------------------------- Licensing -------------------------- */

export type LicenseType = 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'LIFETIME'
export type LicenseStatus = 'active' | 'trial' | 'expired' | 'invalid' | 'unlicensed'

export interface LicensePayload {
  product: 'NxtHealth'
  hospitalId: string
  hospitalName: string
  type: LicenseType
  startDate: ISODate
  expiryDate: ISODate | 'LIFETIME'
  userLimit: number
  modules: ModuleKey[]
  issuedBy: string
  issuedAt: ISODateTime
}

/** A license as stored/verified locally. `signature` is produced by the
 * (currently mock) signer and is what a production backend would verify
 * with the NxtGenSol public key. */
export interface License extends LicensePayload {
  key: string
  signature: string
  status: LicenseStatus
}

export interface LicenseActivationRecord {
  id: ID
  key: string
  hospitalId: string
  activatedAt: ISODateTime
  activatedBy: string
  result: 'success' | 'failed'
  reason?: string
}

/* -------------------------- Hospital / setup -------------------------- */

export interface Hospital {
  id: string
  name: string
  address: string
  city?: string
  phone?: string
  email?: string
  logoDataUrl?: string
  gstNumber?: string
  registrationNo?: string
}

export interface Department {
  id: ID
  name: string
  code: string
  active: boolean
}

export interface Doctor {
  id: ID
  name: string
  departmentId: ID
  qualification: string
  regNo?: string
  consultationFee: number
  phone?: string
  email?: string
  timings?: string
  active: boolean
}

/* -------------------------- Patients -------------------------- */

export type Gender = 'male' | 'female' | 'other'
export type BloodGroup = 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-' | 'O+' | 'O-' | 'unknown'

export interface Patient {
  id: ID // local: NH-000001; supabase: uuid PK (see `code` for the human ID)
  code?: string // supabase: patient_code (NH-000001)
  name: string
  mobile: string
  gender: Gender
  dob?: ISODate
  ageYears?: number
  bloodGroup: BloodGroup
  address?: string
  emergencyContactName?: string
  emergencyContactPhone?: string
  allergies?: string
  medicalNotes?: string
  idProofType?: string
  idProofNumber?: string
  registeredAt: ISODateTime
  createdBy: ID
  /** true if created via emergency quick-register and not yet completed */
  provisional?: boolean
}

export interface PatientCredential {
  patientId: ID
  loginId: string
  tempPassword?: string
  passwordChanged: boolean
}

/* -------------------------- Visits / appointments -------------------------- */

export type VisitType = 'opd' | 'ipd' | 'emergency'
export type AppointmentStatus =
  | 'booked'
  | 'confirmed'
  | 'checked_in'
  | 'in_consultation'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export interface Appointment {
  id: ID // local: APT-000123; supabase: uuid (see `code`)
  code?: string
  patientId: ID
  doctorId: ID
  departmentId: ID
  date: ISODate
  time: string
  type: 'new' | 'follow_up'
  reason?: string
  status: AppointmentStatus
  createdAt: ISODateTime
}

export interface Visit {
  id: ID
  patientId: ID
  doctorId?: ID
  departmentId?: ID
  type: VisitType
  appointmentId?: ID
  status: 'waiting' | 'in_consultation' | 'completed' | 'admitted' | 'discharged'
  /** Friction / flow timestamps keyed by stage */
  stageTimes: Partial<Record<FlowStage, ISODateTime>>
  createdAt: ISODateTime
}

export type FlowStage =
  | 'registration'
  | 'appointment'
  | 'checkin'
  | 'consultation_start'
  | 'consultation_end'
  | 'lab_ordered'
  | 'lab_collected'
  | 'lab_reported'
  | 'billing'
  | 'pharmacy'
  | 'discharge'

export interface Vitals {
  id: ID
  patientId: ID
  visitId?: ID
  recordedAt: ISODateTime
  recordedBy: ID
  bpSystolic?: number
  bpDiastolic?: number
  pulse?: number
  tempF?: number
  spo2?: number
  weightKg?: number
  heightCm?: number
  respRate?: number
}

/* -------------------------- Clinical -------------------------- */

export interface Consultation {
  id: ID
  visitId: ID
  patientId: ID
  doctorId: ID
  date: ISODateTime
  complaints?: string
  examination?: string
  diagnosis?: string
  advice?: string
  followUpDate?: ISODate
}

export interface Prescription {
  id: ID // local: RX-000123; supabase: uuid (see `code`)
  code?: string
  consultationId?: ID
  patientId: ID
  doctorId: ID
  createdAt: ISODateTime
  items: PrescriptionItem[]
  status: 'created' | 'sent_to_pharmacy' | 'dispensed'
  notes?: string
}

export interface PrescriptionItem {
  id: ID
  medicineName: string
  medicineId?: ID
  dosage: string // e.g. 500mg
  frequency: string // e.g. 1-0-1
  duration: string // e.g. 5 days
  instructions?: string
  quantity: number
}

/* -------------------------- Diagnostics -------------------------- */

export interface LabTest {
  id: ID
  name: string
  code: string
  category: string
  price: number
  sampleType: string
  unit?: string
  refRange?: string
  active: boolean
}

export type LabOrderStatus = 'ordered' | 'partially_reported' | 'reported' | 'cancelled'
export type SampleStatus =
  | 'pending'
  | 'collected'
  | 'processing'
  | 'completed'
  | 'verified'
  | 'released'

export interface LabOrder {
  id: ID // local: LAB-000123; supabase: uuid (see `code`)
  code?: string
  patientId: ID
  doctorId?: ID
  visitId?: ID
  createdAt: ISODateTime
  status: LabOrderStatus
  testIds: ID[]
  hasReport?: boolean            // an uploaded report file is attached
  reportFileName?: string
  reportMimeType?: string
  reportUploadedAt?: ISODateTime
}

export interface LabSample {
  id: ID // local: S-000123; supabase: uuid (see `code`)
  code?: string
  orderId: ID
  patientId: ID
  testId: ID
  status: SampleStatus
  collectedAt?: ISODateTime
  collectedBy?: ID
  processedAt?: ISODateTime
  result?: string
  resultUnit?: string
  refRange?: string
  flag?: 'normal' | 'high' | 'low' | 'critical'
  enteredBy?: ID
  verifiedAt?: ISODateTime
  verifiedBy?: ID
  releasedAt?: ISODateTime
}

/* -------------------------- Pharmacy -------------------------- */

export interface Medicine {
  id: ID
  name: string
  category: string
  unit: string
  mrp: number
  reorderLevel: number
  active: boolean
}

export interface MedicineBatch {
  id: ID
  medicineId: ID
  batchNo: string
  expiry: ISODate
  quantity: number
  purchasePrice: number
  supplier?: string
  receivedAt: ISODateTime
}

export interface DispenseRecord {
  id: ID
  prescriptionId?: ID
  patientId: ID
  dispensedAt: ISODateTime
  dispensedBy: ID
  items: { medicineId: ID; medicineName: string; batchNo: string; quantity: number; price: number }[]
  total: number
}

/* -------------------------- Beds / IPD -------------------------- */

export type BedState =
  | 'available'
  | 'reserved'
  | 'assigned'
  | 'occupied'
  | 'discharge_pending'
  | 'cleaning'
  | 'inspection'

export interface Ward {
  id: ID
  name: string
  type: string
}

export interface Room {
  id: ID
  wardId: ID
  number: string
}

export interface Bed {
  id: ID
  roomId: ID
  wardId: ID
  label: string
  state: BedState
  chargePerDay: number
  patientId?: ID
  admissionId?: ID
}

export interface Admission {
  id: ID // local: IPD-000123; supabase: uuid (see `code`)
  code?: string
  patientId: ID
  bedId?: ID
  wardId?: ID
  doctorId?: ID
  admittedAt: ISODateTime
  reason?: string
  status: 'admitted' | 'discharge_pending' | 'discharged'
  dischargedAt?: ISODateTime
  dischargeSummary?: string
  nursingNotes?: { at: ISODateTime; by: ID; note: string }[]
}

/* -------------------------- Emergency -------------------------- */

export interface EmergencyCase {
  id: ID // local: ER-000123; supabase: uuid (see `code`)
  code?: string
  patientId: ID
  arrivalTime: ISODateTime
  triage: 'critical' | 'urgent' | 'stable'
  notes?: string
  doctorId?: ID
  bedId?: ID
  status: 'active' | 'admitted' | 'discharged' | 'referred'
}

/* -------------------------- Billing -------------------------- */

export type BillItemKind =
  | 'consultation'
  | 'diagnostics'
  | 'imaging'
  | 'pharmacy'
  | 'admission'
  | 'procedure'
  | 'room'
  | 'other'

export interface BillItem {
  id: ID
  kind: BillItemKind
  description: string
  qty: number
  unitPrice: number
  amount: number
}

export interface Bill {
  id: ID // local: INV-000123; supabase: uuid (see `code`)
  code?: string
  patientId: ID
  visitId?: ID
  admissionId?: ID
  createdAt: ISODateTime
  createdBy: ID
  items: BillItem[]
  discountPct: number
  taxPct: number
  subtotal: number
  discountAmt: number
  taxAmt: number
  total: number
  paid: number
  status: 'draft' | 'unpaid' | 'partial' | 'paid'
}

export interface Payment {
  id: ID
  billId: ID
  patientId: ID
  amount: number
  method: 'cash' | 'card' | 'upi' | 'insurance' | 'other'
  at: ISODateTime
  receivedBy: ID
  reference?: string
}

/* -------------------------- Notifications -------------------------- */

export type NotificationTemplateKey =
  | 'registration'
  | 'appt_confirm'
  | 'appt_reminder'
  | 'appt_cancel'
  | 'lab_collected'
  | 'lab_ready'
  | 'prescription_ready'
  | 'bill_generated'
  | 'payment_receipt'
  | 'followup_reminder'
  | 'discharge'

export interface NotificationTemplate {
  key: NotificationTemplateKey
  templateId: string // approved DLT/RCS template ID
  channel: 'sms' | 'rcs' | 'whatsapp'
  label: string
  body: string // with {{placeholders}}
  active: boolean
}

export interface NotificationLog {
  id: ID
  patientId?: ID
  to: string
  templateKey: NotificationTemplateKey
  channel: 'sms' | 'rcs' | 'whatsapp'
  provider: string
  status: 'sent' | 'delivered' | 'failed' | 'fallback'
  message: string
  at: ISODateTime
}

/* -------------------------- Audit + Support -------------------------- */

export interface AuditEntry {
  id: ID
  at: ISODateTime
  actorId: ID
  actorName: string
  actorRole: Role
  action: string
  entity: string
  entityId?: ID
  detail?: string
}

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical'
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export interface SupportTicket {
  id: ID // local: NXH-2026-000001; supabase: uuid (see `code`)
  code?: string
  subject: string
  description: string
  priority: TicketPriority
  status: TicketStatus
  createdAt: ISODateTime
  createdBy: ID
  history: { at: ISODateTime; by: string; note: string }[]
}

/* -------------------------- Root DB shape -------------------------- */

export interface Database {
  meta: { seededAt: ISODateTime; schemaVersion: number }
  hospital: Hospital
  license: License | null
  trialUsedHospitalIds: string[]
  licenseActivations: LicenseActivationRecord[]
  users: User[]
  departments: Department[]
  doctors: Doctor[]
  patients: Patient[]
  patientCredentials: PatientCredential[]
  appointments: Appointment[]
  visits: Visit[]
  vitals: Vitals[]
  consultations: Consultation[]
  prescriptions: Prescription[]
  labTests: LabTest[]
  labOrders: LabOrder[]
  labSamples: LabSample[]
  medicines: Medicine[]
  medicineBatches: MedicineBatch[]
  dispenses: DispenseRecord[]
  wards: Ward[]
  rooms: Room[]
  beds: Bed[]
  admissions: Admission[]
  emergencyCases: EmergencyCase[]
  bills: Bill[]
  payments: Payment[]
  notificationTemplates: NotificationTemplate[]
  notificationLogs: NotificationLog[]
  auditLog: AuditEntry[]
  tickets: SupportTicket[]
  counters: Record<string, number>
}

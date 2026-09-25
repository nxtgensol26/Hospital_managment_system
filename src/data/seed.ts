import type {
  Database,
  Department,
  Doctor,
  User,
  LabTest,
  Medicine,
  MedicineBatch,
  Ward,
  Room,
  Bed,
  NotificationTemplate,
  Patient,
  PatientCredential,
} from '../types'
import { hashPassword } from '../lib/crypto'
import { patientId } from '../lib/format'

const now = () => new Date().toISOString()
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString()

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

export function buildSeed(): Database {
  const departments: Department[] = [
    { id: 'dep_gm', name: 'General Medicine', code: 'GM', active: true },
    { id: 'dep_card', name: 'Cardiology', code: 'CARD', active: true },
    { id: 'dep_ortho', name: 'Orthopedics', code: 'ORTHO', active: true },
    { id: 'dep_paed', name: 'Pediatrics', code: 'PAED', active: true },
    { id: 'dep_gyn', name: 'Gynaecology', code: 'GYN', active: true },
    { id: 'dep_ent', name: 'ENT', code: 'ENT', active: true },
    { id: 'dep_derma', name: 'Dermatology', code: 'DERMA', active: true },
    { id: 'dep_emer', name: 'Emergency', code: 'EMER', active: true },
  ]

  const doctors: Doctor[] = [
    { id: 'doc_mehta', name: 'Dr. Anil Mehta', departmentId: 'dep_gm', qualification: 'MBBS, MD', regNo: 'MH-45123', consultationFee: 400, timings: 'Mon–Sat 9:00–14:00', phone: '9820011122', active: true },
    { id: 'doc_rao', name: 'Dr. Priya Rao', departmentId: 'dep_card', qualification: 'MBBS, DM (Cardiology)', regNo: 'MH-51288', consultationFee: 800, timings: 'Mon–Fri 10:00–16:00', phone: '9820033344', active: true },
    { id: 'doc_khan', name: 'Dr. Sameer Khan', departmentId: 'dep_ortho', qualification: 'MBBS, MS (Ortho)', regNo: 'MH-49871', consultationFee: 600, timings: 'Tue–Sat 11:00–17:00', phone: '9820055566', active: true },
    { id: 'doc_iyer', name: 'Dr. Meera Iyer', departmentId: 'dep_paed', qualification: 'MBBS, DCH', regNo: 'MH-52099', consultationFee: 450, timings: 'Mon–Sat 9:30–13:30', phone: '9820077788', active: true },
    { id: 'doc_deshmukh', name: 'Dr. Rahul Deshmukh', departmentId: 'dep_emer', qualification: 'MBBS, EM', regNo: 'MH-53410', consultationFee: 500, timings: '24×7 Rotational', phone: '9820099900', active: true },
  ]

  const users: User[] = [
    mkUser('u_super', 'System Owner', 'superadmin', 'super_admin', 'admin123'),
    mkUser('u_admin', 'Hospital Administrator', 'admin', 'hospital_admin', 'admin123'),
    { ...mkUser('u_mehta', 'Dr. Anil Mehta', 'dr.mehta', 'doctor', 'doctor123'), doctorId: 'doc_mehta' },
    { ...mkUser('u_rao', 'Dr. Priya Rao', 'dr.rao', 'doctor', 'doctor123'), doctorId: 'doc_rao' },
    mkUser('u_reception', 'Front Desk', 'reception', 'receptionist', 'recep123'),
    mkUser('u_nurse', 'Nurse Station', 'nurse', 'nurse', 'nurse123'),
    mkUser('u_labtech', 'Lab Technician', 'labtech', 'lab_technician', 'lab123'),
    mkUser('u_labmgr', 'Lab Manager', 'labmgr', 'lab_manager', 'lab123'),
    mkUser('u_pharma', 'Pharmacist', 'pharma', 'pharmacist', 'pharma123'),
    mkUser('u_billing', 'Billing Desk', 'billing', 'billing_staff', 'bill123'),
    mkUser('u_inventory', 'Inventory Manager', 'inventory', 'inventory_manager', 'inv123'),
  ]

  const labTests: LabTest[] = [
    { id: 'lt_cbc', name: 'Complete Blood Count (CBC)', code: 'CBC', category: 'Haematology', price: 350, sampleType: 'Blood (EDTA)', unit: '', refRange: 'See panel', active: true },
    { id: 'lt_hb', name: 'Haemoglobin', code: 'HB', category: 'Haematology', price: 120, sampleType: 'Blood', unit: 'g/dL', refRange: '13–17', active: true },
    { id: 'lt_fbs', name: 'Fasting Blood Sugar', code: 'FBS', category: 'Biochemistry', price: 90, sampleType: 'Serum', unit: 'mg/dL', refRange: '70–100', active: true },
    { id: 'lt_ppbs', name: 'Post Prandial Blood Sugar', code: 'PPBS', category: 'Biochemistry', price: 90, sampleType: 'Serum', unit: 'mg/dL', refRange: '<140', active: true },
    { id: 'lt_lipid', name: 'Lipid Profile', code: 'LIPID', category: 'Biochemistry', price: 650, sampleType: 'Serum', unit: 'mg/dL', refRange: 'See panel', active: true },
    { id: 'lt_tsh', name: 'Thyroid (TSH)', code: 'TSH', category: 'Endocrinology', price: 300, sampleType: 'Serum', unit: 'µIU/mL', refRange: '0.4–4.0', active: true },
    { id: 'lt_lft', name: 'Liver Function Test', code: 'LFT', category: 'Biochemistry', price: 700, sampleType: 'Serum', unit: '', refRange: 'See panel', active: true },
    { id: 'lt_kft', name: 'Kidney Function Test', code: 'KFT', category: 'Biochemistry', price: 700, sampleType: 'Serum', unit: '', refRange: 'See panel', active: true },
    { id: 'lt_urine', name: 'Urine Routine', code: 'URINE', category: 'Pathology', price: 150, sampleType: 'Urine', unit: '', refRange: 'See panel', active: true },
    { id: 'lt_creat', name: 'Serum Creatinine', code: 'CREAT', category: 'Biochemistry', price: 180, sampleType: 'Serum', unit: 'mg/dL', refRange: '0.7–1.3', active: true },
  ]

  const medicines: Medicine[] = [
    { id: 'med_para', name: 'Paracetamol 500mg', category: 'Analgesic', unit: 'Tablet', mrp: 2, reorderLevel: 200, active: true },
    { id: 'med_amox', name: 'Amoxicillin 500mg', category: 'Antibiotic', unit: 'Capsule', mrp: 6, reorderLevel: 150, active: true },
    { id: 'med_azith', name: 'Azithromycin 500mg', category: 'Antibiotic', unit: 'Tablet', mrp: 14, reorderLevel: 100, active: true },
    { id: 'med_panto', name: 'Pantoprazole 40mg', category: 'Antacid', unit: 'Tablet', mrp: 5, reorderLevel: 120, active: true },
    { id: 'med_ceti', name: 'Cetirizine 10mg', category: 'Antihistamine', unit: 'Tablet', mrp: 2, reorderLevel: 100, active: true },
    { id: 'med_metf', name: 'Metformin 500mg', category: 'Antidiabetic', unit: 'Tablet', mrp: 3, reorderLevel: 200, active: true },
    { id: 'med_amlo', name: 'Amlodipine 5mg', category: 'Antihypertensive', unit: 'Tablet', mrp: 3, reorderLevel: 150, active: true },
    { id: 'med_ors', name: 'ORS Sachet', category: 'Electrolyte', unit: 'Sachet', mrp: 18, reorderLevel: 60, active: true },
  ]

  const medicineBatches: MedicineBatch[] = [
    mkBatch('med_para', 'PAR2401', 60, 1200, 1.1),
    mkBatch('med_amox', 'AMX2312', 40, 400, 3.5),
    mkBatch('med_azith', 'AZI2405', 90, 250, 9),
    mkBatch('med_panto', 'PAN2402', 120, 600, 2.8),
    mkBatch('med_ceti', 'CET2311', 15, 80, 1.0), // near-expiry + low stock -> triggers alerts
    mkBatch('med_metf', 'MET2404', 200, 900, 1.6),
    mkBatch('med_amlo', 'AML2403', 150, 700, 1.4),
    mkBatch('med_ors', 'ORS2312', 30, 40, 11),
  ]

  const wards: Ward[] = [
    { id: 'ward_gen', name: 'General Ward', type: 'General' },
    { id: 'ward_pvt', name: 'Private Rooms', type: 'Private' },
    { id: 'ward_icu', name: 'ICU', type: 'Critical' },
  ]
  const rooms: Room[] = [
    { id: 'room_g1', wardId: 'ward_gen', number: 'G-101' },
    { id: 'room_g2', wardId: 'ward_gen', number: 'G-102' },
    { id: 'room_p1', wardId: 'ward_pvt', number: 'P-201' },
    { id: 'room_i1', wardId: 'ward_icu', number: 'ICU-1' },
  ]
  const beds: Bed[] = [
    mkBed('bed_g1a', 'room_g1', 'ward_gen', 'G-101-A', 1500),
    mkBed('bed_g1b', 'room_g1', 'ward_gen', 'G-101-B', 1500),
    mkBed('bed_g2a', 'room_g2', 'ward_gen', 'G-102-A', 1500),
    mkBed('bed_g2b', 'room_g2', 'ward_gen', 'G-102-B', 1500),
    mkBed('bed_p1', 'room_p1', 'ward_pvt', 'P-201', 4500),
    mkBed('bed_i1a', 'room_i1', 'ward_icu', 'ICU-1-A', 9000),
    mkBed('bed_i1b', 'room_i1', 'ward_icu', 'ICU-1-B', 9000),
  ]

  const notificationTemplates: NotificationTemplate[] = [
    tpl('registration', 'NXH_REG_001', 'rcs', 'Registration welcome', 'Welcome to {{hospital}}, {{name}}. Your Patient ID is {{patientId}}. Portal login: {{loginId}} / {{tempPass}}. — NxtHealth'),
    tpl('appt_confirm', 'NXH_APPT_001', 'rcs', 'Appointment confirmed', 'Hi {{name}}, your appointment {{apptId}} with {{doctor}} is confirmed for {{date}} {{time}} at {{hospital}}.'),
    tpl('appt_reminder', 'NXH_APPT_002', 'rcs', 'Appointment reminder', 'Reminder: appointment {{apptId}} with {{doctor}} on {{date}} {{time}}. — {{hospital}}'),
    tpl('appt_cancel', 'NXH_APPT_003', 'sms', 'Appointment cancelled', 'Your appointment {{apptId}} on {{date}} has been cancelled. Call us to rebook. — {{hospital}}'),
    tpl('lab_collected', 'NXH_LAB_001', 'sms', 'Sample collected', 'Hi {{name}}, your lab sample {{sampleId}} has been collected. Report will be ready soon. — {{hospital}}'),
    tpl('lab_ready', 'NXH_LAB_002', 'rcs', 'Lab report ready', 'Hi {{name}}, your lab report for order {{orderId}} is ready. View it on the NxtHealth patient portal.'),
    tpl('prescription_ready', 'NXH_RX_001', 'rcs', 'Prescription ready', 'Hi {{name}}, prescription {{rxId}} from {{doctor}} is ready. Collect at pharmacy or view on portal.'),
    tpl('bill_generated', 'NXH_BILL_001', 'sms', 'Bill generated', 'Bill {{invId}} of {{amount}} generated at {{hospital}}. View on the NxtHealth portal.'),
    tpl('payment_receipt', 'NXH_PAY_001', 'sms', 'Payment received', 'Payment of {{amount}} received against {{invId}}. Thank you. — {{hospital}}'),
    tpl('followup_reminder', 'NXH_FUP_001', 'rcs', 'Follow-up reminder', 'Hi {{name}}, follow-up with {{doctor}} is due on {{date}}. Book on the NxtHealth portal.'),
    tpl('discharge', 'NXH_DIS_001', 'rcs', 'Discharge', 'Hi {{name}}, your discharge from {{hospital}} is complete. Discharge summary is available on the portal.'),
  ]

  // A couple of demo patients so the app is not empty on first run.
  const patients: Patient[] = [
    mkPatient(1, 'Ramesh Kulkarni', '9822011111', 'male', '1968-04-12', 'B+', 'Pune', 'Hypertension; on Amlodipine.', 'Penicillin'),
    mkPatient(2, 'Sunita Sharma', '9822022222', 'female', '1985-09-03', 'O+', 'Mumbai', '', ''),
    mkPatient(3, 'Aarav Patil', '9822033333', 'male', '2018-01-20', 'A+', 'Nashik', 'Recurrent tonsillitis.', ''),
  ]
  const patientCredentials: PatientCredential[] = patients.map((p) => ({
    patientId: p.id,
    loginId: p.id,
    tempPassword: 'Nxt-demo1',
    passwordChanged: false,
  }))

  return {
    meta: { seededAt: now(), schemaVersion: 1 },
    hospital: {
      id: 'HOSP-DEMO',
      name: 'NxtHealth Demo Hospital',
      address: '2nd Floor, Med-Tech Park, Baner Road',
      city: 'Pune, Maharashtra',
      phone: '020-4000-1234',
      email: 'contact@demohospital.in',
      registrationNo: 'MH/HOSP/2021/00987',
    },
    license: null,
    trialUsedHospitalIds: [],
    licenseActivations: [],
    users,
    departments,
    doctors,
    patients,
    patientCredentials,
    appointments: [],
    visits: [],
    vitals: [],
    consultations: [],
    prescriptions: [],
    labTests,
    labOrders: [],
    labSamples: [],
    medicines,
    medicineBatches,
    dispenses: [],
    wards,
    rooms,
    beds,
    admissions: [],
    emergencyCases: [],
    bills: [],
    payments: [],
    notificationTemplates,
    notificationLogs: [],
    auditLog: [],
    tickets: [],
    counters: { patient: patients.length, appt: 0, visit: 0, rx: 0, labOrder: 0, sample: 0, admission: 0, er: 0, invoice: 0, ticket: 0 },
  }

  // ---- local builders ----
  function mkUser(id: string, name: string, username: string, role: User['role'], pass: string): User {
    return {
      id,
      name,
      username,
      role,
      passwordHash: hashPassword(pass),
      active: true,
      createdAt: daysAgo(120),
      email: `${username}@demohospital.in`,
    }
  }
  function mkBatch(medicineId: string, batchNo: string, quantity: number, _q: number, purchasePrice: number): MedicineBatch {
    // near-expiry for CET batch to demo expiry alerts
    const expiryDays = batchNo.startsWith('CET') ? 25 : 300 + Math.floor(Math.random() * 300)
    return {
      id: uid('batch'),
      medicineId,
      batchNo,
      quantity,
      purchasePrice,
      supplier: 'MediSupply Distributors',
      receivedAt: daysAgo(40),
      expiry: new Date(Date.now() + expiryDays * 86400000).toISOString().slice(0, 10),
    }
  }
  function mkBed(id: string, roomId: string, wardId: string, label: string, chargePerDay: number): Bed {
    return { id, roomId, wardId, label, chargePerDay, state: 'available' }
  }
  function tpl(key: NotificationTemplate['key'], templateId: string, channel: NotificationTemplate['channel'], label: string, body: string): NotificationTemplate {
    return { key, templateId, channel, label, body, active: true }
  }
  function mkPatient(seq: number, name: string, mobile: string, gender: Patient['gender'], dob: string, bg: Patient['bloodGroup'], city: string, notes: string, allergies: string): Patient {
    return {
      id: patientId(seq),
      name,
      mobile,
      gender,
      dob,
      bloodGroup: bg,
      address: city,
      medicalNotes: notes,
      allergies,
      emergencyContactName: 'Family Contact',
      emergencyContactPhone: mobile,
      registeredAt: daysAgo(30 - seq),
      createdBy: 'u_reception',
    }
  }
}

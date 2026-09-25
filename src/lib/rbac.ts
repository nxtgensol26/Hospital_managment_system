import type { Role } from '../types'

/** Fine-grained permissions. Each role is granted only what it needs. */
export type Permission =
  | 'dashboard.view'
  | 'patients.view'
  | 'patients.create'
  | 'patients.edit'
  | 'appointments.view'
  | 'appointments.manage'
  | 'consultation.write'
  | 'vitals.write'
  | 'lab.orders.view'
  | 'lab.collect'
  | 'lab.result'
  | 'lab.verify'
  | 'lab.release'
  | 'lab.master'
  | 'pharmacy.view'
  | 'pharmacy.dispense'
  | 'pharmacy.inventory'
  | 'billing.view'
  | 'billing.manage'
  | 'beds.view'
  | 'beds.manage'
  | 'ipd.manage'
  | 'emergency.manage'
  | 'reports.view'
  | 'audit.view'
  | 'admin.settings'
  | 'admin.users'
  | 'license.manage'
  | 'support.manage'
  | 'portal.self'

const ALL: Permission[] = [
  'dashboard.view', 'patients.view', 'patients.create', 'patients.edit',
  'appointments.view', 'appointments.manage', 'consultation.write', 'vitals.write',
  'lab.orders.view', 'lab.collect', 'lab.result', 'lab.verify', 'lab.release', 'lab.master',
  'pharmacy.view', 'pharmacy.dispense', 'pharmacy.inventory',
  'billing.view', 'billing.manage', 'beds.view', 'beds.manage', 'ipd.manage',
  'emergency.manage', 'reports.view', 'audit.view', 'admin.settings', 'admin.users',
  'license.manage', 'support.manage', 'portal.self',
]

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: ALL,
  hospital_admin: [
    'dashboard.view', 'patients.view', 'patients.create', 'patients.edit',
    'appointments.view', 'appointments.manage', 'lab.orders.view', 'lab.master',
    'pharmacy.view', 'pharmacy.inventory', 'billing.view', 'billing.manage',
    'beds.view', 'beds.manage', 'ipd.manage', 'emergency.manage', 'reports.view',
    'audit.view', 'admin.settings', 'admin.users', 'license.manage', 'support.manage',
  ],
  receptionist: [
    'dashboard.view', 'patients.view', 'patients.create', 'patients.edit',
    'appointments.view', 'appointments.manage', 'beds.view', 'emergency.manage',
    'billing.view', 'support.manage',
  ],
  doctor: [
    'dashboard.view', 'patients.view', 'appointments.view', 'appointments.manage',
    'consultation.write', 'vitals.write', 'lab.orders.view', 'pharmacy.view',
    'beds.view', 'ipd.manage', 'reports.view',
  ],
  nurse: [
    'dashboard.view', 'patients.view', 'vitals.write', 'appointments.view',
    'beds.view', 'beds.manage', 'ipd.manage', 'lab.collect', 'emergency.manage',
  ],
  lab_technician: [
    'dashboard.view', 'patients.view', 'lab.orders.view', 'lab.collect', 'lab.result',
  ],
  lab_manager: [
    'dashboard.view', 'patients.view', 'lab.orders.view', 'lab.collect', 'lab.result',
    'lab.verify', 'lab.release', 'lab.master', 'reports.view',
  ],
  pharmacist: [
    'dashboard.view', 'patients.view', 'pharmacy.view', 'pharmacy.dispense', 'pharmacy.inventory',
  ],
  billing_staff: [
    'dashboard.view', 'patients.view', 'billing.view', 'billing.manage', 'appointments.view',
  ],
  inventory_manager: [
    'dashboard.view', 'pharmacy.view', 'pharmacy.inventory',
  ],
  patient: ['portal.self'],
}

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: 'Super Admin',
  hospital_admin: 'Hospital Admin',
  receptionist: 'Receptionist',
  doctor: 'Doctor',
  nurse: 'Nurse',
  lab_technician: 'Lab Technician',
  lab_manager: 'Lab Manager',
  pharmacist: 'Pharmacist',
  billing_staff: 'Billing Staff',
  inventory_manager: 'Inventory Manager',
  patient: 'Patient',
}

export function roleCan(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

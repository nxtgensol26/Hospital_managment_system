import {
  LayoutDashboard, Users, CalendarDays, Stethoscope, FlaskConical, Pill,
  ReceiptText, BedDouble, Siren, BarChart3, ScrollText, Settings, KeyRound,
  LifeBuoy, BellRing, ClipboardList,
} from 'lucide-react'
import type { Permission } from '../../lib/rbac'
import type { ModuleKey } from '../../config'

export interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  perm?: Permission
  module?: ModuleKey
}
export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { to: '/dashboard', label: 'Control Room', icon: LayoutDashboard, perm: 'dashboard.view' },
    ],
  },
  {
    title: 'Front Office',
    items: [
      { to: '/patients', label: 'Patients', icon: Users, perm: 'patients.view' },
      { to: '/appointments', label: 'Appointments', icon: CalendarDays, perm: 'appointments.view', module: 'appointments' },
      { to: '/queue', label: 'OPD Queue', icon: ClipboardList, perm: 'appointments.view', module: 'opd' },
      { to: '/emergency', label: 'Emergency', icon: Siren, perm: 'emergency.manage', module: 'emergency' },
    ],
  },
  {
    title: 'Clinical',
    items: [
      { to: '/consultations', label: 'Consultations', icon: Stethoscope, perm: 'consultation.write', module: 'opd' },
      { to: '/lab', label: 'Diagnostics / Lab', icon: FlaskConical, perm: 'lab.orders.view', module: 'diagnostics' },
      { to: '/pharmacy', label: 'Pharmacy', icon: Pill, perm: 'pharmacy.view', module: 'pharmacy' },
    ],
  },
  {
    title: 'Inpatient',
    items: [
      { to: '/beds', label: 'Bed Management', icon: BedDouble, perm: 'beds.view', module: 'beds' },
      { to: '/ipd', label: 'IPD / Admissions', icon: BedDouble, perm: 'ipd.manage', module: 'ipd' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { to: '/billing', label: 'Billing', icon: ReceiptText, perm: 'billing.view', module: 'billing' },
    ],
  },
  {
    title: 'Insights',
    items: [
      { to: '/reports', label: 'Reports & Flow', icon: BarChart3, perm: 'reports.view', module: 'reports' },
      { to: '/notifications', label: 'Notifications', icon: BellRing, perm: 'dashboard.view' },
      { to: '/audit', label: 'Audit Log', icon: ScrollText, perm: 'audit.view' },
    ],
  },
  {
    title: 'Administration',
    items: [
      { to: '/admin', label: 'Settings', icon: Settings, perm: 'admin.settings', module: 'admin' },
      { to: '/admin/license', label: 'License Manager', icon: KeyRound, perm: 'license.manage' },
      { to: '/support', label: 'Support', icon: LifeBuoy, perm: 'support.manage' },
    ],
  },
]

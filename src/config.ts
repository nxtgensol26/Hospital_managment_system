/**
 * Central product configuration for NxtHealth.
 * Kept in one place so branding / support details never drift across screens.
 */
export const APP = {
  product: 'NxtHealth',
  company: 'NxtGenSol',
  poweredBy: 'Powered by NxtGenSol',
  tagline: 'One Patient. One Journey. One Connected Hospital.',
  version: '1.0.0',
  support: {
    phone: '9422578575',
    email: 'support@nxtgensol.co.in',
    website: 'nxtgensol.co.in',
  },
  /** Prefix for the permanent patient master ID, e.g. NH-000001 */
  patientIdPrefix: 'NH',
  /** Support ticket prefix, e.g. NXH-2026-000001 */
  ticketPrefix: 'NXH',
  /** License key prefix, e.g. NXH-YEARLY-... */
  licensePrefix: 'NXH',
} as const

export type ModuleKey =
  | 'opd'
  | 'ipd'
  | 'appointments'
  | 'diagnostics'
  | 'pharmacy'
  | 'billing'
  | 'emergency'
  | 'beds'
  | 'portal'
  | 'reports'
  | 'admin'

export const ALL_MODULES: { key: ModuleKey; label: string }[] = [
  { key: 'opd', label: 'OPD / Consultations' },
  { key: 'ipd', label: 'IPD / Admissions' },
  { key: 'appointments', label: 'Appointments' },
  { key: 'diagnostics', label: 'Diagnostics / Lab' },
  { key: 'pharmacy', label: 'Pharmacy' },
  { key: 'billing', label: 'Billing' },
  { key: 'emergency', label: 'Emergency' },
  { key: 'beds', label: 'Bed Management' },
  { key: 'portal', label: 'Patient Portal' },
  { key: 'reports', label: 'Reports & Analytics' },
  { key: 'admin', label: 'Administration' },
]

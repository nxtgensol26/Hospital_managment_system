/**
 * NxtHealth — CENTRAL notification template configuration (single source of truth).
 *
 * This documents the 8 pilot notification types, their SMS Horizon approved
 * template name (or `pending`), the channel, and the POSITIONAL variable order
 * (varOrder[0] -> {{1}}, varOrder[1] -> {{2}}, …) that the `notify` edge function
 * uses when calling SMS Horizon RCS /send.
 *
 * Runtime source: the per-hospital `public.notification_templates` rows
 * (columns `provider_template` + `var_order`), seeded from this config in
 * migration 0013. To change a template after SMS Horizon approval, update the
 * row's `provider_template` / `var_order` (or re-seed) — no code change needed.
 *
 * Approved so far:  appt_confirm -> "nxthealth_appt" (Transactional).
 * All other types are PENDING approval and use the mock provider + logging until
 * their real approved template name is set. Do NOT invent template names/IDs.
 */
export type NotificationType =
  | 'appt_confirm' | 'appt_reminder' | 'registration' | 'lab_ready'
  | 'prescription_ready' | 'payment_receipt' | 'followup_reminder' | 'discharge'

export interface TemplateConfig {
  key: NotificationType
  useCase: string
  channel: 'rcs' | 'sms'
  providerTemplate: string | null // SMS Horizon approved template name, or null = pending
  varOrder: string[]              // positional variables for the approved template
}

export const NOTIFICATION_TEMPLATES: Record<NotificationType, TemplateConfig> = {
  appt_confirm: { key: 'appt_confirm', useCase: 'Appointment confirmation', channel: 'rcs', providerTemplate: 'nxthealth_appt', varOrder: ['name', 'doctor', 'date', 'time', 'patientId'] },
  appt_reminder: { key: 'appt_reminder', useCase: 'Appointment reminder', channel: 'rcs', providerTemplate: null, varOrder: ['name', 'doctor', 'date', 'time', 'patientId'] },
  registration: { key: 'registration', useCase: 'Patient registration', channel: 'rcs', providerTemplate: 'nxthealth_reg', varOrder: ['name', 'hospital', 'patientId', 'loginId', 'tempPassword', 'doctor', 'regDate', 'regTime'] },
  lab_ready: { key: 'lab_ready', useCase: 'Lab report ready', channel: 'rcs', providerTemplate: null, varOrder: ['name', 'orderId'] },
  prescription_ready: { key: 'prescription_ready', useCase: 'Prescription ready', channel: 'rcs', providerTemplate: null, varOrder: ['name', 'rxId', 'doctor'] },
  payment_receipt: { key: 'payment_receipt', useCase: 'Payment receipt', channel: 'sms', providerTemplate: null, varOrder: ['name', 'invId', 'amount'] },
  followup_reminder: { key: 'followup_reminder', useCase: 'Follow-up reminder', channel: 'rcs', providerTemplate: null, varOrder: ['name', 'doctor', 'date'] },
  discharge: { key: 'discharge', useCase: 'Discharge', channel: 'rcs', providerTemplate: null, varOrder: ['name'] },
}

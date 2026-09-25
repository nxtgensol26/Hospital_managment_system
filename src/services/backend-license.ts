import { invokeFn } from '../lib/supabase'
import type { LicenseType } from '../types'

/**
 * Production license service — talks ONLY to the `licensing` edge function.
 * The private signing key never leaves the server. This is the replaceable
 * counterpart to the local dev license generator in services/license.ts.
 */
export const backendLicense = {
  current: () => invokeFn('licensing', { action: 'current' }),
  validate: () => invokeFn('licensing', { action: 'validate' }),
  startTrial: () => invokeFn('licensing', { action: 'start_trial' }),
  issue: (p: { type: LicenseType; startDate?: string; userLimit?: number; modules?: string[] }) =>
    invokeFn('licensing', { action: 'issue', ...p }),
}

import { invokeFn } from '../lib/supabase'
import type { NotificationTemplateKey } from '../types'

/**
 * Production notification service — the frontend calls sendTemplate() and never
 * touches SMS Horizon / RCS directly. Provider selection, approved-template use,
 * positional variables and RCS→SMS fallback happen server-side in the `notify`
 * edge function. `ref` is an optional idempotency key (e.g. appointment code).
 */
export const notificationService = {
  sendTemplate: (
    templateKey: NotificationTemplateKey,
    ctx: { patientId?: string; to: string; ref?: string; vars: Record<string, string | number | undefined> },
  ) => invokeFn('notify', { templateKey, patientId: ctx.patientId, to: ctx.to, ref: ctx.ref, vars: ctx.vars }),
}

import type {
  NotificationLog,
  NotificationTemplateKey,
  NotificationTemplate,
} from '../types'
import { useDB } from '../store/db'
import { APP } from '../config'

/* ------------------------------------------------------------------ *
 *  NotificationService — provider-agnostic messaging.
 *
 *  Appointment / lab / billing code NEVER talks to a gateway directly.
 *  It calls notify(templateKey, ctx). This service:
 *    1. resolves the approved template (DLT / RCS template ID)
 *    2. renders the body from {{placeholders}}
 *    3. attempts the preferred channel (RCS) then falls back (SMS)
 *
 *  Providers below are mock implementations. Swap them for real SMS
 *  Horizon / RCS / WhatsApp clients — the rest of the app is untouched.
 * ------------------------------------------------------------------ */

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface SendResult {
  ok: boolean
  channel: 'sms' | 'rcs' | 'whatsapp'
  provider: string
  info?: string
}

export interface NotificationProvider {
  readonly name: string
  readonly channel: 'sms' | 'rcs' | 'whatsapp'
  send(to: string, templateId: string, message: string): Promise<SendResult>
}

/** Mock SMS Horizon provider. */
class SmsHorizonProvider implements NotificationProvider {
  name = 'SMS Horizon'
  channel = 'sms' as const
  async send(to: string, _templateId: string, _message: string): Promise<SendResult> {
    await delay(120)
    return { ok: !!to, channel: 'sms', provider: this.name }
  }
}

/** Mock RCS provider — occasionally "undeliverable" to demonstrate fallback. */
class RcsProvider implements NotificationProvider {
  name = 'RCS Business Messaging'
  channel = 'rcs' as const
  async send(to: string, _templateId: string, _message: string): Promise<SendResult> {
    await delay(160)
    const deliverable = !!to && Math.random() > 0.15
    return {
      ok: deliverable,
      channel: 'rcs',
      provider: this.name,
      info: deliverable ? undefined : 'RCS not available on device',
    }
  }
}

/** Placeholder for a future WhatsApp Business provider. */
class WhatsAppProvider implements NotificationProvider {
  name = 'WhatsApp Business (coming soon)'
  channel = 'whatsapp' as const
  async send(): Promise<SendResult> {
    await delay(80)
    return { ok: false, channel: 'whatsapp', provider: this.name, info: 'Not configured' }
  }
}

const providers = {
  sms: new SmsHorizonProvider(),
  rcs: new RcsProvider(),
  whatsapp: new WhatsAppProvider(),
}

export interface NotifyContext {
  patientId?: string
  to: string // recipient phone
  vars: Record<string, string | number | undefined>
}

function render(body: string, vars: Record<string, string | number | undefined>): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
    const v = vars[k]
    return v == null ? '' : String(v)
  })
}

function getTemplate(key: NotificationTemplateKey): NotificationTemplate | undefined {
  return useDB.getState().db.notificationTemplates.find((t) => t.key === key)
}

/**
 * Send a templated notification. RCS templates fall back to SMS automatically.
 * Everything is logged to the notification log for the audit trail.
 */
export async function notify(key: NotificationTemplateKey, ctx: NotifyContext): Promise<SendResult> {
  const tpl = getTemplate(key)
  if (!tpl || !tpl.active) {
    const res: SendResult = { ok: false, channel: 'sms', provider: 'none', info: 'template inactive/missing' }
    return res
  }

  const vars = { hospital: useDB.getState().db.hospital.name, ...ctx.vars }
  const message = render(tpl.body, vars)

  let result: SendResult
  if (tpl.channel === 'rcs') {
    result = await providers.rcs.send(ctx.to, tpl.templateId, message)
    if (!result.ok) {
      // fallback to SMS Horizon
      const fb = await providers.sms.send(ctx.to, tpl.templateId, message)
      result = { ...fb, info: `RCS failed → SMS fallback` }
      logNotification(ctx, key, message, 'sms', fb.provider, fb.ok ? 'fallback' : 'failed')
      return result
    }
  } else {
    result = await providers[tpl.channel].send(ctx.to, tpl.templateId, message)
  }

  logNotification(ctx, key, message, result.channel, result.provider, result.ok ? 'sent' : 'failed')
  return result
}

function logNotification(
  ctx: NotifyContext,
  key: NotificationTemplateKey,
  message: string,
  channel: 'sms' | 'rcs' | 'whatsapp',
  provider: string,
  status: NotificationLog['status'],
) {
  useDB.getState().update((db) => {
    db.notificationLogs.unshift({
      id: `ntf_${Math.random().toString(36).slice(2, 9)}`,
      patientId: ctx.patientId,
      to: ctx.to,
      templateKey: key,
      channel,
      provider,
      status,
      message,
      at: new Date().toISOString(),
    })
    if (db.notificationLogs.length > 500) db.notificationLogs.length = 500
  })
}

export const SUPPORT_SIGNATURE = `${APP.product} · ${APP.support.phone}`

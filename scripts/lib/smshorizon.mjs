// NxtHealth — SMS Horizon RCS request builder (pure, testable).
// MUST stay in sync with the inline logic in supabase/functions/notify/index.ts.
// Base: https://smshorizon.com/api/v2/rcs  → POST /send
// Auth: Authorization: Bearer <API_KEY> (header) — never in this file.
// Body: { user:<account username>, template:<name>, recipients:[{mobile, vars:{"1":..}, ref}] }
//   `user` (account username) is REQUIRED in the body; the API key is the Bearer
//   header only. vars are POSITIONAL as a 1-indexed object. Max 500 recipients.
export const TPL_FIELD = 'template' // overridable server-side via SMS_HORIZON_TEMPLATE_FIELD

export function cleanMobile(m) { return String(m ?? '').split(' ').join('').split('-').join('') }
export function validMobile(m) {
  const c = cleanMobile(m); const s = c.startsWith('+') ? c.slice(1) : c
  return s.length >= 8 && s.length <= 15 && [...s].every((ch) => ch >= '0' && ch <= '9')
}
export function missingVars(order, vars) {
  return (order ?? []).filter((k) => !((vars ?? {})[k] != null && String((vars ?? {})[k]).length))
}
export function positionalVars(order, vars) {
  return (order ?? []).map((k) => String((vars ?? {})[k] ?? ''))
}
/** Convert positional vars (array or object) to SMS Horizon's 1-indexed object form. */
export function toVarsObject(vars) {
  if (Array.isArray(vars)) { const o = {}; vars.forEach((v, i) => { o[String(i + 1)] = v == null ? '' : String(v) }); return o }
  return vars ?? {}
}
/** Single-recipient RCS /send body. `user` = account username (required by provider). */
export function buildRcsSend(user, templateName, mobile, vars, ref) {
  if (!templateName) throw new Error('template name required')
  const recipient = { mobile: cleanMobile(mobile), vars: toVarsObject(vars) }
  if (ref) recipient.ref = ref
  const body = { [TPL_FIELD]: templateName, recipients: [recipient] }
  if (user) body.user = user
  return body
}
/** Batch RCS /send body (max 500 recipients per call). */
export function buildRcsBatch(user, templateName, recipients) {
  if (!templateName) throw new Error('template name required')
  if (!Array.isArray(recipients) || recipients.length === 0) throw new Error('recipients required')
  if (recipients.length > 500) throw new Error('max 500 recipients per call')
  const body = {
    [TPL_FIELD]: templateName,
    recipients: recipients.map((r) => (r.ref
      ? { mobile: cleanMobile(r.mobile), vars: toVarsObject(r.vars), ref: r.ref }
      : { mobile: cleanMobile(r.mobile), vars: toVarsObject(r.vars) })),
  }
  if (user) body.user = user
  return body
}

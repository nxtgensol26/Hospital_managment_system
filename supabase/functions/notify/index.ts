// NxtHealth — notify edge function (multi-hospital messaging gateway).
// Loads the AUTHENTICATED hospital's own messaging_config (tenant-scoped),
// decrypts its credential server-side (get_messaging_secret, service-role only),
// and routes to the configured provider. No global provider key is used.
//
// SMS Horizon RCS: POST {base}/send, Authorization: Bearer <hospital key>,
//   body { user:<account username>, <templateField>:<approved template>,
//          recipients:[{mobile, vars:{"1":..,"2":..}, ref}] }
//   `user` (account username) is REQUIRED in the body (its absence caused the
//   provider's "Missing user" rejection); the API key is the Bearer token only.
//   vars are POSITIONAL as a 1-indexed object, <=500 recipients.
//   Success response: { request_id, accepted, rejected, messages:[{msgid}] }.
// WhatsApp / custom providers: abstraction only — real request NOT implemented
//   (provider spec required) → recorded as configuration_missing (never faked).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const TPL_FIELD = Deno.env.get('SMS_HORIZON_TEMPLATE_FIELD') || 'template'
const DEFAULT_RCS_BASE = 'https://smshorizon.com/api/v2/rcs'

// Convert positional vars (array or object) to SMS Horizon's 1-indexed object form.
function toVarsObject(vars) {
  if (Array.isArray(vars)) { const o = {}; vars.forEach((v, i) => { o[String(i + 1)] = v == null ? '' : String(v) }); return o }
  return vars ?? {}
}
export function buildRcsSend(user, templateName, mobile, vars, ref) {
  if (!templateName) throw new Error('template name required')
  const recipient = { mobile, vars: toVarsObject(vars) }; if (ref) recipient.ref = ref
  const body = { [TPL_FIELD]: templateName, recipients: [recipient] }
  if (user) body.user = user   // account username — required by SMS Horizon (JSON body, not the header)
  return body
}
const cleanMobile = (m) => String(m ?? '').split(' ').join('').split('-').join('')
function validMobile(m) { const c = cleanMobile(m); const s = c.startsWith('+') ? c.slice(1) : c; return s.length >= 8 && s.length <= 15 && [...s].every((ch) => ch >= '0' && ch <= '9') }
function render(body, vars) { let out = body; for (const k of Object.keys(vars ?? {})) out = out.split('{{' + k + '}}').join(vars[k] == null ? '' : String(vars[k])); return out }

async function rcsSend(baseUrl, apiKey, user, templateName, mobile, vars, ref) {
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 10000)
  try {
    // API key = Bearer header only; username = `user` in the JSON body (never the reverse).
    const res = await fetch(`${baseUrl}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(buildRcsSend(user, templateName, cleanMobile(mobile), vars, ref)), signal: controller.signal })
    let body = null; try { body = await res.json() } catch { /* non-JSON */ }
    if (res.status === 401) return { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: 'authentication failed (401)' }
    if (res.status === 403) return { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: 'authorization failed (403)' }
    if (res.status === 429) return { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: 'provider rate limited (429)' }
    if (res.status >= 500) return { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: `provider error (${res.status})` }
    // Documented success shape: messages[].msgid (+ request_id, accepted, rejected). Older shapes kept as fallback.
    const msgid = body?.messages?.[0]?.msgid ?? body?.recipients?.[0]?.msgid ?? body?.data?.[0]?.msgid ?? body?.msgid ?? body?.data?.msgid ?? body?.id
    if (!res.ok) return { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: body?.error || body?.message || `HTTP ${res.status}` }
    // SMS Horizon may return HTTP 200 with an application-level error (e.g. "Missing user").
    if (!msgid) { const snippet = body ? JSON.stringify(body).slice(0, 160) : 'empty body'; return { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: `HTTP ${res.status} accepted but no msgid; response: ${snippet}` } }
    return { ok: true, channel: 'rcs', provider: 'SMS Horizon RCS', providerMessageId: msgid, accepted: body?.accepted, requestId: body?.request_id }
  } catch (e) { const msg = e.name === 'AbortError' ? 'network timeout' : String(e.message); return { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: msg } } finally { clearTimeout(timeout) }
}
async function smsFallback(to) { return { ok: !!to, channel: 'sms', provider: 'SMS fallback (mock)', providerMessageId: 'mock-' + crypto.randomUUID().slice(0, 8), info: 'SMS fallback not configured with real credentials' } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)
    const admin = createClient(url, service)
    const { data: profile } = await admin.from('users').select('hospital_id').eq('id', user.id).single()
    if (!profile?.hospital_id) return json({ error: 'No hospital context' }, 403)
    const hid = profile.hospital_id

    const { templateKey, patientId, to, vars, ref, isTest } = await req.json()
    if (!templateKey || !to) return json({ ok: false, info: 'templateKey and to are required' }, 400)

    const { data: tpl } = await admin.from('notification_templates').select('*').eq('hospital_id', hid).eq('key', templateKey).maybeSingle()
    if (!tpl || !tpl.active) return json({ ok: false, info: 'template inactive/missing' })

    if (ref) {
      const { data: existing } = await admin.from('notifications').select('id,status,provider_message_id').eq('hospital_id', hid).eq('template_key', templateKey).eq('client_ref', ref).neq('status', 'failed').maybeSingle()
      if (existing) return json({ ok: true, deduped: true, status: existing.status, providerMessageId: existing.provider_message_id })
    }

    const { data: hosp } = await admin.from('hospitals').select('name').eq('id', hid).single()
    const message = render(tpl.body, { hospital: hosp?.name, ...(vars ?? {}) })

    // Load this hospital's own gateway configuration (tenant-scoped).
    const { data: cfg } = await admin.from('messaging_config').select('*').eq('hospital_id', hid).maybeSingle()

    let result; let status
    const logAndReturn = async () => {
      // Preserve the provider's safe reason for failed AND fallback rows so a
      // provider rejection is never hidden. (Sanitized — no key/headers.)
      const errText = (status === 'failed' || status === 'configuration_missing' || status === 'fallback') ? (result.info ?? null) : null
      if (errText) { try { console.error(`[notify] ${status} via ${result.provider}: ${errText}`) } catch { /* */ } }
      await admin.from('notifications').insert({ hospital_id: hid, patient_id: patientId ?? null, recipient: to, template_key: templateKey, channel: result.channel, provider: result.provider, status, message, provider_message_id: result.providerMessageId ?? null, error: errText, client_ref: ref ?? null, is_test: !!isTest, updated_at: new Date().toISOString() })
      return json({ ok: result.ok || status === 'fallback' || status === 'accepted', status, provider: result.provider, providerMessageId: result.providerMessageId, info: result.info })
    }

    if (!cfg || !cfg.enabled || cfg.provider === 'disabled') {
      result = { ok: false, channel: 'none', provider: 'none', info: 'no messaging provider configured for this hospital' }; status = 'configuration_missing'
      return await logAndReturn()
    }

    if (cfg.provider === 'sms_horizon') {
      const base = cfg.base_url || DEFAULT_RCS_BASE
      if (cfg.rcs_enabled && tpl.channel === 'rcs' && tpl.provider_template) {
        const order = tpl.var_order ?? []
        // Server-authoritative fields (e.g. hospital name) are merged in and win over
        // any client-supplied value, so tenant identity is never trusted from the client.
        const varSource = { ...(vars ?? {}), hospital: hosp?.name }
        const positional = order.map((k) => String(varSource[k] ?? ''))
        const missing = order.filter((k) => !(varSource[k] != null && String(varSource[k]).length))
        if (!validMobile(to)) { result = { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: 'invalid recipient mobile' }; status = 'failed'; return await logAndReturn() }
        if (missing.length) { result = { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: `missing variables: ${missing.join(', ')}` }; status = 'failed'; return await logAndReturn() }
        // SMS Horizon requires BOTH the account username (non-secret) and the API key.
        // A real RCS call is made only when both are present; otherwise fall back to
        // SMS if enabled, else record configuration_missing (never call the provider).
        const provUser = cfg.provider_user
        const { data: key } = provUser ? await admin.rpc('get_messaging_secret', { p_hospital: hid, p_which: 'sms' }) : { data: null }
        if (provUser && key) {
          result = await rcsSend(base, key, provUser, tpl.provider_template, to, positional, ref)
          if (result.ok) status = 'accepted'
          else if (cfg.sms_fallback_enabled) { const fb = await smsFallback(to); result = { ...fb, info: `RCS: ${result.info}; SMS fallback used` }; status = fb.ok ? 'fallback' : 'failed' }
          else status = 'failed'
        } else {
          const reason = !provUser ? 'SMS Horizon username is not configured' : 'RCS credential not configured'
          if (cfg.sms_fallback_enabled) { const fb = await smsFallback(to); result = { ...fb, info: `${reason}; SMS fallback used` }; status = fb.ok ? 'fallback' : 'failed' }
          else { result = { ok: false, channel: 'rcs', provider: 'SMS Horizon RCS', info: reason }; status = 'configuration_missing' }
        }
      } else if (cfg.sms_enabled) {
        const fb = await smsFallback(to); result = { ...fb, info: 'SMS channel (provider SMS API not integrated)' }; status = fb.ok ? 'sent' : 'failed'
      } else {
        result = { ok: false, channel: 'none', provider: 'SMS Horizon', info: 'no channel enabled for this template' }; status = 'configuration_missing'
      }
    } else if (cfg.provider === 'whatsapp') {
      result = { ok: false, channel: 'whatsapp', provider: 'WhatsApp', info: 'WhatsApp provider request not implemented — provider API spec required' }; status = 'configuration_missing'
    } else {
      result = { ok: false, channel: 'custom', provider: 'Custom', info: 'custom provider request not implemented' }; status = 'configuration_missing'
    }
    return await logAndReturn()
  } catch (e) { return json({ error: String(e?.message ?? e) }, 500) }
})

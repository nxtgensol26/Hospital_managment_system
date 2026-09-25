// NxtHealth — messaging-test edge function.
// Admin-gated Test Connection and Send Test Message. Runs entirely server-side,
// tenant-scoped (hospital from session), rate-limited, audited. Never returns or
// logs credentials. "Send Test" reuses the notify pipeline with isTest=true.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }
const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const maskPhone = (m) => { const s = String(m ?? ''); return s.length <= 4 ? '****' : '••••••' + s.slice(-4) }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL'); const anon = Deno.env.get('SUPABASE_ANON_KEY'); const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)
    const admin = createClient(url, service)
    const { data: profile } = await admin.from('users').select('id, hospital_id, role, name').eq('id', user.id).single()
    if (!profile?.hospital_id) return json({ error: 'No hospital context' }, 403)

    const isSuper = profile.role === 'super_admin'
    const perm = isSuper
      || !!(await admin.from('role_permissions').select('permission_key').eq('role_key', profile.role).eq('permission_key', 'integrations.manage').maybeSingle()).data
      || !!(await admin.from('role_permissions').select('permission_key').eq('role_key', profile.role).eq('permission_key', 'admin.settings').maybeSingle()).data
    if (!perm) return json({ error: 'Not authorized to manage integrations' }, 403)

    const rl = await admin.rpc('rate_limit', { p_bucket: 'messaging-test', p_ref: user.id, p_max: 20, p_window_secs: 300 })
    if (rl.data === false) return json({ error: 'Rate limit exceeded, try again shortly' }, 429)

    const hid = profile.hospital_id
    const body = await req.json()
    const action = body?.action
    const { data: cfg } = await admin.from('messaging_config').select('provider,enabled,rcs_enabled,sms_enabled,whatsapp_enabled,sms_fallback_enabled,base_url,provider_user').eq('hospital_id', hid).maybeSingle()

    if (action === 'test') {
      if (!cfg || !cfg.enabled || cfg.provider === 'disabled') { await audit(admin, profile, 'Messaging test connection', 'no provider enabled'); return json({ ok: false, info: 'No messaging provider enabled for this hospital.' }) }
      const { data: hasKey } = await admin.rpc('get_messaging_secret', { p_hospital: hid, p_which: cfg.provider === 'whatsapp' ? 'whatsapp' : 'sms' })
      const configured = !!hasKey
      const hasUser = !!cfg.provider_user   // non-secret username (never echoed)
      let info
      if (cfg.provider === 'sms_horizon') {
        if (!hasUser) info = 'SMS Horizon username is not configured.'
        else if (!configured) info = 'SMS Horizon API key is not configured.'
        else info = 'SMS Horizon username and API key are configured. Use “Send Test Message” for a live delivery check.'
      }
      else if (cfg.provider === 'whatsapp') info = 'WhatsApp provider abstraction present; live request requires provider API spec (not yet integrated).'
      else info = 'Custom provider is not integrated.'
      const smsReady = cfg.provider === 'sms_horizon' && configured && hasUser
      await audit(admin, profile, 'Messaging test connection', `${cfg.provider}:${configured ? 'key' : 'no-key'}/${hasUser ? 'user' : 'no-user'}`)
      return json({ ok: smsReady, provider: cfg.provider, credential_configured: configured, user_configured: hasUser, info })
    }

    if (action === 'send_test') {
      const to = body?.to; const templateKey = body?.templateKey || 'appt_confirm'; const vars = body?.vars ?? {}
      if (!to) return json({ error: 'destination phone (to) is required' }, 400)
      if (!cfg || !cfg.enabled) { await audit(admin, profile, 'Messaging test message', 'config missing'); return json({ ok: false, status: 'configuration_missing', info: 'No messaging provider enabled.' }) }
      // Reuse the single notify pipeline (marks the notification is_test).
      const res = await fetch(`${url}/functions/v1/notify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anon, Authorization: authHeader },
        body: JSON.stringify({ templateKey, to, vars, isTest: true, ref: 'TEST-' + crypto.randomUUID().slice(0, 8) }),
      })
      const out = await res.json().catch(() => ({}))
      await audit(admin, profile, 'Messaging test message', `${templateKey} → ${maskPhone(to)} : ${out?.status ?? 'unknown'}`)
      return json({ ok: !!out?.ok, status: out?.status, provider: out?.provider, providerMessageId: out?.providerMessageId, info: out?.info })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) { return json({ error: String(e?.message ?? e) }, 500) }
})

async function audit(admin, profile, action, detail) {
  try { await admin.from('audit_logs').insert({ hospital_id: profile.hospital_id, actor_id: profile.id, actor_name: profile.name, actor_role: profile.role, action, entity: 'messaging', detail }) } catch { /* non-blocking */ }
}

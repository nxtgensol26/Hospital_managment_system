// NxtHealth — licensing edge function
// Server-side license issue / validate / trial. The signing key lives only in
// the private app_secrets table (read via service role) — never in the browser.
// The 15-day trial is enforced by hospitals.trial_used, so clearing browser
// storage cannot reset it.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const ALL_MODULES = ['opd','ipd','appointments','diagnostics','pharmacy','billing','emergency','beds','portal','reports','admin']

function canonical(p: any): string {
  return [p.product, p.hospital_id, p.type, p.start_date, p.expiry_date ?? 'LIFETIME', p.user_limit,
    [...(p.modules ?? [])].sort().join(',')].join('|')
}
async function sign(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg))
  return [...new Uint8Array(sig)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
function addDays(d: string, n: number): string {
  const dt = new Date(d + 'T00:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10)
}
function statusOf(type: string, expiry: string | null): string {
  if (!expiry) return 'active'
  const today = new Date().toISOString().slice(0, 10)
  if (today > expiry) return 'expired'
  return type === 'TRIAL' ? 'trial' : 'active'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const authHeader = req.headers.get('Authorization') ?? ''

    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Not authenticated' }, 401)

    const admin = createClient(url, service)
    const { data: profile } = await admin.from('users').select('hospital_id, role').eq('id', user.id).single()
    if (!profile?.hospital_id) return json({ error: 'No hospital context' }, 403)
    const hospital_id = profile.hospital_id

    const { data: keyRow } = await admin.from('app_secrets').select('value').eq('key', 'license_signing_key').single()
    const signingKey = keyRow!.value

    const { action, ...b } = await req.json()

    const canManage = profile.role === 'super_admin' || !!(await admin
      .from('role_permissions').select('permission_key')
      .eq('role_key', profile.role).eq('permission_key', 'license.manage').maybeSingle()).data

    const latest = async () => (await admin.from('licenses').select('*').eq('hospital_id', hospital_id).order('issued_at', { ascending: false }).limit(1).maybeSingle()).data

    if (action === 'current' || action === 'validate') {
      const lic = await latest()
      if (!lic) return json({ status: 'unlicensed', license: null })
      const expected = await sign(signingKey, canonical(lic))
      const valid = expected === lic.signature
      const status = valid ? statusOf(lic.type, lic.expiry_date) : 'invalid'
      return json({ status, valid, license: { ...lic } })
    }

    if (action === 'start_trial') {
      if (!canManage) return json({ error: 'Not authorized' }, 403)
      const { data: hosp } = await admin.from('hospitals').select('trial_used, name').eq('id', hospital_id).single()
      if (hosp?.trial_used) return json({ error: 'A free trial has already been used for this hospital.' }, 409)
      const start = new Date().toISOString().slice(0, 10)
      const payload = { product: 'NxtHealth', hospital_id, type: 'TRIAL', start_date: start,
        expiry_date: addDays(start, 15), user_limit: 10, modules: ALL_MODULES }
      const signature = await sign(signingKey, canonical(payload))
      const { data: lic, error } = await admin.from('licenses').insert({
        ...payload, hospital_name: hosp?.name ?? 'Hospital', status: 'trial', signature, issued_by: 'NxtGenSol',
      }).select().single()
      if (error) return json({ error: error.message }, 400)
      await admin.from('hospitals').update({ trial_used: true, trial_started_at: new Date().toISOString() }).eq('id', hospital_id)
      await admin.from('license_activations').insert({ hospital_id, key: 'TRIAL', activated_by: user.id, result: 'success' })
      await admin.from('audit_logs').insert({ hospital_id, actor_id: user.id, actor_role: profile.role, action: 'Trial started', entity: 'license', detail: `valid to ${payload.expiry_date}` })
      return json({ status: 'trial', license: lic })
    }

    if (action === 'issue') {
      if (!canManage) return json({ error: 'Not authorized' }, 403)
      const type = b.type ?? 'YEARLY'
      const start = b.startDate || new Date().toISOString().slice(0, 10)
      const expiry = type === 'LIFETIME' ? null : type === 'MONTHLY' ? addDays(start, 30) : type === 'TRIAL' ? addDays(start, 15) : addDays(start, 365)
      const payload = { product: 'NxtHealth', hospital_id, type, start_date: start, expiry_date: expiry,
        user_limit: b.userLimit ?? 25, modules: b.modules ?? ALL_MODULES }
      const signature = await sign(signingKey, canonical(payload))
      const { data: hosp } = await admin.from('hospitals').select('name').eq('id', hospital_id).single()
      const { data: lic, error } = await admin.from('licenses').insert({
        ...payload, hospital_name: hosp?.name ?? 'Hospital', status: statusOf(type, expiry), signature, issued_by: 'NxtGenSol',
      }).select().single()
      if (error) return json({ error: error.message }, 400)
      await admin.from('license_activations').insert({ hospital_id, key: lic.id, activated_by: user.id, result: 'success' })
      await admin.from('audit_logs').insert({ hospital_id, actor_id: user.id, actor_role: profile.role, action: 'License issued', entity: 'license', detail: `${type} to ${expiry ?? 'LIFETIME'}` })
      return json({ status: lic.status, license: lic })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

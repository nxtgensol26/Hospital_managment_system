// NxtHealth — admin-users edge function
// Create / activate / deactivate staff. Uses the Auth Admin API (service role,
// server-only). Caller must be authenticated AND hold 'admin.users'. hospital_id
// is forced to the caller's hospital (no cross-tenant provisioning).
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const STAFF_ROLES = ['hospital_admin', 'receptionist', 'doctor', 'nurse', 'lab_technician', 'lab_manager', 'pharmacist', 'billing_staff', 'inventory_manager']

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
    const { data: profile } = await admin.from('users').select('id, hospital_id, role, name').eq('id', user.id).single()
    if (!profile?.hospital_id) return json({ error: 'No hospital context' }, 403)

    const isSuper = profile.role === 'super_admin'
    const perm = isSuper || !!(await admin.from('role_permissions').select('permission_key').eq('role_key', profile.role).eq('permission_key', 'admin.users').maybeSingle()).data
    if (!perm) return json({ error: 'Not authorized to manage users' }, 403)

    // rate limit: 30 admin-user ops / 5 min per admin
    const rl = await admin.rpc('rate_limit', { p_bucket: 'admin-users', p_ref: user.id, p_max: 30, p_window_secs: 300 })
    if (rl.data === false) return json({ error: 'Rate limit exceeded, try again shortly' }, 429)

    const body = await req.json()
    const action = body?.action

    if (action === 'create') {
      const { name, username, role, password, email } = body
      if (!name?.trim() || !username?.trim() || !role) return json({ error: 'name, username and role are required' }, 400)
      if (!STAFF_ROLES.includes(role)) return json({ error: 'Invalid staff role' }, 400)
      if (!password || String(password).length < 8) return json({ error: 'Temporary password must be at least 8 characters' }, 400)
      const loginEmail = (email?.trim()) || `${username.trim().toLowerCase()}@staff.nxthealth.local`
      const { data: created, error } = await admin.auth.admin.createUser({
        email: loginEmail, password, email_confirm: true,
        app_metadata: { role, hospital_id: profile.hospital_id },
        user_metadata: { name, username, must_change_password: true },
      })
      if (error) return json({ error: error.message }, 400)
      await admin.from('audit_logs').insert({ hospital_id: profile.hospital_id, actor_id: user.id, actor_name: profile.name, actor_role: profile.role, action: 'Staff user created', entity: 'user', entity_id: username, detail: role })
      return json({ ok: true, userId: created.user!.id, email: loginEmail })
    }

    if (action === 'set_active') {
      const { userId, active } = body
      if (!userId) return json({ error: 'userId required' }, 400)
      // tenant guard: only users in the caller's hospital
      const { data: target } = await admin.from('users').select('hospital_id, username').eq('id', userId).single()
      if (!target || target.hospital_id !== profile.hospital_id) return json({ error: 'User not in your hospital' }, 403)
      await admin.from('users').update({ active: !!active }).eq('id', userId)
      await admin.from('audit_logs').insert({ hospital_id: profile.hospital_id, actor_id: user.id, actor_name: profile.name, actor_role: profile.role, action: active ? 'Staff user activated' : 'Staff user deactivated', entity: 'user', entity_id: target.username })
      return json({ ok: true })
    }

    return json({ error: 'Unknown action' }, 400)
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

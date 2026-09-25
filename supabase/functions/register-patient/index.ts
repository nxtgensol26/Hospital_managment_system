// NxtHealth — register-patient edge function
// Creates a patient + portal Auth account. hospital_id is derived from the
// authenticated caller's session (never trusted from the request body).
// Hardened: caller authz (patients.create), input validation, rate limiting.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
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
    const { data: profile } = await admin.from('users').select('hospital_id, role, name').eq('id', user.id).single()
    if (!profile?.hospital_id) return json({ error: 'No hospital context' }, 403)

    const permRes = await admin.from('role_permissions').select('permission_key').eq('role_key', profile.role).eq('permission_key', 'patients.create').maybeSingle()
    const allowed = profile.role === 'super_admin' || !!permRes.data
    if (!allowed) return json({ error: 'Not authorized to register patients' }, 403)

    // rate limit: 60 registrations / 5 min per staff user
    const rl = await admin.rpc('rate_limit', { p_bucket: 'register-patient', p_ref: user.id, p_max: 60, p_window_secs: 300 })
    if (rl.data === false) return json({ error: 'Rate limit exceeded, try again shortly' }, 429)

    const b = await req.json()
    // input validation
    if (!b?.name || String(b.name).trim().length < 2) return json({ error: 'A valid patient name is required' }, 400)
    if (!b?.mobile || !/^[0-9+\-\s]{6,20}$/.test(String(b.mobile))) return json({ error: 'A valid mobile number is required' }, 400)
    const gender = ['male', 'female', 'other'].includes(b.gender) ? b.gender : 'other'

    const { data: patient, error } = await admin.from('patients').insert({
      hospital_id: profile.hospital_id,
      name: String(b.name).trim(), mobile: String(b.mobile).trim(), gender,
      dob: b.dob || null, age_years: b.ageYears ?? null, blood_group: b.bloodGroup ?? 'unknown',
      address: b.address ?? null, emergency_contact_name: b.emergencyContactName ?? null,
      emergency_contact_phone: b.emergencyContactPhone ?? null, allergies: b.allergies ?? null,
      medical_notes: b.medicalNotes ?? null, id_proof_type: b.idProofType ?? null,
      id_proof_number: b.idProofNumber ?? null, provisional: !!b.provisional, created_by: user.id,
    }).select().single()
    if (error) return json({ error: error.message }, 400)

    const code: string = patient.patient_code
    const portalEmail = `${code.toLowerCase()}@patients.nxthealth.local`
    const tempPassword = 'Nxt-' + Math.random().toString(36).slice(2, 8) + Math.floor(10 + Math.random() * 89)

    const { data: created, error: e2 } = await admin.auth.admin.createUser({
      email: portalEmail, password: tempPassword, email_confirm: true,
      app_metadata: { role: 'patient', hospital_id: profile.hospital_id },
      user_metadata: { name: patient.name, username: code, patient_id: patient.id, must_change_password: true },
    })
    if (e2) return json({ error: 'Patient created but portal account failed: ' + e2.message }, 500)
    await admin.from('patients').update({ auth_user_id: created.user!.id }).eq('id', patient.id)

    let appointment = null
    if (b.appointment?.doctorId) {
      const a = b.appointment
      const { data: ap } = await admin.from('appointments').insert({
        hospital_id: profile.hospital_id, patient_id: patient.id, doctor_id: a.doctorId,
        department_id: a.departmentId ?? null, date: a.date, start_time: a.time,
        type: a.type ?? 'new', reason: a.reason ?? null, status: 'scheduled', created_by: user.id,
      }).select().single()
      appointment = ap
    }

    await admin.from('audit_logs').insert({
      hospital_id: profile.hospital_id, actor_id: user.id, actor_name: profile.name, actor_role: profile.role,
      action: 'Patient registered', entity: 'patient', entity_id: code, detail: patient.name,
    })

    // NOTE: tempPassword is returned once for the registration slip and is NEVER
    // stored in any application table (only the bcrypt hash lives in auth.users).
    return json({ patient, loginId: code, tempPassword, portalEmail, appointment })
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500)
  }
})

// NxtHealth — multi-tenant isolation test.
// Proves Hospital A cannot read Hospital B's data and vice-versa (RLS).
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'
const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }
async function login(email, password) { const c = mk(); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`${email}: ${error.message}`); return c }

const run = async () => {
  console.log('\n=== NxtHealth multi-tenant isolation test ===\n')
  const A = await login('admin@nxthealth.demo', 'Admin@12345')      // Hospital A (HOSP-DEMO)
  const B = await login('admin-b@nxthealth.demo', 'AdminB@12345')   // Hospital B (HOSP-B)

  const aPatients = (await A.from('patients').select('id,patient_code,hospital_id')).data ?? []
  const bPatients = (await B.from('patients').select('id,patient_code,hospital_id')).data ?? []
  console.log(`[i] A sees ${aPatients.length} patients, B sees ${bPatients.length} patients`)
  ok(aPatients.length >= 6, 'Hospital A sees its own patients')
  ok(bPatients.length === 1, 'Hospital B sees only its single patient')

  const aHosp = aPatients[0]?.hospital_id, bHosp = bPatients[0]?.hospital_id
  ok(aHosp && bHosp && aHosp !== bHosp, 'A and B are different hospitals')
  ok(aPatients.every((p) => p.hospital_id === aHosp), 'every patient A sees belongs to Hospital A')
  ok(bPatients.every((p) => p.hospital_id === bHosp), 'every patient B sees belongs to Hospital B')

  // B tries to read a specific Hospital A patient by id → must be empty (RLS)
  const aId = aPatients[0].id
  const leak = (await B.from('patients').select('id').eq('id', aId)).data ?? []
  ok(leak.length === 0, 'Hospital B CANNOT read a Hospital A patient by id (RLS blocks it)')

  // A tries to read Hospital B patient by id → empty
  const bId = bPatients[0].id
  const leak2 = (await A.from('patients').select('id').eq('id', bId)).data ?? []
  ok(leak2.length === 0, 'Hospital A CANNOT read a Hospital B patient by id (RLS blocks it)')

  // B tries to INSERT a patient row tagged with Hospital A's id → must be rejected by RLS WITH CHECK
  const inj = await B.from('patients').insert({ hospital_id: aHosp, name: 'Injected', mobile: '9', gender: 'male', blood_group: 'O+' })
  ok(!!inj.error, 'Hospital B CANNOT insert a row into Hospital A (RLS WITH CHECK blocks cross-tenant write)')

  // Appointments / audit / bills are also tenant-scoped
  const aAppts = (await A.from('appointments').select('hospital_id')).data ?? []
  ok(aAppts.every((r) => r.hospital_id === aHosp), 'A only sees its own appointments')
  const bAudit = (await B.from('audit_logs').select('hospital_id')).data ?? []
  ok(bAudit.every((r) => r.hospital_id === bHosp), 'B only sees its own audit log')

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}
run().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })

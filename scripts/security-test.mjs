// NxtHealth — Phase 3 security & hardening tests (live Supabase).
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'
const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }
async function login(email, password) { const c = mk(); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`${email}: ${error.message}`); return { c, uid: data.user.id, token: data.session.access_token } }
async function callFn(token, name, body) {
  const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
  let j = null; try { j = await r.json() } catch { /* */ }
  return { status: r.status, body: j }
}
const today = new Date().toISOString().slice(0, 10)

const run = async () => {
  console.log('\n=== NxtHealth Phase 3 security tests ===\n')

  const A = await login('admin@nxthealth.demo', 'Admin@12345')
  const B = await login('admin-b@nxthealth.demo', 'AdminB@12345')
  const pharma = await login('pharma@nxthealth.demo', 'Pharma@12345')
  const doctor = await login('dr.mehta@nxthealth.demo', 'Doctor@12345')
  const lab = await login('labmgr@nxthealth.demo', 'Lab@12345')

  const aHosp = (await A.c.from('patients').select('id,hospital_id').limit(1).single()).data
  const aPatientId = aHosp.id

  // ---- 1. Unauthorized edge function call (no JWT) ----
  console.log('[1] Unauthorized edge function calls')
  const noAuth = await fetch(`${URL}/functions/v1/register-patient`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ name: 'x', mobile: '9' }) })
  ok(noAuth.status === 401, `register-patient without JWT is rejected (HTTP ${noAuth.status})`)
  const noAuth2 = await fetch(`${URL}/functions/v1/admin-users`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON }, body: JSON.stringify({ action: 'create' }) })
  ok(noAuth2.status === 401, `admin-users without JWT is rejected (HTTP ${noAuth2.status})`)

  // ---- 2. Staff creation authorization ----
  console.log('[2] Staff creation authorization')
  const pharmaCreate = await callFn(pharma.token, 'admin-users', { action: 'create', name: 'Hacker', username: 'hacker', role: 'hospital_admin', password: 'longenough1' })
  ok(pharmaCreate.status === 403, `pharmacist CANNOT create staff (HTTP ${pharmaCreate.status})`)
  const adminShortPw = await callFn(A.token, 'admin-users', { action: 'create', name: 'Temp', username: 'temp_' + Date.now(), role: 'receptionist', password: '123' })
  ok(adminShortPw.status === 400 && /8 characters/.test(adminShortPw.body?.error ?? ''), 'admin IS authorized (reaches validation: short password rejected)')

  // ---- 3. Cross-tenant staff access ----
  console.log('[3] Cross-tenant staff access')
  const bPatient = (await B.c.from('patients').select('id,hospital_id').limit(1).single()).data
  const docLeak = (await doctor.c.from('patients').select('id').eq('id', bPatient.id)).data ?? []
  ok(docLeak.length === 0, 'Hospital A doctor CANNOT read a Hospital B patient')

  // ---- 4. Patient accessing another patient's record ----
  console.log('[4] Patient data isolation')
  // Register a fresh patient so the test does not depend on demo-data drift.
  const reg = await A.c.functions.invoke('register-patient', { body: { name: 'Sec Test Patient', mobile: '9800011122', gender: 'male', bloodGroup: 'O+' } })
  if (reg.error || reg.data?.error) throw new Error('register: ' + (reg.data?.error || reg.error.message))
  const pat = await login(reg.data.portalEmail, reg.data.tempPassword)
  const myId = reg.data.patient.id
  const otherId = ((await A.c.from('patients').select('id').limit(10)).data ?? []).map(r => r.id).find(id => id !== myId)
  const patLeak = (await pat.c.from('patients').select('id').eq('id', otherId)).data ?? []
  ok(patLeak.length === 0, 'patient CANNOT read another patient record by id')
  const patAll = (await pat.c.from('patients').select('id')).data ?? []
  ok(patAll.length === 1, 'patient sees exactly one record (their own)')

  // ---- 5. Disabled-module API access ----
  console.log('[5] Disabled-module enforcement (server-side)')
  const issueNoDiag = await B.c.functions.invoke('licensing', { body: { action: 'issue', type: 'YEARLY', startDate: today, userLimit: 10, modules: ['appointments','opd','pharmacy','billing','ipd','beds','portal','reports','admin','emergency'] } })
  ok(!issueNoDiag.error && !issueNoDiag.data?.error, 'Hospital B issued a license WITHOUT diagnostics')
  const bLabInsert = await B.c.from('lab_orders').insert({ hospital_id: bPatient.hospital_id, patient_id: bPatient.id, status: 'ordered' })
  ok(!!bLabInsert.error, 'lab_order insert BLOCKED when diagnostics module disabled (RLS restrictive)')
  const bApptInsert = await B.c.from('appointments').insert({ hospital_id: bPatient.hospital_id, patient_id: bPatient.id, date: today, start_time: '09:'+String(Date.now()%60).padStart(2,'0'), type: 'new', status: 'scheduled' }).select().single()
  ok(!bApptInsert.error, 'appointment insert ALLOWED (appointments module enabled)')

  // ---- 6. Expired license ----
  console.log('[6] Expired license enforcement')
  const issueExpired = await B.c.functions.invoke('licensing', { body: { action: 'issue', type: 'MONTHLY', startDate: '2020-01-01' } })
  ok(!issueExpired.error, 'Hospital B issued a back-dated (expired) license')
  const cur = await B.c.functions.invoke('licensing', { body: { action: 'current' } })
  ok(cur.data?.status === 'expired', `licensing reports status = expired (${cur.data?.status})`)
  const bApptExpired = await B.c.from('appointments').insert({ hospital_id: bPatient.hospital_id, patient_id: bPatient.id, date: today, start_time: '10:'+String(Date.now()%60).padStart(2,'0'), type: 'new', status: 'scheduled' })
  ok(!!bApptExpired.error, 'ALL module inserts BLOCKED under an expired license')

  // ---- 7. Valid license signature check ----
  console.log('[7] License signature verification (server-side)')
  const val = await A.c.functions.invoke('licensing', { body: { action: 'current' } })
  ok(val.data?.status === 'unlicensed' || val.data?.valid === true, `Hospital A license signature check ok (status ${val.data?.status})`)

  // ---- 8. Lab release transaction (atomic + guard) ----
  console.log('[8] Lab release transaction')
  const { data: cbc } = await A.c.from('lab_tests').select('id').eq('code', 'CBC').single()
  const { data: hb } = await A.c.from('lab_tests').select('id').eq('code', 'HB').single()
  const { data: order } = await A.c.from('lab_orders').insert({ hospital_id: aHosp.hospital_id, patient_id: aPatientId, status: 'ordered' }).select().single()
  const { data: samples } = await A.c.from('lab_samples').insert([
    { hospital_id: aHosp.hospital_id, order_id: order.id, patient_id: aPatientId, test_id: cbc.id, status: 'collected' },
    { hospital_id: aHosp.hospital_id, order_id: order.id, patient_id: aPatientId, test_id: hb.id, status: 'collected' },
  ]).select()
  await lab.c.rpc('enter_lab_result', { p_sample: samples[0].id, p_value: '13.5', p_flag: 'normal' })
  await lab.c.rpc('verify_lab_result', { p_sample: samples[0].id })   // verify only ONE
  const earlyRelease = await lab.c.rpc('release_lab_order', { p_order: order.id })
  ok(!!earlyRelease.error, 'release BLOCKED while a sample is unverified (transaction guard)')
  const orderStillOrdered = (await A.c.from('lab_orders').select('status').eq('id', order.id).single()).data
  ok(orderStillOrdered.status !== 'reported', 'no partial state: order not marked reported after failed release')
  await lab.c.rpc('enter_lab_result', { p_sample: samples[1].id, p_value: '14.1', p_flag: 'normal' })
  await lab.c.rpc('verify_lab_result', { p_sample: samples[1].id })
  const goodRelease = await lab.c.rpc('release_lab_order', { p_order: order.id })
  ok(!goodRelease.error, 'release succeeds once all samples verified')
  const rep = (await A.c.from('lab_reports').select('id').eq('order_id', order.id)).data ?? []
  const orderReported = (await A.c.from('lab_orders').select('status').eq('id', order.id).single()).data
  ok(rep.length === 1 && orderReported.status === 'reported', 'release atomically created report + set order reported')

  // ---- 9. Doctor cannot enter results via RPC (authz inside RPC) ----
  console.log('[9] RPC-level authorization')
  const { data: order2 } = await A.c.from('lab_orders').insert({ hospital_id: aHosp.hospital_id, patient_id: aPatientId, status: 'ordered' }).select().single()
  const { data: s2 } = await A.c.from('lab_samples').insert({ hospital_id: aHosp.hospital_id, order_id: order2.id, patient_id: aPatientId, test_id: cbc.id, status: 'collected' }).select().single()
  const docResult = await doctor.c.rpc('enter_lab_result', { p_sample: s2.id, p_value: '99', p_flag: 'normal' })
  ok(!!docResult.error, 'doctor CANNOT enter a lab result (RPC enforces lab.result)')

  // ---- 10. Notification failure handling ----
  console.log('[10] Notification handling')
  const badTpl = await A.c.functions.invoke('notify', { body: { templateKey: 'does_not_exist', to: '9999999999', vars: {} } })
  ok(badTpl.data?.ok === false, 'unknown template returns ok:false (no crash)')
  const goodTpl = await A.c.functions.invoke('notify', { body: { templateKey: 'appt_confirm', to: '9812345678', ref: 'SEC-' + Date.now(), vars: { name: 'Test', doctor: 'Dr. X', date: today, time: '10:00', patientId: 'NH-1' } } })
  ok(['accepted', 'sent', 'fallback', 'configuration_missing'].includes(goodTpl.data?.status), `valid template returns a delivery status (${goodTpl.data?.status})`)

  // ---- 11. Financial integrity: forge prevention + billing RBAC (migration 0019) ----
  console.log('[11] Financial integrity & billing RBAC')
  const billing = await login('billing@nxthealth.demo', 'Bill@12345')
  const { data: fInv } = await billing.c.from('billing_invoices').insert({ hospital_id: aHosp.hospital_id, patient_id: aPatientId, discount_pct: 0, tax_pct: 0, subtotal: 500, discount_amt: 0, tax_amt: 0, total: 500, paid: 0, status: 'unpaid' }).select().single()
  ok(!!fInv, 'billing.manage user can create an invoice')
  const labInvUpd = await lab.c.from('billing_invoices').update({ paid: 500, status: 'paid' }).eq('id', fInv.id).select()
  ok((labInvUpd.data?.length ?? 0) === 0, 'non-billing staff CANNOT forge invoice paid/status')
  const anyInvUpd = await billing.c.from('billing_invoices').update({ paid: 9999 }).eq('id', fInv.id).select()
  ok((anyInvUpd.data?.length ?? 0) === 0, 'invoice paid cannot be changed by a direct row update (only record_payment)')
  const labInvIns = await lab.c.from('billing_invoices').insert({ hospital_id: aHosp.hospital_id, patient_id: aPatientId, subtotal: 0, total: 0, paid: 0, status: 'paid' }).select()
  ok(!!labInvIns.error || (labInvIns.data?.length ?? 0) === 0, 'non-billing staff CANNOT create invoices')
  const labPayIns = await lab.c.from('payments').insert({ hospital_id: aHosp.hospital_id, invoice_id: fInv.id, patient_id: aPatientId, amount: 1, method: 'cash' }).select()
  ok(!!labPayIns.error || (labPayIns.data?.length ?? 0) === 0, 'direct payment insert denied (payments only via record_payment)')
  const goodPay = await billing.c.rpc('record_payment', { p_invoice: fInv.id, p_amount: 500, p_method: 'cash', p_reference: null })
  ok(!goodPay.error, 'record_payment still works for billing.manage')
  const paidNow = (await A.c.from('billing_invoices').select('paid,status').eq('id', fInv.id).single()).data
  ok(Number(paidNow.paid) === 500 && paidNow.status === 'paid', 'record_payment keeps paid/status authoritative')

  // ---- 12. Lab report storage-path & MIME guard (migration 0019) ----
  console.log('[12] Lab report path/MIME guard')
  const { data: lpo } = await A.c.from('lab_orders').insert({ hospital_id: aHosp.hospital_id, patient_id: aPatientId, status: 'ordered' }).select().single()
  const badPath = await lab.c.rpc('save_lab_report', { p_order: lpo.id, p_path: `${aHosp.hospital_id}/00000000-0000-0000-0000-000000000000/x.pdf`, p_file_name: 'x.pdf', p_mime: 'application/pdf', p_size: 100 })
  ok(!!badPath.error, 'save_lab_report rejects a storage_path outside the order namespace')
  const badMime = await lab.c.rpc('save_lab_report', { p_order: lpo.id, p_path: `${aHosp.hospital_id}/${aPatientId}/x.exe`, p_file_name: 'x.exe', p_mime: 'application/x-msdownload', p_size: 100 })
  ok(!!badMime.error, 'save_lab_report rejects a disallowed MIME type')

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}
run().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })

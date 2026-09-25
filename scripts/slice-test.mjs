// NxtHealth — live vertical-slice integration test (against the real Supabase project)
// Registration → Patient ID → Portal account → Appointment → Consultation →
// Lab order → Result → Verify → Release → Patient reads report. Plus RLS checks.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'

const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }
async function login(email, password) {
  const c = mk()
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`login ${email}: ${error.message}`)
  return { c, uid: data.user.id }
}

const run = async () => {
  console.log('\n=== NxtHealth vertical-slice integration test ===\n')

  // 1) Reception registers a patient (+ appointment) via edge function
  console.log('[1] Receptionist registers a patient')
  const recep = await login('reception@nxthealth.demo', 'Recep@12345')
  const { data: docs } = await recep.c.from('doctors').select('id,name,department_id').eq('name', 'Dr. Anil Mehta').single()
  const n = Date.now()
  const slot = `${String(6 + (n % 16)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  const reg = await recep.c.functions.invoke('register-patient', {
    body: {
      name: 'Test Patient ' + Date.now().toString().slice(-5), mobile: '9800000001', gender: 'male',
      dob: '1990-05-05', bloodGroup: 'O+', address: 'Pune', allergies: 'None',
      appointment: { doctorId: docs.id, departmentId: docs.department_id, date: new Date().toISOString().slice(0, 10), time: slot, type: 'new' },
    },
  })
  if (reg.error) throw new Error('register-patient: ' + (reg.data?.error || reg.error.message))
  const R = reg.data
  ok(/^NH-\d{6}$/.test(R.loginId), `permanent Patient ID assigned by DB: ${R.loginId}`)
  ok(!!R.tempPassword, `portal temp password issued: ${R.tempPassword}`)
  ok(!!R.appointment?.id, `appointment created in same flow: ${R.appointment?.appt_code}`)
  const patientUuid = R.patient.id

  // 2) Double-booking prevention
  console.log('[2] Double-booking prevention')
  const dup = await recep.c.from('appointments').insert({
    hospital_id: R.patient.hospital_id, patient_id: patientUuid, doctor_id: docs.id,
    department_id: docs.department_id, date: R.appointment.date, start_time: R.appointment.start_time, type: 'new', status: 'scheduled',
  })
  ok(!!dup.error, 'second appointment for same doctor+slot is rejected')

  // 3) Doctor consults, prescribes, orders lab
  console.log('[3] Doctor consultation + prescription + lab order')
  const doc = await login('dr.mehta@nxthealth.demo', 'Doctor@12345')
  const { data: con, error: conErr } = await doc.c.from('consultations').insert({
    hospital_id: R.patient.hospital_id, patient_id: patientUuid, doctor_id: docs.id,
    complaints: 'Fever, cough 3 days', diagnosis: 'Viral URI', advice: 'Rest, fluids', follow_up_date: null,
  }).select().single()
  ok(!conErr && !!con, 'consultation saved')
  const { data: rx, error: rxErr } = await doc.c.from('prescriptions').insert({
    hospital_id: R.patient.hospital_id, patient_id: patientUuid, doctor_id: docs.id, status: 'sent_to_pharmacy',
  }).select().single()
  if (rxErr) { console.log('   prescription error:', rxErr.message); }
  await doc.c.from('prescription_items').insert({ hospital_id: R.patient.hospital_id, prescription_id: rx.id, medicine_name: 'Paracetamol 500mg', dosage: '500mg', frequency: '1-1-1', duration: '5 days', quantity: 15 })
  ok(/^RX-\d{6}$/.test(rx.rx_code), `prescription created: ${rx.rx_code}`)
  const { data: cbc } = await doc.c.from('lab_tests').select('id').eq('code', 'CBC').single()
  const { data: order } = await doc.c.from('lab_orders').insert({ hospital_id: R.patient.hospital_id, patient_id: patientUuid, doctor_id: docs.id, status: 'ordered' }).select().single()
  await doc.c.from('lab_samples').insert({ hospital_id: R.patient.hospital_id, order_id: order.id, patient_id: patientUuid, test_id: cbc.id, status: 'pending' })
  ok(/^LAB-\d{6}$/.test(order.order_code), `lab order created: ${order.order_code}`)

  // Doctor must NOT be able to enter a lab result (no lab.result perm)
  const { data: s0 } = await doc.c.from('lab_samples').select('id').eq('order_id', order.id).single()
  const docResult = await doc.c.from('lab_results').insert({ hospital_id: R.patient.hospital_id, sample_id: s0.id, order_id: order.id, patient_id: patientUuid, test_id: cbc.id, value: '99', status: 'completed' })
  ok(!!docResult.error, 'doctor is blocked by RLS from entering lab results')

  // 4) Lab manager: collect → result → verify → release
  console.log('[4] Lab manager processes the sample')
  const lab = await login('labmgr@nxthealth.demo', 'Lab@12345')
  const { data: sample } = await lab.c.from('lab_samples').select('*').eq('order_id', order.id).single()
  await lab.c.from('lab_samples').update({ status: 'collected', collected_at: new Date().toISOString(), collected_by: lab.uid }).eq('id', sample.id)
  const res = await lab.c.from('lab_results').insert({ hospital_id: sample.hospital_id, sample_id: sample.id, order_id: order.id, patient_id: patientUuid, test_id: cbc.id, value: '13.8', unit: 'g/dL', ref_range: '13-17', flag: 'normal', entered_by: lab.uid, entered_at: new Date().toISOString(), status: 'completed' })
  ok(!res.error, 'lab manager enters result (authorized)')
  await lab.c.from('lab_samples').update({ status: 'completed' }).eq('id', sample.id)
  await lab.c.from('lab_results').update({ status: 'verified', verified_by: lab.uid, verified_at: new Date().toISOString() }).eq('sample_id', sample.id)
  await lab.c.from('lab_samples').update({ status: 'verified' }).eq('id', sample.id)
  const now = new Date().toISOString()
  await lab.c.from('lab_results').update({ status: 'released', released_at: now }).eq('order_id', order.id).eq('status', 'verified')
  await lab.c.from('lab_samples').update({ status: 'released' }).eq('order_id', order.id).eq('status', 'verified')
  await lab.c.from('lab_orders').update({ status: 'reported' }).eq('id', order.id)
  await lab.c.from('lab_reports').insert({ hospital_id: sample.hospital_id, order_id: order.id, patient_id: patientUuid, released_by: lab.uid })
  const { data: relOrder } = await lab.c.from('lab_orders').select('status').eq('id', order.id).single()
  ok(relOrder.status === 'reported', 'report released (order status = reported)')

  // 5) Patient portal: read own released report + RLS isolation
  console.log('[5] Patient signs in to the portal')
  const pat = await login(R.portalEmail, R.tempPassword)
  const { data: myResults } = await pat.c.from('lab_results').select('value,unit,flag,released_at').not('released_at', 'is', null)
  ok((myResults?.length ?? 0) >= 1 && myResults[0].value === '13.8', `patient sees their released result: ${myResults?.[0]?.value} ${myResults?.[0]?.unit}`)
  const { data: myPatients } = await pat.c.from('patients').select('id')
  ok((myPatients?.length ?? 0) === 1 && myPatients[0].id === patientUuid, 'patient can see ONLY their own patient record (RLS)')
  const { data: myAppts } = await pat.c.from('appointments').select('id')
  ok((myAppts?.length ?? 0) >= 1, 'patient can see their own appointment')
  const others = await pat.c.from('audit_logs').select('id').limit(1)
  ok((others.data?.length ?? 0) === 0, 'patient cannot read audit logs (RLS)')

  // 6) Licensing (server-side) — validate current license as admin
  console.log('[6] Server-side licensing')
  const admin = await login('admin@nxthealth.demo', 'Admin@12345')
  const lic = await admin.c.functions.invoke('licensing', { body: { action: 'current' } })
  ok(!lic.error, `licensing edge function reachable (status: ${lic.data?.status})`)

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}

run().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })

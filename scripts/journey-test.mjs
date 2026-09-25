// NxtHealth — complete real user-journey test (live Supabase).
// Admin → register patient → portal account → appointment → notification →
// consultation → prescription → lab order → collect → result → verify → release
// → patient notification → patient login → patient sees own report/history →
// billing → payment → audit trail. Verifies RLS + notification msgid + audit.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'
const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }
async function login(email, password) { const c = mk(); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`${email}: ${error.message}`); return { c, uid: data.user.id } }
const today = new Date().toISOString().slice(0, 10)

const run = async () => {
  console.log('\n=== NxtHealth complete user-journey test ===\n')
  const admin = await login('admin@nxthealth.demo', 'Admin@12345')
  const doctor = await login('dr.mehta@nxthealth.demo', 'Doctor@12345')
  const lab = await login('labmgr@nxthealth.demo', 'Lab@12345')
  const billing = await login('billing@nxthealth.demo', 'Bill@12345')

  const doc = (await admin.c.from('doctors').select('id,department_id').eq('name', 'Dr. Anil Mehta').single()).data
  const cbc = (await admin.c.from('lab_tests').select('id').eq('code', 'CBC').single()).data

  // 1) register patient (+ appointment)
  console.log('[1] Admin registers patient + appointment')
  const slot = `${8 + (Date.now() % 10)}:${String(Date.now() % 60).padStart(2, '0')}`
  const reg = await admin.c.functions.invoke('register-patient', { body: { name: 'Journey Patient', mobile: '9800012345', gender: 'male', dob: '1991-03-03', bloodGroup: 'O+', appointment: { doctorId: doc.id, departmentId: doc.department_id, date: today, time: slot, type: 'new' } } })
  if (reg.error || reg.data?.error) throw new Error('register: ' + (reg.data?.error || reg.error.message))
  const R = reg.data, hospId = R.patient.hospital_id, pid = R.patient.id
  ok(/^NH-\d{6}$/.test(R.loginId), `permanent Patient ID ${R.loginId}`)
  ok(!!R.tempPassword && !!R.portalEmail, 'portal account + temp credentials created')
  ok(!!R.appointment?.appt_code, `appointment ${R.appointment?.appt_code}`)

  // 2) appointment notification (RCS via SMS Horizon; mock/fallback until key set)
  console.log('[2] Appointment notification')
  const notif = await admin.c.functions.invoke('notify', { body: { templateKey: 'appt_confirm', patientId: pid, to: R.patient.mobile, ref: R.appointment.appt_code, vars: { name: R.patient.name, doctor: 'Dr. Anil Mehta', date: today, time: slot, patientId: R.loginId } } })
  ok(['accepted', 'sent', 'fallback'].includes(notif.data?.status), `notification status ${notif.data?.status}`)
  const notifRow = (await admin.c.from('notifications').select('status,provider_message_id,client_ref,channel').eq('client_ref', R.appointment.appt_code).eq('template_key', 'appt_confirm').maybeSingle()).data
  ok(!!notifRow, 'notification row persisted with client_ref')
  ok(notifRow?.provider_message_id != null || notifRow?.status === 'fallback', 'provider msgid stored (or fallback recorded)')

  // 3) consultation + prescription + lab order
  console.log('[3] Consultation, prescription, lab order')
  const { data: con } = await doctor.c.from('consultations').insert({ hospital_id: hospId, patient_id: pid, doctor_id: doc.id, diagnosis: 'Viral fever', advice: 'Rest' }).select().single()
  ok(!!con, 'consultation persisted')
  const { data: rx } = await doctor.c.from('prescriptions').insert({ hospital_id: hospId, patient_id: pid, doctor_id: doc.id, consultation_id: con.id, status: 'sent_to_pharmacy' }).select().single()
  await doctor.c.from('prescription_items').insert({ hospital_id: hospId, prescription_id: rx.id, medicine_name: 'Paracetamol 500mg', dosage: '500mg', frequency: '1-1-1', duration: '5 days', quantity: 15 })
  const { data: order } = await doctor.c.from('lab_orders').insert({ hospital_id: hospId, patient_id: pid, doctor_id: doc.id, status: 'ordered' }).select().single()
  const { data: sample } = await doctor.c.from('lab_samples').insert({ hospital_id: hospId, order_id: order.id, patient_id: pid, test_id: cbc.id, status: 'collected' }).select().single()
  ok(!!rx.rx_code && !!order.order_code, `prescription ${rx.rx_code} + lab ${order.order_code}`)

  // 4) lab result → verify → release (atomic RPCs)
  console.log('[4] Lab result → verify → release')
  await lab.c.rpc('enter_lab_result', { p_sample: sample.id, p_value: '13.2', p_flag: 'normal' })
  await lab.c.rpc('verify_lab_result', { p_sample: sample.id })
  const rel = await lab.c.rpc('release_lab_order', { p_order: order.id })
  ok(!rel.error, 'report released via atomic RPC')

  // 5) billing + payment
  console.log('[5] Billing + payment')
  const { data: inv } = await billing.c.from('billing_invoices').insert({ hospital_id: hospId, patient_id: pid, discount_pct: 0, tax_pct: 0, subtotal: 400, discount_amt: 0, tax_amt: 0, total: 400, paid: 0, status: 'unpaid' }).select().single()
  await billing.c.from('billing_items').insert({ hospital_id: hospId, invoice_id: inv.id, kind: 'consultation', description: 'Consultation', qty: 1, unit_price: 400, amount: 400 })
  const payRes = await billing.c.rpc('record_payment', { p_invoice: inv.id, p_amount: 400, p_method: 'cash', p_reference: null })
  ok(!payRes.error, 'payment recorded via RPC')
  const paidInv = (await billing.c.from('billing_invoices').select('status,paid').eq('id', inv.id).single()).data
  ok(paidInv.status === 'paid' && Number(paidInv.paid) === 400, 'invoice marked paid')

  // 6) patient portal: own data only
  console.log('[6] Patient portal (own data only)')
  const pat = await login(R.portalEmail, R.tempPassword)
  ok((await pat.c.from('lab_results').select('value').not('released_at', 'is', null)).data?.[0]?.value === '13.2', 'patient sees own released lab result')
  ok(((await pat.c.from('prescriptions').select('id')).data ?? []).length >= 1, 'patient sees own prescription')
  ok(((await pat.c.from('billing_invoices').select('id')).data ?? []).length >= 1, 'patient sees own bill')
  ok(((await pat.c.from('appointments').select('id')).data ?? []).length >= 1, 'patient sees own appointment')
  ok(((await pat.c.from('patients').select('id')).data ?? []).length === 1, 'patient sees exactly one patient record (their own)')
  const otherId = ((await admin.c.from('patients').select('id').limit(10)).data ?? []).map(r => r.id).find(id => id !== pid)
  ok(((await pat.c.from('patients').select('id').eq('id', otherId)).data ?? []).length === 0, 'patient CANNOT read another patient')

  // 7) audit trail
  console.log('[7] Audit trail')
  const audit = (await admin.c.from('audit_logs').select('action').order('at', { ascending: false }).limit(50)).data ?? []
  const actions = new Set(audit.map(a => a.action))
  ok(actions.has('Patient registered'), 'audit: patient registration')
  ok(actions.has('Lab report released'), 'audit: lab report release')
  ok(actions.has('Payment received'), 'audit: payment')

  // 8) staff tenant scoping
  console.log('[8] Staff tenant scoping')
  const adminPatients = (await admin.c.from('patients').select('hospital_id')).data ?? []
  ok(adminPatients.every(p => p.hospital_id === hospId), 'admin only sees own-hospital patients')

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}
run().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })

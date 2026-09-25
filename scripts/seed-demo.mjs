// NxtHealth — SAFE demo/seed workflow.
//
// Populates the DEMO hospital (HOSP-DEMO) with a full patient journey using the
// app's real, RLS-scoped flows (so it can ONLY ever affect HOSP-DEMO — a signed-in
// hospital admin/staff cannot reach any other tenant or production data).
//
// USAGE (explicit action required — never runs by accident):
//   SEED_CONFIRM=HOSP-DEMO node scripts/seed-demo.mjs
//
// Target project is whatever VITE_SUPABASE_URL below points at. Review it before
// running. This script never deletes data; it only adds demo records.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'
const TARGET_HOSPITAL = 'HOSP-DEMO'

if (process.env.SEED_CONFIRM !== TARGET_HOSPITAL) {
  console.log(`\nNxtHealth demo seed — SAFE MODE\n`)
  console.log(`Target project : ${URL}`)
  console.log(`Target hospital: ${TARGET_HOSPITAL}`)
  console.log(`\nThis will ADD demo data (patients, appointments, consultations, prescriptions,`)
  console.log(`lab orders/results, bills, payments, an admission) to ${TARGET_HOSPITAL} only.`)
  console.log(`\nTo proceed, re-run with an explicit confirmation:\n`)
  console.log(`   SEED_CONFIRM=${TARGET_HOSPITAL} node scripts/seed-demo.mjs\n`)
  console.log(`Nothing was changed.\n`)
  process.exit(0)
}

const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
async function login(email, password) { const c = mk(); const { error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`${email}: ${error.message}`); const { data } = await c.auth.getUser(); return { c, uid: data.user.id } }
const today = new Date().toISOString().slice(0, 10)
const slot = (n) => `${String(8 + (n % 10)).padStart(2, '0')}:${String((n * 7) % 60).padStart(2, '0')}`

const run = async () => {
  console.log(`\nSeeding ${TARGET_HOSPITAL} at ${URL} …\n`)
  const admin = await login('admin@nxthealth.demo', 'Admin@12345')
  const recep = await login('reception@nxthealth.demo', 'Recep@12345')
  const doctor = await login('dr.mehta@nxthealth.demo', 'Doctor@12345')
  const lab = await login('labmgr@nxthealth.demo', 'Lab@12345')
  const billing = await login('billing@nxthealth.demo', 'Bill@12345')

  const hospId = (await admin.c.from('patients').select('hospital_id').limit(1).maybeSingle()).data?.hospital_id
    ?? (await admin.c.from('doctors').select('hospital_id').limit(1).single()).data.hospital_id
  const doc = (await admin.c.from('doctors').select('id,department_id').eq('name', 'Dr. Anil Mehta').single()).data
  const cbc = (await admin.c.from('lab_tests').select('id').eq('code', 'CBC').single()).data
  const hb = (await admin.c.from('lab_tests').select('id').eq('code', 'HB').single()).data

  const names = ['Kiran Joshi', 'Neha Kulkarni']
  const created = []
  for (let i = 0; i < names.length; i++) {
    const reg = await recep.c.functions.invoke('register-patient', {
      body: { name: names[i], mobile: '9800' + String(100000 + Date.now() % 900000).slice(0, 6), gender: i ? 'female' : 'male', dob: '1988-0' + (i + 1) + '-15', bloodGroup: i ? 'A+' : 'B+', address: 'Pune',
        appointment: { doctorId: doc.id, departmentId: doc.department_id, date: today, time: slot(Date.now() + i), type: 'new' } },
    })
    if (reg.error || reg.data?.error) throw new Error('register: ' + (reg.data?.error || reg.error.message))
    created.push(reg.data)
    console.log(`  patient ${reg.data.loginId} (${names[i]}) + appointment ${reg.data.appointment?.appt_code}`)
  }

  // Full clinical + billing journey for patient #1
  const p1 = created[0].patient
  const { data: con } = await doctor.c.from('consultations').insert({ hospital_id: hospId, patient_id: p1.id, doctor_id: doc.id, complaints: 'Fever, body ache', diagnosis: 'Viral fever', advice: 'Rest & fluids', follow_up_date: null }).select().single()
  const { data: rx } = await doctor.c.from('prescriptions').insert({ hospital_id: hospId, patient_id: p1.id, doctor_id: doc.id, consultation_id: con.id, status: 'sent_to_pharmacy' }).select().single()
  await doctor.c.from('prescription_items').insert({ hospital_id: hospId, prescription_id: rx.id, medicine_name: 'Paracetamol 500mg', dosage: '500mg', frequency: '1-1-1', duration: '5 days', quantity: 15 })
  const { data: order } = await doctor.c.from('lab_orders').insert({ hospital_id: hospId, patient_id: p1.id, doctor_id: doc.id, status: 'ordered' }).select().single()
  const { data: samples } = await doctor.c.from('lab_samples').insert([
    { hospital_id: hospId, order_id: order.id, patient_id: p1.id, test_id: cbc.id, status: 'collected' },
    { hospital_id: hospId, order_id: order.id, patient_id: p1.id, test_id: hb.id, status: 'collected' },
  ]).select()
  await lab.c.rpc('enter_lab_result', { p_sample: samples[0].id, p_value: '12.9', p_flag: 'normal' })
  await lab.c.rpc('enter_lab_result', { p_sample: samples[1].id, p_value: '13.7', p_flag: 'normal' })
  await lab.c.rpc('verify_lab_result', { p_sample: samples[0].id })
  await lab.c.rpc('verify_lab_result', { p_sample: samples[1].id })
  await lab.c.rpc('release_lab_order', { p_order: order.id })
  console.log(`  consultation + prescription ${rx.rx_code} + lab ${order.order_code} (released)`)

  const { data: inv } = await billing.c.from('billing_invoices').insert({ hospital_id: hospId, patient_id: p1.id, discount_pct: 0, tax_pct: 0, subtotal: 400, discount_amt: 0, tax_amt: 0, total: 400, paid: 0, status: 'unpaid' }).select().single()
  await billing.c.from('billing_items').insert({ hospital_id: hospId, invoice_id: inv.id, kind: 'consultation', description: 'Consultation — Dr. Anil Mehta', qty: 1, unit_price: 400, amount: 400 })
  await billing.c.rpc('record_payment', { p_invoice: inv.id, p_amount: 400, p_method: 'upi', p_reference: 'SEED-UPI' })
  console.log(`  invoice ${inv.invoice_code} paid`)

  // Admission for patient #2
  const bed = (await admin.c.from('beds').select('id,ward_id,label').eq('state', 'available').limit(1).maybeSingle()).data
  if (bed) {
    const { data: adm } = await admin.c.from('admissions').insert({ hospital_id: hospId, patient_id: created[1].patient.id, bed_id: bed.id, ward_id: bed.ward_id, doctor_id: doc.id, reason: 'Observation', status: 'admitted' }).select().single()
    await admin.c.from('beds').update({ state: 'occupied', patient_id: created[1].patient.id, admission_id: adm.id }).eq('id', bed.id)
    console.log(`  admitted ${created[1].loginId} to bed ${bed.label} (${adm.admission_code})`)
  }

  console.log(`\nDemo seed complete for ${TARGET_HOSPITAL}.\n`)
}
run().catch((e) => { console.error('\nSEED FAILED:', e.message); process.exit(1) })

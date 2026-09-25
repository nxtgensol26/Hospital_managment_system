// NxtHealth — GUARDED single live SMS Horizon RCS test.
// Sends ONE real appt_confirm via the messaging-test edge function (server-side,
// using the hospital's configured key) and prints the sanitized provider result.
// Never prints credentials. Runs only with an explicit confirmation:
//   RCS_LIVE=1 RCS_TEST_TO=<mobile> node scripts/rcs-live-test.mjs
import { createClient } from '@supabase/supabase-js'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'
const TO = process.env.RCS_TEST_TO || '9812345678'
const mask = (m) => (String(m).length <= 4 ? '****' : '******' + String(m).slice(-4))

if (process.env.RCS_LIVE !== '1') {
  console.log('\nGuarded live RCS test — nothing sent.')
  console.log('Run:  RCS_LIVE=1 RCS_TEST_TO=<mobile> node scripts/rcs-live-test.mjs\n')
  process.exit(0)
}

const run = async () => {
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error } = await c.auth.signInWithPassword({ email: 'admin@nxthealth.demo', password: 'Admin@12345' })
  if (error) throw new Error('login: ' + error.message)
  console.log(`\nSending ONE live appt_confirm to ${mask(TO)} …\n`)
  const res = await c.functions.invoke('messaging-test', {
    body: { action: 'send_test', to: TO, templateKey: 'appt_confirm', vars: { name: 'Live Test', doctor: 'Dr. Mehta', date: new Date().toISOString().slice(0, 10), time: '10:00', patientId: 'NH-000001' } },
  })
  console.log('messaging-test response (sanitized):', JSON.stringify(res.data ?? res.error, null, 2))
  const { data: row } = await c.rpc('get_messaging_config') // just to confirm auth works
  void row
}
run().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })

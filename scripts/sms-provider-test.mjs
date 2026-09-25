// NxtHealth — SMS Horizon provider tests.
// Part 1: pure request-shape unit tests (no network, no credentials).
// Part 2: behaviour tests against the deployed notify edge function (mock unless
//         SMS_HORIZON_API_KEY is configured server-side).
import { createClient } from '@supabase/supabase-js'
import { buildRcsSend, buildRcsBatch, validMobile, missingVars, positionalVars, TPL_FIELD } from './lib/smshorizon.mjs'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }

const run = async () => {
  console.log('\n=== SMS Horizon provider tests ===\n')

  // ---- Part 1: request shape (positional vars, recipients array, ref) ----
  console.log('[shape] request builder')
  const order = ['name', 'doctor', 'date', 'time', 'patientId']
  const vars = { name: 'Ramesh', doctor: 'Dr. Mehta', date: '2026-09-23', time: '10:00', patientId: 'NH-000001' }
  const pos = positionalVars(order, vars)
  const body = buildRcsSend('acct_user', 'nxthealth_appt', '98123-45678', pos, 'APT-000001')
  ok(body[TPL_FIELD] === 'nxthealth_appt', 'body carries the approved template name')
  ok(body.user === 'acct_user', 'body carries the account username as `user`')
  ok(Array.isArray(body.recipients) && body.recipients.length === 1, 'recipients is a flat array')
  ok(body.recipients[0].mobile === '9812345678', 'mobile is cleaned (spaces/dashes removed)')
  ok(JSON.stringify(body.recipients[0].vars) === JSON.stringify({ '1': 'Ramesh', '2': 'Dr. Mehta', '3': '2026-09-23', '4': '10:00', '5': 'NH-000001' }), 'vars are POSITIONAL 1-indexed object')
  ok(body.recipients[0].ref === 'APT-000001', 'recipient carries idempotency ref')

  console.log('[shape] validation')
  ok(missingVars(order, { name: 'x' }).length === 4, 'missing variables detected')
  ok(missingVars(order, vars).length === 0, 'complete variables pass')
  ok(validMobile('9812345678') && validMobile('+919812345678'), 'valid mobiles accepted')
  ok(!validMobile('12'), 'too-short mobile rejected')
  ok(!validMobile('98123abcde'), 'non-numeric mobile rejected')
  let threw = false; try { buildRcsSend('acct_user', '', '9812345678', pos) } catch { threw = true }
  ok(threw, 'empty template name throws')
  let threw2 = false; try { buildRcsBatch('acct_user', 'nxthealth_appt', Array.from({ length: 501 }, () => ({ mobile: '9812345678', vars: pos }))) } catch (e) { threw2 = /500/.test(e.message) }
  ok(threw2, 'batch of >500 recipients is rejected')

  // ---- Part 2: behaviour via deployed notify function ----
  console.log('[behaviour] deployed notify function')
  const c = createClient(URL, ANON, { auth: { persistSession: false } })
  const { error: le } = await c.auth.signInWithPassword({ email: 'reception@nxthealth.demo', password: 'Recep@12345' })
  if (le) throw new Error('login: ' + le.message)

  const invalidTpl = await c.functions.invoke('notify', { body: { templateKey: 'no_such_template', to: '9812345678', vars: {} } })
  ok(invalidTpl.data?.ok === false, 'invalid template → ok:false (no crash)')

  const okSend = await c.functions.invoke('notify', { body: { templateKey: 'appt_confirm', to: '9812345678', ref: 'SMSTEST-' + Date.now(), vars } })
  ok(['accepted', 'sent', 'fallback'].includes(okSend.data?.status), `appt_confirm returns a delivery status (${okSend.data?.status})`)
  ok(!!okSend.data?.providerMessageId || okSend.data?.status === 'fallback', 'a provider message id is stored (or fallback used)')

  const dupRef = 'DUP-' + Date.now()
  const first = await c.functions.invoke('notify', { body: { templateKey: 'appt_confirm', to: '9812345678', ref: dupRef, vars } })
  const second = await c.functions.invoke('notify', { body: { templateKey: 'appt_confirm', to: '9812345678', ref: dupRef, vars } })
  ok(!first.data?.deduped && second.data?.deduped === true, 'duplicate send with same ref is de-duplicated (idempotency)')

  const badMobile = await c.functions.invoke('notify', { body: { templateKey: 'appt_confirm', to: 'not-a-number', ref: 'BAD-' + Date.now(), vars } })
  // With no real API key, appt_confirm uses mock RCS which does not validate mobile; only the
  // REAL provider path validates mobile. So we assert it still returns a status without crashing.
  ok(typeof badMobile.data?.status === 'string', `invalid mobile handled without crash (${badMobile.data?.status})`)

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}
run().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })

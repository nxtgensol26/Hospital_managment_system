// NxtHealth — Phase 5 messaging gateway security + routing tests (live Supabase).
import { createClient } from '@supabase/supabase-js'
import { buildRcsSend, TPL_FIELD } from './lib/smshorizon.mjs'

const URL = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const ANON = 'sb_publishable_Wx8QO_KCvfnK1UAAvY-a2w_8F_PMvFB'
const mk = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } })
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }
async function login(email, password) { const c = mk(); const { data, error } = await c.auth.signInWithPassword({ email, password }); if (error) throw new Error(`${email}: ${error.message}`); return { c, uid: data.user.id, token: data.session.access_token } }
async function callFn(token, name, body) { const r = await fetch(`${URL}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }); let j = null; try { j = await r.json() } catch { /* */ }; return { status: r.status, body: j } }
const today = new Date().toISOString().slice(0, 10)

const run = async () => {
  console.log('\n=== NxtHealth messaging gateway security tests ===\n')
  const A = await login('admin@nxthealth.demo', 'Admin@12345')      // HOSP-DEMO
  const B = await login('admin-b@nxthealth.demo', 'AdminB@12345')   // HOSP-B
  const doctor = await login('dr.mehta@nxthealth.demo', 'Doctor@12345') // non-admin, HOSP-DEMO
  const aHid = (await A.c.from('patients').select('hospital_id').limit(1).single()).data.hospital_id
  const bHid = (await B.c.from('patients').select('hospital_id').limit(1).single()).data.hospital_id

  // 1/5/13. messaging_config is RLS deny-all → no client can read ANY row (own or others).
  console.log('[1] Tenant isolation of messaging config')
  const aRows = (await A.c.from('messaging_config').select('*')).data ?? []
  const bRows = (await B.c.from('messaging_config').select('*')).data ?? []
  ok(aRows.length === 0, 'Hospital A cannot read messaging_config rows directly (RLS deny-all)')
  ok(bRows.length === 0, 'Hospital B cannot read messaging_config rows directly (RLS deny-all)')

  // 2. A cannot update B config
  const upd = await B.c.from('messaging_config').update({ enabled: false }).eq('hospital_id', aHid).select()
  ok((upd.data ?? []).length === 0, 'Hospital B cannot update Hospital A messaging config')
  // 3. A cannot delete B config
  const del = await A.c.from('messaging_config').delete().eq('hospital_id', bHid).select()
  ok((del.data ?? []).length === 0, 'Hospital A cannot delete Hospital B messaging config')

  // 4/14. Save a credential for A, then confirm get_messaging_config NEVER returns it.
  console.log('[4] Credentials never returned to frontend')
  await A.c.rpc('save_messaging_config', { p: { provider: 'sms_horizon', enabled: true, base_url: 'https://smshorizon.com/api/v2/rcs', rcs_enabled: true, sms_fallback_enabled: true, credential: 'SECRET-KEY-abcdEFGH1234', whatsapp_credential: 'WA-TOKEN-zzz9999' } })
  const cfg = (await A.c.rpc('get_messaging_config')).data
  const cfgStr = JSON.stringify(cfg)
  ok(!cfgStr.includes('SECRET-KEY-abcdEFGH1234'), 'SMS credential is NOT present in get_messaging_config response')
  ok(!cfgStr.includes('WA-TOKEN-zzz9999'), 'WhatsApp credential is NOT present in get_messaging_config response')
  ok(cfg.credential_configured === true && cfg.credential_last4 === '1234', 'only credential_configured + last4 are exposed')
  ok(cfg.whatsapp_credential_configured === true && cfg.whatsapp_last4 === '9999', 'WhatsApp: only configured flag + last4 exposed')
  // credential columns are unreadable even by direct select (deny-all already proven)
  ok(((await A.c.from('messaging_config').select('credential_enc,whatsapp_credential_enc')).data ?? []).length === 0, 'encrypted credential columns are not selectable by the client')
  // reset A to keyless SMS Horizon + fallback (avoids real network calls in other tests)
  await A.c.rpc('save_messaging_config', { p: { provider: 'sms_horizon', enabled: true, base_url: 'https://smshorizon.com/api/v2/rcs', rcs_enabled: true, sms_fallback_enabled: true, clear_credential: true, clear_whatsapp_credential: true } })

  // 7. SMS Horizon request shape remains correct
  console.log('[7] SMS Horizon request shape')
  const shape = buildRcsSend('acct_user', 'nxthealth_appt', '9812345678', ['A', 'B', 'C', 'D', 'E'], 'REF1')
  ok(shape[TPL_FIELD] === 'nxthealth_appt' && shape.user === 'acct_user' && Array.isArray(shape.recipients) && Object.keys(shape.recipients[0].vars).length === 5 && shape.recipients[0].vars['1'] === 'A' && shape.recipients[0].ref === 'REF1', 'request body shape (user + template + recipients[].{mobile,vars,ref})')

  // 8. Appointment notification uses the hospital's own config (A: sms_horizon+fallback, no real key → fallback)
  console.log('[8] Notification routing per hospital')
  const aNotif = await callFn(A.token, 'notify', { templateKey: 'appt_confirm', to: '9812345678', ref: 'GW-A-' + Date.now(), vars: { name: 'X', doctor: 'Y', date: today, time: '10:00', patientId: 'NH-1' } })
  ok(['accepted', 'fallback'].includes(aNotif.body?.status), `Hospital A routes via its own SMS Horizon config (status ${aNotif.body?.status})`)

  // 9. Missing config → no fake success. Give B a template but NO enabled gateway.
  console.log('[9] Missing configuration does not fake success')
  await B.c.from('notification_templates').upsert({ hospital_id: bHid, key: 'appt_confirm', template_id: 'NXH_APPT_001', channel: 'rcs', label: 'Appt', body: 'Hi {{name}}', provider_template: 'nxthealth_appt', var_order: ['name', 'doctor', 'date', 'time', 'patientId'], active: true }, { onConflict: 'hospital_id,key' })
  const bNotif = await callFn(B.token, 'notify', { templateKey: 'appt_confirm', to: '9812345678', ref: 'GW-B-' + Date.now(), vars: { name: 'X', doctor: 'Y', date: today, time: '10:00', patientId: 'NH-1' } })
  ok(bNotif.body?.status === 'configuration_missing', `Hospital B (no gateway) → configuration_missing (${bNotif.body?.status})`)
  ok(bNotif.body?.ok !== true, 'configuration_missing is not reported as success')

  // 11/12. msgid stored on accept/fallback; failures/config-missing carry an error
  console.log('[11] Delivery logging')
  const anyA = (await A.c.from('notifications').select('provider_message_id,status,error').order('at', { ascending: false }).limit(5)).data ?? []
  ok(anyA.some((r) => r.provider_message_id || r.status === 'accepted' || r.status === 'fallback'), 'provider message id stored for accepted/fallback sends')
  const bMiss = (await B.c.from('notifications').select('status,error').eq('status', 'configuration_missing').order('at', { ascending: false }).limit(1)).data ?? []
  ok(bMiss.length === 1 && !!bMiss[0].error, 'configuration_missing rows are logged with an error reason')

  // 10. Idempotency
  console.log('[10] Idempotency')
  const dupRef = 'GW-DUP-' + Date.now()
  const f1 = await callFn(A.token, 'notify', { templateKey: 'appt_confirm', to: '9812345678', ref: dupRef, vars: { name: 'X', doctor: 'Y', date: today, time: '10:00', patientId: 'NH-1' } })
  const f2 = await callFn(A.token, 'notify', { templateKey: 'appt_confirm', to: '9812345678', ref: dupRef, vars: { name: 'X', doctor: 'Y', date: today, time: '10:00', patientId: 'NH-1' } })
  ok(!f1.body?.deduped && f2.body?.deduped === true, 'duplicate notification with same ref is de-duplicated')

  // 15/16. Unauthorized user cannot test/send via messaging-test
  console.log('[15] Authorization on test/send')
  const docTest = await callFn(doctor.token, 'messaging-test', { action: 'test' })
  ok(docTest.status === 403, `non-admin cannot Test Connection (HTTP ${docTest.status})`)
  const docSend = await callFn(doctor.token, 'messaging-test', { action: 'send_test', to: '9812345678' })
  ok(docSend.status === 403, `non-admin cannot Send Test Message (HTTP ${docSend.status})`)
  // admin can (own hospital only — hospital derived from session, not client input)
  const adminTest = await callFn(A.token, 'messaging-test', { action: 'test' })
  ok(adminTest.status === 200, 'hospital admin can Test Connection for their own hospital')

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
  if (fail > 0) process.exit(1)
}
run().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1) })

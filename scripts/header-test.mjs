// NxtHealth — production HTTP security-header test.
// Boots the real server (server/index.mjs) and asserts the intended headers on
// /, /health and a SPA route, incl. HSTS only over HTTPS and a CSP with no
// unsafe-eval. Uses node:http (no keep-alive) so process exit never races sockets.
import { spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = join(ROOT, 'server', 'index.mjs')
const PORT = 8300 + Math.floor(Math.random() * 600)
const SUPA = 'https://mcinemybxfqyrpgbnitj.supabase.co'
const results = []
const ok = (c, m) => { results.push([!!c, m]); console.log((c ? '  ✓ ' : '  ✗ FAIL: ') + m) }

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET', agent: false, headers }, (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (c) => { d += c }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: d }))
    })
    req.on('error', reject); req.end()
  })
}
async function waitForBoot(t = 50) { for (let i = 0; i < t; i++) { try { const r = await get('/health'); if (r.status === 200) return true } catch { /* */ } await new Promise((r) => setTimeout(r, 100)) } return false }

async function run() {
  console.log(`\nNxtHealth HTTP security-header test (port ${PORT})\n`)
  const child = spawn(process.execPath, [SERVER], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), VITE_SUPABASE_URL: SUPA }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''; child.stderr.on('data', (d) => { stderr += d })
  if (!await waitForBoot()) { ok(false, 'server started ' + stderr.slice(0, 200)); return finish(child) }
  ok(true, 'server started')

  for (const p of ['/health', '/', '/patient-portal']) {
    const r = await get(p)
    const csp = r.headers['content-security-policy'] || ''
    ok(csp.includes("default-src 'self'"), `${p}: CSP default-src 'self'`)
    ok(csp.includes("script-src 'self'"), `${p}: CSP script-src 'self'`)
    ok(!/unsafe-eval/.test(csp), `${p}: CSP has NO unsafe-eval`)
    ok(!/script-src[^;]*unsafe-inline/.test(csp), `${p}: script-src has NO unsafe-inline`)
    ok(r.headers['x-frame-options'] === 'DENY', `${p}: X-Frame-Options DENY`)
    ok(r.headers['x-content-type-options'] === 'nosniff', `${p}: X-Content-Type-Options nosniff`)
    ok(!!r.headers['referrer-policy'], `${p}: Referrer-Policy set`)
  }
  // CSP source specifics (checked once on /)
  const csp = (await get('/')).headers['content-security-policy'] || ''
  ok(csp.includes('https://fonts.googleapis.com') && csp.includes("style-src 'self' 'unsafe-inline'"), 'style-src allows Google Fonts + inline styles')
  ok(csp.includes('https://fonts.gstatic.com'), 'font-src allows Google Fonts files')
  ok(csp.includes(SUPA) && csp.includes('wss://mcinemybxfqyrpgbnitj.supabase.co'), 'connect-src includes Supabase https + wss')
  ok(csp.includes("frame-ancestors 'none'") && csp.includes("object-src 'none'"), "frame-ancestors + object-src 'none'")

  // HSTS: absent over plain HTTP, present when x-forwarded-proto=https (Render)
  const httpRes = await get('/health')
  ok(!httpRes.headers['strict-transport-security'], 'HSTS NOT sent over plain HTTP')
  const httpsRes = await get('/health', { 'x-forwarded-proto': 'https' })
  ok(/max-age=\d+/.test(httpsRes.headers['strict-transport-security'] || '') && /includeSubDomains/.test(httpsRes.headers['strict-transport-security'] || ''), 'HSTS sent (max-age + includeSubDomains) over HTTPS')

  try { child.kill('SIGKILL') } catch { /* */ }
  finish(child)
}
function finish() {
  const passed = results.filter((r) => r[0]).length
  console.log(`\n=== RESULT: ${passed} passed, ${results.length - passed} failed ===\n`)
  process.exitCode = passed === results.length ? 0 : 1
}
run().catch((e) => { console.error('FATAL:', e.message); process.exitCode = 1 })

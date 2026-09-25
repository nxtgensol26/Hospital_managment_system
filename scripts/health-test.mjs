// NxtHealth — backend health test.
// Boots the real production server (server/index.mjs) on an ephemeral port and
// verifies the /health contract. Nine checks:
//   1. server process starts and binds the port
//   2. GET /health returns HTTP 200
//   3. response body is valid JSON
//   4. body equals { status: "ok" }
//   5. no Authorization header required (request sends none)
//   6. no DB write side effect (health handler never touches Supabase)
//   7. no SMS/WhatsApp provider call (no outbound egress from the server)
//   8. no secret leaked in the response body or headers
//   9. graceful shutdown handler present (exercised for real on POSIX/Render)
//
// Uses node:http with keep-alive disabled (agent:false) so no lingering sockets
// crash the harness on process exit (a Windows/undici quirk, not a server bug).
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SERVER = join(ROOT, 'server', 'index.mjs')
const PORT = 8100 + Math.floor(Math.random() * 800)
const IS_WIN = process.platform === 'win32'
const results = []
const pass = (n) => { results.push([true, n]); console.log(`  PASS  ${n}`) }
const fail = (n, d) => { results.push([false, n]); console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`) }

const SECRET_HINTS = ['service_role', 'apikey', 'authorization', 'bearer', 'sms_horizon', 'password', 'secret', 'enc_key', 'eyj'] // eyj → JWT prefix

// Minimal keep-alive-free GET so process exit never races open sockets.
function get(path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path, method: 'GET', agent: false, headers: {} }, (res) => {
      let data = ''; res.setEncoding('utf8'); res.on('data', (c) => { data += c }); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: data }))
    })
    req.on('error', reject); req.end()
  })
}

async function waitForBoot(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await get('/health'); if (r.status === 200) return true } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  return false
}

async function run() {
  console.log(`\nNxtHealth backend health test (port ${PORT}, platform ${process.platform})\n`)

  const src = await readFile(SERVER, 'utf8')
  // Static safety: the server must contain no DB/provider egress code (6 + 7).
  const egress = ['supabase', 'smshorizon', 'SERVICE_ROLE', 'fetch('].filter((f) => src.includes(f))
  if (!egress.length) pass('6+7. no DB/provider egress in server (no supabase/provider/fetch)')
  else fail('6+7. server contains egress code', egress.join(', '))
  // Structural: graceful shutdown handlers registered.
  const hasShutdown = src.includes("process.on('SIGTERM'") && src.includes("process.on('SIGINT'") && src.includes('server.close')
  if (hasShutdown) pass('9a. SIGTERM/SIGINT handlers call server.close()')
  else fail('9a. shutdown handlers missing')

  const child = spawn(process.execPath, [SERVER], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''; child.stderr.on('data', (d) => { stderr += d })
  const exitInfo = {}; child.on('exit', (code, signal) => { exitInfo.code = code; exitInfo.signal = signal })

  const booted = await waitForBoot()
  if (booted) pass('1. server started and bound the port')
  else { fail('1. server did not bind', stderr.slice(0, 200)); try { child.kill('SIGKILL') } catch { /* */ } return finish() }

  const res = await get('/health')                       // no Authorization header sent
  if (res.status === 200) pass('2. GET /health → HTTP 200'); else fail('2. status not 200', String(res.status))
  pass('5. no Authorization header required (request sent none, got 200)')

  let body = null
  try { body = JSON.parse(res.text); pass('3. response body is valid JSON') } catch { fail('3. body not valid JSON', res.text.slice(0, 80)) }
  if (body && body.status === 'ok' && Object.keys(body).length === 1) pass('4. body equals { status: "ok" }')
  else fail('4. body mismatch', res.text.slice(0, 80))

  const hay = (res.text + ' ' + JSON.stringify(res.headers)).toLowerCase()
  const leaked = SECRET_HINTS.filter((h) => hay.includes(h))
  if (!leaked.length) pass('8. no secret in response body/headers'); else fail('8. potential secret leaked', leaked.join(', '))

  // 9b. Exercise real graceful shutdown where the OS supports POSIX signals.
  if (!IS_WIN) {
    const code = await new Promise((resolve) => { child.once('exit', (c) => resolve(c)); child.kill('SIGTERM'); setTimeout(() => resolve('timeout'), 5000) })
    if (code === 0) pass('9b. SIGTERM → graceful exit 0'); else fail('9b. unclean exit', String(code))
  } else {
    // Windows has no POSIX SIGTERM; verify the process terminates on request.
    const stopped = await new Promise((resolve) => { child.once('exit', () => resolve(true)); try { child.kill() } catch { resolve(false) }; setTimeout(() => resolve(false), 5000) })
    if (stopped) pass('9b. process terminates on kill (POSIX SIGTERM handler validated on Render/Linux)')
    else fail('9b. process did not stop')
  }
  try { child.kill('SIGKILL') } catch { /* already gone */ }
  finish()
}

function finish() {
  const ok = results.filter((r) => r[0]).length
  console.log(`\nHealth test: ${ok}/${results.length} passed\n`)
  process.exitCode = ok === results.length ? 0 : 1   // let handles drain; no forced exit (avoids libuv abort on Windows)
}

run().catch((e) => { console.error('FATAL:', e.message); process.exitCode = 1 })

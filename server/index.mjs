// NxtHealth — minimal production web server for Render (dependency-free).
//
// WHAT THIS DOES: serves the built SPA (dist/) and a lightweight /health probe.
// WHAT THIS DOES NOT DO: it holds NO business logic. All privileged/server-side
// work (provider calls, credential decryption, licensing, RBAC-enforced writes,
// tenant isolation) stays in Supabase Edge Functions + Postgres RLS. This server
// never sees the service-role key, SMS Horizon/WhatsApp credentials, or the
// license/encryption keys, and never touches the database.
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { join, normalize, extname, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HOST = '0.0.0.0'
const PORT = process.env.PORT || 8080
const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist')

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.map': 'application/json',
}

const server = http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent((req.url || '/').split('?')[0])

    // --- lightweight, unauthenticated health probe (no DB, no provider, no secrets) ---
    if (path === '/health' || path === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' })
      res.end(JSON.stringify({ status: 'ok' }))
      return
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'method not allowed' })); return
    }

    // --- static SPA hosting from dist/ (with SPA fallback to index.html) ---
    const rel = path === '/' ? '/index.html' : path
    const filePath = normalize(join(DIST, rel))
    if (!filePath.startsWith(DIST)) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'forbidden' })); return } // path-traversal guard
    try {
      const s = await stat(filePath)
      if (s.isFile()) {
        const data = await readFile(filePath)
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' })
        res.end(req.method === 'HEAD' ? undefined : data)
        return
      }
    } catch { /* fall through to SPA index */ }
    try {
      const idx = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(req.method === 'HEAD' ? undefined : idx)
    } catch {
      // dist not built yet — /health still works; do not leak paths/stack.
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    }
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'internal error' })) // safe error, no stack/secret
  }
})

server.listen(PORT, HOST, () => console.log(`NxtHealth web server listening on ${HOST}:${PORT}`))

function shutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 10000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

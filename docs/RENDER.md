# NxtHealth on Render

Render hosts **only** the built React SPA and a lightweight `/health` probe
(`server/index.mjs`). It runs **no business logic**. Notifications, SMS Horizon /
WhatsApp routing, credential decryption, licensing, RBAC-enforced writes and
tenant isolation all stay in **Supabase Edge Functions + Postgres RLS** and are
NOT duplicated here.

## What Render is NOT used for
- No database — Supabase Postgres remains the only DB. Do not create Render Postgres.
- No Auth — Supabase Auth remains the identity provider.
- No provider calls — SMS Horizon / WhatsApp requests stay in the `notify` edge
  function. Render's cold starts must never sit in the SMS delivery path.
- No secrets — the service-role key, SMS Horizon / WhatsApp credentials and the
  messaging / license encryption keys are never placed on Render.

## Environment variable NAMES (values live only in the dashboard)
Build-time, injected into the SPA by Vite (all PUBLIC / safe for browsers):
- `VITE_DATA_MODE` — set to `supabase`
- `VITE_SUPABASE_URL` — public project URL
- `VITE_SUPABASE_ANON_KEY` — anon / publishable key only (never service-role)

Runtime:
- `PORT` — injected automatically by Render; the server binds `0.0.0.0:$PORT`
- `NODE_VERSION` — `24`

> The server itself reads only `PORT`. It never reads any Supabase or provider secret.

## Deploy
Blueprint: [`render.yaml`](../render.yaml). Web service, Node runtime, free plan.
- Build: `npm ci && npm run build`
- Start: `npm start` → `node server/index.mjs`
- Health check path: `/health` → `{"status":"ok"}` (HTTP 200, unauthenticated,
  no DB, no provider call, no secrets)

## Free plan behaviour
- The service sleeps after ~15 min idle and cold-starts (~30–50 s) on the next
  request. This affects only SPA/`/health` first-byte latency.
- Because SMS/notifications run in Supabase Edge Functions (always warm,
  independent of Render), **messaging is unaffected by Render sleep**.
- Keep-alive self-pinging is **deliberately not implemented**. It would keep the
  instance awake but (a) burns the free-plan monthly hours, (b) is discouraged by
  Render, and (c) provides no benefit to messaging, which does not run here. If
  ever needed, prefer an external uptime monitor or a paid always-on plan rather
  than a self-ping cron.

## Verify locally
```bash
npm run build
npm start                 # serves dist/ + /health on :8080 (or $PORT)
npm run test:health       # 9-point health-contract test
```

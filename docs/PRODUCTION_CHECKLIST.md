# NxtHealth — Production / Pilot Deployment Checklist

> Lists configuration **names** only. Never commit or print secret **values**.

## 1. Frontend config (`.env` — public values only)
- `VITE_DATA_MODE` = `supabase`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (publishable/anon key — safe for the browser)

The service-role key, the license signing key and the SMS Horizon API key are **never** in the frontend or the repo.

## 2. Supabase Edge Function secrets (server-side only)
Set with `supabase secrets set <NAME>=<value>` — values never in git/docs/logs.
- `SMS_HORIZON_API_KEY` — SMS Horizon RCS bearer token
- `SMS_HORIZON_URL` — *(optional)* override for the RCS base URL (defaults to `https://smshorizon.com/api/v2/rcs`)
- `SMS_HORIZON_TEMPLATE_FIELD` — *(optional)* JSON field name that carries the approved template name (defaults to `template`)
- Auto-injected by the platform (do not set manually): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## 3. Database secrets (server-side, in `public.app_secrets`, RLS deny-all)
- `license_signing_key` — HMAC key used by the `licensing` edge function (never leaves the server)

## 4. Authentication (Supabase dashboard → Authentication)
- [ ] Custom **SMTP** sender configured (reliable password-reset / confirmation email)
- [ ] **Password reset** flow verified end-to-end (app has "Forgot password" → recovery screen)
- [ ] **Leaked-password protection** enabled (HaveIBeenPwned)
- [ ] **MFA / TOTP** enabled for staff
- [ ] Session security reviewed (JWT expiry, refresh rotation)
- [ ] **Rate limits / CAPTCHA** reviewed for public sign-in / attack protection

## 5. Licensing (server-side, enforced)
- [ ] Production license issued per hospital via **License Manager → Issue** (or `licensing` edge fn)
- [ ] Signing configured (`license_signing_key` present in `app_secrets`)
- [ ] Hospital binding verified (license `hospital_id` = tenant)
- [ ] Expiry enforcement verified (`hospital_has_module` blocks on expiry)
- [ ] Module enforcement verified (RESTRICTIVE RLS insert policies + RPC checks)

## 6. SMS Horizon (RCS)
- [ ] `SMS_HORIZON_API_KEY` set as an edge secret
- [ ] Approved RCS templates configured in `public.notification_templates`:
      - `appt_confirm` → `nxthealth_appt` (**approved**), `var_order = [name, doctor, date, time, patientId]`
      - remaining 7 types → set `provider_template` + `var_order` once each template is approved (currently PENDING → mock provider + logging)
- [ ] Webhook / delivery-callback: **not configured** — official callback payload schema + callback auth still required (see `docs/BACKEND.md` and the `/status` endpoint). Do not enable until the schema is provided.
- [ ] Delivery logging verified (`notifications.provider_message_id` / `status` / `error`)

## 7. Data / tenancy
- [ ] RLS enabled on all tables (tenant + patient isolation) — verified by `tenant-test.mjs`
- [ ] Backups / PITR enabled (see `docs/BACKEND.md` → Backup & recovery)
- [ ] Demo/seed data kept OUT of production (`scripts/seed-demo.mjs` requires `SEED_CONFIRM=HOSP-DEMO`)

## 8. Verify before go-live
```
npm run typecheck
npm run build
node scripts/slice-test.mjs
node scripts/tenant-test.mjs
node scripts/security-test.mjs
node scripts/sms-provider-test.mjs
node scripts/journey-test.mjs
```

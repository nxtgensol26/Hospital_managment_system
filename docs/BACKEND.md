# NxtHealth — Phase 2 Backend (Supabase)

Production data/backend foundation for NxtHealth. The React frontend talks to a
service/repository layer; that layer talks to Supabase (Postgres + Auth +
Storage + RLS). The localStorage store remains as **DEV/DEMO mode**.

```
React UI  →  services / Repository  →  Supabase
                                       ├── PostgreSQL (normalized schema)
                                       ├── Auth (bcrypt, sessions)
                                       ├── Storage (private buckets, signed URLs)
                                       └── Row Level Security (tenant + patient isolation)
                                       └── Edge Functions (privileged ops, service role)
```

- Project ref: `mcinemybxfqyrpgbnitj` · region `ap-south-1` · URL `https://mcinemybxfqyrpgbnitj.supabase.co`
- Backend selected by `VITE_DATA_MODE` (`local` | `supabase`).

## Switching backends
`src/data/index.ts` returns `LocalRepository` or `SupabaseRepository` based on
`VITE_DATA_MODE`. UI/business code depends only on the `Repository` interface
(`src/data/repository.ts`), so swapping backends changes no screens.

## Migrations (`supabase/migrations/`)
| File | Contents |
|------|----------|
| `0001_schema.sql` | All tables, multi-tenancy (`hospital_id`), per-hospital ID generation (`next_code` + triggers) |
| `0002_functions.sql` | RLS context helpers, `handle_new_user` (auth→profile sync), `dispense_prescription` & `record_payment` RPCs |
| `0003_rls.sql` | RLS enabled on every table; staff-same-hospital + patient-own + role-specific policies |
| `0004_hardening.sql` | `search_path` pinning; revoke anon/public on internal SECURITY DEFINER funcs |
| `0005_storage.sql` | Private buckets + storage RLS (path `{hospital_id}/{patient_id}/…`) |
| `0006_seed.sql` | Roles, permissions, role_permissions, demo hospital + catalogs |
| `0007_demo_auth.sql` | Demo Auth users (bcrypt via pgcrypto) — staff + one patient |
| `0008_secrets.sql` | `app_secrets` (deny-all) with the license signing key |
| `0009_fix_next_code.sql` | `next_code` → SECURITY DEFINER (counter table is deny-all) |

## Edge Functions (`supabase/functions/`)
Run with the service-role key **server-side only**; authorization is derived
from the caller's JWT, never from request-body ids.

- **register-patient** — creates the patient row + portal Auth account (Auth Admin API), optional appointment, audit entry. Returns Patient ID + temp password.
- **licensing** — `current` / `validate` / `start_trial` / `issue`. HMAC-signs with the key from `app_secrets`. The 15-day trial is enforced by `hospitals.trial_used` (server-side; clearing browser storage cannot reset it).
- **notify** — NotificationService. Resolves the approved template, renders it, delivers via provider (SmsHorizon / Mock), RCS→SMS fallback server-side, logs to `notifications`.

## Authentication
Supabase Auth owns credentials (bcrypt, sessions, refresh). `handle_new_user`
mirrors each auth user into `public.users` with `role` + `hospital_id` from
`app_metadata` (set only by trusted server code). Patient portal accounts use a
synthetic email `{patient_code}@patients.nxthealth.local`; the UI maps the
Patient ID a patient types to that email. First login forces a password change.

## Row Level Security (tenant + patient isolation)
- Every hospital-owned table: staff may read/write **only** rows where `hospital_id = current_hospital_id()` (derived from the session, via a SECURITY DEFINER helper — no client input trusted).
- Patients: read-only access to **their own** records only (`current_patient_id()`), and released lab results only.
- Payments: insert-only (no update/delete policy) → immutable/auditable.
- Lab results: insert/verify restricted to `lab.result` / `lab.verify` permissions.
- Licenses / audit / secrets: no client write policies — server (edge / service role) only.

Verified by `scripts/slice-test.mjs` (15/15 checks): a doctor is blocked from
entering lab results, and a patient sees only their own patient row and cannot
read audit logs.

## Storage
Private buckets: `lab-reports`, `prescriptions`, `patient-documents`,
`discharge-documents`. Object path convention `{hospital_id}/{patient_id}/{file}`.
No public access — files are retrieved via short-lived **signed URLs**. Storage
RLS mirrors DB isolation (staff → own hospital; patient → own folder).

## Environment variables
Frontend (`.env`, public only):
```
VITE_DATA_MODE=supabase
VITE_SUPABASE_URL=https://mcinemybxfqyrpgbnitj.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```
Server-side (Supabase-injected into edge functions automatically):
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
Optional edge secrets (set with `supabase secrets set`, never in the repo):
`SMS_HORIZON_URL`, `SMS_HORIZON_API_KEY`. The **service-role key and license
signing key are never in the frontend.**

## Backup & recovery strategy
- **Managed automatic backups:** Supabase takes daily backups of the Postgres
  database (retention per plan; Free = 1 day / logical, Pro = 7 days + PITR
  add-on). Enable **Point-in-Time Recovery** on Pro for production.
- **Migrations as code:** the entire schema/RLS/policies live in
  `supabase/migrations/` (version-controlled) — the database is reproducible on
  any project with `supabase db push`.
- **Manual/logical dumps:** schedule `pg_dump` (or `supabase db dump`) to
  off-site object storage for an independent copy; test restores quarterly.
- **Storage:** enable bucket versioning/replication for medical documents;
  include the buckets in the off-site backup routine.
- **Secrets:** `app_secrets` (signing key) and edge secrets are backed up
  separately and rotated on a schedule; rotating the signing key re-issues
  licenses.

## Demo credentials (Supabase mode)
Staff sign in with email; patients with Patient ID.
| Role | Email | Password |
|------|-------|----------|
| Hospital Admin | admin@nxthealth.demo | Admin@12345 |
| Doctor | dr.mehta@nxthealth.demo | Doctor@12345 |
| Receptionist | reception@nxthealth.demo | Recep@12345 |
| Lab Manager | labmgr@nxthealth.demo | Lab@12345 |
| Pharmacist | pharma@nxthealth.demo | Pharma@12345 |
| Billing | billing@nxthealth.demo | Bill@12345 |
| Patient | NH-000001 | Portal@123 (forces change) |

## Phase 3 hardening (added)
- **Server-side module + license enforcement:** `hospital_has_module()` (SECURITY DEFINER) checks the hospital's latest license (expiry + status + module list; no license = onboarding-open). RESTRICTIVE RLS `insert` policies on `appointments / lab_orders / lab_samples / prescriptions / billing_invoices / admissions` AND-in the module check, so a disabled or expired module cannot be used even by calling the REST API directly. `dispense_prescription` / `record_payment` also check the module inside the RPC.
- **Atomic lab pipeline RPCs:** `enter_lab_result`, `verify_lab_result`, `release_lab_order` (SECURITY DEFINER). Release verifies every sample is verified, then releases results + samples + order + creates the report + writes the audit event in **one transaction** — no partial state; notification is fired after (failure never rolls back the release).
- **Admin staff provisioning:** `admin-users` edge function (create / activate / deactivate) via the Auth Admin API — caller must hold `admin.users`, `hospital_id` is forced to the caller's hospital, rate-limited, audited. The browser never gets the service-role key.
- **Edge function hardening:** every function does JWT auth → profile/permission check → tenant derivation from session → input validation → `rate_limit()` (fixed-window, `rate_limits` table). `register-patient` validates name/mobile; `notify` logs `provider_message_id` / `error`.
- **Grants locked down:** trigger functions, lab RPCs and `log_audit` are revoked from `anon`/`public` (and trigger/log helpers from `authenticated`); only the intended RPCs remain callable by signed-in staff.
- **Auth:** password-reset flow (Login → "Forgot password" → `resetPasswordForEmail`; `PASSWORD_RECOVERY` opens a set-new-password screen). Login/logout write audit rows. `last_login_at` updated on sign-in.
- **Audit coverage:** patient/appointment/consultation/prescription/lab result+verify+release/billing/payment/admission/discharge/staff-create/license-activation/settings/support/login/logout all write to `audit_logs`.

## Manual Supabase dashboard configuration required
These are project-level Auth settings not settable from app code — do them in the Supabase dashboard before go-live:
1. **Leaked-password protection:** Auth → Policies → enable "Check against HaveIBeenPwned".
2. **MFA (TOTP):** Auth → Multi-Factor → enable TOTP for staff (the app uses Supabase Auth, so enabling it there activates enrollment; a staff enrollment screen can be added in a later pass).
3. **Email/SMTP:** Auth → configure a custom SMTP sender so password-reset and confirmation emails deliver reliably (the default sender is rate-limited).
4. **SMS Horizon:** set edge secrets `SMS_HORIZON_URL` and `SMS_HORIZON_API_KEY` (`supabase secrets set …`) using the real SMS Horizon account. Until then `notify` uses the mock provider and logs delivery.
5. **Auth rate limits / Attack protection:** review Auth → Rate Limits and enable CAPTCHA if exposing sign-in publicly.

## Production security limitations (current)
- License signing uses **HMAC** with a server-side key (in `app_secrets`). For
  strongest guarantees, move to **asymmetric** signing (Ed25519/RSA) with the
  private key in a dedicated signing service/KMS; the verify seam is already
  isolated in the `licensing` function.
- Enable Supabase Auth **leaked-password protection** (HaveIBeenPwned) and MFA
  in the dashboard.
- Some lab release / status transitions are multi-statement from the client;
  wrap them in SECURITY DEFINER RPCs for full transactional guarantees before
  high-volume production use.
- Rate-limiting / WAF on edge functions and Auth is recommended for production.

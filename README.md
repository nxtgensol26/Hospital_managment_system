# NxtHealth — Hospital Management System

**Powered by NxtGenSol** · _One Patient. One Journey. One Connected Hospital._

A production-grade, module-based Hospital Management System covering the full
hospital workflow: licensing, patient master records, appointments, OPD/IPD,
diagnostics, pharmacy, billing, emergency, bed management, a patient portal,
notifications, audit logging and role-based access control.

- **Product:** NxtHealth
- **Company:** NxtGenSol
- **Support:** 9422578575 · support@nxtgensol.co.in

---

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production bundle
npm run preview  # preview the production build
```

### First run
1. Startup animation → **License Activation** screen.
2. Click **Start 15-Day Free Trial** (Hospital ID e.g. `HOSP-DEMO`) — or paste a
   license token generated in **Admin → License Manager**.
3. Sign in with a demo staff account (see below).

### Demo staff accounts
| Role | Username | Password |
|------|----------|----------|
| Hospital Admin | `admin` | `admin123` |
| Doctor | `dr.mehta` | `doctor123` |
| Receptionist | `reception` | `recep123` |
| Nurse | `nurse` | `nurse123` |
| Lab Technician | `labtech` | `lab123` |
| Lab Manager | `labmgr` | `lab123` |
| Pharmacist | `pharma` | `pharma123` |
| Billing | `billing` | `bill123` |
| Super Admin | `superadmin` | `admin123` |

**Patient portal demo:** `NH-000001` / `Nxt-demo1` (forces password change on first login).

---

## Architecture

The app is deliberately layered so business logic never lives in UI components,
and so the persistence, licensing and notification backends can be swapped for
real servers without touching feature code.

```
src/
  config.ts              Branding, support details, module keys (single source of truth)
  types.ts               All normalized domain entities (mirror the DB schema)
  lib/
    crypto.ts            Self-contained SHA-256 / HMAC — password hashing + license signing
    rbac.ts              Permissions + role→permission matrix
    format.ts            ID formatting (NH-000001, APT-…, INV-…), dates, currency
    selectors.ts         Derived data: patient timeline, dashboard stats, friction map
    print.ts             Branded printable docs (slip, Rx, report, invoice, receipt, discharge)
  store/
    db.ts                Repository layer — the ONLY module touching localStorage
    auth.ts              Centralized authentication + session
    toast.ts             UI notifications
  services/
    license.ts           Signed-token licensing (verify() isolated for prod key swap)
    notification.ts      Provider-agnostic messaging (RCS → SMS fallback, WhatsApp stub)
    audit.ts             Immutable audit trail
    hospital.ts          All domain operations (register, book, order lab, dispense, bill…)
  components/            Reusable UI (Logo, ui primitives, charts, layout shell)
  features/              One folder per module (screens only — call services)
```

### Licensing (not a frontend boolean)
Licenses are **signed tokens** (`NXHLIC.<base64url({payload, signature})>`).

- **Dev signer:** `HMAC-SHA256(DEV_KEY, canonicalPayload)` — clearly marked, in
  `services/license.ts`.
- **Production:** the payload is signed **server-side** by NxtGenSol with an
  asymmetric private key (RSA / Ed25519); NxtHealth verifies with the bundled
  public key. Only `sign()` / `verifySignature()` change — activation, status,
  expiry warnings and every screen stay identical.

Each license carries: product, hospital ID, hospital name, type
(`TRIAL / MONTHLY / YEARLY / LIFETIME`), start/expiry dates, user limit, enabled
modules and status. A hospital gets exactly **one** 15-day trial; expiry
warnings fire at **7 / 3 / 1** days, and protected modules lock on expiry.

### Notifications (replaceable service)
Feature code calls `notify(templateKey, ctx)` — never a gateway. The service
resolves an approved template ID, renders `{{placeholders}}`, tries **RCS**, and
falls back to **SMS Horizon**; a **WhatsApp** provider stub is wired in for the
future. Templates: `registration, appt_confirm, appt_reminder, appt_cancel,
lab_collected, lab_ready, prescription_ready, bill_generated, payment_receipt,
followup_reminder, discharge`.

### Data & backend swap
`store/db.ts` is the single persistence boundary (currently localStorage).
Replace `load()` / `persist()` and the `update()` mutator with API calls to move
to a real backend; the normalized entities in `types.ts` map 1:1 to database
tables (`users, roles, patients, appointments, visits, lab_orders, lab_samples,
prescriptions, medicines, beds, admissions, bills, payments, notifications,
licenses, audit_logs, …`).

---

## Feature map

- **Control Room** — live KPIs, revenue & footfall trends, bed occupancy, alerts.
- **Patients** — permanent `NH-000001` IDs, registration with auto portal
  credentials + printable slip, profile with a visual **health timeline**.
- **Appointments / OPD Queue** — booking, check-in, consultation flow.
- **Consultations** — vitals, complaints, diagnosis, prescription, lab orders,
  follow-up; auto-routes Rx to pharmacy.
- **Diagnostics** — order → collect → result → verify → release → report (PDF/print).
- **Pharmacy** — Rx queue, FEFO dispensing, batches, low-stock & expiry alerts,
  purchase entry.
- **Billing** — multi-category invoices, discount/tax, payments, receipts.
- **Beds / IPD** — bed board with all states, admission, nursing notes, discharge summary.
- **Emergency** — rapid triage registration.
- **Reports & Flow** — patient **friction map** (operational, not clinical), workload.
- **Patient Portal** — dashboard, profile, appointments, prescriptions, lab
  reports, bills, follow-ups, timeline, notifications.
- **Admin** — hospital setup, departments/doctors, lab & medicine masters,
  notification templates, users & roles, **License Manager** (dev generator).
- **Support** — ticketing (`NXH-YYYY-NNNNNN`) + contact details.
- **Audit Log** — every sensitive action, immutable.

---

## Security notes (production checklist)
- Move persistence to an HTTPS API with server-side authorization per role.
- Sign licenses with a private key kept only on NxtGenSol servers.
- Store password hashes with a slow KDF (bcrypt/argon2) server-side.
- No public medical-report URLs; enforce patient data isolation.
- Keep provider secrets (SMS/RCS) in environment variables, never in the client.

© NxtGenSol · NxtHealth

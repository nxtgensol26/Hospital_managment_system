-- ============================================================================
-- NxtHealth — 0001 schema
-- Core tables, multi-tenancy, per-hospital ID generation.
-- Every hospital-owned table carries hospital_id for tenant isolation (RLS in 0003).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table if not exists public.hospitals (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,                 -- human hospital id, e.g. HOSP-DEMO
  name          text not null,
  address       text,
  city          text,
  phone         text,
  email         text,
  logo_url      text,
  gst_number    text,
  registration_no text,
  trial_used    boolean not null default false,       -- server-enforced one-trial rule
  trial_started_at timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.hospital_settings (
  hospital_id   uuid primary key references public.hospitals(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now()
);

-- Per-hospital atomic counters for human-friendly codes (NH-000001, APT-000001, …)
create table if not exists public.hospital_counters (
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  key           text not null,
  value         bigint not null default 0,
  primary key (hospital_id, key)
);

-- Atomically allocate and format the next code for a (hospital, key).
create or replace function public.next_code(p_hospital uuid, p_key text, p_prefix text, p_width int)
returns text
language plpgsql
as $$
declare v bigint;
begin
  insert into public.hospital_counters(hospital_id, key, value)
  values (p_hospital, p_key, 1)
  on conflict (hospital_id, key)
  do update set value = public.hospital_counters.value + 1
  returning value into v;
  return p_prefix || lpad(v::text, p_width, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- RBAC reference data
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  key   text primary key,
  label text not null
);

create table if not exists public.permissions (
  key   text primary key,
  label text
);

create table if not exists public.role_permissions (
  role_key       text not null references public.roles(key) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

-- App user profile. id === auth.users.id (Supabase Auth owns credentials).
create table if not exists public.users (
  id            uuid primary key references auth.users(id) on delete cascade,
  hospital_id   uuid references public.hospitals(id) on delete cascade,
  name          text not null,
  username      text,
  email         text,
  phone         text,
  role          text not null references public.roles(key),
  doctor_id     uuid,                                  -- set for role='doctor'
  patient_id    uuid,                                  -- set for role='patient'
  active        boolean not null default true,
  must_change_password boolean not null default false,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  unique (hospital_id, username)
);

-- Optional multi-role mapping (effective role also stored on users.role)
create table if not exists public.user_roles (
  user_id   uuid not null references public.users(id) on delete cascade,
  role_key  text not null references public.roles(key) on delete cascade,
  primary key (user_id, role_key)
);

-- ---------------------------------------------------------------------------
-- Clinical directory
-- ---------------------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name        text not null,
  code        text not null,
  active      boolean not null default true
);

create table if not exists public.doctors (
  id               uuid primary key default gen_random_uuid(),
  hospital_id      uuid not null references public.hospitals(id) on delete cascade,
  name             text not null,
  department_id    uuid references public.departments(id) on delete set null,
  qualification    text,
  reg_no           text,
  consultation_fee numeric(12,2) not null default 0,
  phone            text,
  email            text,
  timings          text,
  active           boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Patients (permanent per-hospital code, DB-guaranteed unique)
-- ---------------------------------------------------------------------------
create table if not exists public.patients (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals(id) on delete cascade,
  patient_code text not null,                          -- NH-000001, assigned by trigger
  auth_user_id uuid references auth.users(id) on delete set null, -- portal account
  name         text not null,
  mobile       text not null,
  gender       text not null default 'other' check (gender in ('male','female','other')),
  dob          date,
  age_years    int,
  blood_group  text not null default 'unknown',
  address      text,
  emergency_contact_name  text,
  emergency_contact_phone text,
  allergies    text,
  medical_notes text,
  id_proof_type text,
  id_proof_number text,
  provisional  boolean not null default false,
  registered_at timestamptz not null default now(),
  created_by   uuid,
  unique (hospital_id, patient_code)
);

create or replace function public.assign_patient_code()
returns trigger language plpgsql as $$
begin
  if new.patient_code is null or new.patient_code = '' then
    new.patient_code := public.next_code(new.hospital_id, 'patient', 'NH-', 6);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_patient_code on public.patients;
create trigger trg_assign_patient_code before insert on public.patients
  for each row execute function public.assign_patient_code();

-- ---------------------------------------------------------------------------
-- Appointments & visits
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  appt_code     text not null,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  doctor_id     uuid references public.doctors(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  date          date not null,
  start_time    text not null,
  end_time      text,
  type          text not null default 'new' check (type in ('new','follow_up')),
  reason        text,
  status        text not null default 'scheduled'
                check (status in ('scheduled','checked_in','waiting','in_consultation','completed','cancelled','no_show')),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  unique (hospital_id, appt_code)
);

-- Prevent obvious double-booking: one active appointment per doctor+slot.
create unique index if not exists uq_appt_no_doublebook
  on public.appointments (hospital_id, doctor_id, date, start_time)
  where status not in ('cancelled','no_show');

create or replace function public.assign_appt_code()
returns trigger language plpgsql as $$
begin
  if new.appt_code is null or new.appt_code = '' then
    new.appt_code := public.next_code(new.hospital_id, 'appt', 'APT-', 6);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_assign_appt_code on public.appointments;
create trigger trg_assign_appt_code before insert on public.appointments
  for each row execute function public.assign_appt_code();

create table if not exists public.visits (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  visit_code    text,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  doctor_id     uuid references public.doctors(id) on delete set null,
  department_id uuid references public.departments(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  type          text not null default 'opd' check (type in ('opd','ipd','emergency')),
  status        text not null default 'waiting',
  stage_times   jsonb not null default '{}'::jsonb,   -- friction map timestamps
  created_at    timestamptz not null default now()
);

create table if not exists public.vitals (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  visit_id    uuid references public.visits(id) on delete set null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid,
  bp_systolic int, bp_diastolic int, pulse int, temp_f numeric(5,1),
  spo2 int, weight_kg numeric(6,2), height_cm numeric(6,2), resp_rate int
);

-- ---------------------------------------------------------------------------
-- Consultations & diagnoses
-- ---------------------------------------------------------------------------
create table if not exists public.consultations (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  visit_id      uuid references public.visits(id) on delete set null,
  patient_id    uuid not null references public.patients(id) on delete cascade,
  doctor_id     uuid references public.doctors(id) on delete set null,
  date          timestamptz not null default now(),
  complaints    text, examination text, diagnosis text, advice text,
  follow_up_date date
);

create table if not exists public.diagnoses (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  consultation_id uuid references public.consultations(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  code            text,
  description     text not null,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Prescriptions
-- ---------------------------------------------------------------------------
create table if not exists public.prescriptions (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  rx_code         text not null,
  consultation_id uuid references public.consultations(id) on delete set null,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  doctor_id       uuid references public.doctors(id) on delete set null,
  created_at      timestamptz not null default now(),
  status          text not null default 'sent_to_pharmacy'
                  check (status in ('created','sent_to_pharmacy','dispensed')),
  notes           text,
  unique (hospital_id, rx_code)
);
create or replace function public.assign_rx_code()
returns trigger language plpgsql as $$
begin
  if new.rx_code is null or new.rx_code = '' then
    new.rx_code := public.next_code(new.hospital_id, 'rx', 'RX-', 6);
  end if; return new;
end; $$;
drop trigger if exists trg_assign_rx_code on public.prescriptions;
create trigger trg_assign_rx_code before insert on public.prescriptions
  for each row execute function public.assign_rx_code();

create table if not exists public.prescription_items (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medicine_id     uuid,
  medicine_name   text not null,
  dosage          text, frequency text, duration text, instructions text,
  quantity        int not null default 0
);

-- ---------------------------------------------------------------------------
-- Pharmacy
-- ---------------------------------------------------------------------------
create table if not exists public.medicines (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  name          text not null,
  category      text,
  unit          text not null default 'Unit',
  mrp           numeric(12,2) not null default 0,
  reorder_level int not null default 0,
  active        boolean not null default true
);

create table if not exists public.medicine_batches (
  id             uuid primary key default gen_random_uuid(),
  hospital_id    uuid not null references public.hospitals(id) on delete cascade,
  medicine_id    uuid not null references public.medicines(id) on delete cascade,
  batch_no       text not null,
  expiry         date not null,
  quantity       int not null default 0 check (quantity >= 0),
  purchase_price numeric(12,2) not null default 0,
  selling_price  numeric(12,2),
  supplier       text,
  received_at    timestamptz not null default now()
);

create table if not exists public.dispenses (
  id              uuid primary key default gen_random_uuid(),
  hospital_id     uuid not null references public.hospitals(id) on delete cascade,
  prescription_id uuid references public.prescriptions(id) on delete set null,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  dispensed_at    timestamptz not null default now(),
  dispensed_by    uuid,
  total           numeric(12,2) not null default 0
);
create table if not exists public.dispense_items (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  dispense_id   uuid not null references public.dispenses(id) on delete cascade,
  medicine_id   uuid,
  medicine_name text,
  batch_no      text,
  quantity      int not null,
  price         numeric(12,2) not null default 0
);

-- ---------------------------------------------------------------------------
-- Diagnostics
-- ---------------------------------------------------------------------------
create table if not exists public.lab_tests (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name        text not null, code text, category text,
  price       numeric(12,2) not null default 0,
  sample_type text, unit text, ref_range text,
  active      boolean not null default true
);

create table if not exists public.lab_orders (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  order_code  text not null,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  doctor_id   uuid references public.doctors(id) on delete set null,
  visit_id    uuid references public.visits(id) on delete set null,
  created_at  timestamptz not null default now(),
  status      text not null default 'ordered'
              check (status in ('ordered','partially_reported','reported','cancelled')),
  unique (hospital_id, order_code)
);
create or replace function public.assign_lab_code()
returns trigger language plpgsql as $$
begin
  if new.order_code is null or new.order_code = '' then
    new.order_code := public.next_code(new.hospital_id, 'lab', 'LAB-', 6);
  end if; return new;
end; $$;
drop trigger if exists trg_assign_lab_code on public.lab_orders;
create trigger trg_assign_lab_code before insert on public.lab_orders
  for each row execute function public.assign_lab_code();

create table if not exists public.lab_samples (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals(id) on delete cascade,
  sample_code  text,
  order_id     uuid not null references public.lab_orders(id) on delete cascade,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  test_id      uuid references public.lab_tests(id) on delete set null,
  status       text not null default 'pending'
               check (status in ('pending','collected','processing','completed','verified','released')),
  collected_at timestamptz, collected_by uuid,
  processed_at timestamptz
);

create table if not exists public.lab_results (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  sample_id   uuid not null references public.lab_samples(id) on delete cascade,
  order_id    uuid not null references public.lab_orders(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  test_id     uuid references public.lab_tests(id) on delete set null,
  value       text, unit text, ref_range text,
  flag        text check (flag in ('normal','high','low','critical')),
  entered_by  uuid, entered_at timestamptz,
  verified_by uuid, verified_at timestamptz,
  released_at timestamptz,
  status      text not null default 'completed'
);

create table if not exists public.lab_reports (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  order_id    uuid not null references public.lab_orders(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  storage_path text,                                   -- private bucket object path
  released_at timestamptz not null default now(),
  released_by uuid
);

create table if not exists public.imaging_orders (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  doctor_id   uuid references public.doctors(id) on delete set null,
  modality    text, body_part text, status text not null default 'ordered',
  created_at  timestamptz not null default now()
);
create table if not exists public.imaging_reports (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  order_id    uuid not null references public.imaging_orders(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  findings    text, storage_path text,
  released_at timestamptz, released_by uuid
);

-- ---------------------------------------------------------------------------
-- IPD / Beds
-- ---------------------------------------------------------------------------
create table if not exists public.wards (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null, type text
);
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ward_id uuid references public.wards(id) on delete cascade,
  number text not null
);
create table if not exists public.beds (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  ward_id uuid references public.wards(id) on delete cascade,
  label text not null,
  state text not null default 'available'
        check (state in ('available','reserved','assigned','occupied','discharge_pending','cleaning','inspection')),
  charge_per_day numeric(12,2) not null default 0,
  patient_id uuid references public.patients(id) on delete set null,
  admission_id uuid
);
create table if not exists public.admissions (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  admission_code text not null,
  patient_id uuid not null references public.patients(id) on delete cascade,
  bed_id uuid references public.beds(id) on delete set null,
  ward_id uuid references public.wards(id) on delete set null,
  doctor_id uuid references public.doctors(id) on delete set null,
  admitted_at timestamptz not null default now(),
  reason text,
  status text not null default 'admitted' check (status in ('admitted','discharge_pending','discharged')),
  discharged_at timestamptz,
  discharge_summary text,
  unique (hospital_id, admission_code)
);
create or replace function public.assign_adm_code()
returns trigger language plpgsql as $$
begin
  if new.admission_code is null or new.admission_code = '' then
    new.admission_code := public.next_code(new.hospital_id, 'admission', 'IPD-', 6);
  end if; return new;
end; $$;
drop trigger if exists trg_assign_adm_code on public.admissions;
create trigger trg_assign_adm_code before insert on public.admissions
  for each row execute function public.assign_adm_code();

create table if not exists public.nursing_notes (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  admission_id uuid not null references public.admissions(id) on delete cascade,
  at timestamptz not null default now(),
  by_user uuid, note text not null
);

create table if not exists public.emergency_cases (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  er_code text not null,
  patient_id uuid not null references public.patients(id) on delete cascade,
  arrival_time timestamptz not null default now(),
  triage text not null check (triage in ('critical','urgent','stable')),
  notes text, doctor_id uuid references public.doctors(id) on delete set null,
  bed_id uuid references public.beds(id) on delete set null,
  status text not null default 'active' check (status in ('active','admitted','discharged','referred')),
  unique (hospital_id, er_code)
);
create or replace function public.assign_er_code()
returns trigger language plpgsql as $$
begin
  if new.er_code is null or new.er_code = '' then
    new.er_code := public.next_code(new.hospital_id, 'er', 'ER-', 6);
  end if; return new;
end; $$;
drop trigger if exists trg_assign_er_code on public.emergency_cases;
create trigger trg_assign_er_code before insert on public.emergency_cases
  for each row execute function public.assign_er_code();

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------
create table if not exists public.billing_invoices (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals(id) on delete cascade,
  invoice_code text not null,
  patient_id   uuid not null references public.patients(id) on delete cascade,
  visit_id     uuid references public.visits(id) on delete set null,
  admission_id uuid references public.admissions(id) on delete set null,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  discount_pct numeric(6,2) not null default 0,
  tax_pct      numeric(6,2) not null default 0,
  subtotal     numeric(12,2) not null default 0,
  discount_amt numeric(12,2) not null default 0,
  tax_amt      numeric(12,2) not null default 0,
  total        numeric(12,2) not null default 0,
  paid         numeric(12,2) not null default 0,
  status       text not null default 'unpaid' check (status in ('draft','unpaid','partial','paid')),
  unique (hospital_id, invoice_code)
);
create or replace function public.assign_invoice_code()
returns trigger language plpgsql as $$
begin
  if new.invoice_code is null or new.invoice_code = '' then
    new.invoice_code := public.next_code(new.hospital_id, 'invoice', 'INV-', 6);
  end if; return new;
end; $$;
drop trigger if exists trg_assign_invoice_code on public.billing_invoices;
create trigger trg_assign_invoice_code before insert on public.billing_invoices
  for each row execute function public.assign_invoice_code();

create table if not exists public.billing_items (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  invoice_id  uuid not null references public.billing_invoices(id) on delete cascade,
  kind        text not null default 'other',
  description text not null,
  qty         numeric(12,2) not null default 1,
  unit_price  numeric(12,2) not null default 0,
  amount      numeric(12,2) not null default 0
);

-- Payments are immutable/auditable: no UPDATE/DELETE policy is granted (see 0003).
create table if not exists public.payments (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  invoice_id  uuid not null references public.billing_invoices(id) on delete cascade,
  patient_id  uuid not null references public.patients(id) on delete cascade,
  amount      numeric(12,2) not null check (amount > 0),
  method      text not null default 'cash' check (method in ('cash','card','upi','insurance','other')),
  reference   text,
  at          timestamptz not null default now(),
  received_by uuid
);

-- ---------------------------------------------------------------------------
-- Notifications, audit, support, licensing
-- ---------------------------------------------------------------------------
create table if not exists public.notification_templates (
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  key         text not null,
  template_id text not null,
  channel     text not null default 'sms' check (channel in ('sms','rcs','whatsapp')),
  label       text, body text not null,
  active      boolean not null default true,
  primary key (hospital_id, key)
);

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid not null references public.hospitals(id) on delete cascade,
  patient_id   uuid references public.patients(id) on delete set null,
  recipient    text not null,
  template_key text not null,
  channel      text not null,
  provider     text,
  status       text not null default 'sent' check (status in ('sent','delivered','failed','fallback')),
  message      text,
  at           timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid references public.hospitals(id) on delete cascade,
  at          timestamptz not null default now(),
  actor_id    uuid, actor_name text, actor_role text,
  action      text not null, entity text, entity_id text, detail text
);

create table if not exists public.support_tickets (
  id          uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  ticket_code text not null,
  subject     text not null, description text,
  priority    text not null default 'medium' check (priority in ('low','medium','high','critical')),
  status      text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  history     jsonb not null default '[]'::jsonb,
  unique (hospital_id, ticket_code)
);

create table if not exists public.licenses (
  id            uuid primary key default gen_random_uuid(),
  hospital_id   uuid not null references public.hospitals(id) on delete cascade,
  product       text not null default 'NxtHealth',
  type          text not null check (type in ('TRIAL','MONTHLY','YEARLY','LIFETIME')),
  hospital_name text not null,
  start_date    date not null,
  expiry_date   date,                                  -- null == LIFETIME
  user_limit    int not null default 10,
  modules       text[] not null default '{}',
  signature     text,                                  -- signed server-side (edge function)
  status        text not null default 'active' check (status in ('active','trial','expired','invalid','revoked')),
  issued_by     text not null default 'NxtGenSol',
  issued_at     timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
-- Only one current license per hospital (latest wins); history retained.
create index if not exists ix_licenses_hospital on public.licenses(hospital_id, issued_at desc);

create table if not exists public.license_activations (
  id           uuid primary key default gen_random_uuid(),
  hospital_id  uuid references public.hospitals(id) on delete cascade,
  key          text,
  activated_at timestamptz not null default now(),
  activated_by text,
  result       text not null check (result in ('success','failed')),
  reason       text
);

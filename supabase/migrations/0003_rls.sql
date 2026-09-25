-- ============================================================================
-- NxtHealth — 0003 Row Level Security
-- Tenant isolation: a user only ever sees rows for their own hospital_id.
-- Patients see only their own records. Sensitive tables (licenses, payments,
-- audit) are write-restricted; server/edge (service role) bypasses RLS.
-- ============================================================================

-- Standard staff CRUD (tenant-scoped) for operational + master tables.
do $$
declare t text;
  staff_tables text[] := array[
    'patients','appointments','visits','vitals','consultations','diagnoses',
    'prescriptions','prescription_items','lab_orders','lab_samples','lab_reports',
    'imaging_orders','imaging_reports','admissions','nursing_notes','emergency_cases',
    'billing_invoices','billing_items','dispenses','dispense_items','support_tickets',
    'notifications','departments','doctors','lab_tests','medicines','medicine_batches',
    'wards','rooms','beds','hospital_settings','notification_templates'
  ];
begin
  foreach t in array staff_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_staff_del', t);
    execute format($f$create policy %I on public.%I for select to authenticated
      using (public.is_staff() and hospital_id = public.current_hospital_id())$f$, t||'_staff_sel', t);
    execute format($f$create policy %I on public.%I for insert to authenticated
      with check (public.is_staff() and hospital_id = public.current_hospital_id())$f$, t||'_staff_ins', t);
    execute format($f$create policy %I on public.%I for update to authenticated
      using (public.is_staff() and hospital_id = public.current_hospital_id())
      with check (hospital_id = public.current_hospital_id())$f$, t||'_staff_upd', t);
    execute format($f$create policy %I on public.%I for delete to authenticated
      using (public.is_staff() and hospital_id = public.current_hospital_id())$f$, t||'_staff_del', t);
  end loop;
end $$;

-- Internal counter table: no client access at all (only SECURITY DEFINER funcs).
alter table public.hospital_counters enable row level security;

-- ---------------- hospitals ----------------
alter table public.hospitals enable row level security;
drop policy if exists hospitals_sel on public.hospitals;
create policy hospitals_sel on public.hospitals for select to authenticated
  using (id = public.current_hospital_id() or public.current_user_role() = 'super_admin');
drop policy if exists hospitals_upd on public.hospitals;
create policy hospitals_upd on public.hospitals for update to authenticated
  using (id = public.current_hospital_id() and public.has_perm('admin.settings'))
  with check (id = public.current_hospital_id());

-- ---------------- users ----------------
alter table public.users enable row level security;
drop policy if exists users_self_sel on public.users;
create policy users_self_sel on public.users for select to authenticated
  using (id = auth.uid() or (public.is_staff() and hospital_id = public.current_hospital_id()));
drop policy if exists users_self_upd on public.users;
create policy users_self_upd on public.users for update to authenticated
  using (id = auth.uid() or (public.has_perm('admin.users') and hospital_id = public.current_hospital_id()))
  with check (id = auth.uid() or hospital_id = public.current_hospital_id());
-- inserts happen via the auth trigger (SECURITY DEFINER) / service role only.

-- ---------------- RBAC reference (read-only to clients) ----------------
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
drop policy if exists roles_sel on public.roles;
create policy roles_sel on public.roles for select to authenticated using (true);
drop policy if exists perms_sel on public.permissions;
create policy perms_sel on public.permissions for select to authenticated using (true);
drop policy if exists rp_sel on public.role_permissions;
create policy rp_sel on public.role_permissions for select to authenticated using (true);
drop policy if exists ur_sel on public.user_roles;
create policy ur_sel on public.user_roles for select to authenticated using (true);

-- ---------------- audit_logs (append-only, admin read) ----------------
alter table public.audit_logs enable row level security;
drop policy if exists audit_sel on public.audit_logs;
create policy audit_sel on public.audit_logs for select to authenticated
  using (public.has_perm('audit.view') and hospital_id = public.current_hospital_id());
drop policy if exists audit_ins on public.audit_logs;
create policy audit_ins on public.audit_logs for insert to authenticated
  with check (public.is_staff() and hospital_id = public.current_hospital_id());
-- no update/delete policies => audit entries are immutable to clients.

-- ---------------- licenses (server-issued only) ----------------
alter table public.licenses enable row level security;
alter table public.license_activations enable row level security;
drop policy if exists lic_sel on public.licenses;
create policy lic_sel on public.licenses for select to authenticated
  using (hospital_id = public.current_hospital_id());
drop policy if exists lic_act_sel on public.license_activations;
create policy lic_act_sel on public.license_activations for select to authenticated
  using (hospital_id = public.current_hospital_id() and public.has_perm('license.manage'));
-- no write policies => only edge functions (service role) issue/activate licenses.

-- ---------------- payments (append-only, immutable) ----------------
drop policy if exists payments_sel on public.payments;
drop policy if exists payments_ins on public.payments;
alter table public.payments enable row level security;
create policy payments_sel on public.payments for select to authenticated
  using ((public.is_staff() and hospital_id = public.current_hospital_id())
         or patient_id = public.current_patient_id());
create policy payments_ins on public.payments for insert to authenticated
  with check (public.has_perm('billing.manage') and hospital_id = public.current_hospital_id());
-- no update/delete => payments are immutable/auditable.

-- ---------------- lab results: only authorized lab users write ----------------
drop policy if exists lab_samples_staff_upd on public.lab_samples;
create policy lab_samples_staff_upd on public.lab_samples for update to authenticated
  using (hospital_id = public.current_hospital_id()
    and (public.has_perm('lab.collect') or public.has_perm('lab.result') or public.has_perm('lab.verify') or public.has_perm('lab.release')))
  with check (hospital_id = public.current_hospital_id());

alter table public.lab_results enable row level security;
drop policy if exists lab_results_sel on public.lab_results;
create policy lab_results_sel on public.lab_results for select to authenticated
  using ((public.is_staff() and hospital_id = public.current_hospital_id())
         or (patient_id = public.current_patient_id() and released_at is not null));
drop policy if exists lab_results_ins on public.lab_results;
create policy lab_results_ins on public.lab_results for insert to authenticated
  with check (hospital_id = public.current_hospital_id() and public.has_perm('lab.result'));
drop policy if exists lab_results_upd on public.lab_results;
create policy lab_results_upd on public.lab_results for update to authenticated
  using (hospital_id = public.current_hospital_id()
    and (public.has_perm('lab.result') or public.has_perm('lab.verify') or public.has_perm('lab.release')))
  with check (hospital_id = public.current_hospital_id());

-- ============================================================================
-- Patient portal: read-only access to the patient's OWN records.
-- ============================================================================
drop policy if exists patients_portal_sel on public.patients;
create policy patients_portal_sel on public.patients for select to authenticated
  using (id = public.current_patient_id());

do $$
declare t text;
  patient_tables text[] := array[
    'appointments','consultations','diagnoses','vitals','prescriptions',
    'lab_orders','lab_samples','lab_reports','billing_invoices','admissions','notifications'
  ];
begin
  foreach t in array patient_tables loop
    execute format('drop policy if exists %I on public.%I', t||'_portal_sel', t);
    execute format($f$create policy %I on public.%I for select to authenticated
      using (patient_id = public.current_patient_id())$f$, t||'_portal_sel', t);
  end loop;
end $$;

-- child rows the patient owns via parent
drop policy if exists prescription_items_portal_sel on public.prescription_items;
create policy prescription_items_portal_sel on public.prescription_items for select to authenticated
  using (exists (select 1 from public.prescriptions p
                 where p.id = prescription_id and p.patient_id = public.current_patient_id()));
drop policy if exists billing_items_portal_sel on public.billing_items;
create policy billing_items_portal_sel on public.billing_items for select to authenticated
  using (exists (select 1 from public.billing_invoices i
                 where i.id = invoice_id and i.patient_id = public.current_patient_id()));

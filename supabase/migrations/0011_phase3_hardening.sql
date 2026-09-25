-- ============================================================================
-- NxtHealth — 0011 Phase 3 hardening
-- Server-side license/module enforcement, atomic lab RPCs, rate limiting,
-- notification delivery logging.
-- ============================================================================

-- ---- notifications: delivery detail columns ----
alter table public.notifications add column if not exists provider_message_id text;
alter table public.notifications add column if not exists error text;

-- ---- server-side license + module enforcement ----
-- Returns true when the hospital may use a module: no license yet (onboarding)
-- OR a non-expired active/trial license that includes the module.
create or replace function public.hospital_has_module(p_module text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_h uuid; v_lic record;
begin
  v_h := public.current_hospital_id();
  if v_h is null then return false; end if;
  select * into v_lic from public.licenses where hospital_id = v_h order by issued_at desc limit 1;
  if v_lic.id is null then return true; end if;                 -- pre-licensing / onboarding
  if v_lic.expiry_date is not null and v_lic.expiry_date < current_date then return false; end if; -- expired
  return v_lic.status in ('active', 'trial') and (p_module = any(v_lic.modules));
end; $$;
revoke execute on function public.hospital_has_module(text) from anon, public;

-- RESTRICTIVE insert policies: AND-ed with existing permissive staff policies, so a
-- disabled/expired module cannot be used even by calling the REST API directly.
do $$
declare t text; m text;
  pairs text[][] := array[
    ['appointments','appointments'], ['lab_orders','diagnostics'], ['lab_samples','diagnostics'],
    ['prescriptions','opd'], ['billing_invoices','billing'], ['admissions','ipd']
  ];
  i int;
begin
  for i in 1 .. array_length(pairs,1) loop
    t := pairs[i][1]; m := pairs[i][2];
    execute format('drop policy if exists %I on public.%I', 'mod_'||t||'_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated
      with check (public.hospital_has_module(%L))$f$, 'mod_'||t||'_ins', t, m);
  end loop;
end $$;

-- shared audit helper (SECURITY DEFINER) so RPCs write consistent audit rows
create or replace function public.log_audit(p_action text, p_entity text, p_entity_id text, p_detail text)
returns void language plpgsql security definer set search_path = public as $$
declare me record;
begin
  select id, hospital_id, role, name into me from public.users where id = auth.uid();
  insert into public.audit_logs(hospital_id, actor_id, actor_name, actor_role, action, entity, entity_id, detail)
  values (me.hospital_id, me.id, me.name, me.role, p_action, p_entity, p_entity_id, p_detail);
end; $$;
revoke execute on function public.log_audit(text,text,text,text) from anon, public;

-- ---- atomic lab RPCs (server-enforced perms + module + audit) ----
create or replace function public.enter_lab_result(p_sample uuid, p_value text, p_flag text)
returns void language plpgsql security definer set search_path = public as $$
declare s record; t record; me uuid := auth.uid();
begin
  select * into s from public.lab_samples where id = p_sample;
  if s.id is null then raise exception 'Sample not found'; end if;
  if s.hospital_id <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not public.hospital_has_module('diagnostics') then raise exception 'Diagnostics module not enabled'; end if;
  if not public.has_perm('lab.result') then raise exception 'Not authorized to enter results'; end if;
  select unit, ref_range into t from public.lab_tests where id = s.test_id;
  insert into public.lab_results(hospital_id, sample_id, order_id, patient_id, test_id, value, unit, ref_range, flag, entered_by, entered_at, status)
  values (s.hospital_id, p_sample, s.order_id, s.patient_id, s.test_id, p_value, t.unit, t.ref_range, coalesce(p_flag,'normal'), me, now(), 'completed');
  update public.lab_samples set status='completed', processed_at=now() where id = p_sample;
  perform public.log_audit('Lab result entered','lab_sample', p_sample::text, 'value='||p_value);
end; $$;

create or replace function public.verify_lab_result(p_sample uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; me uuid := auth.uid();
begin
  select * into s from public.lab_samples where id = p_sample;
  if s.id is null then raise exception 'Sample not found'; end if;
  if s.hospital_id <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not public.has_perm('lab.verify') then raise exception 'Not authorized to verify results'; end if;
  update public.lab_results set status='verified', verified_by=me, verified_at=now() where sample_id = p_sample;
  update public.lab_samples set status='verified' where id = p_sample;
  perform public.log_audit('Lab result verified','lab_sample', p_sample::text, null);
end; $$;

-- Atomic release: results + samples + order + report + audit in one transaction.
create or replace function public.release_lab_order(p_order uuid)
returns text language plpgsql security definer set search_path = public as $$
declare o record; me uuid := auth.uid(); n int;
begin
  select * into o from public.lab_orders where id = p_order;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.hospital_id <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not public.has_perm('lab.release') then raise exception 'Not authorized to release reports'; end if;
  select count(*) into n from public.lab_samples where order_id = p_order and status not in ('verified','released');
  if n > 0 then raise exception 'All samples must be verified before release'; end if;

  update public.lab_results set status='released', released_at=now() where order_id = p_order and status='verified';
  update public.lab_samples set status='released' where order_id = p_order and status='verified';
  update public.lab_orders set status='reported' where id = p_order;
  insert into public.lab_reports(hospital_id, order_id, patient_id, released_by, released_at)
  values (o.hospital_id, p_order, o.patient_id, me, now());
  perform public.log_audit('Lab report released','lab_order', o.order_code, null);
  return o.order_code;
end; $$;

-- ---- module checks inside privileged RPCs ----
create or replace function public.dispense_prescription(p_prescription uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid; v_patient uuid; v_dispense uuid; v_total numeric(12,2) := 0;
  it record; b record; remaining int; take int; med record;
begin
  select hospital_id, patient_id into v_hosp, v_patient from public.prescriptions where id = p_prescription;
  if v_hosp is null then raise exception 'Prescription not found'; end if;
  if v_hosp <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not public.hospital_has_module('pharmacy') then raise exception 'Pharmacy module not enabled'; end if;
  if not public.has_perm('pharmacy.dispense') then raise exception 'Not authorized to dispense'; end if;

  insert into public.dispenses(hospital_id, prescription_id, patient_id, dispensed_by)
  values (v_hosp, p_prescription, v_patient, auth.uid()) returning id into v_dispense;

  for it in select * from public.prescription_items where prescription_id = p_prescription loop
    select * into med from public.medicines where hospital_id = v_hosp and (id = it.medicine_id or lower(name) = lower(it.medicine_name)) limit 1;
    if med.id is null then continue; end if;
    if (select coalesce(sum(quantity),0) from public.medicine_batches where medicine_id = med.id) < it.quantity then
      raise exception 'Insufficient stock for %', med.name;
    end if;
    remaining := it.quantity;
    for b in select * from public.medicine_batches where medicine_id = med.id and quantity > 0 order by expiry asc for update loop
      exit when remaining <= 0;
      take := least(b.quantity, remaining);
      update public.medicine_batches set quantity = quantity - take where id = b.id;
      insert into public.dispense_items(hospital_id, dispense_id, medicine_id, medicine_name, batch_no, quantity, price)
      values (v_hosp, v_dispense, med.id, med.name, b.batch_no, take, med.mrp);
      v_total := v_total + take * med.mrp; remaining := remaining - take;
    end loop;
  end loop;
  update public.dispenses set total = v_total where id = v_dispense;
  update public.prescriptions set status = 'dispensed' where id = p_prescription;
  perform public.log_audit('Prescription dispensed','prescription', p_prescription::text, null);
  return v_dispense;
end; $$;

create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_method text, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hosp uuid; v_patient uuid; v_total numeric; v_paid numeric; v_pay uuid;
begin
  select hospital_id, patient_id, total, paid into v_hosp, v_patient, v_total, v_paid from public.billing_invoices where id = p_invoice;
  if v_hosp is null then raise exception 'Invoice not found'; end if;
  if v_hosp <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not public.hospital_has_module('billing') then raise exception 'Billing module not enabled'; end if;
  if not public.has_perm('billing.manage') then raise exception 'Not authorized'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  insert into public.payments(hospital_id, invoice_id, patient_id, amount, method, reference, received_by)
  values (v_hosp, p_invoice, v_patient, p_amount, coalesce(p_method,'cash'), p_reference, auth.uid()) returning id into v_pay;
  v_paid := v_paid + p_amount;
  update public.billing_invoices set paid = v_paid,
    status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end
    where id = p_invoice;
  perform public.log_audit('Payment received','bill', p_invoice::text, coalesce(p_method,'cash')||' '||p_amount::text);
  return v_pay;
end; $$;

-- ---- rate limiting (fixed-window) for edge functions ----
create table if not exists public.rate_limits (
  bucket text not null, ref text not null, window_start timestamptz not null default now(), count int not null default 0,
  primary key (bucket, ref)
);
alter table public.rate_limits enable row level security;  -- deny-all to clients

create or replace function public.rate_limit(p_bucket text, p_ref text, p_max int, p_window_secs int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v record; now_ts timestamptz := now();
begin
  select * into v from public.rate_limits where bucket = p_bucket and ref = p_ref for update;
  if v.ref is null then
    insert into public.rate_limits(bucket, ref, window_start, count) values (p_bucket, p_ref, now_ts, 1)
    on conflict (bucket, ref) do update set count = public.rate_limits.count + 1;
    return true;
  end if;
  if now_ts - v.window_start > make_interval(secs => p_window_secs) then
    update public.rate_limits set window_start = now_ts, count = 1 where bucket = p_bucket and ref = p_ref;
    return true;
  end if;
  if v.count >= p_max then return false; end if;
  update public.rate_limits set count = count + 1 where bucket = p_bucket and ref = p_ref;
  return true;
end; $$;
revoke execute on function public.rate_limit(text,text,int,int) from anon, authenticated, public;
grant execute on function public.rate_limit(text,text,int,int) to service_role;

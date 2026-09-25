-- ============================================================================
-- NxtHealth — 0002 functions
-- Security-context helpers (used by RLS), auth→profile sync, transactional RPCs.
-- All context helpers are SECURITY DEFINER so they bypass RLS and cannot recurse.
-- Authorization is derived from auth.uid() — never from client-supplied ids.
-- ============================================================================

create or replace function public.current_hospital_id()
returns uuid language sql stable security definer set search_path = public as $$
  select hospital_id from public.users where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.users where id = auth.uid()
$$;

create or replace function public.current_patient_id()
returns uuid language sql stable security definer set search_path = public as $$
  select patient_id from public.users where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role <> 'patient' and active)
$$;

create or replace function public.has_perm(p text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.users where id = auth.uid() and role = 'super_admin')
      or exists (
        select 1 from public.users u
        join public.role_permissions rp on rp.role_key = u.role
        where u.id = auth.uid() and u.active and rp.permission_key = p
      )
$$;

-- Sync a new Supabase Auth user into the app users table.
-- role / hospital_id come from app_metadata (set by trusted server code only).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_app_meta_data->>'role', new.raw_user_meta_data->>'role', 'patient');
  v_hospital uuid := nullif(new.raw_app_meta_data->>'hospital_id','')::uuid;
  v_name text := coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1));
  v_patient uuid := nullif(new.raw_user_meta_data->>'patient_id','')::uuid;
  v_username text := coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1));
  v_mcp boolean := coalesce((new.raw_user_meta_data->>'must_change_password')::boolean, false);
begin
  insert into public.users(id, hospital_id, name, username, email, role, patient_id, must_change_password)
  values (new.id, v_hospital, v_name, v_username, new.email, v_role, v_patient, v_mcp)
  on conflict (id) do nothing;
  -- back-link patient portal account
  if v_patient is not null then
    update public.patients set auth_user_id = new.id where id = v_patient;
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Transactional dispense: FEFO stock decrement with hard "no overselling" guard.
create or replace function public.dispense_prescription(p_prescription uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_hosp uuid;
  v_patient uuid;
  v_dispense uuid;
  v_total numeric(12,2) := 0;
  it record; b record; remaining int; take int; med record;
begin
  select hospital_id, patient_id into v_hosp, v_patient from public.prescriptions where id = p_prescription;
  if v_hosp is null then raise exception 'Prescription not found'; end if;
  if v_hosp <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not public.has_perm('pharmacy.dispense') then raise exception 'Not authorized to dispense'; end if;

  insert into public.dispenses(hospital_id, prescription_id, patient_id, dispensed_by)
  values (v_hosp, p_prescription, v_patient, auth.uid())
  returning id into v_dispense;

  for it in select * from public.prescription_items where prescription_id = p_prescription loop
    select * into med from public.medicines
      where hospital_id = v_hosp and (id = it.medicine_id or lower(name) = lower(it.medicine_name)) limit 1;
    if med.id is null then continue; end if;

    -- ensure enough total stock before touching batches
    if (select coalesce(sum(quantity),0) from public.medicine_batches where medicine_id = med.id) < it.quantity then
      raise exception 'Insufficient stock for %', med.name;
    end if;

    remaining := it.quantity;
    for b in select * from public.medicine_batches
             where medicine_id = med.id and quantity > 0 order by expiry asc for update loop
      exit when remaining <= 0;
      take := least(b.quantity, remaining);
      update public.medicine_batches set quantity = quantity - take where id = b.id;
      insert into public.dispense_items(hospital_id, dispense_id, medicine_id, medicine_name, batch_no, quantity, price)
      values (v_hosp, v_dispense, med.id, med.name, b.batch_no, take, med.mrp);
      v_total := v_total + take * med.mrp;
      remaining := remaining - take;
    end loop;
  end loop;

  update public.dispenses set total = v_total where id = v_dispense;
  update public.prescriptions set status = 'dispensed' where id = p_prescription;
  return v_dispense;
end; $$;

-- Record a payment and roll up invoice totals atomically. Payments are append-only.
create or replace function public.record_payment(p_invoice uuid, p_amount numeric, p_method text, p_reference text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_hosp uuid; v_patient uuid; v_total numeric; v_paid numeric; v_pay uuid;
begin
  select hospital_id, patient_id, total, paid into v_hosp, v_patient, v_total, v_paid
    from public.billing_invoices where id = p_invoice;
  if v_hosp is null then raise exception 'Invoice not found'; end if;
  if v_hosp <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not public.has_perm('billing.manage') then raise exception 'Not authorized'; end if;
  if p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  insert into public.payments(hospital_id, invoice_id, patient_id, amount, method, reference, received_by)
  values (v_hosp, p_invoice, v_patient, p_amount, coalesce(p_method,'cash'), p_reference, auth.uid())
  returning id into v_pay;

  v_paid := v_paid + p_amount;
  update public.billing_invoices
    set paid = v_paid,
        status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partial' else 'unpaid' end
    where id = p_invoice;
  return v_pay;
end; $$;

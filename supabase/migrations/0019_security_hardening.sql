-- ============================================================================
-- NxtHealth — 0019 security hardening (audit fixes)
-- (A) Server-side storage limits on the private medical buckets (defense in
--     depth: client + save_lab_report RPC already validate; this enforces size
--     and MIME at the Storage API layer for any direct call).
-- (B) save_lab_report: reject a client-supplied storage_path that escapes the
--     order's own {hospital_id}/{patient_id}/ namespace.
-- (C) Financial-table integrity: payment rows are written ONLY through the
--     record_payment RPC (paid/status stay authoritative); invoices/items may be
--     created only with billing.manage; invoices can no longer be UPDATED or
--     DELETED directly (so paid/status cannot be forged by a direct row write).
-- No data is deleted; only policy/limits change. record_payment is SECURITY
-- DEFINER so it keeps writing payments and updating invoices after this.
-- ============================================================================

-- (A) private buckets: 15 MB cap + PDF/JPEG/PNG only
update storage.buckets
  set file_size_limit = 15728640,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png']
  where id in ('lab-reports','prescriptions','patient-documents','discharge-documents');

-- (B) recreate save_lab_report with a storage-path namespace guard
create or replace function public.save_lab_report(p_order uuid, p_path text, p_file_name text, p_mime text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; me uuid := auth.uid(); prev text; rid uuid;
begin
  select * into o from public.lab_orders where id = p_order;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.hospital_id <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not (public.has_perm('lab.result') or public.has_perm('lab.release')) then raise exception 'Not authorized to upload lab reports'; end if;
  if p_mime not in ('application/pdf','image/jpeg','image/png') then raise exception 'Unsupported file type'; end if;
  if p_size is null or p_size <= 0 or p_size > 15728640 then raise exception 'Invalid file size'; end if;
  -- storage_path must stay inside this order's own hospital/patient namespace
  if p_path not like (o.hospital_id::text || '/' || o.patient_id::text || '/%') then
    raise exception 'Invalid storage path';
  end if;

  select storage_path into prev from public.lab_reports where order_id = p_order;
  insert into public.lab_reports(hospital_id, order_id, patient_id, storage_path, file_name, mime_type, file_size, uploaded_at, uploaded_by, released_at, released_by)
  values (o.hospital_id, p_order, o.patient_id, p_path, p_file_name, p_mime, p_size, now(), me, now(), me)
  on conflict (order_id) do update set
    storage_path = excluded.storage_path, file_name = excluded.file_name, mime_type = excluded.mime_type,
    file_size = excluded.file_size, uploaded_at = now(), uploaded_by = me, released_at = now(), released_by = me
  returning id into rid;

  update public.lab_orders set status = 'reported' where id = p_order and status <> 'reported';
  perform public.log_audit('Lab report uploaded', 'lab_order', o.order_code, p_file_name);
  return jsonb_build_object('order_code', o.order_code, 'report_id', rid, 'previous_path', prev);
end; $$;
revoke execute on function public.save_lab_report(uuid,text,text,text,bigint) from anon, public;
grant execute on function public.save_lab_report(uuid,text,text,text,bigint) to authenticated;

-- (C) financial integrity ---------------------------------------------------
-- payments: no direct client writes — only record_payment (SECURITY DEFINER).
drop policy if exists payments_ins on public.payments;

-- billing_invoices: create only with billing.manage; no direct update/delete.
drop policy if exists billing_invoices_staff_ins on public.billing_invoices;
drop policy if exists mod_billing_invoices_ins on public.billing_invoices;
drop policy if exists billing_invoices_staff_upd on public.billing_invoices;
drop policy if exists billing_invoices_staff_del on public.billing_invoices;
create policy billing_invoices_ins on public.billing_invoices for insert to authenticated
  with check (public.is_staff() and hospital_id = public.current_hospital_id()
              and public.has_perm('billing.manage') and public.hospital_has_module('billing'));

-- billing_items: create only with billing.manage; no direct update/delete.
drop policy if exists billing_items_staff_ins on public.billing_items;
drop policy if exists mod_billing_items_ins on public.billing_items;
drop policy if exists billing_items_staff_upd on public.billing_items;
drop policy if exists billing_items_staff_del on public.billing_items;
create policy billing_items_ins on public.billing_items for insert to authenticated
  with check (public.is_staff() and hospital_id = public.current_hospital_id() and public.has_perm('billing.manage'));

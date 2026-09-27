-- ============================================================================
-- NxtHealth — 0018 Lab report file upload
-- Reuses the EXISTING lab_reports table + the EXISTING private `lab-reports`
-- storage bucket (path {hospital_id}/{patient_id}/...). Adds the file metadata
-- columns the upload needs, an RPC to save/replace a report (tenant + permission
-- checked), and fixes the patient storage-read policy so a patient can fetch a
-- signed URL for their OWN report (patient users have users.hospital_id = NULL,
-- so the old policy's current_hospital_id() was null and blocked them).
-- No new document system, no public bucket, no schema for files-in-rows.
-- ============================================================================

-- 1) File metadata on the existing lab_reports table (storage_path already exists).
alter table public.lab_reports
  add column if not exists file_name  text,
  add column if not exists mime_type  text,
  add column if not exists file_size  bigint,
  add column if not exists uploaded_at timestamptz,
  add column if not exists uploaded_by uuid;

-- One report row per order (needed for clean upsert/replace). Dedupe first.
delete from public.lab_reports a using public.lab_reports b
  where a.order_id = b.order_id and a.ctid < b.ctid;
create unique index if not exists lab_reports_order_uidx on public.lab_reports(order_id);

-- 2) Save/replace an uploaded report file. Staff-only, tenant-scoped, perm-checked.
--    The client uploads the file to storage (staff RLS), then calls this to persist
--    metadata + mark the order "reported". Never stores file bytes in the row.
create or replace function public.save_lab_report(p_order uuid, p_path text, p_file_name text, p_mime text, p_size bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare o record; me uuid := auth.uid(); prev text; rid uuid;
begin
  select * into o from public.lab_orders where id = p_order;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.hospital_id <> public.current_hospital_id() then raise exception 'Cross-tenant access denied'; end if;
  if not (public.has_perm('lab.result') or public.has_perm('lab.release')) then raise exception 'Not authorized to upload lab reports'; end if;
  if p_mime not in ('application/pdf','image/jpeg','image/png') then raise exception 'Unsupported file type'; end if;

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

-- 3) Fix patient storage read (own hospital derived from the patient record).
drop policy if exists nxt_storage_patient_read on storage.objects;
create policy nxt_storage_patient_read on storage.objects for select to authenticated
  using (
    bucket_id in ('lab-reports','prescriptions','patient-documents','discharge-documents')
    and (storage.foldername(name))[1] = public.current_patient_hospital_id()::text
    and (storage.foldername(name))[2] = public.current_patient_id()::text
  );

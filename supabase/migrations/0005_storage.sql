-- ============================================================================
-- NxtHealth — 0005 Storage
-- Private buckets for medical documents. Object path convention:
--   {hospital_id}/{patient_id}/{filename}
-- Staff access their hospital's objects; patients access only their own.
-- Buckets are PRIVATE — files are served via short-lived signed URLs only.
-- ============================================================================

insert into storage.buckets (id, name, public) values
  ('lab-reports','lab-reports',false),
  ('prescriptions','prescriptions',false),
  ('patient-documents','patient-documents',false),
  ('discharge-documents','discharge-documents',false)
on conflict (id) do nothing;

-- staff: full access to their own hospital's folder
drop policy if exists nxt_storage_staff_all on storage.objects;
create policy nxt_storage_staff_all on storage.objects for all to authenticated
  using (
    bucket_id in ('lab-reports','prescriptions','patient-documents','discharge-documents')
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_hospital_id()::text
  )
  with check (
    bucket_id in ('lab-reports','prescriptions','patient-documents','discharge-documents')
    and public.is_staff()
    and (storage.foldername(name))[1] = public.current_hospital_id()::text
  );

-- patient: read only their own documents
drop policy if exists nxt_storage_patient_read on storage.objects;
create policy nxt_storage_patient_read on storage.objects for select to authenticated
  using (
    bucket_id in ('lab-reports','prescriptions','patient-documents','discharge-documents')
    and (storage.foldername(name))[1] = public.current_hospital_id()::text
    and (storage.foldername(name))[2] = public.current_patient_id()::text
  );

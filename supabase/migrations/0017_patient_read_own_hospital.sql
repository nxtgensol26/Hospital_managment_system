-- ============================================================================
-- NxtHealth — 0017 let a patient read (only) their own hospital's row
-- Patient accounts isolate via current_patient_id() and their users row has a
-- NULL hospital_id, so the existing hospitals RLS (id = current_hospital_id())
-- returns nothing for them — the Patient Portal could not show the hospital name.
-- This adds a read-only SELECT policy scoped to the patient's OWN hospital,
-- derived server-side from their patient record. No writes, no broadening:
-- a patient can still only ever see the single hospital that owns their record.
-- ============================================================================

-- SECURITY DEFINER helper: the authenticated patient's hospital_id (or null).
create or replace function public.current_patient_hospital_id()
returns uuid language sql stable security definer set search_path = public as $$
  select hospital_id from public.patients where id = public.current_patient_id()
$$;
revoke execute on function public.current_patient_hospital_id() from anon, public;
grant execute on function public.current_patient_hospital_id() to authenticated;

-- Read-only: a patient may select ONLY the hospital that owns their record.
drop policy if exists hospitals_sel_patient on public.hospitals;
create policy hospitals_sel_patient on public.hospitals for select to authenticated
  using (id = public.current_patient_hospital_id());

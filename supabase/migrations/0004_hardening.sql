-- ============================================================================
-- NxtHealth — 0004 security hardening
-- Pin search_path on trigger functions; lock down SECURITY DEFINER exposure.
-- ============================================================================

alter function public.next_code(uuid, text, text, int) set search_path = public;
alter function public.assign_patient_code() set search_path = public;
alter function public.assign_appt_code() set search_path = public;
alter function public.assign_rx_code() set search_path = public;
alter function public.assign_lab_code() set search_path = public;
alter function public.assign_adm_code() set search_path = public;
alter function public.assign_er_code() set search_path = public;
alter function public.assign_invoice_code() set search_path = public;

-- handle_new_user is a trigger only; it must never be callable as an RPC.
revoke execute on function public.handle_new_user() from anon, authenticated, public;

-- Context helpers are needed by RLS (authenticated) but never by anon.
revoke execute on function public.current_hospital_id() from anon, public;
revoke execute on function public.current_user_role() from anon, public;
revoke execute on function public.current_patient_id() from anon, public;
revoke execute on function public.is_staff() from anon, public;
revoke execute on function public.has_perm(text) from anon, public;

-- Privileged RPCs: signed-in staff only (perms checked inside); never anon.
revoke execute on function public.dispense_prescription(uuid) from anon, public;
revoke execute on function public.record_payment(uuid, numeric, text, text) from anon, public;

-- Internal counter table is intentionally deny-all (only SECURITY DEFINER funcs touch it).
comment on table public.hospital_counters is 'Internal per-hospital sequence counters. RLS deny-all by design; only next_code() (SECURITY DEFINER) mutates it.';

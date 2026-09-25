-- ============================================================================
-- NxtHealth — 0012 lock down SECURITY DEFINER RPC exposure
-- Trigger functions run in owner context (not needed as RPCs); lab RPCs are
-- signed-in staff only; log_audit is internal-only. This closes anon/public
-- REST exposure flagged by advisors 0028/0029 without breaking triggers or
-- the authenticated RPCs the app relies on.
-- ============================================================================
revoke execute on function public.assign_patient_code() from anon, authenticated, public;
revoke execute on function public.assign_appt_code() from anon, authenticated, public;
revoke execute on function public.assign_rx_code() from anon, authenticated, public;
revoke execute on function public.assign_lab_code() from anon, authenticated, public;
revoke execute on function public.assign_adm_code() from anon, authenticated, public;
revoke execute on function public.assign_er_code() from anon, authenticated, public;
revoke execute on function public.assign_invoice_code() from anon, authenticated, public;

revoke execute on function public.enter_lab_result(uuid, text, text) from anon, public;
revoke execute on function public.verify_lab_result(uuid) from anon, public;
revoke execute on function public.release_lab_order(uuid) from anon, public;

revoke execute on function public.log_audit(text, text, text, text) from anon, authenticated, public;

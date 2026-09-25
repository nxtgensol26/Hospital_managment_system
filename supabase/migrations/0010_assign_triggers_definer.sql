-- ============================================================================
-- NxtHealth — 0010 code-assign triggers → SECURITY DEFINER
-- The assign_*_code trigger functions call next_code(). next_code is
-- SECURITY DEFINER and revoked from anon/authenticated (advisor 0029), so the
-- trigger functions must also run as owner to invoke it. This keeps direct RPC
-- access to next_code closed while triggers work for authenticated staff.
-- ============================================================================
alter function public.assign_patient_code() security definer;
alter function public.assign_appt_code() security definer;
alter function public.assign_rx_code() security definer;
alter function public.assign_lab_code() security definer;
alter function public.assign_adm_code() security definer;
alter function public.assign_er_code() security definer;
alter function public.assign_invoice_code() security definer;

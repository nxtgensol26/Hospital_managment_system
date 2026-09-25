-- ============================================================================
-- NxtHealth — 0009 fix: next_code must be SECURITY DEFINER
-- hospital_counters is RLS deny-all; the counter allocator must bypass RLS so
-- that authenticated staff inserts (which fire code-assign triggers) succeed.
-- ============================================================================
create or replace function public.next_code(p_hospital uuid, p_key text, p_prefix text, p_width int)
returns text language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  insert into public.hospital_counters(hospital_id, key, value)
  values (p_hospital, p_key, 1)
  on conflict (hospital_id, key)
  do update set value = public.hospital_counters.value + 1
  returning value into v;
  return p_prefix || lpad(v::text, p_width, '0');
end; $$;

-- keep it callable only where needed (triggers run as table owner context)
revoke execute on function public.next_code(uuid, text, text, int) from anon, public;

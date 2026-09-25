-- ============================================================================
-- NxtHealth — 0008 server-side secrets
-- The license signing key lives ONLY server-side. RLS deny-all to all clients;
-- edge functions (service role) read it. It is never exposed to the browser.
-- ============================================================================

create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
-- no policies => no client (anon/authenticated) can read or write. Service role bypasses RLS.

insert into public.app_secrets(key, value)
values ('license_signing_key', encode(gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

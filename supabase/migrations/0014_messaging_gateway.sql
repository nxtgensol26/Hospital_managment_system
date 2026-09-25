-- ============================================================================
-- NxtHealth — 0014 multi-hospital messaging gateway
-- Per-hospital, tenant-isolated provider configuration with credentials
-- encrypted at rest (pgcrypto pgp_sym). The credential columns are NEVER exposed
-- to the browser: the table is RLS deny-all and access is only via SECURITY
-- DEFINER RPCs (safe read) / service-role edge functions (decrypt to send).
-- ============================================================================
create extension if not exists pgcrypto;

-- integrations permission
insert into public.permissions(key) values ('integrations.manage') on conflict (key) do nothing;
insert into public.role_permissions(role_key, permission_key)
  values ('super_admin','integrations.manage'), ('hospital_admin','integrations.manage')
  on conflict do nothing;

-- notifications: test flag + configuration_missing status
alter table public.notifications add column if not exists is_test boolean not null default false;
alter table public.notifications drop constraint if exists notifications_status_check;
alter table public.notifications add constraint notifications_status_check
  check (status in ('queued','accepted','sent','delivered','failed','fallback','configuration_missing'));

-- server-side encryption key for messaging credentials (never leaves the server)
insert into public.app_secrets(key, value)
  values ('messaging_enc_key', encode(gen_random_bytes(32), 'hex'))
  on conflict (key) do nothing;

-- one messaging configuration per hospital
create table if not exists public.messaging_config (
  hospital_id uuid primary key references public.hospitals(id) on delete cascade,
  provider text not null default 'disabled' check (provider in ('sms_horizon','whatsapp','custom','disabled')),
  enabled boolean not null default false,
  base_url text,
  sms_enabled boolean not null default false,
  rcs_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  sms_fallback_enabled boolean not null default false,
  credential_enc bytea,                 -- encrypted; never selected by clients
  credential_last4 text,                -- safe masked hint
  whatsapp_provider text,
  whatsapp_base_url text,
  whatsapp_credential_enc bytea,        -- encrypted; never selected by clients
  whatsapp_last4 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.messaging_config enable row level security;  -- deny-all to clients; RPCs/service-role only

-- Safe read: returns configuration flags + masked hints, NEVER the credential.
create or replace function public.get_messaging_config()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare h uuid; r record;
begin
  if not (public.has_perm('admin.settings') or public.has_perm('integrations.manage')) then raise exception 'Not authorized'; end if;
  h := public.current_hospital_id();
  select * into r from public.messaging_config where hospital_id = h;
  if r.hospital_id is null then
    return jsonb_build_object('configured', false, 'provider', 'disabled', 'enabled', false,
      'sms_enabled', false, 'rcs_enabled', false, 'whatsapp_enabled', false, 'sms_fallback_enabled', false,
      'credential_configured', false, 'whatsapp_credential_configured', false);
  end if;
  return jsonb_build_object(
    'configured', true, 'provider', r.provider, 'enabled', r.enabled, 'base_url', r.base_url,
    'sms_enabled', r.sms_enabled, 'rcs_enabled', r.rcs_enabled, 'whatsapp_enabled', r.whatsapp_enabled,
    'sms_fallback_enabled', r.sms_fallback_enabled,
    'credential_configured', r.credential_enc is not null, 'credential_last4', r.credential_last4,
    'whatsapp_provider', r.whatsapp_provider, 'whatsapp_base_url', r.whatsapp_base_url,
    'whatsapp_credential_configured', r.whatsapp_credential_enc is not null, 'whatsapp_last4', r.whatsapp_last4,
    'updated_at', r.updated_at);
end; $$;
revoke execute on function public.get_messaging_config() from anon, public;

-- Save/update config. Encrypts any provided credential; omitted credentials are kept.
create or replace function public.save_messaging_config(p jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare h uuid; k text; cred text; wcred text;
begin
  if not (public.has_perm('admin.settings') or public.has_perm('integrations.manage')) then raise exception 'Not authorized'; end if;
  h := public.current_hospital_id();
  select value into k from public.app_secrets where key = 'messaging_enc_key';
  cred := nullif(p->>'credential', '');
  wcred := nullif(p->>'whatsapp_credential', '');
  insert into public.messaging_config as m (hospital_id, provider, enabled, base_url, sms_enabled, rcs_enabled, whatsapp_enabled, sms_fallback_enabled, whatsapp_provider, whatsapp_base_url, updated_at)
  values (h, coalesce(p->>'provider','disabled'), coalesce((p->>'enabled')::boolean,false), nullif(p->>'base_url',''),
    coalesce((p->>'sms_enabled')::boolean,false), coalesce((p->>'rcs_enabled')::boolean,false), coalesce((p->>'whatsapp_enabled')::boolean,false),
    coalesce((p->>'sms_fallback_enabled')::boolean,false), nullif(p->>'whatsapp_provider',''), nullif(p->>'whatsapp_base_url',''), now())
  on conflict (hospital_id) do update set provider=excluded.provider, enabled=excluded.enabled, base_url=excluded.base_url,
    sms_enabled=excluded.sms_enabled, rcs_enabled=excluded.rcs_enabled, whatsapp_enabled=excluded.whatsapp_enabled,
    sms_fallback_enabled=excluded.sms_fallback_enabled, whatsapp_provider=excluded.whatsapp_provider, whatsapp_base_url=excluded.whatsapp_base_url, updated_at=now();
  if cred is not null then
    update public.messaging_config set credential_enc = pgp_sym_encrypt(cred, k), credential_last4 = right(cred, 4) where hospital_id = h;
  end if;
  if wcred is not null then
    update public.messaging_config set whatsapp_credential_enc = pgp_sym_encrypt(wcred, k), whatsapp_last4 = right(wcred, 4) where hospital_id = h;
  end if;
  perform public.log_audit('Messaging config updated', 'messaging', h::text, coalesce(p->>'provider','disabled'));
  return public.get_messaging_config();
end; $$;
revoke execute on function public.save_messaging_config(jsonb) from anon, public;

-- Decrypt for server-side sending. Callable ONLY by service role (edge functions).
create or replace function public.get_messaging_secret(p_hospital uuid, p_which text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare k text; v bytea;
begin
  select value into k from public.app_secrets where key = 'messaging_enc_key';
  if p_which = 'whatsapp' then select whatsapp_credential_enc into v from public.messaging_config where hospital_id = p_hospital;
  else select credential_enc into v from public.messaging_config where hospital_id = p_hospital; end if;
  if v is null then return null; end if;
  return pgp_sym_decrypt(v, k);
end; $$;
revoke execute on function public.get_messaging_secret(uuid, text) from anon, authenticated, public;
grant execute on function public.get_messaging_secret(uuid, text) to service_role;

-- Seed the demo hospital's gateway (SMS Horizon RCS + SMS fallback, no real key yet).
insert into public.messaging_config (hospital_id, provider, enabled, base_url, rcs_enabled, sms_fallback_enabled)
select id, 'sms_horizon', true, 'https://smshorizon.com/api/v2/rcs', true, true from public.hospitals where code = 'HOSP-DEMO'
on conflict (hospital_id) do nothing;

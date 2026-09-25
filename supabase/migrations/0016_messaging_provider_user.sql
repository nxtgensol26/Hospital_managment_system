-- ============================================================================
-- NxtHealth — 0016 SMS Horizon account username (provider_user)
-- SMS Horizon RCS requires the account USERNAME in the JSON body as `user`,
-- alongside the API key sent as `Authorization: Bearer <key>`. The username is
-- NOT a secret: it is stored in plaintext and may be returned to the hospital
-- admin UI. The API key remains pgp_sym-encrypted in credential_enc, unchanged.
-- RLS (deny-all to clients) and tenant isolation are preserved: reads/writes go
-- only through these SECURITY DEFINER RPCs scoped to current_hospital_id(), and
-- decryption stays in the service-role-only get_messaging_secret (untouched).
-- ============================================================================

alter table public.messaging_config add column if not exists provider_user text;  -- non-secret account username

-- Safe read: now also returns provider_user (non-secret). NEVER returns the key.
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
      'provider_user', null,
      'credential_configured', false, 'whatsapp_credential_configured', false);
  end if;
  return jsonb_build_object(
    'configured', true, 'provider', r.provider, 'enabled', r.enabled, 'base_url', r.base_url,
    'sms_enabled', r.sms_enabled, 'rcs_enabled', r.rcs_enabled, 'whatsapp_enabled', r.whatsapp_enabled,
    'sms_fallback_enabled', r.sms_fallback_enabled,
    'provider_user', r.provider_user,
    'credential_configured', r.credential_enc is not null, 'credential_last4', r.credential_last4,
    'whatsapp_provider', r.whatsapp_provider, 'whatsapp_base_url', r.whatsapp_base_url,
    'whatsapp_credential_configured', r.whatsapp_credential_enc is not null, 'whatsapp_last4', r.whatsapp_last4,
    'updated_at', r.updated_at);
end; $$;
revoke execute on function public.get_messaging_config() from anon, public;

-- Save/update config. Persists provider_user (non-secret); keeps encrypting the
-- API key exactly as before. Credentials/username are KEPT when their key is
-- omitted from the payload (no accidental wipes on partial saves).
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
  -- Non-secret username: set/clear only when explicitly provided.
  if p ? 'provider_user' then
    update public.messaging_config set provider_user = nullif(p->>'provider_user','') where hospital_id = h;
  end if;
  if cred is not null then
    update public.messaging_config set credential_enc = pgp_sym_encrypt(cred, k), credential_last4 = right(cred, 4) where hospital_id = h;
  end if;
  if coalesce((p->>'clear_credential')::boolean, false) then
    update public.messaging_config set credential_enc = null, credential_last4 = null where hospital_id = h;
  end if;
  if wcred is not null then
    update public.messaging_config set whatsapp_credential_enc = pgp_sym_encrypt(wcred, k), whatsapp_last4 = right(wcred, 4) where hospital_id = h;
  end if;
  if coalesce((p->>'clear_whatsapp_credential')::boolean, false) then
    update public.messaging_config set whatsapp_credential_enc = null, whatsapp_last4 = null where hospital_id = h;
  end if;
  perform public.log_audit('Messaging config updated', 'messaging', h::text, coalesce(p->>'provider','disabled'));
  return public.get_messaging_config();
end; $$;
revoke execute on function public.save_messaging_config(jsonb) from anon, public;

-- get_messaging_secret is intentionally unchanged: it decrypts and returns ONLY
-- the API key, service-role only. The non-secret username is read directly from
-- the messaging_config row by the notify/messaging-test edge functions.

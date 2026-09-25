-- ============================================================================
-- NxtHealth — 0015 allow clearing messaging credentials
-- save_messaging_config keeps an existing credential when none is supplied.
-- This adds explicit clearing via clear_credential / clear_whatsapp_credential
-- so an admin can remove a stored key (e.g. rotate to none).
-- ============================================================================
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

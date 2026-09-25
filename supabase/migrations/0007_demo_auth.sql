-- ============================================================================
-- NxtHealth — 0007 demo auth users
-- Creates demo Supabase Auth accounts (bcrypt via pgcrypto) so the app can be
-- exercised end-to-end. Passwords are hashed, never stored in plaintext, and
-- never in the patients table. In production, staff are provisioned by an admin
-- and patients by the register-patient edge function (Auth Admin API).
-- ============================================================================

create or replace function public._provision_user(p_email text, p_pw text, p_meta_app jsonb, p_meta_user jsonb)
returns uuid language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is not null then return v_id; end if;
  v_id := gen_random_uuid();
  insert into auth.users(
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change)
  values(
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
    crypt(p_pw, gen_salt('bf')), now(),
    p_meta_app || jsonb_build_object('provider','email','providers', array['email']),
    p_meta_user, now(), now(), '', '', '', '');
  insert into auth.identities(id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values(gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', p_email), 'email', now(), now(), now());
  return v_id;
end; $$;
revoke execute on function public._provision_user(text,text,jsonb,jsonb) from anon, authenticated, public;

do $$
declare v_hosp uuid; v_uid uuid; v_doc uuid; v_pat uuid; v_code text;
begin
  select id into v_hosp from public.hospitals where code = 'HOSP-DEMO';

  -- staff
  perform public._provision_user('admin@nxthealth.demo','Admin@12345',
    jsonb_build_object('role','hospital_admin','hospital_id',v_hosp::text),
    jsonb_build_object('name','Hospital Administrator','username','admin'));

  perform public._provision_user('reception@nxthealth.demo','Recep@12345',
    jsonb_build_object('role','receptionist','hospital_id',v_hosp::text),
    jsonb_build_object('name','Front Desk','username','reception'));

  perform public._provision_user('labmgr@nxthealth.demo','Lab@12345',
    jsonb_build_object('role','lab_manager','hospital_id',v_hosp::text),
    jsonb_build_object('name','Lab Manager','username','labmgr'));

  perform public._provision_user('pharma@nxthealth.demo','Pharma@12345',
    jsonb_build_object('role','pharmacist','hospital_id',v_hosp::text),
    jsonb_build_object('name','Pharmacist','username','pharma'));

  perform public._provision_user('billing@nxthealth.demo','Bill@12345',
    jsonb_build_object('role','billing_staff','hospital_id',v_hosp::text),
    jsonb_build_object('name','Billing Desk','username','billing'));

  -- doctor (linked to a doctor record)
  select id into v_doc from public.doctors where hospital_id = v_hosp and name = 'Dr. Anil Mehta';
  v_uid := public._provision_user('dr.mehta@nxthealth.demo','Doctor@12345',
    jsonb_build_object('role','doctor','hospital_id',v_hosp::text),
    jsonb_build_object('name','Dr. Anil Mehta','username','dr.mehta','doctor_id',v_doc::text));
  update public.users set doctor_id = v_doc where id = v_uid;

  -- demo patient + portal account
  if not exists (select 1 from public.patients where hospital_id = v_hosp and mobile = '9822011111') then
    insert into public.patients(hospital_id,name,mobile,gender,dob,blood_group,address,medical_notes,allergies)
    values (v_hosp,'Ramesh Kulkarni','9822011111','male','1968-04-12','B+','Pune','Hypertension; on Amlodipine.','Penicillin')
    returning id, patient_code into v_pat, v_code;

    perform public._provision_user(lower(v_code)||'@patients.nxthealth.local','Portal@123',
      jsonb_build_object('role','patient','hospital_id',v_hosp::text),
      jsonb_build_object('name','Ramesh Kulkarni','username',v_code,'patient_id',v_pat::text,'must_change_password',true));
  end if;
end $$;

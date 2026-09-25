-- ============================================================================
-- NxtHealth — 0006 seed (reference data + demo hospital)
-- Idempotent. Auth users (staff/patients) are created via the Supabase Auth
-- Admin API in edge functions (see supabase/functions), never with plaintext SQL.
-- ============================================================================

-- ---------------- roles ----------------
insert into public.roles(key,label) values
 ('super_admin','Super Admin'),('hospital_admin','Hospital Admin'),('receptionist','Receptionist'),
 ('doctor','Doctor'),('nurse','Nurse'),('lab_technician','Lab Technician'),('lab_manager','Lab Manager'),
 ('pharmacist','Pharmacist'),('billing_staff','Billing Staff'),('inventory_manager','Inventory Manager'),
 ('patient','Patient')
on conflict (key) do update set label = excluded.label;

-- ---------------- permissions ----------------
insert into public.permissions(key) values
 ('dashboard.view'),('patients.view'),('patients.create'),('patients.edit'),
 ('appointments.view'),('appointments.manage'),('consultation.write'),('vitals.write'),
 ('lab.orders.view'),('lab.collect'),('lab.result'),('lab.verify'),('lab.release'),('lab.master'),
 ('pharmacy.view'),('pharmacy.dispense'),('pharmacy.inventory'),
 ('billing.view'),('billing.manage'),('beds.view'),('beds.manage'),('ipd.manage'),
 ('emergency.manage'),('reports.view'),('audit.view'),('admin.settings'),('admin.users'),
 ('license.manage'),('support.manage'),('portal.self')
on conflict (key) do nothing;

-- ---------------- role_permissions ----------------
delete from public.role_permissions where role_key <> 'super_admin';
-- super_admin: everything
insert into public.role_permissions select 'super_admin', key from public.permissions
on conflict do nothing;

insert into public.role_permissions(role_key, permission_key) values
 -- hospital_admin
 ('hospital_admin','dashboard.view'),('hospital_admin','patients.view'),('hospital_admin','patients.create'),('hospital_admin','patients.edit'),
 ('hospital_admin','appointments.view'),('hospital_admin','appointments.manage'),('hospital_admin','lab.orders.view'),('hospital_admin','lab.master'),
 ('hospital_admin','pharmacy.view'),('hospital_admin','pharmacy.inventory'),('hospital_admin','billing.view'),('hospital_admin','billing.manage'),
 ('hospital_admin','beds.view'),('hospital_admin','beds.manage'),('hospital_admin','ipd.manage'),('hospital_admin','emergency.manage'),
 ('hospital_admin','reports.view'),('hospital_admin','audit.view'),('hospital_admin','admin.settings'),('hospital_admin','admin.users'),
 ('hospital_admin','license.manage'),('hospital_admin','support.manage'),
 -- receptionist
 ('receptionist','dashboard.view'),('receptionist','patients.view'),('receptionist','patients.create'),('receptionist','patients.edit'),
 ('receptionist','appointments.view'),('receptionist','appointments.manage'),('receptionist','beds.view'),('receptionist','emergency.manage'),
 ('receptionist','billing.view'),('receptionist','support.manage'),
 -- doctor
 ('doctor','dashboard.view'),('doctor','patients.view'),('doctor','appointments.view'),('doctor','appointments.manage'),
 ('doctor','consultation.write'),('doctor','vitals.write'),('doctor','lab.orders.view'),('doctor','pharmacy.view'),
 ('doctor','beds.view'),('doctor','ipd.manage'),('doctor','reports.view'),
 -- nurse
 ('nurse','dashboard.view'),('nurse','patients.view'),('nurse','vitals.write'),('nurse','appointments.view'),
 ('nurse','beds.view'),('nurse','beds.manage'),('nurse','ipd.manage'),('nurse','lab.collect'),('nurse','emergency.manage'),
 -- lab_technician
 ('lab_technician','dashboard.view'),('lab_technician','patients.view'),('lab_technician','lab.orders.view'),('lab_technician','lab.collect'),('lab_technician','lab.result'),
 -- lab_manager
 ('lab_manager','dashboard.view'),('lab_manager','patients.view'),('lab_manager','lab.orders.view'),('lab_manager','lab.collect'),('lab_manager','lab.result'),
 ('lab_manager','lab.verify'),('lab_manager','lab.release'),('lab_manager','lab.master'),('lab_manager','reports.view'),
 -- pharmacist
 ('pharmacist','dashboard.view'),('pharmacist','patients.view'),('pharmacist','pharmacy.view'),('pharmacist','pharmacy.dispense'),('pharmacist','pharmacy.inventory'),
 -- billing_staff
 ('billing_staff','dashboard.view'),('billing_staff','patients.view'),('billing_staff','billing.view'),('billing_staff','billing.manage'),('billing_staff','appointments.view'),
 -- inventory_manager
 ('inventory_manager','dashboard.view'),('inventory_manager','pharmacy.view'),('inventory_manager','pharmacy.inventory'),
 -- patient
 ('patient','portal.self')
on conflict do nothing;

-- ---------------- demo hospital + catalogs ----------------
do $$
declare v_hosp uuid;
begin
  insert into public.hospitals(code,name,address,city,phone,email,registration_no)
  values ('HOSP-DEMO','NxtHealth Demo Hospital','2nd Floor, Med-Tech Park, Baner Road','Pune, Maharashtra','020-4000-1234','contact@demohospital.in','MH/HOSP/2021/00987')
  on conflict (code) do update set name = excluded.name
  returning id into v_hosp;

  insert into public.hospital_settings(hospital_id) values (v_hosp) on conflict (hospital_id) do nothing;

  if not exists (select 1 from public.departments where hospital_id = v_hosp) then
    insert into public.departments(hospital_id,name,code) values
     (v_hosp,'General Medicine','GM'),(v_hosp,'Cardiology','CARD'),(v_hosp,'Orthopedics','ORTHO'),
     (v_hosp,'Pediatrics','PAED'),(v_hosp,'Gynaecology','GYN'),(v_hosp,'ENT','ENT'),
     (v_hosp,'Dermatology','DERMA'),(v_hosp,'Emergency','EMER');

    insert into public.doctors(hospital_id,name,department_id,qualification,reg_no,consultation_fee,timings,phone) values
     (v_hosp,'Dr. Anil Mehta',(select id from public.departments where hospital_id=v_hosp and code='GM'),'MBBS, MD','MH-45123',400,'Mon–Sat 9:00–14:00','9820011122'),
     (v_hosp,'Dr. Priya Rao',(select id from public.departments where hospital_id=v_hosp and code='CARD'),'MBBS, DM (Cardiology)','MH-51288',800,'Mon–Fri 10:00–16:00','9820033344'),
     (v_hosp,'Dr. Sameer Khan',(select id from public.departments where hospital_id=v_hosp and code='ORTHO'),'MBBS, MS (Ortho)','MH-49871',600,'Tue–Sat 11:00–17:00','9820055566'),
     (v_hosp,'Dr. Meera Iyer',(select id from public.departments where hospital_id=v_hosp and code='PAED'),'MBBS, DCH','MH-52099',450,'Mon–Sat 9:30–13:30','9820077788'),
     (v_hosp,'Dr. Rahul Deshmukh',(select id from public.departments where hospital_id=v_hosp and code='EMER'),'MBBS, EM','MH-53410',500,'24x7 Rotational','9820099900');
  end if;

  if not exists (select 1 from public.lab_tests where hospital_id = v_hosp) then
    insert into public.lab_tests(hospital_id,name,code,category,price,sample_type,unit,ref_range) values
     (v_hosp,'Complete Blood Count (CBC)','CBC','Haematology',350,'Blood (EDTA)','','See panel'),
     (v_hosp,'Haemoglobin','HB','Haematology',120,'Blood','g/dL','13-17'),
     (v_hosp,'Fasting Blood Sugar','FBS','Biochemistry',90,'Serum','mg/dL','70-100'),
     (v_hosp,'Lipid Profile','LIPID','Biochemistry',650,'Serum','mg/dL','See panel'),
     (v_hosp,'Thyroid (TSH)','TSH','Endocrinology',300,'Serum','uIU/mL','0.4-4.0'),
     (v_hosp,'Liver Function Test','LFT','Biochemistry',700,'Serum','','See panel'),
     (v_hosp,'Kidney Function Test','KFT','Biochemistry',700,'Serum','','See panel'),
     (v_hosp,'Serum Creatinine','CREAT','Biochemistry',180,'Serum','mg/dL','0.7-1.3');
  end if;

  if not exists (select 1 from public.medicines where hospital_id = v_hosp) then
    insert into public.medicines(hospital_id,name,category,unit,mrp,reorder_level) values
     (v_hosp,'Paracetamol 500mg','Analgesic','Tablet',2,200),
     (v_hosp,'Amoxicillin 500mg','Antibiotic','Capsule',6,150),
     (v_hosp,'Azithromycin 500mg','Antibiotic','Tablet',14,100),
     (v_hosp,'Pantoprazole 40mg','Antacid','Tablet',5,120),
     (v_hosp,'Cetirizine 10mg','Antihistamine','Tablet',2,100),
     (v_hosp,'Metformin 500mg','Antidiabetic','Tablet',3,200),
     (v_hosp,'Amlodipine 5mg','Antihypertensive','Tablet',3,150),
     (v_hosp,'ORS Sachet','Electrolyte','Sachet',18,60);

    insert into public.medicine_batches(hospital_id,medicine_id,batch_no,expiry,quantity,purchase_price,selling_price,supplier)
    select v_hosp, m.id, 'B'||substr(md5(m.name),1,6), (current_date + interval '400 days')::date, 500, m.mrp*0.6, m.mrp, 'MediSupply Distributors'
    from public.medicines m where m.hospital_id = v_hosp;
  end if;

  if not exists (select 1 from public.wards where hospital_id = v_hosp) then
    with w as (
      insert into public.wards(hospital_id,name,type) values
        (v_hosp,'General Ward','General'),(v_hosp,'Private Rooms','Private'),(v_hosp,'ICU','Critical')
      returning id, name, type
    ), r as (
      insert into public.rooms(hospital_id,ward_id,number)
      select v_hosp, w.id, w.name||'-R1' from w returning id, ward_id
    )
    insert into public.beds(hospital_id,room_id,ward_id,label,charge_per_day)
    select v_hosp, r.id, r.ward_id, w.name||'-B'||g,
           case when w.type='Critical' then 9000 when w.type='Private' then 4500 else 1500 end
    from r join w on w.id = r.ward_id, generate_series(1,2) g;
  end if;

  if not exists (select 1 from public.notification_templates where hospital_id = v_hosp) then
    insert into public.notification_templates(hospital_id,key,template_id,channel,label,body) values
     (v_hosp,'registration','NXH_REG_001','rcs','Registration welcome','Welcome to {{hospital}}, {{name}}. Your Patient ID is {{patientId}}. Portal login: {{loginId}}. - NxtHealth'),
     (v_hosp,'appt_confirm','NXH_APPT_001','rcs','Appointment confirmed','Hi {{name}}, appointment {{apptId}} with {{doctor}} is confirmed for {{date}} {{time}} at {{hospital}}.'),
     (v_hosp,'appt_reminder','NXH_APPT_002','rcs','Appointment reminder','Reminder: appointment {{apptId}} with {{doctor}} on {{date}} {{time}}. - {{hospital}}'),
     (v_hosp,'appt_cancel','NXH_APPT_003','sms','Appointment cancelled','Your appointment {{apptId}} on {{date}} has been cancelled. - {{hospital}}'),
     (v_hosp,'lab_collected','NXH_LAB_001','sms','Sample collected','Hi {{name}}, lab sample {{sampleId}} collected. Report soon. - {{hospital}}'),
     (v_hosp,'lab_ready','NXH_LAB_002','rcs','Lab report ready','Hi {{name}}, your lab report for {{orderId}} is ready on the NxtHealth portal.'),
     (v_hosp,'prescription_ready','NXH_RX_001','rcs','Prescription ready','Hi {{name}}, prescription {{rxId}} from {{doctor}} is ready.'),
     (v_hosp,'bill_generated','NXH_BILL_001','sms','Bill generated','Bill {{invId}} of {{amount}} generated at {{hospital}}.'),
     (v_hosp,'payment_receipt','NXH_PAY_001','sms','Payment received','Payment of {{amount}} received against {{invId}}. Thank you. - {{hospital}}'),
     (v_hosp,'followup_reminder','NXH_FUP_001','rcs','Follow-up reminder','Hi {{name}}, follow-up with {{doctor}} is due on {{date}}.'),
     (v_hosp,'discharge','NXH_DIS_001','rcs','Discharge','Hi {{name}}, your discharge from {{hospital}} is complete. Summary on the portal.');
  end if;
end $$;

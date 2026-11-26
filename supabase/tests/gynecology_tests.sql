-- =============================================================================
-- Gynecology module tests (reuses rls_tests users/patients)
--   a2 clinic admin A · a3 consultant A · a4 resident A · a5 nurse A · a6 consultant B
--   f1 clinic-A patient · f3 clinic-B patient
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

create temp table gx (k text primary key, id uuid);
grant select, insert on gx to authenticated;

-- ---------------------------------------------------------------------------
-- History & visits
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.lives($q$insert into public.gyn_profiles (patient_id, clinic_id, menarche_age, cycle_length_days, cycle_regularity,
  menopause_status, contraception, hpv_vaccinated)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 12, 28, 'regular', 'premenopausal', 'none', 'no')$q$,
  'nurse records gynecological history');
select tst.throws($q$update public.gyn_profiles set menopause_age = 50 where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'menopause age requires a postmenopausal status');
select tst.throws($q$update public.gyn_profiles set menopause_status = null, menopause_age = 50 where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'menopause age with unknown status is rejected (NULL-safe check)');
reset role;
select tst.ok((select 'gynecology' = any (specialties) from public.patients where id = '00000000-0000-0000-0000-0000000000f1'),
  'gyn history tags the patient with gynecology');

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.lives($q$insert into gx select 'v1', public.record_gyn_visit('00000000-0000-0000-0000-0000000000f1',
  '{"complaints": ["aub", "pelvic_pain"], "palm_coein": ["L-SM", "O"], "pain_score": 6, "uterus_size": "enlarged_lt12w"}',
  '{"chief_complaint": "Heavy menstrual bleeding"}')$q$, 'resident records a gynecology visit');
select tst.ok((select e.specialty = 'gynecology' and e.status = 'draft' from public.gyn_visits v join public.encounters e on e.id = v.encounter_id
               where v.id = (select id from gx where k = 'v1')), 'visit creates a draft gynecology encounter');
select tst.throws($q$select public.record_gyn_visit('00000000-0000-0000-0000-0000000000f1', '{"complaints": ["headache"]}')$q$,
  'unknown complaint code rejected');
select tst.throws($q$select public.record_gyn_visit('00000000-0000-0000-0000-0000000000f1', '{"palm_coein": ["X"]}')$q$,
  'invalid PALM-COEIN code rejected');
select tst.throws($q$select public.record_gyn_visit('00000000-0000-0000-0000-0000000000f1',
  jsonb_build_object('visit_date', current_date - 10, 'lmp', current_date - 2))$q$, 'LMP cannot be after the visit');
select tst.throws($q$select public.record_gyn_visit('00000000-0000-0000-0000-0000000000f1', '{"pop_stage": 5}')$q$,
  'POP-Q stage above 4 rejected');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$update public.encounters set status = 'signed'
  where id = (select encounter_id from public.gyn_visits where id = (select id from gx where k = 'v1'))$q$, 'consultant signs the gyn visit');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.throws($q$update public.gyn_visits set pain_score = 2 where id = (select id from gx where k = 'v1')$q$,
  'signed gyn visit is immutable');
reset role;

-- ---------------------------------------------------------------------------
-- Ultrasound
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.throws($q$insert into public.gyn_ultrasounds (patient_id, clinic_id, iota_m_features)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', '{M1}')$q$,
  'IOTA features require an adnexal mass');
select tst.lives($q$insert into public.gyn_ultrasounds (patient_id, clinic_id, route, endometrial_thickness_mm, fibroids, adnexal_mass,
  mass_side, mass_max_diameter_mm, iota_b_features)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 'transvaginal', 9,
          '[{"figo_type": "2", "size_mm": 32, "location": "posterior"}]', true, 'right', 45, '{B1}')$q$,
  'pelvic ultrasound with fibroid and adnexal mass');
select tst.throws($q$insert into public.gyn_ultrasounds (patient_id, clinic_id, adnexal_mass, iota_b_features)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', true, '{B9}')$q$,
  'invalid IOTA feature rejected');
select tst.throws($q$insert into public.gyn_ultrasounds (patient_id, clinic_id, fibroids)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', '{"figo_type": "2"}')$q$,
  'fibroids must be a list');
select tst.ok((select performed_by = '00000000-0000-0000-0000-0000000000a3' from public.gyn_ultrasounds limit 1), 'ultrasound author stamped');

-- ---------------------------------------------------------------------------
-- Cervical screening & colposcopy
-- ---------------------------------------------------------------------------
select tst.lives($q$with x as (insert into public.cervical_screenings (patient_id, clinic_id, sample_date, test_type)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date - 14, 'cotest') returning id) insert into gx select 's1', id from x$q$,
  'pending co-test recorded');
select tst.throws($q$update public.cervical_screenings set status = 'resulted', cytology_result = 'nilm'
  where id = (select id from gx where k = 's1')$q$, 'co-test result needs both HPV and cytology');
select tst.lives($q$update public.cervical_screenings set status = 'resulted', cytology_result = 'nilm', hpv_result = 'hpv16',
  recommendation = 'colposcopy' where id = (select id from gx where k = 's1')$q$, 'co-test resulted');
select tst.throws($q$update public.cervical_screenings set next_due_date = current_date - 30 where id = (select id from gx where k = 's1')$q$,
  'next due date must follow the sample');
select tst.throws($q$insert into public.cervical_screenings (patient_id, clinic_id, sample_date, test_type)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date + 1, 'cytology')$q$,
  'future sample date rejected');
select tst.lives($q$with x as (insert into public.colposcopies (patient_id, clinic_id, screening_id, tz_type, findings, biopsy_taken, histology)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', (select id from gx where k = 's1'), 1,
          'major_grade2', true, 'pending') returning id) insert into gx select 'c1', id from x$q$, 'colposcopy with biopsy recorded');
select tst.throws($q$insert into public.colposcopies (patient_id, clinic_id, findings, histology)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 'normal', 'cin1')$q$,
  'histology requires a biopsy or excision');
reset role;
with x as (insert into public.cervical_screenings (patient_id, clinic_id, sample_date, test_type)
  values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000c11b', current_date - 3, 'cytology') returning id) insert into gx select 's_other', id from x;
select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.throws($q$insert into public.colposcopies (patient_id, clinic_id, screening_id)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', (select id from gx where k = 's_other'))$q$,
  'colposcopy cannot link to another patient''s screening');

-- ---------------------------------------------------------------------------
-- Procedures
-- ---------------------------------------------------------------------------
select tst.lives($q$with x as (insert into public.gyn_procedures (patient_id, clinic_id, procedure_code, approach,
  indication, histology_status, clavien_dindo)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 'lletz', 'office', 'CIN2 on biopsy', 'pending', 'none')
  returning id) insert into gx select 'p1', id from x$q$, 'LLETZ recorded with histology pending');
select tst.ok((select surgeon_id = '00000000-0000-0000-0000-0000000000a3' from public.gyn_procedures where id = (select id from gx where k = 'p1')),
  'surgeon defaults to the recording clinician');
select tst.throws($q$update public.gyn_procedures set histology_result = 'CIN3, margins clear' where id = (select id from gx where k = 'p1')$q$,
  'histology result requires status received');
select tst.lives($q$update public.gyn_procedures set histology_status = 'received', histology_result = 'CIN3, margins clear'
  where id = (select id from gx where k = 'p1')$q$, 'histology result recorded');
select tst.throws($q$insert into public.gyn_procedures (patient_id, clinic_id, procedure_code)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 'appendectomy')$q$, 'unknown procedure rejected');
select tst.throws($q$update public.gyn_procedures set patient_id = '00000000-0000-0000-0000-0000000000f3' where id = (select id from gx where k = 'p1')$q$,
  'procedure patient is immutable');
reset role;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.eq(tst.n('select * from public.gyn_visits') + tst.n('select * from public.cervical_screenings')
  + tst.n('select * from public.gyn_procedures') + tst.n('select * from public.gyn_profiles'), 0, 'clinic admin cannot see gynecology records');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n($q$select * from public.cervical_screenings where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$), 0,
  'other clinic cannot see screening results');
select tst.eq(tst.n($q$select * from public.gyn_worklist where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$), 0,
  'other clinic worklist excludes the patient');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.ok((select last_hpv_result = 'hpv16' and pending_histology = 1 and screening_recommendation = 'colposcopy'
               from public.gyn_worklist where patient_id = '00000000-0000-0000-0000-0000000000f1'), 'worklist summarises screening and pending histology');
reset role;

select tst.ok((select count(distinct table_name) = 6 from public.audit_log
               where table_name in ('gyn_profiles', 'gyn_visits', 'gyn_ultrasounds', 'cervical_screenings', 'colposcopies', 'gyn_procedures')),
  'all gynecology tables are audited');

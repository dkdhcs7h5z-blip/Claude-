-- =============================================================================
-- Obstetrics module tests (run after rls_tests.sql; reuses its users/patients)
--   a2 clinic admin A · a3 consultant A · a4 resident A · a5 nurse A · a6 consultant B
--   f1 clinic-A patient with an active pregnancy · f3 clinic-B patient
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

create temp table ob_ids (k text primary key, id uuid);
grant select, insert on ob_ids to authenticated;
insert into ob_ids select 'preg', id from public.pregnancies
  where patient_id = '00000000-0000-0000-0000-0000000000f1' and status = 'active';

-- ---------------------------------------------------------------------------
-- Pregnancy rules
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.throws($q$insert into public.pregnancies (patient_id, clinic_id, lmp)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date - 30)$q$,
  'only one ongoing pregnancy per patient');
select tst.throws($q$insert into public.pregnancies (patient_id, clinic_id, status)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a', 'active')$q$,
  'an ongoing pregnancy must be dated');
select tst.throws($q$insert into public.pregnancies (patient_id, clinic_id, lmp, gravida, para, abortus)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a', current_date - 30, 2, 2, 1)$q$,
  'GPAL must be consistent (P + A <= G)');
select tst.lives($q$insert into public.pregnancies (patient_id, clinic_id, edd, edd_basis, us_dating_date, us_dating_ga_days, gravida, para, abortus, risk_factors)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a', current_date + 200, 'ultrasound',
          current_date - 5, 75, 1, 0, 0, '{chronic_hypertension}')$q$,
  'consultant registers an ultrasound-dated pregnancy for her private patient');
reset role;
select tst.ok((select 'obstetrics' = any (specialties) from public.patients where id = '00000000-0000-0000-0000-0000000000f2'),
  'registering a pregnancy tags the patient with obstetrics');

-- ---------------------------------------------------------------------------
-- Antenatal visits
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.lives($q$insert into ob_ids select 'visit1', public.record_antenatal_visit(
  (select id from ob_ids where k = 'preg'),
  '{"weight_kg": 72.5, "bp_systolic": 128, "bp_diastolic": 82, "urine_protein": "negative", "fundal_height_cm": 17,
    "fetal_heart_rate": 148, "presentation": "not_assessed", "fetal_movements": "normal"}',
  '{"assessment": "Uncomplicated"}')$q$, 'resident records an antenatal visit via RPC');
select tst.eq((select ga_days from public.antenatal_visits where id = (select id from ob_ids where k = 'visit1')), 120,
  'gestational age at visit is computed by the database');
select tst.ok((select e.status = 'draft' and e.specialty = 'obstetrics' and e.encounter_type = 'antenatal_visit'
               from public.antenatal_visits v join public.encounters e on e.id = v.encounter_id
               where v.id = (select id from ob_ids where k = 'visit1')), 'visit creates a draft obstetric encounter');
select tst.throws($q$select public.record_antenatal_visit((select id from ob_ids where k = 'preg'),
  '{"bp_systolic": 80, "bp_diastolic": 95}')$q$, 'diastolic above systolic is rejected');
select tst.throws($q$select public.record_antenatal_visit((select id from ob_ids where k = 'preg'),
  '{"bp_systolic": 300, "bp_diastolic": 95}')$q$, 'implausible blood pressure is rejected');
select tst.throws($q$select public.record_antenatal_visit((select id from ob_ids where k = 'preg'),
  '{"visit_date": "2999-01-01"}')$q$, 'future visit dates are rejected');
select tst.throws($q$insert into public.antenatal_visits (pregnancy_id, patient_id, clinic_id, encounter_id)
  values ((select id from ob_ids where k = 'preg'), '00000000-0000-0000-0000-0000000000f3',
          '00000000-0000-0000-0000-00000000c11a',
          (select encounter_id from public.antenatal_visits where id = (select id from ob_ids where k = 'visit1')))$q$,
  'visit cannot be attached to another patient');
select tst.lives($q$update public.antenatal_visits set weight_kg = 72.8 where id = (select id from ob_ids where k = 'visit1')$q$,
  'draft visit can be corrected');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.eq(tst.n('select * from public.antenatal_visits'), 0, 'clinic admin cannot see antenatal visits');
select tst.throws($q$select public.record_antenatal_visit((select id from ob_ids where k = 'preg'), '{}')$q$,
  'clinic admin cannot record visits');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.antenatal_visits'), 0, 'other clinic cannot see antenatal visits');
select tst.eq(tst.n('select * from public.obstetric_worklist'), 0, 'other clinic worklist is empty');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
-- (resident holds an explicit grant on f2 from rls_tests, so both pregnancies are visible)
select tst.eq(tst.n('select * from public.obstetric_worklist'), 2, 'resident worklist follows patient grants');
select tst.ok((select last_bp_systolic = 128 and visit_count = 1 from public.obstetric_worklist
               where patient_id = '00000000-0000-0000-0000-0000000000f1'), 'worklist carries latest visit');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.eq(tst.n('select * from public.obstetric_worklist'), 2, 'consultant worklist includes her private patient');
-- private antenatal note by the consultant
select tst.lives($q$insert into ob_ids select 'visit_priv', public.record_antenatal_visit((select id from ob_ids where k = 'preg'),
  '{"bp_systolic": 118, "bp_diastolic": 76}', '{"is_private": true}')$q$, 'consultant records a private visit');
-- sign the resident's visit
select tst.lives($q$update public.encounters set status = 'signed'
  where id = (select encounter_id from public.antenatal_visits where id = (select id from ob_ids where k = 'visit1'))$q$,
  'consultant signs the visit');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.eq(tst.n($q$select * from public.antenatal_visits where id = (select id from ob_ids where k = 'visit_priv')$q$), 0,
  'private visit vitals are hidden with the private encounter');
select tst.throws($q$update public.antenatal_visits set weight_kg = 90 where id = (select id from ob_ids where k = 'visit1')$q$,
  'signed visit is immutable');
reset role;

-- ---------------------------------------------------------------------------
-- Delivery
-- ---------------------------------------------------------------------------
-- move the test pregnancy to term (38+4); a delivery record starts at 20 weeks
update public.pregnancies set lmp = current_date - 270 where id = (select id from ob_ids where k = 'preg');

select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.throws($q$select public.record_delivery((select id from ob_ids where k = 'preg'),
  jsonb_build_object('delivered_at', now(), 'onset', 'spontaneous', 'mode', 'svd'),
  '[{"sex": "female", "birth_weight_g": 3200, "apgar_1": 8, "apgar_5": 9}, {"sex": "male"}]')$q$,
  'newborn count must match plurality');
select tst.throws($q$select public.record_delivery((select id from ob_ids where k = 'preg'),
  jsonb_build_object('delivered_at', now(), 'onset', 'spontaneous', 'mode', 'svd'),
  '[{"sex": "female", "apgar_1": 11}]')$q$, 'invalid Apgar score is rejected');
select tst.throws($q$select public.record_delivery((select id from ob_ids where k = 'preg'),
  jsonb_build_object('delivered_at', now(), 'onset', 'prelabour_cs', 'mode', 'svd'),
  '[{"sex": "female"}]')$q$, 'pre-labour CS must be a caesarean mode');
select tst.lives($q$insert into ob_ids select 'delivery', public.record_delivery((select id from ob_ids where k = 'preg'),
  jsonb_build_object('delivered_at', now() - interval '1 hour', 'onset', 'spontaneous', 'mode', 'svd',
                     'anesthesia', 'epidural', 'blood_loss_ml', 350, 'perineum', 'first_degree'),
  '[{"sex": "female", "birth_weight_g": 3200, "apgar_1": 8, "apgar_5": 9}]')$q$, 'nurse records a delivery');
reset role;

select tst.ok((select status = 'delivered' and outcome_date = current_date from public.pregnancies
               where id = (select id from ob_ids where k = 'preg')), 'delivery closes the pregnancy');
select tst.eq((select ga_days from public.deliveries where id = (select id from ob_ids where k = 'delivery')), 270,
  'GA at delivery is computed');
select tst.eq((select count(*) from public.newborns where delivery_id = (select id from ob_ids where k = 'delivery')), 1,
  'newborn record created');

select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.throws($q$select public.record_delivery((select id from ob_ids where k = 'preg'),
  jsonb_build_object('delivered_at', now(), 'onset', 'spontaneous', 'mode', 'svd'), '[{"sex": "female"}]')$q$,
  'a pregnancy cannot be delivered twice');
select tst.throws($q$select public.record_antenatal_visit((select id from ob_ids where k = 'preg'), '{}')$q$,
  'no antenatal visits after delivery');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.deliveries') + tst.n('select * from public.newborns'), 0,
  'other clinic cannot see delivery or newborn records');
reset role;

select tst.ok((select count(*) >= 3 from public.audit_log where table_name in ('antenatal_visits', 'deliveries', 'newborns')),
  'obstetric records are audited');

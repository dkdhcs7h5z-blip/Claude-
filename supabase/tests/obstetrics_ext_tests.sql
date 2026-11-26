-- =============================================================================
-- Obstetrics extended tests: biometry/EFW, multiples, postnatal, partogram
-- (runs after obstetrics_tests.sql: f1 delivered today; f2 has an ongoing
--  ultrasound-dated pregnancy owned by consultant a3, shared with resident a4)
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

create temp table ox (k text primary key, id uuid);
grant select, insert on ox to authenticated;
insert into ox select 'preg2', id from public.pregnancies where patient_id = '00000000-0000-0000-0000-0000000000f2' and status = 'active';
insert into ox select 'delivery1', id from public.deliveries where patient_id = '00000000-0000-0000-0000-0000000000f1';

select tst.eq(private.hadlock_efw(300, 300, 60), 2100, 'Hadlock 4 EFW (HC 300, AC 300, FL 60 mm) = 2100 g');
select tst.ok(private.hadlock_efw(300, null, 60) is null, 'EFW needs HC, AC and FL');

-- ---------------------------------------------------------------------------
-- Fetal scans & biometry
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$insert into ox select 'scan1', public.record_fetal_scan((select id from ox where k = 'preg2'),
  '{"assessment_type": "growth_scan", "impression": "Normal growth"}',
  '[{"fetus_label": "A", "bpd_mm": 75, "hc_mm": 300, "ac_mm": 300, "fl_mm": 60, "dvp_cm": 4.5, "ua_edf": "present"}]')$q$,
  'consultant records a growth scan with biometry');
select tst.eq((select efw_g from public.fetal_biometry where fetal_assessment_id = (select id from ox where k = 'scan1')), 2100,
  'EFW is computed by the database');
select tst.ok((select ga_days is not null from public.fetal_biometry where fetal_assessment_id = (select id from ox where k = 'scan1')),
  'GA at scan is computed');
select tst.ok((select pregnancy_id = (select id from ox where k = 'preg2') and gestational_age_days is not null
               from public.fetal_assessments where id = (select id from ox where k = 'scan1')), 'scan is linked to the pregnancy');
select tst.throws($q$select public.record_fetal_scan((select id from ox where k = 'preg2'), '{}',
  '[{"fetus_label": "A"}, {"fetus_label": "B"}]')$q$, 'cannot record two fetuses for a singleton');
select tst.throws($q$select public.record_fetal_scan((select id from ox where k = 'preg2'), '{}',
  '[{"fetus_label": "A", "ac_mm": 900}]')$q$, 'implausible biometry is rejected');
select tst.throws($q$update public.pregnancies set chorionicity = 'mcda' where id = (select id from ox where k = 'preg2')$q$,
  'chorionicity only applies to multiples');
select tst.lives($q$update public.pregnancies set plurality = 2, chorionicity = 'mcda' where id = (select id from ox where k = 'preg2')$q$,
  'twin pregnancy with chorionicity');
select tst.lives($q$select public.record_fetal_scan((select id from ox where k = 'preg2'), '{}',
  '[{"fetus_label": "A", "hc_mm": 300, "ac_mm": 300, "fl_mm": 60}, {"fetus_label": "B", "hc_mm": 290, "ac_mm": 250, "fl_mm": 55}]')$q$,
  'per-fetus biometry for twins');
select tst.throws($q$select public.record_fetal_scan((select id from ox where k = 'preg2'), '{}',
  '[{"fetus_label": "A"}, {"fetus_label": "A"}]')$q$, 'fetus labels are unique within a scan');
select tst.lives($q$select public.record_antenatal_visit((select id from ox where k = 'preg2'),
  '{"fhr_by_fetus": [148, 152], "presentation_by_fetus": ["cephalic", "breech"]}')$q$, 'per-fetus FHR and presentation at a visit');
select tst.lives($q$update public.pregnancies set previous_cs_count = 0, high_risk_plan = 'Aspirin 150 mg; serial growth scans',
  current_medications = 'Aspirin 150 mg nocte' where id = (select id from ox where k = 'preg2')$q$, 'high-risk plan and medications recorded');
select tst.throws($q$update public.pregnancies set para = 0, previous_cs_count = 2 where id = (select id from ox where k = 'preg2')$q$,
  'caesarean count cannot exceed parity');
select tst.lives($q$select public.record_antenatal_visit((select id from ox where k = 'preg2'),
  jsonb_build_object('next_visit_date', current_date + 14))$q$, 'visit records the next appointment');
select tst.throws($q$select public.record_antenatal_visit((select id from ox where k = 'preg2'),
  jsonb_build_object('next_visit_date', current_date - 1))$q$, 'next appointment must be after the visit');
select tst.throws($q$select public.record_antenatal_visit((select id from ox where k = 'preg2'), '{"fhr_by_fetus": [148, 300]}')$q$,
  'implausible per-fetus FHR is rejected');
select tst.throws($q$select public.record_antenatal_visit((select id from ox where k = 'preg2'), '{"presentation_by_fetus": ["sideways"]}')$q$,
  'invalid per-fetus presentation is rejected');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.eq(tst.n('select * from public.fetal_biometry'), 3, 'resident with a grant sees the biometry');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.fetal_biometry'), 0, 'other clinic cannot see biometry');
reset role;

-- ---------------------------------------------------------------------------
-- Labour observations (partogram)
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.throws($q$insert into public.labour_observations (pregnancy_id, patient_id, clinic_id, cervical_dilation_cm)
  values ((select id from ox where k = 'preg2'), '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a', 4)$q$,
  'no labour observations before 20 weeks');
reset role;
update public.pregnancies set edd = current_date + 10 where id = (select id from ox where k = 'preg2');

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.lives($q$insert into public.labour_observations (pregnancy_id, patient_id, clinic_id, observed_at, cervical_dilation_cm, descent_fifths, contractions_per_10min, fhr, liquor)
  values ((select id from ox where k = 'preg2'), '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a',
          now() - interval '2 hours', 4, 4, 3, 140, 'clear')$q$, 'resident records a labour observation');
insert into ox select 'lab1', id from public.labour_observations order by created_at desc limit 1;
select tst.throws($q$update public.labour_observations set cervical_dilation_cm = 6 where id = (select id from ox where k = 'lab1')$q$,
  'labour observations cannot be edited');
select tst.lives($q$update public.labour_observations set entered_in_error = true where id = (select id from ox where k = 'lab1')$q$,
  'an observation can be flagged as entered in error');
select tst.throws($q$insert into public.labour_observations (pregnancy_id, patient_id, clinic_id, observed_at, cervical_dilation_cm)
  values ((select id from ox where k = 'preg2'), '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a',
          now() + interval '1 hour', 5)$q$, 'future observation time is rejected');
select tst.throws($q$insert into public.labour_observations (pregnancy_id, patient_id, clinic_id, cervical_dilation_cm)
  values ((select id from ox where k = 'preg2'), '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a', 11)$q$,
  'dilation above 10 cm is rejected');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.eq(tst.n('select * from public.labour_observations'), 0, 'clinic admin cannot see labour observations');
reset role;

-- ---------------------------------------------------------------------------
-- Postnatal visits
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.lives($q$insert into ox select 'pn1', public.record_postnatal_visit((select id from ox where k = 'delivery1'),
  '{"bp_systolic": 128, "bp_diastolic": 80, "temperature_c": 37.1, "uterus": "well_contracted", "lochia": "normal",
    "breastfeeding": "exclusive", "epds_score": 6, "epds_self_harm": false}')$q$, 'nurse records a postnatal visit');
select tst.eq((select days_postpartum from public.postnatal_visits where id = (select id from ox where k = 'pn1')), 0,
  'days postpartum computed');
select tst.ok((select e.encounter_type = 'postnatal_visit' from public.postnatal_visits v join public.encounters e on e.id = v.encounter_id
               where v.id = (select id from ox where k = 'pn1')), 'postnatal visit creates a postnatal encounter');
select tst.throws($q$select public.record_postnatal_visit((select id from ox where k = 'delivery1'),
  jsonb_build_object('visit_date', current_date - 3))$q$, 'postnatal visit cannot precede delivery');
select tst.throws($q$select public.record_postnatal_visit((select id from ox where k = 'delivery1'), '{"epds_score": 31}')$q$,
  'EPDS score above 30 is rejected');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$update public.encounters set status = 'signed'
  where id = (select encounter_id from public.postnatal_visits where id = (select id from ox where k = 'pn1'))$q$, 'consultant signs postnatal visit');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.throws($q$update public.postnatal_visits set lochia = 'heavy' where id = (select id from ox where k = 'pn1')$q$,
  'signed postnatal visit is immutable');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.postnatal_visits'), 0, 'other clinic cannot see postnatal visits');
reset role;

select tst.ok((select count(*) >= 3 from public.audit_log where table_name in ('fetal_biometry', 'postnatal_visits', 'labour_observations')),
  'extended obstetric records are audited');

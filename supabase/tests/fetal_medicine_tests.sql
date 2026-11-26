-- =============================================================================
-- Fetal medicine tests (reuses rls_tests users/patients)
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

create temp table fm (k text primary key, id uuid);
grant select, insert on fm to authenticated;

-- Fixtures (as postgres): singleton at 22+0 for a new clinic-A patient, one for B-001 (clinic B)
with p as (insert into public.patients (clinic_id, mrn, first_name_en, last_name_en, date_of_birth, visibility, rh_factor)
  values ('00000000-0000-0000-0000-00000000c11a', 'A-FM1', 'Nour', 'Adel', '1990-03-03', 'clinic', 'negative') returning id)
insert into fm select 'pt', id from p;
insert into fm select 'preg_f2', id from public.pregnancies where patient_id = '00000000-0000-0000-0000-0000000000f2' and status = 'active';
with g as (insert into public.pregnancies (patient_id, clinic_id, lmp, gravida, para, abortus)
  values ((select id from fm where k = 'pt'), '00000000-0000-0000-0000-00000000c11a', current_date - 154, 1, 0, 0) returning id)
insert into fm select 'preg', id from g;
with g as (insert into public.pregnancies (patient_id, clinic_id, lmp, gravida, para, abortus)
  values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000c11b', current_date - 90, 1, 0, 0) returning id)
insert into fm select 'preg_b', id from g;

-- ---------------------------------------------------------------------------
-- 11–14 week scan
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$insert into fm select 'nt', public.record_fm_scan((select id from fm where k = 'preg'), 'nt_scan',
  jsonb_build_object('performed_at', now() - interval '70 days', 'impression', 'Increased NT'),
  '[{"fetus_label":"A","crl_mm":62,"nt_mm":3.8,"nasal_bone":"absent","dv_a_wave":"reversed","tricuspid_regurgitation":true,
     "papp_a_mom":0.35,"free_bhcg_mom":2.4,"risk_t21":45,"risk_t18":2100,"risk_t13":5000,"risk_method":"combined","risk_software":"FMF"}]')$q$,
  'consultant records a first-trimester combined screen');
select tst.eq((select ga_days from public.fm_first_trimester where fetal_assessment_id = (select id from fm where k = 'nt')), 84,
  'GA at the scan derived from pregnancy dating');
select tst.ok((select recorded_by = '00000000-0000-0000-0000-0000000000a3' and risk_t21 = 45 from public.fm_first_trimester
  where fetal_assessment_id = (select id from fm where k = 'nt')), 'author stamped, software risk stored');
select tst.ok((select assessment_type = 'nt_scan' and fetus_number = 1 from public.fetal_assessments where id = (select id from fm where k = 'nt')),
  'shared scan header created with the scan type');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'nt_scan', '{}',
  '[{"fetus_label":"A","nt_mm":1.8,"risk_t21":800}]')$q$, 'a risk needs its calculation method');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'nt_scan', '{}',
  '[{"fetus_label":"B","nt_mm":1.8}]')$q$, 'fetus B does not exist in a singleton pregnancy');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'nt_scan', '{}',
  '[{"fetus_label":"A"},{"fetus_label":"B"}]')$q$, 'more fetus records than the plurality rejected');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'nt_scan',
  jsonb_build_object('performed_at', now() + interval '2 days'), '[{"fetus_label":"A","nt_mm":1.8}]')$q$, 'future scan rejected');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'growth_scan', '{}', '[{"fetus_label":"A"}]')$q$,
  'unknown fetal medicine scan type rejected');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'nt_scan', '{}', '[{"fetus_label":"A","nt_mm":45}]')$q$,
  'implausible NT rejected');

-- ---------------------------------------------------------------------------
-- Anomaly scan
-- ---------------------------------------------------------------------------
select tst.lives($q$insert into fm select 'anom', public.record_fm_scan((select id from fm where k = 'preg'), 'anomaly_scan',
  jsonb_build_object('performed_at', now() - interval '14 days'),
  '[{"fetus_label":"A","atrium_mm":11.2,"cervical_length_mm":22,"placenta_location":"posterior","placenta_os_mm":12,"cord_vessels":2,
     "soft_markers":["single_umbilical_artery","mild_ventriculomegaly"],"not_visualised":["lvot"],"conclusion":"incomplete"}]')$q$,
  'anomaly scan with soft markers and an incomplete view');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'anomaly_scan', '{}',
  '[{"fetus_label":"A","not_visualised":["rvot"],"conclusion":"normal"}]')$q$, 'a normal conclusion requires a complete, marker-free survey');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'anomaly_scan', '{}',
  '[{"fetus_label":"A","abnormal_structures":["kidneys"],"not_visualised":["kidneys"],"conclusion":"anomaly_suspected"}]')$q$,
  'a structure cannot be both abnormal and not visualised');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'anomaly_scan', '{}',
  '[{"fetus_label":"A","conclusion":"anomaly_suspected"}]')$q$, 'a suspected anomaly must name a structure or describe it');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'anomaly_scan', '{}',
  '[{"fetus_label":"A","abnormal_structures":["tail"],"conclusion":"anomaly_suspected"}]')$q$, 'unknown structure rejected');
select tst.throws($q$insert into public.fm_first_trimester (fetal_assessment_id, pregnancy_id, patient_id, clinic_id, nt_mm)
  values ((select id from fm where k = 'anom'), (select id from fm where k = 'preg'), (select id from fm where k = 'pt'),
          '00000000-0000-0000-0000-00000000c11a', 2.0)$q$, 'a first-trimester record cannot hang off an anomaly scan');

-- ---------------------------------------------------------------------------
-- Doppler
-- ---------------------------------------------------------------------------
select tst.lives($q$insert into fm select 'dop', public.record_fm_scan((select id from fm where k = 'preg'), 'doppler', '{}',
  '[{"fetus_label":"A","ua_pi":1.6,"ua_edf":"present","mca_pi":1.2,"mca_psv_cm_s":40,"uta_left_pi":1.8,"uta_right_pi":1.4,"dv_a_wave":"positive"}]')$q$,
  'Doppler recorded');
select tst.ok((select cpr = 0.75 and uta_mean_pi = 1.60 and mca_psv_mom = 1.44 and ga_days = 154
  from public.fm_dopplers where fetal_assessment_id = (select id from fm where k = 'dop')),
  'CPR, mean UtA PI and MCA PSV MoM (Mari) computed by the database');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'doppler', '{}', '[{"fetus_label":"A"}]')$q$,
  'an empty Doppler record rejected');
select tst.throws($q$update public.fm_dopplers set fetus_label = 'B' where fetal_assessment_id = (select id from fm where k = 'dop')$q$,
  'record links are immutable');
select tst.lives($q$update public.fm_dopplers set mca_psv_cm_s = 50 where fetal_assessment_id = (select id from fm where k = 'dop')$q$,
  'Doppler correction allowed');
select tst.ok((select mca_psv_mom = 1.80 from public.fm_dopplers where fetal_assessment_id = (select id from fm where k = 'dop')),
  'MCA PSV MoM recomputed on update');

select tst.lives($q$select public.record_fm_scan((select id from fm where k = 'preg_f2'), 'doppler', '{}',
  '[{"fetus_label":"A","mvp_cm":1.5,"bladder_visible":false,"ua_pi":1.0,"mca_pi":0.9,"cpr_centile":20},
    {"fetus_label":"B","mvp_cm":9.0,"bladder_visible":true,"ua_pi":1.0,"mca_pi":1.6}]')$q$, 'MCDA twin Doppler recorded for both fetuses');
select tst.ok((select last_mvp_min = 1.5 and last_mvp_max = 9.0 and last_bladder_absent and not last_cpr_low
  from public.fm_worklist where pregnancy_id = (select id from fm where k = 'preg_f2')),
  'worklist exposes TTTS inputs; a CPR centile overrides the CPR < 1 fallback');

-- ---------------------------------------------------------------------------
-- cfDNA
-- ---------------------------------------------------------------------------
select tst.lives($q$with c as (insert into public.fm_cfdna (patient_id, pregnancy_id, clinic_id, sampled_on, laboratory)
  values ((select id from fm where k = 'pt'), (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11a', current_date - 60, 'Lab X')
  returning id) insert into fm select 'cf', id from c$q$, 'cfDNA sample recorded as pending');
select tst.eq((select ga_days from public.fm_cfdna where id = (select id from fm where k = 'cf')), 94, 'GA at sampling derived');
select tst.throws($q$update public.fm_cfdna set t21 = 'low_risk' where id = (select id from fm where k = 'cf')$q$,
  'a pending cfDNA cannot carry results');
select tst.throws($q$update public.fm_cfdna set result_status = 'resulted', t21 = 'high_risk' where id = (select id from fm where k = 'cf')$q$,
  'a resulted cfDNA needs a result date');
select tst.throws($q$update public.fm_cfdna set result_status = 'resulted', t21 = 'high_risk', resulted_on = current_date - 61
  where id = (select id from fm where k = 'cf')$q$, 'result cannot precede sampling');
select tst.lives($q$update public.fm_cfdna set result_status = 'resulted', t21 = 'high_risk', t18 = 'low_risk', t13 = 'low_risk',
  fetal_fraction_pct = 9.5, resulted_on = current_date - 52 where id = (select id from fm where k = 'cf')$q$, 'cfDNA result recorded');

-- ---------------------------------------------------------------------------
-- Invasive procedures
-- ---------------------------------------------------------------------------
select tst.lives($q$with c as (insert into public.fm_procedures (patient_id, pregnancy_id, clinic_id, procedure_type, performed_on, indication,
  approach, needle_gauge, needle_passes, transplacental, anti_d_given, complications, tests)
  values ((select id from fm where k = 'pt'), (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11a', 'amniocentesis',
          current_date - 45, 'cfdna_high_risk', 'transabdominal', 22, 1, false, true, '{none}', '{qf_pcr,microarray}') returning id)
  insert into fm select 'amnio', id from c$q$, 'amniocentesis recorded');
select tst.ok((select operator_id = '00000000-0000-0000-0000-0000000000a3' and created_by = operator_id and ga_days = 109
  from public.fm_procedures where id = (select id from fm where k = 'amnio')), 'operator, author and GA stamped');
select tst.throws($q$insert into public.fm_procedures (patient_id, pregnancy_id, clinic_id, procedure_type, indication)
  values ((select id from fm where k = 'pt'), (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11a', 'amniocentesis', 'screen_positive')$q$,
  'a diagnostic sampling procedure must order at least one test');
select tst.throws($q$insert into public.fm_procedures (patient_id, pregnancy_id, clinic_id, procedure_type, indication, approach, tests)
  values ((select id from fm where k = 'pt'), (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11a', 'amniocentesis', 'screen_positive',
          'transcervical', '{qf_pcr}')$q$, 'transcervical approach only for CVS');
select tst.throws($q$insert into public.fm_procedures (patient_id, pregnancy_id, clinic_id, procedure_type, indication, tests, pre_hb_g_dl)
  values ((select id from fm where k = 'pt'), (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11a', 'amniocentesis', 'screen_positive',
          '{qf_pcr}', 9.1)$q$, 'fetal haemoglobin only for transfusion/cordocentesis');
select tst.throws($q$insert into public.fm_procedures (patient_id, pregnancy_id, clinic_id, procedure_type, indication, complications)
  values ((select id from fm where k = 'pt'), (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11a', 'amnioreduction', 'polyhydramnios',
          '{none,bleeding}')$q$, '"none" cannot be combined with complications');
select tst.throws($q$update public.fm_procedures set result_status = 'abnormal', resulted_on = current_date - 40 where id = (select id from fm where k = 'amnio')$q$,
  'an abnormal result needs a summary');
select tst.throws($q$update public.fm_procedures set resulted_on = current_date - 40 where id = (select id from fm where k = 'amnio')$q$,
  'a pending result cannot carry a result date');
select tst.lives($q$update public.fm_procedures set result_status = 'abnormal', result_summary = 'QF-PCR: trisomy 21 (47,XX,+21)',
  resulted_on = current_date - 42 where id = (select id from fm where k = 'amnio')$q$, 'abnormal result recorded');
select tst.throws($q$insert into public.fm_procedures (patient_id, pregnancy_id, clinic_id, procedure_type, indication)
  values ('00000000-0000-0000-0000-0000000000f1', (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11a', 'amnioreduction', 'polyhydramnios')$q$,
  'procedure must belong to a pregnancy of the same patient');
reset role;
select tst.ok((select 'fetal_medicine' = any (specialties) from public.patients where id = (select id from fm where k = 'pt')),
  'patient tagged with fetal medicine');
select tst.ok((select count(*) >= 3 from public.audit_log where table_name in ('fm_dopplers', 'fm_cfdna', 'fm_procedures')
  and patient_id = (select id from fm where k = 'pt')), 'fetal medicine changes are audited');

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg_f2'), 'doppler', '{}', '[{"fetus_label":"A","ua_pi":1.0}]')$q$,
  'nurse cannot record on another consultant''s private patient');
select tst.ok((select pending_procedures = 0 and cfdna_t21 = 'high_risk' and anomaly_conclusion = 'incomplete' and last_risk_t21 = 45
  from public.fm_worklist where pregnancy_id = (select id from fm where k = 'preg')), 'worklist summarises screening, cfDNA, anomaly and procedures');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n($q$select 1 from public.fm_dopplers d join public.patients p on p.id = d.patient_id where p.clinic_id = '00000000-0000-0000-0000-00000000c11a'$q$), 0,
  'other clinic cannot read clinic A fetal medicine records');
select tst.eq(tst.n($q$select 1 from public.fm_worklist where clinic_id = '00000000-0000-0000-0000-00000000c11a'$q$), 0,
  'other clinic sees no clinic A worklist rows');
select tst.throws($q$insert into public.fm_cfdna (patient_id, pregnancy_id, clinic_id)
  values ((select id from fm where k = 'pt'), (select id from fm where k = 'preg'), '00000000-0000-0000-0000-00000000c11b')$q$,
  'other clinic cannot add cfDNA for clinic A patient');
select tst.lives($q$select public.record_fm_scan((select id from fm where k = 'preg_b'), 'nt_scan', '{}', '[{"fetus_label":"A","crl_mm":55,"nt_mm":1.7}]')$q$,
  'clinic B consultant records a scan for her own patient');
reset role;

update public.clinic_memberships set is_active = true where user_id = '00000000-0000-0000-0000-0000000000a8';
select tst.as('00000000-0000-0000-0000-0000000000a8'); set role authenticated;
select tst.ok(tst.n($q$select 1 from public.fm_procedures where pregnancy_id = (select id from fm where k = 'preg')$q$) = 1,
  'read-only user can read procedures');
select tst.throws($q$select public.record_fm_scan((select id from fm where k = 'preg'), 'doppler', '{}', '[{"fetus_label":"A","ua_pi":1.0}]')$q$,
  'read-only user cannot record scans');
select tst.lives($q$update public.fm_procedures set result_summary = 'tampered' where id = (select id from fm where k = 'amnio')$q$,
  'read-only update is filtered by RLS');
reset role;

select tst.ok((select result_summary <> 'tampered' from public.fm_procedures where id = (select id from fm where k = 'amnio')),
  'read-only user cannot edit procedure results');
update public.clinic_memberships set is_active = false where user_id = '00000000-0000-0000-0000-0000000000a8';

set role anon;
select tst.throws($q$select count(*) from public.fm_first_trimester$q$, 'anonymous cannot read fetal medicine tables');
reset role;

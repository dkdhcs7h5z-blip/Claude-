-- =============================================================================
-- Gynecology extended tests: labs, MRS, ICIQ-UI SF, ovarian-mass risk fields
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.lives($q$insert into public.lab_results (patient_id, clinic_id, collected_at, test_code, value, unit, ref_low, ref_high, cycle_day)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date - 2, 'fsh', 7.2, 'IU/L', 3.5, 12.5, 3)$q$,
  'nurse records a lab result with its reference range');
select tst.throws($q$insert into public.lab_results (patient_id, clinic_id, collected_at, test_code, value, unit)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date, 'cholesterol', 5, 'mmol/L')$q$,
  'unknown lab test rejected');
select tst.throws($q$insert into public.lab_results (patient_id, clinic_id, collected_at, test_code, value, unit, ref_low, ref_high)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date, 'tsh', 2, 'mIU/L', 4, 0.4)$q$,
  'reference range must be ordered');
select tst.throws($q$insert into public.lab_results (patient_id, clinic_id, collected_at, test_code, value, unit)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date + 3, 'tsh', 2, 'mIU/L')$q$,
  'future collection date rejected');
select tst.ok((select recorded_by = '00000000-0000-0000-0000-0000000000a5' from public.lab_results limit 1), 'lab author stamped');

select tst.lives($q$insert into public.menopause_assessments (patient_id, clinic_id, items)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', '{4,1,3,2,2,1,3,2,1,3,2}')$q$,
  'menopause rating scale recorded');
select tst.ok((select total = 24 and somatic = 10 and psychological = 8 and urogenital = 6 from public.menopause_assessments limit 1),
  'MRS total and subscales computed by the database');
select tst.throws($q$insert into public.menopause_assessments (patient_id, clinic_id, items)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', '{4,1,3}')$q$, 'MRS needs all 11 items');
select tst.throws($q$insert into public.menopause_assessments (patient_id, clinic_id, items)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', '{5,1,3,2,2,1,3,2,1,3,2}')$q$, 'MRS item above 4 rejected');

select tst.lives($q$insert into public.urogyn_assessments (patient_id, clinic_id, frequency, amount, interference, leak_situations)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 3, 4, 7, '{cough_sneeze,physical_activity}')$q$,
  'ICIQ-UI SF recorded');
select tst.eq((select score from public.urogyn_assessments limit 1), 14, 'ICIQ score computed by the database');
select tst.throws($q$insert into public.urogyn_assessments (patient_id, clinic_id, frequency, amount, interference)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 3, 3, 7)$q$, 'ICIQ amount must be 0, 2, 4 or 6');

select tst.lives($q$insert into public.gyn_ultrasounds (patient_id, clinic_id, adnexal_mass, mass_side, orads_category, rmi_features)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', true, 'left', 4, '{multilocular,solid_areas}')$q$,
  'O-RADS category and RMI features recorded');
select tst.throws($q$insert into public.gyn_ultrasounds (patient_id, clinic_id, orads_category)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 3)$q$, 'O-RADS requires an adnexal mass');
select tst.throws($q$insert into public.gyn_ultrasounds (patient_id, clinic_id, adnexal_mass, orads_category)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', true, 6)$q$, 'O-RADS above 5 rejected');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.lab_results') + tst.n('select * from public.menopause_assessments')
  + tst.n('select * from public.urogyn_assessments'), 0, 'other clinic cannot see labs or questionnaires');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.eq(tst.n('select * from public.lab_results'), 0, 'clinic admin cannot see lab results');
reset role;
select tst.ok((select count(distinct table_name) = 3 from public.audit_log
               where table_name in ('lab_results', 'menopause_assessments', 'urogyn_assessments')), 'new tables are audited');

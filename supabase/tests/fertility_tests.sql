-- =============================================================================
-- Infertility & reproductive medicine tests (reuses rls_tests users/patients)
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

create temp table fx (k text primary key, id uuid);
grant select, insert on fx to authenticated;

-- a cycle + embryo for clinic-B patient f3 (to test cross-patient transfer)
with c as (insert into public.fertility_cycles (patient_id, clinic_id, cycle_type, start_date)
  values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000c11b', 'icsi', current_date - 20) returning id)
insert into fx select 'cycle_f3', id from c;
with e as (insert into public.embryos (cycle_id, patient_id, clinic_id, embryo_no, stage)
  values ((select id from fx where k = 'cycle_f3'), '00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000c11b', 1, 'cleavage') returning id)
insert into fx select 'emb_f3', id from e;

-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.lives($q$insert into public.fertility_profiles (patient_id, clinic_id, infertility_type, duration_months, female_factors, male_factor,
  tubal_assessment, tubal_method, partner_name)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 'secondary', 30, '{ovulatory}', true,
          'bilateral_patent', 'hsg', 'Partner A')$q$, 'nurse records the couple work-up');
select tst.throws($q$update public.fertility_profiles set tubal_assessment = null where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$,
  'tubal method requires a result (NULL-safe)');
select tst.lives($q$insert into public.semen_analyses (patient_id, clinic_id, collected_at, abstinence_days, volume_ml, concentration_m_ml,
  progressive_pct, total_motility_pct, normal_forms_pct)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date - 5, 3, 2.5, 12, 20, 35, 3)$q$,
  'semen analysis recorded');
select tst.ok((select total_count_m = 30 and tmsc_m = 6 from public.semen_analyses limit 1), 'total count and TMSC computed by the database');
select tst.throws($q$insert into public.semen_analyses (patient_id, clinic_id, collected_at, progressive_pct, total_motility_pct)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date, 50, 40)$q$,
  'progressive motility cannot exceed total motility');
reset role;
select tst.ok((select 'infertility' = any (specialties) from public.patients where id = '00000000-0000-0000-0000-0000000000f1'),
  'work-up tags the patient with infertility');

-- ---------------------------------------------------------------------------
-- Cycles, monitoring, embryology
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.lives($q$with c as (insert into public.fertility_cycles (patient_id, clinic_id, cycle_type, start_date, stim_protocol, starting_dose_iu, insemination)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 'icsi', current_date - 14, 'antagonist', 225, 'icsi') returning id)
  insert into fx select 'cycle', id from c$q$, 'resident starts an ICSI cycle');
select tst.eq((select cycle_number from public.fertility_cycles where id = (select id from fx where k = 'cycle')), 1, 'cycle number assigned');
select tst.ok((select created_by = '00000000-0000-0000-0000-0000000000a4' from public.fertility_cycles where id = (select id from fx where k = 'cycle')),
  'cycle author stamped');
select tst.throws($q$update public.fertility_cycles set oocytes_retrieved = 8, mii_oocytes = 10 where id = (select id from fx where k = 'cycle')$q$,
  'MII cannot exceed oocytes retrieved');
select tst.throws($q$update public.fertility_cycles set freeze_all_reason = 'ohss_risk' where id = (select id from fx where k = 'cycle')$q$,
  'freeze-all reason requires freeze-all');
select tst.lives($q$update public.fertility_cycles set retrieval_at = current_date - 3, oocytes_retrieved = 12, mii_oocytes = 10, fertilized_2pn = 8,
  status = 'retrieval' where id = (select id from fx where k = 'cycle')$q$, 'retrieval recorded');

select tst.lives($q$insert into public.stimulation_monitoring (cycle_id, patient_id, clinic_id, monitored_on, stim_day, e2_pmol_l, follicles_right, follicles_left)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a',
          current_date - 6, 8, 4200, '{18,17,15,12}', '{17,14,11}')$q$, 'monitoring scan recorded');
select tst.throws($q$insert into public.stimulation_monitoring (cycle_id, patient_id, clinic_id, follicles_right)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', '{55}')$q$,
  'implausible follicle size rejected');
select tst.throws($q$insert into public.stimulation_monitoring (cycle_id, patient_id, clinic_id)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a')$q$,
  'monitoring must match the cycle patient');

select tst.throws($q$insert into public.embryos (cycle_id, patient_id, clinic_id, embryo_no, stage, blast_expansion)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 1, 'cleavage', 4)$q$,
  'blastocyst grades only for blastocysts');
select tst.throws($q$insert into public.embryos (cycle_id, patient_id, clinic_id, embryo_no, stage, status)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 1, 'blastocyst', 'frozen')$q$,
  'frozen embryo needs freeze date and storage location');
select tst.lives($q$with e as (insert into public.embryos (cycle_id, patient_id, clinic_id, embryo_no, day_observed, stage, blast_expansion, icm_grade, te_grade)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 1, 5, 'blastocyst', 4, 'A', 'B') returning id)
  insert into fx select 'emb1', id from e$q$, 'blastocyst graded 4AB');
select tst.lives($q$with e as (insert into public.embryos (cycle_id, patient_id, clinic_id, embryo_no, day_observed, stage, blast_expansion, icm_grade, te_grade,
  status, frozen_at, storage_location, consent_expires_on)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 2, 5, 'blastocyst', 3, 'B', 'B',
          'frozen', current_date - 1, 'Tank 2 / Canister 4 / Straw 17', current_date + 3650) returning id)
  insert into fx select 'emb2', id from e$q$, 'blastocyst vitrified with storage location');
select tst.throws($q$insert into public.embryos (cycle_id, patient_id, clinic_id, embryo_no)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 1)$q$,
  'embryo numbers are unique within a cycle');

-- ---------------------------------------------------------------------------
-- Transfer
-- ---------------------------------------------------------------------------
select tst.throws($q$insert into public.embryo_transfers (cycle_id, patient_id, clinic_id, transfer_on, fresh, embryo_ids, embryos_transferred, embryo_day)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a',
          current_date - 1, true, array[(select id from fx where k = 'emb_f3')], 1, 5)$q$, 'cannot transfer another patient''s embryo');
select tst.throws($q$insert into public.embryo_transfers (cycle_id, patient_id, clinic_id, transfer_on, fresh, embryo_ids, embryos_transferred, embryo_day)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a',
          current_date - 1, true, array[(select id from fx where k = 'emb1')], 2, 5)$q$, 'embryo count must match the selected embryos');
select tst.lives($q$with t as (insert into public.embryo_transfers (cycle_id, patient_id, clinic_id, transfer_on, fresh, embryo_ids, embryos_transferred, embryo_day, endometrium_mm)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a',
          current_date - 1, true, array[(select id from fx where k = 'emb1')], 1, 5, 9.5) returning id)
  insert into fx select 'et1', id from t$q$, 'fresh single blastocyst transfer');
select tst.ok((select status = 'transferred' from public.embryos where id = (select id from fx where k = 'emb1')), 'transferred embryo status updated');
select tst.throws($q$insert into public.embryo_transfers (cycle_id, patient_id, clinic_id, transfer_on, fresh, embryo_ids, embryos_transferred, embryo_day)
  values ((select id from fx where k = 'cycle'), '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a',
          current_date, true, array[(select id from fx where k = 'emb1')], 1, 5)$q$, 'an embryo cannot be transferred twice');
select tst.throws($q$update public.embryo_transfers set outcome = 'clinical' where id = (select id from fx where k = 'et1')$q$,
  'clinical pregnancy requires a gestational sac');
select tst.throws($q$update public.embryo_transfers set gestational_sacs = 1, fetal_hearts = 2 where id = (select id from fx where k = 'et1')$q$,
  'fetal hearts cannot exceed sacs');
select tst.throws($q$update public.embryo_transfers set beta_hcg_on = current_date - 1 where id = (select id from fx where k = 'et1')$q$,
  'β-hCG date must follow the transfer');
select tst.throws($q$update public.embryo_transfers set embryo_ids = '{}' where id = (select id from fx where k = 'et1')$q$,
  'transferred embryos are immutable');
reset role;

-- ---------------------------------------------------------------------------
-- Views & access
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.ok((select count(*) = 1 from public.fertility_worklist where patient_id = '00000000-0000-0000-0000-0000000000f1'
               and last_stim_day = 8 and last_transfer_outcome = 'pending'), 'worklist shows the active cycle with monitoring and pending transfer');
select tst.eq(tst.n($q$select * from public.cryo_inventory where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$), 1, 'cryostorage inventory lists the frozen embryo');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n($q$select * from public.embryos where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$)
  + tst.n($q$select * from public.cryo_inventory where patient_id = '00000000-0000-0000-0000-0000000000f1'$q$)
  + tst.n($q$select * from public.semen_analyses$q$), 0, 'other clinic cannot see embryology, cryostorage or semen analyses');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.eq(tst.n('select * from public.embryos') + tst.n('select * from public.fertility_worklist'), 0, 'clinic admin cannot see fertility records');
reset role;
select tst.ok((select count(distinct table_name) = 6 from public.audit_log where table_name in
  ('fertility_profiles', 'semen_analyses', 'fertility_cycles', 'stimulation_monitoring', 'embryos', 'embryo_transfers')), 'fertility tables are audited');

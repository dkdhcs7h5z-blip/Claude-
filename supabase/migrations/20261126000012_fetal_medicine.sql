-- =============================================================================
-- 0012  Fetal medicine
--   Scans reuse the shared scan header public.fetal_assessments (also used by
--   obstetric growth scans) with typed per-fetus child records:
--     fm_first_trimester   11–14 week scan + combined screening (nt_scan)
--     fm_anomaly_scans     ISUOG mid-trimester structural survey (anomaly_scan)
--     fm_dopplers          Doppler & fetal surveillance (doppler)
--   Plus per-pregnancy records:
--     fm_cfdna             cell-free DNA screening
--     fm_procedures        invasive diagnosis and fetal therapy, with results
--   RPC  record_fm_scan    header + per-fetus records atomically
--   View fm_worklist       (SECURITY INVOKER)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 11–14 weeks: CRL, NT, additional markers, biochemistry, software risks.
-- Risks are stored as entered from the clinic's validated software (e.g. FMF
-- algorithm); the application does not recompute them.
-- ---------------------------------------------------------------------------
create table public.fm_first_trimester (
  id                      uuid primary key default gen_random_uuid(),
  fetal_assessment_id     uuid not null references public.fetal_assessments (id) on delete cascade,
  pregnancy_id            uuid not null references public.pregnancies (id),
  patient_id              uuid not null references public.patients (id),
  clinic_id               uuid not null references public.clinics (id),
  fetus_label             text not null default 'A' check (fetus_label in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  ga_days                 smallint,
  crl_mm                  numeric(4, 1) check (crl_mm between 20 and 100),
  nt_mm                   numeric(3, 1) check (nt_mm between 0.3 and 20),
  nasal_bone              text check (nasal_bone in ('present', 'absent', 'hypoplastic', 'not_assessed')),
  dv_a_wave               text check (dv_a_wave in ('positive', 'absent', 'reversed', 'not_assessed')),
  tricuspid_regurgitation boolean,
  fhr                     smallint check (fhr between 60 and 240),
  papp_a_mom              numeric(5, 3) check (papp_a_mom between 0.01 and 20),
  free_bhcg_mom           numeric(5, 3) check (free_bhcg_mom between 0.01 and 30),
  risk_t21                integer check (risk_t21 between 2 and 1000000),
  risk_t18                integer check (risk_t18 between 2 and 1000000),
  risk_t13                integer check (risk_t13 between 2 and 1000000),
  risk_method             text check (risk_method in ('combined', 'nt_maternal_age', 'combined_extended', 'second_trimester', 'other')),
  risk_software           text,
  early_anatomy           text,
  notes                   text,
  recorded_by             uuid references public.profiles (id) default auth.uid(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (fetal_assessment_id, fetus_label),
  constraint ft_risk_method check ((risk_t21 is null and risk_t18 is null and risk_t13 is null) or risk_method is not null)
);

-- ---------------------------------------------------------------------------
-- Mid-trimester anomaly scan. Structures not listed as abnormal or not
-- visualised were seen and normal.
-- ---------------------------------------------------------------------------
create table public.fm_anomaly_scans (
  id                   uuid primary key default gen_random_uuid(),
  fetal_assessment_id  uuid not null references public.fetal_assessments (id) on delete cascade,
  pregnancy_id         uuid not null references public.pregnancies (id),
  patient_id           uuid not null references public.patients (id),
  clinic_id            uuid not null references public.clinics (id),
  fetus_label          text not null default 'A' check (fetus_label in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  ga_days              smallint,
  abnormal_structures  text[] not null default '{}',
  not_visualised       text[] not null default '{}',
  atrium_mm            numeric(4, 1) check (atrium_mm between 0 and 50),
  tcd_mm               numeric(4, 1) check (tcd_mm between 5 and 70),
  cisterna_magna_mm    numeric(4, 1) check (cisterna_magna_mm between 0 and 40),
  nuchal_fold_mm       numeric(4, 1) check (nuchal_fold_mm between 0 and 20),
  renal_pelvis_mm      numeric(4, 1) check (renal_pelvis_mm between 0 and 60),
  cervical_length_mm   numeric(4, 1) check (cervical_length_mm between 0 and 80),
  placenta_location    text check (placenta_location in ('anterior', 'posterior', 'fundal', 'lateral', 'low_lying', 'previa')),
  placenta_os_mm       numeric(4, 1) check (placenta_os_mm between -60 and 150),
  cord_vessels         smallint check (cord_vessels in (2, 3)),
  amniotic_fluid       text check (amniotic_fluid in ('normal', 'oligohydramnios', 'polyhydramnios', 'anhydramnios')),
  soft_markers         text[] not null default '{}' check (soft_markers <@ array[
                         'echogenic_intracardiac_focus', 'choroid_plexus_cyst', 'echogenic_bowel', 'mild_pyelectasis',
                         'short_femur', 'short_humerus', 'nasal_bone_hypoplasia', 'thick_nuchal_fold',
                         'mild_ventriculomegaly', 'single_umbilical_artery', 'aberrant_right_subclavian']),
  fetal_sex            text check (fetal_sex in ('female', 'male', 'undetermined', 'not_disclosed')),
  anomalies            text,
  conclusion           text not null default 'normal' check (conclusion in ('normal', 'soft_markers', 'anomaly_suspected', 'incomplete')),
  notes                text,
  recorded_by          uuid references public.profiles (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (fetal_assessment_id, fetus_label),
  constraint anomaly_structures_valid check (
    abnormal_structures <@ array[
      'skull', 'midline_falx', 'cavum_septi_pellucidi', 'lateral_ventricles', 'cerebellum', 'cisterna_magna',
      'orbits', 'lips', 'profile', 'neck', 'lungs', 'diaphragm', 'heart_situs', 'four_chamber', 'lvot', 'rvot',
      'three_vessel_trachea', 'stomach', 'bowel', 'abdominal_wall', 'cord_insertion', 'kidneys', 'bladder',
      'spine', 'arms', 'hands', 'legs', 'feet', 'genitalia']
    and not_visualised <@ array[
      'skull', 'midline_falx', 'cavum_septi_pellucidi', 'lateral_ventricles', 'cerebellum', 'cisterna_magna',
      'orbits', 'lips', 'profile', 'neck', 'lungs', 'diaphragm', 'heart_situs', 'four_chamber', 'lvot', 'rvot',
      'three_vessel_trachea', 'stomach', 'bowel', 'abdominal_wall', 'cord_insertion', 'kidneys', 'bladder',
      'spine', 'arms', 'hands', 'legs', 'feet', 'genitalia']),
  constraint anomaly_disjoint check (not (abnormal_structures && not_visualised)),
  constraint anomaly_normal_conclusion check (
    conclusion <> 'normal' or (cardinality(abnormal_structures) = 0 and cardinality(not_visualised) = 0 and cardinality(soft_markers) = 0)),
  constraint anomaly_suspected_detail check (
    conclusion <> 'anomaly_suspected' or cardinality(abnormal_structures) > 0 or coalesce(length(trim(anomalies)), 0) > 0),
  constraint anomaly_placenta_os check (placenta_os_mm is null or placenta_location is not null)
);

-- ---------------------------------------------------------------------------
-- Doppler and fetal surveillance. Centiles are entered from the reporting
-- machine/reference chart; CPR and mean UtA PI are generated; MCA PSV MoM is
-- computed against Mari et al. 2000 medians.
-- ---------------------------------------------------------------------------
create table public.fm_dopplers (
  id                   uuid primary key default gen_random_uuid(),
  fetal_assessment_id  uuid not null references public.fetal_assessments (id) on delete cascade,
  pregnancy_id         uuid not null references public.pregnancies (id),
  patient_id           uuid not null references public.patients (id),
  clinic_id            uuid not null references public.clinics (id),
  fetus_label          text not null default 'A' check (fetus_label in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  ga_days              smallint,
  ua_pi                numeric(4, 2) check (ua_pi between 0.1 and 5),
  ua_pi_centile        numeric(4, 1) check (ua_pi_centile between 0 and 100),
  ua_edf               text check (ua_edf in ('present', 'absent', 'reversed')),
  mca_pi               numeric(4, 2) check (mca_pi between 0.1 and 5),
  mca_pi_centile       numeric(4, 1) check (mca_pi_centile between 0 and 100),
  mca_psv_cm_s         numeric(5, 1) check (mca_psv_cm_s between 5 and 150),
  mca_psv_mom          numeric(4, 2),
  cpr                  numeric(4, 2) generated always as (round(mca_pi / nullif(ua_pi, 0), 2)) stored,
  cpr_centile          numeric(4, 1) check (cpr_centile between 0 and 100),
  uta_left_pi          numeric(4, 2) check (uta_left_pi between 0.1 and 5),
  uta_right_pi         numeric(4, 2) check (uta_right_pi between 0.1 and 5),
  uta_mean_pi          numeric(4, 2) generated always as (round((uta_left_pi + uta_right_pi) / 2, 2)) stored,
  uta_pi_centile       numeric(4, 1) check (uta_pi_centile between 0 and 100),
  uta_notching         boolean,
  dv_pi                numeric(4, 2) check (dv_pi between 0.05 and 5),
  dv_pi_centile        numeric(4, 1) check (dv_pi_centile between 0 and 100),
  dv_a_wave            text check (dv_a_wave in ('positive', 'absent', 'reversed')),
  uv_pulsation         boolean,
  mvp_cm               numeric(4, 1) check (mvp_cm between 0 and 25),
  bladder_visible      boolean,
  hydrops              boolean not null default false,
  fetal_demise         boolean not null default false,
  ctg                  text check (ctg in ('normal', 'suspicious', 'pathological', 'not_done')),
  notes                text,
  recorded_by          uuid references public.profiles (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (fetal_assessment_id, fetus_label),
  constraint doppler_has_data check (
    num_nonnulls(ua_pi, ua_edf, mca_pi, mca_psv_cm_s, uta_left_pi, uta_right_pi, dv_pi, dv_a_wave, mvp_cm, bladder_visible, ctg) > 0
    or hydrops or fetal_demise)
);

-- ---------------------------------------------------------------------------
-- Cell-free DNA screening
-- ---------------------------------------------------------------------------
create table public.fm_cfdna (
  id                  uuid primary key default gen_random_uuid(),
  patient_id          uuid not null references public.patients (id),
  pregnancy_id        uuid not null references public.pregnancies (id),
  clinic_id           uuid not null references public.clinics (id),
  sampled_on          date not null default current_date,
  ga_days             smallint,
  laboratory          text,
  result_status       text not null default 'pending' check (result_status in ('pending', 'resulted', 'failed')),
  fetal_fraction_pct  numeric(4, 1) check (fetal_fraction_pct between 0 and 60),
  t21                 text check (t21 in ('low_risk', 'high_risk', 'no_call', 'not_tested')),
  t18                 text check (t18 in ('low_risk', 'high_risk', 'no_call', 'not_tested')),
  t13                 text check (t13 in ('low_risk', 'high_risk', 'no_call', 'not_tested')),
  sex_chromosomes     text check (sex_chromosomes in ('low_risk', 'high_risk', 'no_call', 'not_tested')),
  fetal_sex           text check (fetal_sex in ('female', 'male', 'not_reported')),
  resulted_on         date,
  notes               text,
  recorded_by         uuid references public.profiles (id) default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint cfdna_not_future check (sampled_on <= current_date and (resulted_on is null or resulted_on <= current_date)),
  constraint cfdna_result_after_sample check (resulted_on is null or resulted_on >= sampled_on),
  constraint cfdna_pending check (result_status <> 'pending' or (t21 is null and t18 is null and t13 is null and sex_chromosomes is null and resulted_on is null)),
  constraint cfdna_resulted check (result_status <> 'resulted' or (t21 is not null and resulted_on is not null)),
  constraint cfdna_failed check (result_status <> 'failed' or resulted_on is not null)
);

-- ---------------------------------------------------------------------------
-- Invasive procedures and fetal therapy
-- ---------------------------------------------------------------------------
create table public.fm_procedures (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id),
  pregnancy_id     uuid not null references public.pregnancies (id),
  clinic_id        uuid not null references public.clinics (id),
  procedure_type   text not null check (procedure_type in (
                     'cvs', 'amniocentesis', 'cordocentesis', 'intrauterine_transfusion', 'amnioreduction', 'amnioinfusion',
                     'laser_ablation', 'shunt', 'feto', 'selective_reduction', 'other')),
  performed_on     date not null default current_date,
  ga_days          smallint,
  fetus_label      text not null default 'A' check (fetus_label in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  indication       text not null check (indication in (
                     'screen_positive', 'cfdna_high_risk', 'structural_anomaly', 'previous_aneuploidy', 'parental_rearrangement',
                     'monogenic', 'infection', 'fetal_anaemia', 'ttts', 'polyhydramnios', 'other')),
  approach         text check (approach in ('transabdominal', 'transcervical')),
  needle_gauge     smallint check (needle_gauge between 12 and 27),
  needle_passes    smallint check (needle_passes between 1 and 6),
  transplacental   boolean,
  anti_d_given     boolean,
  volume_ml        numeric(6, 1) check (volume_ml between 0 and 5000),
  pre_hb_g_dl      numeric(4, 1) check (pre_hb_g_dl between 1 and 20),
  post_hb_g_dl     numeric(4, 1) check (post_hb_g_dl between 1 and 20),
  complications    text[] not null default '{}' check (complications <@ array[
                     'none', 'bleeding', 'fluid_leak', 'membrane_rupture', 'bradycardia', 'infection', 'failed_sampling',
                     'miscarriage', 'preterm_labour', 'fetal_death']),
  tests            text[] not null default '{}' check (tests <@ array[
                     'qf_pcr', 'karyotype', 'microarray', 'exome', 'single_gene', 'infection_pcr', 'fetal_blood_count']),
  result_status    text not null default 'pending' check (result_status in ('pending', 'normal', 'abnormal', 'failed', 'not_applicable')),
  result_summary   text,
  resulted_on      date,
  operator_id      uuid references public.profiles (id) default auth.uid(),
  notes            text,
  created_by       uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint proc_not_future check (performed_on <= current_date and (resulted_on is null or resulted_on <= current_date)),
  constraint proc_result_after check (resulted_on is null or resulted_on >= performed_on),
  constraint proc_result_date check (result_status in ('pending', 'not_applicable') or resulted_on is not null),
  constraint proc_pending_no_date check (result_status <> 'pending' or resulted_on is null),
  constraint proc_abnormal_summary check (result_status <> 'abnormal' or coalesce(length(trim(result_summary)), 0) > 0),
  constraint proc_transcervical_cvs check (approach <> 'transcervical' or procedure_type = 'cvs'),
  constraint proc_sampling_tests check (procedure_type not in ('cvs', 'amniocentesis', 'cordocentesis') or cardinality(tests) > 0),
  constraint proc_hb_iut check (procedure_type in ('intrauterine_transfusion', 'cordocentesis') or (pre_hb_g_dl is null and post_hb_g_dl is null)),
  constraint proc_none_exclusive check (not ('none' = any (complications)) or cardinality(complications) = 1)
);

create index fm_first_trimester_preg_idx on public.fm_first_trimester (pregnancy_id);
create index fm_anomaly_scans_preg_idx on public.fm_anomaly_scans (pregnancy_id);
create index fm_dopplers_preg_idx on public.fm_dopplers (pregnancy_id, ga_days);
create index fm_cfdna_preg_idx on public.fm_cfdna (pregnancy_id, sampled_on);
create index fm_procedures_preg_idx on public.fm_procedures (pregnancy_id, performed_on);

-- ---------------------------------------------------------------------------
-- Integrity: per-fetus scan records
-- ---------------------------------------------------------------------------
create or replace function private.fm_scan_child_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fa       public.fetal_assessments;
  v_preg     public.pregnancies;
  v_expected text := case tg_table_name
                       when 'fm_first_trimester' then 'nt_scan'
                       when 'fm_anomaly_scans' then 'anomaly_scan'
                       else 'doppler' end;
  v_ga       smallint;
begin
  select * into v_fa from public.fetal_assessments where id = new.fetal_assessment_id;
  select * into v_preg from public.pregnancies where id = new.pregnancy_id;
  if v_fa.id is null or v_preg.id is null or v_fa.patient_id <> new.patient_id or v_preg.patient_id <> new.patient_id
     or (v_fa.pregnancy_id is not null and v_fa.pregnancy_id <> new.pregnancy_id) then
    raise exception 'Record must match its scan, pregnancy and patient' using errcode = '23514';
  end if;
  if v_fa.assessment_type <> v_expected then
    raise exception 'This record requires a % scan', v_expected using errcode = '23514';
  end if;
  if ascii(new.fetus_label) - 64 > v_preg.plurality then
    raise exception 'Fetus % does not exist in this pregnancy (plurality %)', new.fetus_label, v_preg.plurality using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.fetal_assessment_id <> old.fetal_assessment_id or new.pregnancy_id <> old.pregnancy_id
       or new.patient_id <> old.patient_id or new.fetus_label <> old.fetus_label then
      raise exception 'Record links are immutable' using errcode = '42501';
    end if;
  elsif not private.is_server_context() then
    new := jsonb_populate_record(new, jsonb_build_object('recorded_by', auth.uid()));
  end if;
  v_ga := private.pregnancy_ga_days(new.pregnancy_id, v_fa.performed_at::date);
  new := jsonb_populate_record(new, jsonb_build_object('ga_days', v_ga));
  if tg_table_name = 'fm_dopplers' then
    -- Mari G et al. NEJM 2000: median MCA PSV = exp(2.31 + 0.046 × GA weeks)
    new := jsonb_populate_record(new, jsonb_build_object('mca_psv_mom',
      case when (to_jsonb(new) ->> 'mca_psv_cm_s') is not null and v_ga between 112 and 280
           then round((to_jsonb(new) ->> 'mca_psv_cm_s')::numeric / exp(2.31 + 0.046 * v_ga / 7.0)::numeric, 2) end));
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['fm_first_trimester', 'fm_anomaly_scans', 'fm_dopplers'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.fm_scan_child_rules()', t || '_rules', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integrity: cfDNA and procedures
-- ---------------------------------------------------------------------------
create or replace function private.fm_pregnancy_record_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_preg public.pregnancies;
  v_date date := coalesce((to_jsonb(new) ->> 'performed_on')::date, (to_jsonb(new) ->> 'sampled_on')::date);
begin
  select * into v_preg from public.pregnancies where id = new.pregnancy_id;
  if v_preg.id is null or v_preg.patient_id <> new.patient_id then
    raise exception 'Record must belong to a pregnancy of the same patient' using errcode = '23514';
  end if;
  if tg_table_name = 'fm_procedures' and ascii(to_jsonb(new) ->> 'fetus_label') - 64 > v_preg.plurality then
    raise exception 'Fetus does not exist in this pregnancy' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.pregnancy_id <> old.pregnancy_id or new.patient_id <> old.patient_id then
      raise exception 'Record links are immutable' using errcode = '42501';
    end if;
  elsif not private.is_server_context() then
    if tg_table_name = 'fm_procedures' then
      new := jsonb_populate_record(new, jsonb_build_object('created_by', auth.uid(),
        'operator_id', coalesce(to_jsonb(new) ->> 'operator_id', auth.uid()::text)));
    else
      new := jsonb_populate_record(new, jsonb_build_object('recorded_by', auth.uid()));
    end if;
  end if;
  new := jsonb_populate_record(new, jsonb_build_object('ga_days', private.pregnancy_ga_days(new.pregnancy_id, v_date)));
  return new;
end;
$$;

create trigger fm_cfdna_rules before insert or update on public.fm_cfdna
  for each row execute function private.fm_pregnancy_record_rules();
create trigger fm_procedures_rules before insert or update on public.fm_procedures
  for each row execute function private.fm_pregnancy_record_rules();

-- Tag the patient with fetal medicine when any record is created.
create or replace function private.fm_tag_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.patients
     set specialties = array_append(specialties, 'fetal_medicine'::public.specialty)
   where id = new.patient_id and not ('fetal_medicine' = any (specialties));
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['fm_first_trimester', 'fm_anomaly_scans', 'fm_dopplers', 'fm_cfdna', 'fm_procedures'] loop
    execute format('create trigger %I before update on public.%I for each row execute function private.touch_updated_at()', t || '_touch', t);
    execute format('create trigger %I after insert on public.%I for each row execute function private.fm_tag_patient()', t || '_tag', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()', t || '_audit', t);
    execute format($p$create policy %I on public.%I for select to authenticated using (private.can(patient_id, 'clinical.read'))$p$, t || '_select', t);
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id))$p$, t || '_insert', t);
    execute format($p$create policy %I on public.%I for update to authenticated
      using (private.can(patient_id, 'clinical.write')) with check (private.can(patient_id, 'clinical.write'))$p$, t || '_update', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: scan header + per-fetus records in one transaction
--   p_type     'nt_scan' | 'anomaly_scan' | 'doppler'
--   p_scan     { performed_at?, impression?, clinic_id? }
--   p_fetuses  [ { fetus_label, ...type-specific fields } ]
-- ---------------------------------------------------------------------------
create or replace function public.record_fm_scan(
  p_pregnancy_id  uuid,
  p_type          text,
  p_scan          jsonb,
  p_fetuses       jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_preg   public.pregnancies;
  v_clinic uuid;
  v_at     timestamptz := coalesce((p_scan ->> 'performed_at')::timestamptz, now());
  v_id     uuid;
  v_f      jsonb;
  v_ft     public.fm_first_trimester;
  v_an     public.fm_anomaly_scans;
  v_dp     public.fm_dopplers;
begin
  if p_type not in ('nt_scan', 'anomaly_scan', 'doppler') then
    raise exception 'Unknown fetal medicine scan type %', p_type using errcode = '22023';
  end if;
  select * into v_preg from public.pregnancies where id = p_pregnancy_id;
  if not found then
    raise exception 'Pregnancy not found' using errcode = 'P0002';
  end if;
  if v_at > now() then
    raise exception 'Scan date cannot be in the future' using errcode = '22023';
  end if;
  if jsonb_typeof(p_fetuses) <> 'array' or jsonb_array_length(p_fetuses) = 0
     or jsonb_array_length(p_fetuses) > v_preg.plurality then
    raise exception 'Provide between 1 and % fetus records', v_preg.plurality using errcode = '22023';
  end if;
  v_clinic := coalesce(nullif(p_scan ->> 'clinic_id', '')::uuid, v_preg.clinic_id);

  insert into public.fetal_assessments
    (patient_id, pregnancy_id, clinic_id, assessment_type, performed_at, gestational_age_days, fetus_number, impression, findings)
  values
    (v_preg.patient_id, v_preg.id, v_clinic, p_type, v_at, private.pregnancy_ga_days(v_preg.id, v_at::date),
     jsonb_array_length(p_fetuses), p_scan ->> 'impression', '{}'::jsonb)
  returning id into v_id;

  for v_f in select * from jsonb_array_elements(p_fetuses) loop
    if p_type = 'nt_scan' then
      v_ft := jsonb_populate_record(null::public.fm_first_trimester, v_f);
      insert into public.fm_first_trimester
        (fetal_assessment_id, pregnancy_id, patient_id, clinic_id, fetus_label, crl_mm, nt_mm, nasal_bone, dv_a_wave,
         tricuspid_regurgitation, fhr, papp_a_mom, free_bhcg_mom, risk_t21, risk_t18, risk_t13, risk_method, risk_software,
         early_anatomy, notes)
      values
        (v_id, v_preg.id, v_preg.patient_id, v_clinic, coalesce(v_ft.fetus_label, 'A'), v_ft.crl_mm, v_ft.nt_mm, v_ft.nasal_bone,
         v_ft.dv_a_wave, v_ft.tricuspid_regurgitation, v_ft.fhr, v_ft.papp_a_mom, v_ft.free_bhcg_mom, v_ft.risk_t21, v_ft.risk_t18,
         v_ft.risk_t13, v_ft.risk_method, v_ft.risk_software, v_ft.early_anatomy, v_ft.notes);
    elsif p_type = 'anomaly_scan' then
      v_an := jsonb_populate_record(null::public.fm_anomaly_scans, v_f);
      insert into public.fm_anomaly_scans
        (fetal_assessment_id, pregnancy_id, patient_id, clinic_id, fetus_label, abnormal_structures, not_visualised, atrium_mm,
         tcd_mm, cisterna_magna_mm, nuchal_fold_mm, renal_pelvis_mm, cervical_length_mm, placenta_location, placenta_os_mm,
         cord_vessels, amniotic_fluid, soft_markers, fetal_sex, anomalies, conclusion, notes)
      values
        (v_id, v_preg.id, v_preg.patient_id, v_clinic, coalesce(v_an.fetus_label, 'A'), coalesce(v_an.abnormal_structures, '{}'),
         coalesce(v_an.not_visualised, '{}'), v_an.atrium_mm, v_an.tcd_mm, v_an.cisterna_magna_mm, v_an.nuchal_fold_mm,
         v_an.renal_pelvis_mm, v_an.cervical_length_mm, v_an.placenta_location, v_an.placenta_os_mm, v_an.cord_vessels,
         v_an.amniotic_fluid, coalesce(v_an.soft_markers, '{}'), v_an.fetal_sex, v_an.anomalies, coalesce(v_an.conclusion, 'normal'), v_an.notes);
    else
      v_dp := jsonb_populate_record(null::public.fm_dopplers, v_f);
      insert into public.fm_dopplers
        (fetal_assessment_id, pregnancy_id, patient_id, clinic_id, fetus_label, ua_pi, ua_pi_centile, ua_edf, mca_pi, mca_pi_centile,
         mca_psv_cm_s, cpr_centile, uta_left_pi, uta_right_pi, uta_pi_centile, uta_notching, dv_pi, dv_pi_centile, dv_a_wave,
         uv_pulsation, mvp_cm, bladder_visible, hydrops, fetal_demise, ctg, notes)
      values
        (v_id, v_preg.id, v_preg.patient_id, v_clinic, coalesce(v_dp.fetus_label, 'A'), v_dp.ua_pi, v_dp.ua_pi_centile, v_dp.ua_edf,
         v_dp.mca_pi, v_dp.mca_pi_centile, v_dp.mca_psv_cm_s, v_dp.cpr_centile, v_dp.uta_left_pi, v_dp.uta_right_pi,
         v_dp.uta_pi_centile, v_dp.uta_notching, v_dp.dv_pi, v_dp.dv_pi_centile, v_dp.dv_a_wave, v_dp.uv_pulsation, v_dp.mvp_cm,
         v_dp.bladder_visible, coalesce(v_dp.hydrops, false), coalesce(v_dp.fetal_demise, false), v_dp.ctg, v_dp.notes);
    end if;
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Worklist: active pregnancies with any fetal medicine record or tag
-- ---------------------------------------------------------------------------
create view public.fm_worklist
with (security_invoker = true)
as
select
  g.id as pregnancy_id, g.patient_id, g.clinic_id, g.plurality, g.chorionicity, g.edd, g.lmp, g.cycle_length_days,
  private.pregnancy_ga_days(g.id, current_date) as ga_days,
  p.mrn, p.first_name_en, p.last_name_en, p.first_name_ar, p.last_name_ar, p.date_of_birth, p.rh_factor,
  ft.risk_t21 as last_risk_t21, ft.risk_t18 as last_risk_t18, ft.risk_t13 as last_risk_t13, ft.nt_mm as last_nt_mm,
  cf.result_status as cfdna_status, cf.t21 as cfdna_t21, cf.t18 as cfdna_t18, cf.t13 as cfdna_t13,
  an.conclusion as anomaly_conclusion, an.performed_at as anomaly_at,
  dp.performed_at as last_doppler_at, dp.ua_edf as last_ua_edf, dp.dv_a_wave as last_dv_a_wave,
  dp.mca_psv_mom as last_mca_psv_mom, dp.cpr as last_cpr, dp.hydrops as last_hydrops, dp.cpr_low as last_cpr_low,
  dp.ua_pi_high as last_ua_pi_high, dp.mvp_min as last_mvp_min, dp.mvp_max as last_mvp_max, dp.bladder_absent as last_bladder_absent,
  (select count(*) from public.fm_procedures pr where pr.pregnancy_id = g.id and pr.result_status = 'pending')::int as pending_procedures,
  (select max(fa.performed_at) from public.fetal_assessments fa where fa.pregnancy_id = g.id) as last_scan_at
from public.pregnancies g
join public.patients p on p.id = g.patient_id and p.deleted_at is null
left join lateral (
  select min(x.risk_t21) as risk_t21, min(x.risk_t18) as risk_t18, min(x.risk_t13) as risk_t13, max(x.nt_mm) as nt_mm
  from public.fm_first_trimester x
  where x.fetal_assessment_id = (select f.fetal_assessment_id from public.fm_first_trimester f
                                   join public.fetal_assessments a on a.id = f.fetal_assessment_id
                                  where f.pregnancy_id = g.id order by a.performed_at desc limit 1)
) ft on true
left join lateral (
  select * from public.fm_cfdna c where c.pregnancy_id = g.id order by c.sampled_on desc, c.created_at desc limit 1
) cf on true
left join lateral (
  select a.performed_at,
         (array['normal', 'soft_markers', 'incomplete', 'anomaly_suspected'])[max(array_position(
           array['normal', 'soft_markers', 'incomplete', 'anomaly_suspected'], s.conclusion))] as conclusion
  from public.fm_anomaly_scans s join public.fetal_assessments a on a.id = s.fetal_assessment_id
  where s.pregnancy_id = g.id
  group by a.id, a.performed_at order by a.performed_at desc limit 1
) an on true
left join lateral (
  select a.performed_at,
         (array['present', 'absent', 'reversed'])[max(array_position(array['present', 'absent', 'reversed'], d.ua_edf))] as ua_edf,
         (array['positive', 'absent', 'reversed'])[max(array_position(array['positive', 'absent', 'reversed'], d.dv_a_wave))] as dv_a_wave,
         max(d.mca_psv_mom) as mca_psv_mom, min(d.cpr) as cpr, bool_or(d.hydrops) as hydrops,
         -- CPR centile takes precedence over the CPR < 1 fallback (as in the application rules)
         coalesce(bool_or(case when d.cpr_centile is not null then d.cpr_centile < 5 else d.cpr < 1 end), false) as cpr_low,
         coalesce(bool_or(d.ua_pi_centile > 95), false) as ua_pi_high,
         min(d.mvp_cm) as mvp_min, max(d.mvp_cm) as mvp_max, coalesce(bool_or(d.bladder_visible = false), false) as bladder_absent
  from public.fm_dopplers d join public.fetal_assessments a on a.id = d.fetal_assessment_id
  where d.pregnancy_id = g.id
  group by a.id, a.performed_at order by a.performed_at desc limit 1
) dp on true
where g.status = 'active'
  and ('fetal_medicine' = any (p.specialties)
       or exists (select 1 from public.fm_cfdna c where c.pregnancy_id = g.id)
       or exists (select 1 from public.fm_procedures pr where pr.pregnancy_id = g.id));

grant select on public.fm_worklist to authenticated;
revoke all on public.fm_worklist from anon;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
revoke execute on function public.record_fm_scan(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.record_fm_scan(uuid, text, jsonb, jsonb) to authenticated;

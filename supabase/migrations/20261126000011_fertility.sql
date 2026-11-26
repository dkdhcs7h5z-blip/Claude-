-- =============================================================================
-- 0011  Infertility & reproductive medicine
--   fertility_profiles     couple work-up (1 per patient)
--   semen_analyses         partner semen analyses (computed total count / TMSC)
--   fertility_cycles       extended: protocol, trigger, retrieval, freeze-all
--   stimulation_monitoring follicle tracking, hormones, endometrium
--   embryos                embryology & cryostorage (Gardner / cleavage grading)
--   embryo_transfers       transfer, β-hCG and pregnancy outcome
--   views                  fertility_worklist, cryo_inventory (SECURITY INVOKER)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Couple work-up
-- ---------------------------------------------------------------------------
create table public.fertility_profiles (
  patient_id           uuid primary key references public.patients (id),
  clinic_id            uuid not null references public.clinics (id),
  infertility_type     text check (infertility_type in ('primary', 'secondary')),
  duration_months      smallint check (duration_months between 0 and 600),
  female_factors       text[] not null default '{}' check (female_factors <@ array[
                         'ovulatory', 'tubal', 'endometriosis', 'uterine', 'diminished_reserve', 'unexplained', 'other']),
  male_factor          boolean,
  tubal_assessment     text check (tubal_assessment in ('not_done', 'bilateral_patent', 'unilateral_patent', 'bilateral_blocked', 'hydrosalpinx')),
  tubal_method         text check (tubal_method in ('hsg', 'hycosy', 'laparoscopy')),
  partner_name         text,
  partner_dob          date check (partner_dob is null or partner_dob < current_date),
  partner_phone        text,
  partner_blood_group  text check (partner_blood_group in ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  previous_treatments  text,
  notes                text,
  updated_by           uuid references public.profiles (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint tubal_method_needs_result check (tubal_method is null or coalesce(tubal_assessment, 'not_done') <> 'not_done')
);

create trigger fertility_profiles_touch before update on public.fertility_profiles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Semen analysis (stored on the female partner's record = the couple's chart)
-- ---------------------------------------------------------------------------
create table public.semen_analyses (
  id                      uuid primary key default gen_random_uuid(),
  patient_id              uuid not null references public.patients (id),
  clinic_id               uuid not null references public.clinics (id),
  collected_at            date not null,
  sample_type             text not null default 'diagnostic' check (sample_type in ('diagnostic', 'post_wash', 'frozen_thawed', 'surgical')),
  abstinence_days         smallint check (abstinence_days between 0 and 30),
  volume_ml               numeric(4, 1) check (volume_ml between 0 and 20),
  concentration_m_ml      numeric(6, 2) check (concentration_m_ml between 0 and 500),
  progressive_pct         numeric(4, 1) check (progressive_pct between 0 and 100),
  total_motility_pct      numeric(4, 1) check (total_motility_pct between 0 and 100),
  normal_forms_pct        numeric(4, 1) check (normal_forms_pct between 0 and 100),
  vitality_pct            numeric(4, 1) check (vitality_pct between 0 and 100),
  ph                      numeric(3, 1) check (ph between 6 and 9),
  leukocytes_m_ml         numeric(4, 2) check (leukocytes_m_ml between 0 and 50),
  dna_fragmentation_pct   numeric(4, 1) check (dna_fragmentation_pct between 0 and 100),
  total_count_m           numeric(8, 2) generated always as (volume_ml * concentration_m_ml) stored,
  tmsc_m                  numeric(8, 2) generated always as (volume_ml * concentration_m_ml * progressive_pct / 100) stored,
  notes                   text,
  recorded_by             uuid references public.profiles (id) default auth.uid(),
  created_at              timestamptz not null default now(),
  constraint semen_motility_order check (progressive_pct is null or total_motility_pct is null or progressive_pct <= total_motility_pct),
  constraint semen_not_future check (collected_at <= current_date)
);

create index semen_analyses_patient_idx on public.semen_analyses (patient_id, collected_at);

-- ---------------------------------------------------------------------------
-- Treatment cycles (extends the Phase 1 table)
-- ---------------------------------------------------------------------------
alter table public.fertility_cycles
  add column cycle_number          smallint check (cycle_number between 1 and 50),
  add column day1_date             date,
  add column indication            text,
  add column stim_protocol         text check (stim_protocol in (
                                     'antagonist', 'long_agonist', 'short_agonist', 'ppos', 'mild', 'natural', 'letrozole', 'clomiphene', 'hrt_fet', 'natural_fet')),
  add column starting_dose_iu      smallint check (starting_dose_iu between 0 and 600),
  add column gonadotropin          text,
  add column trigger_type          text check (trigger_type in ('hcg', 'gnrh_agonist', 'dual', 'none')),
  add column trigger_at            timestamptz,
  add column insemination          text check (insemination in ('ivf', 'icsi', 'iui', 'none')),
  add column sperm_source          text check (sperm_source in ('partner_fresh', 'partner_frozen', 'donor', 'surgical')),
  add column retrieval_at          date,
  add column oocytes_retrieved     smallint check (oocytes_retrieved between 0 and 100),
  add column mii_oocytes           smallint check (mii_oocytes between 0 and 100),
  add column fertilized_2pn        smallint check (fertilized_2pn between 0 and 100),
  add column retrieval_complications text,
  add column freeze_all            boolean not null default false,
  add column freeze_all_reason     text check (freeze_all_reason in ('ohss_risk', 'progesterone', 'endometrium', 'pgt', 'elective', 'other')),
  add column cancel_reason         text,
  add column updated_by            uuid references public.profiles (id),
  add constraint cycle_mii_le_oocytes check (mii_oocytes is null or oocytes_retrieved is null or mii_oocytes <= oocytes_retrieved),
  add constraint cycle_2pn_le_oocytes check (fertilized_2pn is null or oocytes_retrieved is null or fertilized_2pn <= oocytes_retrieved),
  add constraint cycle_freeze_reason check (freeze_all or freeze_all_reason is null),
  add constraint cycle_cancel_reason check (status = 'cancelled' or cancel_reason is null),
  add constraint cycle_retrieval_after_start check (retrieval_at is null or retrieval_at >= start_date);

create or replace function private.fertility_cycle_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.patient_id <> old.patient_id then
    raise exception 'Cycle patient is immutable' using errcode = '42501';
  end if;
  if not private.is_server_context() then
    new.updated_by := auth.uid();
    if tg_op = 'INSERT' then
      new.created_by := auth.uid();
    end if;
  end if;
  if tg_op = 'INSERT' and new.cycle_number is null then
    select coalesce(max(cycle_number), 0) + 1 into new.cycle_number
    from public.fertility_cycles where patient_id = new.patient_id;
  end if;
  return new;
end;
$$;

create trigger fertility_cycles_rules before insert or update on public.fertility_cycles
  for each row execute function private.fertility_cycle_rules();

-- ---------------------------------------------------------------------------
-- Stimulation monitoring
-- ---------------------------------------------------------------------------
create table public.stimulation_monitoring (
  id                uuid primary key default gen_random_uuid(),
  cycle_id          uuid not null references public.fertility_cycles (id) on delete cascade,
  patient_id        uuid not null references public.patients (id),
  clinic_id         uuid not null references public.clinics (id),
  monitored_on      date not null default current_date,
  stim_day          smallint check (stim_day between 0 and 30),
  e2_pmol_l         numeric(8, 1) check (e2_pmol_l between 0 and 50000),
  lh_iu_l           numeric(5, 1) check (lh_iu_l between 0 and 200),
  p4_nmol_l         numeric(5, 2) check (p4_nmol_l between 0 and 200),
  endometrium_mm    numeric(4, 1) check (endometrium_mm between 0 and 30),
  follicles_right   numeric[] not null default '{}' check (cardinality(follicles_right) <= 60 and (cardinality(follicles_right) = 0 or (2 <= all (follicles_right) and 40 >= all (follicles_right)))),
  follicles_left    numeric[] not null default '{}' check (cardinality(follicles_left) <= 60 and (cardinality(follicles_left) = 0 or (2 <= all (follicles_left) and 40 >= all (follicles_left)))),
  fsh_dose_iu       smallint check (fsh_dose_iu between 0 and 600),
  antagonist        boolean not null default false,
  notes             text,
  recorded_by       uuid references public.profiles (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  constraint monitoring_not_future check (monitored_on <= current_date)
);

create index stimulation_monitoring_cycle_idx on public.stimulation_monitoring (cycle_id, monitored_on);

-- ---------------------------------------------------------------------------
-- Embryology & cryostorage
-- ---------------------------------------------------------------------------
create table public.embryos (
  id                    uuid primary key default gen_random_uuid(),
  cycle_id              uuid not null references public.fertility_cycles (id),
  patient_id            uuid not null references public.patients (id),
  clinic_id             uuid not null references public.clinics (id),
  embryo_no             smallint not null check (embryo_no between 1 and 100),
  day_observed          smallint check (day_observed between 1 and 7),
  stage                 text not null default 'cleavage' check (stage in ('zygote', 'cleavage', 'morula', 'blastocyst', 'arrested')),
  cell_count            smallint check (cell_count between 1 and 32),
  fragmentation_grade   smallint check (fragmentation_grade between 1 and 4),
  blast_expansion       smallint check (blast_expansion between 1 and 6),
  icm_grade             text check (icm_grade in ('A', 'B', 'C')),
  te_grade              text check (te_grade in ('A', 'B', 'C')),
  pgt_result            text not null default 'not_tested' check (pgt_result in ('not_tested', 'pending', 'euploid', 'aneuploid', 'mosaic', 'no_result')),
  status                text not null default 'in_culture' check (status in ('in_culture', 'transferred', 'frozen', 'thawed', 'discarded')),
  frozen_at             date,
  storage_location      text,
  consent_expires_on    date,
  notes                 text,
  updated_by            uuid references public.profiles (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (cycle_id, embryo_no),
  constraint embryo_blast_grades check (stage = 'blastocyst' or (blast_expansion is null and icm_grade is null and te_grade is null)),
  constraint embryo_frozen_storage check (status <> 'frozen' or (frozen_at is not null and storage_location is not null)),
  constraint embryo_consent_after_freeze check (consent_expires_on is null or frozen_at is null or consent_expires_on > frozen_at)
);

create index embryos_cycle_idx on public.embryos (cycle_id);
create index embryos_frozen_idx on public.embryos (clinic_id) where status = 'frozen';

create trigger embryos_touch before update on public.embryos
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Embryo transfer & outcome
-- ---------------------------------------------------------------------------
create table public.embryo_transfers (
  id                   uuid primary key default gen_random_uuid(),
  cycle_id             uuid not null references public.fertility_cycles (id),
  patient_id           uuid not null references public.patients (id),
  clinic_id            uuid not null references public.clinics (id),
  transfer_on          date not null,
  fresh                boolean not null,
  embryo_ids           uuid[] not null default '{}',
  embryos_transferred  smallint not null check (embryos_transferred between 1 and 4),
  embryo_day           smallint not null check (embryo_day in (2, 3, 5, 6, 7)),
  endometrium_mm       numeric(4, 1) check (endometrium_mm between 0 and 30),
  difficulty           text check (difficulty in ('easy', 'difficult', 'very_difficult')),
  beta_hcg_on          date,
  beta_hcg_value       numeric(8, 1) check (beta_hcg_value >= 0),
  gestational_sacs     smallint check (gestational_sacs between 0 and 6),
  fetal_hearts         smallint check (fetal_hearts between 0 and 6),
  outcome              text not null default 'pending' check (outcome in (
                         'pending', 'negative', 'biochemical', 'clinical', 'ectopic', 'miscarriage', 'ongoing')),
  pregnancy_id         uuid references public.pregnancies (id),
  notes                text,
  recorded_by          uuid references public.profiles (id) default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint transfer_not_future check (transfer_on <= current_date),
  constraint transfer_hearts_le_sacs check (fetal_hearts is null or gestational_sacs is null or fetal_hearts <= gestational_sacs),
  constraint transfer_hcg_after check (beta_hcg_on is null or beta_hcg_on > transfer_on),
  constraint transfer_embryo_count check (cardinality(embryo_ids) = 0 or cardinality(embryo_ids) = embryos_transferred),
  constraint transfer_clinical_needs_sac check (outcome not in ('clinical', 'ongoing') or coalesce(gestational_sacs, 0) >= 1)
);

create index embryo_transfers_cycle_idx on public.embryo_transfers (cycle_id);

create trigger embryo_transfers_touch before update on public.embryo_transfers
  for each row execute function private.touch_updated_at();

-- Embryo / transfer integrity: same patient as the cycle; transferred embryos
-- must belong to the patient and be available; mark them transferred.
create or replace function private.embryo_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.fertility_cycles c where c.id = new.cycle_id and c.patient_id = new.patient_id) then
    raise exception 'Record must belong to a cycle of the same patient' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.cycle_id <> old.cycle_id or new.patient_id <> old.patient_id) then
    raise exception 'Links are immutable' using errcode = '42501';
  end if;
  if tg_table_name = 'embryos' and not private.is_server_context() then
    new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid()));
  end if;
  return new;
end;
$$;

create trigger embryos_rules before insert or update on public.embryos
  for each row execute function private.embryo_rules();

create or replace function private.transfer_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_bad int;
begin
  if not exists (select 1 from public.fertility_cycles c where c.id = new.cycle_id and c.patient_id = new.patient_id) then
    raise exception 'Transfer must belong to a cycle of the same patient' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.cycle_id <> old.cycle_id or new.patient_id <> old.patient_id or new.embryo_ids <> old.embryo_ids then
      raise exception 'Transfer links and embryos are immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  select count(*) into v_bad
  from unnest(new.embryo_ids) as eid
  left join public.embryos e on e.id = eid
  where e.id is null or e.patient_id <> new.patient_id or e.status not in ('in_culture', 'frozen', 'thawed');
  if v_bad > 0 then
    raise exception 'Transferred embryos must be this patient''s available embryos' using errcode = '23514';
  end if;
  if not private.is_server_context() then
    new.recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger embryo_transfers_rules before insert or update on public.embryo_transfers
  for each row execute function private.transfer_rules();

create or replace function private.transfer_mark_embryos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.embryos set status = 'transferred' where id = any (new.embryo_ids);
  return new;
end;
$$;

create trigger embryo_transfers_mark after insert on public.embryo_transfers
  for each row execute function private.transfer_mark_embryos();

create or replace function private.monitoring_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.fertility_cycles c where c.id = new.cycle_id and c.patient_id = new.patient_id) then
    raise exception 'Monitoring must belong to a cycle of the same patient' using errcode = '23514';
  end if;
  if not private.is_server_context() and tg_op = 'INSERT' then
    new.recorded_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger stimulation_monitoring_rules before insert or update on public.stimulation_monitoring
  for each row execute function private.monitoring_rules();

create or replace function private.fertility_simple_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.patient_id <> old.patient_id then
    raise exception 'Record patient is immutable' using errcode = '42501';
  end if;
  if not private.is_server_context() then
    if tg_table_name = 'fertility_profiles' then
      new := jsonb_populate_record(new, jsonb_build_object('updated_by', auth.uid()));
    elsif tg_op = 'INSERT' then
      new := jsonb_populate_record(new, jsonb_build_object('recorded_by', auth.uid()));
    end if;
  end if;
  return new;
end;
$$;

create trigger fertility_profiles_rules before insert or update on public.fertility_profiles
  for each row execute function private.fertility_simple_rules();
create trigger semen_analyses_rules before insert or update on public.semen_analyses
  for each row execute function private.fertility_simple_rules();

-- Tag patient with the infertility specialty when work-up or a cycle is recorded.
create or replace function private.fertility_tag_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.patients
     set specialties = array_append(specialties, 'infertility'::public.specialty)
   where id = new.patient_id and not ('infertility' = any (specialties));
  return new;
end;
$$;

create trigger fertility_profiles_tag after insert on public.fertility_profiles
  for each row execute function private.fertility_tag_patient();
create trigger fertility_cycles_tag after insert on public.fertility_cycles
  for each row execute function private.fertility_tag_patient();

-- ---------------------------------------------------------------------------
-- RLS, grants, audit (fertility_cycles already has RLS + audit from 0002/0004/0005)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['fertility_profiles', 'semen_analyses', 'stimulation_monitoring', 'embryos', 'embryo_transfers'] loop
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
-- Views
-- ---------------------------------------------------------------------------
create view public.fertility_worklist
with (security_invoker = true)
as
select
  c.id as cycle_id, c.patient_id, c.clinic_id, c.cycle_type, c.cycle_number, c.status, c.start_date, c.stim_protocol,
  c.trigger_at, c.retrieval_at, c.oocytes_retrieved, c.freeze_all,
  p.mrn, p.first_name_en, p.last_name_en, p.first_name_ar, p.last_name_ar, p.date_of_birth,
  m.monitored_on as last_monitoring_on, m.stim_day as last_stim_day, m.e2_pmol_l as last_e2,
  m.follicles_right as last_follicles_right, m.follicles_left as last_follicles_left,
  t.transfer_on as last_transfer_on, t.embryo_day as last_transfer_day, t.outcome as last_transfer_outcome,
  t.beta_hcg_value as last_beta_hcg
from public.fertility_cycles c
join public.patients p on p.id = c.patient_id and p.deleted_at is null
left join lateral (
  select * from public.stimulation_monitoring sm where sm.cycle_id = c.id order by sm.monitored_on desc, sm.created_at desc limit 1
) m on true
left join lateral (
  select * from public.embryo_transfers et where et.cycle_id = c.id order by et.transfer_on desc limit 1
) t on true
where c.status not in ('completed', 'cancelled') or t.outcome = 'pending';

create view public.cryo_inventory
with (security_invoker = true)
as
select
  e.id as embryo_id, e.patient_id, e.clinic_id, e.cycle_id, e.embryo_no, e.day_observed, e.stage, e.blast_expansion, e.icm_grade,
  e.te_grade, e.cell_count, e.fragmentation_grade, e.pgt_result, e.frozen_at, e.storage_location, e.consent_expires_on,
  c.cycle_number, p.mrn, p.first_name_en, p.last_name_en, p.first_name_ar, p.last_name_ar
from public.embryos e
join public.fertility_cycles c on c.id = e.cycle_id
join public.patients p on p.id = e.patient_id and p.deleted_at is null
where e.status = 'frozen';

revoke all on public.fertility_worklist, public.cryo_inventory from anon;
grant select on public.fertility_worklist, public.cryo_inventory to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

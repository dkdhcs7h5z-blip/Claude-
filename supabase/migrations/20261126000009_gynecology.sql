-- =============================================================================
-- 0009  Gynecology module
--   gyn_profiles        gynecological history (1 row per patient)
--   gyn_visits          structured consultation, 1:1 with a gynecology encounter
--   gyn_ultrasounds     pelvic ultrasound incl. fibroids (FIGO) & IOTA features
--   cervical_screenings cytology / HPV results and the confirmed next step
--   colposcopies        colposcopy, biopsy histology and treatment
--   gyn_procedures      operative / office procedures, histology tracking
--   view gyn_worklist   RLS-respecting per-patient summary
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Gynecological history
-- ---------------------------------------------------------------------------
create table public.gyn_profiles (
  patient_id             uuid primary key references public.patients (id),
  clinic_id              uuid not null references public.clinics (id),
  menarche_age           smallint check (menarche_age between 7 and 20),
  cycle_length_days      smallint check (cycle_length_days between 15 and 120),
  period_duration_days   smallint check (period_duration_days between 1 and 15),
  cycle_regularity       text check (cycle_regularity in ('regular', 'irregular', 'absent')),
  menstrual_flow         text check (menstrual_flow in ('light', 'normal', 'heavy')),
  dysmenorrhea           text check (dysmenorrhea in ('none', 'mild', 'moderate', 'severe')),
  menopause_status       text check (menopause_status in ('premenopausal', 'perimenopausal', 'postmenopausal', 'surgical')),
  menopause_age          smallint check (menopause_age between 25 and 65),
  on_hrt                 boolean,
  contraception          text check (contraception in (
                           'none', 'coc', 'pop', 'iud_copper', 'lng_ius', 'implant', 'injectable', 'condom', 'sterilization', 'other')),
  sexually_active        boolean,
  hpv_vaccinated         text check (hpv_vaccinated in ('yes', 'no', 'unknown')),
  hysterectomy           text check (hysterectomy in ('none', 'subtotal', 'total')),
  previous_gyn_surgery   text,
  notes                  text,
  updated_by             uuid references public.profiles (id) default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint gyn_menopause_age check (menopause_age is null or coalesce(menopause_status, '') in ('postmenopausal', 'surgical'))
);

create trigger gyn_profiles_touch before update on public.gyn_profiles
  for each row execute function private.touch_updated_at();

create or replace function private.gyn_profile_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_server_context() then
    new.updated_by := auth.uid();
  end if;
  if tg_op = 'UPDATE' and new.patient_id <> old.patient_id then
    raise exception 'Profile patient is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger gyn_profiles_stamp before insert or update on public.gyn_profiles
  for each row execute function private.gyn_profile_stamp();

-- ---------------------------------------------------------------------------
-- Gynecology visits
-- ---------------------------------------------------------------------------
create table public.gyn_visits (
  id                              uuid primary key default gen_random_uuid(),
  patient_id                      uuid not null references public.patients (id),
  clinic_id                       uuid not null references public.clinics (id),
  encounter_id                    uuid not null unique references public.encounters (id),
  visit_date                      date not null default current_date,
  complaints                      text[] not null default '{}' check (complaints <@ array[
                                    'aub', 'pmb', 'amenorrhea', 'pelvic_pain', 'dysmenorrhea', 'discharge', 'pelvic_mass',
                                    'prolapse', 'incontinence', 'menopause_symptoms', 'hirsutism_acne', 'contraception',
                                    'screening', 'infertility', 'dyspareunia', 'postcoital_bleeding', 'breast', 'other']),
  palm_coein                      text[] not null default '{}' check (palm_coein <@ array[
                                    'P', 'A', 'L-SM', 'L-O', 'M', 'C', 'O', 'E', 'I', 'N']),
  lmp                             date,
  pain_score                      smallint check (pain_score between 0 and 10),
  bp_systolic                     smallint check (bp_systolic between 50 and 260),
  bp_diastolic                    smallint check (bp_diastolic between 30 and 180),
  weight_kg                       numeric(5, 1) check (weight_kg between 25 and 300),
  height_cm                       numeric(4, 1) check (height_cm between 100 and 230),
  clinical_hyperandrogenism       boolean,
  biochemical_hyperandrogenism    boolean,
  abdominal_exam                  text,
  speculum_exam                   text,
  bimanual_exam                   text,
  uterus_size                     text check (uterus_size in ('normal', 'bulky', 'enlarged_lt12w', 'enlarged_ge12w', 'not_assessed')),
  adnexal_tenderness              boolean,
  cervical_motion_tenderness      boolean,
  pop_stage                       smallint check (pop_stage between 0 and 4),
  diagnosis                       text,
  notes                           text,
  created_by                      uuid references public.profiles (id) default auth.uid(),
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  constraint gyn_bp_pair check (
    (bp_systolic is null) = (bp_diastolic is null) and (bp_systolic is null or bp_systolic > bp_diastolic)
  ),
  constraint gyn_lmp_not_after_visit check (lmp is null or lmp <= visit_date)
);

create index gyn_visits_patient_idx on public.gyn_visits (patient_id, visit_date);

create trigger gyn_visits_touch before update on public.gyn_visits
  for each row execute function private.touch_updated_at();

create or replace function private.gyn_visit_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_patient uuid;
  v_spec    public.specialty;
begin
  if tg_op = 'UPDATE' then
    if new.patient_id <> old.patient_id or new.encounter_id <> old.encounter_id then
      raise exception 'Visit links are immutable' using errcode = '42501';
    end if;
    if not private.is_server_context()
       and private.encounter_status(old.encounter_id) in ('signed', 'amended') then
      raise exception 'This visit is signed; record an amendment instead' using errcode = '42501';
    end if;
    return new;
  end if;
  select patient_id, specialty into v_patient, v_spec from public.encounters where id = new.encounter_id;
  if v_patient is distinct from new.patient_id or v_spec <> 'gynecology' then
    raise exception 'Visit must link to a gynecology encounter of the same patient' using errcode = '23514';
  end if;
  if not private.is_server_context() then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger gyn_visits_rules before insert or update on public.gyn_visits
  for each row execute function private.gyn_visit_rules();

create or replace function public.record_gyn_visit(
  p_patient_id  uuid,
  p_visit       jsonb,
  p_encounter   jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_clinic uuid;
  v_date   date := coalesce((p_visit ->> 'visit_date')::date, current_date);
  v_enc    uuid;
  v_id     uuid;
  v_row    public.gyn_visits;
begin
  select clinic_id into v_clinic from public.patients where id = p_patient_id and deleted_at is null;
  if v_clinic is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;
  if v_date > current_date then
    raise exception 'Visit date cannot be in the future' using errcode = '22023';
  end if;
  v_clinic := coalesce(nullif(p_encounter ->> 'clinic_id', '')::uuid, v_clinic);

  insert into public.encounters
    (patient_id, clinic_id, specialty, encounter_type, encounter_at, is_private, chief_complaint, assessment, plan)
  values
    (p_patient_id, v_clinic, 'gynecology', coalesce(p_encounter ->> 'encounter_type', 'consultation'),
     case when v_date = current_date then now() else v_date::timestamptz end,
     coalesce((p_encounter ->> 'is_private')::boolean, false),
     p_encounter ->> 'chief_complaint', p_encounter ->> 'assessment', p_encounter ->> 'plan')
  returning id into v_enc;

  v_row := jsonb_populate_record(null::public.gyn_visits, p_visit);
  insert into public.gyn_visits
    (patient_id, clinic_id, encounter_id, visit_date, complaints, palm_coein, lmp, pain_score, bp_systolic, bp_diastolic,
     weight_kg, height_cm, clinical_hyperandrogenism, biochemical_hyperandrogenism, abdominal_exam, speculum_exam,
     bimanual_exam, uterus_size, adnexal_tenderness, cervical_motion_tenderness, pop_stage, diagnosis, notes)
  values
    (p_patient_id, v_clinic, v_enc, v_date, coalesce(v_row.complaints, '{}'), coalesce(v_row.palm_coein, '{}'), v_row.lmp,
     v_row.pain_score, v_row.bp_systolic, v_row.bp_diastolic, v_row.weight_kg, v_row.height_cm,
     v_row.clinical_hyperandrogenism, v_row.biochemical_hyperandrogenism, v_row.abdominal_exam, v_row.speculum_exam,
     v_row.bimanual_exam, v_row.uterus_size, v_row.adnexal_tenderness, v_row.cervical_motion_tenderness, v_row.pop_stage,
     v_row.diagnosis, v_row.notes)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Pelvic ultrasound
-- ---------------------------------------------------------------------------
create table public.gyn_ultrasounds (
  id                         uuid primary key default gen_random_uuid(),
  patient_id                 uuid not null references public.patients (id),
  clinic_id                  uuid not null references public.clinics (id),
  performed_at               timestamptz not null default now(),
  route                      text check (route in ('transabdominal', 'transvaginal', 'transrectal')),
  uterus_length_mm           numeric(5, 1) check (uterus_length_mm between 10 and 300),
  uterus_ap_mm               numeric(5, 1) check (uterus_ap_mm between 5 and 200),
  uterus_width_mm            numeric(5, 1) check (uterus_width_mm between 5 and 200),
  uterus_position            text check (uterus_position in ('anteverted', 'retroverted', 'axial', 'absent')),
  endometrial_thickness_mm   numeric(4, 1) check (endometrial_thickness_mm between 0 and 50),
  endometrium_appearance     text check (endometrium_appearance in ('normal', 'thickened', 'heterogeneous', 'polyp', 'fluid', 'not_seen')),
  fibroids                   jsonb not null default '[]'::jsonb check (jsonb_typeof(fibroids) = 'array' and jsonb_array_length(fibroids) <= 30),
  right_ovary_volume_ml      numeric(5, 1) check (right_ovary_volume_ml between 0 and 1000),
  left_ovary_volume_ml       numeric(5, 1) check (left_ovary_volume_ml between 0 and 1000),
  right_follicle_count       smallint check (right_follicle_count between 0 and 100),
  left_follicle_count        smallint check (left_follicle_count between 0 and 100),
  adnexal_mass               boolean not null default false,
  mass_side                  text check (mass_side in ('right', 'left', 'bilateral')),
  mass_max_diameter_mm       numeric(5, 1) check (mass_max_diameter_mm between 1 and 400),
  iota_b_features            text[] not null default '{}' check (iota_b_features <@ array['B1', 'B2', 'B3', 'B4', 'B5']),
  iota_m_features            text[] not null default '{}' check (iota_m_features <@ array['M1', 'M2', 'M3', 'M4', 'M5']),
  free_fluid                 text check (free_fluid in ('none', 'small', 'moderate', 'large')),
  impression                 text,
  performed_by               uuid references public.profiles (id) default auth.uid(),
  created_at                 timestamptz not null default now(),
  constraint gyn_us_mass_fields check (
    adnexal_mass or (mass_side is null and mass_max_diameter_mm is null
                     and cardinality(iota_b_features) = 0 and cardinality(iota_m_features) = 0)
  )
);

create index gyn_ultrasounds_patient_idx on public.gyn_ultrasounds (patient_id, performed_at);

-- ---------------------------------------------------------------------------
-- Cervical screening & colposcopy
-- ---------------------------------------------------------------------------
create table public.cervical_screenings (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients (id),
  clinic_id             uuid not null references public.clinics (id),
  sample_date           date not null,
  test_type             text not null check (test_type in ('cytology', 'hpv_primary', 'cotest')),
  hpv_result            text check (hpv_result in ('negative', 'hpv16', 'hpv18', 'hpv16_18', 'other_hr', 'positive_untyped')),
  cytology_result       text check (cytology_result in (
                          'nilm', 'asc_us', 'lsil', 'asc_h', 'hsil', 'agc', 'scc', 'adenocarcinoma', 'unsatisfactory')),
  status                text not null default 'pending' check (status in ('pending', 'resulted')),
  recommendation        text,
  next_due_date         date,
  notes                 text,
  recorded_by           uuid references public.profiles (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint screening_not_future check (sample_date <= current_date),
  constraint screening_result_matches_test check (
    status = 'pending'
    or (test_type = 'cytology' and cytology_result is not null)
    or (test_type = 'hpv_primary' and hpv_result is not null)
    or (test_type = 'cotest' and cytology_result is not null and hpv_result is not null)
  ),
  constraint screening_next_due_after check (next_due_date is null or next_due_date > sample_date)
);

create index cervical_screenings_patient_idx on public.cervical_screenings (patient_id, sample_date);

create trigger cervical_screenings_touch before update on public.cervical_screenings
  for each row execute function private.touch_updated_at();

create table public.colposcopies (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id),
  clinic_id        uuid not null references public.clinics (id),
  screening_id     uuid references public.cervical_screenings (id),
  performed_at     date not null default current_date,
  tz_type          smallint check (tz_type between 1 and 3),
  findings         text check (findings in ('normal', 'minor_grade1', 'major_grade2', 'suspicious_invasion', 'non_specific')),
  biopsy_taken     boolean not null default false,
  histology        text check (histology in ('pending', 'normal', 'cin1', 'cin2', 'cin3', 'ais', 'invasive')),
  treatment        text check (treatment in ('none', 'lletz', 'cone', 'ablation', 'follow_up')),
  notes            text,
  performed_by     uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint colposcopy_not_future check (performed_at <= current_date),
  constraint colposcopy_histology_needs_biopsy check (histology is null or biopsy_taken or coalesce(treatment, '') in ('lletz', 'cone'))
);

create trigger colposcopies_touch before update on public.colposcopies
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Procedures
-- ---------------------------------------------------------------------------
create table public.gyn_procedures (
  id                uuid primary key default gen_random_uuid(),
  patient_id        uuid not null references public.patients (id),
  clinic_id         uuid not null references public.clinics (id),
  performed_at      date not null default current_date,
  procedure_code    text not null check (procedure_code in (
                      'diagnostic_hysteroscopy', 'operative_hysteroscopy', 'polypectomy', 'endometrial_biopsy', 'd_and_c',
                      'iud_insertion', 'iud_removal', 'diagnostic_laparoscopy', 'ovarian_cystectomy', 'oophorectomy',
                      'salpingectomy', 'myomectomy', 'hysterectomy', 'lletz', 'cone_biopsy', 'colporrhaphy',
                      'sling', 'endometriosis_excision', 'other')),
  approach          text check (approach in ('office', 'hysteroscopic', 'laparoscopic', 'robotic', 'open', 'vaginal')),
  indication        text,
  findings          text,
  surgeon_id        uuid references public.profiles (id) default auth.uid(),
  assistant         text,
  anesthesia        text check (anesthesia in ('none', 'local', 'sedation', 'regional', 'general')),
  blood_loss_ml     integer check (blood_loss_ml between 0 and 20000),
  complications     text,
  clavien_dindo     text check (clavien_dindo in ('none', 'I', 'II', 'IIIa', 'IIIb', 'IVa', 'IVb', 'V')),
  histology_status  text not null default 'not_sent' check (histology_status in ('not_sent', 'pending', 'received')),
  histology_result  text,
  notes             text,
  recorded_by       uuid references public.profiles (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint procedure_not_future check (performed_at <= current_date),
  constraint procedure_histology_result check (histology_status = 'received' or histology_result is null)
);

create index gyn_procedures_patient_idx on public.gyn_procedures (patient_id, performed_at);

create trigger gyn_procedures_touch before update on public.gyn_procedures
  for each row execute function private.touch_updated_at();

-- Stamp authors & keep links immutable for the directly-inserted tables.
create or replace function private.gyn_record_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
begin
  if tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    if v_new ->> 'patient_id' <> v_old ->> 'patient_id' then
      raise exception 'Record patient is immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  if not private.is_server_context() then
    case tg_table_name
      when 'gyn_ultrasounds' then new := jsonb_populate_record(new, jsonb_build_object('performed_by', auth.uid()));
      when 'cervical_screenings' then new := jsonb_populate_record(new, jsonb_build_object('recorded_by', auth.uid()));
      when 'colposcopies' then new := jsonb_populate_record(new, jsonb_build_object('performed_by', auth.uid()));
      when 'gyn_procedures' then new := jsonb_populate_record(new, jsonb_build_object('recorded_by', auth.uid(),
                                  'surgeon_id', coalesce(v_new ->> 'surgeon_id', auth.uid()::text)));
      else null;
    end case;
  end if;
  return new;
end;
$$;

create trigger gyn_ultrasounds_rules before insert or update on public.gyn_ultrasounds
  for each row execute function private.gyn_record_rules();
create trigger cervical_screenings_rules before insert or update on public.cervical_screenings
  for each row execute function private.gyn_record_rules();
create trigger colposcopies_rules before insert or update on public.colposcopies
  for each row execute function private.gyn_record_rules();
create trigger gyn_procedures_rules before insert or update on public.gyn_procedures
  for each row execute function private.gyn_record_rules();

-- A colposcopy linked to a screening must be the same patient's.
create or replace function private.colposcopy_link_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.screening_id is not null and not exists (
    select 1 from public.cervical_screenings s where s.id = new.screening_id and s.patient_id = new.patient_id
  ) then
    raise exception 'Colposcopy must link to a screening of the same patient' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger colposcopies_link before insert or update on public.colposcopies
  for each row execute function private.colposcopy_link_rules();

-- Registering gynecology data tags the patient with the specialty.
create or replace function private.gyn_tag_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.patients
     set specialties = array_append(specialties, 'gynecology'::public.specialty)
   where id = new.patient_id and not ('gynecology' = any (specialties));
  return new;
end;
$$;

create trigger gyn_profiles_tag after insert on public.gyn_profiles
  for each row execute function private.gyn_tag_patient();
create trigger gyn_visits_tag after insert on public.gyn_visits
  for each row execute function private.gyn_tag_patient();

-- ---------------------------------------------------------------------------
-- RLS, grants, audit
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['gyn_profiles', 'gyn_visits', 'gyn_ultrasounds', 'cervical_screenings', 'colposcopies', 'gyn_procedures'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger %I after insert or update or delete on public.%I
                      for each row execute function private.audit_row_change()', t || '_audit', t);
    if t = 'gyn_visits' then
      -- visit inherits its encounter's visibility (private notes)
      execute format($p$create policy %I on public.%I for select to authenticated
        using (private.can(patient_id, 'clinical.read') and exists (select 1 from public.encounters e where e.id = encounter_id))$p$, t || '_select', t);
      execute format($p$create policy %I on public.%I for update to authenticated
        using (private.can(patient_id, 'clinical.write') and exists (select 1 from public.encounters e where e.id = encounter_id))
        with check (private.can(patient_id, 'clinical.write'))$p$, t || '_update', t);
    else
      execute format($p$create policy %I on public.%I for select to authenticated
        using (private.can(patient_id, 'clinical.read'))$p$, t || '_select', t);
      execute format($p$create policy %I on public.%I for update to authenticated
        using (private.can(patient_id, 'clinical.write')) with check (private.can(patient_id, 'clinical.write'))$p$, t || '_update', t);
    end if;
    execute format($p$create policy %I on public.%I for insert to authenticated
      with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id))$p$, t || '_insert', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gynecology worklist (SECURITY INVOKER view)
-- ---------------------------------------------------------------------------
create view public.gyn_worklist
with (security_invoker = true)
as
select
  p.id as patient_id, p.clinic_id, p.mrn, p.first_name_en, p.last_name_en, p.first_name_ar, p.last_name_ar, p.date_of_birth,
  gp.menopause_status, gp.hysterectomy,
  s.sample_date      as last_screening_date,
  s.test_type        as last_screening_test,
  s.hpv_result       as last_hpv_result,
  s.cytology_result  as last_cytology_result,
  s.status           as last_screening_status,
  s.next_due_date    as screening_next_due,
  s.recommendation   as screening_recommendation,
  (select max(c.performed_at) from public.colposcopies c where c.patient_id = p.id) as last_colposcopy_date,
  (select count(*) from public.gyn_procedures x where x.patient_id = p.id and x.histology_status = 'pending')
    + (select count(*) from public.colposcopies c where c.patient_id = p.id and c.histology = 'pending') as pending_histology,
  (select max(v.visit_date) from public.gyn_visits v where v.patient_id = p.id) as last_visit_date,
  (select v.complaints from public.gyn_visits v where v.patient_id = p.id order by v.visit_date desc, v.created_at desc limit 1) as last_complaints
from public.patients p
left join public.gyn_profiles gp on gp.patient_id = p.id
left join lateral (
  select * from public.cervical_screenings cs where cs.patient_id = p.id order by cs.sample_date desc, cs.created_at desc limit 1
) s on true
where p.deleted_at is null and 'gynecology' = any (p.specialties);

revoke all on public.gyn_worklist from anon;
grant select on public.gyn_worklist to authenticated;

revoke execute on function public.record_gyn_visit(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.record_gyn_visit(uuid, jsonb, jsonb) to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

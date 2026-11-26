-- =============================================================================
-- 0008  Obstetrics, extended: fetal biometry & EFW, multiples, postnatal care,
--       labour observations (partogram)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Multiples: chorionicity on the pregnancy; per-fetus FHR / presentation at visits
-- ---------------------------------------------------------------------------
alter table public.pregnancies
  add column chorionicity text check (chorionicity in ('dcda', 'mcda', 'mcma', 'tcta', 'dcta', 'mcta', 'other')),
  -- high-risk documentation (antenatal follow-up card, sections 1–2)
  add column previous_cs_count    smallint check (previous_cs_count between 0 and 10),
  add column high_risk_plan       text,
  add column current_medications  text,
  add constraint pregnancies_chorionicity_multiples check (chorionicity is null or plurality > 1),
  add constraint pregnancies_cs_le_para check (previous_cs_count is null or para is null or previous_cs_count <= para);

alter table public.antenatal_visits
  add column fhr_by_fetus smallint[] check (
    fhr_by_fetus is null or (60 <= all (fhr_by_fetus) and 240 >= all (fhr_by_fetus))
  ),
  add column presentation_by_fetus text[] check (
    presentation_by_fetus is null
    or presentation_by_fetus <@ array['cephalic', 'breech', 'transverse', 'oblique', 'unstable', 'not_assessed']
  ),
  add column next_visit_date date,
  add constraint antenatal_next_visit_after check (next_visit_date is null or next_visit_date > visit_date);

-- Re-create the visit RPC so it accepts the per-fetus fields.
create or replace function public.record_antenatal_visit(
  p_pregnancy_id  uuid,
  p_visit         jsonb,
  p_encounter     jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_preg       public.pregnancies;
  v_clinic     uuid;
  v_date       date := coalesce((p_visit ->> 'visit_date')::date, current_date);
  v_encounter  uuid;
  v_visit      uuid;
  v_row        public.antenatal_visits;
begin
  select * into v_preg from public.pregnancies where id = p_pregnancy_id;
  if not found then
    raise exception 'Pregnancy not found' using errcode = 'P0002';
  end if;
  if v_preg.status <> 'active' then
    raise exception 'Visits can only be recorded for an ongoing pregnancy' using errcode = '23514';
  end if;
  if v_date > current_date then
    raise exception 'Visit date cannot be in the future' using errcode = '22023';
  end if;
  v_clinic := coalesce(nullif(p_encounter ->> 'clinic_id', '')::uuid, v_preg.clinic_id);

  insert into public.encounters
    (patient_id, clinic_id, specialty, encounter_type, encounter_at, is_private, chief_complaint, assessment, plan)
  values
    (v_preg.patient_id, v_clinic, 'obstetrics', 'antenatal_visit',
     case when v_date = current_date then now() else v_date::timestamptz end,
     coalesce((p_encounter ->> 'is_private')::boolean, false),
     p_encounter ->> 'chief_complaint', p_encounter ->> 'assessment', p_encounter ->> 'plan')
  returning id into v_encounter;

  v_row := jsonb_populate_record(null::public.antenatal_visits, p_visit);
  insert into public.antenatal_visits
    (pregnancy_id, patient_id, clinic_id, encounter_id, visit_date, weight_kg, bp_systolic, bp_diastolic,
     pulse, urine_protein, urine_glucose, fundal_height_cm, fetal_heart_rate, presentation,
     fetal_movements, edema, hemoglobin_g_dl, notes, fhr_by_fetus, presentation_by_fetus, next_visit_date)
  values
    (v_preg.id, v_preg.patient_id, v_clinic, v_encounter, v_date, v_row.weight_kg, v_row.bp_systolic,
     v_row.bp_diastolic, v_row.pulse, v_row.urine_protein, v_row.urine_glucose, v_row.fundal_height_cm,
     v_row.fetal_heart_rate, v_row.presentation, v_row.fetal_movements, v_row.edema,
     v_row.hemoglobin_g_dl, v_row.notes, v_row.fhr_by_fetus, v_row.presentation_by_fetus, v_row.next_visit_date)
  returning id into v_visit;

  return v_visit;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fetal biometry (one row per fetus per scan)
-- ---------------------------------------------------------------------------
-- Hadlock 4 (HC, AC, FL) — Hadlock FP et al., Am J Obstet Gynecol 1985;151:333.
-- log10(EFW g) = 1.326 − 0.00326·AC·FL + 0.0107·HC + 0.0438·AC + 0.158·FL  (cm)
create or replace function private.hadlock_efw(p_hc_mm numeric, p_ac_mm numeric, p_fl_mm numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_hc_mm is null or p_ac_mm is null or p_fl_mm is null then null
    else round(power(10, 1.326
      - 0.00326 * (p_ac_mm / 10) * (p_fl_mm / 10)
      + 0.0107 * (p_hc_mm / 10)
      + 0.0438 * (p_ac_mm / 10)
      + 0.158 * (p_fl_mm / 10)))::integer
  end;
$$;

create table public.fetal_biometry (
  id                   uuid primary key default gen_random_uuid(),
  fetal_assessment_id  uuid not null references public.fetal_assessments (id) on delete cascade,
  pregnancy_id         uuid not null references public.pregnancies (id),
  patient_id           uuid not null references public.patients (id),
  clinic_id            uuid not null references public.clinics (id),
  fetus_label          text not null default 'A' check (fetus_label in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  ga_days              smallint check (ga_days between 0 and 315),
  crl_mm               numeric(5, 1) check (crl_mm between 1 and 100),
  bpd_mm               numeric(5, 1) check (bpd_mm between 10 and 120),
  hc_mm                numeric(5, 1) check (hc_mm between 50 and 420),
  ac_mm                numeric(5, 1) check (ac_mm between 40 and 450),
  fl_mm                numeric(5, 1) check (fl_mm between 5 and 90),
  efw_g                integer check (efw_g between 50 and 7000),
  afi_cm               numeric(4, 1) check (afi_cm between 0 and 60),
  dvp_cm               numeric(4, 1) check (dvp_cm between 0 and 25),
  ua_pi                numeric(4, 2) check (ua_pi between 0 and 5),
  ua_edf               text check (ua_edf in ('present', 'absent', 'reversed')),
  mca_pi               numeric(4, 2) check (mca_pi between 0 and 5),
  fhr                  smallint check (fhr between 60 and 240),
  presentation         text check (presentation in ('cephalic', 'breech', 'transverse', 'oblique', 'unstable', 'not_assessed')),
  placenta_location    text check (placenta_location in ('anterior', 'posterior', 'fundal', 'lateral', 'low_lying', 'previa')),
  notes                text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (fetal_assessment_id, fetus_label)
);

create index fetal_biometry_pregnancy_idx on public.fetal_biometry (pregnancy_id, ga_days);

create trigger fetal_biometry_touch before update on public.fetal_biometry
  for each row execute function private.touch_updated_at();

create or replace function private.fetal_biometry_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_fa public.fetal_assessments;
begin
  select * into v_fa from public.fetal_assessments where id = new.fetal_assessment_id;
  if v_fa.patient_id is distinct from new.patient_id
     or (v_fa.pregnancy_id is not null and v_fa.pregnancy_id <> new.pregnancy_id) then
    raise exception 'Biometry must match its scan and pregnancy' using errcode = '23514';
  end if;
  if not exists (select 1 from public.pregnancies g where g.id = new.pregnancy_id and g.patient_id = new.patient_id) then
    raise exception 'Biometry patient does not match the pregnancy' using errcode = '23514';
  end if;
  new.ga_days := private.pregnancy_ga_days(new.pregnancy_id, v_fa.performed_at::date);
  new.efw_g := coalesce(private.hadlock_efw(new.hc_mm, new.ac_mm, new.fl_mm), new.efw_g);
  return new;
end;
$$;

create trigger fetal_biometry_rules before insert or update on public.fetal_biometry
  for each row execute function private.fetal_biometry_rules();

-- Record a scan + per-fetus biometry atomically.
create or replace function public.record_fetal_scan(
  p_pregnancy_id  uuid,
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
  v_b      public.fetal_biometry;
begin
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
    (v_preg.patient_id, v_preg.id, v_clinic, coalesce(p_scan ->> 'assessment_type', 'growth_scan'), v_at,
     private.pregnancy_ga_days(v_preg.id, v_at::date), jsonb_array_length(p_fetuses),
     p_scan ->> 'impression', '{}'::jsonb)
  returning id into v_id;

  for v_f in select * from jsonb_array_elements(p_fetuses) loop
    v_b := jsonb_populate_record(null::public.fetal_biometry, v_f);
    insert into public.fetal_biometry
      (fetal_assessment_id, pregnancy_id, patient_id, clinic_id, fetus_label, crl_mm, bpd_mm, hc_mm, ac_mm, fl_mm,
       efw_g, afi_cm, dvp_cm, ua_pi, ua_edf, mca_pi, fhr, presentation, placenta_location, notes)
    values
      (v_id, v_preg.id, v_preg.patient_id, v_clinic, coalesce(v_b.fetus_label, 'A'), v_b.crl_mm, v_b.bpd_mm, v_b.hc_mm,
       v_b.ac_mm, v_b.fl_mm, v_b.efw_g, v_b.afi_cm, v_b.dvp_cm, v_b.ua_pi, v_b.ua_edf, v_b.mca_pi, v_b.fhr,
       v_b.presentation, v_b.placenta_location, v_b.notes);
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Postnatal visits
-- ---------------------------------------------------------------------------
create table public.postnatal_visits (
  id                uuid primary key default gen_random_uuid(),
  delivery_id       uuid not null references public.deliveries (id),
  pregnancy_id      uuid not null references public.pregnancies (id),
  patient_id        uuid not null references public.patients (id),
  clinic_id         uuid not null references public.clinics (id),
  encounter_id      uuid not null unique references public.encounters (id),
  visit_date        date not null default current_date,
  days_postpartum   smallint check (days_postpartum between 0 and 365),
  bp_systolic       smallint check (bp_systolic between 50 and 260),
  bp_diastolic      smallint check (bp_diastolic between 30 and 180),
  pulse             smallint check (pulse between 30 and 220),
  temperature_c     numeric(3, 1) check (temperature_c between 34 and 43),
  uterus            text check (uterus in ('well_contracted', 'subinvolution', 'tender')),
  lochia            text check (lochia in ('normal', 'heavy', 'offensive', 'absent')),
  wound             text check (wound in ('not_applicable', 'healing', 'infection', 'dehiscence')),
  breastfeeding     text check (breastfeeding in ('exclusive', 'mixed', 'formula', 'not_feeding')),
  breasts           text check (breasts in ('normal', 'engorgement', 'mastitis', 'nipple_trauma')),
  epds_score        smallint check (epds_score between 0 and 30),
  epds_self_harm    boolean,
  hemoglobin_g_dl   numeric(4, 1) check (hemoglobin_g_dl between 3 and 20),
  contraception     text,
  notes             text,
  created_by        uuid references public.profiles (id) default auth.uid(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint postnatal_bp_pair check (
    (bp_systolic is null) = (bp_diastolic is null) and (bp_systolic is null or bp_systolic > bp_diastolic)
  )
);

create index postnatal_visits_delivery_idx on public.postnatal_visits (delivery_id, visit_date);

create trigger postnatal_visits_touch before update on public.postnatal_visits
  for each row execute function private.touch_updated_at();

create or replace function private.postnatal_visit_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_del public.deliveries;
begin
  select * into v_del from public.deliveries where id = new.delivery_id;
  if v_del.patient_id is distinct from new.patient_id or v_del.pregnancy_id <> new.pregnancy_id then
    raise exception 'Postnatal visit must match its delivery' using errcode = '23514';
  end if;
  if new.visit_date < v_del.delivered_at::date then
    raise exception 'Postnatal visit cannot precede the delivery' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.delivery_id <> old.delivery_id or new.encounter_id <> old.encounter_id then
      raise exception 'Visit links are immutable' using errcode = '42501';
    end if;
    if not private.is_server_context()
       and private.encounter_status(old.encounter_id) in ('signed', 'amended') then
      raise exception 'This visit is signed; record an amendment instead' using errcode = '42501';
    end if;
  elsif not private.is_server_context() then
    new.created_by := auth.uid();
  end if;
  new.days_postpartum := new.visit_date - v_del.delivered_at::date;
  return new;
end;
$$;

create trigger postnatal_visits_rules before insert or update on public.postnatal_visits
  for each row execute function private.postnatal_visit_rules();

create or replace function public.record_postnatal_visit(
  p_delivery_id  uuid,
  p_visit        jsonb,
  p_encounter    jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_del    public.deliveries;
  v_clinic uuid;
  v_date   date := coalesce((p_visit ->> 'visit_date')::date, current_date);
  v_enc    uuid;
  v_id     uuid;
  v_row    public.postnatal_visits;
begin
  select * into v_del from public.deliveries where id = p_delivery_id;
  if not found then
    raise exception 'Delivery not found' using errcode = 'P0002';
  end if;
  if v_date > current_date then
    raise exception 'Visit date cannot be in the future' using errcode = '22023';
  end if;
  v_clinic := coalesce(nullif(p_encounter ->> 'clinic_id', '')::uuid, v_del.clinic_id);

  insert into public.encounters
    (patient_id, clinic_id, specialty, encounter_type, encounter_at, is_private, chief_complaint, assessment, plan)
  values
    (v_del.patient_id, v_clinic, 'obstetrics', 'postnatal_visit',
     case when v_date = current_date then now() else v_date::timestamptz end,
     coalesce((p_encounter ->> 'is_private')::boolean, false),
     p_encounter ->> 'chief_complaint', p_encounter ->> 'assessment', p_encounter ->> 'plan')
  returning id into v_enc;

  v_row := jsonb_populate_record(null::public.postnatal_visits, p_visit);
  insert into public.postnatal_visits
    (delivery_id, pregnancy_id, patient_id, clinic_id, encounter_id, visit_date, bp_systolic, bp_diastolic, pulse,
     temperature_c, uterus, lochia, wound, breastfeeding, breasts, epds_score, epds_self_harm, hemoglobin_g_dl,
     contraception, notes)
  values
    (v_del.id, v_del.pregnancy_id, v_del.patient_id, v_clinic, v_enc, v_date, v_row.bp_systolic, v_row.bp_diastolic,
     v_row.pulse, v_row.temperature_c, v_row.uterus, v_row.lochia, v_row.wound, v_row.breastfeeding, v_row.breasts,
     v_row.epds_score, v_row.epds_self_harm, v_row.hemoglobin_g_dl, v_row.contraception, v_row.notes)
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Labour observations (partogram). Append-only: an entry can only be flagged
-- "entered in error", never edited or deleted.
-- ---------------------------------------------------------------------------
create table public.labour_observations (
  id                      uuid primary key default gen_random_uuid(),
  pregnancy_id            uuid not null references public.pregnancies (id),
  patient_id              uuid not null references public.patients (id),
  clinic_id               uuid not null references public.clinics (id),
  observed_at             timestamptz not null default now(),
  cervical_dilation_cm    numeric(3, 1) check (cervical_dilation_cm between 0 and 10),
  descent_fifths          smallint check (descent_fifths between 0 and 5),
  contractions_per_10min  smallint check (contractions_per_10min between 0 and 8),
  contraction_duration_s  smallint check (contraction_duration_s between 0 and 180),
  fhr                     smallint check (fhr between 50 and 240),
  liquor                  text check (liquor in ('intact', 'clear', 'meconium_light', 'meconium_thick', 'blood_stained', 'absent')),
  moulding                smallint check (moulding between 0 and 3),
  bp_systolic             smallint check (bp_systolic between 50 and 260),
  bp_diastolic            smallint check (bp_diastolic between 30 and 180),
  pulse                   smallint check (pulse between 30 and 220),
  temperature_c           numeric(3, 1) check (temperature_c between 34 and 43),
  oxytocin_mu_min         numeric(4, 1) check (oxytocin_mu_min between 0 and 40),
  notes                   text,
  entered_in_error        boolean not null default false,
  recorded_by             uuid references public.profiles (id) default auth.uid(),
  created_at              timestamptz not null default now(),
  constraint labour_bp_pair check (
    (bp_systolic is null) = (bp_diastolic is null) and (bp_systolic is null or bp_systolic > bp_diastolic)
  )
);

create index labour_observations_pregnancy_idx on public.labour_observations (pregnancy_id, observed_at);

create or replace function private.labour_observation_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_preg public.pregnancies;
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'entered_in_error') <> (to_jsonb(old) - 'entered_in_error') then
      raise exception 'Labour observations are append-only; mark the entry as entered in error and add a new one'
        using errcode = '42501';
    end if;
    return new;
  end if;
  select * into v_preg from public.pregnancies where id = new.pregnancy_id;
  if v_preg.patient_id is distinct from new.patient_id then
    raise exception 'Observation patient does not match the pregnancy' using errcode = '23514';
  end if;
  if v_preg.status <> 'active' then
    raise exception 'Labour observations require an ongoing pregnancy' using errcode = '23514';
  end if;
  if private.pregnancy_ga_days(v_preg.id, new.observed_at::date) < 140 then
    raise exception 'Labour observations require GA of at least 20 weeks' using errcode = '23514';
  end if;
  if new.observed_at > now() + interval '5 minutes' then
    raise exception 'Observation time cannot be in the future' using errcode = '22023';
  end if;
  if not private.is_server_context() then
    new.recorded_by := auth.uid();
    new.entered_in_error := false;
  end if;
  return new;
end;
$$;

create trigger labour_observations_rules before insert or update on public.labour_observations
  for each row execute function private.labour_observation_rules();

-- ---------------------------------------------------------------------------
-- RLS, grants, audit
-- ---------------------------------------------------------------------------
alter table public.fetal_biometry      enable row level security;
alter table public.postnatal_visits    enable row level security;
alter table public.labour_observations enable row level security;

revoke all on public.fetal_biometry, public.postnatal_visits, public.labour_observations from anon;
grant select, insert, update on public.fetal_biometry, public.postnatal_visits, public.labour_observations to authenticated;

create policy fetal_biometry_select on public.fetal_biometry
  for select to authenticated using (private.can(patient_id, 'clinical.read'));
create policy fetal_biometry_insert on public.fetal_biometry
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy fetal_biometry_update on public.fetal_biometry
  for update to authenticated
  using (private.can(patient_id, 'clinical.write')) with check (private.can(patient_id, 'clinical.write'));

create policy postnatal_visits_select on public.postnatal_visits
  for select to authenticated
  using (private.can(patient_id, 'clinical.read') and exists (select 1 from public.encounters e where e.id = encounter_id));
create policy postnatal_visits_insert on public.postnatal_visits
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy postnatal_visits_update on public.postnatal_visits
  for update to authenticated
  using (private.can(patient_id, 'clinical.write') and exists (select 1 from public.encounters e where e.id = encounter_id))
  with check (private.can(patient_id, 'clinical.write'));

create policy labour_observations_select on public.labour_observations
  for select to authenticated using (private.can(patient_id, 'clinical.read'));
create policy labour_observations_insert on public.labour_observations
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy labour_observations_update on public.labour_observations
  for update to authenticated
  using (private.can(patient_id, 'clinical.write')) with check (private.can(patient_id, 'clinical.write'));

create trigger fetal_biometry_audit after insert or update or delete on public.fetal_biometry
  for each row execute function private.audit_row_change();
create trigger postnatal_visits_audit after insert or update or delete on public.postnatal_visits
  for each row execute function private.audit_row_change();
create trigger labour_observations_audit after insert or update or delete on public.labour_observations
  for each row execute function private.audit_row_change();

revoke execute on function public.record_fetal_scan(uuid, jsonb, jsonb), public.record_postnatal_visit(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.record_fetal_scan(uuid, jsonb, jsonb), public.record_postnatal_visit(uuid, jsonb, jsonb),
  public.record_antenatal_visit(uuid, jsonb, jsonb)
  to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- =============================================================================
-- 0007  Obstetrics module: dating, antenatal visits, delivery & newborn records
-- =============================================================================
-- Design
--   * An antenatal visit = one `encounters` row (narrative, provider, private
--     flag, draft → signed → amended lifecycle) + one `antenatal_visits` row
--     (typed vitals for flow sheets, charts and research). Both are created
--     atomically by record_antenatal_visit(). The visit row inherits the
--     encounter's visibility and becomes read-only once the encounter is signed.
--   * Gestational age at visit / delivery is computed by the database from the
--     pregnancy's dating, so stored GA is always consistent with the EDD.
--   * Risk factors on pregnancies are coded (see src/clinical/obstetricRisk.ts).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Pregnancy dating & booking fields
-- ---------------------------------------------------------------------------
alter table public.pregnancies
  add column cycle_length_days  smallint not null default 28 check (cycle_length_days between 20 and 45),
  add column us_dating_date     date,
  add column us_dating_ga_days  smallint check (us_dating_ga_days between 35 and 200),
  add column transfer_date      date,
  add column embryo_age_days    smallint check (embryo_age_days in (3, 5, 6)),
  add column booking_date       date,
  add column booking_weight_kg  numeric(5, 1) check (booking_weight_kg between 25 and 300),
  add column height_cm          numeric(4, 1) check (height_cm between 100 and 230),
  add constraint pregnancies_gpal_consistent check (
    gravida is null or coalesce(para, 0) + coalesce(abortus, 0) <= gravida
  ),
  add constraint pregnancies_active_is_dated check (
    status <> 'active' or lmp is not null or edd is not null
  ),
  add constraint pregnancies_us_dating_pair check (
    (us_dating_date is null) = (us_dating_ga_days is null)
  ),
  add constraint pregnancies_transfer_pair check (
    transfer_date is null or embryo_age_days is not null
  );

-- One ongoing pregnancy per patient.
create unique index pregnancies_one_active_per_patient
  on public.pregnancies (patient_id) where status = 'active';

-- Registering a pregnancy tags the patient with the obstetrics specialty, so
-- she appears in specialty lists without a separate demographics edit.
create or replace function private.pregnancy_tag_patient()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.patients
     set specialties = array_append(specialties, 'obstetrics'::public.specialty)
   where id = new.patient_id and not ('obstetrics' = any (specialties));
  return new;
end;
$$;

create trigger pregnancies_tag_patient after insert on public.pregnancies
  for each row execute function private.pregnancy_tag_patient();

-- GA (days) of a pregnancy on a given date: EDD-based when available (final
-- dating), otherwise LMP adjusted for cycle length.
create or replace function private.pregnancy_ga_days(p_pregnancy uuid, p_on date)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when g.edd is not null then (280 - (g.edd - p_on))::smallint
    when g.lmp is not null then ((p_on - g.lmp) - (g.cycle_length_days - 28))::smallint
  end
  from public.pregnancies g
  where g.id = p_pregnancy;
$$;

create or replace function private.encounter_status(p_encounter uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select status from public.encounters where id = p_encounter;
$$;

-- ---------------------------------------------------------------------------
-- Antenatal visits (flow sheet)
-- ---------------------------------------------------------------------------
create table public.antenatal_visits (
  id                 uuid primary key default gen_random_uuid(),
  pregnancy_id       uuid not null references public.pregnancies (id),
  patient_id         uuid not null references public.patients (id),
  clinic_id          uuid not null references public.clinics (id),
  encounter_id       uuid not null unique references public.encounters (id),
  visit_date         date not null default current_date,
  ga_days            smallint check (ga_days between 0 and 315),
  weight_kg          numeric(5, 1) check (weight_kg between 25 and 300),
  bp_systolic        smallint check (bp_systolic between 50 and 260),
  bp_diastolic       smallint check (bp_diastolic between 30 and 180),
  pulse              smallint check (pulse between 30 and 220),
  urine_protein      text check (urine_protein in ('negative', 'trace', '1+', '2+', '3+', '4+')),
  urine_glucose      text check (urine_glucose in ('negative', 'trace', '1+', '2+', '3+', '4+')),
  fundal_height_cm   numeric(4, 1) check (fundal_height_cm between 5 and 50),
  fetal_heart_rate   smallint check (fetal_heart_rate between 60 and 240),
  presentation       text check (presentation in ('cephalic', 'breech', 'transverse', 'oblique', 'unstable', 'not_assessed')),
  fetal_movements    text check (fetal_movements in ('normal', 'reduced', 'absent', 'not_assessed')),
  edema              text check (edema in ('none', 'mild', 'moderate', 'severe')),
  hemoglobin_g_dl    numeric(4, 1) check (hemoglobin_g_dl between 3 and 20),
  notes              text,
  created_by         uuid references public.profiles (id) default auth.uid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint antenatal_bp_pair check (
    (bp_systolic is null) = (bp_diastolic is null)
    and (bp_systolic is null or bp_systolic > bp_diastolic)
  )
);

create index antenatal_visits_pregnancy_idx on public.antenatal_visits (pregnancy_id, visit_date);
create index antenatal_visits_patient_idx on public.antenatal_visits (patient_id);

create trigger antenatal_visits_touch before update on public.antenatal_visits
  for each row execute function private.touch_updated_at();

create or replace function private.antenatal_visit_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_preg_patient uuid;
  v_enc_patient  uuid;
  v_enc_spec     public.specialty;
begin
  select patient_id into v_preg_patient from public.pregnancies where id = new.pregnancy_id;
  if v_preg_patient is distinct from new.patient_id then
    raise exception 'Visit patient does not match the pregnancy' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if new.pregnancy_id <> old.pregnancy_id or new.encounter_id <> old.encounter_id
       or new.patient_id <> old.patient_id then
      raise exception 'Visit links are immutable' using errcode = '42501';
    end if;
    if not private.is_server_context()
       and private.encounter_status(old.encounter_id) in ('signed', 'amended') then
      raise exception 'This visit is signed; record an amendment instead' using errcode = '42501';
    end if;
  else
    -- encounter must belong to the same patient and be obstetric
    select e.patient_id, e.specialty into v_enc_patient, v_enc_spec
    from public.encounters e where e.id = new.encounter_id;
    if v_enc_patient is distinct from new.patient_id or v_enc_spec <> 'obstetrics' then
      raise exception 'Visit must link to an obstetric encounter of the same patient' using errcode = '23514';
    end if;
    if not private.is_server_context() then
      new.created_by := auth.uid();
    end if;
  end if;

  new.ga_days := private.pregnancy_ga_days(new.pregnancy_id, new.visit_date);
  return new;
end;
$$;

create trigger antenatal_visits_rules before insert or update on public.antenatal_visits
  for each row execute function private.antenatal_visit_rules();

-- ---------------------------------------------------------------------------
-- Labour & delivery, newborns
-- ---------------------------------------------------------------------------
create table public.deliveries (
  id              uuid primary key default gen_random_uuid(),
  pregnancy_id    uuid not null unique references public.pregnancies (id),
  patient_id      uuid not null references public.patients (id),
  clinic_id       uuid not null references public.clinics (id),
  delivered_at    timestamptz not null,
  ga_days         smallint check (ga_days between 140 and 315),
  onset           text not null check (onset in ('spontaneous', 'induced', 'prelabour_cs')),
  mode            text not null check (mode in ('svd', 'vacuum', 'forceps', 'vaginal_breech', 'cs_elective', 'cs_emergency')),
  indication      text,
  anesthesia      text check (anesthesia in ('none', 'epidural', 'spinal', 'combined_spinal_epidural', 'general', 'local')),
  blood_loss_ml   integer check (blood_loss_ml between 0 and 20000),
  perineum        text check (perineum in ('intact', 'first_degree', 'second_degree', 'third_degree', 'fourth_degree', 'episiotomy', 'not_applicable')),
  complications   text[] not null default '{}',
  notes           text,
  recorded_by     uuid references public.profiles (id) default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint deliveries_prelabour_cs check (onset <> 'prelabour_cs' or mode in ('cs_elective', 'cs_emergency'))
);

create trigger deliveries_touch before update on public.deliveries
  for each row execute function private.touch_updated_at();

create table public.newborns (
  id              uuid primary key default gen_random_uuid(),
  delivery_id     uuid not null references public.deliveries (id) on delete cascade,
  patient_id      uuid not null references public.patients (id),   -- the mother
  clinic_id       uuid not null references public.clinics (id),
  birth_order     smallint not null default 1 check (birth_order between 1 and 8),
  sex             text check (sex in ('female', 'male', 'undetermined')),
  birth_weight_g  integer check (birth_weight_g between 200 and 7000),
  apgar_1         smallint check (apgar_1 between 0 and 10),
  apgar_5         smallint check (apgar_5 between 0 and 10),
  outcome         text not null default 'live_birth' check (outcome in ('live_birth', 'stillbirth', 'neonatal_death')),
  nicu_admission  boolean not null default false,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (delivery_id, birth_order)
);

create trigger newborns_touch before update on public.newborns
  for each row execute function private.touch_updated_at();

create or replace function private.delivery_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_patient uuid;
  v_status  text;
begin
  select patient_id, status into v_patient, v_status from public.pregnancies where id = new.pregnancy_id;
  if v_patient is distinct from new.patient_id then
    raise exception 'Delivery patient does not match the pregnancy' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if v_status <> 'active' then
      raise exception 'Only an ongoing pregnancy can be delivered' using errcode = '23514';
    end if;
    if not private.is_server_context() then
      new.recorded_by := auth.uid();
    end if;
  elsif new.pregnancy_id <> old.pregnancy_id or new.patient_id <> old.patient_id then
    raise exception 'Delivery links are immutable' using errcode = '42501';
  end if;
  new.ga_days := private.pregnancy_ga_days(new.pregnancy_id, new.delivered_at::date);
  return new;
end;
$$;

create trigger deliveries_rules before insert or update on public.deliveries
  for each row execute function private.delivery_rules();

-- Close the pregnancy when its delivery is recorded.
create or replace function private.delivery_close_pregnancy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.pregnancies
     set status = 'delivered', outcome_date = new.delivered_at::date
   where id = new.pregnancy_id;
  return new;
end;
$$;

create trigger deliveries_close_pregnancy after insert on public.deliveries
  for each row execute function private.delivery_close_pregnancy();

create or replace function private.newborn_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.deliveries d where d.id = new.delivery_id and d.patient_id = new.patient_id
  ) then
    raise exception 'Newborn must belong to a delivery of the same mother' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger newborns_rules before insert or update on public.newborns
  for each row execute function private.newborn_rules();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.antenatal_visits enable row level security;
alter table public.deliveries       enable row level security;
alter table public.newborns         enable row level security;

revoke all on public.antenatal_visits, public.deliveries, public.newborns from anon;
grant select, insert, update on public.antenatal_visits, public.deliveries, public.newborns to authenticated;

-- A visit is visible only if its encounter is (inherits private-note rules).
create policy antenatal_visits_select on public.antenatal_visits
  for select to authenticated
  using (
    private.can(patient_id, 'clinical.read')
    and exists (select 1 from public.encounters e where e.id = encounter_id)
  );
create policy antenatal_visits_insert on public.antenatal_visits
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy antenatal_visits_update on public.antenatal_visits
  for update to authenticated
  using (
    private.can(patient_id, 'clinical.write')
    and exists (select 1 from public.encounters e where e.id = encounter_id)
  )
  with check (private.can(patient_id, 'clinical.write'));

create policy deliveries_select on public.deliveries
  for select to authenticated using (private.can(patient_id, 'clinical.read'));
create policy deliveries_insert on public.deliveries
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy deliveries_update on public.deliveries
  for update to authenticated
  using (private.can(patient_id, 'clinical.write'))
  with check (private.can(patient_id, 'clinical.write'));

create policy newborns_select on public.newborns
  for select to authenticated using (private.can(patient_id, 'clinical.read'));
create policy newborns_insert on public.newborns
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy newborns_update on public.newborns
  for update to authenticated
  using (private.can(patient_id, 'clinical.write'))
  with check (private.can(patient_id, 'clinical.write'));

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------
create trigger antenatal_visits_audit after insert or update or delete on public.antenatal_visits
  for each row execute function private.audit_row_change();
create trigger deliveries_audit after insert or update or delete on public.deliveries
  for each row execute function private.audit_row_change();
create trigger newborns_audit after insert or update or delete on public.newborns
  for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- RPC: record an antenatal visit atomically (encounter + vitals)
-- SECURITY INVOKER: every insert is checked by the caller's RLS.
-- ---------------------------------------------------------------------------
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
    (patient_id, clinic_id, specialty, encounter_type, encounter_at, is_private,
     chief_complaint, assessment, plan)
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
     fetal_movements, edema, hemoglobin_g_dl, notes)
  values
    (v_preg.id, v_preg.patient_id, v_clinic, v_encounter, v_date, v_row.weight_kg, v_row.bp_systolic,
     v_row.bp_diastolic, v_row.pulse, v_row.urine_protein, v_row.urine_glucose, v_row.fundal_height_cm,
     v_row.fetal_heart_rate, v_row.presentation, v_row.fetal_movements, v_row.edema,
     v_row.hemoglobin_g_dl, v_row.notes)
  returning id into v_visit;

  return v_visit;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: record a delivery and its newborn(s) atomically
-- ---------------------------------------------------------------------------
create or replace function public.record_delivery(
  p_pregnancy_id  uuid,
  p_delivery      jsonb,
  p_newborns      jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_preg      public.pregnancies;
  v_clinic    uuid;
  v_del       public.deliveries;
  v_id        uuid;
  v_baby      jsonb;
  v_nb        public.newborns;
  v_order     smallint := 0;
begin
  select * into v_preg from public.pregnancies where id = p_pregnancy_id;
  if not found then
    raise exception 'Pregnancy not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_newborns) <> 'array' or jsonb_array_length(p_newborns) = 0 then
    raise exception 'At least one newborn record is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_newborns) <> v_preg.plurality then
    raise exception 'Number of newborns (%) does not match plurality (%)',
      jsonb_array_length(p_newborns), v_preg.plurality using errcode = '22023';
  end if;
  v_clinic := coalesce(nullif(p_delivery ->> 'clinic_id', '')::uuid, v_preg.clinic_id);
  v_del := jsonb_populate_record(null::public.deliveries, p_delivery);
  if v_del.delivered_at > now() then
    raise exception 'Delivery time cannot be in the future' using errcode = '22023';
  end if;

  insert into public.deliveries
    (pregnancy_id, patient_id, clinic_id, delivered_at, onset, mode, indication, anesthesia,
     blood_loss_ml, perineum, complications, notes)
  values
    (v_preg.id, v_preg.patient_id, v_clinic, v_del.delivered_at, v_del.onset, v_del.mode, v_del.indication,
     v_del.anesthesia, v_del.blood_loss_ml, v_del.perineum, coalesce(v_del.complications, '{}'), v_del.notes)
  returning id into v_id;

  for v_baby in select * from jsonb_array_elements(p_newborns) loop
    v_order := v_order + 1;
    v_nb := jsonb_populate_record(null::public.newborns, v_baby);
    insert into public.newborns
      (delivery_id, patient_id, clinic_id, birth_order, sex, birth_weight_g, apgar_1, apgar_5,
       outcome, nicu_admission, notes)
    values
      (v_id, v_preg.patient_id, v_clinic, v_order, v_nb.sex, v_nb.birth_weight_g, v_nb.apgar_1, v_nb.apgar_5,
       coalesce(v_nb.outcome, 'live_birth'), coalesce(v_nb.nicu_admission, false), v_nb.notes);
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Obstetric worklist (SECURITY INVOKER view → every row respects RLS)
-- ---------------------------------------------------------------------------
create view public.obstetric_worklist
with (security_invoker = true)
as
select
  g.id                 as pregnancy_id,
  g.patient_id,
  g.clinic_id,
  g.lmp,
  g.edd,
  g.edd_basis,
  g.cycle_length_days,
  g.risk_level,
  g.risk_factors,
  g.plurality,
  g.gravida,
  g.para,
  g.conception,
  p.mrn,
  p.first_name_en,
  p.last_name_en,
  p.first_name_ar,
  p.last_name_ar,
  p.date_of_birth,
  p.rh_factor,
  v.visit_date         as last_visit_date,
  v.bp_systolic        as last_bp_systolic,
  v.bp_diastolic       as last_bp_diastolic,
  v.urine_protein      as last_urine_protein,
  v.fetal_movements    as last_fetal_movements,
  (select count(*) from public.antenatal_visits x where x.pregnancy_id = g.id) as visit_count
from public.pregnancies g
join public.patients p on p.id = g.patient_id and p.deleted_at is null
left join lateral (
  select a.* from public.antenatal_visits a
  where a.pregnancy_id = g.id
  order by a.visit_date desc, a.created_at desc
  limit 1
) v on true
where g.status = 'active';

revoke all on public.obstetric_worklist from anon;
grant select on public.obstetric_worklist to authenticated;

revoke execute on function public.record_antenatal_visit(uuid, jsonb, jsonb), public.record_delivery(uuid, jsonb, jsonb)
  from public, anon;
grant execute on function public.record_antenatal_visit(uuid, jsonb, jsonb), public.record_delivery(uuid, jsonb, jsonb)
  to authenticated;
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

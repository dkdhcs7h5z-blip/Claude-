-- =============================================================================
-- 0010  Gynecology, extended: lab results (shared), menopause (MRS),
--       urogynecology (ICIQ-UI SF), ovarian-mass risk fields (O-RADS, RMI)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Lab results — generic, reusable by every specialty. Each value is stored
-- with the reporting laboratory's reference range (ranges differ per lab).
-- ---------------------------------------------------------------------------
create table public.lab_results (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id),
  clinic_id     uuid not null references public.clinics (id),
  collected_at  date not null,
  test_code     text not null check (test_code in (
                  'fsh', 'lh', 'estradiol', 'progesterone', 'amh', 'prolactin', 'tsh', 'free_t4', 'testosterone', 'shbg',
                  'dheas', 'oh17_progesterone', 'hba1c', 'fasting_glucose', 'ca125', 'he4', 'hemoglobin', 'ferritin',
                  'beta_hcg', 'vitamin_d')),
  value         numeric(12, 3) not null check (value >= 0),
  unit          text not null check (length(unit) between 1 and 20),
  ref_low       numeric(12, 3),
  ref_high      numeric(12, 3),
  cycle_day     smallint check (cycle_day between 1 and 60),
  notes         text,
  recorded_by   uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint lab_ref_order check (ref_low is null or ref_high is null or ref_low <= ref_high),
  constraint lab_not_future check (collected_at <= current_date)
);

create index lab_results_patient_idx on public.lab_results (patient_id, collected_at, test_code);

create trigger lab_results_touch before update on public.lab_results
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Menopause Rating Scale (Heinemann et al.) — 11 items scored 0–4.
-- Subscales: somatic 1,2,3,11 · psychological 4,5,6,7 · urogenital 8,9,10.
-- ---------------------------------------------------------------------------
create table public.menopause_assessments (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id),
  clinic_id      uuid not null references public.clinics (id),
  assessed_at    date not null default current_date,
  items          smallint[] not null check (cardinality(items) = 11 and 0 <= all (items) and 4 >= all (items)),
  total          smallint,
  somatic        smallint,
  psychological  smallint,
  urogenital     smallint,
  notes          text,
  recorded_by    uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  constraint mrs_not_future check (assessed_at <= current_date)
);

create or replace function private.mrs_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.somatic := new.items[1] + new.items[2] + new.items[3] + new.items[11];
  new.psychological := new.items[4] + new.items[5] + new.items[6] + new.items[7];
  new.urogenital := new.items[8] + new.items[9] + new.items[10];
  new.total := new.somatic + new.psychological + new.urogenital;
  return new;
end;
$$;

create trigger menopause_assessments_score before insert or update on public.menopause_assessments
  for each row execute function private.mrs_score();

-- ---------------------------------------------------------------------------
-- ICIQ-UI Short Form — frequency 0–5, amount 0/2/4/6, interference 0–10;
-- score 0–21; Q6 leak situations are self-diagnostic (unscored).
-- ---------------------------------------------------------------------------
create table public.urogyn_assessments (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id),
  clinic_id        uuid not null references public.clinics (id),
  assessed_at      date not null default current_date,
  frequency        smallint not null check (frequency between 0 and 5),
  amount           smallint not null check (amount in (0, 2, 4, 6)),
  interference     smallint not null check (interference between 0 and 10),
  score            smallint,
  leak_situations  text[] not null default '{}' check (leak_situations <@ array[
                     'never', 'before_toilet', 'cough_sneeze', 'asleep', 'physical_activity', 'after_voiding',
                     'no_reason', 'all_the_time']),
  notes            text,
  recorded_by      uuid references public.profiles (id) default auth.uid(),
  created_at       timestamptz not null default now(),
  constraint iciq_not_future check (assessed_at <= current_date)
);

create or replace function private.iciq_score()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.score := new.frequency + new.amount + new.interference;
  return new;
end;
$$;

create trigger urogyn_assessments_score before insert or update on public.urogyn_assessments
  for each row execute function private.iciq_score();

-- ---------------------------------------------------------------------------
-- Ovarian-mass risk fields on pelvic ultrasound
--   orads_category  clinician-assigned ACR O-RADS US category (0–5)
--   rmi_features    RMI ultrasound features (Jacobs 1990)
-- ---------------------------------------------------------------------------
alter table public.gyn_ultrasounds
  add column orads_category smallint check (orads_category between 0 and 5),
  add column rmi_features text[] not null default '{}' check (rmi_features <@ array[
    'multilocular', 'solid_areas', 'bilateral', 'ascites', 'metastases']);

alter table public.gyn_ultrasounds drop constraint gyn_us_mass_fields;
alter table public.gyn_ultrasounds add constraint gyn_us_mass_fields check (
  adnexal_mass or (mass_side is null and mass_max_diameter_mm is null and orads_category is null
                   and cardinality(iota_b_features) = 0 and cardinality(iota_m_features) = 0 and cardinality(rmi_features) = 0)
);

-- ---------------------------------------------------------------------------
-- Author stamping, immutable patient link, RLS, audit
-- ---------------------------------------------------------------------------
create or replace function private.gyn_ext_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.patient_id <> old.patient_id then
      raise exception 'Record patient is immutable' using errcode = '42501';
    end if;
    return new;
  end if;
  if not private.is_server_context() then
    new := jsonb_populate_record(new, jsonb_build_object('recorded_by', auth.uid()));
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['lab_results', 'menopause_assessments', 'urogyn_assessments'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function private.gyn_ext_rules()', t || '_rules', t);
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

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

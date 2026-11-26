-- =============================================================================
-- 0002  Patients, access grants, clinical core tables, documents
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------
create table public.patients (
  id                       uuid primary key default gen_random_uuid(),
  clinic_id                uuid not null references public.clinics (id),
  mrn                      text not null,
  first_name_en            text,
  last_name_en             text,
  first_name_ar            text,
  last_name_ar             text,
  date_of_birth            date not null check (date_of_birth > '1900-01-01' and date_of_birth <= current_date),
  national_id              text,
  phone                    text,
  email                    text,
  address                  text,
  nationality              text,
  marital_status           text check (marital_status in ('single', 'married', 'divorced', 'widowed')),
  blood_group              text check (blood_group in ('A', 'B', 'AB', 'O')),
  rh_factor                text check (rh_factor in ('positive', 'negative')),
  emergency_contact_name   text,
  emergency_contact_phone  text,
  specialties              public.specialty[] not null default '{}',
  visibility               public.record_visibility not null default 'clinic',
  primary_physician_id     uuid references public.profiles (id),
  research_consent         boolean not null default false,
  research_consent_at      timestamptz,
  notes                    text,
  created_by               uuid references public.profiles (id) default auth.uid(),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  deleted_at               timestamptz,
  deleted_by               uuid references public.profiles (id),
  unique (clinic_id, mrn),
  constraint patients_name_required check (
    coalesce(first_name_en, first_name_ar) is not null
    and coalesce(last_name_en, last_name_ar) is not null
  ),
  constraint patients_private_has_physician check (
    visibility <> 'private' or primary_physician_id is not null
  ),
  constraint patients_consent_date check (not research_consent or research_consent_at is not null)
);

create index patients_clinic_idx on public.patients (clinic_id) where deleted_at is null;
create index patients_primary_physician_idx on public.patients (primary_physician_id);
create index patients_search_idx on public.patients using gin (
  to_tsvector('simple',
    coalesce(mrn, '') || ' ' || coalesce(first_name_en, '') || ' ' || coalesce(last_name_en, '') || ' ' ||
    coalesce(first_name_ar, '') || ' ' || coalesce(last_name_ar, '') || ' ' || coalesce(phone, ''))
);

create trigger patients_touch before update on public.patients
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Patient access grants (sharing + break-glass emergency access)
-- ---------------------------------------------------------------------------
create table public.patient_access_grants (
  id                 uuid primary key default gen_random_uuid(),
  patient_id         uuid not null references public.patients (id) on delete cascade,
  grantee_user_id    uuid references public.profiles (id) on delete cascade,
  grantee_clinic_id  uuid references public.clinics (id) on delete cascade,
  access_level       public.access_level not null default 'read',
  reason             text,
  is_emergency       boolean not null default false,
  granted_by         uuid references public.profiles (id) default auth.uid(),
  granted_at         timestamptz not null default now(),
  expires_at         timestamptz,
  revoked_at         timestamptz,
  revoked_by         uuid references public.profiles (id),
  constraint grants_one_grantee check (num_nonnulls(grantee_user_id, grantee_clinic_id) = 1),
  constraint grants_emergency_rules check (
    not is_emergency
    or (reason is not null and expires_at is not null and grantee_user_id is not null and access_level = 'read')
  )
);

create index grants_patient_idx on public.patient_access_grants (patient_id) where revoked_at is null;
create index grants_user_idx on public.patient_access_grants (grantee_user_id) where revoked_at is null;
create index grants_clinic_idx on public.patient_access_grants (grantee_clinic_id) where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Encounters (visits / consultations across all four specialties)
-- ---------------------------------------------------------------------------
create table public.encounters (
  id               uuid primary key default gen_random_uuid(),
  patient_id       uuid not null references public.patients (id),
  clinic_id        uuid not null references public.clinics (id),
  specialty        public.specialty not null,
  encounter_type   text not null check (encounter_type in (
                     'consultation', 'follow_up', 'antenatal_visit', 'postnatal_visit', 'ultrasound',
                     'procedure', 'surgery', 'admission', 'teleconsultation', 'other')),
  encounter_at     timestamptz not null default now(),
  provider_id      uuid not null references public.profiles (id) default auth.uid(),
  is_private       boolean not null default false,   -- private physician note
  status           text not null default 'draft' check (status in ('draft', 'signed', 'amended')),
  chief_complaint  text,
  history          text,
  examination      text,
  assessment       text,
  plan             text,
  data             jsonb not null default '{}'::jsonb,  -- specialty-specific structured fields
  amends_id        uuid references public.encounters (id),
  signed_at        timestamptz,
  signed_by        uuid references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index encounters_patient_idx on public.encounters (patient_id, encounter_at desc);
create index encounters_clinic_idx on public.encounters (clinic_id, encounter_at desc);

create trigger encounters_touch before update on public.encounters
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Obstetrics: pregnancies
-- ---------------------------------------------------------------------------
create table public.pregnancies (
  id            uuid primary key default gen_random_uuid(),
  patient_id    uuid not null references public.patients (id),
  clinic_id     uuid not null references public.clinics (id),
  lmp           date,
  edd           date,
  edd_basis     text check (edd_basis in ('lmp', 'ultrasound', 'ivf_transfer')),
  gravida       smallint check (gravida between 0 and 30),
  para          smallint check (para between 0 and 30),
  abortus       smallint check (abortus between 0 and 30),
  living        smallint check (living between 0 and 30),
  conception    text check (conception in ('spontaneous', 'ovulation_induction', 'iui', 'ivf', 'icsi', 'other')),
  plurality     smallint not null default 1 check (plurality between 1 and 8),
  risk_level    text not null default 'low' check (risk_level in ('low', 'moderate', 'high')),
  risk_factors  text[] not null default '{}',
  status        text not null default 'active' check (status in (
                  'active', 'delivered', 'miscarriage', 'ectopic', 'termination', 'stillbirth')),
  outcome_date  date,
  notes         text,
  created_by    uuid references public.profiles (id) default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index pregnancies_patient_idx on public.pregnancies (patient_id);
create index pregnancies_active_idx on public.pregnancies (clinic_id) where status = 'active';

create trigger pregnancies_touch before update on public.pregnancies
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Infertility / reproductive medicine: treatment cycles
-- ---------------------------------------------------------------------------
create table public.fertility_cycles (
  id           uuid primary key default gen_random_uuid(),
  patient_id   uuid not null references public.patients (id),
  clinic_id    uuid not null references public.clinics (id),
  cycle_type   text not null check (cycle_type in (
                 'natural', 'ovulation_induction', 'iui', 'ivf', 'icsi', 'fet', 'oocyte_cryopreservation')),
  protocol     text,
  start_date   date not null,
  status       text not null default 'planned' check (status in (
                 'planned', 'stimulation', 'retrieval', 'transfer', 'luteal', 'completed', 'cancelled')),
  outcome      text check (outcome in ('positive_bhcg', 'negative_bhcg', 'clinical_pregnancy', 'cancelled', 'freeze_all')),
  data         jsonb not null default '{}'::jsonb,
  created_by   uuid references public.profiles (id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index fertility_cycles_patient_idx on public.fertility_cycles (patient_id);

create trigger fertility_cycles_touch before update on public.fertility_cycles
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Fetal medicine: assessments (scans, invasive & non-invasive testing)
-- ---------------------------------------------------------------------------
create table public.fetal_assessments (
  id                    uuid primary key default gen_random_uuid(),
  patient_id            uuid not null references public.patients (id),
  pregnancy_id          uuid references public.pregnancies (id),
  clinic_id             uuid not null references public.clinics (id),
  encounter_id          uuid references public.encounters (id),
  assessment_type       text not null check (assessment_type in (
                          'dating_scan', 'nt_scan', 'anomaly_scan', 'growth_scan', 'doppler', 'fetal_echo',
                          'nipt', 'cvs', 'amniocentesis', 'other')),
  performed_at          timestamptz not null default now(),
  gestational_age_days  smallint check (gestational_age_days between 0 and 315),
  fetus_number          smallint not null default 1 check (fetus_number between 1 and 8),
  findings              jsonb not null default '{}'::jsonb,
  impression            text,
  performed_by          uuid references public.profiles (id) default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index fetal_assessments_patient_idx on public.fetal_assessments (patient_id);

create trigger fetal_assessments_touch before update on public.fetal_assessments
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Documents (metadata; the binary lives in the private storage bucket)
-- Storage path convention: {clinic_id}/{patient_id}/{uuid}-{sanitized-filename}
-- ---------------------------------------------------------------------------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  patient_id     uuid not null references public.patients (id),
  clinic_id      uuid not null references public.clinics (id),
  encounter_id   uuid references public.encounters (id),
  storage_path   text not null unique,
  file_name      text not null,
  mime_type      text not null,
  size_bytes     bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  category       text not null default 'other' check (category in (
                   'lab_result', 'imaging', 'ultrasound', 'consent', 'referral', 'report',
                   'prescription', 'id_document', 'other')),
  sha256         text check (sha256 ~ '^[a-f0-9]{64}$'),
  description    text,
  is_private     boolean not null default false,
  uploaded_by    uuid not null references public.profiles (id) default auth.uid(),
  uploaded_at    timestamptz not null default now(),
  deleted_at     timestamptz,
  deleted_by     uuid references public.profiles (id),
  constraint documents_path_matches check (
    storage_path like (clinic_id::text || '/' || patient_id::text || '/%')
  )
);

create index documents_patient_idx on public.documents (patient_id) where deleted_at is null;

-- =============================================================================
-- 0001  Core identity: enums, clinics, profiles, memberships, permission catalog
-- =============================================================================
-- Women's Health & Reproductive Medicine Intelligence System
--
-- Design notes
--   * One centralized database; access is decided per row by RLS using
--     (a) the user's clinic memberships and role, (b) the role→permission
--     matrix below, and (c) patient-level authorization (visibility + grants).
--   * Roles are assigned PER CLINIC (clinic_memberships.role). The only global
--     role is Super Administrator (profiles.is_super_admin).
--   * Helper functions used by policies live in the non-exposed `private`
--     schema so PostgREST cannot call them as RPCs.
-- =============================================================================

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',
  'clinic_admin',
  'consultant',
  'specialist',
  'resident',
  'nurse',
  'researcher',
  'read_only'
);

create type public.specialty as enum (
  'obstetrics',
  'gynecology',
  'infertility',
  'fetal_medicine'
);

-- clinic  : shared with members of the owning clinic who hold the permission
-- private : physician's private record; only the primary physician and users
--           holding an explicit grant can see it
create type public.record_visibility as enum ('clinic', 'private');

create type public.access_level as enum ('read', 'write');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Clinics
-- ---------------------------------------------------------------------------
create table public.clinics (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9_-]{2,20}$'),
  name_en     text not null,
  name_ar     text not null,
  address     text,
  phone       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger clinics_touch before update on public.clinics
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  email               text,
  full_name_en        text,
  full_name_ar        text,
  title               text,                     -- e.g. "Dr.", "Prof."
  license_number      text,
  primary_specialty   public.specialty,
  preferred_language  text not null default 'en' check (preferred_language in ('en', 'ar')),
  is_super_admin      boolean not null default false,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- Auto-create a profile when a user signs up.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name_en, full_name_ar, preferred_language)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name_en',
    new.raw_user_meta_data ->> 'full_name_ar',
    coalesce(nullif(new.raw_user_meta_data ->> 'preferred_language', ''), 'en')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Clinic memberships: a user's role inside a clinic
-- ---------------------------------------------------------------------------
create table public.clinic_memberships (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  clinic_id   uuid not null references public.clinics (id) on delete cascade,
  role        public.app_role not null check (role <> 'super_admin'),
  is_active   boolean not null default true,
  granted_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, clinic_id)
);

create index clinic_memberships_clinic_idx on public.clinic_memberships (clinic_id);

create trigger clinic_memberships_touch before update on public.clinic_memberships
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Permission catalog and role → permission matrix
-- (mirrored in src/rbac/permissions.ts; a unit test keeps them in sync)
-- ---------------------------------------------------------------------------
create table public.permissions (
  code         text primary key check (code ~ '^[a-z]+\.[a-z]+$'),
  description  text not null
);

create table public.role_permissions (
  role        public.app_role not null,
  permission  text not null references public.permissions (code) on delete cascade,
  primary key (role, permission)
);

insert into public.permissions (code, description) values
  ('patient.read',    'View patient demographics and record header'),
  ('patient.create',  'Register new patients'),
  ('patient.update',  'Edit patient demographics'),
  ('patient.delete',  'Archive (soft-delete) patients'),
  ('patient.share',   'Grant / revoke access to a patient record'),
  ('clinical.read',   'View clinical data (encounters, pregnancies, cycles, scans)'),
  ('clinical.write',  'Create and edit clinical data'),
  ('clinical.sign',   'Sign / finalize clinical encounters'),
  ('document.read',   'View and download patient documents'),
  ('document.upload', 'Upload patient documents'),
  ('document.delete', 'Archive patient documents'),
  ('research.access', 'Access de-identified research cohorts of assigned projects'),
  ('research.manage', 'Create research projects and enroll consented patients'),
  ('research.export', 'Export de-identified research datasets'),
  ('admin.users',     'Manage users and role assignments in a clinic'),
  ('admin.clinic',    'Manage clinic settings'),
  ('audit.read',      'View audit logs');

-- BEGIN ROLE_PERMISSIONS (parsed by src/rbac/permissions.test.ts)
insert into public.role_permissions (role, permission) values
  -- Super Administrator: everything (global)
  ('super_admin', 'patient.read'), ('super_admin', 'patient.create'), ('super_admin', 'patient.update'),
  ('super_admin', 'patient.delete'), ('super_admin', 'patient.share'),
  ('super_admin', 'clinical.read'), ('super_admin', 'clinical.write'), ('super_admin', 'clinical.sign'),
  ('super_admin', 'document.read'), ('super_admin', 'document.upload'), ('super_admin', 'document.delete'),
  ('super_admin', 'research.access'), ('super_admin', 'research.manage'), ('super_admin', 'research.export'),
  ('super_admin', 'admin.users'), ('super_admin', 'admin.clinic'), ('super_admin', 'audit.read'),
  -- Clinic Administrator: registration + administration, NO clinical content
  ('clinic_admin', 'patient.read'), ('clinic_admin', 'patient.create'), ('clinic_admin', 'patient.update'),
  ('clinic_admin', 'patient.delete'), ('clinic_admin', 'patient.share'),
  ('clinic_admin', 'document.read'), ('clinic_admin', 'document.upload'),
  ('clinic_admin', 'admin.users'), ('clinic_admin', 'admin.clinic'), ('clinic_admin', 'audit.read'),
  -- Consultant
  ('consultant', 'patient.read'), ('consultant', 'patient.create'), ('consultant', 'patient.update'),
  ('consultant', 'patient.delete'), ('consultant', 'patient.share'),
  ('consultant', 'clinical.read'), ('consultant', 'clinical.write'), ('consultant', 'clinical.sign'),
  ('consultant', 'document.read'), ('consultant', 'document.upload'), ('consultant', 'document.delete'),
  ('consultant', 'research.access'), ('consultant', 'research.manage'), ('consultant', 'research.export'),
  -- Specialist
  ('specialist', 'patient.read'), ('specialist', 'patient.create'), ('specialist', 'patient.update'),
  ('specialist', 'patient.share'),
  ('specialist', 'clinical.read'), ('specialist', 'clinical.write'), ('specialist', 'clinical.sign'),
  ('specialist', 'document.read'), ('specialist', 'document.upload'), ('specialist', 'document.delete'),
  ('specialist', 'research.access'),
  -- Resident: clinical work, cannot sign
  ('resident', 'patient.read'), ('resident', 'patient.create'), ('resident', 'patient.update'),
  ('resident', 'clinical.read'), ('resident', 'clinical.write'),
  ('resident', 'document.read'), ('resident', 'document.upload'),
  -- Nurse
  ('nurse', 'patient.read'), ('nurse', 'patient.create'), ('nurse', 'patient.update'),
  ('nurse', 'clinical.read'), ('nurse', 'clinical.write'),
  ('nurse', 'document.read'), ('nurse', 'document.upload'),
  -- Researcher: de-identified research data only, no identifiable patient access
  ('researcher', 'research.access'), ('researcher', 'research.export'),
  -- Read-only
  ('read_only', 'patient.read'), ('read_only', 'clinical.read'), ('read_only', 'document.read');
-- END ROLE_PERMISSIONS

-- =============================================================================
-- 0003  Research management (de-identified access only)
-- =============================================================================

create table public.research_projects (
  id                         uuid primary key default gen_random_uuid(),
  title                      text not null,
  description                text,
  specialty                  public.specialty,
  irb_reference              text,
  irb_approved_at            date,
  irb_expires_at             date,
  status                     text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  principal_investigator_id  uuid not null references public.profiles (id) default auth.uid(),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint research_active_requires_irb check (
    status <> 'active' or (irb_reference is not null and irb_approved_at is not null)
  )
);

create trigger research_projects_touch before update on public.research_projects
  for each row execute function private.touch_updated_at();

create table public.research_project_members (
  project_id  uuid not null references public.research_projects (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        text not null default 'analyst' check (role in ('pi', 'investigator', 'analyst')),
  added_by    uuid references public.profiles (id) default auth.uid(),
  added_at    timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Enrollment links a consented patient to a project under a pseudonymous subject code.
create table public.research_enrollments (
  id                   uuid primary key default gen_random_uuid(),
  project_id           uuid not null references public.research_projects (id) on delete cascade,
  patient_id           uuid not null references public.patients (id),
  subject_code         text not null default ('S-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  consent_obtained_at  timestamptz not null,
  enrolled_by          uuid references public.profiles (id) default auth.uid(),
  enrolled_at          timestamptz not null default now(),
  withdrawn_at         timestamptz,
  unique (project_id, patient_id),
  unique (project_id, subject_code)
);

create index research_enrollments_project_idx on public.research_enrollments (project_id) where withdrawn_at is null;

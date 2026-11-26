-- =============================================================================
-- 0004  Authorization helpers, integrity triggers and Row Level Security
-- =============================================================================
--
-- Access decision for a patient-scoped action `perm` (see private.patient_can):
--
--   1. Super admin                      → allowed on 'clinic' visibility records
--   2. Owning-clinic path               → visibility = 'clinic' AND the user holds
--                                         `perm` through their role in that clinic
--   3. Primary physician                → allowed if their role (in any clinic)
--                                         carries `perm`
--   4. Explicit user grant (active)     → allowed if their role carries `perm`;
--                                         write perms need access_level = 'write'
--   5. Clinic grant (active, 'clinic'   → allowed if the user holds `perm` in the
--      visibility only)                   grantee clinic; same read/write rule
--
-- 'private' records are therefore reachable only via paths 3 and 4. Super admins
-- reach them through audited break-glass (public.request_emergency_access).
-- Private encounters / documents additionally require authorship or an active
-- emergency grant.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER: they read tables without recursing into
-- RLS; they only ever answer questions about the *calling* user)
-- ---------------------------------------------------------------------------
create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_super_admin and p.is_active from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function private.has_permission(p_clinic uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or exists (
    select 1
    from public.clinic_memberships m
    join public.profiles pr        on pr.id = m.user_id and pr.is_active
    join public.clinics c          on c.id = m.clinic_id and c.is_active
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.clinic_id = p_clinic
      and m.is_active
      and rp.permission = p_perm
  );
$$;

-- Does the user hold `perm` through ANY of their clinic roles?
create or replace function private.has_permission_any(p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or exists (
    select 1
    from public.clinic_memberships m
    join public.profiles pr        on pr.id = m.user_id and pr.is_active
    join public.clinics c          on c.id = m.clinic_id and c.is_active
    join public.role_permissions rp on rp.role = m.role
    where m.user_id = auth.uid()
      and m.is_active
      and rp.permission = p_perm
  );
$$;

create or replace function private.is_clinic_member(p_clinic uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or exists (
    select 1 from public.clinic_memberships m
    where m.user_id = auth.uid() and m.clinic_id = p_clinic and m.is_active
  );
$$;

-- Row-value variant: policies on `patients` pass the row's own columns so the
-- check works for rows being inserted in the same statement.
create or replace function private.patient_can(
  p_patient_id  uuid,
  p_clinic      uuid,
  p_visibility  public.record_visibility,
  p_primary     uuid,
  p_perm        text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_read  boolean := p_perm like '%.read';
begin
  if v_uid is null then
    return false;
  end if;

  -- 1. super admin (non-private records)
  if p_visibility = 'clinic' and private.is_super_admin() then
    return true;
  end if;

  -- 2. owning clinic
  if p_visibility = 'clinic' and private.has_permission(p_clinic, p_perm) then
    return true;
  end if;

  -- 3. primary physician
  if p_primary = v_uid and private.has_permission_any(p_perm) then
    return true;
  end if;

  -- 4. explicit user grant
  if exists (
    select 1 from public.patient_access_grants g
    where g.patient_id = p_patient_id
      and g.grantee_user_id = v_uid
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (v_is_read or g.access_level = 'write')
  ) and (private.has_permission_any(p_perm) or private.is_super_admin()) then
    return true;
  end if;

  -- 5. clinic grant (only for clinic-visibility records)
  if p_visibility = 'clinic' and exists (
    select 1 from public.patient_access_grants g
    where g.patient_id = p_patient_id
      and g.grantee_clinic_id is not null
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (v_is_read or g.access_level = 'write')
      and private.has_permission(g.grantee_clinic_id, p_perm)
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- Id variant for child tables (encounters, documents, …).
create or replace function private.can(p_patient_id uuid, p_perm text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select private.patient_can(p.id, p.clinic_id, p.visibility, p.primary_physician_id, p_perm)
    from public.patients p
    where p.id = p_patient_id
  ), false);
$$;

create or replace function private.has_emergency_access(p_patient_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patient_access_grants g
    where g.patient_id = p_patient_id
      and g.grantee_user_id = auth.uid()
      and g.is_emergency
      and g.revoked_at is null
      and g.expires_at > now()
  );
$$;

create or replace function private.is_project_member(p_project uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.research_project_members m
    where m.project_id = p_project
      and m.user_id = auth.uid()
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

create or replace function private.shares_clinic_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_memberships mine
    join public.clinic_memberships theirs on theirs.clinic_id = mine.clinic_id
    where mine.user_id = auth.uid() and mine.is_active
      and theirs.user_id = p_user
  );
$$;

create or replace function private.try_uuid(p_text text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return p_text::uuid;
exception when others then
  return null;
end;
$$;

-- True when the statement is executed by a server-side role (migrations,
-- service_role key, SQL editor) rather than an end user's JWT.
create or replace function private.is_server_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('postgres', 'service_role', 'supabase_admin');
$$;

-- ---------------------------------------------------------------------------
-- Integrity triggers (rules RLS cannot express)
-- ---------------------------------------------------------------------------

-- Only super admins may change global privilege flags.
create or replace function private.protect_profile_privileges()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_server_context() then
    return new;
  end if;
  if (new.is_super_admin is distinct from old.is_super_admin
      or new.is_active is distinct from old.is_active
      or new.id is distinct from old.id)
     and not private.is_super_admin() then
    raise exception 'Only a super administrator can change privilege or activation flags'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileges before update on public.profiles
  for each row execute function private.protect_profile_privileges();

-- Nobody (except super admins) can create or change their own membership.
create or replace function private.protect_memberships()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_row public.clinic_memberships := coalesce(new, old);
begin
  if private.is_server_context() or private.is_super_admin() then
    return coalesce(new, old);
  end if;
  if v_row.user_id = auth.uid() or (tg_op = 'UPDATE' and old.user_id = auth.uid()) then
    raise exception 'You cannot modify your own clinic membership' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.clinic_id <> old.clinic_id) then
    raise exception 'Membership user/clinic are immutable; create a new membership' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.granted_by := auth.uid();
  end if;
  return coalesce(new, old);
end;
$$;

create trigger clinic_memberships_protect before insert or update or delete on public.clinic_memberships
  for each row execute function private.protect_memberships();

-- Patient record rules: owning clinic is immutable (except super admin);
-- archiving requires patient.delete; physician cannot be removed from a private record.
create or replace function private.patient_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_server_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;

  if new.clinic_id <> old.clinic_id and not private.is_super_admin() then
    raise exception 'Transferring a patient to another clinic requires a super administrator'
      using errcode = '42501';
  end if;

  if new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'Creation metadata is immutable' using errcode = '42501';
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    if not private.patient_can(old.id, old.clinic_id, old.visibility, old.primary_physician_id, 'patient.delete') then
      raise exception 'Archiving a patient requires the patient.delete permission' using errcode = '42501';
    end if;
    new.deleted_by := case when new.deleted_at is null then null else auth.uid() end;
  end if;

  -- changing visibility / primary physician is a sharing decision
  if (new.visibility is distinct from old.visibility
      or new.primary_physician_id is distinct from old.primary_physician_id)
     and not private.patient_can(old.id, old.clinic_id, old.visibility, old.primary_physician_id, 'patient.share') then
    raise exception 'Changing record visibility or primary physician requires patient.share'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger patients_rules before insert or update on public.patients
  for each row execute function private.patient_rules();

-- Encounter signing rules.
create or replace function private.encounter_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_server_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.provider_id := auth.uid();
    if new.status = 'signed' then
      new.status := 'draft';
    end if;
    new.signed_at := null;
    new.signed_by := null;
    return new;
  end if;

  if old.status in ('signed', 'amended') then
    raise exception 'Signed encounters are immutable; create an amendment (amends_id) instead'
      using errcode = '42501';
  end if;

  if new.patient_id <> old.patient_id or new.provider_id <> old.provider_id then
    raise exception 'Encounter patient and provider are immutable' using errcode = '42501';
  end if;

  if new.status = 'signed' and old.status = 'draft' then
    if not private.has_permission(new.clinic_id, 'clinical.sign') then
      raise exception 'Signing requires the clinical.sign permission' using errcode = '42501';
    end if;
    new.signed_at := now();
    new.signed_by := auth.uid();
  elsif new.status <> old.status then
    raise exception 'Invalid encounter status transition % → %', old.status, new.status
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger encounters_rules before insert or update on public.encounters
  for each row execute function private.encounter_rules();

-- When an amendment is signed, mark the original as 'amended'.
create or replace function private.encounter_mark_amended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.amends_id is not null and new.status = 'signed' and old.status = 'draft' then
    update public.encounters set status = 'amended'
    where id = new.amends_id and status = 'signed';
  end if;
  return new;
end;
$$;

create trigger encounters_mark_amended after update on public.encounters
  for each row execute function private.encounter_mark_amended();

-- Note: the internal 'signed' → 'amended' flip above runs as the function
-- owner, so encounter_rules() treats it as a server context and allows it.

-- Document archive rules.
create or replace function private.document_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_server_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    new.deleted_at := null;
    new.deleted_by := null;
    return new;
  end if;
  if new.storage_path <> old.storage_path or new.patient_id <> old.patient_id
     or new.clinic_id <> old.clinic_id or new.uploaded_by <> old.uploaded_by
     or new.sha256 is distinct from old.sha256 or new.size_bytes <> old.size_bytes then
    raise exception 'Document file metadata is immutable' using errcode = '42501';
  end if;
  if new.deleted_at is distinct from old.deleted_at then
    if not private.can(old.patient_id, 'document.delete') then
      raise exception 'Archiving a document requires document.delete' using errcode = '42501';
    end if;
    new.deleted_by := case when new.deleted_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;

create trigger documents_rules before insert or update on public.documents
  for each row execute function private.document_rules();

-- Grants: stamp grantor; emergency grants only via RPC.
create or replace function private.grant_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_server_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.is_emergency then
      raise exception 'Emergency access must be requested through request_emergency_access()'
        using errcode = '42501';
    end if;
    if new.grantee_user_id = auth.uid() then
      raise exception 'You cannot grant access to yourself' using errcode = '42501';
    end if;
    new.granted_by := auth.uid();
    new.granted_at := now();
    new.revoked_at := null;
    new.revoked_by := null;
    return new;
  end if;
  -- UPDATE: only revocation is allowed
  if new.patient_id <> old.patient_id
     or new.grantee_user_id is distinct from old.grantee_user_id
     or new.grantee_clinic_id is distinct from old.grantee_clinic_id
     or new.access_level <> old.access_level
     or new.is_emergency <> old.is_emergency
     or new.granted_by is distinct from old.granted_by
     or new.expires_at is distinct from old.expires_at
     or (old.revoked_at is not null) then
    raise exception 'Grants can only be revoked, not modified' using errcode = '42501';
  end if;
  if new.revoked_at is not null then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger grants_rules before insert or update on public.patient_access_grants
  for each row execute function private.grant_rules();

-- Enrollment requires recorded research consent on the patient.
create or replace function private.enrollment_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.patients p where p.id = new.patient_id and p.research_consent
  ) then
    raise exception 'Patient has not given research consent' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' and not exists (
    select 1 from public.research_projects r where r.id = new.project_id and r.status = 'active'
  ) then
    raise exception 'Patients can only be enrolled in active, IRB-approved projects' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger research_enrollments_rules before insert on public.research_enrollments
  for each row execute function private.enrollment_rules();

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.clinics                  enable row level security;
alter table public.profiles                 enable row level security;
alter table public.clinic_memberships       enable row level security;
alter table public.permissions              enable row level security;
alter table public.role_permissions         enable row level security;
alter table public.patients                 enable row level security;
alter table public.patient_access_grants    enable row level security;
alter table public.encounters               enable row level security;
alter table public.pregnancies              enable row level security;
alter table public.fertility_cycles         enable row level security;
alter table public.fetal_assessments        enable row level security;
alter table public.documents                enable row level security;
alter table public.research_projects        enable row level security;
alter table public.research_project_members enable row level security;
alter table public.research_enrollments     enable row level security;

-- Anonymous users get nothing.
revoke all on all tables in schema public from anon;
grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

grant select, insert, update on
  public.clinics, public.profiles, public.clinic_memberships,
  public.patients, public.patient_access_grants, public.encounters, public.pregnancies,
  public.fertility_cycles, public.fetal_assessments, public.documents,
  public.research_projects, public.research_project_members, public.research_enrollments
  to authenticated;
grant delete on public.clinic_memberships, public.research_project_members to authenticated;
grant select on public.permissions, public.role_permissions to authenticated;

-- ---------------------------------------------------------------------------
-- Policies: reference data
-- ---------------------------------------------------------------------------
create policy permissions_read on public.permissions
  for select to authenticated using (true);
create policy role_permissions_read on public.role_permissions
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Policies: clinics
-- ---------------------------------------------------------------------------
create policy clinics_select on public.clinics
  for select to authenticated
  using (private.is_clinic_member(id) or private.has_permission_any('patient.share'));

create policy clinics_insert on public.clinics
  for insert to authenticated
  with check (private.is_super_admin());

create policy clinics_update on public.clinics
  for update to authenticated
  using (private.has_permission(id, 'admin.clinic'))
  with check (private.has_permission(id, 'admin.clinic'));

-- ---------------------------------------------------------------------------
-- Policies: profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or private.is_super_admin()
    or private.shares_clinic_with(id)
    or private.has_permission_any('patient.share')   -- to pick share recipients
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid() or private.is_super_admin())
  with check (id = auth.uid() or private.is_super_admin());

-- ---------------------------------------------------------------------------
-- Policies: clinic memberships
-- ---------------------------------------------------------------------------
create policy memberships_select on public.clinic_memberships
  for select to authenticated
  using (user_id = auth.uid() or private.is_clinic_member(clinic_id));

create policy memberships_insert on public.clinic_memberships
  for insert to authenticated
  with check (
    private.has_permission(clinic_id, 'admin.users')
    -- only super admins can appoint clinic administrators
    and (role <> 'clinic_admin' or private.is_super_admin())
  );

create policy memberships_update on public.clinic_memberships
  for update to authenticated
  using (private.has_permission(clinic_id, 'admin.users')
         and (role <> 'clinic_admin' or private.is_super_admin()))
  with check (private.has_permission(clinic_id, 'admin.users')
              and (role <> 'clinic_admin' or private.is_super_admin()));

create policy memberships_delete on public.clinic_memberships
  for delete to authenticated
  using (private.has_permission(clinic_id, 'admin.users')
         and (role <> 'clinic_admin' or private.is_super_admin()));

-- ---------------------------------------------------------------------------
-- Policies: patients
-- ---------------------------------------------------------------------------
create policy patients_select on public.patients
  for select to authenticated
  using (
    private.patient_can(id, clinic_id, visibility, primary_physician_id, 'patient.read')
    and (deleted_at is null
         or private.patient_can(id, clinic_id, visibility, primary_physician_id, 'patient.delete'))
  );

create policy patients_insert on public.patients
  for insert to authenticated
  with check (
    private.has_permission(clinic_id, 'patient.create')
    and (visibility = 'clinic' or primary_physician_id = auth.uid())
  );

create policy patients_update on public.patients
  for update to authenticated
  using (private.patient_can(id, clinic_id, visibility, primary_physician_id, 'patient.update'))
  with check (private.patient_can(id, clinic_id, visibility, primary_physician_id, 'patient.read'));
-- (no DELETE policy: patients are archived, never hard-deleted)

-- ---------------------------------------------------------------------------
-- Policies: access grants
-- ---------------------------------------------------------------------------
create policy grants_select on public.patient_access_grants
  for select to authenticated
  using (
    grantee_user_id = auth.uid()
    or granted_by = auth.uid()
    or private.can(patient_id, 'patient.share')
  );

create policy grants_insert on public.patient_access_grants
  for insert to authenticated
  with check (private.can(patient_id, 'patient.share'));

create policy grants_update on public.patient_access_grants
  for update to authenticated
  using (private.can(patient_id, 'patient.share') or granted_by = auth.uid())
  with check (private.can(patient_id, 'patient.share') or granted_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Policies: encounters
-- ---------------------------------------------------------------------------
create policy encounters_select on public.encounters
  for select to authenticated
  using (
    private.can(patient_id, 'clinical.read')
    and (not is_private or provider_id = auth.uid() or private.has_emergency_access(patient_id))
  );

create policy encounters_insert on public.encounters
  for insert to authenticated
  with check (
    private.can(patient_id, 'clinical.write')
    and private.is_clinic_member(clinic_id)
  );

create policy encounters_update on public.encounters
  for update to authenticated
  using (
    private.can(patient_id, 'clinical.write')
    and (not is_private or provider_id = auth.uid())
  )
  with check (
    private.can(patient_id, 'clinical.write')
    and private.is_clinic_member(clinic_id)
  );

-- ---------------------------------------------------------------------------
-- Policies: pregnancies / fertility cycles / fetal assessments
-- ---------------------------------------------------------------------------
create policy pregnancies_select on public.pregnancies
  for select to authenticated using (private.can(patient_id, 'clinical.read'));
create policy pregnancies_insert on public.pregnancies
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy pregnancies_update on public.pregnancies
  for update to authenticated
  using (private.can(patient_id, 'clinical.write'))
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));

create policy fertility_cycles_select on public.fertility_cycles
  for select to authenticated using (private.can(patient_id, 'clinical.read'));
create policy fertility_cycles_insert on public.fertility_cycles
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy fertility_cycles_update on public.fertility_cycles
  for update to authenticated
  using (private.can(patient_id, 'clinical.write'))
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));

create policy fetal_assessments_select on public.fetal_assessments
  for select to authenticated using (private.can(patient_id, 'clinical.read'));
create policy fetal_assessments_insert on public.fetal_assessments
  for insert to authenticated
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));
create policy fetal_assessments_update on public.fetal_assessments
  for update to authenticated
  using (private.can(patient_id, 'clinical.write'))
  with check (private.can(patient_id, 'clinical.write') and private.is_clinic_member(clinic_id));

-- ---------------------------------------------------------------------------
-- Policies: documents
-- ---------------------------------------------------------------------------
create policy documents_select on public.documents
  for select to authenticated
  using (
    private.can(patient_id, 'document.read')
    and (not is_private or uploaded_by = auth.uid() or private.has_emergency_access(patient_id))
    and (deleted_at is null or private.can(patient_id, 'document.delete'))
  );

create policy documents_insert on public.documents
  for insert to authenticated
  with check (
    private.can(patient_id, 'document.upload')
    and exists (select 1 from public.patients p where p.id = patient_id and p.clinic_id = documents.clinic_id)
  );

create policy documents_update on public.documents
  for update to authenticated
  using (
    (uploaded_by = auth.uid() and private.can(patient_id, 'document.upload'))
    or private.can(patient_id, 'document.delete')
  )
  with check (private.can(patient_id, 'document.read'));

-- ---------------------------------------------------------------------------
-- Policies: research
-- ---------------------------------------------------------------------------
create policy research_projects_select on public.research_projects
  for select to authenticated
  using (
    private.is_super_admin()
    or principal_investigator_id = auth.uid()
    or (private.is_project_member(id) and private.has_permission_any('research.access'))
  );

create policy research_projects_insert on public.research_projects
  for insert to authenticated
  with check (private.has_permission_any('research.manage') and principal_investigator_id = auth.uid());

create policy research_projects_update on public.research_projects
  for update to authenticated
  using (principal_investigator_id = auth.uid() or private.is_super_admin())
  with check (principal_investigator_id = auth.uid() or private.is_super_admin());

create policy research_members_select on public.research_project_members
  for select to authenticated
  using (user_id = auth.uid() or private.is_project_member(project_id) or private.is_super_admin());

create policy research_members_write on public.research_project_members
  for insert to authenticated
  with check (
    private.is_super_admin()
    or exists (select 1 from public.research_projects r
               where r.id = project_id and r.principal_investigator_id = auth.uid())
  );

create policy research_members_delete on public.research_project_members
  for delete to authenticated
  using (
    private.is_super_admin()
    or exists (select 1 from public.research_projects r
               where r.id = project_id and r.principal_investigator_id = auth.uid())
  );

-- Identifiable enrollment rows are visible only to clinicians who can see the
-- patient. Researchers use public.research_cohort() (de-identified).
create policy research_enrollments_select on public.research_enrollments
  for select to authenticated
  using (private.can(patient_id, 'patient.read'));

create policy research_enrollments_insert on public.research_enrollments
  for insert to authenticated
  with check (
    private.can(patient_id, 'clinical.write')
    and private.has_permission_any('research.manage')
    and private.is_project_member(project_id, array['pi', 'investigator'])
  );

create policy research_enrollments_update on public.research_enrollments
  for update to authenticated
  using (private.can(patient_id, 'clinical.write') and private.is_project_member(project_id, array['pi', 'investigator']))
  with check (private.can(patient_id, 'clinical.write'));

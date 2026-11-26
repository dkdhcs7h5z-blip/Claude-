-- =============================================================================
-- 0013  Staff access
--   * Per-membership permission overrides (granted / revoked on top of the role)
--   * Specialty scope: a membership can be limited to some specialties; clinic
--     access to a patient then requires an overlapping specialty
--   * Code-only sign-in: each person has a public 4-character login handle; the
--     secret part of their code is their (bcrypt-hashed) Supabase password.
--     Server-only RPCs support lock-out and session revocation for the
--     `code-login` / `staff-admin` Edge Functions.
-- =============================================================================

-- Login handle (public half of a login code)
alter table public.profiles
  add column login_handle   text unique check (login_handle ~ '^[2-9A-HJKMNP-Z]{4}$'),
  add column code_issued_at timestamptz;

-- ---------------------------------------------------------------------------
-- Memberships: overrides and scope
-- ---------------------------------------------------------------------------
alter table public.clinic_memberships
  add column granted_permissions text[] not null default '{}',
  add column revoked_permissions text[] not null default '{}',
  add column specialties public.specialty[],            -- null = all specialties
  add constraint membership_specialties_nonempty check (specialties is null or cardinality(specialties) > 0),
  add constraint membership_overrides_disjoint check (not (granted_permissions && revoked_permissions));

create or replace function private.membership_override_rules()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_unknown text;
begin
  select x into v_unknown
  from unnest(new.granted_permissions || new.revoked_permissions) x
  where not exists (select 1 from public.permissions p where p.code = x)
  limit 1;
  if v_unknown is not null then
    raise exception 'Unknown permission %', v_unknown using errcode = '22023';
  end if;
  -- normalise (sorted, unique)
  new.granted_permissions := coalesce((select array_agg(distinct x order by x) from unnest(new.granted_permissions) x), '{}');
  new.revoked_permissions := coalesce((select array_agg(distinct x order by x) from unnest(new.revoked_permissions) x), '{}');
  if new.specialties is not null then
    new.specialties := (select array_agg(distinct x order by x) from unnest(new.specialties) x);
  end if;
  -- administrative permissions can only be added by a super administrator
  if not private.is_server_context() and not private.is_super_admin()
     and new.granted_permissions && array['admin.users', 'admin.clinic', 'audit.read']
     and (tg_op = 'INSERT' or new.granted_permissions is distinct from old.granted_permissions) then
    raise exception 'Only a super administrator can grant administrative permissions' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger clinic_memberships_overrides before insert or update on public.clinic_memberships
  for each row execute function private.membership_override_rules();

-- Effective permissions of a membership: role ∪ granted − revoked
create or replace function private.effective_permissions(p_role public.app_role, p_granted text[], p_revoked text[])
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct p order by p), '{}')
  from (
    select rp.permission as p from public.role_permissions rp where rp.role = p_role
    union
    select unnest(p_granted)
  ) x
  where not (p = any (p_revoked));
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
    join public.profiles pr on pr.id = m.user_id and pr.is_active
    join public.clinics c   on c.id = m.clinic_id and c.is_active
    where m.user_id = auth.uid()
      and m.clinic_id = p_clinic
      and m.is_active
      and not (p_perm = any (m.revoked_permissions))
      and (p_perm = any (m.granted_permissions)
           or exists (select 1 from public.role_permissions rp where rp.role = m.role and rp.permission = p_perm))
  );
$$;

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
    join public.profiles pr on pr.id = m.user_id and pr.is_active
    join public.clinics c   on c.id = m.clinic_id and c.is_active
    where m.user_id = auth.uid()
      and m.is_active
      and not (p_perm = any (m.revoked_permissions))
      and (p_perm = any (m.granted_permissions)
           or exists (select 1 from public.role_permissions rp where rp.role = m.role and rp.permission = p_perm))
  );
$$;

-- Does the caller's membership in `p_clinic` cover the patient's specialties?
-- A patient without specialties (new registration) is in everyone's scope.
create or replace function private.scope_allows(p_clinic uuid, p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_super_admin() or exists (
    select 1 from public.clinic_memberships m
    where m.user_id = auth.uid() and m.clinic_id = p_clinic and m.is_active
      and (m.specialties is null
           or coalesce((select cardinality(p.specialties) = 0 or p.specialties && m.specialties
                        from public.patients p where p.id = p_patient), true))
  );
$$;

-- Patient access: the clinic routes (2 and 5) now also require specialty scope.
-- Primary physicians and explicit personal grants are not limited by scope.
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

  -- 2. owning clinic, within the member's specialty scope
  if p_visibility = 'clinic' and private.has_permission(p_clinic, p_perm) and private.scope_allows(p_clinic, p_patient_id) then
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

  -- 5. clinic grant (only for clinic-visibility records), within scope
  if p_visibility = 'clinic' and exists (
    select 1 from public.patient_access_grants g
    where g.patient_id = p_patient_id
      and g.grantee_clinic_id is not null
      and g.revoked_at is null
      and (g.expires_at is null or g.expires_at > now())
      and (v_is_read or g.access_level = 'write')
      and private.has_permission(g.grantee_clinic_id, p_perm)
      and private.scope_allows(g.grantee_clinic_id, p_patient_id)
  ) then
    return true;
  end if;

  return false;
end;
$$;

-- Access summary for the UI: effective permissions and specialty scope.
create or replace function public.get_my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'is_super_admin', p.is_super_admin and p.is_active,
    'is_active', p.is_active,
    'login_handle', p.login_handle,
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clinic_id', c.id,
        'clinic_code', c.code,
        'clinic_name_en', c.name_en,
        'clinic_name_ar', c.name_ar,
        'role', m.role,
        'permissions', to_jsonb(private.effective_permissions(m.role, m.granted_permissions, m.revoked_permissions)),
        'specialties', to_jsonb(m.specialties)
      ) order by c.name_en)
      from public.clinic_memberships m
      join public.clinics c on c.id = m.clinic_id and c.is_active
      where m.user_id = p.id and m.is_active
    ), '[]'::jsonb)
  )
  from public.profiles p
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Login codes
-- ---------------------------------------------------------------------------
-- login_handle and code_issued_at are written only by the server functions
create or replace function private.protect_login_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_server_context()
     and (new.login_handle is distinct from old.login_handle or new.code_issued_at is distinct from old.code_issued_at) then
    raise exception 'Login codes are managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_login before update on public.profiles
  for each row execute function private.protect_login_fields();

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'INSERT', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'PRINT', 'EXPORT', 'EMERGENCY_ACCESS', 'RESEARCH_QUERY',
  'SIGN_IN', 'SIGN_OUT', 'SIGN_IN_FAILED', 'CODE_ISSUED'));

-- Failed attempts per handle (not exposed to clients).
create table private.code_login_attempts (
  handle        text primary key,
  failures      smallint not null default 0,
  locked_until  timestamptz,
  last_attempt  timestamptz not null default now()
);

-- Server-only: resolve a handle for sign-in.
create or replace function public.code_login_lookup(p_handle text)
returns table (user_id uuid, email text, is_active boolean, locked_until timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, u.email::text, p.is_active,
         (select a.locked_until from private.code_login_attempts a where a.handle = upper(p_handle) and a.locked_until > now())
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.login_handle = upper(p_handle)
  union all
  select null, null, null, a.locked_until
  from private.code_login_attempts a
  where a.handle = upper(p_handle) and a.locked_until > now()
    and not exists (select 1 from public.profiles p where p.login_handle = upper(p_handle));
$$;

-- Server-only: record an attempt. 5 consecutive failures lock the handle for 15 minutes.
create or replace function public.code_login_record(p_handle text, p_success boolean, p_context jsonb default '{}'::jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handle text := upper(p_handle);
  v_user   uuid := (select id from public.profiles where login_handle = v_handle);
  v_row    private.code_login_attempts;
begin
  if p_success then
    delete from private.code_login_attempts where handle = v_handle;
    insert into public.audit_log (actor_id, action, context) values (v_user, 'SIGN_IN', p_context || jsonb_build_object('via', 'login_code'));
    return null;
  end if;
  insert into private.code_login_attempts as a (handle, failures, last_attempt)
  values (v_handle, 1, now())
  on conflict (handle) do update
    set failures = case when a.locked_until is not null and a.locked_until <= now() then 1 else a.failures + 1 end,
        locked_until = case when a.locked_until is not null and a.locked_until <= now() then null else a.locked_until end,
        last_attempt = now()
  returning * into v_row;
  if v_row.failures >= 5 and v_row.locked_until is null then
    update private.code_login_attempts set locked_until = now() + interval '15 minutes' where handle = v_handle
    returning * into v_row;
  end if;
  insert into public.audit_log (actor_id, action, context)
  values (v_user, 'SIGN_IN_FAILED', p_context || jsonb_build_object('via', 'login_code', 'handle', v_handle, 'failures', v_row.failures));
  return v_row.locked_until;
end;
$$;

-- Server-only: end a user's sessions (after a code reset), optionally keeping one.
create or replace function public.admin_revoke_sessions(p_user uuid, p_keep uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from auth.sessions where user_id = p_user and (p_keep is null or id <> p_keep);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Full-data export (backup) by a super administrator is recorded in the audit log.
create or replace function public.log_data_export(p_context jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_super_admin() then
    raise exception 'Only a super administrator can export all data' using errcode = '42501';
  end if;
  insert into public.audit_log (actor_id, action, context) values (auth.uid(), 'EXPORT', coalesce(p_context, '{}'::jsonb) || '{"scope": "all"}');
end;
$$;
revoke execute on function public.log_data_export(jsonb) from public, anon;
grant execute on function public.log_data_export(jsonb) to authenticated;

revoke execute on function public.code_login_lookup(text) from public, anon, authenticated;
revoke execute on function public.code_login_record(text, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_revoke_sessions(uuid, uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.code_login_lookup(text) to service_role;
    grant execute on function public.code_login_record(text, boolean, jsonb) to service_role;
    grant execute on function public.admin_revoke_sessions(uuid, uuid) to service_role;
  end if;
end;
$$;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- =============================================================================
-- 0005  Append-only audit log, audit triggers and client-callable RPCs
-- =============================================================================

create table public.audit_log (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  actor_id        uuid,                       -- null = server/service context
  action          text not null check (action in (
                    'INSERT', 'UPDATE', 'DELETE',
                    'VIEW', 'DOWNLOAD', 'PRINT', 'EXPORT',
                    'EMERGENCY_ACCESS', 'RESEARCH_QUERY', 'SIGN_IN', 'SIGN_OUT')),
  table_name      text,
  record_id       uuid,
  patient_id      uuid,
  clinic_id       uuid,
  changed_fields  text[],
  old_data        jsonb,
  new_data        jsonb,
  context         jsonb not null default '{}'::jsonb
);

create index audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index audit_log_patient_idx  on public.audit_log (patient_id, occurred_at desc) where patient_id is not null;
create index audit_log_clinic_idx   on public.audit_log (clinic_id, occurred_at desc);
create index audit_log_actor_idx    on public.audit_log (actor_id, occurred_at desc);

-- Append-only: block UPDATE/DELETE/TRUNCATE for everyone, including owners.
create or replace function private.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

create trigger audit_log_no_update before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    private.is_super_admin()
    or (clinic_id is not null and private.has_permission(clinic_id, 'audit.read'))
  );

-- ---------------------------------------------------------------------------
-- Generic row-change audit trigger
-- ---------------------------------------------------------------------------
create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_new     jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  v_row     jsonb := coalesce(v_new, v_old);
  v_changed text[];
  v_patient uuid;
  v_clinic  uuid;
begin
  if tg_op = 'UPDATE' then
    select array_agg(key order by key) into v_changed
    from jsonb_each(v_new) n
    where n.value is distinct from (v_old -> n.key)
      and n.key <> 'updated_at';
    if v_changed is null then
      return null;   -- no-op update, nothing to record
    end if;
  end if;

  v_patient := case
    when tg_table_name = 'patients' then (v_row ->> 'id')::uuid
    else private.try_uuid(v_row ->> 'patient_id')
  end;

  v_clinic := case
    when tg_table_name = 'clinics' then (v_row ->> 'id')::uuid
    else private.try_uuid(v_row ->> 'clinic_id')
  end;
  if v_clinic is null and v_patient is not null then
    select p.clinic_id into v_clinic from public.patients p where p.id = v_patient;
  end if;

  insert into public.audit_log
    (actor_id, action, table_name, record_id, patient_id, clinic_id, changed_fields, old_data, new_data)
  values
    (auth.uid(), tg_op, tg_table_name, private.try_uuid(v_row ->> 'id'), v_patient, v_clinic,
     v_changed, v_old, v_new);

  return null;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'clinics', 'profiles', 'clinic_memberships', 'patients', 'patient_access_grants',
    'encounters', 'pregnancies', 'fertility_cycles', 'fetal_assessments', 'documents',
    'research_projects', 'research_project_members', 'research_enrollments'
  ] loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function private.audit_row_change()',
      t || '_audit', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: record read-access events (view / download / print / export)
-- ---------------------------------------------------------------------------
create or replace function public.log_access_event(
  p_action      text,
  p_patient_id  uuid,
  p_table_name  text default null,
  p_record_id   uuid default null,
  p_context     jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_action not in ('VIEW', 'DOWNLOAD', 'PRINT', 'EXPORT') then
    raise exception 'Unsupported access action %', p_action using errcode = '22023';
  end if;
  if not private.can(p_patient_id, 'patient.read') then
    raise exception 'No access to this patient' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, patient_id, clinic_id, context)
  select auth.uid(), p_action, p_table_name, p_record_id, p.id, p.clinic_id,
         coalesce(p_context, '{}'::jsonb)
  from public.patients p where p.id = p_patient_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: break-glass emergency access (read-only, time-limited, audited)
-- ---------------------------------------------------------------------------
create or replace function public.request_emergency_access(
  p_patient_id  uuid,
  p_reason      text,
  p_hours       integer default 4
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grant  uuid;
  v_clinic uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if p_reason is null or length(trim(p_reason)) < 15 then
    raise exception 'A clinical justification of at least 15 characters is required' using errcode = '22023';
  end if;
  if p_hours not between 1 and 24 then
    raise exception 'Emergency access may last between 1 and 24 hours' using errcode = '22023';
  end if;
  if not private.has_permission_any('clinical.read') then
    raise exception 'Emergency access is restricted to clinical staff' using errcode = '42501';
  end if;

  select clinic_id into v_clinic from public.patients where id = p_patient_id and deleted_at is null;
  if v_clinic is null then
    raise exception 'Patient not found' using errcode = 'P0002';
  end if;

  insert into public.patient_access_grants
    (patient_id, grantee_user_id, access_level, reason, is_emergency, granted_by, expires_at)
  values
    (p_patient_id, auth.uid(), 'read', trim(p_reason), true, auth.uid(), now() + make_interval(hours => p_hours))
  returning id into v_grant;

  insert into public.audit_log (actor_id, action, table_name, record_id, patient_id, clinic_id, context)
  values (auth.uid(), 'EMERGENCY_ACCESS', 'patient_access_grants', v_grant, p_patient_id, v_clinic,
          jsonb_build_object('reason', trim(p_reason), 'hours', p_hours));

  return v_grant;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: the caller's effective access (drives UI gating; RLS stays authoritative)
-- ---------------------------------------------------------------------------
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
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object(
        'clinic_id', c.id,
        'clinic_code', c.code,
        'clinic_name_en', c.name_en,
        'clinic_name_ar', c.name_ar,
        'role', m.role,
        'permissions', (
          select coalesce(jsonb_agg(rp.permission order by rp.permission), '[]'::jsonb)
          from public.role_permissions rp where rp.role = m.role
        )
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
-- RPC: dashboard counters (SECURITY INVOKER → every count respects RLS)
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_clinic uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'patients', (select count(*) from public.patients
                 where deleted_at is null and (p_clinic is null or clinic_id = p_clinic)),
    'active_pregnancies', (select count(*) from public.pregnancies
                 where status = 'active' and (p_clinic is null or clinic_id = p_clinic)),
    'high_risk_pregnancies', (select count(*) from public.pregnancies
                 where status = 'active' and risk_level = 'high' and (p_clinic is null or clinic_id = p_clinic)),
    'active_fertility_cycles', (select count(*) from public.fertility_cycles
                 where status not in ('completed', 'cancelled') and (p_clinic is null or clinic_id = p_clinic)),
    'fetal_assessments_30d', (select count(*) from public.fetal_assessments
                 where performed_at > now() - interval '30 days' and (p_clinic is null or clinic_id = p_clinic)),
    'encounters_today', (select count(*) from public.encounters
                 where encounter_at::date = current_date and (p_clinic is null or clinic_id = p_clinic)),
    'unsigned_encounters', (select count(*) from public.encounters
                 where status = 'draft' and provider_id = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- RPC: de-identified research cohort for a project the caller belongs to
-- ---------------------------------------------------------------------------
create or replace function public.research_cohort(p_project_id uuid)
returns table (
  subject_code        text,
  age_band            text,
  blood_group         text,
  rh_factor           text,
  specialties         public.specialty[],
  pregnancies_total   bigint,
  conception_methods  text[],
  high_risk_ever      boolean,
  fertility_cycles    bigint,
  cycle_types         text[],
  fetal_assessments   bigint,
  enrolled_month      text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;
  if not (private.has_permission_any('research.access')
          and (private.is_project_member(p_project_id)
               or exists (select 1 from public.research_projects r
                          where r.id = p_project_id and r.principal_investigator_id = auth.uid()))) then
    raise exception 'Not a member of this research project' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.research_projects r
    where r.id = p_project_id and r.status = 'active'
      and (r.irb_expires_at is null or r.irb_expires_at >= current_date)
  ) then
    raise exception 'Project is not active or its IRB approval has expired' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, action, table_name, record_id, context)
  values (auth.uid(), 'RESEARCH_QUERY', 'research_projects', p_project_id, '{}'::jsonb);

  return query
  select
    e.subject_code,
    -- 5-year age bands, top-coded at 50+ (k-anonymity friendly)
    case
      when date_part('year', age(e.enrolled_at::date, p.date_of_birth)) >= 50 then '50+'
      else (floor(date_part('year', age(e.enrolled_at::date, p.date_of_birth)) / 5) * 5)::int || '-'
           || ((floor(date_part('year', age(e.enrolled_at::date, p.date_of_birth)) / 5) * 5) + 4)::int
    end,
    p.blood_group,
    p.rh_factor,
    p.specialties,
    (select count(*) from public.pregnancies g where g.patient_id = p.id),
    (select array_agg(distinct g.conception) filter (where g.conception is not null)
       from public.pregnancies g where g.patient_id = p.id),
    exists (select 1 from public.pregnancies g where g.patient_id = p.id and g.risk_level = 'high'),
    (select count(*) from public.fertility_cycles f where f.patient_id = p.id),
    (select array_agg(distinct f.cycle_type) from public.fertility_cycles f where f.patient_id = p.id),
    (select count(*) from public.fetal_assessments a where a.patient_id = p.id),
    to_char(e.enrolled_at, 'YYYY-MM')
  from public.research_enrollments e
  join public.patients p on p.id = e.patient_id
  where e.project_id = p_project_id
    and e.withdrawn_at is null
    and p.research_consent
    and p.deleted_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- Function privileges: nothing callable by anon; only intended RPCs by users
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.log_access_event(text, uuid, text, uuid, jsonb),
  public.request_emergency_access(uuid, text, integer),
  public.get_my_access(),
  public.dashboard_stats(uuid),
  public.research_cohort(uuid)
  to authenticated;

revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

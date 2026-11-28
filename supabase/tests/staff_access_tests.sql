-- =============================================================================
-- Staff access tests: permission overrides, specialty scope, login-code RPCs
-- (reuses rls_tests users/patients)
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

create temp table sx (k text primary key, id uuid);
grant select on sx to authenticated, service_role;
-- two clinic-A patients: one gynecology-only, one infertility-only
with p as (insert into public.patients (clinic_id, mrn, first_name_en, last_name_en, date_of_birth, visibility, specialties)
  values ('00000000-0000-0000-0000-00000000c11a', 'A-SX1', 'Gyn', 'Test', '1985-01-01', 'clinic', '{gynecology}') returning id)
insert into sx select 'gyn_pt', id from p;
with p as (insert into public.patients (clinic_id, mrn, first_name_en, last_name_en, date_of_birth, visibility, specialties)
  values ('00000000-0000-0000-0000-00000000c11a', 'A-SX2', 'Ivf', 'Test', '1986-01-01', 'clinic', '{infertility}') returning id)
insert into sx select 'ivf_pt', id from p;
insert into sx select 'nurse_m', id from public.clinic_memberships
  where user_id = '00000000-0000-0000-0000-0000000000a5' and clinic_id = '00000000-0000-0000-0000-00000000c11a';

-- ---------------------------------------------------------------------------
-- Overrides (set by the clinic admin)
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.throws($q$update public.clinic_memberships set granted_permissions = '{made.up}' where id = (select id from sx where k = 'nurse_m')$q$,
  'unknown permission rejected');
select tst.throws($q$update public.clinic_memberships set granted_permissions = '{admin.users}' where id = (select id from sx where k = 'nurse_m')$q$,
  'clinic admin cannot grant administrative permissions');
select tst.throws($q$update public.clinic_memberships set granted_permissions = '{clinical.sign}', revoked_permissions = '{clinical.sign}'
  where id = (select id from sx where k = 'nurse_m')$q$, 'a permission cannot be both granted and revoked');
select tst.lives($q$update public.clinic_memberships set granted_permissions = '{clinical.sign,clinical.sign}', revoked_permissions = '{patient.create}',
  specialties = '{obstetrics,gynecology}' where id = (select id from sx where k = 'nurse_m')$q$,
  'clinic admin grants signing, removes patient creation and limits the nurse to obstetrics & gynecology');
select tst.ok((select granted_permissions = '{clinical.sign}' from public.clinic_memberships where id = (select id from sx where k = 'nurse_m')),
  'overrides are de-duplicated');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.ok((select m -> 'permissions' ? 'clinical.sign' and not (m -> 'permissions' ? 'patient.create')
                and m -> 'specialties' @> '["gynecology", "obstetrics"]'::jsonb and jsonb_array_length(m -> 'specialties') = 2
  from jsonb_array_elements(public.get_my_access() -> 'memberships') m
  where m ->> 'clinic_id' = '00000000-0000-0000-0000-00000000c11a'), 'get_my_access reports effective permissions and scope');
select tst.throws($q$insert into public.patients (clinic_id, mrn, first_name_en, last_name_en, date_of_birth)
  values ('00000000-0000-0000-0000-00000000c11a', 'A-SX3', 'X', 'Y', '1990-01-01')$q$, 'revoked permission blocks patient creation');
select tst.eq(tst.n($q$select 1 from public.patients where id = (select id from sx where k = 'gyn_pt')$q$), 1, 'patient within specialty scope visible');
select tst.eq(tst.n($q$select 1 from public.patients where id = (select id from sx where k = 'ivf_pt')$q$), 0, 'patient outside specialty scope hidden');
select tst.eq(tst.n($q$select 1 from public.patients where mrn = 'A-001'$q$), 1, 'patient in scope (obstetrics) still visible');
reset role;

-- explicit personal grant bypasses scope
insert into public.patient_access_grants (patient_id, grantee_user_id, access_level, reason, granted_by)
values ((select id from sx where k = 'ivf_pt'), '00000000-0000-0000-0000-0000000000a5', 'read', 'covering', '00000000-0000-0000-0000-0000000000a3');
select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.eq(tst.n($q$select 1 from public.patients where id = (select id from sx where k = 'ivf_pt')$q$), 1, 'personal share overrides specialty scope');
select tst.lives($q$update public.clinic_memberships set specialties = null where id = (select id from sx where k = 'nurse_m')$q$,
  'self-update of membership is filtered by RLS');
select tst.throws($q$update public.profiles set login_handle = 'ABCD' where id = auth.uid()$q$, 'login handle is server-managed');
select tst.throws($q$select public.code_login_lookup('ABCD')$q$, 'clients cannot call the code-login lookup');
select tst.throws($q$select public.admin_revoke_sessions(auth.uid())$q$, 'clients cannot revoke sessions');
select tst.throws($q$select public.log_data_export()$q$, 'only a super administrator can export all data');
reset role;

select tst.ok((select specialties is not null from public.clinic_memberships where id = (select id from sx where k = 'nurse_m')),
  'members cannot widen their own scope');

-- super admin may grant administrative permissions
select tst.as('00000000-0000-0000-0000-0000000000a1'); set role authenticated;
select tst.lives($q$select public.log_data_export('{"tables": 40}')$q$, 'super admin export is logged');
select tst.lives($q$update public.clinic_memberships set granted_permissions = '{audit.read,clinical.sign}', specialties = null
  where id = (select id from sx where k = 'nurse_m')$q$, 'super admin grants audit access');
reset role;
select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.eq(tst.n($q$select 1 from public.patients where id = (select id from sx where k = 'ivf_pt')$q$), 1, 'scope removed: all specialties visible again');
reset role;

-- ---------------------------------------------------------------------------
-- Login-code RPCs (server context)
-- ---------------------------------------------------------------------------
update public.profiles set login_handle = 'K7QM' where id = '00000000-0000-0000-0000-0000000000a5';
select tst.ok((select user_id = '00000000-0000-0000-0000-0000000000a5' and is_active and locked_until is null from public.code_login_lookup('k7qm')),
  'handle lookup is case-insensitive');
select public.code_login_record('K7QM', false) from generate_series(1, 4);
select tst.ok((select locked_until is null from public.code_login_lookup('K7QM')), 'four failures do not lock');
select tst.ok(public.code_login_record('K7QM', false) > now(), 'fifth failure locks the handle');
select tst.ok((select locked_until > now() + interval '14 minutes' from public.code_login_lookup('K7QM')), 'lock lasts 15 minutes');
select tst.ok((select count(*) = 5 from public.audit_log where action = 'SIGN_IN_FAILED' and actor_id = '00000000-0000-0000-0000-0000000000a5'),
  'failed attempts are audited');
select public.code_login_record('K7QM', true);
select tst.ok((select locked_until is null from public.code_login_lookup('K7QM')), 'success clears failures');
select public.code_login_record('ZZZZ', false) from generate_series(1, 5);
select tst.ok((select locked_until > now() and user_id is null from public.code_login_lookup('ZZZZ')), 'unknown handles are locked too');
insert into auth.sessions (user_id) select '00000000-0000-0000-0000-0000000000a5' from generate_series(1, 3);
select tst.eq(public.admin_revoke_sessions('00000000-0000-0000-0000-0000000000a5',
  (select id from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a5' limit 1)), 2, 'other sessions revoked, current kept');

-- The edge functions run as service_role: profile updates fire integrity triggers
-- that call private helpers (regression: "permission denied for schema private").
grant select, update on public.profiles to service_role;
grant usage on schema tst to service_role;
grant execute on all functions in schema tst to service_role;
grant insert on tst.results to service_role;
grant usage on sequence tst.results_n_seq to service_role;
set role service_role;
select tst.lives($q$update public.profiles set login_handle = 'Q8MZ', code_issued_at = now() where id = '00000000-0000-0000-0000-0000000000a6'$q$,
  'service role can set login fields through the integrity triggers');
reset role;

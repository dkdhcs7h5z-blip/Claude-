-- =============================================================================
-- Authorization / RLS test suite (run by run_db_tests.sh)
-- =============================================================================
\set QUIET on
set client_min_messages = warning;

-- ---------------------------------------------------------------------------
-- Test helpers
-- ---------------------------------------------------------------------------
create schema tst;
create table tst.results (n serial, name text, passed boolean, detail text);
grant usage on schema tst to anon, authenticated;
grant insert, select on tst.results to anon, authenticated;
grant usage on sequence tst.results_n_seq to anon, authenticated;

create function tst.ok(cond boolean, name text) returns void language plpgsql as $$
begin
  insert into tst.results (name, passed, detail) values (name, coalesce(cond, false), null);
end $$;

create function tst.eq(actual bigint, expected bigint, name text) returns void language plpgsql as $$
begin
  insert into tst.results (name, passed, detail)
  values (name, actual is not distinct from expected, format('expected %s, got %s', expected, actual));
end $$;

create function tst.n(q text) returns bigint language plpgsql as $$
declare c bigint;
begin
  execute format('select count(*) from (%s) s', q) into c;
  return c;
end $$;

create function tst.throws(q text, name text) returns void language plpgsql as $$
begin
  begin
    execute q;
    insert into tst.results (name, passed, detail) values (name, false, 'statement did not fail');
  exception when others then
    insert into tst.results (name, passed, detail) values (name, true, sqlerrm);
  end;
end $$;

create function tst.lives(q text, name text) returns void language plpgsql as $$
begin
  begin
    execute q;
    insert into tst.results (name, passed, detail) values (name, true, null);
  exception when others then
    insert into tst.results (name, passed, detail) values (name, false, sqlerrm);
  end;
end $$;

grant execute on all functions in schema tst to anon, authenticated;

-- Switch identity: `select tst.as('<uuid>')` then `set role authenticated`.
create function tst.as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, false);
$$;
grant execute on function tst.as(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'sa@test',         '{"full_name_en":"Super Admin"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'admin.a@test',    '{"full_name_en":"Admin A"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'cons.a@test',     '{"full_name_en":"Consultant A"}'),
  ('00000000-0000-0000-0000-0000000000a4', 'res.a@test',      '{"full_name_en":"Resident A"}'),
  ('00000000-0000-0000-0000-0000000000a5', 'nurse.a@test',    '{"full_name_en":"Nurse A"}'),
  ('00000000-0000-0000-0000-0000000000a6', 'cons.b@test',     '{"full_name_en":"Consultant B"}'),
  ('00000000-0000-0000-0000-0000000000a7', 'research@test',   '{"full_name_en":"Researcher"}'),
  ('00000000-0000-0000-0000-0000000000a8', 'ro.a@test',       '{"full_name_en":"Read Only A"}'),
  ('00000000-0000-0000-0000-0000000000a9', 'newbie@test',     '{"full_name_en":"New User"}');

select tst.eq((select count(*) from public.profiles), 9, 'profiles auto-created for new auth users');

update public.profiles set is_super_admin = true where id = '00000000-0000-0000-0000-0000000000a1';

insert into public.clinics (id, code, name_en, name_ar) values
  ('00000000-0000-0000-0000-00000000c11a', 'CLA', 'Clinic A', 'العيادة أ'),
  ('00000000-0000-0000-0000-00000000c11b', 'CLB', 'Clinic B', 'العيادة ب');

insert into public.clinic_memberships (user_id, clinic_id, role) values
  ('00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-00000000c11a', 'clinic_admin'),
  ('00000000-0000-0000-0000-0000000000a3', '00000000-0000-0000-0000-00000000c11a', 'consultant'),
  ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c11a', 'resident'),
  ('00000000-0000-0000-0000-0000000000a5', '00000000-0000-0000-0000-00000000c11a', 'nurse'),
  ('00000000-0000-0000-0000-0000000000a6', '00000000-0000-0000-0000-00000000c11b', 'consultant'),
  ('00000000-0000-0000-0000-0000000000a7', '00000000-0000-0000-0000-00000000c11a', 'researcher'),
  ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-00000000c11a', 'read_only');

insert into public.patients (id, clinic_id, mrn, first_name_en, last_name_en, date_of_birth, visibility,
                             primary_physician_id, research_consent, research_consent_at, specialties) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', 'A-001', 'Layla', 'Hassan',
   '1992-03-14', 'clinic', null, true, now(), '{obstetrics}'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000c11a', 'A-002', 'Mona', 'Saleh',
   '1988-07-02', 'private', '00000000-0000-0000-0000-0000000000a3', false, null, '{infertility}'),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000c11b', 'B-001', 'Sara', 'Ali',
   '1995-11-20', 'clinic', null, false, null, '{gynecology}');

insert into public.pregnancies (patient_id, clinic_id, lmp, gravida, para, risk_level, conception) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a', current_date - 120, 2, 1, 'high', 'spontaneous');

-- ---------------------------------------------------------------------------
-- 1. Anonymous access
-- ---------------------------------------------------------------------------
set role anon;
select tst.throws('select * from public.patients', 'anon cannot read patients');
select tst.throws('select * from public.audit_log', 'anon cannot read audit log');
select tst.throws('select public.get_my_access()', 'anon cannot call RPCs');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Patient visibility by role / clinic / private records
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 2, 'consultant A sees clinic patient + own private patient');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 1, 'resident A does not see private patient of consultant A');
select tst.eq(tst.n('select * from public.pregnancies'), 1, 'resident A sees clinical data of clinic patient');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 1, 'consultant B sees only clinic B patients');
select tst.eq(tst.n('select * from public.pregnancies'), 0, 'consultant B cannot see clinic A pregnancies');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a7'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 0, 'researcher has no identifiable patient access');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a1'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 2, 'super admin sees clinic records but not private records');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 1, 'clinic admin sees clinic demographics');
select tst.eq(tst.n('select * from public.pregnancies'), 0, 'clinic admin cannot see clinical data');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Write permissions
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a8'); set role authenticated;
select tst.throws($q$insert into public.patients (clinic_id, mrn, first_name_en, last_name_en, date_of_birth)
  values ('00000000-0000-0000-0000-00000000c11a', 'A-900', 'X', 'Y', '1990-01-01')$q$,
  'read-only user cannot register patients');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.lives($q$insert into public.patients (clinic_id, mrn, first_name_ar, last_name_ar, date_of_birth)
  values ('00000000-0000-0000-0000-00000000c11a', 'A-003', 'نور', 'أحمد', '1999-05-05')$q$,
  'nurse can register a patient in own clinic (Arabic name only)');
select tst.throws($q$insert into public.patients (clinic_id, mrn, first_name_en, last_name_en, date_of_birth)
  values ('00000000-0000-0000-0000-00000000c11b', 'B-900', 'X', 'Y', '1990-01-01')$q$,
  'nurse cannot register a patient in another clinic');
select tst.eq((select created_by = '00000000-0000-0000-0000-0000000000a5' from public.patients where mrn = 'A-003')::int, 1,
  'created_by is stamped from the JWT');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.throws($q$update public.patients set clinic_id = '00000000-0000-0000-0000-00000000c11b'
  where id = '00000000-0000-0000-0000-0000000000f1'$q$, 'patients cannot be moved between clinics by clinicians');
select tst.throws('delete from public.patients', 'patients can never be hard-deleted');
reset role;

-- ---------------------------------------------------------------------------
-- 4. Encounters: resident drafts, cannot sign; consultant signs; signed is immutable
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.lives($q$insert into public.encounters (id, patient_id, clinic_id, specialty, encounter_type, chief_complaint)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-00000000c11a', 'obstetrics', 'antenatal_visit', 'Routine ANC 17w')$q$,
  'resident can create an encounter');
select tst.throws($q$update public.encounters set status = 'signed' where id = '00000000-0000-0000-0000-0000000000e1'$q$,
  'resident cannot sign an encounter');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$update public.encounters set status = 'signed' where id = '00000000-0000-0000-0000-0000000000e1'$q$,
  'consultant can sign an encounter');
select tst.ok((select signed_by = '00000000-0000-0000-0000-0000000000a3' and signed_at is not null
               from public.encounters where id = '00000000-0000-0000-0000-0000000000e1'), 'signature metadata stamped');
select tst.throws($q$update public.encounters set plan = 'changed' where id = '00000000-0000-0000-0000-0000000000e1'$q$,
  'signed encounter is immutable');
-- amendment flow
select tst.lives($q$insert into public.encounters (id, patient_id, clinic_id, specialty, encounter_type, amends_id, plan)
  values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-00000000c11a', 'obstetrics', 'antenatal_visit',
          '00000000-0000-0000-0000-0000000000e1', 'corrected plan')$q$, 'consultant can create an amendment');
select tst.lives($q$update public.encounters set status = 'signed' where id = '00000000-0000-0000-0000-0000000000e2'$q$,
  'consultant can sign the amendment');
select tst.ok((select status = 'amended' from public.encounters where id = '00000000-0000-0000-0000-0000000000e1'),
  'original encounter is flagged as amended');
-- private physician note
select tst.lives($q$insert into public.encounters (id, patient_id, clinic_id, specialty, encounter_type, is_private, assessment)
  values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-00000000c11a', 'obstetrics', 'consultation', true, 'private note')$q$,
  'consultant can write a private note');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.eq(tst.n($q$select * from public.encounters where id = '00000000-0000-0000-0000-0000000000e3'$q$), 0,
  'private note hidden from colleagues');
select tst.eq(tst.n('select * from public.encounters'), 2, 'resident sees the shared encounters');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Sharing (grants)
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.throws($q$insert into public.patient_access_grants (patient_id, grantee_user_id, access_level)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a6', 'read')$q$,
  'resident cannot share patient records');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$insert into public.patient_access_grants (id, patient_id, grantee_user_id, access_level, reason)
  values ('00000000-0000-0000-0000-00000000aa01', '00000000-0000-0000-0000-0000000000f1',
          '00000000-0000-0000-0000-0000000000a6', 'read', 'Second opinion')$q$,
  'consultant shares a patient read-only with another clinic''s consultant');
select tst.lives($q$insert into public.patient_access_grants (patient_id, grantee_user_id, access_level, reason)
  values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000a4', 'write', 'Covering leave')$q$,
  'primary physician shares private record with resident');
select tst.throws($q$insert into public.patient_access_grants (patient_id, grantee_user_id, access_level, reason, is_emergency, expires_at)
  values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a6', 'read', 'x', true, now() + interval '1 hour')$q$,
  'emergency grants cannot be inserted directly');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 2, 'consultant B now sees the shared patient');
select tst.eq(tst.n('select * from public.pregnancies'), 1, 'consultant B sees clinical data of the shared patient');
update public.patients set phone = '000' where id = '00000000-0000-0000-0000-0000000000f1';
reset role;
select tst.ok((select phone is null from public.patients where id = '00000000-0000-0000-0000-0000000000f1'),
  'read-only grant does not allow updates');

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 3, 'resident sees private record after explicit grant');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$update public.patient_access_grants set revoked_at = now()
  where id = '00000000-0000-0000-0000-00000000aa01'$q$, 'grant can be revoked');
select tst.throws($q$update public.patient_access_grants set access_level = 'write'
  where id = '00000000-0000-0000-0000-00000000aa01'$q$, 'grants cannot be modified after the fact');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 1, 'revoked grant removes access');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Break-glass emergency access
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a1'); set role authenticated;
select tst.throws($q$select public.request_emergency_access('00000000-0000-0000-0000-0000000000f2', 'urgent')$q$,
  'emergency access requires a real justification');
select tst.lives($q$select public.request_emergency_access('00000000-0000-0000-0000-0000000000f2',
  'Patient admitted unconscious to ER, need history', 2)$q$, 'super admin can break the glass');
select tst.eq(tst.n('select * from public.patients'), 4, 'emergency grant exposes the private record');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.throws($q$select public.request_emergency_access('00000000-0000-0000-0000-0000000000f1',
  'Need to check clinical data for a complaint')$q$, 'non-clinical staff cannot break the glass');
reset role;

select tst.eq((select count(*) from public.audit_log where action = 'EMERGENCY_ACCESS'), 1,
  'break-glass event is in the audit log');

-- ---------------------------------------------------------------------------
-- 7. Privilege escalation guards
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.throws($q$update public.profiles set is_super_admin = true where id = '00000000-0000-0000-0000-0000000000a4'$q$,
  'user cannot make themselves super admin');
select tst.lives($q$update public.profiles set full_name_ar = 'طبيبة مقيمة', preferred_language = 'ar'
  where id = '00000000-0000-0000-0000-0000000000a4'$q$, 'user can edit own profile details');
select tst.throws($q$insert into public.clinic_memberships (user_id, clinic_id, role)
  values ('00000000-0000-0000-0000-0000000000a4', '00000000-0000-0000-0000-00000000c11b', 'consultant')$q$,
  'user cannot grant themselves a membership');
update public.clinic_memberships set role = 'consultant' where user_id = '00000000-0000-0000-0000-0000000000a4';
reset role;
select tst.ok((select role = 'resident' from public.clinic_memberships
               where user_id = '00000000-0000-0000-0000-0000000000a4'), 'user cannot promote themselves');

select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.lives($q$insert into public.clinic_memberships (user_id, clinic_id, role)
  values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-00000000c11a', 'nurse')$q$,
  'clinic admin can add staff to own clinic');
select tst.throws($q$insert into public.clinic_memberships (user_id, clinic_id, role)
  values ('00000000-0000-0000-0000-0000000000a9', '00000000-0000-0000-0000-00000000c11b', 'nurse')$q$,
  'clinic admin cannot add staff to another clinic');
select tst.throws($q$update public.clinic_memberships set role = 'clinic_admin'
  where user_id = '00000000-0000-0000-0000-0000000000a9'$q$, 'clinic admin cannot appoint clinic admins');
select tst.throws($q$insert into public.clinic_memberships (user_id, clinic_id, role)
  values ('00000000-0000-0000-0000-0000000000a8', '00000000-0000-0000-0000-00000000c11b', 'super_admin')$q$,
  'super_admin is not assignable as a clinic role');
reset role;

-- ---------------------------------------------------------------------------
-- 8. Documents & storage
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.lives($q$insert into storage.objects (bucket_id, name) values ('patient-documents',
  '00000000-0000-0000-0000-00000000c11a/00000000-0000-0000-0000-0000000000f1/1-scan.pdf')$q$,
  'resident can upload a file for an accessible patient');
select tst.lives($q$insert into public.documents (id, patient_id, clinic_id, storage_path, file_name, mime_type, size_bytes, category)
  values ('00000000-0000-0000-0000-00000000d0c1', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000c11a',
          '00000000-0000-0000-0000-00000000c11a/00000000-0000-0000-0000-0000000000f1/1-scan.pdf',
          'scan.pdf', 'application/pdf', 1024, 'ultrasound')$q$, 'resident can register document metadata');
select tst.throws($q$insert into storage.objects (bucket_id, name) values ('patient-documents',
  '00000000-0000-0000-0000-00000000c11b/00000000-0000-0000-0000-0000000000f3/1-x.pdf')$q$,
  'resident cannot upload into another clinic''s patient folder');
select tst.throws($q$insert into storage.objects (bucket_id, name) values ('patient-documents',
  '00000000-0000-0000-0000-00000000c11b/00000000-0000-0000-0000-0000000000f1/1-x.pdf')$q$,
  'path must match the patient''s owning clinic');
select tst.throws($q$update public.documents set deleted_at = now() where id = '00000000-0000-0000-0000-00000000d0c1'$q$,
  'resident cannot archive documents');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a8'); set role authenticated;
select tst.eq(tst.n($q$select * from storage.objects where bucket_id = 'patient-documents'$q$), 1,
  'read-only colleague can read the stored file');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.eq(tst.n($q$select * from storage.objects$q$), 0, 'other clinic cannot read the stored file');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$update public.documents set deleted_at = now() where id = '00000000-0000-0000-0000-00000000d0c1'$q$,
  'consultant can archive a document');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a8'); set role authenticated;
select tst.eq(tst.n($q$select * from storage.objects$q$), 0, 'archived document file no longer readable by read-only user');
reset role;

-- ---------------------------------------------------------------------------
-- 9. Research: de-identified cohort only
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$insert into public.research_projects (id, title, status, irb_reference, irb_approved_at, principal_investigator_id)
  values ('00000000-0000-0000-0000-00000000bb01', 'Preterm birth predictors', 'active', 'IRB-2026-14', current_date,
          '00000000-0000-0000-0000-0000000000a3')$q$, 'consultant can create an IRB-approved project');
select tst.lives($q$insert into public.research_project_members (project_id, user_id, role) values
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000a3', 'pi'),
  ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000a7', 'analyst')$q$, 'PI adds members');
select tst.lives($q$insert into public.research_enrollments (project_id, patient_id, consent_obtained_at)
  values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000f1', now())$q$,
  'consented patient can be enrolled');
select tst.throws($q$insert into public.research_enrollments (project_id, patient_id, consent_obtained_at)
  values ('00000000-0000-0000-0000-00000000bb01', '00000000-0000-0000-0000-0000000000f2', now())$q$,
  'non-consented patient cannot be enrolled');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a7'); set role authenticated;
select tst.eq(tst.n($q$select * from public.research_cohort('00000000-0000-0000-0000-00000000bb01')$q$), 1,
  'researcher gets the de-identified cohort');
select tst.ok((select age_band = '30-34' and pregnancies_total = 1 and high_risk_ever
               from public.research_cohort('00000000-0000-0000-0000-00000000bb01')), 'cohort row is correct and banded');
select tst.eq(tst.n('select * from public.research_enrollments'), 0, 'researcher cannot see identifiable enrollment rows');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a5'); set role authenticated;
select tst.throws($q$select * from public.research_cohort('00000000-0000-0000-0000-00000000bb01')$q$,
  'non-member cannot query a research cohort');
reset role;

-- ---------------------------------------------------------------------------
-- 10. Archiving patients
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.throws($q$update public.patients set deleted_at = now() where mrn = 'A-003'$q$,
  'resident cannot archive a patient');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.lives($q$update public.patients set deleted_at = now() where mrn = 'A-003'$q$, 'consultant can archive a patient');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.eq(tst.n($q$select * from public.patients where mrn = 'A-003'$q$), 0, 'archived patient hidden from resident');
reset role;

-- ---------------------------------------------------------------------------
-- 11. Audit log
-- ---------------------------------------------------------------------------
select tst.as('00000000-0000-0000-0000-0000000000a2'); set role authenticated;
select tst.ok(tst.n('select * from public.audit_log') > 0, 'clinic admin can read own clinic audit trail');
select tst.eq(tst.n($q$select * from public.audit_log where clinic_id = '00000000-0000-0000-0000-00000000c11b'$q$), 0,
  'clinic admin cannot read other clinics'' audit trail');
select tst.throws($q$insert into public.audit_log (action) values ('VIEW')$q$, 'clients cannot forge audit rows');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a4'); set role authenticated;
select tst.eq(tst.n('select * from public.audit_log'), 0, 'resident has no audit access');
select tst.lives($q$select public.log_access_event('VIEW', '00000000-0000-0000-0000-0000000000f1')$q$,
  'clinician can log a view event');
select tst.throws($q$select public.log_access_event('VIEW', '00000000-0000-0000-0000-0000000000f3')$q$,
  'cannot log events for inaccessible patients');
reset role;

select tst.throws('update public.audit_log set action = ''VIEW''', 'audit log is append-only (update)');
select tst.throws('delete from public.audit_log', 'audit log is append-only (delete)');
select tst.ok((select changed_fields = '{status}' or changed_fields @> '{status}' from public.audit_log
               where table_name = 'encounters' and action = 'UPDATE'
               and record_id = '00000000-0000-0000-0000-0000000000e1' order by id limit 1),
  'audit records which fields changed');

-- ---------------------------------------------------------------------------
-- 12. Deactivation & RPCs
-- ---------------------------------------------------------------------------
update public.clinic_memberships set is_active = false where user_id = '00000000-0000-0000-0000-0000000000a8';
select tst.as('00000000-0000-0000-0000-0000000000a8'); set role authenticated;
select tst.eq(tst.n('select * from public.patients'), 0, 'deactivated membership loses access immediately');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a3'); set role authenticated;
select tst.ok((select (public.get_my_access() -> 'memberships' -> 0 ->> 'role') = 'consultant'), 'get_my_access returns role');
select tst.ok((select (public.dashboard_stats() ->> 'high_risk_pregnancies')::int = 1), 'dashboard_stats respects RLS');
reset role;

select tst.as('00000000-0000-0000-0000-0000000000a6'); set role authenticated;
select tst.ok((select (public.dashboard_stats() ->> 'active_pregnancies')::int = 0), 'dashboard_stats hides other clinics');
reset role;


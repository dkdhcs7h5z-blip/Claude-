# Security & Access Model

## Roles

Roles are assigned **per clinic** (`clinic_memberships.role`); one person can be a Consultant in one clinic and a Specialist in another. **Super Administrator** is the only global role (`profiles.is_super_admin`).

| Role | Intent |
|---|---|
| Super Administrator | Platform owner: all clinics, all permissions on *clinic-visible* records; private records only via audited break-glass |
| Clinic Administrator | Registration and staff management for their clinic; **no clinical content** |
| Consultant | Full clinical authority, signing, sharing, archiving, research management |
| Specialist | Clinical authority and signing; can share; no archiving of patients |
| Resident | Clinical documentation; **cannot sign** encounters or share records |
| Nurse | Registration, clinical documentation (e.g. vitals), document upload |
| Researcher | **De-identified** research cohorts only; no identifiable patient access |
| Read-only | View patients, clinical data and documents |

The exact matrix is in `supabase/migrations/…0001_core_identity.sql` (authoritative) and mirrored in `src/rbac/permissions.ts`; a unit test fails if they differ. It is shown in-app under **Permission Matrix**.

## How a patient-record decision is made

`private.patient_can(patient, permission)` returns true if **any** path applies:

1. **Super admin** — record visibility is `clinic`.
2. **Owning clinic** — visibility is `clinic` and the user's role in that clinic has the permission.
3. **Primary physician** — the user is the record's primary physician and their role has the permission.
4. **User grant** — an active (not revoked/expired) grant to the user; write permissions need an `access_level = 'write'` grant. The user's role must still carry the permission (a grant never gives a Researcher clinical access).
5. **Clinic grant** — an active grant to a clinic the user belongs to (only for `clinic` visibility).

Additional rules:

- **Private records** (`visibility = 'private'`): paths 3–4 only — the physician's own patients.
- **Private notes/documents** (`is_private`): visible only to the author (and active emergency access).
- **Break-glass:** `request_emergency_access()` requires clinical staff, a written justification (≥ 15 chars), max 24 h, read-only; logged as `EMERGENCY_ACCESS` for review.
- **Archived** patients/documents are hidden from users without the delete permission. Nothing clinical is ever hard-deleted.

## Integrity rules (triggers)

- Users cannot change their own super-admin/active flags or their own memberships.
- Only super admins can appoint clinic administrators or move a patient between clinics.
- Changing a record's visibility or primary physician requires `patient.share`.
- Encounters: only roles with `clinical.sign` can sign; **signed encounters are immutable** — corrections are amendments (`amends_id`), which flag the original as `amended`.
- Grants can be created or revoked, never edited; emergency grants only via RPC.
- Research enrollment requires recorded patient consent and an active IRB-approved project.
- `created_by`, `provider_id`, `uploaded_by`, `granted_by`, signature fields are stamped from the JWT, not trusted from the client.

## Research de-identification

Researchers never query patient tables. `research_cohort(project)` (security definer) checks project membership, `research.access`, active status and IRB expiry, logs `RESEARCH_QUERY`, and returns only: pseudonymous subject code, **5-year age band (top-coded 50+)**, blood group, specialties, counts and categorical summaries, and **enrollment month**. No names, contact details, identifiers or exact dates. Only consented, non-withdrawn, non-archived patients are included.

## Audit log

- Every INSERT/UPDATE/DELETE on all clinical and identity tables is captured by trigger with old/new values and the list of changed fields.
- Reads are logged via `log_access_event()` — the app records `VIEW` when a patient record is opened and `DOWNLOAD` when a document is opened.
- The table is **append-only**: UPDATE/DELETE/TRUNCATE raise errors even for the owner; clients have SELECT only (scoped by `audit.read` per clinic).

## Document storage

- Private bucket `patient-documents`, 50 MB limit, MIME allow-list.
- Path `{clinic_id}/{patient_id}/{uuid}-{sanitized-name}`; upload policy checks `document.upload` on the patient encoded in the path and that the path's clinic matches the patient's clinic.
- Read policy delegates to the `documents` row's RLS, so private/archived rules apply to the file too.
- Files open via **60-second signed URLs**; no client UPDATE/DELETE on objects. SHA-256 is recorded for integrity.

## Verified by tests

`npm run test:db` applies all migrations to a fresh PostgreSQL 16 database and runs 300 cases covering anonymous access, cross-clinic isolation, private records, role limits, sharing and revocation, break-glass, privilege escalation, encounter signing/amendment, storage paths, research de-identification, archiving, audit immutability, deactivation, and obstetric data integrity (dating rules, signed-visit immutability, private visit vitals, delivery rules), gynecology record integrity, and fertility integrity (embryo ownership and availability at transfer, frozen-embryo storage data, Gardner fields, retrieval counts, transfer outcome consistency, cross-clinic isolation), and fetal medicine integrity (scan-type matching, plurality limits, survey/conclusion consistency, cfDNA and procedure result rules, private-patient and read-only access).

## Production deployment checklist

These are deployment responsibilities outside the codebase:

- [ ] Disable public sign-up in Supabase Auth; staff are invited (`invite-user` function).
- [ ] Enforce **MFA** for all staff (Supabase Auth MFA/TOTP); require it for admin roles at minimum.
- [ ] Set password policy, session timeout and refresh-token rotation.
- [ ] Choose a hosting region that meets your data-residency law; sign the provider's BAA/DPA where required (e.g. HIPAA, GDPR).
- [ ] Enable Point-in-Time Recovery and test restores; define retention per local medical-records law.
- [ ] Never ship the `service_role` key to the browser; only the anon key belongs in `VITE_*` variables.
- [ ] Set `ALLOWED_ORIGIN` for the edge function to your app's domain.
- [ ] Serve over HTTPS with HSTS and a Content-Security-Policy restricting `connect-src` to your Supabase project.
- [ ] Schedule review of `EMERGENCY_ACCESS` events and periodic access recertification of memberships.
- [ ] Schedule a job to remove orphaned storage objects (upload succeeded, metadata insert failed).
- [ ] Commission an independent penetration test before go-live.

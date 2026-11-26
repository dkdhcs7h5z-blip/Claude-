# Architecture

## Principles

1. **The database is the security boundary.** Every authorization rule lives in PostgreSQL Row Level Security (RLS) and triggers. The React app only *mirrors* rules to hide controls the user cannot use; bypassing the UI gains nothing.
2. **Centralized data, hybrid access.** One database for all clinics. Access is the intersection of *who you are* (role per clinic), *where you work* (clinic memberships) and *what you were granted* (patient-level visibility and grants).
3. **Modular by specialty.** Each specialty is a module registered in `src/modules/registry.ts`; shared concepts (patient, encounter, document) are common tables.
4. **Bilingual by design.** UI language is a per-user preference; clinical data is never translated or rewritten. Names are stored in both scripts where available.
5. **Append-only accountability.** Every data change and sensitive read is recorded in an immutable audit log.

## Layers

```
┌──────────────────────── Browser (React SPA / PWA) ─────────────────────────┐
│ modules/* ── pages, per-specialty UI                                        │
│ auth/     ── session, current access (get_my_access RPC), route guards      │
│ rbac/     ── permission matrix + patientCan() mirror (UI gating only)       │
│ data/     ── DataService interface                                          │
│             ├─ SupabaseService  (production; all calls subject to RLS)      │
│             └─ DemoService      (in-memory; same rules via rbac/access.ts)  │
└─────────────────────────────────────────────────────────────────────────────┘
                 │ HTTPS (JWT)                        │ signed URLs (60 s)
┌────────────────▼──────────────┐      ┌──────────────▼───────────────────────┐
│ Supabase PostgREST / RPC       │      │ Supabase Storage                     │
│  public schema: tables + RLS   │      │  bucket patient-documents (private)  │
│  private schema: helper fns    │      │  object RLS → documents row RLS      │
│  (not exposed over the API)    │      └──────────────────────────────────────┘
└────────────────┬──────────────┘
┌────────────────▼──────────────┐
│ Edge Functions                 │  invite-user (service role, re-checks caller)
└───────────────────────────────┘
```

## Data model (Phase 1)

| Area | Tables |
|---|---|
| Identity | `clinics`, `profiles` (1:1 `auth.users`), `clinic_memberships` (user × clinic × role) |
| Authorization | `permissions`, `role_permissions`, `patient_access_grants` |
| Patients | `patients` (bilingual names, demographics, visibility, consent, soft delete) |
| Clinical core | `encounters` (all specialties; draft → signed → amended), `pregnancies`, `fertility_cycles`, `fetal_assessments` |
| Obstetrics | `pregnancies` (dating & booking fields), `antenatal_visits` (1:1 with an encounter), `deliveries`, `newborns`; view `obstetric_worklist` |
| Documents | `documents` (metadata, SHA-256, private flag) + storage bucket |
| Research | `research_projects` (IRB), `research_project_members`, `research_enrollments` (pseudonymous subject codes) |
| Accountability | `audit_log` (append-only) |

Specialty-specific structured data that is still evolving lives in `jsonb` columns (`encounters.data`, `fertility_cycles.data`, `fetal_assessments.findings`). As Phase 2 forms stabilise, frequently queried fields are promoted to typed columns or dedicated tables.

### Migrations

| File | Content |
|---|---|
| `…0001_core_identity.sql` | enums, clinics, profiles, memberships, permission catalog & role matrix |
| `…0002_patients_clinical.sql` | patients, grants, encounters, pregnancies, cycles, fetal assessments, documents |
| `…0003_research.sql` | research projects / members / enrollments |
| `…0004_authorization_rls.sql` | helper functions, integrity triggers, RLS policies |
| `…0005_audit_and_rpc.sql` | audit log + triggers; RPCs `get_my_access`, `dashboard_stats`, `log_access_event`, `request_emergency_access`, `research_cohort` |
| `…0006_storage.sql` | private bucket and object policies |
| `…0007_obstetrics.sql` | dating fields, antenatal visits, deliveries, newborns, worklist view; RPCs `record_antenatal_visit`, `record_delivery` |

**Rule for new migrations:** every new table must `enable row level security`, `revoke all … from anon`, get explicit policies, and get an `_audit` trigger. Add cases to `supabase/tests/rls_tests.sql`.

## Frontend conventions

- **Adding a module:** create `src/modules/<name>/`, add a `NavItem` with its required permissions to `registry.ts`, add a guarded route in `App.tsx` (lazy-loaded), add `en`/`ar` strings.
- **Data access:** add methods to `DataService` and implement in both services. Components never import the Supabase client directly.
- **RTL:** use logical Tailwind utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`). Wrap MRNs, phone numbers, lab values and GA (e.g. `24+3`) in `.ltr-num`. Directional icons get `rtl:rotate-180`.
- **Dates:** formatted with `Intl` using `ar-EG-u-nu-latn` (Arabic text, Latin digits) or `en-GB`. Calendar dates (DOB, LMP, EDD) are `date` columns and calculated in UTC (`src/clinical/obstetrics.ts`).
- **Query cache:** cleared on every auth change so one user's PHI is never shown to the next.

## PWA

`vite-plugin-pwa` generates a service worker that precaches only the application shell. **API, auth and storage responses are never cached** (no runtime caching) so PHI does not persist on shared devices. Updates are prompt-based to avoid reloading over an unsaved form. Offline clinical data entry is intentionally deferred (it needs encrypted local storage and conflict resolution — see roadmap).

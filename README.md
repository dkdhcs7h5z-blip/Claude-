# Women's Health & Reproductive Medicine Intelligence System

**نظام صحة المرأة والطب التناسلي الذكي**

A secure, multi-user Electronic Medical Record (EMR) and clinical research platform for:

| Specialty | التخصص |
|---|---|
| Obstetrics & pregnancy management | التوليد ومتابعة الحمل |
| Gynecology | أمراض النساء |
| Infertility & reproductive medicine | العقم والطب التناسلي |
| Fetal medicine | طب الأجنة |

Built with **React + TypeScript + Vite**, **Supabase** (Auth, PostgreSQL, Storage, Edge Functions), full **Arabic/English with RTL/LTR**, responsive for desktop/tablet/phone, and installable as a **PWA**.

> **Status: Phase 2 in progress.** Phase 1 foundation (authentication, role-based access, patient management, secure documents, audit logging, dashboard, modular shell) is complete. The **Obstetrics module** is implemented — dating, high-risk assessment, antenatal flow sheet, fetal growth & multiples, partogram, delivery, postnatal care, printable antenatal card and worklist ([clinical spec](docs/OBSTETRICS.md)). The **Gynecology module** is implemented — history, PALM-COEIN visits, cervical screening with next-step support, colposcopy, pelvic ultrasound with IOTA, procedures and worklist ([clinical spec](docs/GYNECOLOGY.md)). Infertility and fetal medicine follow — see [docs/ROADMAP.md](docs/ROADMAP.md).

---

## Quick start

### Demo mode (no backend)

```bash
npm install
npm run dev          # http://localhost:5173
```

With no Supabase credentials the app runs against an **in-memory demo backend** with fictional data. The login page lets you sign in as any of the eight roles to see how permissions change what is visible. The demo enforces the same access rules as the database (via `src/rbac/access.ts`), but data resets on reload.

### With Supabase

1. Create a Supabase project (choose a region that satisfies your data-residency requirements).
2. Apply the schema:
   ```bash
   npx supabase link --project-ref <your-ref>
   npx supabase db push              # applies supabase/migrations/*
   npx supabase functions deploy invite-user
   ```
3. Configure the frontend:
   ```bash
   cp .env.example .env.local        # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
   npm run dev
   ```
4. In the Supabase dashboard → Authentication: **disable public sign-ups** (staff are invited), and create your first user.
5. Promote that user and create clinics (SQL editor):
   ```sql
   update public.profiles set is_super_admin = true where email = 'you@example.org';
   insert into public.clinics (code, name_en, name_ar) values ('MAIN', 'Main Clinic', 'العيادة الرئيسية');
   ```
6. Invite other staff from **Staff & Roles**.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check + production build (with service worker) |
| `npm test` | Unit tests (dating, risk rules, care schedule, permission matrix ↔ SQL sync, access logic) |
| `npm run test:db` | Applies all migrations to a scratch PostgreSQL DB and runs the **195-case RLS/authorization/clinical-integrity suite** (needs local `psql`) |

## Project layout

```
src/
  auth/          AuthProvider, route guards, login
  rbac/          Roles, permission matrix, patient access rule (TS mirror of SQL)
  data/          DataService interface + Supabase and Demo implementations
  modules/       Feature modules (dashboard, patients, specialty, research, admin, settings)
    registry.ts  Navigation + route permissions — register new modules here
  clinical/      Clinical calculations (GA, EDD, GPAL …) with tests
  i18n/          English & Arabic resources, RTL handling
  layout/        Responsive app shell (sidebar flips side in RTL)
supabase/
  migrations/    Schema, RLS, audit, RPCs, storage policies (ordered)
  functions/     Edge functions (invite-user)
  tests/         Plain-PostgreSQL harness + RLS test suite
docs/            Architecture, security model, roadmap
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — modules, data flow, schema overview
- [Security & access model](docs/SECURITY.md) — roles, permissions, RLS, audit, storage, compliance checklist
- [Obstetrics clinical specification](docs/OBSTETRICS.md) — every rule, threshold and source
- [Gynecology clinical specification](docs/GYNECOLOGY.md)
- [Roadmap](docs/ROADMAP.md) — Phase 2+

## Important

This software handles protected health information. Before production use, complete the deployment checklist in [docs/SECURITY.md](docs/SECURITY.md), and have the configuration reviewed against the regulations that apply where you operate.

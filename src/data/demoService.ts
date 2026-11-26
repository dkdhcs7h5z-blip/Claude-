import type { DataService, AuthUser } from './service';
import type {
  CervicalScreening, Colposcopy, GynDetail, GynProcedure, GynProfile, GynUltrasound, GynVisit, GynVisitRow, GynWorklistRow,
  FetalBiometry, LabourObservation, PostnatalVisit, PostnatalVisitRow,
  AccessGrant, AntenatalVisit, AntenatalVisitRow, AuditEvent, Delivery, DocumentMeta, Encounter, MyAccess, Newborn,
  ObstetricWorklistRow, Patient, PatientInput, Pregnancy, Profile, StaffMember,
} from './types';
import { gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { hadlockEfw } from '@/clinical/fetalGrowth';
import type { Permission } from '@/rbac/permissions';
import { ROLE_PERMISSIONS } from '@/rbac/permissions';
import { hasPermission, hasPermissionAnywhere, patientCan } from '@/rbac/access';
import {
  DEMO_CLINICS, DEMO_CYCLES, DEMO_DOCUMENTS, DEMO_ENCOUNTERS, DEMO_FETAL, DEMO_GRANTS, DEMO_PATIENTS,
  DEMO_PREGNANCIES, DEMO_RESEARCH, DEMO_RESEARCH_MEMBERS, DEMO_USERS, seedAudit, type DemoUser,
  DEMO_VISITS, DEMO_VISIT_ENCOUNTERS, DEMO_DELIVERIES, DEMO_NEWBORNS,
  DEMO_GYN_PROFILES, DEMO_GYN_VISITS, DEMO_GYN_ENCOUNTERS, DEMO_GYN_US, DEMO_SCREENINGS, DEMO_COLPOSCOPIES, DEMO_GYN_PROCEDURES,
  DEMO_DELIVERIES_EXTRA, DEMO_SCANS, DEMO_BIOMETRY_SEED, DEMO_POSTNATAL, DEMO_POSTNATAL_ENCOUNTERS, DEMO_LABOUR,
} from './demoData';
import { buildStoragePath, MAX_UPLOAD_BYTES } from '@/lib/files';

const SESSION_KEY = 'whrmis.demo.user';
const clone = <T,>(v: T): T => structuredClone(v);
const nowIso = () => new Date().toISOString();
const delay = (ms = 120) => new Promise((r) => setTimeout(r, ms));

function readSession(): string | null {
  try { return sessionStorage.getItem(SESSION_KEY); } catch { return null; }
}
function writeSession(v: string | null) {
  try { if (v) sessionStorage.setItem(SESSION_KEY, v); else sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

class Forbidden extends Error {
  constructor(msg = 'Permission denied (demo RLS)') { super(msg); }
}

/**
 * In-memory backend that applies the same authorization rules as the database
 * (via the TypeScript mirror in rbac/access.ts). Data resets on reload.
 */
export class DemoService implements DataService {
  readonly mode = 'demo' as const;
  private users: DemoUser[] = clone(DEMO_USERS);
  private patients: Patient[] = clone(DEMO_PATIENTS);
  private pregnancies = clone(DEMO_PREGNANCIES);
  private cycles = clone(DEMO_CYCLES);
  private fetal = clone([...DEMO_FETAL, ...DEMO_SCANS]);
  private encounters: Encounter[] = clone([...DEMO_ENCOUNTERS, ...DEMO_VISIT_ENCOUNTERS, ...DEMO_POSTNATAL_ENCOUNTERS, ...DEMO_GYN_ENCOUNTERS]);
  private gynProfiles: GynProfile[] = clone(DEMO_GYN_PROFILES);
  private gynVisits: GynVisit[] = clone(DEMO_GYN_VISITS);
  private gynUs: GynUltrasound[] = clone(DEMO_GYN_US);
  private screenings: CervicalScreening[] = clone(DEMO_SCREENINGS);
  private colposcopies: Colposcopy[] = clone(DEMO_COLPOSCOPIES);
  private gynProcedures: GynProcedure[] = clone(DEMO_GYN_PROCEDURES);
  private biometry: FetalBiometry[] = clone(DEMO_BIOMETRY_SEED).map((b) => ({ ...b, efw_g: hadlockEfw(b.hc_mm, b.ac_mm, b.fl_mm) ?? b.efw_g }));
  private postnatal: PostnatalVisit[] = clone(DEMO_POSTNATAL);
  private labour: LabourObservation[] = clone(DEMO_LABOUR);
  private visits: AntenatalVisit[] = clone(DEMO_VISITS);
  private deliveries: Delivery[] = clone([...DEMO_DELIVERIES, ...DEMO_DELIVERIES_EXTRA]);
  private newborns: Newborn[] = clone(DEMO_NEWBORNS);
  private signatures = new Map<string, { by: string; at: string }>(
    [...DEMO_ENCOUNTERS, ...DEMO_VISIT_ENCOUNTERS, ...DEMO_POSTNATAL_ENCOUNTERS, ...DEMO_GYN_ENCOUNTERS].filter((e) => e.status === 'signed').map((e) => [e.id, { by: e.provider_id, at: e.encounter_at }]),
  );
  private documents: DocumentMeta[] = clone(DEMO_DOCUMENTS);
  private grants: AccessGrant[] = clone(DEMO_GRANTS);
  private audit: AuditEvent[] = seedAudit();
  private blobs = new Map<string, Blob>();
  private listeners = new Set<(u: AuthUser | null) => void>();
  private currentId: string | null = readSession();

  // --- helpers ----------------------------------------------------------------
  private me(): DemoUser | null {
    return this.users.find((u) => u.id === this.currentId) ?? null;
  }

  private access(): MyAccess | null {
    const u = this.me();
    if (!u) return null;
    return {
      user_id: u.id,
      is_super_admin: u.is_super_admin && u.is_active,
      is_active: u.is_active,
      memberships: u.memberships
        .filter((m) => m.is_active)
        .map((m) => {
          const c = DEMO_CLINICS.find((x) => x.id === m.clinic_id)!;
          return {
            clinic_id: c.id, clinic_code: c.code, clinic_name_en: c.name_en, clinic_name_ar: c.name_ar,
            role: m.role, permissions: [...ROLE_PERMISSIONS[m.role]],
          };
        }),
    };
  }

  private can(p: Patient, perm: Permission) {
    return patientCan(this.access(), p, this.grants, perm);
  }

  private emergency(patientId: string) {
    const uid = this.currentId;
    return this.grants.some((g) => g.patient_id === patientId && g.grantee_user_id === uid && g.is_emergency
      && !g.revoked_at && g.expires_at && new Date(g.expires_at) > new Date());
  }

  private patientOrThrow(id: string, perm: Permission) {
    const p = this.patients.find((x) => x.id === id);
    if (!p || !this.can(p, perm)) throw new Forbidden();
    return p;
  }

  private log(action: AuditEvent['action'], table: string | null, patientId: string | null, extra: Partial<AuditEvent> = {}) {
    const p = patientId ? this.patients.find((x) => x.id === patientId) : null;
    this.audit.unshift({
      id: (this.audit[0]?.id ?? 0) + 1, occurred_at: nowIso(), actor_id: this.currentId, action, table_name: table,
      record_id: null, patient_id: patientId, clinic_id: p?.clinic_id ?? null, changed_fields: null, context: {}, ...extra,
    });
  }

  private emit() {
    const u = this.me();
    this.listeners.forEach((cb) => cb(u ? { id: u.id, email: u.email } : null));
  }

  // --- auth -------------------------------------------------------------------
  async getCurrentUser() {
    const u = this.me();
    return u ? { id: u.id, email: u.email } : null;
  }

  onAuthChange(cb: (u: AuthUser | null) => void) {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  /** Demo sign-in: the "email" is the demo user id chosen on the login page. */
  async signInWithPassword(userId: string) {
    await delay();
    if (!this.users.some((u) => u.id === userId)) throw new Error('Unknown demo user');
    this.currentId = userId;
    writeSession(userId);
    this.log('SIGN_IN', null, null);
    this.emit();
  }

  async sendPasswordReset() { await delay(); }

  async signOut() {
    this.log('SIGN_OUT', null, null);
    this.currentId = null;
    writeSession(null);
    this.emit();
  }

  // --- identity ---------------------------------------------------------------
  async getMyAccess() { return this.access(); }

  async getMyProfile(): Promise<Profile | null> {
    const u = this.me();
    if (!u) return null;
    const { memberships: _m, ...p } = u;
    return clone(p);
  }

  async updateMyProfile(patch: Partial<Profile>) {
    const u = this.me();
    if (!u) throw new Forbidden();
    Object.assign(u, patch);
  }

  async listClinics() {
    const a = this.access();
    if (!a) return [];
    if (a.is_super_admin || hasPermissionAnywhere(a, 'patient.share')) return clone(DEMO_CLINICS);
    return clone(DEMO_CLINICS.filter((c) => a.memberships.some((m) => m.clinic_id === c.id)));
  }

  async listProfiles(ids?: string[]) {
    return this.users
      .filter((u) => !ids || ids.includes(u.id))
      .map(({ memberships: _m, ...p }) => clone(p));
  }

  // --- dashboard --------------------------------------------------------------
  async dashboardStats(clinicId?: string | null) {
    await delay(80);
    const inClinic = <T extends { clinic_id: string }>(x: T) => !clinicId || x.clinic_id === clinicId;
    const visiblePatients = new Set(this.patients.filter((p) => this.can(p, 'patient.read')).map((p) => p.id));
    const clinical = (pid: string) => {
      const p = this.patients.find((x) => x.id === pid);
      return !!p && this.can(p, 'clinical.read');
    };
    const preg = this.pregnancies.filter((g) => inClinic(g) && clinical(g.patient_id) && g.status === 'active');
    const today = new Date().toDateString();
    return {
      patients: this.patients.filter((p) => !p.deleted_at && inClinic(p) && visiblePatients.has(p.id)).length,
      active_pregnancies: preg.length,
      high_risk_pregnancies: preg.filter((g) => g.risk_level === 'high').length,
      active_fertility_cycles: this.cycles.filter((c) => inClinic(c) && clinical(c.patient_id)
        && !['completed', 'cancelled'].includes(c.status)).length,
      fetal_assessments_30d: this.fetal.filter((f) => inClinic(f) && clinical(f.patient_id)
        && Date.now() - new Date(f.performed_at).getTime() < 30 * 86_400_000).length,
      encounters_today: this.encounters.filter((e) => inClinic(e) && clinical(e.patient_id)
        && new Date(e.encounter_at).toDateString() === today).length,
      unsigned_encounters: this.encounters.filter((e) => e.status === 'draft' && e.provider_id === this.currentId).length,
    };
  }

  // --- patients ---------------------------------------------------------------
  async listPatients({ search, specialty, clinicId, limit = 100 }: Parameters<DataService['listPatients']>[0]) {
    await delay();
    const term = search?.trim().toLowerCase();
    return clone(
      this.patients
        .filter((p) => !p.deleted_at && this.can(p, 'patient.read'))
        .filter((p) => !clinicId || p.clinic_id === clinicId)
        .filter((p) => !specialty || specialty === 'all' || p.specialties.includes(specialty))
        .filter((p) => !term || [p.mrn, p.first_name_en, p.last_name_en, p.first_name_ar, p.last_name_ar, p.phone, p.national_id]
          .some((v) => v?.toLowerCase().includes(term)))
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .slice(0, limit),
    );
  }

  async getPatient(id: string) {
    await delay(60);
    const p = this.patients.find((x) => x.id === id);
    if (!p || !this.can(p, 'patient.read')) return null;
    if (p.deleted_at && !this.can(p, 'patient.delete')) return null;
    return clone(p);
  }

  async createPatient(input: PatientInput) {
    await delay();
    const a = this.access();
    if (!hasPermission(a, 'patient.create', input.clinic_id)) throw new Forbidden();
    if (input.visibility === 'private' && input.primary_physician_id !== this.currentId) throw new Forbidden();
    if (this.patients.some((p) => p.clinic_id === input.clinic_id && p.mrn === input.mrn)) {
      throw new Error('duplicate key value violates unique constraint "patients_clinic_id_mrn_key"');
    }
    const p: Patient = { ...input, id: crypto.randomUUID(), created_by: this.currentId, created_at: nowIso(), updated_at: nowIso(), deleted_at: null };
    this.patients.push(p);
    this.log('INSERT', 'patients', p.id);
    return clone(p);
  }

  async updatePatient(id: string, patch: Partial<PatientInput>) {
    await delay();
    const p = this.patientOrThrow(id, 'patient.update');
    if (patch.clinic_id && patch.clinic_id !== p.clinic_id && !this.access()?.is_super_admin) {
      throw new Forbidden('Transferring a patient requires a super administrator');
    }
    if ((patch.visibility && patch.visibility !== p.visibility)
      || (patch.primary_physician_id !== undefined && patch.primary_physician_id !== p.primary_physician_id)) {
      if (!this.can(p, 'patient.share')) throw new Forbidden('Changing visibility requires patient.share');
    }
    const changed = Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== (p as unknown as Record<string, unknown>)[k]);
    Object.assign(p, patch, { updated_at: nowIso() });
    this.log('UPDATE', 'patients', id, { changed_fields: changed });
    return clone(p);
  }

  async archivePatient(id: string) {
    const p = this.patientOrThrow(id, 'patient.delete');
    p.deleted_at = nowIso();
    this.log('UPDATE', 'patients', id, { changed_fields: ['deleted_at'] });
  }

  async getPatientClinical(id: string) {
    await delay(80);
    const p = this.patients.find((x) => x.id === id);
    if (!p || !this.can(p, 'clinical.read')) {
      return { pregnancies: [], fertility_cycles: [], fetal_assessments: [], encounters: [] };
    }
    return clone({
      pregnancies: this.pregnancies.filter((g) => g.patient_id === id),
      fertility_cycles: this.cycles.filter((c) => c.patient_id === id),
      fetal_assessments: this.fetal.filter((f) => f.patient_id === id),
      encounters: this.encounters.filter((e) => e.patient_id === id
        && (!e.is_private || e.provider_id === this.currentId || this.emergency(id))),
    });
  }

  // --- documents ----------------------------------------------------------------
  async listDocuments(patientId: string) {
    const p = this.patients.find((x) => x.id === patientId);
    if (!p || !this.can(p, 'document.read')) return [];
    return clone(this.documents.filter((d) => d.patient_id === patientId && !d.deleted_at
      && (!d.is_private || d.uploaded_by === this.currentId || this.emergency(patientId))));
  }

  async uploadDocument(patient: { id: string; clinic_id: string }, file: File, meta: Parameters<DataService['uploadDocument']>[2]) {
    await delay(300);
    this.patientOrThrow(patient.id, 'document.upload');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('File exceeds the 50 MB limit');
    const id = crypto.randomUUID();
    const doc: DocumentMeta = {
      id, patient_id: patient.id, clinic_id: patient.clinic_id,
      storage_path: buildStoragePath(patient.clinic_id, patient.id, file.name, id),
      file_name: file.name, mime_type: file.type || 'application/octet-stream', size_bytes: file.size,
      category: meta.category, description: meta.description || null, is_private: meta.is_private ?? false,
      uploaded_by: this.currentId!, uploaded_at: nowIso(), deleted_at: null,
    };
    this.blobs.set(doc.storage_path, file);
    this.documents.unshift(doc);
    this.log('INSERT', 'documents', patient.id);
    return clone(doc);
  }

  async getDocumentUrl(doc: DocumentMeta) {
    this.patientOrThrow(doc.patient_id, 'document.read');
    this.log('DOWNLOAD', 'documents', doc.patient_id);
    const blob = this.blobs.get(doc.storage_path)
      ?? new Blob([`DEMO MODE\n\nPlaceholder for "${doc.file_name}".\nIn production this is a 60-second signed URL to private storage.`], { type: 'text/plain' });
    return URL.createObjectURL(blob);
  }

  async archiveDocument(id: string) {
    const d = this.documents.find((x) => x.id === id);
    if (!d) throw new Forbidden();
    this.patientOrThrow(d.patient_id, 'document.delete');
    d.deleted_at = nowIso();
    this.log('UPDATE', 'documents', d.patient_id, { changed_fields: ['deleted_at'] });
  }

  // --- sharing ------------------------------------------------------------------
  async listGrants(patientId: string) {
    const p = this.patients.find((x) => x.id === patientId);
    if (!p) return [];
    const canShare = this.can(p, 'patient.share');
    return clone(this.grants.filter((g) => g.patient_id === patientId
      && (canShare || g.grantee_user_id === this.currentId || g.granted_by === this.currentId)));
  }

  async createGrant(input: Parameters<DataService['createGrant']>[0]) {
    this.patientOrThrow(input.patient_id, 'patient.share');
    if (input.grantee_user_id === this.currentId) throw new Forbidden('You cannot grant access to yourself');
    this.grants.unshift({
      id: crypto.randomUUID(), patient_id: input.patient_id, grantee_user_id: input.grantee_user_id ?? null,
      grantee_clinic_id: input.grantee_clinic_id ?? null, access_level: input.access_level, reason: input.reason ?? null,
      is_emergency: false, granted_by: this.currentId, granted_at: nowIso(), expires_at: input.expires_at ?? null, revoked_at: null,
    });
    this.log('INSERT', 'patient_access_grants', input.patient_id);
  }

  async revokeGrant(id: string) {
    const g = this.grants.find((x) => x.id === id);
    if (!g) throw new Forbidden();
    const p = this.patients.find((x) => x.id === g.patient_id)!;
    if (!this.can(p, 'patient.share') && g.granted_by !== this.currentId) throw new Forbidden();
    g.revoked_at = nowIso();
    this.log('UPDATE', 'patient_access_grants', g.patient_id, { changed_fields: ['revoked_at'] });
  }

  async requestEmergencyAccess(patientId: string, reason: string, hours: number) {
    if (reason.trim().length < 15) throw new Error('A clinical justification of at least 15 characters is required');
    if (!hasPermissionAnywhere(this.access(), 'clinical.read')) throw new Forbidden('Emergency access is restricted to clinical staff');
    this.grants.unshift({
      id: crypto.randomUUID(), patient_id: patientId, grantee_user_id: this.currentId, grantee_clinic_id: null,
      access_level: 'read', reason: reason.trim(), is_emergency: true, granted_by: this.currentId, granted_at: nowIso(),
      expires_at: new Date(Date.now() + hours * 3_600_000).toISOString(), revoked_at: null,
    });
    this.log('EMERGENCY_ACCESS', 'patient_access_grants', patientId, { context: { reason, hours } });
  }

  // --- audit --------------------------------------------------------------------
  async logAccess(action: 'VIEW' | 'DOWNLOAD' | 'PRINT' | 'EXPORT', patientId: string, table?: string) {
    this.log(action, table ?? 'patients', patientId);
  }

  async listAudit({ patientId, clinicId, limit = 100 }: { patientId?: string; clinicId?: string | null; limit?: number }) {
    await delay(80);
    const a = this.access();
    return clone(this.audit
      .filter((e) => a?.is_super_admin || (e.clinic_id && hasPermission(a, 'audit.read', e.clinic_id)))
      .filter((e) => !patientId || e.patient_id === patientId)
      .filter((e) => !clinicId || e.clinic_id === clinicId)
      .slice(0, limit));
  }

  // --- administration -------------------------------------------------------------
  async listStaff(clinicId?: string | null): Promise<StaffMember[]> {
    const a = this.access();
    return this.users.flatMap((u) => u.memberships
      .filter((m) => (!clinicId || m.clinic_id === clinicId)
        && (a?.is_super_admin || a?.memberships.some((x) => x.clinic_id === m.clinic_id)))
      .map((m) => ({
        membership_id: m.id, user_id: u.id, clinic_id: m.clinic_id, role: m.role, is_active: m.is_active,
        profile: { full_name_en: u.full_name_en, full_name_ar: u.full_name_ar, email: u.email, title: u.title },
      })));
  }

  async updateMembership(id: string, patch: Parameters<DataService['updateMembership']>[1]) {
    const a = this.access();
    for (const u of this.users) {
      const m = u.memberships.find((x) => x.id === id);
      if (!m) continue;
      if (!hasPermission(a, 'admin.users', m.clinic_id)) throw new Forbidden();
      if (u.id === this.currentId && !a?.is_super_admin) throw new Forbidden('You cannot modify your own clinic membership');
      if ((m.role === 'clinic_admin' || patch.role === 'clinic_admin') && !a?.is_super_admin) {
        throw new Forbidden('Only super administrators can appoint clinic administrators');
      }
      Object.assign(m, patch);
      this.log('UPDATE', 'clinic_memberships', null, { clinic_id: m.clinic_id, changed_fields: Object.keys(patch) });
      return;
    }
    throw new Forbidden();
  }

  async inviteStaff(input: Parameters<DataService['inviteStaff']>[0]) {
    await delay(200);
    const a = this.access();
    if (!hasPermission(a, 'admin.users', input.clinic_id)) throw new Forbidden();
    if (input.role === 'clinic_admin' && !a?.is_super_admin) throw new Forbidden('Only super administrators can appoint clinic administrators');
    const id = `u-${crypto.randomUUID().slice(0, 8)}`;
    this.users.push({
      id, email: input.email, full_name_en: input.full_name_en ?? null, full_name_ar: input.full_name_ar ?? null, title: null,
      preferred_language: 'en', is_super_admin: false, is_active: true,
      memberships: [{ id: `m-${id}`, clinic_id: input.clinic_id, role: input.role, is_active: true }],
    });
    this.log('INSERT', 'clinic_memberships', null, { clinic_id: input.clinic_id });
  }

  // --- research -------------------------------------------------------------------
  async listResearchProjects() {
    const a = this.access();
    if (!a) return [];
    return clone(DEMO_RESEARCH.filter((r) => a.is_super_admin || r.principal_investigator_id === a.user_id
      || (hasPermissionAnywhere(a, 'research.access')
        && DEMO_RESEARCH_MEMBERS.some((m) => m.project_id === r.id && m.user_id === a.user_id))));
  }

  // --- obstetrics -------------------------------------------------------------------
  private encounterVisible(e: Encounter) {
    return !e.is_private || e.provider_id === this.currentId || this.emergency(e.patient_id);
  }

  private pregnancyOrThrow(id: string, perm: Permission) {
    const g = this.pregnancies.find((x) => x.id === id);
    if (!g) throw new Error('Pregnancy not found');
    this.patientOrThrow(g.patient_id, perm);
    return g;
  }

  private assertMember(clinicId: string) {
    const a = this.access();
    if (!a?.is_super_admin && !a?.memberships.some((m) => m.clinic_id === clinicId)) throw new Forbidden();
  }

  async listObstetricWorklist(clinicId?: string | null): Promise<ObstetricWorklistRow[]> {
    await delay();
    return this.pregnancies
      .filter((g) => g.status === 'active' && (!clinicId || g.clinic_id === clinicId))
      .flatMap((g) => {
        const p = this.patients.find((x) => x.id === g.patient_id);
        if (!p || p.deleted_at || !this.can(p, 'clinical.read')) return [];
        const visits = this.visits
          .filter((v) => v.pregnancy_id === g.id && this.encounterVisible(this.encounters.find((e) => e.id === v.encounter_id)!))
          .sort((a, b) => a.visit_date.localeCompare(b.visit_date));
        const last = visits[visits.length - 1];
        return [{
          pregnancy_id: g.id, patient_id: p.id, clinic_id: g.clinic_id, lmp: g.lmp, edd: g.edd, edd_basis: g.edd_basis,
          cycle_length_days: g.cycle_length_days, risk_level: g.risk_level, risk_factors: g.risk_factors, plurality: g.plurality,
          gravida: g.gravida, para: g.para, conception: g.conception, mrn: p.mrn, first_name_en: p.first_name_en,
          last_name_en: p.last_name_en, first_name_ar: p.first_name_ar, last_name_ar: p.last_name_ar,
          date_of_birth: p.date_of_birth, rh_factor: p.rh_factor, last_visit_date: last?.visit_date ?? null,
          last_bp_systolic: last?.bp_systolic ?? null, last_bp_diastolic: last?.bp_diastolic ?? null,
          last_urine_protein: last?.urine_protein ?? null, last_fetal_movements: last?.fetal_movements ?? null,
          visit_count: visits.length,
        }];
      });
  }

  async getPregnancyDetail(id: string) {
    await delay(80);
    const g = this.pregnancies.find((x) => x.id === id);
    const p = g && this.patients.find((x) => x.id === g.patient_id);
    if (!g || !p || !this.can(p, 'clinical.read')) return null;
    const visits: AntenatalVisitRow[] = this.visits
      .filter((v) => v.pregnancy_id === id)
      .map((v) => ({ v, e: this.encounters.find((e) => e.id === v.encounter_id)! }))
      .filter(({ e }) => this.encounterVisible(e))
      .sort((a, b) => a.v.visit_date.localeCompare(b.v.visit_date) || a.v.created_at.localeCompare(b.v.created_at))
      .map(({ v, e }) => ({
        ...v,
        encounter: {
          id: e.id, status: e.status, provider_id: e.provider_id, is_private: e.is_private, assessment: e.assessment,
          plan: e.plan, chief_complaint: e.chief_complaint,
          signed_by: this.signatures.get(e.id)?.by ?? null, signed_at: this.signatures.get(e.id)?.at ?? null,
        },
      }));
    const delivery = this.deliveries.find((d) => d.pregnancy_id === id) ?? null;
    const encRow = (e: Encounter) => ({
      id: e.id, status: e.status, provider_id: e.provider_id, is_private: e.is_private, assessment: e.assessment, plan: e.plan,
      chief_complaint: e.chief_complaint, signed_by: this.signatures.get(e.id)?.by ?? null, signed_at: this.signatures.get(e.id)?.at ?? null,
    });
    const postnatal: PostnatalVisitRow[] = this.postnatal
      .filter((v) => v.pregnancy_id === id)
      .map((v) => ({ v, e: this.encounters.find((e) => e.id === v.encounter_id)! }))
      .filter(({ e }) => this.encounterVisible(e))
      .sort((a, b) => a.v.visit_date.localeCompare(b.v.visit_date))
      .map(({ v, e }) => ({ ...v, encounter: encRow(e) }));
    return clone({
      biometry: this.biometry.filter((b) => b.pregnancy_id === id).sort((a, b) => (a.ga_days ?? 0) - (b.ga_days ?? 0)),
      postnatal_visits: postnatal,
      labour: this.labour.filter((o) => o.pregnancy_id === id).sort((a, b) => a.observed_at.localeCompare(b.observed_at)),
      pregnancy: g,
      visits,
      delivery,
      newborns: delivery ? this.newborns.filter((n) => n.delivery_id === delivery.id) : [],
      fetal_assessments: this.fetal.filter((f) => f.patient_id === g.patient_id && (!f.pregnancy_id || f.pregnancy_id === id)),
    });
  }

  private validatePregnancy(g: Omit<Pregnancy, 'id'>, selfId?: string) {
    if (g.status === 'active' && !g.lmp && !g.edd) throw new Error('An ongoing pregnancy must be dated (LMP or EDD)');
    if (g.gravida != null && (g.para ?? 0) + (g.abortus ?? 0) > g.gravida) throw new Error('GPAL inconsistent: P + A must not exceed G');
    if (g.chorionicity && g.plurality < 2) throw new Error('Chorionicity only applies to multiple pregnancies');
    if (g.previous_cs_count != null && g.para != null && g.previous_cs_count > g.para) throw new Error('Caesarean count cannot exceed parity');
    if (g.status === 'active' && this.pregnancies.some((x) => x.patient_id === g.patient_id && x.status === 'active' && x.id !== selfId)) {
      throw new Error('This patient already has an ongoing pregnancy');
    }
  }

  async createPregnancy(input: Omit<Pregnancy, 'id'>) {
    await delay();
    this.patientOrThrow(input.patient_id, 'clinical.write');
    this.assertMember(input.clinic_id);
    this.validatePregnancy(input);
    const g: Pregnancy = { ...input, id: crypto.randomUUID() };
    this.pregnancies.push(g);
    const pt = this.patients.find((x) => x.id === g.patient_id)!;
    if (!pt.specialties.includes('obstetrics')) pt.specialties = [...pt.specialties, 'obstetrics'];
    this.log('INSERT', 'pregnancies', g.patient_id);
    return clone(g);
  }

  async updatePregnancy(id: string, patch: Partial<Omit<Pregnancy, 'id'>>) {
    await delay();
    const g = this.pregnancyOrThrow(id, 'clinical.write');
    const next = { ...g, ...patch, id: g.id, patient_id: g.patient_id };
    this.validatePregnancy(next, id);
    Object.assign(g, next);
    this.log('UPDATE', 'pregnancies', g.patient_id, { changed_fields: Object.keys(patch) });
    return clone(g);
  }

  private validateVisit(v: Partial<AntenatalVisit>) {
    if ((v.bp_systolic == null) !== (v.bp_diastolic == null)) throw new Error('Enter both systolic and diastolic pressure');
    if (v.bp_systolic != null && v.bp_diastolic != null && v.bp_systolic <= v.bp_diastolic) {
      throw new Error('Systolic pressure must be higher than diastolic');
    }
    if (v.visit_date && v.visit_date > todayIso()) throw new Error('Visit date cannot be in the future');
    if (v.fhr_by_fetus?.some((x) => x < 60 || x > 240)) throw new Error('Fetal heart rate must be between 60 and 240');
    if (v.next_visit_date && v.visit_date && v.next_visit_date <= v.visit_date) throw new Error('Next appointment must be after the visit');
  }

  async recordAntenatalVisit(pregnancyId: string, visit: Parameters<DataService['recordAntenatalVisit']>[1], narrative: Parameters<DataService['recordAntenatalVisit']>[2]) {
    await delay();
    const g = this.pregnancyOrThrow(pregnancyId, 'clinical.write');
    if (g.status !== 'active') throw new Error('Visits can only be recorded for an ongoing pregnancy');
    const clinicId = narrative.clinic_id || g.clinic_id;
    this.assertMember(clinicId);
    const date = visit.visit_date || todayIso();
    this.validateVisit({ ...visit, visit_date: date });
    const encId = crypto.randomUUID();
    this.encounters.push({
      id: encId, patient_id: g.patient_id, clinic_id: clinicId, specialty: 'obstetrics', encounter_type: 'antenatal_visit',
      encounter_at: date === todayIso() ? nowIso() : `${date}T00:00:00.000Z`, provider_id: this.currentId!,
      is_private: narrative.is_private ?? false, status: 'draft', chief_complaint: narrative.chief_complaint ?? null,
      assessment: narrative.assessment ?? null, plan: narrative.plan ?? null,
    });
    const id = crypto.randomUUID();
    this.visits.push({
      id, pregnancy_id: g.id, patient_id: g.patient_id, clinic_id: clinicId, encounter_id: encId, visit_date: date,
      ga_days: gaDaysOn(g, date), weight_kg: null, bp_systolic: null, bp_diastolic: null, pulse: null, urine_protein: null,
      urine_glucose: null, fundal_height_cm: null, fetal_heart_rate: null, presentation: null, fetal_movements: null,
      edema: null, hemoglobin_g_dl: null, notes: null, fhr_by_fetus: null, presentation_by_fetus: null, next_visit_date: null,
      ...visit, created_by: this.currentId, created_at: nowIso(),
    });
    this.log('INSERT', 'antenatal_visits', g.patient_id);
    return id;
  }

  async updateAntenatalVisit(visitId: string, encounterId: string, visit: Parameters<DataService['updateAntenatalVisit']>[2], narrative: Parameters<DataService['updateAntenatalVisit']>[3]) {
    await delay();
    const v = this.visits.find((x) => x.id === visitId);
    const e = this.encounters.find((x) => x.id === encounterId);
    if (!v || !e || v.encounter_id !== e.id) throw new Forbidden();
    this.patientOrThrow(v.patient_id, 'clinical.write');
    if (e.is_private && e.provider_id !== this.currentId) throw new Forbidden();
    if (e.status !== 'draft') throw new Error('This visit is signed; record an amendment instead');
    const merged = { ...v, ...visit };
    this.validateVisit(merged);
    const g = this.pregnancies.find((x) => x.id === v.pregnancy_id)!;
    Object.assign(v, visit, { ga_days: gaDaysOn(g, merged.visit_date) });
    Object.assign(e, { chief_complaint: narrative.chief_complaint ?? e.chief_complaint, assessment: narrative.assessment ?? e.assessment, plan: narrative.plan ?? e.plan });
    this.log('UPDATE', 'antenatal_visits', v.patient_id, { changed_fields: Object.keys(visit) });
  }

  async signEncounter(encounterId: string) {
    await delay();
    const e = this.encounters.find((x) => x.id === encounterId);
    if (!e) throw new Forbidden();
    this.patientOrThrow(e.patient_id, 'clinical.write');
    if (!hasPermission(this.access(), 'clinical.sign', e.clinic_id)) throw new Forbidden('Signing requires the clinical.sign permission');
    if (e.status !== 'draft') throw new Error('Only draft encounters can be signed');
    e.status = 'signed';
    this.signatures.set(e.id, { by: this.currentId!, at: nowIso() });
    this.log('UPDATE', 'encounters', e.patient_id, { changed_fields: ['signed_at', 'signed_by', 'status'] });
  }

  async recordDelivery(pregnancyId: string, delivery: Parameters<DataService['recordDelivery']>[1], newborns: Parameters<DataService['recordDelivery']>[2]) {
    await delay();
    const g = this.pregnancyOrThrow(pregnancyId, 'clinical.write');
    if (g.status !== 'active') throw new Error('Only an ongoing pregnancy can be delivered');
    if (newborns.length !== g.plurality) throw new Error(`Number of newborns (${newborns.length}) does not match plurality (${g.plurality})`);
    if (new Date(delivery.delivered_at) > new Date()) throw new Error('Delivery time cannot be in the future');
    if (delivery.onset === 'prelabour_cs' && !delivery.mode.startsWith('cs_')) throw new Error('Pre-labour CS must be a caesarean mode');
    const ga = gaDaysOn(g, delivery.delivered_at.slice(0, 10));
    if (ga == null || ga < 140) throw new Error('A delivery record requires gestational age ≥ 20 weeks; record a pregnancy loss instead');
    const clinicId = delivery.clinic_id || g.clinic_id;
    this.assertMember(clinicId);
    const id = crypto.randomUUID();
    const { clinic_id: _c, ...rest } = delivery;
    this.deliveries.push({ ...rest, id, pregnancy_id: g.id, patient_id: g.patient_id, clinic_id: clinicId, ga_days: ga, recorded_by: this.currentId });
    newborns.forEach((n, i) => this.newborns.push({ ...n, id: crypto.randomUUID(), delivery_id: id, birth_order: i + 1 }));
    g.status = 'delivered';
    g.outcome_date = delivery.delivered_at.slice(0, 10);
    this.log('INSERT', 'deliveries', g.patient_id);
    return id;
  }

  async recordFetalScan(pregnancyId: string, scan: Parameters<DataService['recordFetalScan']>[1], fetuses: Parameters<DataService['recordFetalScan']>[2]) {
    await delay();
    const g = this.pregnancyOrThrow(pregnancyId, 'clinical.write');
    if (!fetuses.length || fetuses.length > g.plurality) throw new Error(`Provide between 1 and ${g.plurality} fetus records`);
    if (new Set(fetuses.map((f) => f.fetus_label)).size !== fetuses.length) throw new Error('Fetus labels must be unique');
    if (new Date(scan.performed_at) > new Date()) throw new Error('Scan date cannot be in the future');
    const clinicId = scan.clinic_id || g.clinic_id;
    this.assertMember(clinicId);
    const id = crypto.randomUUID();
    const ga = gaDaysOn(g, scan.performed_at.slice(0, 10));
    this.fetal.push({
      id, patient_id: g.patient_id, pregnancy_id: g.id, clinic_id: clinicId, assessment_type: scan.assessment_type,
      performed_at: scan.performed_at, gestational_age_days: ga, fetus_number: fetuses.length, impression: scan.impression,
    });
    for (const f of fetuses) {
      this.biometry.push({
        crl_mm: null, bpd_mm: null, hc_mm: null, ac_mm: null, fl_mm: null, efw_g: null, afi_cm: null, dvp_cm: null, ua_pi: null,
        ua_edf: null, mca_pi: null, fhr: null, presentation: null, placenta_location: null, notes: null, ...f,
        id: crypto.randomUUID(), fetal_assessment_id: id, pregnancy_id: g.id, patient_id: g.patient_id, clinic_id: clinicId, ga_days: ga,
      });
      const b = this.biometry[this.biometry.length - 1];
      b.efw_g = hadlockEfw(b.hc_mm, b.ac_mm, b.fl_mm) ?? b.efw_g;
    }
    this.log('INSERT', 'fetal_biometry', g.patient_id);
    return id;
  }

  async recordPostnatalVisit(deliveryId: string, visit: Parameters<DataService['recordPostnatalVisit']>[1], narrative: Parameters<DataService['recordPostnatalVisit']>[2]) {
    await delay();
    const d = this.deliveries.find((x) => x.id === deliveryId);
    if (!d) throw new Error('Delivery not found');
    this.patientOrThrow(d.patient_id, 'clinical.write');
    const date = visit.visit_date || todayIso();
    if (date > todayIso()) throw new Error('Visit date cannot be in the future');
    if (date < d.delivered_at.slice(0, 10)) throw new Error('Postnatal visit cannot precede the delivery');
    if ((visit.bp_systolic == null) !== (visit.bp_diastolic == null)) throw new Error('Enter both systolic and diastolic pressure');
    const clinicId = narrative.clinic_id || d.clinic_id;
    this.assertMember(clinicId);
    const encId = crypto.randomUUID();
    this.encounters.push({
      id: encId, patient_id: d.patient_id, clinic_id: clinicId, specialty: 'obstetrics', encounter_type: 'postnatal_visit',
      encounter_at: date === todayIso() ? nowIso() : `${date}T00:00:00.000Z`, provider_id: this.currentId!,
      is_private: narrative.is_private ?? false, status: 'draft', chief_complaint: narrative.chief_complaint ?? null,
      assessment: narrative.assessment ?? null, plan: narrative.plan ?? null,
    });
    const id = crypto.randomUUID();
    this.postnatal.push({
      pulse: null, temperature_c: null, uterus: null, lochia: null, wound: null, breastfeeding: null, breasts: null, epds_score: null,
      epds_self_harm: null, hemoglobin_g_dl: null, contraception: null, notes: null, bp_systolic: null, bp_diastolic: null, ...visit,
      id, delivery_id: d.id, pregnancy_id: d.pregnancy_id, patient_id: d.patient_id, clinic_id: clinicId, encounter_id: encId,
      visit_date: date, days_postpartum: Math.round((Date.parse(date) - Date.parse(d.delivered_at.slice(0, 10))) / 86_400_000),
      created_by: this.currentId, created_at: nowIso(),
    });
    this.log('INSERT', 'postnatal_visits', d.patient_id);
    return id;
  }

  async addLabourObservation(pregnancyId: string, obs: Parameters<DataService['addLabourObservation']>[1]) {
    await delay();
    const g = this.pregnancyOrThrow(pregnancyId, 'clinical.write');
    if (g.status !== 'active') throw new Error('Labour observations require an ongoing pregnancy');
    const at = obs.observed_at || nowIso();
    if (new Date(at).getTime() > Date.now() + 5 * 60_000) throw new Error('Observation time cannot be in the future');
    if ((gaDaysOn(g, at.slice(0, 10)) ?? 0) < 140) throw new Error('Labour observations require GA of at least 20 weeks');
    const clinicId = obs.clinic_id || g.clinic_id;
    this.assertMember(clinicId);
    const { clinic_id: _c, ...rest } = obs;
    this.labour.push({
      cervical_dilation_cm: null, descent_fifths: null, contractions_per_10min: null, contraction_duration_s: null, fhr: null,
      liquor: null, moulding: null, bp_systolic: null, bp_diastolic: null, pulse: null, temperature_c: null, oxytocin_mu_min: null,
      notes: null, ...rest, observed_at: at, id: crypto.randomUUID(), pregnancy_id: g.id, patient_id: g.patient_id, clinic_id: clinicId,
      entered_in_error: false, recorded_by: this.currentId, created_at: nowIso(),
    });
    this.log('INSERT', 'labour_observations', g.patient_id);
  }

  async markLabourObservationError(id: string) {
    const o = this.labour.find((x) => x.id === id);
    if (!o) throw new Forbidden();
    this.patientOrThrow(o.patient_id, 'clinical.write');
    o.entered_in_error = true;
    this.log('UPDATE', 'labour_observations', o.patient_id, { changed_fields: ['entered_in_error'] });
  }

  // --- gynecology ---------------------------------------------------------------------
  private tagGyn(patientId: string) {
    const pt = this.patients.find((x) => x.id === patientId);
    if (pt && !pt.specialties.includes('gynecology')) pt.specialties = [...pt.specialties, 'gynecology'];
  }

  private clinicFor(patientId: string, override?: string | null) {
    const clinicId = override || this.patients.find((x) => x.id === patientId)!.clinic_id;
    this.assertMember(clinicId);
    return clinicId;
  }

  async listGynWorklist(clinicId?: string | null): Promise<GynWorklistRow[]> {
    await delay();
    return this.patients
      .filter((p) => !p.deleted_at && p.specialties.includes('gynecology') && (!clinicId || p.clinic_id === clinicId) && this.can(p, 'clinical.read'))
      .map((p) => {
        const prof = this.gynProfiles.find((g) => g.patient_id === p.id);
        const s = this.screenings.filter((x) => x.patient_id === p.id).sort((a, b) => b.sample_date.localeCompare(a.sample_date))[0];
        const visits = this.gynVisits.filter((v) => v.patient_id === p.id).sort((a, b) => b.visit_date.localeCompare(a.visit_date));
        const colpo = this.colposcopies.filter((c) => c.patient_id === p.id).map((c) => c.performed_at).sort().at(-1) ?? null;
        return {
          patient_id: p.id, clinic_id: p.clinic_id, mrn: p.mrn, first_name_en: p.first_name_en, last_name_en: p.last_name_en,
          first_name_ar: p.first_name_ar, last_name_ar: p.last_name_ar, date_of_birth: p.date_of_birth,
          menopause_status: prof?.menopause_status ?? null, hysterectomy: prof?.hysterectomy ?? null,
          last_screening_date: s?.sample_date ?? null, last_screening_test: s?.test_type ?? null, last_hpv_result: s?.hpv_result ?? null,
          last_cytology_result: s?.cytology_result ?? null, last_screening_status: s?.status ?? null, screening_next_due: s?.next_due_date ?? null,
          screening_recommendation: s?.recommendation ?? null, last_colposcopy_date: colpo,
          pending_histology: this.gynProcedures.filter((x) => x.patient_id === p.id && x.histology_status === 'pending').length
            + this.colposcopies.filter((c) => c.patient_id === p.id && c.histology === 'pending').length,
          last_visit_date: visits[0]?.visit_date ?? null, last_complaints: visits[0]?.complaints ?? null,
        };
      });
  }

  async getGynDetail(patientId: string): Promise<GynDetail> {
    await delay(80);
    const p = this.patients.find((x) => x.id === patientId);
    if (!p || !this.can(p, 'clinical.read')) return { profile: null, visits: [], ultrasounds: [], screenings: [], colposcopies: [], procedures: [] };
    const visits: GynVisitRow[] = this.gynVisits.filter((v) => v.patient_id === patientId)
      .map((v) => ({ v, e: this.encounters.find((e) => e.id === v.encounter_id)! }))
      .filter(({ e }) => this.encounterVisible(e))
      .sort((a, b) => a.v.visit_date.localeCompare(b.v.visit_date))
      .map(({ v, e }) => ({ ...v, encounter: {
        id: e.id, status: e.status, provider_id: e.provider_id, is_private: e.is_private, assessment: e.assessment, plan: e.plan,
        chief_complaint: e.chief_complaint, signed_by: this.signatures.get(e.id)?.by ?? null, signed_at: this.signatures.get(e.id)?.at ?? null,
      } }));
    const by = <T extends { patient_id: string }>(arr: T[]) => arr.filter((x) => x.patient_id === patientId);
    return clone({
      profile: this.gynProfiles.find((g) => g.patient_id === patientId) ?? null,
      visits,
      ultrasounds: by(this.gynUs).sort((a, b) => a.performed_at.localeCompare(b.performed_at)),
      screenings: by(this.screenings).sort((a, b) => a.sample_date.localeCompare(b.sample_date)),
      colposcopies: by(this.colposcopies).sort((a, b) => a.performed_at.localeCompare(b.performed_at)),
      procedures: by(this.gynProcedures).sort((a, b) => a.performed_at.localeCompare(b.performed_at)),
    });
  }

  async saveGynProfile(patientId: string, profile: Parameters<DataService['saveGynProfile']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (profile.menopause_age != null && !['postmenopausal', 'surgical'].includes(profile.menopause_status ?? '')) {
      throw new Error('Menopause age requires a postmenopausal status');
    }
    const existing = this.gynProfiles.find((g) => g.patient_id === patientId);
    if (existing) Object.assign(existing, profile);
    else { this.gynProfiles.push({ ...profile, patient_id: patientId }); this.tagGyn(patientId); }
    this.log(existing ? 'UPDATE' : 'INSERT', 'gyn_profiles', patientId);
  }

  async recordGynVisit(patientId: string, visit: Parameters<DataService['recordGynVisit']>[1], narrative: Parameters<DataService['recordGynVisit']>[2]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    const date = visit.visit_date || todayIso();
    if (date > todayIso()) throw new Error('Visit date cannot be in the future');
    if (visit.lmp && visit.lmp > date) throw new Error('LMP cannot be after the visit');
    if ((visit.bp_systolic == null) !== (visit.bp_diastolic == null)) throw new Error('Enter both systolic and diastolic pressure');
    const clinicId = this.clinicFor(patientId, narrative.clinic_id);
    const encId = crypto.randomUUID();
    this.encounters.push({
      id: encId, patient_id: patientId, clinic_id: clinicId, specialty: 'gynecology', encounter_type: 'consultation',
      encounter_at: date === todayIso() ? nowIso() : `${date}T00:00:00.000Z`, provider_id: this.currentId!, is_private: narrative.is_private ?? false,
      status: 'draft', chief_complaint: narrative.chief_complaint ?? null, assessment: narrative.assessment ?? null, plan: narrative.plan ?? null,
    });
    const id = crypto.randomUUID();
    this.gynVisits.push({
      complaints: [], palm_coein: [], lmp: null, pain_score: null, bp_systolic: null, bp_diastolic: null, weight_kg: null, height_cm: null,
      clinical_hyperandrogenism: null, biochemical_hyperandrogenism: null, abdominal_exam: null, speculum_exam: null, bimanual_exam: null,
      uterus_size: null, adnexal_tenderness: null, cervical_motion_tenderness: null, pop_stage: null, diagnosis: null, notes: null,
      ...visit, id, patient_id: patientId, clinic_id: clinicId, encounter_id: encId, visit_date: date, created_by: this.currentId, created_at: nowIso(),
    });
    this.tagGyn(patientId);
    this.log('INSERT', 'gyn_visits', patientId);
    return id;
  }

  async updateGynVisit(visitId: string, encounterId: string, visit: Parameters<DataService['updateGynVisit']>[2], narrative: Parameters<DataService['updateGynVisit']>[3]) {
    await delay();
    const v = this.gynVisits.find((x) => x.id === visitId);
    const e = this.encounters.find((x) => x.id === encounterId);
    if (!v || !e || v.encounter_id !== e.id) throw new Forbidden();
    this.patientOrThrow(v.patient_id, 'clinical.write');
    if (e.is_private && e.provider_id !== this.currentId) throw new Forbidden();
    if (e.status !== 'draft') throw new Error('This visit is signed; record an amendment instead');
    Object.assign(v, visit);
    Object.assign(e, { assessment: narrative.assessment ?? e.assessment, plan: narrative.plan ?? e.plan, chief_complaint: narrative.chief_complaint ?? e.chief_complaint });
    this.log('UPDATE', 'gyn_visits', v.patient_id, { changed_fields: Object.keys(visit) });
  }

  async recordGynUltrasound(patientId: string, u: Parameters<DataService['recordGynUltrasound']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (!u.adnexal_mass && (u.iota_b_features.length || u.iota_m_features.length)) throw new Error('IOTA features require an adnexal mass');
    const { clinic_id, ...rest } = u;
    this.gynUs.push({ ...rest, id: crypto.randomUUID(), patient_id: patientId, clinic_id: this.clinicFor(patientId, clinic_id), performed_by: this.currentId });
    this.log('INSERT', 'gyn_ultrasounds', patientId);
  }

  private validateScreening(s: Omit<CervicalScreening, 'id' | 'patient_id' | 'clinic_id' | 'recorded_by' | 'created_at'>) {
    if (s.sample_date > todayIso()) throw new Error('Sample date cannot be in the future');
    if (s.status === 'resulted') {
      const ok = (s.test_type === 'cytology' && s.cytology_result) || (s.test_type === 'hpv_primary' && s.hpv_result)
        || (s.test_type === 'cotest' && s.cytology_result && s.hpv_result);
      if (!ok) throw new Error('The result must match the test type');
    }
    if (s.next_due_date && s.next_due_date <= s.sample_date) throw new Error('Next due date must follow the sample');
  }

  async recordScreening(patientId: string, s: Parameters<DataService['recordScreening']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    const { clinic_id, ...rest } = s;
    this.validateScreening(rest);
    this.screenings.push({ ...rest, id: crypto.randomUUID(), patient_id: patientId, clinic_id: this.clinicFor(patientId, clinic_id), recorded_by: this.currentId, created_at: nowIso() });
    this.tagGyn(patientId);
    this.log('INSERT', 'cervical_screenings', patientId);
  }

  async updateScreening(id: string, patch: Partial<CervicalScreening>) {
    await delay();
    const s = this.screenings.find((x) => x.id === id);
    if (!s) throw new Forbidden();
    this.patientOrThrow(s.patient_id, 'clinical.write');
    const next = { ...s, ...patch };
    this.validateScreening(next);
    Object.assign(s, patch);
    this.log('UPDATE', 'cervical_screenings', s.patient_id, { changed_fields: Object.keys(patch) });
  }

  async recordColposcopy(patientId: string, c: Parameters<DataService['recordColposcopy']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (c.histology && !c.biopsy_taken && !['lletz', 'cone'].includes(c.treatment ?? '')) throw new Error('Histology requires a biopsy or excision');
    if (c.screening_id && !this.screenings.some((s) => s.id === c.screening_id && s.patient_id === patientId)) throw new Forbidden();
    const { clinic_id, ...rest } = c;
    this.colposcopies.push({ ...rest, id: crypto.randomUUID(), patient_id: patientId, clinic_id: this.clinicFor(patientId, clinic_id), performed_by: this.currentId });
    this.log('INSERT', 'colposcopies', patientId);
  }

  async updateColposcopy(id: string, patch: Partial<Colposcopy>) {
    const c = this.colposcopies.find((x) => x.id === id);
    if (!c) throw new Forbidden();
    this.patientOrThrow(c.patient_id, 'clinical.write');
    Object.assign(c, patch);
    this.log('UPDATE', 'colposcopies', c.patient_id, { changed_fields: Object.keys(patch) });
  }

  async recordGynProcedure(patientId: string, p: Parameters<DataService['recordGynProcedure']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (p.performed_at > todayIso()) throw new Error('Procedure date cannot be in the future');
    if (p.histology_result && p.histology_status !== 'received') throw new Error('Histology result requires status received');
    const { clinic_id, ...rest } = p;
    this.gynProcedures.push({ ...rest, surgeon_id: rest.surgeon_id ?? this.currentId, id: crypto.randomUUID(), patient_id: patientId,
      clinic_id: this.clinicFor(patientId, clinic_id), recorded_by: this.currentId });
    this.tagGyn(patientId);
    this.log('INSERT', 'gyn_procedures', patientId);
  }

  async updateGynProcedure(id: string, patch: Partial<GynProcedure>) {
    await delay();
    const p = this.gynProcedures.find((x) => x.id === id);
    if (!p) throw new Forbidden();
    this.patientOrThrow(p.patient_id, 'clinical.write');
    const next = { ...p, ...patch };
    if (next.histology_result && next.histology_status !== 'received') throw new Error('Histology result requires status received');
    Object.assign(p, patch);
    this.log('UPDATE', 'gyn_procedures', p.patient_id, { changed_fields: Object.keys(patch) });
  }
}

import type { DataService, AuthUser } from './service';
import type {
  AccessGrant, AuditEvent, DocumentMeta, MyAccess, Patient, PatientInput, Profile, StaffMember,
} from './types';
import type { Permission } from '@/rbac/permissions';
import { ROLE_PERMISSIONS } from '@/rbac/permissions';
import { hasPermission, hasPermissionAnywhere, patientCan } from '@/rbac/access';
import {
  DEMO_CLINICS, DEMO_CYCLES, DEMO_DOCUMENTS, DEMO_ENCOUNTERS, DEMO_FETAL, DEMO_GRANTS, DEMO_PATIENTS,
  DEMO_PREGNANCIES, DEMO_RESEARCH, DEMO_RESEARCH_MEMBERS, DEMO_USERS, seedAudit, type DemoUser,
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
  private fetal = clone(DEMO_FETAL);
  private encounters = clone(DEMO_ENCOUNTERS);
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
}

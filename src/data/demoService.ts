import type { DataService, AuthUser } from './service';
import type {
  FetalMedicineDetail, FmAnomalyScan, FmCfdna, FmDoppler, FmFirstTrimester, FmProcedure, FmWorklistRow, FmFetusInput,
  LabResult, MenopauseAssessment, UrogynAssessment, CryoRow, Embryo, EmbryoTransfer, FertilityCycle, FertilityProfile,
  FertilityWorklistRow, SemenAnalysis, StimulationMonitoring,
  CervicalScreening, Colposcopy, GynDetail, GynProcedure, GynProfile, GynUltrasound, GynVisit, GynVisitRow, GynWorklistRow,
  FetalBiometry, LabourObservation, PostnatalVisit, PostnatalVisitRow,
  AccessGrant, AntenatalVisit, AntenatalVisitRow, AuditEvent, Delivery, DocumentMeta, Encounter, MyAccess, Newborn,
  ObstetricWorklistRow, Patient, PatientInput, Pregnancy, Profile, StaffMember,
} from './types';
import { gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { hadlockEfw } from '@/clinical/fetalGrowth';
import { cprLow, mcaPsvMom } from '@/clinical/fetalMedicine';
import type { Permission } from '@/rbac/permissions';
import { PERMISSIONS } from '@/rbac/permissions';
import { ADMIN_PERMISSIONS, effectivePermissions, formatCode, normaliseCode, randomCodePart } from '@/lib/loginCode';
import { hasPermission, hasPermissionAnywhere, patientCan } from '@/rbac/access';
import {
  DEMO_CLINICS, DEMO_CYCLES, DEMO_DOCUMENTS, DEMO_ENCOUNTERS, DEMO_FETAL, DEMO_GRANTS, DEMO_PATIENTS,
  DEMO_PREGNANCIES, DEMO_RESEARCH, DEMO_RESEARCH_MEMBERS, DEMO_USERS, seedAudit, type DemoUser,
  DEMO_VISITS, DEMO_VISIT_ENCOUNTERS, DEMO_DELIVERIES, DEMO_NEWBORNS,
  DEMO_LABS, DEMO_MRS, DEMO_ICIQ, DEMO_FERTILITY_PROFILES, DEMO_SEMEN, DEMO_MONITORING, DEMO_EMBRYOS, DEMO_TRANSFERS,
  DEMO_GYN_PROFILES, DEMO_GYN_VISITS, DEMO_GYN_ENCOUNTERS, DEMO_GYN_US, DEMO_SCREENINGS, DEMO_COLPOSCOPIES, DEMO_GYN_PROCEDURES,
  DEMO_FM_SCANS, DEMO_FM_FIRST, DEMO_FM_ANOMALY, DEMO_FM_DOPPLER, DEMO_FM_CFDNA, DEMO_FM_PROCEDURES,
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

const round2 = (x: number) => Math.round(x * 100) / 100;
/** Mirrors the generated columns and trigger of fm_dopplers. */
function deriveDoppler(d: FmDoppler): FmDoppler {
  return {
    ...d,
    cpr: d.mca_pi != null && d.ua_pi ? round2(d.mca_pi / d.ua_pi) : null,
    uta_mean_pi: d.uta_left_pi != null && d.uta_right_pi != null ? round2((d.uta_left_pi + d.uta_right_pi) / 2) : null,
    mca_psv_mom: mcaPsvMom(d.mca_psv_cm_s, d.ga_days),
  };
}

const FM_STRUCTURES = ['skull', 'midline_falx', 'cavum_septi_pellucidi', 'lateral_ventricles', 'cerebellum', 'cisterna_magna', 'orbits', 'lips',
  'profile', 'neck', 'lungs', 'diaphragm', 'heart_situs', 'four_chamber', 'lvot', 'rvot', 'three_vessel_trachea', 'stomach', 'bowel',
  'abdominal_wall', 'cord_insertion', 'kidneys', 'bladder', 'spine', 'arms', 'hands', 'legs', 'feet', 'genitalia'];

function validateCfdna(c: FmCfdna) {
  const today = todayIso();
  if (c.sampled_on > today || (c.resulted_on && c.resulted_on > today)) throw new Error('Dates cannot be in the future');
  if (c.resulted_on && c.resulted_on < c.sampled_on) throw new Error('Result cannot precede sampling');
  if (c.result_status === 'pending' && (c.t21 || c.t18 || c.t13 || c.sex_chromosomes || c.resulted_on)) throw new Error('A pending cfDNA cannot carry results');
  if (c.result_status === 'resulted' && (!c.t21 || !c.resulted_on)) throw new Error('A resulted cfDNA needs the T21 result and a result date');
  if (c.result_status === 'failed' && !c.resulted_on) throw new Error('A failed test needs a result date');
}

function validateProcedure(p: FmProcedure) {
  const today = todayIso();
  if (p.performed_on > today || (p.resulted_on && p.resulted_on > today)) throw new Error('Dates cannot be in the future');
  if (p.resulted_on && p.resulted_on < p.performed_on) throw new Error('Result cannot precede the procedure');
  if (!['pending', 'not_applicable'].includes(p.result_status) && !p.resulted_on) throw new Error('Enter the result date');
  if (p.result_status === 'pending' && p.resulted_on) throw new Error('A pending result cannot carry a result date');
  if (p.result_status === 'abnormal' && !p.result_summary?.trim()) throw new Error('An abnormal result needs a summary');
  if (p.approach === 'transcervical' && p.procedure_type !== 'cvs') throw new Error('Transcervical approach is only for CVS');
  if (['cvs', 'amniocentesis', 'cordocentesis'].includes(p.procedure_type) && !p.tests.length) throw new Error('Select at least one test for a diagnostic sample');
  if (!['intrauterine_transfusion', 'cordocentesis'].includes(p.procedure_type) && (p.pre_hb_g_dl != null || p.post_hb_g_dl != null)) {
    throw new Error('Fetal haemoglobin applies only to transfusion or cordocentesis');
  }
  if (p.complications.includes('none') && p.complications.length > 1) throw new Error('"None" cannot be combined with complications');
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
  private fetal = clone([...DEMO_FETAL, ...DEMO_SCANS, ...DEMO_FM_SCANS]);
  private fmFirst: FmFirstTrimester[] = clone(DEMO_FM_FIRST);
  private fmAnomaly: FmAnomalyScan[] = clone(DEMO_FM_ANOMALY);
  private fmDoppler: FmDoppler[] = clone(DEMO_FM_DOPPLER).map(deriveDoppler);
  private fmCfdna: FmCfdna[] = clone(DEMO_FM_CFDNA);
  private fmProcedures: FmProcedure[] = clone(DEMO_FM_PROCEDURES);
  private encounters: Encounter[] = clone([...DEMO_ENCOUNTERS, ...DEMO_VISIT_ENCOUNTERS, ...DEMO_POSTNATAL_ENCOUNTERS, ...DEMO_GYN_ENCOUNTERS]);
  private gynProfiles: GynProfile[] = clone(DEMO_GYN_PROFILES);
  private gynVisits: GynVisit[] = clone(DEMO_GYN_VISITS);
  private gynUs: GynUltrasound[] = clone(DEMO_GYN_US);
  private screenings: CervicalScreening[] = clone(DEMO_SCREENINGS);
  private colposcopies: Colposcopy[] = clone(DEMO_COLPOSCOPIES);
  private gynProcedures: GynProcedure[] = clone(DEMO_GYN_PROCEDURES);
  private labs: LabResult[] = clone(DEMO_LABS);
  private fertilityProfiles: FertilityProfile[] = clone(DEMO_FERTILITY_PROFILES);
  private semen: SemenAnalysis[] = clone(DEMO_SEMEN);
  private monitoring: StimulationMonitoring[] = clone(DEMO_MONITORING);
  private embryos: Embryo[] = clone(DEMO_EMBRYOS);
  private transfers: EmbryoTransfer[] = clone(DEMO_TRANSFERS);
  private mrs: MenopauseAssessment[] = clone(DEMO_MRS);
  private iciq: UrogynAssessment[] = clone(DEMO_ICIQ);
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

  constructor() {
    // seed data bypasses the database's tagging trigger; apply it here
    for (const r of [...this.fmFirst, ...this.fmAnomaly, ...this.fmDoppler, ...this.fmCfdna, ...this.fmProcedures]) this.tagFetal(r.patient_id);
  }

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
      login_handle: u.login_handle ?? null,
      memberships: u.memberships
        .filter((m) => m.is_active)
        .map((m) => {
          const c = DEMO_CLINICS.find((x) => x.id === m.clinic_id)!;
          return {
            clinic_id: c.id, clinic_code: c.code, clinic_name_en: c.name_en, clinic_name_ar: c.name_ar,
            role: m.role, permissions: effectivePermissions(m.role, m.granted_permissions, m.revoked_permissions),
            specialties: m.specialties ?? null,
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

  /** Demo code secrets (held in memory only, like the hashed password on the server). */
  private codeSecrets = new Map<string, string>();
  private codeFailures = new Map<string, { n: number; until: number | null }>();

  async signInWithCode(code: string) {
    await delay();
    const c = normaliseCode(code);
    if (c.length !== 16) throw new Error('invalid_format');
    const handle = c.slice(0, 4), secret = c.slice(4);
    const f = this.codeFailures.get(handle);
    if (f?.until && f.until > Date.now()) throw new Error(`locked:${new Date(f.until).toISOString()}`);
    const u = this.users.find((x) => x.login_handle === handle);
    if (!u || this.codeSecrets.get(u.id) !== secret) {
      const n = (f?.until && f.until <= Date.now() ? 0 : f?.n ?? 0) + 1;
      const until = n >= 5 ? Date.now() + 15 * 60_000 : null;
      this.codeFailures.set(handle, { n, until });
      this.log('SIGN_IN_FAILED', null, null, { actor_id: u?.id ?? null, context: { via: 'login_code', handle, failures: n } });
      throw new Error(until ? `locked:${new Date(until).toISOString()}` : 'invalid_code');
    }
    if (!u.is_active) throw new Error('account_disabled');
    this.codeFailures.delete(handle);
    this.currentId = u.id;
    writeSession(u.id);
    this.log('SIGN_IN', null, null, { context: { via: 'login_code' } });
    this.emit();
  }

  async bootstrapOwner(): Promise<string> {
    await delay();
    throw new Error('Setup has already been completed');
  }

  private issueCode(u: DemoUser): string {
    let handle = u.login_handle;
    while (!handle || this.users.some((x) => x !== u && x.login_handle === handle)) handle = randomCodePart(4);
    const secret = randomCodePart(12);
    u.login_handle = handle;
    u.code_issued_at = nowIso();
    this.codeSecrets.set(u.id, secret);
    return formatCode(handle, secret);
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
        granted_permissions: m.granted_permissions ?? [], revoked_permissions: m.revoked_permissions ?? [], specialties: m.specialties ?? null,
        profile: { full_name_en: u.full_name_en, full_name_ar: u.full_name_ar, email: u.email, title: u.title,
          login_handle: u.login_handle ?? null, code_issued_at: u.code_issued_at ?? null, is_super_admin: u.is_super_admin },
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
      const unknown = [...(patch.granted_permissions ?? []), ...(patch.revoked_permissions ?? [])].find((x) => !PERMISSIONS.includes(x));
      if (unknown) throw new Error(`Unknown permission ${unknown}`);
      const addsAdmin = (patch.granted_permissions ?? []).some((x) => ADMIN_PERMISSIONS.includes(x) && !(m.granted_permissions ?? []).includes(x));
      if (addsAdmin && !a?.is_super_admin) throw new Forbidden('Only a super administrator can grant administrative permissions');
      if (patch.specialties && !patch.specialties.length) throw new Error('Choose at least one specialty');
      Object.assign(m, patch);
      this.log('UPDATE', 'clinic_memberships', null, { clinic_id: m.clinic_id, changed_fields: Object.keys(patch) });
      return;
    }
    throw new Forbidden();
  }

  async createStaffMember(input: Parameters<DataService['createStaffMember']>[0]) {
    await delay(200);
    const a = this.access();
    if (!hasPermission(a, 'admin.users', input.clinic_id)) throw new Forbidden();
    if (input.role === 'clinic_admin' && !a?.is_super_admin) throw new Forbidden('Only super administrators can appoint clinic administrators');
    if (input.granted_permissions.some((x) => ADMIN_PERMISSIONS.includes(x)) && !a?.is_super_admin) {
      throw new Forbidden('Only super administrators can grant administrative permissions');
    }
    if (!input.full_name_en?.trim() && !input.full_name_ar?.trim()) throw new Error('Enter the person’s name');
    if (input.specialties && !input.specialties.length) throw new Error('Choose at least one specialty');
    const id = `u-${crypto.randomUUID().slice(0, 8)}`;
    const u: DemoUser = {
      id, email: null, full_name_en: input.full_name_en?.trim() || null, full_name_ar: input.full_name_ar?.trim() || null,
      title: input.title?.trim() || null, preferred_language: 'en', is_super_admin: false, is_active: true,
      memberships: [{ id: `m-${id}`, clinic_id: input.clinic_id, role: input.role, is_active: true,
        granted_permissions: input.granted_permissions, revoked_permissions: input.revoked_permissions, specialties: input.specialties }],
    };
    this.users.push(u);
    const code = this.issueCode(u);
    this.log('CODE_ISSUED', 'clinic_memberships', null, { clinic_id: input.clinic_id, context: { kind: 'create', target_user_id: id } });
    return { user_id: id, code };
  }

  async resetLoginCode(userId: string) {
    await delay(150);
    const a = this.access();
    const u = this.users.find((x) => x.id === userId);
    if (!a || !u) throw new Error('User not found');
    const allowed = userId === a.user_id || a.is_super_admin
      || (!u.is_super_admin && u.memberships.some((m) => hasPermission(a, 'admin.users', m.clinic_id) && m.role !== 'clinic_admin'));
    if (!allowed) throw new Forbidden();
    const code = this.issueCode(u);
    this.log('CODE_ISSUED', null, null, { context: { kind: 'reset', target_user_id: userId } });
    return code;
  }

  async exportAllData() {
    await delay(200);
    if (!this.access()?.is_super_admin) throw new Forbidden('Only a super administrator can export all data');
    this.log('EXPORT', null, null, { context: { scope: 'all' } });
    return clone({
      clinics: DEMO_CLINICS, profiles: this.users.map(({ memberships: _m, ...p }) => p),
      clinic_memberships: this.users.flatMap((u) => u.memberships.map((m) => ({ ...m, user_id: u.id }))),
      patients: this.patients, patient_access_grants: this.grants, encounters: this.encounters, documents: this.documents,
      pregnancies: this.pregnancies, antenatal_visits: this.visits, fetal_assessments: this.fetal, fetal_biometry: this.biometry,
      labour_observations: this.labour, deliveries: this.deliveries, newborns: this.newborns, postnatal_visits: this.postnatal,
      gyn_profiles: this.gynProfiles, gyn_visits: this.gynVisits, gyn_ultrasounds: this.gynUs, cervical_screenings: this.screenings,
      colposcopies: this.colposcopies, gyn_procedures: this.gynProcedures, lab_results: this.labs, menopause_assessments: this.mrs,
      urogyn_assessments: this.iciq, fertility_profiles: this.fertilityProfiles, semen_analyses: this.semen, fertility_cycles: this.cycles,
      stimulation_monitoring: this.monitoring, embryos: this.embryos, embryo_transfers: this.transfers,
      fm_first_trimester: this.fmFirst, fm_anomaly_scans: this.fmAnomaly, fm_dopplers: this.fmDoppler, fm_cfdna: this.fmCfdna,
      fm_procedures: this.fmProcedures, audit_log: this.audit,
    }) as Record<string, unknown[]>;
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
    if (!p || !this.can(p, 'clinical.read')) {
      return { profile: null, visits: [], ultrasounds: [], screenings: [], colposcopies: [], procedures: [], labs: [], menopause_assessments: [], urogyn_assessments: [] };
    }
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
      labs: by(this.labs).sort((a, b) => a.collected_at.localeCompare(b.collected_at)),
      menopause_assessments: by(this.mrs).sort((a, b) => a.assessed_at.localeCompare(b.assessed_at)),
      urogyn_assessments: by(this.iciq).sort((a, b) => a.assessed_at.localeCompare(b.assessed_at)),
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
    if (!u.adnexal_mass && (u.iota_b_features.length || u.iota_m_features.length || u.rmi_features.length || u.orads_category != null)) {
      throw new Error('Mass features require an adnexal mass');
    }
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

  async recordLabResults(patientId: string, results: Parameters<DataService['recordLabResults']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    const clinicId = this.clinicFor(patientId);
    for (const r of results) {
      if (r.collected_at > todayIso()) throw new Error('Collection date cannot be in the future');
      if (r.ref_low != null && r.ref_high != null && r.ref_low > r.ref_high) throw new Error('Reference range must be ordered');
      if (r.value < 0) throw new Error('Value cannot be negative');
    }
    results.forEach((r) => this.labs.push({ ...r, id: crypto.randomUUID(), patient_id: patientId, clinic_id: clinicId, recorded_by: this.currentId }));
    this.log('INSERT', 'lab_results', patientId);
  }

  async recordMenopauseAssessment(patientId: string, a: Parameters<DataService['recordMenopauseAssessment']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (a.items.length !== 11 || a.items.some((x) => x < 0 || x > 4)) throw new Error('All 11 items must be scored 0–4');
    const s = (idx: number[]) => idx.reduce((t, i) => t + a.items[i], 0);
    const somatic = s([0, 1, 2, 10]), psychological = s([3, 4, 5, 6]), urogenital = s([7, 8, 9]);
    this.mrs.push({ ...a, id: crypto.randomUUID(), patient_id: patientId, clinic_id: this.clinicFor(patientId), somatic, psychological, urogenital,
      total: somatic + psychological + urogenital, recorded_by: this.currentId });
    this.log('INSERT', 'menopause_assessments', patientId);
  }

  async recordUrogynAssessment(patientId: string, a: Parameters<DataService['recordUrogynAssessment']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (![0, 2, 4, 6].includes(a.amount)) throw new Error('Amount must be 0, 2, 4 or 6');
    this.iciq.push({ ...a, id: crypto.randomUUID(), patient_id: patientId, clinic_id: this.clinicFor(patientId),
      score: a.frequency + a.amount + a.interference, recorded_by: this.currentId });
    this.log('INSERT', 'urogyn_assessments', patientId);
  }

  // --- infertility ---------------------------------------------------------------------
  private tagInfertility(patientId: string) {
    const pt = this.patients.find((x) => x.id === patientId);
    if (pt && !pt.specialties.includes('infertility')) pt.specialties = [...pt.specialties, 'infertility'];
  }

  private cycleOrThrow(cycleId: string, perm: Permission) {
    const c = this.cycles.find((x) => x.id === cycleId);
    if (!c) throw new Error('Cycle not found');
    this.patientOrThrow(c.patient_id, perm);
    return c;
  }

  async listFertilityWorklist(clinicId?: string | null): Promise<FertilityWorklistRow[]> {
    await delay();
    return this.cycles.flatMap((c) => {
      const p = this.patients.find((x) => x.id === c.patient_id);
      if (!p || p.deleted_at || !this.can(p, 'clinical.read') || (clinicId && c.clinic_id !== clinicId)) return [];
      const m = this.monitoring.filter((x) => x.cycle_id === c.id).sort((a, b) => b.monitored_on.localeCompare(a.monitored_on))[0];
      const t = this.transfers.filter((x) => x.cycle_id === c.id).sort((a, b) => b.transfer_on.localeCompare(a.transfer_on))[0];
      if (['completed', 'cancelled'].includes(c.status) && t?.outcome !== 'pending') return [];
      return [{
        cycle_id: c.id, patient_id: p.id, clinic_id: c.clinic_id, cycle_type: c.cycle_type, cycle_number: c.cycle_number ?? null, status: c.status,
        start_date: c.start_date, stim_protocol: c.stim_protocol ?? null, trigger_at: c.trigger_at ?? null, retrieval_at: c.retrieval_at ?? null,
        oocytes_retrieved: c.oocytes_retrieved ?? null, freeze_all: c.freeze_all ?? false, mrn: p.mrn, first_name_en: p.first_name_en,
        last_name_en: p.last_name_en, first_name_ar: p.first_name_ar, last_name_ar: p.last_name_ar, date_of_birth: p.date_of_birth,
        last_monitoring_on: m?.monitored_on ?? null, last_stim_day: m?.stim_day ?? null, last_e2: m?.e2_pmol_l ?? null,
        last_follicles_right: m?.follicles_right ?? null, last_follicles_left: m?.follicles_left ?? null,
        last_transfer_on: t?.transfer_on ?? null, last_transfer_day: t?.embryo_day ?? null, last_transfer_outcome: t?.outcome ?? null,
        last_beta_hcg: t?.beta_hcg_value ?? null,
      }];
    });
  }

  async listCryoInventory(clinicId?: string | null): Promise<CryoRow[]> {
    await delay();
    return this.embryos.filter((e) => e.status === 'frozen' && (!clinicId || e.clinic_id === clinicId)).flatMap((e) => {
      const p = this.patients.find((x) => x.id === e.patient_id);
      if (!p || p.deleted_at || !this.can(p, 'clinical.read')) return [];
      const c = this.cycles.find((x) => x.id === e.cycle_id);
      return [{
        embryo_id: e.id, patient_id: p.id, clinic_id: e.clinic_id, cycle_id: e.cycle_id, embryo_no: e.embryo_no, day_observed: e.day_observed,
        stage: e.stage, blast_expansion: e.blast_expansion, icm_grade: e.icm_grade, te_grade: e.te_grade, cell_count: e.cell_count, fragmentation_grade: e.fragmentation_grade,
        pgt_result: e.pgt_result, frozen_at: e.frozen_at, storage_location: e.storage_location, consent_expires_on: e.consent_expires_on,
        cycle_number: c?.cycle_number ?? null, mrn: p.mrn, first_name_en: p.first_name_en, last_name_en: p.last_name_en,
        first_name_ar: p.first_name_ar, last_name_ar: p.last_name_ar,
      }];
    });
  }

  async getFertilityDetail(patientId: string) {
    await delay(80);
    const p = this.patients.find((x) => x.id === patientId);
    if (!p || !this.can(p, 'clinical.read')) return { profile: null, semen: [], cycles: [], monitoring: [], embryos: [], transfers: [], labs: [] };
    const by = <T extends { patient_id: string }>(a: T[]) => a.filter((x) => x.patient_id === patientId);
    return clone({
      profile: this.fertilityProfiles.find((x) => x.patient_id === patientId) ?? null,
      semen: by(this.semen).sort((a, b) => a.collected_at.localeCompare(b.collected_at)),
      cycles: by(this.cycles).sort((a, b) => a.start_date.localeCompare(b.start_date)),
      monitoring: by(this.monitoring).sort((a, b) => a.monitored_on.localeCompare(b.monitored_on)),
      embryos: by(this.embryos).sort((a, b) => a.embryo_no - b.embryo_no),
      transfers: by(this.transfers).sort((a, b) => a.transfer_on.localeCompare(b.transfer_on)),
      labs: by(this.labs).sort((a, b) => a.collected_at.localeCompare(b.collected_at)),
    });
  }

  async saveFertilityProfile(patientId: string, prof: Parameters<DataService['saveFertilityProfile']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (prof.tubal_method && (prof.tubal_assessment ?? 'not_done') === 'not_done') throw new Error('Tubal method requires a result');
    const existing = this.fertilityProfiles.find((x) => x.patient_id === patientId);
    if (existing) Object.assign(existing, prof);
    else { this.fertilityProfiles.push({ ...prof, patient_id: patientId }); this.tagInfertility(patientId); }
    this.log(existing ? 'UPDATE' : 'INSERT', 'fertility_profiles', patientId);
  }

  async recordSemenAnalysis(patientId: string, a: Parameters<DataService['recordSemenAnalysis']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    if (a.collected_at > todayIso()) throw new Error('Collection date cannot be in the future');
    if (a.progressive_pct != null && a.total_motility_pct != null && a.progressive_pct > a.total_motility_pct) {
      throw new Error('Progressive motility cannot exceed total motility');
    }
    const total = a.volume_ml != null && a.concentration_m_ml != null ? Math.round(a.volume_ml * a.concentration_m_ml * 100) / 100 : null;
    this.semen.push({ ...a, id: crypto.randomUUID(), patient_id: patientId, clinic_id: this.clinicFor(patientId), total_count_m: total,
      tmsc_m: total != null && a.progressive_pct != null ? Math.round(total * a.progressive_pct) / 100 : null, recorded_by: this.currentId });
    this.log('INSERT', 'semen_analyses', patientId);
  }

  private validateCycle(c: Partial<FertilityCycle>) {
    if (c.mii_oocytes != null && c.oocytes_retrieved != null && c.mii_oocytes > c.oocytes_retrieved) throw new Error('MII cannot exceed oocytes retrieved');
    if (c.fertilized_2pn != null && c.oocytes_retrieved != null && c.fertilized_2pn > c.oocytes_retrieved) throw new Error('2PN cannot exceed oocytes retrieved');
    if (c.freeze_all_reason && !c.freeze_all) throw new Error('Freeze-all reason requires freeze-all');
    if (c.cancel_reason && c.status !== 'cancelled') throw new Error('Cancel reason requires a cancelled cycle');
  }

  async createFertilityCycle(patientId: string, c: Parameters<DataService['createFertilityCycle']>[1]) {
    await delay();
    this.patientOrThrow(patientId, 'clinical.write');
    const { clinic_id, ...rest } = c;
    this.validateCycle(rest);
    const n = Math.max(0, ...this.cycles.filter((x) => x.patient_id === patientId).map((x) => x.cycle_number ?? 0)) + 1;
    const cycle: FertilityCycle = { ...rest, id: crypto.randomUUID(), patient_id: patientId, clinic_id: this.clinicFor(patientId, clinic_id), cycle_number: rest.cycle_number ?? n };
    this.cycles.push(cycle);
    this.tagInfertility(patientId);
    this.log('INSERT', 'fertility_cycles', patientId);
    return clone(cycle);
  }

  async updateFertilityCycle(cycleId: string, patch: Partial<FertilityCycle>) {
    await delay();
    const c = this.cycleOrThrow(cycleId, 'clinical.write');
    this.validateCycle({ ...c, ...patch });
    Object.assign(c, patch);
    this.log('UPDATE', 'fertility_cycles', c.patient_id, { changed_fields: Object.keys(patch) });
  }

  async recordMonitoring(cycleId: string, m: Parameters<DataService['recordMonitoring']>[1]) {
    await delay();
    const c = this.cycleOrThrow(cycleId, 'clinical.write');
    if (m.monitored_on > todayIso()) throw new Error('Date cannot be in the future');
    if ([...m.follicles_right, ...m.follicles_left].some((f) => f < 2 || f > 40)) throw new Error('Follicle sizes must be 2–40 mm');
    this.monitoring.push({ ...m, id: crypto.randomUUID(), cycle_id: cycleId, patient_id: c.patient_id, clinic_id: c.clinic_id, recorded_by: this.currentId });
    this.log('INSERT', 'stimulation_monitoring', c.patient_id);
  }

  async saveEmbryo(cycleId: string, e: Parameters<DataService['saveEmbryo']>[1], embryoId?: string) {
    await delay();
    const c = this.cycleOrThrow(cycleId, 'clinical.write');
    if (e.stage !== 'blastocyst' && (e.blast_expansion != null || e.icm_grade || e.te_grade)) throw new Error('Blastocyst grades only apply to blastocysts');
    if (e.status === 'frozen' && (!e.frozen_at || !e.storage_location)) throw new Error('A frozen embryo needs a freeze date and storage location');
    if (embryoId) {
      const ex = this.embryos.find((x) => x.id === embryoId && x.cycle_id === cycleId);
      if (!ex) throw new Forbidden();
      Object.assign(ex, e);
      this.log('UPDATE', 'embryos', c.patient_id, { changed_fields: Object.keys(e) });
      return;
    }
    if (this.embryos.some((x) => x.cycle_id === cycleId && x.embryo_no === e.embryo_no)) throw new Error('Embryo number already used in this cycle');
    this.embryos.push({ ...e, id: crypto.randomUUID(), cycle_id: cycleId, patient_id: c.patient_id, clinic_id: c.clinic_id });
    this.log('INSERT', 'embryos', c.patient_id);
  }

  async recordTransfer(cycleId: string, tr: Parameters<DataService['recordTransfer']>[1]) {
    await delay();
    const c = this.cycleOrThrow(cycleId, 'clinical.write');
    if (tr.transfer_on > todayIso()) throw new Error('Transfer date cannot be in the future');
    if (tr.embryo_ids.length && tr.embryo_ids.length !== tr.embryos_transferred) throw new Error('Embryo count must match the selected embryos');
    const bad = tr.embryo_ids.some((id) => {
      const e = this.embryos.find((x) => x.id === id);
      return !e || e.patient_id !== c.patient_id || !['in_culture', 'frozen', 'thawed'].includes(e.status);
    });
    if (bad) throw new Error('Transferred embryos must be this patient’s available embryos');
    this.transfers.push({ ...tr, id: crypto.randomUUID(), cycle_id: cycleId, patient_id: c.patient_id, clinic_id: c.clinic_id, recorded_by: this.currentId,
      beta_hcg_on: null, beta_hcg_value: null, gestational_sacs: null, fetal_hearts: null, outcome: 'pending', pregnancy_id: null });
    this.embryos.filter((e) => tr.embryo_ids.includes(e.id)).forEach((e) => { e.status = 'transferred'; });
    this.log('INSERT', 'embryo_transfers', c.patient_id);
  }

  async updateTransfer(transferId: string, patch: Partial<EmbryoTransfer>) {
    await delay();
    const t = this.transfers.find((x) => x.id === transferId);
    if (!t) throw new Forbidden();
    this.patientOrThrow(t.patient_id, 'clinical.write');
    const next = { ...t, ...patch };
    if (next.fetal_hearts != null && next.gestational_sacs != null && next.fetal_hearts > next.gestational_sacs) throw new Error('Fetal hearts cannot exceed sacs');
    if (['clinical', 'ongoing'].includes(next.outcome) && !(next.gestational_sacs && next.gestational_sacs >= 1)) throw new Error('A clinical pregnancy requires a gestational sac');
    if (next.beta_hcg_on && next.beta_hcg_on <= next.transfer_on) throw new Error('β-hCG date must follow the transfer');
    Object.assign(t, patch);
    this.log('UPDATE', 'embryo_transfers', t.patient_id, { changed_fields: Object.keys(patch) });
  }

  // --- fetal medicine --------------------------------------------------------------
  private tagFetal(patientId: string) {
    const pt = this.patients.find((x) => x.id === patientId);
    if (pt && !pt.specialties.includes('fetal_medicine')) pt.specialties = [...pt.specialties, 'fetal_medicine'];
  }

  async listFmWorklist(clinicId?: string | null): Promise<FmWorklistRow[]> {
    await delay();
    const worst = <T extends string>(order: T[], vals: Array<T | null>) => vals.reduce<T | null>((w, v) => (v && (!w || order.indexOf(v) > order.indexOf(w)) ? v : w), null);
    const latestHeader = <R extends { fetal_assessment_id: string }>(rows: R[]) => {
      const ids = [...new Set(rows.map((r) => r.fetal_assessment_id))];
      const hdr = ids.map((id) => this.fetal.find((f) => f.id === id)!).filter(Boolean).sort((a, b) => b.performed_at.localeCompare(a.performed_at))[0];
      return hdr ? { hdr, rows: rows.filter((r) => r.fetal_assessment_id === hdr.id) } : null;
    };
    return this.pregnancies
      .filter((g) => g.status === 'active' && (!clinicId || g.clinic_id === clinicId))
      .flatMap((g) => {
        const p = this.patients.find((x) => x.id === g.patient_id);
        if (!p || p.deleted_at || !this.can(p, 'clinical.read')) return [];
        const cf = this.fmCfdna.filter((c) => c.pregnancy_id === g.id).sort((a, b) => b.sampled_on.localeCompare(a.sampled_on))[0];
        const procs = this.fmProcedures.filter((x) => x.pregnancy_id === g.id);
        if (!p.specialties.includes('fetal_medicine') && !cf && !procs.length) return [];
        const ft = latestHeader(this.fmFirst.filter((x) => x.pregnancy_id === g.id));
        const an = latestHeader(this.fmAnomaly.filter((x) => x.pregnancy_id === g.id));
        const dp = latestHeader(this.fmDoppler.filter((x) => x.pregnancy_id === g.id));
        const min = (v: Array<number | null>) => { const n = v.filter((x): x is number => x != null); return n.length ? Math.min(...n) : null; };
        const max = (v: Array<number | null>) => { const n = v.filter((x): x is number => x != null); return n.length ? Math.max(...n) : null; };
        const scans = this.fetal.filter((f) => f.pregnancy_id === g.id).map((f) => f.performed_at).sort();
        return [{
          pregnancy_id: g.id, patient_id: p.id, clinic_id: g.clinic_id, plurality: g.plurality, chorionicity: g.chorionicity, edd: g.edd, lmp: g.lmp,
          cycle_length_days: g.cycle_length_days, ga_days: gaDaysOn(g), mrn: p.mrn, first_name_en: p.first_name_en, last_name_en: p.last_name_en,
          first_name_ar: p.first_name_ar, last_name_ar: p.last_name_ar, date_of_birth: p.date_of_birth, rh_factor: p.rh_factor,
          last_risk_t21: ft ? min(ft.rows.map((r) => r.risk_t21)) : null, last_risk_t18: ft ? min(ft.rows.map((r) => r.risk_t18)) : null,
          last_risk_t13: ft ? min(ft.rows.map((r) => r.risk_t13)) : null, last_nt_mm: ft ? max(ft.rows.map((r) => r.nt_mm)) : null,
          cfdna_status: cf?.result_status ?? null, cfdna_t21: cf?.t21 ?? null, cfdna_t18: cf?.t18 ?? null, cfdna_t13: cf?.t13 ?? null,
          anomaly_conclusion: an ? worst(['normal', 'soft_markers', 'incomplete', 'anomaly_suspected'], an.rows.map((r) => r.conclusion)) : null,
          anomaly_at: an?.hdr.performed_at ?? null, last_doppler_at: dp?.hdr.performed_at ?? null,
          last_ua_edf: dp ? worst(['present', 'absent', 'reversed'], dp.rows.map((r) => r.ua_edf)) : null,
          last_dv_a_wave: dp ? worst(['positive', 'absent', 'reversed'], dp.rows.map((r) => r.dv_a_wave)) : null,
          last_mca_psv_mom: dp ? max(dp.rows.map((r) => r.mca_psv_mom)) : null, last_cpr: dp ? min(dp.rows.map((r) => r.cpr)) : null,
          last_hydrops: dp ? dp.rows.some((r) => r.hydrops) : null,
          last_cpr_low: dp ? dp.rows.some((r) => cprLow(r)) : null, last_ua_pi_high: dp ? dp.rows.some((r) => (r.ua_pi_centile ?? 0) > 95) : null,
          last_mvp_min: dp ? min(dp.rows.map((r) => r.mvp_cm)) : null, last_mvp_max: dp ? max(dp.rows.map((r) => r.mvp_cm)) : null,
          last_bladder_absent: dp ? dp.rows.some((r) => r.bladder_visible === false) : null,
          pending_procedures: procs.filter((x) => x.result_status === 'pending').length, last_scan_at: scans[scans.length - 1] ?? null,
        }];
      });
  }

  async getFetalMedicineDetail(pregnancyId: string): Promise<FetalMedicineDetail | null> {
    await delay(80);
    const g = this.pregnancies.find((x) => x.id === pregnancyId);
    const p = g && this.patients.find((x) => x.id === g.patient_id);
    if (!g || !p || !this.can(p, 'clinical.read')) return null;
    const by = <T extends { pregnancy_id: string }>(rows: T[]) => clone(rows.filter((r) => r.pregnancy_id === g.id));
    const ga = (a: { ga_days: number | null; fetus_label?: string }, b: { ga_days: number | null; fetus_label?: string }) =>
      (a.ga_days ?? 0) - (b.ga_days ?? 0) || (a.fetus_label ?? '').localeCompare(b.fetus_label ?? '');
    return {
      pregnancy: clone(g),
      scans: clone(this.fetal.filter((f) => f.pregnancy_id === g.id)).sort((a, b) => a.performed_at.localeCompare(b.performed_at)),
      biometry: by(this.biometry).sort(ga), firstTrimester: by(this.fmFirst).sort(ga), anomaly: by(this.fmAnomaly).sort(ga),
      doppler: by(this.fmDoppler).sort(ga), cfdna: by(this.fmCfdna).sort((a, b) => a.sampled_on.localeCompare(b.sampled_on)),
      procedures: by(this.fmProcedures).sort((a, b) => a.performed_on.localeCompare(b.performed_on)),
    };
  }

  async recordFmScan(pregnancyId: string, type: Parameters<DataService['recordFmScan']>[1], scan: Parameters<DataService['recordFmScan']>[2], fetuses: FmFetusInput[]) {
    await delay();
    if (!['nt_scan', 'anomaly_scan', 'doppler'].includes(type)) throw new Error(`Unknown fetal medicine scan type ${type}`);
    const g = this.pregnancyOrThrow(pregnancyId, 'clinical.write');
    if (!fetuses.length || fetuses.length > g.plurality) throw new Error(`Provide between 1 and ${g.plurality} fetus records`);
    if (new Set(fetuses.map((f) => f.fetus_label)).size !== fetuses.length) throw new Error('Fetus labels must be unique');
    for (const f of fetuses) if (f.fetus_label.charCodeAt(0) - 64 > g.plurality) throw new Error(`Fetus ${f.fetus_label} does not exist in this pregnancy (plurality ${g.plurality})`);
    if (new Date(scan.performed_at) > new Date()) throw new Error('Scan date cannot be in the future');
    const clinicId = scan.clinic_id || g.clinic_id;
    this.assertMember(clinicId);
    const date = scan.performed_at.slice(0, 10);
    const ga = gaDaysOn(g, date);
    const id = crypto.randomUUID();
    const link = (f: FmFetusInput) => ({ id: crypto.randomUUID(), fetal_assessment_id: id, pregnancy_id: g.id, patient_id: g.patient_id, clinic_id: clinicId, ga_days: ga, fetus_label: f.fetus_label });
    const rows: Array<() => void> = [];
    for (const f of fetuses) {
      if (type === 'nt_scan') {
        const r = { ...(f as FmFirstTrimester), ...link(f) };
        if ((r.risk_t21 != null || r.risk_t18 != null || r.risk_t13 != null) && !r.risk_method) throw new Error('A risk needs its calculation method');
        if (r.nt_mm != null && (r.nt_mm < 0.3 || r.nt_mm > 20)) throw new Error('NT must be between 0.3 and 20 mm');
        if (r.crl_mm != null && (r.crl_mm < 20 || r.crl_mm > 100)) throw new Error('CRL must be between 20 and 100 mm');
        rows.push(() => this.fmFirst.push(r));
      } else if (type === 'anomaly_scan') {
        const r = { ...(f as FmAnomalyScan), ...link(f) };
        if ([...r.abnormal_structures, ...r.not_visualised].some((x) => !FM_STRUCTURES.includes(x))) throw new Error('Unknown structure');
        if (r.abnormal_structures.some((x) => r.not_visualised.includes(x))) throw new Error('A structure cannot be both abnormal and not visualised');
        if (r.conclusion === 'normal' && (r.abnormal_structures.length || r.not_visualised.length || r.soft_markers.length)) {
          throw new Error('A normal conclusion requires a complete survey without markers');
        }
        if (r.conclusion === 'anomaly_suspected' && !r.abnormal_structures.length && !r.anomalies?.trim()) throw new Error('Name the abnormal structure or describe the anomaly');
        if (r.placenta_os_mm != null && !r.placenta_location) throw new Error('Record the placental site with its distance to the os');
        rows.push(() => this.fmAnomaly.push(r));
      } else {
        const r = deriveDoppler({ ...(f as FmDoppler), ...link(f), hydrops: !!(f as FmDoppler).hydrops, fetal_demise: !!(f as FmDoppler).fetal_demise } as FmDoppler);
        const any = [r.ua_pi, r.ua_edf, r.mca_pi, r.mca_psv_cm_s, r.uta_left_pi, r.uta_right_pi, r.dv_pi, r.dv_a_wave, r.mvp_cm, r.bladder_visible, r.ctg].some((x) => x != null);
        if (!any && !r.hydrops && !r.fetal_demise) throw new Error('Enter at least one Doppler or surveillance finding');
        rows.push(() => this.fmDoppler.push(r));
      }
    }
    this.fetal.push({ id, patient_id: g.patient_id, pregnancy_id: g.id, clinic_id: clinicId, assessment_type: type, performed_at: scan.performed_at,
      gestational_age_days: ga, fetus_number: fetuses.length, impression: scan.impression });
    rows.forEach((push) => push());
    this.tagFetal(g.patient_id);
    this.log('INSERT', type === 'nt_scan' ? 'fm_first_trimester' : type === 'anomaly_scan' ? 'fm_anomaly_scans' : 'fm_dopplers', g.patient_id);
    return id;
  }

  async recordCfdna(pregnancyId: string, c: Parameters<DataService['recordCfdna']>[1]) {
    await delay();
    const g = this.pregnancyOrThrow(pregnancyId, 'clinical.write');
    this.assertMember(g.clinic_id);
    const row: FmCfdna = {
      id: crypto.randomUUID(), patient_id: g.patient_id, pregnancy_id: g.id, clinic_id: g.clinic_id, sampled_on: c.sampled_on || todayIso(),
      ga_days: null, laboratory: c.laboratory, result_status: 'pending', fetal_fraction_pct: null, t21: null, t18: null, t13: null,
      sex_chromosomes: null, fetal_sex: null, resulted_on: null, notes: c.notes,
    };
    row.ga_days = gaDaysOn(g, row.sampled_on);
    validateCfdna(row);
    this.fmCfdna.push(row);
    this.tagFetal(g.patient_id);
    this.log('INSERT', 'fm_cfdna', g.patient_id);
  }

  async updateCfdna(id: string, patch: Partial<FmCfdna>) {
    await delay();
    const c = this.fmCfdna.find((x) => x.id === id);
    if (!c) throw new Error('Record not found');
    this.patientOrThrow(c.patient_id, 'clinical.write');
    const next = { ...c, ...patch, id: c.id, patient_id: c.patient_id, pregnancy_id: c.pregnancy_id };
    validateCfdna(next);
    Object.assign(c, next);
    this.log('UPDATE', 'fm_cfdna', c.patient_id);
  }

  async recordFmProcedure(pregnancyId: string, p: Parameters<DataService['recordFmProcedure']>[1]) {
    await delay();
    const g = this.pregnancyOrThrow(pregnancyId, 'clinical.write');
    this.assertMember(g.clinic_id);
    if (p.fetus_label.charCodeAt(0) - 64 > g.plurality) throw new Error('Fetus does not exist in this pregnancy');
    const row: FmProcedure = { ...p, id: crypto.randomUUID(), patient_id: g.patient_id, pregnancy_id: g.id, clinic_id: g.clinic_id,
      ga_days: gaDaysOn(g, p.performed_on), operator_id: this.currentId };
    validateProcedure(row);
    this.fmProcedures.push(row);
    this.tagFetal(g.patient_id);
    this.log('INSERT', 'fm_procedures', g.patient_id);
  }

  async updateFmProcedure(id: string, patch: Partial<FmProcedure>) {
    await delay();
    const p = this.fmProcedures.find((x) => x.id === id);
    if (!p) throw new Error('Record not found');
    this.patientOrThrow(p.patient_id, 'clinical.write');
    const next = { ...p, ...patch, id: p.id, patient_id: p.patient_id, pregnancy_id: p.pregnancy_id };
    next.ga_days = gaDaysOn(this.pregnancies.find((g) => g.id === p.pregnancy_id)!, next.performed_on);
    validateProcedure(next);
    Object.assign(p, next);
    this.log('UPDATE', 'fm_procedures', p.patient_id);
  }
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DataService, AuthUser } from './service';
import type {
  AntenatalVisitRow, Delivery, FetalAssessment, Newborn, ObstetricWorklistRow, Pregnancy,
  AccessGrant, AuditEvent, Clinic, DashboardStats, DocumentMeta, MyAccess, Patient,
  PatientClinical, Profile, ResearchProject, StaffMember,
} from './types';
import { buildStoragePath, MAX_UPLOAD_BYTES, sha256Hex } from '@/lib/files';

const BUCKET = 'patient-documents';
const SIGNED_URL_TTL_SECONDS = 60;

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Escape user input for PostgREST `or=(...ilike...)` filters. */
function ilikeTerm(s: string): string {
  return s.replace(/[%_,()\\]/g, ' ').trim();
}

export class SupabaseService implements DataService {
  readonly mode = 'supabase' as const;
  private sb: SupabaseClient;

  constructor(url: string, anonKey: string) {
    this.sb = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
  }

  // --- auth ---------------------------------------------------------------
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data } = await this.sb.auth.getUser();
    return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
  }

  onAuthChange(cb: (user: AuthUser | null) => void): () => void {
    const { data } = this.sb.auth.onAuthStateChange((_event, session) => {
      cb(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(email: string, password: string) {
    const { error } = await this.sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
  }

  async sendPasswordReset(email: string) {
    const { error } = await this.sb.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/settings`,
    });
    if (error) throw new Error(error.message);
  }

  async signOut() {
    await this.sb.auth.signOut();
  }

  // --- identity -------------------------------------------------------------
  async getMyAccess(): Promise<MyAccess | null> {
    return check(await this.sb.rpc('get_my_access')) as MyAccess | null;
  }

  async getMyProfile(): Promise<Profile | null> {
    const user = await this.getCurrentUser();
    if (!user) return null;
    return check(await this.sb.from('profiles').select('*').eq('id', user.id).maybeSingle()) as Profile | null;
  }

  async updateMyProfile(patch: Partial<Profile>) {
    const user = await this.getCurrentUser();
    if (!user) throw new Error('Not authenticated');
    check(await this.sb.from('profiles').update(patch).eq('id', user.id));
  }

  async listClinics(): Promise<Clinic[]> {
    return check(await this.sb.from('clinics').select('id, code, name_en, name_ar, is_active').order('name_en')) as Clinic[];
  }

  async listProfiles(ids?: string[]): Promise<Profile[]> {
    let q = this.sb.from('profiles').select('*').order('full_name_en');
    if (ids?.length) q = q.in('id', ids);
    return check(await q) as Profile[];
  }

  // --- dashboard ------------------------------------------------------------
  async dashboardStats(clinicId?: string | null): Promise<DashboardStats> {
    return check(await this.sb.rpc('dashboard_stats', { p_clinic: clinicId ?? null })) as DashboardStats;
  }

  // --- patients -------------------------------------------------------------
  async listPatients({ search, specialty, clinicId, limit = 100 }: Parameters<DataService['listPatients']>[0]) {
    let q = this.sb.from('patients').select('*').is('deleted_at', null).order('updated_at', { ascending: false }).limit(limit);
    if (clinicId) q = q.eq('clinic_id', clinicId);
    if (specialty && specialty !== 'all') q = q.contains('specialties', [specialty]);
    const term = search ? ilikeTerm(search) : '';
    if (term) {
      const p = `%${term}%`;
      q = q.or(
        ['mrn', 'first_name_en', 'last_name_en', 'first_name_ar', 'last_name_ar', 'phone', 'national_id']
          .map((c) => `${c}.ilike.${p}`)
          .join(','),
      );
    }
    return check(await q) as Patient[];
  }

  async getPatient(id: string) {
    return check(await this.sb.from('patients').select('*').eq('id', id).maybeSingle()) as Patient | null;
  }

  async createPatient(input: Parameters<DataService['createPatient']>[0]) {
    return check(await this.sb.from('patients').insert(input).select('*').single()) as Patient;
  }

  async updatePatient(id: string, patch: Parameters<DataService['updatePatient']>[1]) {
    return check(await this.sb.from('patients').update(patch).eq('id', id).select('*').single()) as Patient;
  }

  async archivePatient(id: string) {
    check(await this.sb.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  }

  async getPatientClinical(id: string): Promise<PatientClinical> {
    const [pregnancies, cycles, fetal, encounters] = await Promise.all([
      this.sb.from('pregnancies').select('*').eq('patient_id', id).order('created_at', { ascending: false }),
      this.sb.from('fertility_cycles').select('*').eq('patient_id', id).order('start_date', { ascending: false }),
      this.sb.from('fetal_assessments').select('*').eq('patient_id', id).order('performed_at', { ascending: false }),
      this.sb.from('encounters')
        .select('id, patient_id, clinic_id, specialty, encounter_type, encounter_at, provider_id, is_private, status, chief_complaint, assessment, plan')
        .eq('patient_id', id).order('encounter_at', { ascending: false }).limit(50),
    ]);
    return {
      pregnancies: check(pregnancies),
      fertility_cycles: check(cycles),
      fetal_assessments: check(fetal),
      encounters: check(encounters),
    } as PatientClinical;
  }

  // --- documents --------------------------------------------------------------
  async listDocuments(patientId: string) {
    return check(
      await this.sb.from('documents').select('*').eq('patient_id', patientId).is('deleted_at', null)
        .order('uploaded_at', { ascending: false }),
    ) as DocumentMeta[];
  }

  async uploadDocument(patient: { id: string; clinic_id: string }, file: File, meta: Parameters<DataService['uploadDocument']>[2]) {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error('File exceeds the 50 MB limit');
    const id = crypto.randomUUID();
    const path = buildStoragePath(patient.clinic_id, patient.id, file.name, id);
    const up = await this.sb.storage.from(BUCKET).upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
    if (up.error) throw new Error(up.error.message);
    const row = {
      id,
      patient_id: patient.id,
      clinic_id: patient.clinic_id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      size_bytes: file.size,
      category: meta.category,
      description: meta.description || null,
      is_private: meta.is_private ?? false,
      sha256: await sha256Hex(file),
    };
    // Orphaned objects (upload ok, metadata insert failed) are swept by a
    // scheduled maintenance job; clients cannot delete stored objects.
    return check(await this.sb.from('documents').insert(row).select('*').single()) as DocumentMeta;
  }

  async getDocumentUrl(doc: DocumentMeta) {
    const { data, error } = await this.sb.storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
    if (error) throw new Error(error.message);
    void this.logAccess('DOWNLOAD', doc.patient_id, 'documents', doc.id);
    return data.signedUrl;
  }

  async archiveDocument(id: string) {
    check(await this.sb.from('documents').update({ deleted_at: new Date().toISOString() }).eq('id', id));
  }

  // --- sharing ----------------------------------------------------------------
  async listGrants(patientId: string) {
    return check(
      await this.sb.from('patient_access_grants').select('*').eq('patient_id', patientId)
        .order('granted_at', { ascending: false }),
    ) as AccessGrant[];
  }

  async createGrant(input: Parameters<DataService['createGrant']>[0]) {
    check(await this.sb.from('patient_access_grants').insert(input));
  }

  async revokeGrant(id: string) {
    check(await this.sb.from('patient_access_grants').update({ revoked_at: new Date().toISOString() }).eq('id', id));
  }

  async requestEmergencyAccess(patientId: string, reason: string, hours: number) {
    check(await this.sb.rpc('request_emergency_access', { p_patient_id: patientId, p_reason: reason, p_hours: hours }));
  }

  // --- audit -----------------------------------------------------------------
  async logAccess(action: 'VIEW' | 'DOWNLOAD' | 'PRINT' | 'EXPORT', patientId: string, table?: string, recordId?: string) {
    await this.sb.rpc('log_access_event', {
      p_action: action, p_patient_id: patientId, p_table_name: table ?? null, p_record_id: recordId ?? null,
    });
  }

  async listAudit({ patientId, clinicId, limit = 100 }: { patientId?: string; clinicId?: string | null; limit?: number }) {
    let q = this.sb.from('audit_log')
      .select('id, occurred_at, actor_id, action, table_name, record_id, patient_id, clinic_id, changed_fields, context')
      .order('occurred_at', { ascending: false }).limit(limit);
    if (patientId) q = q.eq('patient_id', patientId);
    if (clinicId) q = q.eq('clinic_id', clinicId);
    return check(await q) as AuditEvent[];
  }

  // --- administration ----------------------------------------------------------
  async listStaff(clinicId?: string | null): Promise<StaffMember[]> {
    let q = this.sb.from('clinic_memberships')
      .select('id, user_id, clinic_id, role, is_active, profile:profiles!clinic_memberships_user_id_fkey(full_name_en, full_name_ar, email, title)')
      .order('created_at');
    if (clinicId) q = q.eq('clinic_id', clinicId);
    const rows = check(await q) as unknown as Array<Omit<StaffMember, 'membership_id'> & { id: string }>;
    return rows.map(({ id, ...r }) => ({ membership_id: id, ...r }));
  }

  async updateMembership(membershipId: string, patch: Parameters<DataService['updateMembership']>[1]) {
    check(await this.sb.from('clinic_memberships').update(patch).eq('id', membershipId));
  }

  async inviteStaff(input: Parameters<DataService['inviteStaff']>[0]) {
    // Runs server-side with the service role after re-checking admin.users.
    const { error } = await this.sb.functions.invoke('invite-user', { body: input });
    if (error) throw new Error(error.message);
  }

  // --- research ------------------------------------------------------------------
  async listResearchProjects() {
    return check(await this.sb.from('research_projects').select('*').order('created_at', { ascending: false })) as ResearchProject[];
  }

  // --- obstetrics ------------------------------------------------------------------
  async listObstetricWorklist(clinicId?: string | null) {
    let q = this.sb.from('obstetric_worklist').select('*').order('edd', { ascending: true, nullsFirst: false }).limit(500);
    if (clinicId) q = q.eq('clinic_id', clinicId);
    return check(await q) as ObstetricWorklistRow[];
  }

  async getPregnancyDetail(pregnancyId: string) {
    const pregnancy = check(await this.sb.from('pregnancies').select('*').eq('id', pregnancyId).maybeSingle()) as Pregnancy | null;
    if (!pregnancy) return null;
    const [visits, delivery, fetal] = await Promise.all([
      this.sb.from('antenatal_visits')
        .select('*, encounter:encounters!antenatal_visits_encounter_id_fkey(id, status, provider_id, is_private, assessment, plan, chief_complaint, signed_by, signed_at)')
        .eq('pregnancy_id', pregnancyId).order('visit_date').order('created_at'),
      this.sb.from('deliveries').select('*').eq('pregnancy_id', pregnancyId).maybeSingle(),
      this.sb.from('fetal_assessments').select('*').eq('patient_id', pregnancy.patient_id).order('performed_at'),
    ]);
    const del = check(delivery) as Delivery | null;
    const newborns = del
      ? check(await this.sb.from('newborns').select('*').eq('delivery_id', del.id).order('birth_order')) as Newborn[]
      : [];
    return {
      pregnancy,
      visits: check(visits) as AntenatalVisitRow[],
      delivery: del,
      newborns,
      fetal_assessments: (check(fetal) as FetalAssessment[]).filter((f) => !f.pregnancy_id || f.pregnancy_id === pregnancyId),
    };
  }

  async createPregnancy(input: Parameters<DataService['createPregnancy']>[0]) {
    return check(await this.sb.from('pregnancies').insert(input).select('*').single()) as Pregnancy;
  }

  async updatePregnancy(id: string, patch: Parameters<DataService['updatePregnancy']>[1]) {
    return check(await this.sb.from('pregnancies').update(patch).eq('id', id).select('*').single()) as Pregnancy;
  }

  async recordAntenatalVisit(pregnancyId: string, visit: Parameters<DataService['recordAntenatalVisit']>[1], narrative: Parameters<DataService['recordAntenatalVisit']>[2]) {
    return check(await this.sb.rpc('record_antenatal_visit', {
      p_pregnancy_id: pregnancyId, p_visit: visit, p_encounter: narrative,
    })) as string;
  }

  async updateAntenatalVisit(visitId: string, encounterId: string, visit: Parameters<DataService['updateAntenatalVisit']>[2], narrative: Parameters<DataService['updateAntenatalVisit']>[3]) {
    const { is_private: _p, clinic_id: _c, ...text } = narrative;
    check(await this.sb.from('encounters').update(text).eq('id', encounterId));
    check(await this.sb.from('antenatal_visits').update(visit).eq('id', visitId));
  }

  async signEncounter(encounterId: string) {
    check(await this.sb.from('encounters').update({ status: 'signed' }).eq('id', encounterId));
  }

  async recordDelivery(pregnancyId: string, delivery: Parameters<DataService['recordDelivery']>[1], newborns: Parameters<DataService['recordDelivery']>[2]) {
    return check(await this.sb.rpc('record_delivery', {
      p_pregnancy_id: pregnancyId, p_delivery: delivery, p_newborns: newborns,
    })) as string;
  }
}

import type {
  FetalBiometryInput, FetalScanInput, LabourObservationInput, PostnatalVisitInput,
  AntenatalVisitInput, DeliveryInput, EncounterNarrative, NewbornInput, ObstetricWorklistRow, Pregnancy,
  PregnancyDetail, PregnancyInput,
  AccessGrant, AccessLevel, AuditEvent, Clinic, DashboardStats, DocumentCategory, DocumentMeta,
  MyAccess, Patient, PatientClinical, PatientInput, PatientQuery, Profile, ResearchProject, StaffMember,
} from './types';
import type { Role } from '@/rbac/permissions';

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Backend contract. Two implementations exist:
 *   - SupabaseService: production, every call is subject to RLS
 *   - DemoService:     in-memory sample data, used when no Supabase env is set
 * UI modules depend only on this interface.
 */
export interface DataService {
  readonly mode: 'supabase' | 'demo';

  // --- auth -------------------------------------------------------------
  getCurrentUser(): Promise<AuthUser | null>;
  onAuthChange(cb: (user: AuthUser | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
  signOut(): Promise<void>;

  // --- identity & access -----------------------------------------------
  getMyAccess(): Promise<MyAccess | null>;
  getMyProfile(): Promise<Profile | null>;
  updateMyProfile(patch: Partial<Pick<Profile, 'full_name_en' | 'full_name_ar' | 'title' | 'preferred_language'>>): Promise<void>;
  listClinics(): Promise<Clinic[]>;
  listProfiles(ids?: string[]): Promise<Profile[]>;

  // --- dashboard ----------------------------------------------------------
  dashboardStats(clinicId?: string | null): Promise<DashboardStats>;

  // --- patients -----------------------------------------------------------
  listPatients(q: PatientQuery): Promise<Patient[]>;
  getPatient(id: string): Promise<Patient | null>;
  createPatient(input: PatientInput): Promise<Patient>;
  updatePatient(id: string, patch: Partial<PatientInput>): Promise<Patient>;
  archivePatient(id: string): Promise<void>;
  getPatientClinical(id: string): Promise<PatientClinical>;

  // --- documents ----------------------------------------------------------
  listDocuments(patientId: string): Promise<DocumentMeta[]>;
  uploadDocument(
    patient: Pick<Patient, 'id' | 'clinic_id'>,
    file: File,
    meta: { category: DocumentCategory; description?: string; is_private?: boolean },
  ): Promise<DocumentMeta>;
  getDocumentUrl(doc: DocumentMeta): Promise<string>;
  archiveDocument(id: string): Promise<void>;

  // --- sharing ------------------------------------------------------------
  listGrants(patientId: string): Promise<AccessGrant[]>;
  createGrant(input: {
    patient_id: string;
    grantee_user_id?: string | null;
    grantee_clinic_id?: string | null;
    access_level: AccessLevel;
    reason?: string;
    expires_at?: string | null;
  }): Promise<void>;
  revokeGrant(id: string): Promise<void>;
  requestEmergencyAccess(patientId: string, reason: string, hours: number): Promise<void>;

  // --- audit --------------------------------------------------------------
  logAccess(action: 'VIEW' | 'DOWNLOAD' | 'PRINT' | 'EXPORT', patientId: string, table?: string, recordId?: string): Promise<void>;
  listAudit(q: { patientId?: string; clinicId?: string | null; limit?: number }): Promise<AuditEvent[]>;

  // --- administration -----------------------------------------------------
  listStaff(clinicId?: string | null): Promise<StaffMember[]>;
  updateMembership(membershipId: string, patch: { role?: Role; is_active?: boolean }): Promise<void>;
  inviteStaff(input: { email: string; clinic_id: string; role: Role; full_name_en?: string; full_name_ar?: string }): Promise<void>;

  // --- research -----------------------------------------------------------
  listResearchProjects(): Promise<ResearchProject[]>;

  // --- obstetrics ------------------------------------------------------------
  listObstetricWorklist(clinicId?: string | null): Promise<ObstetricWorklistRow[]>;
  getPregnancyDetail(pregnancyId: string): Promise<PregnancyDetail | null>;
  createPregnancy(input: PregnancyInput): Promise<Pregnancy>;
  updatePregnancy(id: string, patch: Partial<PregnancyInput>): Promise<Pregnancy>;
  /** Creates the draft obstetric encounter + typed vitals atomically. Returns the visit id. */
  recordAntenatalVisit(pregnancyId: string, visit: AntenatalVisitInput, narrative: EncounterNarrative): Promise<string>;
  updateAntenatalVisit(visitId: string, encounterId: string, visit: AntenatalVisitInput, narrative: EncounterNarrative): Promise<void>;
  signEncounter(encounterId: string): Promise<void>;
  /** Records delivery + newborns atomically and closes the pregnancy. Returns the delivery id. */
  recordDelivery(pregnancyId: string, delivery: DeliveryInput & { clinic_id?: string | null }, newborns: NewbornInput[]): Promise<string>;
  /** Scan + per-fetus biometry atomically; EFW is computed by the backend. */
  recordFetalScan(pregnancyId: string, scan: FetalScanInput, fetuses: FetalBiometryInput[]): Promise<string>;
  recordPostnatalVisit(deliveryId: string, visit: PostnatalVisitInput, narrative: EncounterNarrative): Promise<string>;
  addLabourObservation(pregnancyId: string, obs: LabourObservationInput): Promise<void>;
  /** Labour observations are append-only; errors are flagged, never edited. */
  markLabourObservationError(id: string): Promise<void>;
}

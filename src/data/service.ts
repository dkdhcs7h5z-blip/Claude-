import type {
  MembershipPatch, NewStaffMember, OwnerSetup,
  FetalMedicineDetail, FmCfdna, FmCfdnaInput, FmFetusInput, FmProcedure, FmProcedureInput, FmScanType, FmWorklistRow,
  CryoRow, EmbryoInput, EmbryoTransfer, EmbryoTransferInput, FertilityCycle, FertilityCycleInput, FertilityDetail,
  FertilityProfileInput, FertilityWorklistRow, SemenAnalysisInput, StimulationMonitoringInput,
  LabResultInput,
  CervicalScreening, CervicalScreeningInput, ColposcopyInput, GynDetail, GynProcedureInput, GynProfileInput,
  GynUltrasoundInput, GynVisitInput, GynWorklistRow, Colposcopy, GynProcedure,
  FetalBiometryInput, FetalScanInput, LabourObservationInput, PostnatalVisitInput,
  AntenatalVisitInput, DeliveryInput, EncounterNarrative, NewbornInput, ObstetricWorklistRow, Pregnancy,
  PregnancyDetail, PregnancyInput,
  AccessGrant, AccessLevel, AuditEvent, Clinic, DashboardStats, DocumentCategory, DocumentMeta,
  MyAccess, Patient, PatientClinical, PatientInput, PatientQuery, Profile, ResearchProject, StaffMember,
} from './types';

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
  /** Code-only sign-in (HHHH-SSSS-SSSS-SSSS). */
  signInWithCode(code: string): Promise<void>;
  /** First-run: creates the owner (super administrator) and first clinic; returns the owner's code. */
  bootstrapOwner(input: OwnerSetup): Promise<string>;
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
  updateMembership(membershipId: string, patch: MembershipPatch): Promise<void>;
  /** Creates a code-only account; the code is returned once. */
  createStaffMember(input: NewStaffMember): Promise<{ user_id: string; code: string }>;
  /** Issues a new login code (the old one stops working); returned once. */
  resetLoginCode(userId: string): Promise<string>;
  /** Super administrators: every table the caller can read, for backup. */
  exportAllData(): Promise<Record<string, unknown[]>>;

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

  // --- gynecology ---------------------------------------------------------------
  listGynWorklist(clinicId?: string | null): Promise<GynWorklistRow[]>;
  getGynDetail(patientId: string): Promise<GynDetail>;
  saveGynProfile(patientId: string, profile: GynProfileInput): Promise<void>;
  recordGynVisit(patientId: string, visit: GynVisitInput, narrative: EncounterNarrative): Promise<string>;
  updateGynVisit(visitId: string, encounterId: string, visit: GynVisitInput, narrative: EncounterNarrative): Promise<void>;
  recordGynUltrasound(patientId: string, us: GynUltrasoundInput): Promise<void>;
  recordScreening(patientId: string, s: CervicalScreeningInput): Promise<void>;
  updateScreening(id: string, patch: Partial<CervicalScreening>): Promise<void>;
  recordColposcopy(patientId: string, c: ColposcopyInput): Promise<void>;
  updateColposcopy(id: string, patch: Partial<Colposcopy>): Promise<void>;
  recordGynProcedure(patientId: string, p: GynProcedureInput): Promise<void>;
  updateGynProcedure(id: string, patch: Partial<GynProcedure>): Promise<void>;
  recordLabResults(patientId: string, results: LabResultInput[]): Promise<void>;
  recordMenopauseAssessment(patientId: string, a: { assessed_at: string; items: number[]; notes: string | null }): Promise<void>;
  // --- infertility -----------------------------------------------------------------
  listFertilityWorklist(clinicId?: string | null): Promise<FertilityWorklistRow[]>;
  listCryoInventory(clinicId?: string | null): Promise<CryoRow[]>;
  getFertilityDetail(patientId: string): Promise<FertilityDetail>;
  saveFertilityProfile(patientId: string, p: FertilityProfileInput): Promise<void>;
  recordSemenAnalysis(patientId: string, s: SemenAnalysisInput): Promise<void>;
  createFertilityCycle(patientId: string, c: FertilityCycleInput): Promise<FertilityCycle>;
  updateFertilityCycle(cycleId: string, patch: Partial<FertilityCycle>): Promise<void>;
  recordMonitoring(cycleId: string, m: StimulationMonitoringInput): Promise<void>;
  saveEmbryo(cycleId: string, e: EmbryoInput, embryoId?: string): Promise<void>;
  recordTransfer(cycleId: string, t: EmbryoTransferInput): Promise<void>;
  updateTransfer(transferId: string, patch: Partial<EmbryoTransfer>): Promise<void>;
  // --- fetal medicine --------------------------------------------------------------
  listFmWorklist(clinicId?: string | null): Promise<FmWorklistRow[]>;
  getFetalMedicineDetail(pregnancyId: string): Promise<FetalMedicineDetail | null>;
  /** Scan header + per-fetus fetal medicine records atomically. */
  recordFmScan(pregnancyId: string, type: FmScanType, scan: { performed_at: string; impression: string | null; clinic_id?: string | null }, fetuses: FmFetusInput[]): Promise<string>;
  recordCfdna(pregnancyId: string, c: FmCfdnaInput): Promise<void>;
  updateCfdna(id: string, patch: Partial<FmCfdna>): Promise<void>;
  recordFmProcedure(pregnancyId: string, p: FmProcedureInput): Promise<void>;
  updateFmProcedure(id: string, patch: Partial<FmProcedure>): Promise<void>;
  recordUrogynAssessment(patientId: string, a: { assessed_at: string; frequency: number; amount: number; interference: number; leak_situations: string[]; notes: string | null }): Promise<void>;
}

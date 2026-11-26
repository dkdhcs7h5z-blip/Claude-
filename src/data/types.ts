/**
 * Domain types. Field names intentionally match the PostgreSQL columns
 * (snake_case) so Supabase rows can be used without a mapping layer.
 */
import type { Permission, Role } from '@/rbac/permissions';

export const SPECIALTIES = ['obstetrics', 'gynecology', 'infertility', 'fetal_medicine'] as const;
export type Specialty = (typeof SPECIALTIES)[number];
export type Visibility = 'clinic' | 'private';
export type AccessLevel = 'read' | 'write';

export interface Clinic {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  is_active: boolean;
}

export interface Profile {
  id: string;
  email: string | null;
  full_name_en: string | null;
  full_name_ar: string | null;
  title: string | null;
  preferred_language: 'en' | 'ar';
  is_super_admin: boolean;
  is_active: boolean;
}

export interface Membership {
  clinic_id: string;
  clinic_code: string;
  clinic_name_en: string;
  clinic_name_ar: string;
  role: Role;
  permissions: Permission[];
}

export interface MyAccess {
  user_id: string;
  is_super_admin: boolean;
  is_active: boolean;
  memberships: Membership[];
}

export interface Patient {
  id: string;
  clinic_id: string;
  mrn: string;
  first_name_en: string | null;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  date_of_birth: string;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  nationality: string | null;
  marital_status: 'single' | 'married' | 'divorced' | 'widowed' | null;
  blood_group: 'A' | 'B' | 'AB' | 'O' | null;
  rh_factor: 'positive' | 'negative' | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  specialties: Specialty[];
  visibility: Visibility;
  primary_physician_id: string | null;
  research_consent: boolean;
  research_consent_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type PatientInput = Omit<
  Patient,
  'id' | 'created_by' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export interface Pregnancy {
  id: string;
  patient_id: string;
  clinic_id: string;
  lmp: string | null;
  edd: string | null;
  edd_basis: 'lmp' | 'ultrasound' | 'ivf_transfer' | null;
  gravida: number | null;
  para: number | null;
  abortus: number | null;
  living: number | null;
  conception: string | null;
  plurality: number;
  risk_level: 'low' | 'moderate' | 'high';
  risk_factors: string[];
  status: PregnancyStatus;
  outcome_date: string | null;
  notes: string | null;
  cycle_length_days: number;
  us_dating_date: string | null;
  us_dating_ga_days: number | null;
  transfer_date: string | null;
  embryo_age_days: 3 | 5 | 6 | null;
  booking_date: string | null;
  booking_weight_kg: number | null;
  height_cm: number | null;
  chorionicity: Chorionicity | null;
  previous_cs_count: number | null;
  high_risk_plan: string | null;
  current_medications: string | null;
}

export type Chorionicity = 'dcda' | 'mcda' | 'mcma' | 'tcta' | 'dcta' | 'mcta' | 'other';

export type PregnancyStatus = 'active' | 'delivered' | 'miscarriage' | 'ectopic' | 'termination' | 'stillbirth';
export type PregnancyInput = Omit<Pregnancy, 'id'>;

export interface FertilityCycle {
  id: string;
  patient_id: string;
  clinic_id: string;
  cycle_type: 'natural' | 'ovulation_induction' | 'iui' | 'ivf' | 'icsi' | 'fet' | 'oocyte_cryopreservation';
  protocol: string | null;
  start_date: string;
  status: 'planned' | 'stimulation' | 'retrieval' | 'transfer' | 'luteal' | 'completed' | 'cancelled';
  outcome: string | null;
}

export interface FetalAssessment {
  id: string;
  patient_id: string;
  pregnancy_id: string | null;
  clinic_id: string;
  assessment_type: string;
  performed_at: string;
  gestational_age_days: number | null;
  fetus_number: number;
  impression: string | null;
}

export interface Encounter {
  id: string;
  patient_id: string;
  clinic_id: string;
  specialty: Specialty;
  encounter_type: string;
  encounter_at: string;
  provider_id: string;
  is_private: boolean;
  status: 'draft' | 'signed' | 'amended';
  chief_complaint: string | null;
  assessment: string | null;
  plan: string | null;
}

export interface PatientClinical {
  pregnancies: Pregnancy[];
  fertility_cycles: FertilityCycle[];
  fetal_assessments: FetalAssessment[];
  encounters: Encounter[];
}

export const DOCUMENT_CATEGORIES = [
  'lab_result', 'imaging', 'ultrasound', 'consent', 'referral', 'report', 'prescription', 'id_document', 'other',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export interface DocumentMeta {
  id: string;
  patient_id: string;
  clinic_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  category: DocumentCategory;
  description: string | null;
  is_private: boolean;
  uploaded_by: string;
  uploaded_at: string;
  deleted_at: string | null;
}

export interface AccessGrant {
  id: string;
  patient_id: string;
  grantee_user_id: string | null;
  grantee_clinic_id: string | null;
  access_level: AccessLevel;
  reason: string | null;
  is_emergency: boolean;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  revoked_at: string | null;
}

export type AuditAction =
  | 'INSERT' | 'UPDATE' | 'DELETE' | 'VIEW' | 'DOWNLOAD' | 'PRINT' | 'EXPORT'
  | 'EMERGENCY_ACCESS' | 'RESEARCH_QUERY' | 'SIGN_IN' | 'SIGN_OUT';

export interface AuditEvent {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  action: AuditAction;
  table_name: string | null;
  record_id: string | null;
  patient_id: string | null;
  clinic_id: string | null;
  changed_fields: string[] | null;
  context: Record<string, unknown>;
}

export interface DashboardStats {
  patients: number;
  active_pregnancies: number;
  high_risk_pregnancies: number;
  active_fertility_cycles: number;
  fetal_assessments_30d: number;
  encounters_today: number;
  unsigned_encounters: number;
}

export interface StaffMember {
  membership_id: string;
  user_id: string;
  clinic_id: string;
  role: Role;
  is_active: boolean;
  profile: Pick<Profile, 'full_name_en' | 'full_name_ar' | 'email' | 'title'>;
}

export interface ResearchProject {
  id: string;
  title: string;
  description: string | null;
  specialty: Specialty | null;
  irb_reference: string | null;
  irb_approved_at: string | null;
  irb_expires_at: string | null;
  status: 'draft' | 'active' | 'closed';
  principal_investigator_id: string;
}

export interface PatientQuery {
  search?: string;
  specialty?: Specialty | 'all';
  clinicId?: string | null;
  limit?: number;
}

// --- Obstetrics -----------------------------------------------------------------
export type UrineDip = 'negative' | 'trace' | '1+' | '2+' | '3+' | '4+';
export type Presentation = 'cephalic' | 'breech' | 'transverse' | 'oblique' | 'unstable' | 'not_assessed';
export type FetalMovements = 'normal' | 'reduced' | 'absent' | 'not_assessed';
export type Edema = 'none' | 'mild' | 'moderate' | 'severe';

export interface AntenatalVisit {
  id: string;
  pregnancy_id: string;
  patient_id: string;
  clinic_id: string;
  encounter_id: string;
  visit_date: string;
  ga_days: number | null;
  weight_kg: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  pulse: number | null;
  urine_protein: UrineDip | null;
  urine_glucose: UrineDip | null;
  fundal_height_cm: number | null;
  fetal_heart_rate: number | null;
  presentation: Presentation | null;
  fetal_movements: FetalMovements | null;
  edema: Edema | null;
  hemoglobin_g_dl: number | null;
  notes: string | null;
  fhr_by_fetus: number[] | null;
  presentation_by_fetus: Presentation[] | null;
  next_visit_date: string | null;
  created_by: string | null;
  created_at: string;
}

export type AntenatalVisitInput = Partial<Omit<AntenatalVisit,
  'id' | 'pregnancy_id' | 'patient_id' | 'clinic_id' | 'encounter_id' | 'ga_days' | 'created_by' | 'created_at'>>;

/** Visit joined with its encounter (status, provider, narrative). */
export interface AntenatalVisitRow extends AntenatalVisit {
  encounter: Pick<Encounter, 'id' | 'status' | 'provider_id' | 'is_private' | 'assessment' | 'plan' | 'chief_complaint'> & {
    signed_by: string | null; signed_at: string | null;
  };
}

export interface EncounterNarrative {
  chief_complaint?: string | null;
  assessment?: string | null;
  plan?: string | null;
  is_private?: boolean;
  clinic_id?: string | null;
}

export type DeliveryOnset = 'spontaneous' | 'induced' | 'prelabour_cs';
export type DeliveryMode = 'svd' | 'vacuum' | 'forceps' | 'vaginal_breech' | 'cs_elective' | 'cs_emergency';
export type Anesthesia = 'none' | 'epidural' | 'spinal' | 'combined_spinal_epidural' | 'general' | 'local';
export type Perineum = 'intact' | 'first_degree' | 'second_degree' | 'third_degree' | 'fourth_degree' | 'episiotomy' | 'not_applicable';

export interface Delivery {
  id: string;
  pregnancy_id: string;
  patient_id: string;
  clinic_id: string;
  delivered_at: string;
  ga_days: number | null;
  onset: DeliveryOnset;
  mode: DeliveryMode;
  indication: string | null;
  anesthesia: Anesthesia | null;
  blood_loss_ml: number | null;
  perineum: Perineum | null;
  complications: string[];
  notes: string | null;
  recorded_by: string | null;
}

export type DeliveryInput = Omit<Delivery, 'id' | 'pregnancy_id' | 'patient_id' | 'clinic_id' | 'ga_days' | 'recorded_by'>;

export interface Newborn {
  id: string;
  delivery_id: string;
  birth_order: number;
  sex: 'female' | 'male' | 'undetermined' | null;
  birth_weight_g: number | null;
  apgar_1: number | null;
  apgar_5: number | null;
  outcome: 'live_birth' | 'stillbirth' | 'neonatal_death';
  nicu_admission: boolean;
  notes: string | null;
}

export type NewbornInput = Omit<Newborn, 'id' | 'delivery_id' | 'birth_order'>;

export interface PregnancyDetail {
  pregnancy: Pregnancy;
  visits: AntenatalVisitRow[];
  delivery: Delivery | null;
  newborns: Newborn[];
  fetal_assessments: FetalAssessment[];
  biometry: FetalBiometry[];
  postnatal_visits: PostnatalVisitRow[];
  labour: LabourObservation[];
}

export type UaEdf = 'present' | 'absent' | 'reversed';
export type PlacentaLocation = 'anterior' | 'posterior' | 'fundal' | 'lateral' | 'low_lying' | 'previa';

export interface FetalBiometry {
  id: string;
  fetal_assessment_id: string;
  pregnancy_id: string;
  patient_id: string;
  clinic_id: string;
  fetus_label: string;
  ga_days: number | null;
  crl_mm: number | null;
  bpd_mm: number | null;
  hc_mm: number | null;
  ac_mm: number | null;
  fl_mm: number | null;
  efw_g: number | null;
  afi_cm: number | null;
  dvp_cm: number | null;
  ua_pi: number | null;
  ua_edf: UaEdf | null;
  mca_pi: number | null;
  fhr: number | null;
  presentation: Presentation | null;
  placenta_location: PlacentaLocation | null;
  notes: string | null;
}

export type FetalBiometryInput = Partial<Omit<FetalBiometry,
  'id' | 'fetal_assessment_id' | 'pregnancy_id' | 'patient_id' | 'clinic_id' | 'ga_days'>> & { fetus_label: string };

export interface FetalScanInput {
  performed_at: string;
  assessment_type: string;
  impression: string | null;
  clinic_id?: string | null;
}

export interface PostnatalVisit {
  id: string;
  delivery_id: string;
  pregnancy_id: string;
  patient_id: string;
  clinic_id: string;
  encounter_id: string;
  visit_date: string;
  days_postpartum: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  pulse: number | null;
  temperature_c: number | null;
  uterus: 'well_contracted' | 'subinvolution' | 'tender' | null;
  lochia: 'normal' | 'heavy' | 'offensive' | 'absent' | null;
  wound: 'not_applicable' | 'healing' | 'infection' | 'dehiscence' | null;
  breastfeeding: 'exclusive' | 'mixed' | 'formula' | 'not_feeding' | null;
  breasts: 'normal' | 'engorgement' | 'mastitis' | 'nipple_trauma' | null;
  epds_score: number | null;
  epds_self_harm: boolean | null;
  hemoglobin_g_dl: number | null;
  contraception: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type PostnatalVisitInput = Partial<Omit<PostnatalVisit,
  'id' | 'delivery_id' | 'pregnancy_id' | 'patient_id' | 'clinic_id' | 'encounter_id' | 'days_postpartum' | 'created_by' | 'created_at'>>;

export interface PostnatalVisitRow extends PostnatalVisit {
  encounter: AntenatalVisitRow['encounter'];
}

export type Liquor = 'intact' | 'clear' | 'meconium_light' | 'meconium_thick' | 'blood_stained' | 'absent';

export interface LabourObservation {
  id: string;
  pregnancy_id: string;
  patient_id: string;
  clinic_id: string;
  observed_at: string;
  cervical_dilation_cm: number | null;
  descent_fifths: number | null;
  contractions_per_10min: number | null;
  contraction_duration_s: number | null;
  fhr: number | null;
  liquor: Liquor | null;
  moulding: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  pulse: number | null;
  temperature_c: number | null;
  oxytocin_mu_min: number | null;
  notes: string | null;
  entered_in_error: boolean;
  recorded_by: string | null;
  created_at: string;
}

export type LabourObservationInput = Partial<Omit<LabourObservation,
  'id' | 'pregnancy_id' | 'patient_id' | 'clinic_id' | 'entered_in_error' | 'recorded_by' | 'created_at'>> & { clinic_id?: string | null };

export interface ObstetricWorklistRow {
  pregnancy_id: string;
  patient_id: string;
  clinic_id: string;
  lmp: string | null;
  edd: string | null;
  edd_basis: Pregnancy['edd_basis'];
  cycle_length_days: number;
  risk_level: Pregnancy['risk_level'];
  risk_factors: string[];
  plurality: number;
  gravida: number | null;
  para: number | null;
  conception: string | null;
  mrn: string;
  first_name_en: string | null;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  date_of_birth: string;
  rh_factor: Patient['rh_factor'];
  last_visit_date: string | null;
  last_bp_systolic: number | null;
  last_bp_diastolic: number | null;
  last_urine_protein: UrineDip | null;
  last_fetal_movements: FetalMovements | null;
  visit_count: number;
}

// --- Gynecology ------------------------------------------------------------------
export type MenopauseStatus = 'premenopausal' | 'perimenopausal' | 'postmenopausal' | 'surgical';
export type Contraception = 'none' | 'coc' | 'pop' | 'iud_copper' | 'lng_ius' | 'implant' | 'injectable' | 'condom' | 'sterilization' | 'other';

export interface GynProfile {
  patient_id: string;
  clinic_id: string;
  menarche_age: number | null;
  cycle_length_days: number | null;
  period_duration_days: number | null;
  cycle_regularity: 'regular' | 'irregular' | 'absent' | null;
  menstrual_flow: 'light' | 'normal' | 'heavy' | null;
  dysmenorrhea: 'none' | 'mild' | 'moderate' | 'severe' | null;
  menopause_status: MenopauseStatus | null;
  menopause_age: number | null;
  on_hrt: boolean | null;
  contraception: Contraception | null;
  sexually_active: boolean | null;
  hpv_vaccinated: 'yes' | 'no' | 'unknown' | null;
  hysterectomy: 'none' | 'subtotal' | 'total' | null;
  previous_gyn_surgery: string | null;
  notes: string | null;
  updated_at?: string;
}
export type GynProfileInput = Omit<GynProfile, 'patient_id' | 'updated_at'>;

export interface GynVisit {
  id: string;
  patient_id: string;
  clinic_id: string;
  encounter_id: string;
  visit_date: string;
  complaints: string[];
  palm_coein: string[];
  lmp: string | null;
  pain_score: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  weight_kg: number | null;
  height_cm: number | null;
  clinical_hyperandrogenism: boolean | null;
  biochemical_hyperandrogenism: boolean | null;
  abdominal_exam: string | null;
  speculum_exam: string | null;
  bimanual_exam: string | null;
  uterus_size: 'normal' | 'bulky' | 'enlarged_lt12w' | 'enlarged_ge12w' | 'not_assessed' | null;
  adnexal_tenderness: boolean | null;
  cervical_motion_tenderness: boolean | null;
  pop_stage: number | null;
  diagnosis: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}
export type GynVisitInput = Partial<Omit<GynVisit, 'id' | 'patient_id' | 'clinic_id' | 'encounter_id' | 'created_by' | 'created_at'>>;
export interface GynVisitRow extends GynVisit { encounter: AntenatalVisitRow['encounter'] }

export interface Fibroid { figo_type: string; size_mm: number | null; location: string | null }

export interface GynUltrasound {
  id: string;
  patient_id: string;
  clinic_id: string;
  performed_at: string;
  route: 'transabdominal' | 'transvaginal' | 'transrectal' | null;
  uterus_length_mm: number | null;
  uterus_ap_mm: number | null;
  uterus_width_mm: number | null;
  uterus_position: 'anteverted' | 'retroverted' | 'axial' | 'absent' | null;
  endometrial_thickness_mm: number | null;
  endometrium_appearance: 'normal' | 'thickened' | 'heterogeneous' | 'polyp' | 'fluid' | 'not_seen' | null;
  fibroids: Fibroid[];
  right_ovary_volume_ml: number | null;
  left_ovary_volume_ml: number | null;
  right_follicle_count: number | null;
  left_follicle_count: number | null;
  adnexal_mass: boolean;
  mass_side: 'right' | 'left' | 'bilateral' | null;
  mass_max_diameter_mm: number | null;
  iota_b_features: string[];
  iota_m_features: string[];
  free_fluid: 'none' | 'small' | 'moderate' | 'large' | null;
  impression: string | null;
  performed_by: string | null;
}
export type GynUltrasoundInput = Omit<GynUltrasound, 'id' | 'patient_id' | 'clinic_id' | 'performed_by'> & { clinic_id?: string | null };

export interface CervicalScreening {
  id: string;
  patient_id: string;
  clinic_id: string;
  sample_date: string;
  test_type: 'cytology' | 'hpv_primary' | 'cotest';
  hpv_result: 'negative' | 'hpv16' | 'hpv18' | 'hpv16_18' | 'other_hr' | 'positive_untyped' | null;
  cytology_result: 'nilm' | 'asc_us' | 'lsil' | 'asc_h' | 'hsil' | 'agc' | 'scc' | 'adenocarcinoma' | 'unsatisfactory' | null;
  status: 'pending' | 'resulted';
  recommendation: string | null;
  next_due_date: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}
export type CervicalScreeningInput = Omit<CervicalScreening, 'id' | 'patient_id' | 'clinic_id' | 'recorded_by' | 'created_at'> & { clinic_id?: string | null };

export interface Colposcopy {
  id: string;
  patient_id: string;
  clinic_id: string;
  screening_id: string | null;
  performed_at: string;
  tz_type: 1 | 2 | 3 | null;
  findings: 'normal' | 'minor_grade1' | 'major_grade2' | 'suspicious_invasion' | 'non_specific' | null;
  biopsy_taken: boolean;
  histology: 'pending' | 'normal' | 'cin1' | 'cin2' | 'cin3' | 'ais' | 'invasive' | null;
  treatment: 'none' | 'lletz' | 'cone' | 'ablation' | 'follow_up' | null;
  notes: string | null;
  performed_by: string | null;
}
export type ColposcopyInput = Omit<Colposcopy, 'id' | 'patient_id' | 'clinic_id' | 'performed_by'> & { clinic_id?: string | null };

export interface GynProcedure {
  id: string;
  patient_id: string;
  clinic_id: string;
  performed_at: string;
  procedure_code: string;
  approach: 'office' | 'hysteroscopic' | 'laparoscopic' | 'robotic' | 'open' | 'vaginal' | null;
  indication: string | null;
  findings: string | null;
  surgeon_id: string | null;
  assistant: string | null;
  anesthesia: 'none' | 'local' | 'sedation' | 'regional' | 'general' | null;
  blood_loss_ml: number | null;
  complications: string | null;
  clavien_dindo: 'none' | 'I' | 'II' | 'IIIa' | 'IIIb' | 'IVa' | 'IVb' | 'V' | null;
  histology_status: 'not_sent' | 'pending' | 'received';
  histology_result: string | null;
  notes: string | null;
  recorded_by: string | null;
}
export type GynProcedureInput = Omit<GynProcedure, 'id' | 'patient_id' | 'clinic_id' | 'recorded_by'> & { clinic_id?: string | null };

export interface GynDetail {
  profile: GynProfile | null;
  visits: GynVisitRow[];
  ultrasounds: GynUltrasound[];
  screenings: CervicalScreening[];
  colposcopies: Colposcopy[];
  procedures: GynProcedure[];
}

export interface GynWorklistRow {
  patient_id: string;
  clinic_id: string;
  mrn: string;
  first_name_en: string | null;
  last_name_en: string | null;
  first_name_ar: string | null;
  last_name_ar: string | null;
  date_of_birth: string;
  menopause_status: MenopauseStatus | null;
  hysterectomy: GynProfile['hysterectomy'];
  last_screening_date: string | null;
  last_screening_test: CervicalScreening['test_type'] | null;
  last_hpv_result: CervicalScreening['hpv_result'];
  last_cytology_result: CervicalScreening['cytology_result'];
  last_screening_status: CervicalScreening['status'] | null;
  screening_next_due: string | null;
  screening_recommendation: string | null;
  last_colposcopy_date: string | null;
  pending_histology: number;
  last_visit_date: string | null;
  last_complaints: string[] | null;
}

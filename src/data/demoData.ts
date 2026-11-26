/* Fictional sample data for DEMO MODE only. No real persons or organizations. */
import type {
  Embryo, EmbryoTransfer, FertilityProfile, SemenAnalysis, StimulationMonitoring,
  LabResult, MenopauseAssessment, UrogynAssessment,
  CervicalScreening, Colposcopy, GynProcedure, GynProfile, GynUltrasound, GynVisit,
  AntenatalVisit, Delivery, Newborn, FetalBiometry, PostnatalVisit, LabourObservation,
  AccessGrant, AuditEvent, Clinic, DocumentMeta, Encounter, FertilityCycle, FetalAssessment,
  Patient, Pregnancy, Profile, ResearchProject,
  FmAnomalyScan, FmCfdna, FmDoppler, FmFirstTrimester, FmProcedure,
} from './types';
import type { Role } from '@/rbac/permissions';

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const dateAgo = (n: number) => daysAgo(n).slice(0, 10);

export const DEMO_CLINICS: Clinic[] = [
  { id: 'c-main', code: 'MAIN', name_en: "Main Women's Health Center", name_ar: 'مركز صحة المرأة الرئيسي', is_active: true },
  { id: 'c-ivf', code: 'IVF', name_en: 'Reproductive & Fetal Medicine Unit', name_ar: 'وحدة الطب التناسلي وطب الأجنة', is_active: true },
];

export interface DemoUser extends Profile {
  memberships: Array<{ id: string; clinic_id: string; role: Role; is_active: boolean }>;
}

const profile = (p: Partial<Profile> & Pick<Profile, 'id' | 'full_name_en' | 'full_name_ar'>): Profile => ({
  email: `${p.id}@demo.local`, title: null, preferred_language: 'en', is_super_admin: false, is_active: true, ...p,
});

export const DEMO_USERS: DemoUser[] = [
  { ...profile({ id: 'u-sa', full_name_en: 'Rania Haddad', full_name_ar: 'رانيا حداد', title: 'Dr.', is_super_admin: true }),
    memberships: [] },
  { ...profile({ id: 'u-admin', full_name_en: 'Omar Khalil', full_name_ar: 'عمر خليل' }),
    memberships: [{ id: 'm1', clinic_id: 'c-main', role: 'clinic_admin', is_active: true }] },
  { ...profile({ id: 'u-cons', full_name_en: 'Huda Mansour', full_name_ar: 'هدى منصور', title: 'Prof.' }),
    memberships: [
      { id: 'm2', clinic_id: 'c-main', role: 'consultant', is_active: true },
      { id: 'm3', clinic_id: 'c-ivf', role: 'specialist', is_active: true },
    ] },
  { ...profile({ id: 'u-spec', full_name_en: 'Yasmin Farouk', full_name_ar: 'ياسمين فاروق', title: 'Dr.' }),
    memberships: [{ id: 'm4', clinic_id: 'c-ivf', role: 'specialist', is_active: true }] },
  { ...profile({ id: 'u-res', full_name_en: 'Karim Nasser', full_name_ar: 'كريم ناصر', title: 'Dr.' }),
    memberships: [{ id: 'm5', clinic_id: 'c-main', role: 'resident', is_active: true }] },
  { ...profile({ id: 'u-nurse', full_name_en: 'Salma Youssef', full_name_ar: 'سلمى يوسف' }),
    memberships: [{ id: 'm6', clinic_id: 'c-main', role: 'nurse', is_active: true }] },
  { ...profile({ id: 'u-researcher', full_name_en: 'Tarek Aziz', full_name_ar: 'طارق عزيز', title: 'Dr.' }),
    memberships: [{ id: 'm7', clinic_id: 'c-main', role: 'researcher', is_active: true }] },
  { ...profile({ id: 'u-ro', full_name_en: 'Mariam Said', full_name_ar: 'مريم سعيد' }),
    memberships: [{ id: 'm8', clinic_id: 'c-main', role: 'read_only', is_active: true }] },
];

/** Which demo user to show for each role on the login screen. */
export const DEMO_LOGIN_ORDER = ['u-sa', 'u-admin', 'u-cons', 'u-spec', 'u-res', 'u-nurse', 'u-researcher', 'u-ro'];

const base = {
  national_id: null, email: null, address: null, nationality: null, emergency_contact_name: null,
  emergency_contact_phone: null, notes: null, created_by: 'u-nurse', deleted_at: null,
  research_consent: false, research_consent_at: null, primary_physician_id: null,
  visibility: 'clinic' as const, marital_status: 'married' as const,
};

type P = Partial<Patient> & Pick<Patient, 'id' | 'clinic_id' | 'mrn' | 'date_of_birth'>;
const patient = (p: P, ageDays: number): Patient => ({
  first_name_en: null, last_name_en: null, first_name_ar: null, last_name_ar: null, phone: null,
  blood_group: null, rh_factor: null, specialties: [], ...base,
  created_at: daysAgo(ageDays), updated_at: daysAgo(Math.max(0, ageDays - 3)), ...p,
});

export const DEMO_PATIENTS: Patient[] = [
  patient({ id: 'p1', clinic_id: 'c-main', mrn: 'MAIN-000101', first_name_en: 'Layla', last_name_en: 'Hassan',
    first_name_ar: 'ليلى', last_name_ar: 'حسن', date_of_birth: '1992-03-14', phone: '+20 100 000 0101',
    blood_group: 'O', rh_factor: 'negative', specialties: ['obstetrics', 'fetal_medicine'],
    research_consent: true, research_consent_at: daysAgo(40) }, 60),
  patient({ id: 'p2', clinic_id: 'c-main', mrn: 'MAIN-000102', first_name_en: 'Nadia', last_name_en: 'Ibrahim',
    first_name_ar: 'نادية', last_name_ar: 'إبراهيم', date_of_birth: '1987-08-21', phone: '+20 100 000 0102',
    blood_group: 'A', rh_factor: 'positive', specialties: ['obstetrics'] }, 30),
  patient({ id: 'p3', clinic_id: 'c-main', mrn: 'MAIN-000103', first_name_en: 'Reem', last_name_en: 'Mostafa',
    first_name_ar: 'ريم', last_name_ar: 'مصطفى', date_of_birth: '1979-01-05', phone: '+20 100 000 0103',
    blood_group: 'B', rh_factor: 'positive', specialties: ['gynecology'], marital_status: 'divorced' }, 90),
  patient({ id: 'p4', clinic_id: 'c-main', mrn: 'MAIN-000104', first_name_ar: 'آمنة', last_name_ar: 'عبد الله',
    date_of_birth: '1998-11-30', phone: '+20 100 000 0104', blood_group: 'AB', rh_factor: 'positive',
    specialties: ['obstetrics'] }, 12),
  patient({ id: 'p5', clinic_id: 'c-main', mrn: 'MAIN-000105', first_name_en: 'Dina', last_name_en: 'Fathy',
    first_name_ar: 'دينا', last_name_ar: 'فتحي', date_of_birth: '1990-06-17', blood_group: 'O', rh_factor: 'positive',
    specialties: ['infertility', 'gynecology'], visibility: 'private', primary_physician_id: 'u-cons',
    notes: 'Private practice patient of Prof. Mansour.' }, 45),
  patient({ id: 'p6', clinic_id: 'c-ivf', mrn: 'IVF-000201', first_name_en: 'Hana', last_name_en: 'Saber',
    first_name_ar: 'هناء', last_name_ar: 'صابر', date_of_birth: '1989-04-09', blood_group: 'A', rh_factor: 'negative',
    specialties: ['infertility'], research_consent: true, research_consent_at: daysAgo(20) }, 70),
  patient({ id: 'p7', clinic_id: 'c-ivf', mrn: 'IVF-000202', first_name_en: 'Mai', last_name_en: 'Gamal',
    first_name_ar: 'مي', last_name_ar: 'جمال', date_of_birth: '1993-09-12', blood_group: 'B', rh_factor: 'positive',
    specialties: ['infertility', 'obstetrics'] }, 25),
  patient({ id: 'p8', clinic_id: 'c-ivf', mrn: 'IVF-000203', first_name_en: 'Fatma', last_name_en: 'Zaki',
    first_name_ar: 'فاطمة', last_name_ar: 'زكي', date_of_birth: '1991-02-27', blood_group: 'O', rh_factor: 'positive',
    specialties: ['fetal_medicine', 'obstetrics'] }, 8),
  patient({ id: 'p9', clinic_id: 'c-main', mrn: 'MAIN-000106', first_name_en: 'Yara', last_name_en: 'Adel',
    first_name_ar: 'يارا', last_name_ar: 'عادل', date_of_birth: '2001-12-03', blood_group: 'A', rh_factor: 'positive',
    specialties: ['gynecology'], marital_status: 'single' }, 5),
  patient({ id: 'p10', clinic_id: 'c-main', mrn: 'MAIN-000107', first_name_en: 'Salma', last_name_en: 'Kamal',
    first_name_ar: 'سلمى', last_name_ar: 'كمال', date_of_birth: '1994-02-11', blood_group: 'B', rh_factor: 'positive',
    specialties: ['obstetrics'] }, 280),
  patient({ id: 'p12', clinic_id: 'c-main', mrn: 'MAIN-000109', first_name_en: 'Samira', last_name_en: 'Hassan',
    first_name_ar: 'سميرة', last_name_ar: 'حسن', date_of_birth: '1968-05-04', blood_group: 'A', rh_factor: 'positive',
    specialties: ['gynecology'], marital_status: 'widowed' }, 20),
  patient({ id: 'p11', clinic_id: 'c-main', mrn: 'MAIN-000108', first_name_en: 'Rana', last_name_en: 'Youssef',
    first_name_ar: 'رنا', last_name_ar: 'يوسف', date_of_birth: '1997-07-23', blood_group: 'O', rh_factor: 'positive',
    specialties: ['obstetrics'] }, 210),
  patient({ id: 'p13', clinic_id: 'c-ivf', mrn: 'IVF-000204', first_name_en: 'Noor', last_name_en: 'Tarek',
    first_name_ar: 'نور', last_name_ar: 'طارق', date_of_birth: '1995-08-19', blood_group: 'A', rh_factor: 'positive',
    specialties: ['obstetrics', 'fetal_medicine'] }, 45),
];

const pregDefaults = {
  cycle_length_days: 28, us_dating_date: null, us_dating_ga_days: null, transfer_date: null, embryo_age_days: null,
  booking_date: null, booking_weight_kg: null, height_cm: null, outcome_date: null, notes: null, chorionicity: null,
  previous_cs_count: null, high_risk_plan: null, current_medications: null,
} as const;

export const DEMO_PREGNANCIES: Pregnancy[] = [
  { ...pregDefaults, id: 'g1', patient_id: 'p1', clinic_id: 'c-main', lmp: dateAgo(168), edd: null, edd_basis: 'lmp', gravida: 2, para: 1,
    abortus: 0, living: 1, conception: 'spontaneous', plurality: 1, risk_level: 'high',
    risk_factors: ['previous_cs', 'rh_alloimmunization'], status: 'active', booking_date: dateAgo(112),
    booking_weight_kg: 68, height_cm: 162, previous_cs_count: 1,
    high_risk_plan: 'Monthly indirect Coombs titres; MCA PSV Doppler if titre rises. Plan repeat CS at 39 weeks.',
    current_medications: 'Folic acid 5 mg, ferrous sulphate 200 mg' },
  { ...pregDefaults, id: 'g2', patient_id: 'p2', clinic_id: 'c-main', lmp: dateAgo(84), edd: null, edd_basis: 'lmp', gravida: 1, para: 0,
    abortus: 0, living: 0, conception: 'spontaneous', plurality: 1, risk_level: 'moderate', risk_factors: ['family_history_preeclampsia'],
    status: 'active', booking_date: dateAgo(28), booking_weight_kg: 74, height_cm: 160 },
  { ...pregDefaults, id: 'g3', patient_id: 'p4', clinic_id: 'c-main', lmp: dateAgo(245), edd: null, edd_basis: 'lmp', gravida: 3, para: 2,
    abortus: 0, living: 2, conception: 'spontaneous', plurality: 1, risk_level: 'moderate',
    risk_factors: ['previous_gdm', 'family_history_diabetes'], status: 'active', booking_date: dateAgo(189),
    booking_weight_kg: 82, height_cm: 158 },
  { ...pregDefaults, id: 'g4', patient_id: 'p7', clinic_id: 'c-ivf', lmp: null, edd: dateAgo(-80), edd_basis: 'ivf_transfer', gravida: 1,
    para: 0, abortus: 0, living: 0, conception: 'icsi', plurality: 2, risk_level: 'high', risk_factors: [],
    status: 'active', transfer_date: dateAgo(181), embryo_age_days: 5, booking_date: dateAgo(130), booking_weight_kg: 61, height_cm: 165,
    chorionicity: 'dcda', notes: 'DCDA twins',
    high_risk_plan: 'Growth scans every 2 weeks (twin B lagging); fetal medicine review; antenatal steroids if delivery < 34 w.',
    current_medications: 'Aspirin 150 mg nocte, iron, calcium' },
  { ...pregDefaults, id: 'g5', patient_id: 'p8', clinic_id: 'c-ivf', lmp: dateAgo(150), edd: null, edd_basis: 'lmp', gravida: 2, para: 1,
    abortus: 0, living: 1, conception: 'spontaneous', plurality: 1, risk_level: 'high',
    risk_factors: ['smoking', 'previous_fgr'], status: 'active', booking_date: dateAgo(90), booking_weight_kg: 55, height_cm: 163,
    previous_cs_count: 0, current_medications: 'Aspirin 150 mg nocte' },
  { ...pregDefaults, id: 'g6', patient_id: 'p3', clinic_id: 'c-main', lmp: dateAgo(1100), edd: null, edd_basis: 'lmp', gravida: 1, para: 0,
    abortus: 0, living: 0, conception: 'spontaneous', plurality: 1, risk_level: 'low', risk_factors: [], status: 'delivered',
    outcome_date: dateAgo(824) },
  { ...pregDefaults, id: 'g7', patient_id: 'p10', clinic_id: 'c-main', lmp: dateAgo(286), edd: null, edd_basis: 'lmp', gravida: 2, para: 1,
    abortus: 0, living: 2, conception: 'spontaneous', plurality: 1, risk_level: 'low', risk_factors: ['previous_cs'], status: 'delivered',
    outcome_date: dateAgo(9) },
  { ...pregDefaults, id: 'g9', patient_id: 'p13', clinic_id: 'c-ivf', lmp: dateAgo(128), edd: null, edd_basis: 'lmp', gravida: 1, para: 0,
    abortus: 0, living: 0, conception: 'spontaneous', plurality: 2, risk_level: 'high', risk_factors: [], status: 'active',
    booking_date: dateAgo(45), booking_weight_kg: 58, height_cm: 161, chorionicity: 'mcda', notes: 'Monochorionic diamniotic twins' },
  { ...pregDefaults, id: 'g8', patient_id: 'p11', clinic_id: 'c-main', lmp: dateAgo(275), edd: null, edd_basis: 'lmp', gravida: 1, para: 0,
    abortus: 0, living: 0, conception: 'spontaneous', plurality: 1, risk_level: 'low', risk_factors: [], status: 'active',
    booking_date: dateAgo(210), booking_weight_kg: 64, height_cm: 166 },
];

export const DEMO_CYCLES: FertilityCycle[] = [
  { id: 'fc1', patient_id: 'p6', clinic_id: 'c-ivf', cycle_type: 'icsi', protocol: 'Antagonist', start_date: dateAgo(9),
    status: 'stimulation', outcome: null, cycle_number: 2, day1_date: dateAgo(10), indication: 'Male factor (OAT), 3 years primary infertility',
    stim_protocol: 'antagonist', starting_dose_iu: 225, gonadotropin: 'rFSH', insemination: 'icsi', sperm_source: 'partner_fresh', freeze_all: false },
  { id: 'fc2', patient_id: 'p5', clinic_id: 'c-main', cycle_type: 'iui', protocol: 'Letrozole + hCG trigger', start_date: dateAgo(14),
    status: 'luteal', outcome: null, cycle_number: 1, day1_date: dateAgo(16), stim_protocol: 'letrozole', insemination: 'iui',
    sperm_source: 'partner_fresh', trigger_type: 'hcg', trigger_at: daysAgo(3), freeze_all: false },
  { id: 'fc3', patient_id: 'p7', clinic_id: 'c-ivf', cycle_type: 'icsi', protocol: 'Long agonist', start_date: dateAgo(200),
    status: 'completed', outcome: 'clinical_pregnancy', cycle_number: 1, day1_date: dateAgo(222), indication: 'Tubal factor (bilateral hydrosalpinx, post salpingectomy)',
    stim_protocol: 'long_agonist', starting_dose_iu: 150, gonadotropin: 'hMG', trigger_type: 'hcg', trigger_at: daysAgo(188), insemination: 'icsi',
    sperm_source: 'partner_fresh', retrieval_at: dateAgo(186), oocytes_retrieved: 14, mii_oocytes: 11, fertilized_2pn: 9, freeze_all: false },
  { id: 'fc0', patient_id: 'p6', clinic_id: 'c-ivf', cycle_type: 'icsi', protocol: 'Antagonist', start_date: dateAgo(260),
    status: 'completed', outcome: 'negative_bhcg', cycle_number: 1, stim_protocol: 'antagonist', starting_dose_iu: 225, insemination: 'icsi',
    sperm_source: 'partner_fresh', retrieval_at: dateAgo(248), oocytes_retrieved: 9, mii_oocytes: 7, fertilized_2pn: 5, freeze_all: false },
];

export const DEMO_FETAL: FetalAssessment[] = [];

export const DEMO_ENCOUNTERS: Encounter[] = [
  { id: 'e1', patient_id: 'p1', clinic_id: 'c-main', specialty: 'obstetrics', encounter_type: 'antenatal_visit',
    encounter_at: daysAgo(0), provider_id: 'u-res', is_private: false, status: 'draft',
    chief_complaint: 'Routine ANC visit', assessment: 'Rh-negative, antibody screen pending', plan: 'Anti-D at 28 weeks' },
  { id: 'e2', patient_id: 'p3', clinic_id: 'c-main', specialty: 'gynecology', encounter_type: 'consultation',
    encounter_at: daysAgo(3), provider_id: 'u-cons', is_private: false, status: 'signed',
    chief_complaint: 'Abnormal uterine bleeding', assessment: 'Suspected fibroid uterus', plan: 'Pelvic US, CBC' },
  { id: 'e3', patient_id: 'p6', clinic_id: 'c-ivf', specialty: 'infertility', encounter_type: 'ultrasound',
    encounter_at: daysAgo(0), provider_id: 'u-spec', is_private: false, status: 'draft',
    chief_complaint: 'Follicular monitoring day 9', assessment: '8 follicles 12-16 mm', plan: 'Continue gonadotropins' },
];

export const DEMO_DOCUMENTS: DocumentMeta[] = [
  { id: 'd1', patient_id: 'p1', clinic_id: 'c-main', storage_path: 'c-main/p1/d1-anomaly-scan.pdf', file_name: 'anomaly-scan.pdf',
    mime_type: 'application/pdf', size_bytes: 482_133, category: 'ultrasound', description: '20-week anomaly scan report',
    is_private: false, uploaded_by: 'u-cons', uploaded_at: daysAgo(4), deleted_at: null },
  { id: 'd2', patient_id: 'p1', clinic_id: 'c-main', storage_path: 'c-main/p1/d2-cbc.pdf', file_name: 'cbc-results.pdf',
    mime_type: 'application/pdf', size_bytes: 91_220, category: 'lab_result', description: null, is_private: false,
    uploaded_by: 'u-nurse', uploaded_at: daysAgo(10), deleted_at: null },
];

export const DEMO_GRANTS: AccessGrant[] = [
  { id: 'gr1', patient_id: 'p1', grantee_user_id: null, grantee_clinic_id: 'c-ivf', access_level: 'read',
    reason: 'Fetal medicine co-management', is_emergency: false, granted_by: 'u-cons', granted_at: daysAgo(20),
    expires_at: null, revoked_at: null },
];

export const DEMO_RESEARCH: ResearchProject[] = [
  { id: 'r1', title: 'Predictors of preterm birth in high-risk pregnancies', description: 'Retrospective cohort',
    specialty: 'obstetrics', irb_reference: 'IRB-2026-014', irb_approved_at: dateAgo(60), irb_expires_at: dateAgo(-300),
    status: 'active', principal_investigator_id: 'u-cons' },
  { id: 'r2', title: 'ICSI outcomes by stimulation protocol', description: null, specialty: 'infertility',
    irb_reference: null, irb_approved_at: null, irb_expires_at: null, status: 'draft', principal_investigator_id: 'u-cons' },
];

export const DEMO_RESEARCH_MEMBERS: Array<{ project_id: string; user_id: string }> = [
  { project_id: 'r1', user_id: 'u-cons' },
  { project_id: 'r1', user_id: 'u-researcher' },
];

export function seedAudit(): AuditEvent[] {
  const ev = (id: number, d: number, actor: string, action: AuditEvent['action'], table: string, patient: string | null, clinic: string, fields: string[] | null = null): AuditEvent => ({
    id, occurred_at: daysAgo(d), actor_id: actor, action, table_name: table, record_id: null, patient_id: patient,
    clinic_id: clinic, changed_fields: fields, context: {},
  });
  return [
    ev(1, 0.01, 'u-res', 'INSERT', 'encounters', 'p1', 'c-main'),
    ev(2, 0.02, 'u-spec', 'INSERT', 'encounters', 'p6', 'c-ivf'),
    ev(3, 0.1, 'u-cons', 'VIEW', 'patients', 'p8', 'c-ivf'),
    ev(4, 0.5, 'u-nurse', 'UPDATE', 'patients', 'p4', 'c-main', ['phone']),
    ev(5, 2, 'u-spec', 'INSERT', 'fetal_assessments', 'p8', 'c-ivf'),
    ev(6, 3, 'u-cons', 'UPDATE', 'encounters', 'p3', 'c-main', ['signed_at', 'signed_by', 'status']),
    ev(7, 4, 'u-cons', 'INSERT', 'documents', 'p1', 'c-main'),
    ev(8, 5, 'u-nurse', 'INSERT', 'patients', 'p9', 'c-main'),
  ];
}

// --- Antenatal visits (generated series per pregnancy) ---------------------------
type VisitSeed = Partial<AntenatalVisit> & { ga: number };
const lmpOffset: Record<string, number> = { g8: 275,  g1: 168, g2: 84, g3: 245, g4: 200, g5: 150 };
const pregPatient: Record<string, [string, string]> = {
  g8: ['p11', 'c-main'],
  g1: ['p1', 'c-main'], g2: ['p2', 'c-main'], g3: ['p4', 'c-main'], g4: ['p7', 'c-ivf'], g5: ['p8', 'c-ivf'],
};
const visitProvider: Record<string, string> = { g8: 'u-res',  g1: 'u-cons', g2: 'u-res', g3: 'u-cons', g4: 'u-spec', g5: 'u-spec' };

const seeds: Record<string, VisitSeed[]> = {
  g8: [
    { ga: 70, weight_kg: 64, bp_systolic: 112, bp_diastolic: 70, urine_protein: 'negative', hemoglobin_g_dl: 12.1 },
    { ga: 196, weight_kg: 72.5, bp_systolic: 116, bp_diastolic: 74, urine_protein: 'negative', fundal_height_cm: 28, fetal_heart_rate: 142, fetal_movements: 'normal' },
    { ga: 266, weight_kg: 76, bp_systolic: 120, bp_diastolic: 78, urine_protein: 'negative', fundal_height_cm: 37, fetal_heart_rate: 138, fetal_movements: 'normal', presentation: 'cephalic' },
  ],
  g1: [
    { ga: 56, weight_kg: 68, bp_systolic: 112, bp_diastolic: 70, urine_protein: 'negative', hemoglobin_g_dl: 11.8 },
    { ga: 84, weight_kg: 69.2, bp_systolic: 114, bp_diastolic: 72, urine_protein: 'negative', fetal_heart_rate: 156 },
    { ga: 112, weight_kg: 71, bp_systolic: 116, bp_diastolic: 70, urine_protein: 'negative', fetal_heart_rate: 150 },
    { ga: 140, weight_kg: 73.1, bp_systolic: 118, bp_diastolic: 74, urine_protein: 'negative', fundal_height_cm: 20, fetal_heart_rate: 146, fetal_movements: 'normal' },
    { ga: 168, weight_kg: 74.6, bp_systolic: 122, bp_diastolic: 76, urine_protein: 'trace', fundal_height_cm: 24, fetal_heart_rate: 144, fetal_movements: 'normal', hemoglobin_g_dl: 10.9 },
  ],
  g2: [
    { ga: 56, weight_kg: 74, bp_systolic: 118, bp_diastolic: 76, urine_protein: 'negative', hemoglobin_g_dl: 12.4 },
    { ga: 84, weight_kg: 74.8, bp_systolic: 120, bp_diastolic: 78, urine_protein: 'negative', fetal_heart_rate: 160 },
  ],
  g3: [
    { ga: 56, weight_kg: 82, bp_systolic: 116, bp_diastolic: 72, urine_protein: 'negative', urine_glucose: 'negative', hemoglobin_g_dl: 11.6 },
    { ga: 112, weight_kg: 84.5, bp_systolic: 118, bp_diastolic: 74, urine_protein: 'negative', urine_glucose: 'negative' },
    { ga: 168, weight_kg: 87.9, bp_systolic: 124, bp_diastolic: 78, urine_protein: 'negative', urine_glucose: '1+', fundal_height_cm: 25, fetal_heart_rate: 142, fetal_movements: 'normal' },
    { ga: 196, weight_kg: 90.2, bp_systolic: 128, bp_diastolic: 82, urine_protein: 'negative', urine_glucose: '2+', fundal_height_cm: 30, fetal_heart_rate: 140, fetal_movements: 'normal', hemoglobin_g_dl: 10.7 },
    { ga: 224, weight_kg: 92.4, bp_systolic: 136, bp_diastolic: 86, urine_protein: 'trace', fundal_height_cm: 34, fetal_heart_rate: 138, fetal_movements: 'normal', presentation: 'cephalic', edema: 'mild' },
    { ga: 245, weight_kg: 93.8, bp_systolic: 144, bp_diastolic: 93, urine_protein: '1+', fundal_height_cm: 37, fetal_heart_rate: 136, fetal_movements: 'normal', presentation: 'cephalic', edema: 'moderate' },
  ],
  g4: [
    { ga: 70, weight_kg: 61, bp_systolic: 110, bp_diastolic: 68, urine_protein: 'negative', hemoglobin_g_dl: 11.2 },
    { ga: 98, weight_kg: 62.8, bp_systolic: 112, bp_diastolic: 70, urine_protein: 'negative', fhr_by_fetus: [158, 154] },
    { ga: 140, weight_kg: 66.1, bp_systolic: 114, bp_diastolic: 72, urine_protein: 'negative', fhr_by_fetus: [150, 147] },
    { ga: 182, weight_kg: 70.4, bp_systolic: 118, bp_diastolic: 74, urine_protein: 'negative', fhr_by_fetus: [146, 141], fetal_movements: 'normal', hemoglobin_g_dl: 10.3 },
    { ga: 200, weight_kg: 72, bp_systolic: 120, bp_diastolic: 76, urine_protein: 'negative', fhr_by_fetus: [144, 139], presentation_by_fetus: ['cephalic', 'breech'], fetal_movements: 'normal' },
  ],
  g5: [
    { ga: 63, weight_kg: 55, bp_systolic: 108, bp_diastolic: 66, urine_protein: 'negative', hemoglobin_g_dl: 11.4 },
    { ga: 98, weight_kg: 56.1, bp_systolic: 110, bp_diastolic: 68, urine_protein: 'negative', fetal_heart_rate: 152 },
    { ga: 126, weight_kg: 57, bp_systolic: 112, bp_diastolic: 70, urine_protein: 'negative', fetal_heart_rate: 148, fundal_height_cm: 16 },
    { ga: 148, weight_kg: 57.4, bp_systolic: 114, bp_diastolic: 72, urine_protein: 'negative', fetal_heart_rate: 146, fetal_movements: 'reduced', hemoglobin_g_dl: 10.2 },
  ],
};

export const DEMO_VISITS: AntenatalVisit[] = [];
export const DEMO_VISIT_ENCOUNTERS: Encounter[] = [];
for (const [pid, list] of Object.entries(seeds)) {
  list.forEach((sd, i) => {
    const { ga, ...vitals } = sd;
    const ago = lmpOffset[pid] - ga;
    const [patient, clinic] = pregPatient[pid];
    const last = i === list.length - 1;
    const encId = `ve-${pid}-${i}`;
    DEMO_VISIT_ENCOUNTERS.push({
      id: encId, patient_id: patient, clinic_id: clinic, specialty: 'obstetrics', encounter_type: 'antenatal_visit',
      encounter_at: daysAgo(ago), provider_id: visitProvider[pid], is_private: false, status: last ? 'draft' : 'signed',
      chief_complaint: 'Routine antenatal visit', assessment: null, plan: null,
    });
    DEMO_VISITS.push({
      id: `v-${pid}-${i}`, pregnancy_id: pid, patient_id: patient, clinic_id: clinic, encounter_id: encId,
      visit_date: dateAgo(ago), ga_days: ga, weight_kg: null, bp_systolic: null, bp_diastolic: null, pulse: null,
      urine_protein: null, urine_glucose: null, fundal_height_cm: null, fetal_heart_rate: null, presentation: null,
      fetal_movements: null, edema: null, hemoglobin_g_dl: null, notes: null, fhr_by_fetus: null, presentation_by_fetus: null,
      next_visit_date: last ? dateAgo(ago - 14) : null, created_by: visitProvider[pid],
      created_at: daysAgo(ago), ...vitals,
    });
  });
}

export const DEMO_DELIVERIES: Delivery[] = [
  { id: 'dl1', pregnancy_id: 'g6', patient_id: 'p3', clinic_id: 'c-main', delivered_at: daysAgo(824), ga_days: 276,
    onset: 'spontaneous', mode: 'svd', indication: null, anesthesia: 'epidural', blood_loss_ml: 300,
    perineum: 'second_degree', complications: [], notes: null, recorded_by: 'u-cons' },
];

export const DEMO_DELIVERIES_EXTRA: Delivery[] = [
  { id: 'dl2', pregnancy_id: 'g7', patient_id: 'p10', clinic_id: 'c-main', delivered_at: daysAgo(9), ga_days: 277,
    onset: 'prelabour_cs', mode: 'cs_elective', indication: 'Two previous caesareans', anesthesia: 'spinal', blood_loss_ml: 650,
    perineum: 'not_applicable', complications: [], notes: null, recorded_by: 'u-cons' },
];

export const DEMO_NEWBORNS: Newborn[] = [
  { id: 'nb2', delivery_id: 'dl2', birth_order: 1, sex: 'female', birth_weight_g: 3180, apgar_1: 9, apgar_5: 10,
    outcome: 'live_birth', nicu_admission: false, notes: null },
  { id: 'nb1', delivery_id: 'dl1', birth_order: 1, sex: 'male', birth_weight_g: 3350, apgar_1: 8, apgar_5: 9,
    outcome: 'live_birth', nicu_admission: false, notes: null },
];

// --- Fetal scans with biometry ---------------------------------------------------
type ScanSeed = { id: string; preg: string; patient: string; clinic: string; ago: number; ga: number; type: string; impression: string;
  fetuses: Array<Partial<FetalBiometry> & { fetus_label: string }> };
const scanSeeds: ScanSeed[] = [
  { id: 'fa1', preg: 'g1', patient: 'p1', clinic: 'c-main', ago: 8, ga: 160, type: 'anomaly_scan', impression: 'Normal fetal anatomy survey.',
    fetuses: [{ fetus_label: 'A', bpd_mm: 48, hc_mm: 212, ac_mm: 185, fl_mm: 40, dvp_cm: 5.1, fhr: 148, presentation: 'cephalic', placenta_location: 'low_lying' }] },
  { id: 'fa4', preg: 'g5', patient: 'p8', clinic: 'c-ivf', ago: 24, ga: 126, type: 'anomaly_scan', impression: 'Normal anatomy.',
    fetuses: [{ fetus_label: 'A', bpd_mm: 41, hc_mm: 152, ac_mm: 128, fl_mm: 27, dvp_cm: 4.8, ua_edf: 'present', placenta_location: 'posterior' }] },
  { id: 'fa2', preg: 'g5', patient: 'p8', clinic: 'c-ivf', ago: 2, ga: 148, type: 'doppler', impression: 'EFW < 3rd centile, raised UA PI. Weekly surveillance.',
    fetuses: [{ fetus_label: 'A', bpd_mm: 47, hc_mm: 180, ac_mm: 140, fl_mm: 31, dvp_cm: 2.4, ua_pi: 1.62, ua_edf: 'present', mca_pi: 1.6, fhr: 146 }] },
  { id: 'fa3', preg: 'g4', patient: 'p7', clinic: 'c-ivf', ago: 116, ga: 84, type: 'nt_scan', impression: 'DCDA twins; NT normal for both.',
    fetuses: [{ fetus_label: 'A', crl_mm: 62, fhr: 160 }, { fetus_label: 'B', crl_mm: 60, fhr: 158 }] },
  { id: 'fa5', preg: 'g4', patient: 'p7', clinic: 'c-ivf', ago: 60, ga: 140, type: 'anomaly_scan', impression: 'Normal anatomy, both twins.',
    fetuses: [{ fetus_label: 'A', hc_mm: 175, ac_mm: 152, fl_mm: 33, dvp_cm: 5 }, { fetus_label: 'B', hc_mm: 172, ac_mm: 148, fl_mm: 32, dvp_cm: 4.6 }] },
  { id: 'fa6', preg: 'g4', patient: 'p7', clinic: 'c-ivf', ago: 18, ga: 182, type: 'growth_scan', impression: 'Twin B growth lagging; discordance > 25 %.',
    fetuses: [{ fetus_label: 'A', hc_mm: 245, ac_mm: 220, fl_mm: 48, dvp_cm: 5.2, ua_edf: 'present', presentation: 'cephalic' },
              { fetus_label: 'B', hc_mm: 232, ac_mm: 190, fl_mm: 43, dvp_cm: 3.1, ua_edf: 'present', presentation: 'breech' }] },
  { id: 'fa7', preg: 'g3', patient: 'p4', clinic: 'c-main', ago: 21, ga: 224, type: 'growth_scan', impression: 'Growth on 65th centile.',
    fetuses: [{ fetus_label: 'A', hc_mm: 300, ac_mm: 290, fl_mm: 62, afi_cm: 16, presentation: 'cephalic', placenta_location: 'fundal' }] },
];

export const DEMO_SCANS = scanSeeds.map((sc) => ({
  id: sc.id, patient_id: sc.patient, pregnancy_id: sc.preg, clinic_id: sc.clinic, assessment_type: sc.type,
  performed_at: daysAgo(sc.ago), gestational_age_days: sc.ga, fetus_number: sc.fetuses.length, impression: sc.impression,
}));

const nullBio = {
  crl_mm: null, bpd_mm: null, hc_mm: null, ac_mm: null, fl_mm: null, efw_g: null, afi_cm: null, dvp_cm: null, ua_pi: null,
  ua_edf: null, mca_pi: null, fhr: null, presentation: null, placenta_location: null, notes: null,
} as const;
export const DEMO_BIOMETRY_SEED: FetalBiometry[] = scanSeeds.flatMap((sc) => sc.fetuses.map((f) => ({
  ...nullBio, ...f, id: `${sc.id}-${f.fetus_label}`, fetal_assessment_id: sc.id, pregnancy_id: sc.preg, patient_id: sc.patient,
  clinic_id: sc.clinic, ga_days: sc.ga,
})));

// --- Postnatal visits (p10, delivered 9 days ago) -----------------------------------
const pnBase = {
  pulse: null, temperature_c: null, uterus: null, lochia: null, wound: null, breastfeeding: null, breasts: null,
  epds_score: null, epds_self_harm: null, hemoglobin_g_dl: null, contraception: null, notes: null,
} as const;
export const DEMO_POSTNATAL: PostnatalVisit[] = [
  { ...pnBase, id: 'pn1', delivery_id: 'dl2', pregnancy_id: 'g7', patient_id: 'p10', clinic_id: 'c-main', encounter_id: 'pe1',
    visit_date: dateAgo(7), days_postpartum: 2, bp_systolic: 126, bp_diastolic: 80, temperature_c: 37.2, uterus: 'well_contracted',
    lochia: 'normal', wound: 'healing', breastfeeding: 'exclusive', breasts: 'engorgement', hemoglobin_g_dl: 10.4,
    created_by: 'u-nurse', created_at: daysAgo(7) },
  { ...pnBase, id: 'pn2', delivery_id: 'dl2', pregnancy_id: 'g7', patient_id: 'p10', clinic_id: 'c-main', encounter_id: 'pe2',
    visit_date: dateAgo(1), days_postpartum: 8, bp_systolic: 142, bp_diastolic: 92, temperature_c: 36.9, uterus: 'well_contracted',
    lochia: 'normal', wound: 'healing', breastfeeding: 'exclusive', breasts: 'normal', epds_score: 14, epds_self_harm: false,
    contraception: 'Progestogen-only pill discussed', created_by: 'u-res', created_at: daysAgo(1) },
];
export const DEMO_POSTNATAL_ENCOUNTERS: Encounter[] = [
  { id: 'pe1', patient_id: 'p10', clinic_id: 'c-main', specialty: 'obstetrics', encounter_type: 'postnatal_visit',
    encounter_at: daysAgo(7), provider_id: 'u-nurse', is_private: false, status: 'signed', chief_complaint: 'Postnatal check',
    assessment: null, plan: null },
  { id: 'pe2', patient_id: 'p10', clinic_id: 'c-main', specialty: 'obstetrics', encounter_type: 'postnatal_visit',
    encounter_at: daysAgo(1), provider_id: 'u-res', is_private: false, status: 'draft', chief_complaint: 'Postnatal check',
    assessment: 'Raised BP and EPDS 14', plan: 'Repeat BP in 48 h; perinatal mental health referral' },
];

// --- Labour in progress (p11, 39+2) — progress falls behind the alert line ------------
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
const lob = (h: number, o: Partial<LabourObservation>): LabourObservation => ({
  id: `lo-${h}`, pregnancy_id: 'g8', patient_id: 'p11', clinic_id: 'c-main', observed_at: hoursAgo(h), cervical_dilation_cm: null,
  descent_fifths: null, contractions_per_10min: null, contraction_duration_s: null, fhr: null, liquor: null, moulding: null,
  bp_systolic: null, bp_diastolic: null, pulse: null, temperature_c: null, oxytocin_mu_min: null, notes: null,
  entered_in_error: false, recorded_by: 'u-nurse', created_at: hoursAgo(h), ...o,
});
export const DEMO_LABOUR: LabourObservation[] = [
  lob(6.5, { cervical_dilation_cm: 4, descent_fifths: 4, contractions_per_10min: 3, contraction_duration_s: 35, fhr: 140, liquor: 'intact', bp_systolic: 118, bp_diastolic: 76, pulse: 84, temperature_c: 36.8 }),
  lob(5.5, { fhr: 142 }),
  lob(4.5, { cervical_dilation_cm: 5, descent_fifths: 4, contractions_per_10min: 3, contraction_duration_s: 40, fhr: 138, liquor: 'clear', moulding: 0 }),
  lob(3.5, { fhr: 136, pulse: 88 }),
  lob(2.5, { cervical_dilation_cm: 6, descent_fifths: 3, contractions_per_10min: 4, contraction_duration_s: 45, fhr: 140, liquor: 'clear', bp_systolic: 122, bp_diastolic: 78 }),
  lob(0.5, { cervical_dilation_cm: 6.5, descent_fifths: 3, contractions_per_10min: 3, contraction_duration_s: 45, fhr: 134, liquor: 'meconium_light', moulding: 1, temperature_c: 37.4, oxytocin_mu_min: 2 }),
];

// --- Gynecology ------------------------------------------------------------------
const gp = (o: Partial<GynProfile> & Pick<GynProfile, 'patient_id' | 'clinic_id'>): GynProfile => ({
  menarche_age: null, cycle_length_days: null, period_duration_days: null, cycle_regularity: null, menstrual_flow: null,
  dysmenorrhea: null, menopause_status: null, menopause_age: null, on_hrt: null, contraception: null, sexually_active: null,
  hpv_vaccinated: null, hysterectomy: 'none', previous_gyn_surgery: null, notes: null, ...o,
});
export const DEMO_GYN_PROFILES: GynProfile[] = [
  gp({ patient_id: 'p3', clinic_id: 'c-main', menarche_age: 12, cycle_length_days: 24, period_duration_days: 9, cycle_regularity: 'regular',
    menstrual_flow: 'heavy', dysmenorrhea: 'moderate', menopause_status: 'premenopausal', contraception: 'none', sexually_active: true, hpv_vaccinated: 'no' }),
  gp({ patient_id: 'p9', clinic_id: 'c-main', menarche_age: 13, cycle_length_days: 48, cycle_regularity: 'irregular', menstrual_flow: 'light',
    menopause_status: 'premenopausal', contraception: 'none', sexually_active: false, hpv_vaccinated: 'yes' }),
  gp({ patient_id: 'p12', clinic_id: 'c-main', menarche_age: 11, menopause_status: 'postmenopausal', menopause_age: 51, on_hrt: false,
    contraception: 'none', hpv_vaccinated: 'no', previous_gyn_surgery: 'Laparoscopic cholecystectomy (2010)' }),
  gp({ patient_id: 'p5', clinic_id: 'c-main', menarche_age: 12, cycle_length_days: 29, cycle_regularity: 'regular', menopause_status: 'premenopausal',
    contraception: 'none', hpv_vaccinated: 'no' }),
];

const gv = (o: Partial<GynVisit> & Pick<GynVisit, 'id' | 'patient_id' | 'encounter_id' | 'visit_date'>): GynVisit => ({
  clinic_id: 'c-main', complaints: [], palm_coein: [], lmp: null, pain_score: null, bp_systolic: null, bp_diastolic: null, weight_kg: null,
  height_cm: null, clinical_hyperandrogenism: null, biochemical_hyperandrogenism: null, abdominal_exam: null, speculum_exam: null,
  bimanual_exam: null, uterus_size: null, adnexal_tenderness: null, cervical_motion_tenderness: null, pop_stage: null, diagnosis: null,
  notes: null, created_by: 'u-cons', created_at: '', ...o,
});
export const DEMO_GYN_VISITS: GynVisit[] = [
  gv({ id: 'gv1', patient_id: 'p3', encounter_id: 'e2', visit_date: dateAgo(3), complaints: ['aub', 'dysmenorrhea'], palm_coein: ['L-SM'],
    lmp: dateAgo(10), pain_score: 5, bp_systolic: 124, bp_diastolic: 78, weight_kg: 78, height_cm: 160, uterus_size: 'enlarged_lt12w',
    speculum_exam: 'Healthy cervix', bimanual_exam: 'Bulky irregular uterus ~10 weeks size, adnexa free',
    diagnosis: 'Heavy menstrual bleeding — submucous fibroid (FIGO 2)' }),
  gv({ id: 'gv2', patient_id: 'p9', encounter_id: 'ge2', visit_date: dateAgo(5), complaints: ['amenorrhea', 'hirsutism_acne'], palm_coein: ['O'],
    lmp: dateAgo(70), bp_systolic: 118, bp_diastolic: 74, weight_kg: 74, height_cm: 162, clinical_hyperandrogenism: true,
    biochemical_hyperandrogenism: null, uterus_size: 'not_assessed', diagnosis: 'Oligomenorrhoea with hirsutism — ?PCOS', created_by: 'u-res' }),
  gv({ id: 'gv3', patient_id: 'p12', encounter_id: 'ge3', visit_date: dateAgo(2), complaints: ['pmb'], pain_score: 2, bp_systolic: 146,
    bp_diastolic: 88, weight_kg: 84, height_cm: 158, speculum_exam: 'Atrophic vagina, small amount of blood from os',
    bimanual_exam: 'Normal size uterus; right adnexal fullness', uterus_size: 'normal', diagnosis: 'Postmenopausal bleeding' }),
];
export const DEMO_GYN_ENCOUNTERS: Encounter[] = [
  { id: 'ge2', patient_id: 'p9', clinic_id: 'c-main', specialty: 'gynecology', encounter_type: 'consultation', encounter_at: daysAgo(5),
    provider_id: 'u-res', is_private: false, status: 'draft', chief_complaint: 'Irregular periods and hirsutism', assessment: null, plan: 'Hormone profile, pelvic US' },
  { id: 'ge3', patient_id: 'p12', clinic_id: 'c-main', specialty: 'gynecology', encounter_type: 'consultation', encounter_at: daysAgo(2),
    provider_id: 'u-cons', is_private: false, status: 'signed', chief_complaint: 'Vaginal bleeding after menopause', assessment: null, plan: 'TVUS, endometrial biopsy' },
];

const us = (o: Partial<GynUltrasound> & Pick<GynUltrasound, 'id' | 'patient_id' | 'performed_at'>): GynUltrasound => ({
  clinic_id: 'c-main', route: 'transvaginal', uterus_length_mm: null, uterus_ap_mm: null, uterus_width_mm: null, uterus_position: 'anteverted',
  endometrial_thickness_mm: null, endometrium_appearance: null, fibroids: [], right_ovary_volume_ml: null, left_ovary_volume_ml: null,
  right_follicle_count: null, left_follicle_count: null, adnexal_mass: false, mass_side: null, mass_max_diameter_mm: null,
  iota_b_features: [], iota_m_features: [], free_fluid: 'none', impression: null, orads_category: null, rmi_features: [],
  performed_by: 'u-cons', ...o,
});
export const DEMO_GYN_US: GynUltrasound[] = [
  us({ id: 'gu1', patient_id: 'p3', performed_at: daysAgo(3), uterus_length_mm: 102, uterus_ap_mm: 62, uterus_width_mm: 70,
    endometrial_thickness_mm: 11, endometrium_appearance: 'heterogeneous',
    fibroids: [{ figo_type: '2', size_mm: 34, location: 'posterior fundal' }, { figo_type: '5', size_mm: 21, location: 'anterior' }],
    right_ovary_volume_ml: 7, left_ovary_volume_ml: 6.2, impression: 'Two fibroids incl. FIGO 2 submucous 34 mm.' }),
  us({ id: 'gu2', patient_id: 'p9', performed_at: daysAgo(5), route: 'transabdominal', endometrial_thickness_mm: 6, right_ovary_volume_ml: 12.4,
    left_ovary_volume_ml: 11.1, right_follicle_count: 24, left_follicle_count: 21, impression: 'Polycystic ovarian morphology bilaterally.' }),
  us({ id: 'gu3', patient_id: 'p12', performed_at: daysAgo(2), uterus_length_mm: 62, uterus_ap_mm: 30, endometrial_thickness_mm: 7.5,
    endometrium_appearance: 'thickened', adnexal_mass: true, mass_side: 'right', mass_max_diameter_mm: 46, iota_b_features: ['B1'],
    orads_category: 2, rmi_features: [],
    free_fluid: 'none', impression: 'Thickened endometrium 7.5 mm. Right unilocular cyst 46 mm (IOTA B1).' }),
];

const scr = (o: Partial<CervicalScreening> & Pick<CervicalScreening, 'id' | 'patient_id' | 'sample_date' | 'test_type'>): CervicalScreening => ({
  clinic_id: 'c-main', hpv_result: null, cytology_result: null, status: 'resulted', recommendation: null, next_due_date: null, notes: null,
  recorded_by: 'u-nurse', created_at: '', ...o,
});
export const DEMO_SCREENINGS: CervicalScreening[] = [
  scr({ id: 'cs1', patient_id: 'p3', sample_date: dateAgo(21), test_type: 'cotest', hpv_result: 'hpv16', cytology_result: 'nilm', recommendation: 'colposcopy' }),
  scr({ id: 'cs2', patient_id: 'p3', sample_date: dateAgo(1900), test_type: 'cytology', cytology_result: 'nilm', recommendation: 'routine_3y', next_due_date: dateAgo(800) }),
  scr({ id: 'cs3', patient_id: 'p9', sample_date: dateAgo(400), test_type: 'cytology', cytology_result: 'nilm', recommendation: 'routine_3y', next_due_date: dateAgo(-695) }),
  scr({ id: 'cs4', patient_id: 'p12', sample_date: dateAgo(2600), test_type: 'cytology', cytology_result: 'nilm', recommendation: 'routine_3y', next_due_date: dateAgo(1505) }),
  scr({ id: 'cs5', patient_id: 'p5', sample_date: dateAgo(90), test_type: 'cotest', hpv_result: 'other_hr', cytology_result: 'hsil', recommendation: 'colposcopy_expedited' }),
];
export const DEMO_COLPOSCOPIES: Colposcopy[] = [
  { id: 'cp1', patient_id: 'p5', clinic_id: 'c-main', screening_id: 'cs5', performed_at: dateAgo(70), tz_type: 1, findings: 'major_grade2',
    biopsy_taken: true, histology: 'cin2', treatment: 'lletz', notes: 'Acetowhite lesion 3–6 o’clock', performed_by: 'u-cons' },
];
export const DEMO_GYN_PROCEDURES: GynProcedure[] = [
  { id: 'gpx1', patient_id: 'p5', clinic_id: 'c-main', performed_at: dateAgo(30), procedure_code: 'lletz', approach: 'office',
    indication: 'CIN2 on colposcopic biopsy', findings: 'Type 1 TZ, single pass 12 mm depth', surgeon_id: 'u-cons', assistant: null,
    anesthesia: 'local', blood_loss_ml: 10, complications: null, clavien_dindo: 'none', histology_status: 'pending', histology_result: null,
    notes: null, recorded_by: 'u-cons' },
  { id: 'gpx2', patient_id: 'p3', clinic_id: 'c-main', performed_at: dateAgo(400), procedure_code: 'diagnostic_hysteroscopy', approach: 'office',
    indication: 'Heavy menstrual bleeding', findings: 'Submucous fibroid posterior wall', surgeon_id: 'u-cons', assistant: null,
    anesthesia: 'none', blood_loss_ml: null, complications: null, clavien_dindo: 'none', histology_status: 'not_sent', histology_result: null,
    notes: null, recorded_by: 'u-cons' },
];

// --- Labs & questionnaires -------------------------------------------------------
let labN = 0;
const lab = (patient_id: string, ago: number, test_code: string, value: number, unit: string, ref_low: number | null, ref_high: number | null, cycle_day: number | null = null): LabResult =>
  ({ id: `lab${++labN}`, patient_id, clinic_id: 'c-main', collected_at: dateAgo(ago), test_code, value, unit, ref_low, ref_high, cycle_day, notes: null, recorded_by: 'u-nurse' });
export const DEMO_LABS: LabResult[] = [
  // p9 — PCOS work-up (day 3): raised testosterone / FAI, LH:FSH ≈ 2.6, normal prolactin & TSH
  lab('p9', 4, 'lh', 13.8, 'IU/L', 2.4, 12.6, 3), lab('p9', 4, 'fsh', 5.3, 'IU/L', 3.5, 12.5, 3),
  lab('p9', 4, 'testosterone', 2.6, 'nmol/L', 0.29, 1.67), lab('p9', 4, 'shbg', 24, 'nmol/L', 26.1, 110),
  lab('p9', 4, 'prolactin', 310, 'mIU/L', 102, 496), lab('p9', 4, 'tsh', 2.1, 'mIU/L', 0.27, 4.2),
  lab('p9', 4, 'hba1c', 5.8, '%', 4.0, 5.6), lab('p9', 4, 'amh', 8.9, 'ng/mL', null, null),
  // p3 — heavy menstrual bleeding: iron deficiency anaemia
  lab('p3', 3, 'hemoglobin', 9.6, 'g/dL', 12, 15.5), lab('p3', 3, 'ferritin', 7, 'µg/L', 15, 150), lab('p3', 3, 'tsh', 1.8, 'mIU/L', 0.27, 4.2),
  // p12 — postmenopausal, adnexal cyst: CA-125 & HE4
  lab('p6', 30, 'amh', 1.6, 'ng/mL', null, null), lab('p6', 30, 'fsh', 6.8, 'IU/L', 3.5, 12.5, 3), lab('p6', 30, 'tsh', 1.9, 'mIU/L', 0.27, 4.2),
  lab('p7', 240, 'amh', 3.2, 'ng/mL', null, null),
  lab('p12', 2, 'ca125', 22, 'U/mL', 0, 35), lab('p12', 2, 'he4', 61, 'pmol/L', null, null), lab('p12', 2, 'fsh', 78, 'IU/L', null, null),
];
export const DEMO_MRS: MenopauseAssessment[] = [
  { id: 'mrs1', patient_id: 'p12', clinic_id: 'c-main', assessed_at: dateAgo(2), items: [3, 1, 3, 2, 2, 1, 2, 2, 1, 3, 2],
    total: 22, somatic: 9, psychological: 7, urogenital: 6, notes: null, recorded_by: 'u-cons' },
];
export const DEMO_ICIQ: UrogynAssessment[] = [
  { id: 'iq1', patient_id: 'p12', clinic_id: 'c-main', assessed_at: dateAgo(2), frequency: 2, amount: 2, interference: 4, score: 8,
    leak_situations: ['cough_sneeze', 'before_toilet'], notes: null, recorded_by: 'u-cons' },
];

// --- Infertility -------------------------------------------------------------------
export const DEMO_FERTILITY_PROFILES: FertilityProfile[] = [
  { patient_id: 'p6', clinic_id: 'c-ivf', infertility_type: 'primary', duration_months: 38, female_factors: [], male_factor: true,
    tubal_assessment: 'bilateral_patent', tubal_method: 'hsg', partner_name: 'Ahmed Saber', partner_dob: '1985-02-14', partner_phone: '+20 100 000 0601',
    partner_blood_group: 'O+', previous_treatments: '3 IUI cycles (negative); ICSI #1 negative β-hCG', notes: null },
  { patient_id: 'p7', clinic_id: 'c-ivf', infertility_type: 'primary', duration_months: 26, female_factors: ['tubal'], male_factor: false,
    tubal_assessment: 'hydrosalpinx', tubal_method: 'laparoscopy', partner_name: 'Omar Gamal', partner_dob: '1990-06-01', partner_phone: null,
    partner_blood_group: 'B+', previous_treatments: 'Bilateral salpingectomy for hydrosalpinges', notes: null },
  { patient_id: 'p5', clinic_id: 'c-main', infertility_type: 'secondary', duration_months: 18, female_factors: ['ovulatory'], male_factor: false,
    tubal_assessment: 'bilateral_patent', tubal_method: 'hycosy', partner_name: 'Karim Fathy', partner_dob: null, partner_phone: null,
    partner_blood_group: null, previous_treatments: null, notes: null },
];

const sa = (o: Partial<SemenAnalysis> & Pick<SemenAnalysis, 'id' | 'patient_id' | 'clinic_id' | 'collected_at'>): SemenAnalysis => {
  const base = { sample_type: 'diagnostic' as const, abstinence_days: 3, volume_ml: null, concentration_m_ml: null, progressive_pct: null,
    total_motility_pct: null, normal_forms_pct: null, vitality_pct: null, ph: null, leukocytes_m_ml: null, dna_fragmentation_pct: null,
    notes: null, recorded_by: 'u-spec', ...o };
  const total = base.volume_ml != null && base.concentration_m_ml != null ? Math.round(base.volume_ml * base.concentration_m_ml * 100) / 100 : null;
  return { ...base, total_count_m: total, tmsc_m: total != null && base.progressive_pct != null ? Math.round(total * base.progressive_pct) / 100 : null };
};
export const DEMO_SEMEN: SemenAnalysis[] = [
  sa({ id: 'sa1', patient_id: 'p6', clinic_id: 'c-ivf', collected_at: dateAgo(120), volume_ml: 2.1, concentration_m_ml: 6.5, progressive_pct: 18,
    total_motility_pct: 28, normal_forms_pct: 2, vitality_pct: 61, ph: 7.6, leukocytes_m_ml: 0.4, dna_fragmentation_pct: 34 }),
  sa({ id: 'sa2', patient_id: 'p7', clinic_id: 'c-ivf', collected_at: dateAgo(230), volume_ml: 3.2, concentration_m_ml: 48, progressive_pct: 41,
    total_motility_pct: 58, normal_forms_pct: 5, vitality_pct: 78, ph: 7.5 }),
  sa({ id: 'sa3', patient_id: 'p5', clinic_id: 'c-main', collected_at: dateAgo(40), volume_ml: 2.8, concentration_m_ml: 22, progressive_pct: 32,
    total_motility_pct: 46, normal_forms_pct: 4, vitality_pct: 70 }),
];

const mon = (id: string, cycle_id: string, patient_id: string, clinic_id: string, ago: number, o: Partial<StimulationMonitoring>): StimulationMonitoring => ({
  id, cycle_id, patient_id, clinic_id, monitored_on: dateAgo(ago), stim_day: null, e2_pmol_l: null, lh_iu_l: null, p4_nmol_l: null, endometrium_mm: null,
  follicles_right: [], follicles_left: [], fsh_dose_iu: null, antagonist: false, notes: null, recorded_by: 'u-spec', ...o,
});
export const DEMO_MONITORING: StimulationMonitoring[] = [
  mon('sm1', 'fc1', 'p6', 'c-ivf', 9, { stim_day: 1, e2_pmol_l: 140, lh_iu_l: 4.8, endometrium_mm: 4.2, follicles_right: [5, 6, 4, 5, 6, 5, 4], follicles_left: [5, 4, 6, 5, 5, 4], fsh_dose_iu: 225, notes: 'Baseline AFC 13' }),
  mon('sm2', 'fc1', 'p6', 'c-ivf', 5, { stim_day: 5, e2_pmol_l: 1450, lh_iu_l: 3.9, endometrium_mm: 7.1, follicles_right: [12, 11, 10, 9, 9, 8], follicles_left: [12, 10, 9, 8, 8], fsh_dose_iu: 225 }),
  mon('sm3', 'fc1', 'p6', 'c-ivf', 3, { stim_day: 7, e2_pmol_l: 3600, lh_iu_l: 5.2, p4_nmol_l: 1.8, endometrium_mm: 8.6, follicles_right: [15, 14, 13, 12, 11, 10], follicles_left: [16, 13, 12, 11, 10], fsh_dose_iu: 225, antagonist: true }),
  mon('sm4', 'fc1', 'p6', 'c-ivf', 1, { stim_day: 9, e2_pmol_l: 7900, lh_iu_l: 2.1, p4_nmol_l: 2.9, endometrium_mm: 10.2, follicles_right: [19, 18, 17, 15, 14, 12], follicles_left: [18, 16, 15, 13, 12], fsh_dose_iu: 225, antagonist: true }),
  mon('sm5', 'fc2', 'p5', 'c-main', 4, { stim_day: 11, e2_pmol_l: 980, lh_iu_l: 8.4, endometrium_mm: 8.8, follicles_right: [19], follicles_left: [14] }),
];

const emb = (id: string, cycle_id: string, patient_id: string, no: number, o: Partial<Embryo>): Embryo => ({
  id, cycle_id, patient_id, clinic_id: 'c-ivf', embryo_no: no, day_observed: 5, stage: 'blastocyst', cell_count: null, fragmentation_grade: null,
  blast_expansion: null, icm_grade: null, te_grade: null, pgt_result: 'not_tested', status: 'in_culture', frozen_at: null, storage_location: null,
  consent_expires_on: null, notes: null, ...o,
});
export const DEMO_EMBRYOS: Embryo[] = [
  emb('em1', 'fc3', 'p7', 1, { blast_expansion: 4, icm_grade: 'A', te_grade: 'A', status: 'transferred' }),
  emb('em2', 'fc3', 'p7', 2, { blast_expansion: 4, icm_grade: 'A', te_grade: 'B', status: 'transferred' }),
  emb('em3', 'fc3', 'p7', 3, { blast_expansion: 4, icm_grade: 'B', te_grade: 'B', status: 'frozen', frozen_at: dateAgo(181), storage_location: 'Tank 1 / Canister 3 / Straw 12', consent_expires_on: dateAgo(-60) }),
  emb('em4', 'fc3', 'p7', 4, { day_observed: 6, blast_expansion: 3, icm_grade: 'B', te_grade: 'B', status: 'frozen', frozen_at: dateAgo(180), storage_location: 'Tank 1 / Canister 3 / Straw 13', consent_expires_on: dateAgo(-60) }),
  emb('em5', 'fc3', 'p7', 5, { day_observed: 6, blast_expansion: 3, icm_grade: 'B', te_grade: 'C', status: 'frozen', frozen_at: dateAgo(180), storage_location: 'Tank 1 / Canister 3 / Straw 14', consent_expires_on: dateAgo(-1645) }),
  emb('em6', 'fc3', 'p7', 6, { day_observed: 5, stage: 'arrested', status: 'discarded' }),
  emb('em7', 'fc0', 'p6', 1, { blast_expansion: 3, icm_grade: 'B', te_grade: 'B', status: 'transferred' }),
  emb('em8', 'fc0', 'p6', 2, { day_observed: 3, stage: 'cleavage', cell_count: 6, fragmentation_grade: 2, status: 'discarded' }),
];

export const DEMO_TRANSFERS: EmbryoTransfer[] = [
  { id: 'et1', cycle_id: 'fc3', patient_id: 'p7', clinic_id: 'c-ivf', transfer_on: dateAgo(181), fresh: true, embryo_ids: ['em1', 'em2'],
    embryos_transferred: 2, embryo_day: 5, endometrium_mm: 10.5, difficulty: 'easy', beta_hcg_on: dateAgo(172), beta_hcg_value: 612,
    gestational_sacs: 2, fetal_hearts: 2, outcome: 'ongoing', pregnancy_id: 'g4', notes: 'DCDA twins on 7-week scan', recorded_by: 'u-spec' },
  { id: 'et0', cycle_id: 'fc0', patient_id: 'p6', clinic_id: 'c-ivf', transfer_on: dateAgo(243), fresh: true, embryo_ids: ['em7'],
    embryos_transferred: 1, embryo_day: 5, endometrium_mm: 9.1, difficulty: 'easy', beta_hcg_on: dateAgo(234), beta_hcg_value: 2,
    gestational_sacs: 0, fetal_hearts: 0, outcome: 'negative', pregnancy_id: null, notes: null, recorded_by: 'u-spec' },
];

// --- Fetal medicine ------------------------------------------------------------------
// Scan headers without growth biometry (the anomaly/Doppler headers fa1, fa2, fa3, fa4 above are reused).
const fmHeader = (id: string, preg: string, patient: string, clinic: string, ago: number, ga: number, type: string, n: number, impression: string): FetalAssessment => ({
  id, patient_id: patient, pregnancy_id: preg, clinic_id: clinic, assessment_type: type, performed_at: daysAgo(ago),
  gestational_age_days: ga, fetus_number: n, impression,
});
export const DEMO_FM_SCANS: FetalAssessment[] = [
  fmHeader('fm-g2-nt', 'g2', 'p2', 'c-main', 1, 83, 'nt_scan', 1, 'Increased NT with absent nasal bone; high-chance combined screen.'),
  fmHeader('fm-g5-nt', 'g5', 'p8', 'c-ivf', 62, 88, 'nt_scan', 1, 'Low-chance screen; low PAPP-A.'),
  fmHeader('fm-g5-dop1', 'g5', 'p8', 'c-ivf', 16, 134, 'doppler', 1, 'High uterine artery PI with notching.'),
  fmHeader('fm-g1-dop1', 'g1', 'p1', 'c-main', 28, 140, 'doppler', 1, 'Anti-D titre 1:32 — MCA PSV surveillance.'),
  fmHeader('fm-g1-dop2', 'g1', 'p1', 'c-main', 14, 154, 'doppler', 1, 'MCA PSV rising.'),
  fmHeader('fm-g1-dop3', 'g1', 'p1', 'c-main', 2, 166, 'doppler', 1, 'MCA PSV above 1.5 MoM.'),
  fmHeader('fm-g4-dop', 'g4', 'p7', 'c-ivf', 4, 196, 'doppler', 2, 'Twin B: raised UA PI, low CPR.'),
  fmHeader('fm-g9-nt', 'g9', 'p13', 'c-ivf', 41, 87, 'nt_scan', 2, 'MCDA twins; NT discordance.'),
  fmHeader('fm-g9-dop1', 'g9', 'p13', 'c-ivf', 14, 114, 'doppler', 2, 'Fortnightly MC surveillance — normal.'),
  fmHeader('fm-g9-dop2', 'g9', 'p13', 'c-ivf', 1, 127, 'doppler', 2, 'Oligo/polyhydramnios sequence; donor bladder not seen.'),
];

const ftBase = { crl_mm: null, nt_mm: null, nasal_bone: null, dv_a_wave: null, tricuspid_regurgitation: null, fhr: null, papp_a_mom: null,
  free_bhcg_mom: null, risk_t21: null, risk_t18: null, risk_t13: null, risk_method: null, risk_software: null, early_anatomy: null, notes: null } as const;
const ft = (scan: string, preg: string, patient: string, clinic: string, ga: number, o: Partial<FmFirstTrimester>): FmFirstTrimester =>
  ({ ...ftBase, id: `${scan}-${o.fetus_label ?? 'A'}`, fetal_assessment_id: scan, pregnancy_id: preg, patient_id: patient, clinic_id: clinic, ga_days: ga, fetus_label: 'A', ...o });
export const DEMO_FM_FIRST: FmFirstTrimester[] = [
  ft('fm-g2-nt', 'g2', 'p2', 'c-main', 83, { crl_mm: 58, nt_mm: 3.9, nasal_bone: 'absent', dv_a_wave: 'reversed', tricuspid_regurgitation: true, fhr: 162,
    papp_a_mom: 0.45, free_bhcg_mom: 2.8, risk_t21: 38, risk_t18: 2200, risk_t13: 4500, risk_method: 'combined_extended', risk_software: 'FMF 2012' }),
  ft('fm-g5-nt', 'g5', 'p8', 'c-ivf', 88, { crl_mm: 64, nt_mm: 1.7, nasal_bone: 'present', dv_a_wave: 'positive', fhr: 158, papp_a_mom: 0.32,
    free_bhcg_mom: 0.9, risk_t21: 2400, risk_t18: 9800, risk_t13: 15000, risk_method: 'combined', risk_software: 'FMF 2012' }),
  ft('fa3', 'g4', 'p7', 'c-ivf', 84, { fetus_label: 'A', crl_mm: 62, nt_mm: 1.6, nasal_bone: 'present', papp_a_mom: 1.1, free_bhcg_mom: 1.2,
    risk_t21: 3500, risk_t18: 12000, risk_t13: 20000, risk_method: 'combined' }),
  ft('fa3', 'g4', 'p7', 'c-ivf', 84, { fetus_label: 'B', crl_mm: 60, nt_mm: 1.8, nasal_bone: 'present', papp_a_mom: 1.1, free_bhcg_mom: 1.2,
    risk_t21: 2900, risk_t18: 11000, risk_t13: 18000, risk_method: 'combined' }),
  ft('fm-g9-nt', 'g9', 'p13', 'c-ivf', 87, { fetus_label: 'A', crl_mm: 61, nt_mm: 1.9, nasal_bone: 'present', risk_t21: 1800, risk_method: 'combined' }),
  ft('fm-g9-nt', 'g9', 'p13', 'c-ivf', 87, { fetus_label: 'B', crl_mm: 59, nt_mm: 2.6, nasal_bone: 'present', risk_t21: 1800, risk_method: 'combined',
    notes: 'NT discordance > 20 % — increased TTTS risk' }),
];

const anBase = { abnormal_structures: [] as string[], not_visualised: [] as string[], atrium_mm: null, tcd_mm: null, cisterna_magna_mm: null, nuchal_fold_mm: null,
  renal_pelvis_mm: null, cervical_length_mm: null, placenta_location: null, placenta_os_mm: null, cord_vessels: 3 as const, amniotic_fluid: 'normal' as const,
  soft_markers: [] as string[], fetal_sex: null, anomalies: null, conclusion: 'normal' as FmAnomalyScan['conclusion'], notes: null };
export const DEMO_FM_ANOMALY: FmAnomalyScan[] = [
  { ...anBase, id: 'fa1-an', fetal_assessment_id: 'fa1', pregnancy_id: 'g1', patient_id: 'p1', clinic_id: 'c-main', fetus_label: 'A', ga_days: 160,
    atrium_mm: 6.2, tcd_mm: 22, cisterna_magna_mm: 5, nuchal_fold_mm: 4, cervical_length_mm: 34, placenta_location: 'low_lying', placenta_os_mm: 15,
    fetal_sex: 'not_disclosed' },
  { ...anBase, id: 'fa4-an', fetal_assessment_id: 'fa4', pregnancy_id: 'g5', patient_id: 'p8', clinic_id: 'c-ivf', fetus_label: 'A', ga_days: 126,
    atrium_mm: 7, tcd_mm: 18, cisterna_magna_mm: 4, cervical_length_mm: 31, placenta_location: 'posterior', placenta_os_mm: 60,
    soft_markers: ['echogenic_bowel'], conclusion: 'soft_markers', notes: 'Echogenic bowel — CMV serology sent' },
];

const dpBase = { ua_pi: null, ua_pi_centile: null, ua_edf: null, mca_pi: null, mca_pi_centile: null, mca_psv_cm_s: null, mca_psv_mom: null, cpr: null,
  cpr_centile: null, uta_left_pi: null, uta_right_pi: null, uta_mean_pi: null, uta_pi_centile: null, uta_notching: null, dv_pi: null,
  dv_pi_centile: null, dv_a_wave: null, uv_pulsation: null, mvp_cm: null, bladder_visible: null, hydrops: false, fetal_demise: false,
  ctg: null, notes: null } as const;
const dop = (scan: string, preg: string, patient: string, clinic: string, ga: number, o: Partial<FmDoppler>): FmDoppler =>
  ({ ...dpBase, id: `${scan}-${o.fetus_label ?? 'A'}`, fetal_assessment_id: scan, pregnancy_id: preg, patient_id: patient, clinic_id: clinic, ga_days: ga, fetus_label: 'A', ...o });
/** CPR, mean UtA PI and MCA PSV MoM are derived by DemoService, as the database does. */
export const DEMO_FM_DOPPLER: FmDoppler[] = [
  dop('fm-g1-dop1', 'g1', 'p1', 'c-main', 140, { ua_pi: 1.15, ua_edf: 'present', mca_pi: 1.7, mca_psv_cm_s: 28, dv_a_wave: 'positive', mvp_cm: 5.2 }),
  dop('fm-g1-dop2', 'g1', 'p1', 'c-main', 154, { ua_pi: 1.1, ua_edf: 'present', mca_pi: 1.65, mca_psv_cm_s: 36, dv_a_wave: 'positive', mvp_cm: 5.6 }),
  dop('fm-g1-dop3', 'g1', 'p1', 'c-main', 166, { ua_pi: 1.05, ua_edf: 'present', mca_pi: 1.5, mca_psv_cm_s: 49, dv_a_wave: 'positive', mvp_cm: 6.1 }),
  dop('fm-g5-dop1', 'g5', 'p8', 'c-ivf', 134, { ua_pi: 1.35, ua_pi_centile: 88, ua_edf: 'present', mca_pi: 1.75, uta_left_pi: 1.95, uta_right_pi: 1.75,
    uta_pi_centile: 97, uta_notching: true, dv_a_wave: 'positive', mvp_cm: 3.8 }),
  dop('fa2', 'g5', 'p8', 'c-ivf', 148, { ua_pi: 1.62, ua_pi_centile: 97, ua_edf: 'present', mca_pi: 1.6, cpr_centile: 4, uta_left_pi: 1.9,
    uta_right_pi: 1.7, uta_pi_centile: 98, uta_notching: true, dv_pi: 0.62, dv_pi_centile: 60, dv_a_wave: 'positive', mvp_cm: 2.4, ctg: 'not_done' }),
  dop('fm-g4-dop', 'g4', 'p7', 'c-ivf', 196, { fetus_label: 'A', ua_pi: 0.98, ua_pi_centile: 45, ua_edf: 'present', mca_pi: 1.9, cpr_centile: 55, mvp_cm: 5.1 }),
  dop('fm-g4-dop', 'g4', 'p7', 'c-ivf', 196, { fetus_label: 'B', ua_pi: 1.42, ua_pi_centile: 96, ua_edf: 'present', mca_pi: 1.35, cpr_centile: 6,
    dv_a_wave: 'positive', mvp_cm: 3.0 }),
  dop('fm-g9-dop1', 'g9', 'p13', 'c-ivf', 114, { fetus_label: 'A', ua_pi: 1.3, ua_edf: 'present', mvp_cm: 3.1, bladder_visible: true }),
  dop('fm-g9-dop1', 'g9', 'p13', 'c-ivf', 114, { fetus_label: 'B', ua_pi: 1.2, ua_edf: 'present', mvp_cm: 6.5, bladder_visible: true }),
  dop('fm-g9-dop2', 'g9', 'p13', 'c-ivf', 127, { fetus_label: 'A', ua_pi: 1.45, ua_edf: 'present', dv_a_wave: 'positive', mvp_cm: 1.4, bladder_visible: false }),
  dop('fm-g9-dop2', 'g9', 'p13', 'c-ivf', 127, { fetus_label: 'B', ua_pi: 1.1, ua_edf: 'present', dv_a_wave: 'positive', mvp_cm: 9.6, bladder_visible: true }),
];

export const DEMO_FM_CFDNA: FmCfdna[] = [
  { id: 'cf1', patient_id: 'p4', pregnancy_id: 'g3', clinic_id: 'c-main', sampled_on: dateAgo(175), ga_days: 70, laboratory: 'Reference genetics lab',
    result_status: 'resulted', fetal_fraction_pct: 11.2, t21: 'low_risk', t18: 'low_risk', t13: 'low_risk', sex_chromosomes: 'not_tested',
    fetal_sex: 'not_reported', resulted_on: dateAgo(168), notes: null },
];

export const DEMO_FM_PROCEDURES: FmProcedure[] = [];

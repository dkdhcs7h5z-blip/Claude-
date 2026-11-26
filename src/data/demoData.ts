/* Fictional sample data for DEMO MODE only. No real persons or organizations. */
import type {
  AntenatalVisit, Delivery, Newborn,
  AccessGrant, AuditEvent, Clinic, DocumentMeta, Encounter, FertilityCycle, FetalAssessment,
  Patient, Pregnancy, Profile, ResearchProject,
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
];

const pregDefaults = {
  cycle_length_days: 28, us_dating_date: null, us_dating_ga_days: null, transfer_date: null, embryo_age_days: null,
  booking_date: null, booking_weight_kg: null, height_cm: null, outcome_date: null, notes: null,
} as const;

export const DEMO_PREGNANCIES: Pregnancy[] = [
  { ...pregDefaults, id: 'g1', patient_id: 'p1', clinic_id: 'c-main', lmp: dateAgo(168), edd: null, edd_basis: 'lmp', gravida: 2, para: 1,
    abortus: 0, living: 1, conception: 'spontaneous', plurality: 1, risk_level: 'high',
    risk_factors: ['previous_cs', 'rh_alloimmunization'], status: 'active', booking_date: dateAgo(112),
    booking_weight_kg: 68, height_cm: 162 },
  { ...pregDefaults, id: 'g2', patient_id: 'p2', clinic_id: 'c-main', lmp: dateAgo(84), edd: null, edd_basis: 'lmp', gravida: 1, para: 0,
    abortus: 0, living: 0, conception: 'spontaneous', plurality: 1, risk_level: 'moderate', risk_factors: ['family_history_preeclampsia'],
    status: 'active', booking_date: dateAgo(28), booking_weight_kg: 74, height_cm: 160 },
  { ...pregDefaults, id: 'g3', patient_id: 'p4', clinic_id: 'c-main', lmp: dateAgo(245), edd: null, edd_basis: 'lmp', gravida: 3, para: 2,
    abortus: 0, living: 2, conception: 'spontaneous', plurality: 1, risk_level: 'moderate',
    risk_factors: ['previous_gdm', 'family_history_diabetes'], status: 'active', booking_date: dateAgo(189),
    booking_weight_kg: 82, height_cm: 158 },
  { ...pregDefaults, id: 'g4', patient_id: 'p7', clinic_id: 'c-ivf', lmp: null, edd: dateAgo(-195), edd_basis: 'ivf_transfer', gravida: 1,
    para: 0, abortus: 0, living: 0, conception: 'icsi', plurality: 2, risk_level: 'high', risk_factors: [],
    status: 'active', transfer_date: dateAgo(66), embryo_age_days: 5, booking_date: dateAgo(30), booking_weight_kg: 61, height_cm: 165,
    notes: 'DCDA twins' },
  { ...pregDefaults, id: 'g5', patient_id: 'p8', clinic_id: 'c-ivf', lmp: dateAgo(150), edd: null, edd_basis: 'lmp', gravida: 2, para: 1,
    abortus: 0, living: 1, conception: 'spontaneous', plurality: 1, risk_level: 'high',
    risk_factors: ['smoking'], status: 'active', booking_date: dateAgo(90), booking_weight_kg: 55, height_cm: 163 },
  { ...pregDefaults, id: 'g6', patient_id: 'p3', clinic_id: 'c-main', lmp: dateAgo(1100), edd: null, edd_basis: 'lmp', gravida: 1, para: 0,
    abortus: 0, living: 0, conception: 'spontaneous', plurality: 1, risk_level: 'low', risk_factors: [], status: 'delivered',
    outcome_date: dateAgo(824) },
];

export const DEMO_CYCLES: FertilityCycle[] = [
  { id: 'fc1', patient_id: 'p6', clinic_id: 'c-ivf', cycle_type: 'icsi', protocol: 'Antagonist', start_date: dateAgo(9),
    status: 'stimulation', outcome: null },
  { id: 'fc2', patient_id: 'p5', clinic_id: 'c-main', cycle_type: 'iui', protocol: 'Letrozole + hCG trigger', start_date: dateAgo(14),
    status: 'luteal', outcome: null },
  { id: 'fc3', patient_id: 'p7', clinic_id: 'c-ivf', cycle_type: 'icsi', protocol: 'Long agonist', start_date: dateAgo(120),
    status: 'completed', outcome: 'clinical_pregnancy' },
];

export const DEMO_FETAL: FetalAssessment[] = [
  { id: 'fa1', patient_id: 'p1', pregnancy_id: 'g1', clinic_id: 'c-main', assessment_type: 'anomaly_scan',
    performed_at: daysAgo(4), gestational_age_days: 160, fetus_number: 1, impression: 'Normal fetal anatomy survey.' },
  { id: 'fa2', patient_id: 'p8', pregnancy_id: 'g5', clinic_id: 'c-ivf', assessment_type: 'doppler', performed_at: daysAgo(2),
    gestational_age_days: 148, fetus_number: 1, impression: 'Raised UA PI; EFW < 10th centile. Weekly surveillance.' },
  { id: 'fa3', patient_id: 'p7', pregnancy_id: 'g4', clinic_id: 'c-ivf', assessment_type: 'nt_scan', performed_at: daysAgo(30),
    gestational_age_days: 88, fetus_number: 2, impression: 'NT normal for both fetuses.' },
];

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
const lmpOffset: Record<string, number> = { g1: 168, g2: 84, g3: 245, g4: 85, g5: 150 };
const pregPatient: Record<string, [string, string]> = {
  g1: ['p1', 'c-main'], g2: ['p2', 'c-main'], g3: ['p4', 'c-main'], g4: ['p7', 'c-ivf'], g5: ['p8', 'c-ivf'],
};
const visitProvider: Record<string, string> = { g1: 'u-cons', g2: 'u-res', g3: 'u-cons', g4: 'u-spec', g5: 'u-spec' };

const seeds: Record<string, VisitSeed[]> = {
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
    { ga: 85, weight_kg: 61.9, bp_systolic: 112, bp_diastolic: 70, urine_protein: 'negative', fetal_heart_rate: 158 },
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
      fetal_movements: null, edema: null, hemoglobin_g_dl: null, notes: null, created_by: visitProvider[pid],
      created_at: daysAgo(ago), ...vitals,
    });
  });
}

export const DEMO_DELIVERIES: Delivery[] = [
  { id: 'dl1', pregnancy_id: 'g6', patient_id: 'p3', clinic_id: 'c-main', delivered_at: daysAgo(824), ga_days: 276,
    onset: 'spontaneous', mode: 'svd', indication: null, anesthesia: 'epidural', blood_loss_ml: 300,
    perineum: 'second_degree', complications: [], notes: null, recorded_by: 'u-cons' },
];

export const DEMO_NEWBORNS: Newborn[] = [
  { id: 'nb1', delivery_id: 'dl1', birth_order: 1, sex: 'male', birth_weight_g: 3350, apgar_1: 8, apgar_5: 9,
    outcome: 'live_birth', nicu_admission: false, notes: null },
];

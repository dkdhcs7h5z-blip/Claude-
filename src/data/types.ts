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
  status: 'active' | 'delivered' | 'miscarriage' | 'ectopic' | 'termination' | 'stillbirth';
  outcome_date: string | null;
  notes: string | null;
}

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

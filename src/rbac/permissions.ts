/**
 * Role & permission model (UI side).
 *
 * The database (role_permissions table + RLS) is the authority. This mirror is
 * used for UI gating and demo mode; `permissions.test.ts` fails if it drifts
 * from the SQL migration.
 */
export const ROLES = [
  'super_admin',
  'clinic_admin',
  'consultant',
  'specialist',
  'resident',
  'nurse',
  'researcher',
  'read_only',
] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'patient.read',
  'patient.create',
  'patient.update',
  'patient.delete',
  'patient.share',
  'clinical.read',
  'clinical.write',
  'clinical.sign',
  'document.read',
  'document.upload',
  'document.delete',
  'research.access',
  'research.manage',
  'research.export',
  'admin.users',
  'admin.clinic',
  'audit.read',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const PATIENT_ALL: Permission[] = ['patient.read', 'patient.create', 'patient.update', 'patient.delete', 'patient.share'];
const CLINICAL_ALL: Permission[] = ['clinical.read', 'clinical.write', 'clinical.sign'];
const DOCUMENT_ALL: Permission[] = ['document.read', 'document.upload', 'document.delete'];
const RESEARCH_ALL: Permission[] = ['research.access', 'research.manage', 'research.export'];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  super_admin: [...PERMISSIONS],
  clinic_admin: [...PATIENT_ALL, 'document.read', 'document.upload', 'admin.users', 'admin.clinic', 'audit.read'],
  consultant: [...PATIENT_ALL, ...CLINICAL_ALL, ...DOCUMENT_ALL, ...RESEARCH_ALL],
  specialist: [
    'patient.read', 'patient.create', 'patient.update', 'patient.share',
    ...CLINICAL_ALL, ...DOCUMENT_ALL, 'research.access',
  ],
  resident: [
    'patient.read', 'patient.create', 'patient.update',
    'clinical.read', 'clinical.write', 'document.read', 'document.upload',
  ],
  nurse: [
    'patient.read', 'patient.create', 'patient.update',
    'clinical.read', 'clinical.write', 'document.read', 'document.upload',
  ],
  researcher: ['research.access', 'research.export'],
  read_only: ['patient.read', 'clinical.read', 'document.read'],
};

/** Roles a clinic membership may hold (super_admin is global only). */
export const CLINIC_ROLES: Role[] = ROLES.filter((r) => r !== 'super_admin');

/** Roles a clinic administrator may assign (clinic_admin requires super admin). */
export function assignableRoles(isSuperAdmin: boolean): Role[] {
  return isSuperAdmin ? CLINIC_ROLES : CLINIC_ROLES.filter((r) => r !== 'clinic_admin');
}

export function roleHas(role: Role, perm: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(perm);
}

import type { Permission } from './permissions';
import type { AccessGrant, MyAccess, Patient, Specialty } from '@/data/types';

/** Does the user hold `perm` in a specific clinic? */
export function hasPermission(access: MyAccess | null, perm: Permission, clinicId?: string | null): boolean {
  if (!access || !access.is_active) return false;
  if (access.is_super_admin) return true;
  return access.memberships.some(
    (m) => (clinicId == null || m.clinic_id === clinicId) && m.permissions.includes(perm),
  );
}

/** Does the user hold `perm` in any clinic? */
export function hasPermissionAnywhere(access: MyAccess | null, perm: Permission): boolean {
  return hasPermission(access, perm, null);
}

/**
 * Specialty scope (mirror of private.scope_allows): a membership limited to some
 * specialties reaches a patient only when their specialties overlap. Patients
 * without specialties (new registrations) are within everyone's scope.
 */
export function scopeAllows(access: MyAccess | null, clinicId: string, specialties: readonly Specialty[] | undefined): boolean {
  if (!access) return false;
  if (access.is_super_admin) return true;
  return access.memberships.some((m) => m.clinic_id === clinicId
    && (m.specialties == null || !specialties?.length || specialties.some((s) => m.specialties!.includes(s))));
}

/** Specialties the user can work in (null = all). */
export function specialtyScope(access: MyAccess | null): Specialty[] | null {
  if (!access || access.is_super_admin || access.memberships.some((m) => m.specialties == null)) return null;
  return [...new Set(access.memberships.flatMap((m) => m.specialties ?? []))];
}

function grantActive(g: AccessGrant, now: Date): boolean {
  return !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > now);
}

/**
 * TypeScript mirror of `private.patient_can()` (migration 0004). Used by the
 * demo backend and for UI gating. Real deployments are enforced by RLS.
 */
export function patientCan(
  access: MyAccess | null,
  patient: Pick<Patient, 'id' | 'clinic_id' | 'visibility' | 'primary_physician_id'> & { specialties?: Specialty[] },
  grants: AccessGrant[],
  perm: Permission,
  now: Date = new Date(),
): boolean {
  if (!access || !access.is_active) return false;
  const uid = access.user_id;
  const isRead = perm.endsWith('.read');
  const isClinic = patient.visibility === 'clinic';

  if (isClinic && access.is_super_admin) return true;
  if (isClinic && hasPermission(access, perm, patient.clinic_id) && scopeAllows(access, patient.clinic_id, patient.specialties)) return true;
  if (patient.primary_physician_id === uid && hasPermissionAnywhere(access, perm)) return true;

  const live = grants.filter((g) => g.patient_id === patient.id && grantActive(g, now));
  if (
    live.some((g) => g.grantee_user_id === uid && (isRead || g.access_level === 'write')) &&
    hasPermissionAnywhere(access, perm)
  ) {
    return true;
  }
  if (
    isClinic &&
    live.some(
      (g) =>
        g.grantee_clinic_id != null &&
        (isRead || g.access_level === 'write') &&
        hasPermission(access, perm, g.grantee_clinic_id) &&
        scopeAllows(access, g.grantee_clinic_id, patient.specialties),
    )
  ) {
    return true;
  }
  return false;
}

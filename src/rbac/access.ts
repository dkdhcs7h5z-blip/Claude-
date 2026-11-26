import type { Permission } from './permissions';
import type { AccessGrant, MyAccess, Patient } from '@/data/types';

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

function grantActive(g: AccessGrant, now: Date): boolean {
  return !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > now);
}

/**
 * TypeScript mirror of `private.patient_can()` (migration 0004). Used by the
 * demo backend and for UI gating. Real deployments are enforced by RLS.
 */
export function patientCan(
  access: MyAccess | null,
  patient: Pick<Patient, 'id' | 'clinic_id' | 'visibility' | 'primary_physician_id'>,
  grants: AccessGrant[],
  perm: Permission,
  now: Date = new Date(),
): boolean {
  if (!access || !access.is_active) return false;
  const uid = access.user_id;
  const isRead = perm.endsWith('.read');
  const isClinic = patient.visibility === 'clinic';

  if (isClinic && access.is_super_admin) return true;
  if (isClinic && hasPermission(access, perm, patient.clinic_id)) return true;
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
        hasPermission(access, perm, g.grantee_clinic_id),
    )
  ) {
    return true;
  }
  return false;
}

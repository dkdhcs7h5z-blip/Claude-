import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PERMISSIONS, ROLE_PERMISSIONS, ROLES, type Role } from './permissions';
import { patientCan } from './access';
import type { AccessGrant, MyAccess } from '@/data/types';

const SQL = readFileSync(resolve(__dirname, '../../supabase/migrations/20261126000001_core_identity.sql'), 'utf8');

describe('role/permission matrix', () => {
  it('matches the SQL migration exactly', () => {
    const block = SQL.split('-- BEGIN ROLE_PERMISSIONS')[1].split('-- END ROLE_PERMISSIONS')[0];
    const fromSql: Record<string, string[]> = {};
    for (const [, role, perm] of block.matchAll(/\('([a-z_]+)',\s*'([a-z]+\.[a-z]+)'\)/g)) {
      (fromSql[role] ??= []).push(perm);
    }
    for (const role of ROLES) {
      expect([...(fromSql[role] ?? [])].sort(), role).toEqual([...ROLE_PERMISSIONS[role]].sort());
    }
  });

  it('declares every permission code in the SQL catalog', () => {
    for (const p of PERMISSIONS) expect(SQL).toContain(`('${p}',`);
  });

  it('keeps researchers away from identifiable data', () => {
    expect(ROLE_PERMISSIONS.researcher.some((p) => p.startsWith('patient.') || p.startsWith('clinical.'))).toBe(false);
  });

  it('keeps clinic administrators away from clinical content', () => {
    expect(ROLE_PERMISSIONS.clinic_admin.some((p) => p.startsWith('clinical.'))).toBe(false);
  });

  it('only lets senior clinicians sign', () => {
    const signers = ROLES.filter((r) => ROLE_PERMISSIONS[r].includes('clinical.sign'));
    expect(signers.sort()).toEqual(['consultant', 'specialist', 'super_admin']);
  });
});

describe('patientCan (mirror of private.patient_can)', () => {
  const access = (role: Role, clinic = 'A', uid = 'me', superAdmin = false): MyAccess => ({
    user_id: uid, is_super_admin: superAdmin, is_active: true,
    memberships: role === 'super_admin' ? [] : [{
      clinic_id: clinic, clinic_code: clinic, clinic_name_en: clinic, clinic_name_ar: clinic, role,
      permissions: [...ROLE_PERMISSIONS[role]],
    }],
  });
  const clinicPatient = { id: 'p', clinic_id: 'A', visibility: 'clinic' as const, primary_physician_id: null };
  const privatePatient = { id: 'p', clinic_id: 'A', visibility: 'private' as const, primary_physician_id: 'doc' };
  const grant = (g: Partial<AccessGrant>): AccessGrant => ({
    id: 'g', patient_id: 'p', grantee_user_id: null, grantee_clinic_id: null, access_level: 'read', reason: null,
    is_emergency: false, granted_by: 'doc', granted_at: '', expires_at: null, revoked_at: null, ...g,
  });

  it('allows same-clinic staff on clinic records', () => {
    expect(patientCan(access('resident'), clinicPatient, [], 'clinical.read')).toBe(true);
    expect(patientCan(access('resident', 'B'), clinicPatient, [], 'patient.read')).toBe(false);
  });

  it('hides private records from colleagues and super admins', () => {
    expect(patientCan(access('consultant'), privatePatient, [], 'patient.read')).toBe(false);
    expect(patientCan(access('super_admin', 'A', 'me', true), privatePatient, [], 'patient.read')).toBe(false);
    expect(patientCan(access('consultant', 'B', 'doc'), privatePatient, [], 'clinical.write')).toBe(true);
  });

  it('honours user grants with read/write levels and expiry', () => {
    const g = [grant({ grantee_user_id: 'me' })];
    expect(patientCan(access('consultant', 'B'), privatePatient, g, 'clinical.read')).toBe(true);
    expect(patientCan(access('consultant', 'B'), privatePatient, g, 'clinical.write')).toBe(false);
    const expired = [grant({ grantee_user_id: 'me', expires_at: '2000-01-01T00:00:00Z' })];
    expect(patientCan(access('consultant', 'B'), privatePatient, expired, 'clinical.read')).toBe(false);
    const revoked = [grant({ grantee_user_id: 'me', revoked_at: '2026-01-01T00:00:00Z' })];
    expect(patientCan(access('consultant', 'B'), privatePatient, revoked, 'clinical.read')).toBe(false);
  });

  it('applies clinic grants only to clinic-visibility records', () => {
    const g = [grant({ grantee_clinic_id: 'B' })];
    expect(patientCan(access('specialist', 'B'), clinicPatient, g, 'clinical.read')).toBe(true);
    expect(patientCan(access('specialist', 'B'), privatePatient, g, 'clinical.read')).toBe(false);
  });

  it('still requires the role permission on a grant', () => {
    const g = [grant({ grantee_user_id: 'me', access_level: 'write' })];
    expect(patientCan(access('researcher', 'B'), privatePatient, g, 'patient.read')).toBe(false);
  });
});

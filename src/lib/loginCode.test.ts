import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, effectivePermissions, formatCodeInput, isCompleteCode, normaliseCode, permissionOverrides, randomCodePart } from './loginCode';

describe('login codes', () => {
  it('formats while typing', () => {
    expect(formatCodeInput('k7qm2xhp')).toBe('K7QM-2XHP');
    expect(formatCodeInput('K7QM-2XHP-9RTD-4WBN-EXTRA')).toBe('K7QM-2XHP-9RTD-4WBN');
  });
  it('normalises and validates', () => {
    expect(normaliseCode(' k7qm 2xhp-9rtd-4wbn ')).toBe('K7QM2XHP9RTD4WBN');
    expect(isCompleteCode('K7QM-2XHP-9RTD-4WBN')).toBe(true);
    expect(isCompleteCode('K7QM-2XHP-9RTD')).toBe(false);
    expect(isCompleteCode('K7QM-2XHP-9RTD-4WB0')).toBe(false); // 0 is not in the alphabet
  });
  it('generates from the alphabet only', () => {
    const s = randomCodePart(400);
    expect(s).toHaveLength(400);
    expect(/^[2-9A-HJKMNP-Z]+$/.test(s)).toBe(true);
  });
  it('effective permissions and overrides round-trip', () => {
    const eff = effectivePermissions('nurse', ['clinical.sign'], ['patient.create']);
    expect(eff).toContain('clinical.sign');
    expect(eff).not.toContain('patient.create');
    expect(permissionOverrides('nurse', eff)).toEqual({ granted: ['clinical.sign'], revoked: ['patient.create'] });
    expect(permissionOverrides('nurse', effectivePermissions('nurse'))).toEqual({ granted: [], revoked: [] });
  });
});

describe('server copies stay in sync', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(__dirname, '../..', p), 'utf8') as string;
  const helpers = (src: string) => src.slice(src.indexOf('// --- login-code helpers'), src.indexOf('// --- end helpers ---'));
  it('both edge functions carry identical helpers with the same alphabet', () => {
    const a = helpers(read('supabase/functions/code-login/index.ts'));
    const b = helpers(read('supabase/functions/staff-admin/index.ts'));
    expect(a.length).toBeGreaterThan(100);
    expect(a).toBe(b);
    expect(a).toContain(`const ALPHABET = '${CODE_ALPHABET}'`);
  });
  it('supabase/setup.sql matches the migrations (run npm run db:bundle)', async () => {
    // @ts-expect-error plain JS module
    const { bundle } = await import('../../scripts/bundle-sql.mjs');
    expect(read('supabase/setup.sql')).toBe(bundle(require('node:path').join(__dirname, '../../supabase/migrations')));
  });
});

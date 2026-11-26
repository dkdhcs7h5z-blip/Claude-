/**
 * Staff login codes — format helpers (mirrors supabase/functions/_shared/codes.ts).
 *
 *   HHHH-SSSS-SSSS-SSSS   HHHH = public handle, 12-character secret
 *   Alphabet without look-alikes (no 0, 1, I, L, O).
 */
import type { Permission, Role } from '@/rbac/permissions';
import { ROLE_PERMISSIONS } from '@/rbac/permissions';

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 16;

/** Uppercase and strip separators/spaces. */
export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/** Formats partial input as HHHH-SSSS-SSSS-SSSS while typing. */
export function formatCodeInput(input: string): string {
  const raw = input.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, CODE_LENGTH);
  return raw.match(/.{1,4}/g)?.join('-') ?? '';
}

export const isCompleteCode = (input: string) => {
  const c = normaliseCode(input);
  return c.length === CODE_LENGTH && [...c].every((ch) => CODE_ALPHABET.includes(ch));
};

export function randomCodePart(length: number): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    if (buf[0] < 248) out.push(CODE_ALPHABET[buf[0] % CODE_ALPHABET.length]);
  }
  return out.join('');
}

export const formatCode = (handle: string, secret: string) => formatCodeInput(handle + secret);

/** Role permissions ∪ granted − revoked (mirrors private.effective_permissions). */
export function effectivePermissions(role: Role, granted: readonly string[] = [], revoked: readonly string[] = []): Permission[] {
  const set = new Set<string>([...ROLE_PERMISSIONS[role], ...granted]);
  for (const r of revoked) set.delete(r);
  return [...set].sort() as Permission[];
}

/** Splits a chosen permission set into overrides relative to the role. */
export function permissionOverrides(role: Role, chosen: readonly string[]): { granted: Permission[]; revoked: Permission[] } {
  const base = new Set<string>(ROLE_PERMISSIONS[role]);
  const pick = new Set(chosen);
  return {
    granted: [...pick].filter((p) => !base.has(p)).sort() as Permission[],
    revoked: [...base].filter((p) => !pick.has(p)).sort() as Permission[],
  };
}

export const ADMIN_PERMISSIONS: Permission[] = ['admin.users', 'admin.clinic', 'audit.read'];

// Supabase Edge Function: staff-admin
// Creates code-only staff accounts and issues new login codes.
//
//   { action: "create", full_name_en?, full_name_ar?, title?, clinic_id, role,
//     granted_permissions?, revoked_permissions?, specialties? }   → { user_id, code }
//   { action: "reset_code", user_id }                               → { code }
//   { action: "bootstrap", setup_secret, full_name_en?, full_name_ar?,
//     clinic_code, clinic_name_en, clinic_name_ar? }                → { user_id, code }
//
// Security model
//   * create / reset_code: the caller's JWT is forwarded and get_my_access() is
//     evaluated AS THE CALLER; the service role is used only after the same
//     checks the database applies (admin.users in the clinic; clinic_admin role
//     and administrative permissions only by super administrators).
//   * reset_code: yourself, a super administrator, or an admin of a clinic the
//     person belongs to. Other sessions of that person are ended.
//   * bootstrap: only while no super administrator exists, and only with the
//     SETUP_SECRET function secret (≥ 12 characters).
//   * The code is returned once and never stored in clear.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

// --- login-code helpers (identical in code-login and staff-admin; keep in sync with src/lib/loginCode.ts) ---
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomString(length: number): string {
  const out: string[] = [];
  const buf = new Uint8Array(1);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    // rejection sampling keeps the distribution uniform
    if (buf[0] < 248) out.push(ALPHABET[buf[0] % ALPHABET.length]);
  }
  return out.join('');
}

function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function formatCode(handle: string, secret: string): string {
  return [handle, secret.slice(0, 4), secret.slice(4, 8), secret.slice(8, 12)].join('-');
}

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Synthetic, never-emailed address that backs a code-only account. */
const staffEmail = (handle: string) => `${handle.toLowerCase()}@${Deno.env.get('STAFF_EMAIL_DOMAIN') ?? 'staff.whrmis.invalid'}`;
// --- end helpers ---

const ROLES = ['clinic_admin', 'consultant', 'specialist', 'resident', 'nurse', 'researcher', 'read_only'];
const PERMISSIONS = ['patient.read', 'patient.create', 'patient.update', 'patient.delete', 'patient.share', 'clinical.read', 'clinical.write',
  'clinical.sign', 'document.read', 'document.upload', 'document.delete', 'research.access', 'research.manage', 'research.export',
  'admin.users', 'admin.clinic', 'audit.read'];
const ADMIN_PERMISSIONS = ['admin.users', 'admin.clinic', 'audit.read'];
const SPECIALTIES = ['obstetrics', 'gynecology', 'infertility', 'fetal_medicine'];

interface Access { user_id: string; is_super_admin: boolean; memberships: Array<{ clinic_id: string; permissions: string[] }> }

async function uniqueHandle(admin: SupabaseClient): Promise<string> {
  for (let i = 0; i < 25; i++) {
    const h = randomString(4);
    const { data } = await admin.from('profiles').select('id').eq('login_handle', h).maybeSingle();
    if (!data) return h;
  }
  throw new Error('Could not allocate a login handle');
}

function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const list = (v: unknown, allowed: string[]): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === 'string' && allowed.includes(x)) ? [...new Set(v as string[])] : null;

/** Creates the auth user + profile for a code-only account. */
async function createAccount(admin: SupabaseClient, names: { full_name_en?: string; full_name_ar?: string; title?: string }) {
  const handle = await uniqueHandle(admin);
  const secret = randomString(12);
  const { data, error } = await admin.auth.admin.createUser({
    email: staffEmail(handle), password: secret, email_confirm: true,
    user_metadata: { full_name_en: names.full_name_en ?? null, full_name_ar: names.full_name_ar ?? null },
  });
  if (error || !data.user) throw new Error(error?.message ?? 'Could not create the account');
  const { error: pErr } = await admin.from('profiles').update({
    login_handle: handle, code_issued_at: new Date().toISOString(), email: null,
    full_name_en: names.full_name_en?.trim() || null, full_name_ar: names.full_name_ar?.trim() || null, title: names.title?.trim() || null,
  }).eq('id', data.user.id);
  if (pErr) { await admin.auth.admin.deleteUser(data.user.id); throw new Error(pErr.message); }
  return { userId: data.user.id, code: formatCode(handle, secret) };
}

function sessionIdOf(authHeader: string): string | null {
  try {
    const payload = JSON.parse(atob(authHeader.replace(/^Bearer\s+/i, '').split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.session_id === 'string' ? payload.session_id : null;
  } catch { return null; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const str = (k: string) => (typeof body[k] === 'string' ? (body[k] as string) : undefined);

  try {
    // --- first-run owner account --------------------------------------------
    if (body.action === 'bootstrap') {
      const expected = Deno.env.get('SETUP_SECRET') ?? '';
      if (expected.length < 12 || !timingSafeEqual(str('setup_secret') ?? '', expected)) return json({ error: 'Invalid setup secret' }, 403);
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true }).eq('is_super_admin', true);
      if ((count ?? 0) > 0) return json({ error: 'Setup has already been completed' }, 409);
      const clinicCode = (str('clinic_code') ?? '').trim().toUpperCase();
      const clinicName = (str('clinic_name_en') ?? '').trim();
      if (!/^[A-Z0-9-]{2,12}$/.test(clinicCode) || !clinicName) return json({ error: 'Enter a clinic code (2–12 letters/digits) and name' }, 400);
      if (!str('full_name_en')?.trim() && !str('full_name_ar')?.trim()) return json({ error: 'Enter your name' }, 400);
      const { userId, code } = await createAccount(admin, { full_name_en: str('full_name_en'), full_name_ar: str('full_name_ar'), title: str('title') });
      await admin.from('profiles').update({ is_super_admin: true }).eq('id', userId);
      const { data: existing } = await admin.from('clinics').select('id').eq('code', clinicCode).maybeSingle();
      if (!existing) await admin.from('clinics').insert({ code: clinicCode, name_en: clinicName, name_ar: str('clinic_name_ar')?.trim() || clinicName });
      await admin.from('audit_log').insert({ actor_id: userId, action: 'CODE_ISSUED', context: { via: 'staff-admin', kind: 'bootstrap' } });
      return json({ user_id: userId, code });
    }

    // --- authenticated actions ------------------------------------------------
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Not authenticated' }, 401);
    const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: accessData, error: accessErr } = await asCaller.rpc('get_my_access');
    const access = accessData as Access | null;
    if (accessErr || !access?.user_id) return json({ error: 'Not authenticated' }, 401);
    const isSuper = access.is_super_admin === true;
    const adminOf = (clinicId: string) => isSuper || access.memberships.some((m) => m.clinic_id === clinicId && m.permissions.includes('admin.users'));

    if (body.action === 'create') {
      const clinicId = str('clinic_id'), role = str('role');
      if (!clinicId || !role || !ROLES.includes(role)) return json({ error: 'Choose a clinic and role' }, 400);
      if (!adminOf(clinicId)) return json({ error: 'Forbidden' }, 403);
      if (role === 'clinic_admin' && !isSuper) return json({ error: 'Only super administrators can appoint clinic administrators' }, 403);
      const granted = list(body.granted_permissions ?? [], PERMISSIONS), revoked = list(body.revoked_permissions ?? [], PERMISSIONS);
      if (!granted || !revoked || granted.some((p) => revoked.includes(p))) return json({ error: 'Invalid permissions' }, 400);
      if (!isSuper && granted.some((p) => ADMIN_PERMISSIONS.includes(p))) return json({ error: 'Only super administrators can grant administrative permissions' }, 403);
      const specialties = body.specialties == null ? null : list(body.specialties, SPECIALTIES);
      if (body.specialties != null && (!specialties || !specialties.length)) return json({ error: 'Choose at least one specialty' }, 400);
      if (!str('full_name_en')?.trim() && !str('full_name_ar')?.trim()) return json({ error: 'Enter the person’s name' }, 400);

      const { userId, code } = await createAccount(admin, { full_name_en: str('full_name_en'), full_name_ar: str('full_name_ar'), title: str('title') });
      const { error: mErr } = await admin.from('clinic_memberships').insert({
        user_id: userId, clinic_id: clinicId, role, granted_permissions: granted, revoked_permissions: revoked, specialties,
        is_active: true, granted_by: access.user_id,
      });
      if (mErr) { await admin.auth.admin.deleteUser(userId); return json({ error: mErr.message }, 400); }
      await admin.from('audit_log').insert({
        actor_id: access.user_id, action: 'CODE_ISSUED', table_name: 'clinic_memberships', clinic_id: clinicId,
        context: { via: 'staff-admin', kind: 'create', target_user_id: userId, role, granted, revoked, specialties },
      });
      return json({ user_id: userId, code });
    }

    if (body.action === 'reset_code') {
      const target = str('user_id');
      if (!target) return json({ error: 'Missing user' }, 400);
      const self = target === access.user_id;
      const { data: prof } = await admin.from('profiles').select('id, login_handle, is_super_admin').eq('id', target).maybeSingle();
      if (!prof) return json({ error: 'User not found' }, 404);
      let allowed = self || isSuper;
      if (!allowed && !prof.is_super_admin) {
        const { data: ms } = await admin.from('clinic_memberships').select('clinic_id, role').eq('user_id', target);
        allowed = (ms ?? []).some((m) => adminOf(m.clinic_id) && m.role !== 'clinic_admin');
      }
      if (!allowed) return json({ error: 'Forbidden' }, 403);
      const handle = prof.login_handle ?? await uniqueHandle(admin);
      const secret = randomString(12);
      const { error } = await admin.auth.admin.updateUserById(target, { password: secret });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').update({ login_handle: handle, code_issued_at: new Date().toISOString() }).eq('id', target);
      await admin.rpc('admin_revoke_sessions', { p_user: target, p_keep: self ? sessionIdOf(authHeader) : null });
      await admin.from('audit_log').insert({ actor_id: access.user_id, action: 'CODE_ISSUED', context: { via: 'staff-admin', kind: 'reset', target_user_id: target } });
      return json({ code: formatCode(handle, secret) });
    }

    return json({ error: 'Unknown action' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

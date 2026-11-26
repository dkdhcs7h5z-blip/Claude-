// Supabase Edge Function: code-login  (deploy with --no-verify-jwt)
// Exchanges a staff login code for a Supabase session.
//
//   POST { code: "HHHH-SSSS-SSSS-SSSS" }  →  { access_token, refresh_token }
//
// * The handle selects the account; the secret is checked by Supabase Auth as
//   the account's password (bcrypt), so codes are never stored in clear.
// * 5 consecutive failures lock the handle for 15 minutes (code_login_record).
// * Every success and failure is written to the audit log.
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: { code?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
  const code = normaliseCode(body.code ?? '');
  if (code.length !== 16) return json({ error: 'invalid_format' }, 400);
  const handle = code.slice(0, 4);
  const secret = code.slice(4);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { auth: { persistSession: false } });
  const context = { ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null, agent: req.headers.get('user-agent') };

  const { data: rows, error: lookupErr } = await admin.rpc('code_login_lookup', { p_handle: handle });
  if (lookupErr) return json({ error: 'server_error' }, 500);
  const row = (rows as Array<{ user_id: string | null; email: string | null; is_active: boolean | null; locked_until: string | null }>)[0];
  if (row?.locked_until) return json({ error: 'locked', locked_until: row.locked_until }, 429);

  const fail = async (status = 401) => {
    const { data: until } = await admin.rpc('code_login_record', { p_handle: handle, p_success: false, p_context: context });
    return json(until ? { error: 'locked', locked_until: until } : { error: 'invalid_code' }, until ? 429 : status);
  };
  if (!row?.user_id || !row.email) return fail();
  if (!row.is_active) return json({ error: 'account_disabled' }, 403);

  const { data: session, error } = await anon.auth.signInWithPassword({ email: row.email, password: secret });
  if (error || !session.session) return fail();

  await admin.rpc('code_login_record', { p_handle: handle, p_success: true, p_context: context });
  return json({ access_token: session.session.access_token, refresh_token: session.session.refresh_token });
});

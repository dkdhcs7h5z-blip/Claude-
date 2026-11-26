// Supabase Edge Function: invite-user
// Invites a staff member by email and assigns their clinic role.
//
// Security model
//   * The caller's JWT is forwarded; we call get_my_access() AS THE CALLER and
//     re-check admin.users for the target clinic before using the service role.
//   * Only super administrators may assign the clinic_admin role.
//   * The membership insert runs with the service role, so it is audited with
//     actor_id = null; we therefore write an explicit audit row naming the caller.
//
// Deploy:  supabase functions deploy invite-user
// Secrets: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (provided by the platform)
import { createClient } from 'npm:@supabase/supabase-js@2.119.0';

const ROLES = ['clinic_admin', 'consultant', 'specialist', 'resident', 'nurse', 'researcher', 'read_only'];
const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not authenticated' }, 401);

  let body: { email?: string; clinic_id?: string; role?: string; full_name_en?: string; full_name_ar?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Invalid email' }, 400);
  if (!body.clinic_id || !body.role || !ROLES.includes(body.role)) return json({ error: 'Invalid clinic or role' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // 1. Authorize the caller using the same rules as the database.
  const { data: access, error: accessErr } = await asCaller.rpc('get_my_access');
  if (accessErr || !access) return json({ error: 'Not authenticated' }, 401);
  const isSuper = access.is_super_admin === true;
  const canAdmin = isSuper || (access.memberships as Array<{ clinic_id: string; permissions: string[] }>)
    .some((m) => m.clinic_id === body.clinic_id && m.permissions.includes('admin.users'));
  if (!canAdmin) return json({ error: 'Forbidden' }, 403);
  if (body.role === 'clinic_admin' && !isSuper) return json({ error: 'Only super administrators can appoint clinic administrators' }, 403);

  // 2. Find or invite the user.
  let userId: string | undefined;
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle();
  if (existing) {
    userId = existing.id;
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name_en: body.full_name_en ?? null, full_name_ar: body.full_name_ar ?? null },
    });
    if (error) return json({ error: error.message }, 400);
    userId = data.user?.id;
  }
  if (!userId) return json({ error: 'Could not resolve user' }, 500);
  if (userId === access.user_id) return json({ error: 'You cannot modify your own clinic membership' }, 403);

  // 3. Create or update the membership.
  const { error: mErr } = await admin.from('clinic_memberships').upsert(
    { user_id: userId, clinic_id: body.clinic_id, role: body.role, is_active: true, granted_by: access.user_id },
    { onConflict: 'user_id,clinic_id' },
  );
  if (mErr) return json({ error: mErr.message }, 400);

  // 4. Attribute the change to the caller in the audit log.
  await admin.from('audit_log').insert({
    actor_id: access.user_id, action: 'INSERT', table_name: 'clinic_memberships', clinic_id: body.clinic_id,
    context: { via: 'invite-user', invited_user_id: userId, role: body.role },
  });

  return json({ ok: true, user_id: userId });
});

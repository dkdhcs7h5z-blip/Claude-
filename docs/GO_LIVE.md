# Going live

How to turn the demo into the clinic's real system. Everything can be done from a browser (an iPad works).
Allow about 30 minutes. You need: this GitHub repository, a Supabase account, and a Vercel or Netlify site.

> **Patient data.** Until step 7 the system is empty. Enter real patients only after the backup routine in step 8 is in place.

## 1. Create the database project (Supabase)

1. Go to **supabase.com** → **Sign in → Continue with GitHub**.
2. **New project**
   - Name: `whrmis` · Region: **Central EU (Frankfurt)** · Plan: Free (upgrade later for automatic backups)
   - Database password: let Supabase generate one and store it in your password manager.
3. Wait until the project says **Healthy** (1–2 minutes).

## 2. Load the tables and security rules

1. Open **SQL Editor → New query**.
2. Open [`supabase/setup.sql`](../supabase/setup.sql) on GitHub → **Raw**, select all, copy.
3. Paste into the SQL editor → **Run**. It should finish with "Success. No rows returned".
   Run it **once**, on a new project only.

## 3. Lock down sign-in

**Authentication → Sign In / Providers**:
- **Allow new users to sign up: OFF** (accounts are created only from Staff & Roles)
- Email provider can stay enabled: the system uses it internally for code accounts. No emails are sent.
- Leave the password requirements at their default (codes use capital letters and digits).

## 4. Add the two server functions

**Edge Functions → Deploy a new function → Via Editor**, twice:

| Function name | Paste the contents of | Then |
|---|---|---|
| `code-login` | [`supabase/functions/code-login/index.ts`](../supabase/functions/code-login/index.ts) | Details → **Enforce JWT verification: OFF** |
| `staff-admin` | [`supabase/functions/staff-admin/index.ts`](../supabase/functions/staff-admin/index.ts) | Details → **Enforce JWT verification: OFF** (it checks the caller itself) |

Then **Edge Functions → Secrets → Add**:

| Name | Value |
|---|---|
| `SETUP_SECRET` | a long random phrase only you know (≥ 12 characters), e.g. from your password manager |
| `ALLOWED_ORIGIN` | your site address from step 5, e.g. `https://womens-health-emr.vercel.app` |

## 5. Connect the website

In **Supabase → Project Settings → API** copy the **Project URL** and the **anon / publishable key**.
In **Vercel** (Project → Settings → Environment Variables) or **Netlify** (Site configuration → Environment variables) add:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon key (safe to publish; the database rules protect the data) |

Redeploy the site. The login page now asks only for a **login code** and the "Demo mode" badge disappears.

## 6. Create your owner account

1. On the login page tap **First-time setup** (small link under the form).
2. Enter the `SETUP_SECRET`, your name, and the first clinic (code e.g. `MAIN`, name).
3. Your **owner login code** is shown once: copy it into your password manager.
4. Sign in with it. Setup cannot be run again once an owner exists.

## 7. Add your team

**Staff & Roles → Add team member**: name, role, which **specialties** they may see, and fine-tuned **permissions**.
The person's login code is shown once: give it to them privately (in person, or an encrypted message).

- **New code**: if a code is lost or may have been seen, the old one stops working and the person is signed out.
- **Deactivate**: removes all access immediately.
- **Edit access**: change role, permissions or specialties at any time; changes apply on their next page load.
- Five wrong codes lock that account's code for 15 minutes; every attempt is in the **Audit Log**.

## 8. Backups

| Plan | What protects the data |
|---|---|
| Free | **Settings → Backup → Export all data** (owner only) downloads one file with every record (not uploaded document files). Do it **weekly**, and store the file encrypted (e.g. in a password-protected archive). Free projects also **pause after a week without use**: open the site regularly or upgrade. |
| Pro (about $25/month) | Daily automatic backups kept 7 days, restorable from **Database → Backups**; add Point-in-Time Recovery for minute-level restores. Recommended before relying on the system for patient care. |

## Checklist before real patients

- [ ] Sign-ups disabled (step 3) · [ ] both functions deployed with secrets (step 4)
- [ ] Owner code stored in a password manager · [ ] first backup exported and opened once to check it
- [ ] Team codes delivered privately · [ ] Data-protection requirements of your country reviewed (consent, retention, region)

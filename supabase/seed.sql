-- Development seed (applied by `supabase db reset`). Contains NO patient data.
-- Creates two clinics. Users are created via Auth (invite or dashboard); then
-- promote your first account to super administrator:
--
--   update public.profiles set is_super_admin = true where email = 'you@example.org';
--
-- and assign clinic roles from the Staff & Roles page (or SQL):
--
--   insert into public.clinic_memberships (user_id, clinic_id, role)
--   select p.id, c.id, 'consultant' from public.profiles p, public.clinics c
--   where p.email = 'doctor@example.org' and c.code = 'MAIN';

insert into public.clinics (code, name_en, name_ar) values
  ('MAIN', 'Main Women''s Health Center', 'مركز صحة المرأة الرئيسي'),
  ('IVF',  'Reproductive & Fetal Medicine Unit', 'وحدة الطب التناسلي وطب الأجنة')
on conflict (code) do nothing;

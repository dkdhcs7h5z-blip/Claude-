import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { KeyRound, Pencil, UserPlus } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { CodeReveal } from '@/auth/CodeReveal';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { PERMISSIONS, ROLE_PERMISSIONS, assignableRoles, type Permission, type Role } from '@/rbac/permissions';
import { ADMIN_PERMISSIONS, effectivePermissions, permissionOverrides } from '@/lib/loginCode';
import type { Specialty, StaffMember } from '@/data/types';
import { clinicName, formatDate, profileName } from '@/lib/format';
import { useClinics, useLang } from '@/lib/queries';

const SPECIALTIES: Specialty[] = ['obstetrics', 'gynecology', 'infertility', 'fetal_medicine'];
const GROUPS = ['patient', 'clinical', 'document', 'research', 'admin', 'audit'] as const;

interface AccessState { role: Role; chosen: Permission[]; limit: boolean; specialties: Specialty[] }

/** Role, individual permissions and specialty scope for one membership. */
function AccessEditor({ value, onChange, roles, isSuperAdmin }: {
  value: AccessState; onChange: (v: AccessState) => void; roles: Role[]; isSuperAdmin: boolean;
}) {
  const { t } = useTranslation();
  const base = new Set<Permission>(ROLE_PERMISSIONS[value.role]);
  const toggle = (p: Permission, on: boolean) =>
    onChange({ ...value, chosen: on ? [...value.chosen, p] : value.chosen.filter((x) => x !== p) });
  return (
    <div className="space-y-4">
      <Field label={t('team.staff.role')} help={t('team.staff.roleHelp')}>
        <Select value={value.role} onChange={(e) => {
          const role = e.target.value as Role;
          onChange({ ...value, role, chosen: [...ROLE_PERMISSIONS[role]] });
        }}>
          {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
        </Select>
      </Field>

      <fieldset className="space-y-2">
        <legend className="label">{t('team.staff.specialties')}</legend>
        <p className="-mt-1 text-xs text-slate-500">{t('team.staff.specialtiesHelp')}</p>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" checked={!value.limit} onChange={() => onChange({ ...value, limit: false })} />{t('team.staff.allSpecialties')}</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" checked={value.limit} onChange={() => onChange({ ...value, limit: true })} />{t('team.staff.someSpecialties')}</label>
        </div>
        {value.limit && (
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
            {SPECIALTIES.map((s) => (
              <Checkbox key={s} label={t(`specialty.${s}`)} checked={value.specialties.includes(s)}
                onChange={(on) => onChange({ ...value, specialties: on ? [...value.specialties, s] : value.specialties.filter((x) => x !== s) })} />
            ))}
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="label">{t('team.staff.permissions')}</legend>
        <p className="-mt-1 text-xs text-slate-500">{t('team.staff.permissionsHelp')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t(`permissionGroups.${g}`)}</p>
              <div className="space-y-1.5">
                {PERMISSIONS.filter((p) => p.startsWith(`${g}.`)).map((p) => {
                  const on = value.chosen.includes(p);
                  const lockedAdmin = ADMIN_PERMISSIONS.includes(p) && !isSuperAdmin && !base.has(p) && !on;
                  const diff = on !== base.has(p);
                  return (
                    <div key={p} className="flex items-center justify-between gap-2">
                      <Checkbox label={t(`permissions.${p}`)} checked={on} disabled={lockedAdmin} onChange={(v) => toggle(p, v)}
                        help={lockedAdmin ? t('team.staff.ownerOnly') : undefined} />
                      {diff && <Badge tone={on ? 'green' : 'amber'}>{on ? t('team.staff.added') : t('team.staff.removed')}</Badge>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

const toPatch = (a: AccessState) => {
  const { granted, revoked } = permissionOverrides(a.role, a.chosen);
  return { role: a.role, granted_permissions: granted, revoked_permissions: revoked, specialties: a.limit ? a.specialties : null };
};
const accessOf = (m: StaffMember): AccessState => ({
  role: m.role, chosen: effectivePermissions(m.role, m.granted_permissions, m.revoked_permissions),
  limit: m.specialties != null, specialties: m.specialties ?? [],
});

export function StaffPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { access, activeClinicId, can, user } = useAuth();
  const clinics = useClinics();
  const clinicById = new Map((clinics.data ?? []).map((c) => [c.id, c]));
  const isSA = !!access?.is_super_admin;
  const roles = assignableRoles(isSA);
  const adminClinics = (clinics.data ?? []).filter((c) => can('admin.users', c.id));

  const staff = useQuery({ queryKey: ['staff', user?.id, activeClinicId], queryFn: () => api.listStaff(activeClinicId) });
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ code: string; name: string } | null>(null);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['staff'] }); void qc.invalidateQueries({ queryKey: ['profiles'] }); };

  // --- create ------------------------------------------------------------------
  const [creating, setCreating] = useState(false);
  const blank = (): AccessState => ({ role: 'resident', chosen: [...ROLE_PERMISSIONS.resident], limit: false, specialties: [] });
  const [person, setPerson] = useState({ full_name_en: '', full_name_ar: '', title: '', clinic_id: '' });
  const [newAccess, setNewAccess] = useState<AccessState>(blank);
  const create = useMutation({
    mutationFn: () => {
      if (!person.full_name_en.trim() && !person.full_name_ar.trim()) throw new Error(t('team.staff.nameRequired'));
      if (newAccess.limit && !newAccess.specialties.length) throw new Error(t('team.staff.chooseSpecialty'));
      return api.createStaffMember({
        full_name_en: person.full_name_en.trim() || null, full_name_ar: person.full_name_ar.trim() || null, title: person.title.trim() || null,
        clinic_id: person.clinic_id || adminClinics[0]?.id, ...toPatch(newAccess),
      });
    },
    onSuccess: (r) => {
      setCreating(false); refresh();
      setIssued({ code: r.code, name: [person.title, lang === 'ar' ? person.full_name_ar || person.full_name_en : person.full_name_en || person.full_name_ar].filter(Boolean).join(' ') });
    },
    onError: (e) => setError((e as Error).message),
  });

  // --- edit ----------------------------------------------------------------------
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editAccess, setEditAccess] = useState<AccessState>(blank);
  const save = useMutation({
    mutationFn: () => {
      if (editAccess.limit && !editAccess.specialties.length) throw new Error(t('team.staff.chooseSpecialty'));
      return api.updateMembership(editing!.membership_id, toPatch(editAccess));
    },
    onSuccess: () => { setEditing(null); setInfo(t('team.staff.saved')); refresh(); },
    onError: (e) => setError((e as Error).message),
  });
  const update = useMutation({
    mutationFn: (v: { id: string; is_active: boolean }) => api.updateMembership(v.id, { is_active: v.is_active }),
    onSuccess: refresh,
    onError: (e) => setError((e as Error).message),
  });
  const reset = useMutation({
    mutationFn: (m: StaffMember) => api.resetLoginCode(m.user_id),
    onSuccess: (code, m) => { setIssued({ code, name: profileName(m.profile, lang) }); refresh(); },
    onError: (e) => setError((e as Error).message),
  });

  const rows = useMemo(() => staff.data ?? [], [staff.data]);

  return (
    <div className="space-y-4">
      <PageHeader title={t('admin.staffTitle')} subtitle={t('admin.staffSubtitle')}
        actions={adminClinics.length > 0 && (
          <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => {
            setError(null); setPerson({ full_name_en: '', full_name_ar: '', title: '', clinic_id: '' }); setNewAccess(blank()); setCreating(true);
          }}>{t('team.staff.add')}</Button>
        )} />
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      <Card bodyClassName="p-0">
        {staff.isLoading ? <Spinner /> : !rows.length ? <EmptyState title={t('common.noResults')} /> : (
          <ul className="divide-y divide-slate-100">
            {rows.map((m) => {
              const self = m.user_id === user?.id;
              const editable = can('admin.users', m.clinic_id) && !self && (isSA || m.role !== 'clinic_admin');
              const custom = m.granted_permissions.length + m.revoked_permissions.length > 0;
              return (
                <li key={m.membership_id} className={clsx('flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5', !m.is_active && 'opacity-60')}>
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-slate-800">
                      {profileName(m.profile, lang)} {self && <Badge tone="brand">{t('admin.self')}</Badge>}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span>{clinicName(clinicById.get(m.clinic_id), lang)}</span>
                      <Badge tone="brand">{t(`roles.${m.role}`)}</Badge>
                      {m.specialties ? m.specialties.map((s) => <Badge key={s} tone="slate">{t(`specialty.${s}`)}</Badge>) : <Badge tone="slate">{t('team.staff.all')}</Badge>}
                      {custom && <Badge tone="amber">{t('team.staff.custom')}</Badge>}
                      <Badge tone={m.is_active ? 'green' : 'slate'}>{m.is_active ? t('common.active') : t('common.inactive')}</Badge>
                    </div>
                    <p className="text-xs text-slate-400">
                      {m.profile.login_handle
                        ? <><span dir="ltr" className="font-mono">{t('team.code.handle', { handle: `${m.profile.login_handle}-••••` })}</span>{m.profile.code_issued_at && ` · ${t('team.code.issued', { date: formatDate(m.profile.code_issued_at, lang) })}`}</>
                        : m.profile.email ? <span dir="ltr">{m.profile.email}</span> : t('team.code.none')}
                    </p>
                  </div>
                  {editable && (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => { setError(null); setEditing(m); setEditAccess(accessOf(m)); }}>{t('team.staff.editAccess')}</Button>
                      <Button size="sm" variant="secondary" icon={<KeyRound className="h-3.5 w-3.5" />} loading={reset.isPending && reset.variables?.user_id === m.user_id}
                        onClick={() => { if (window.confirm(t('team.code.resetConfirm', { name: profileName(m.profile, lang) }))) reset.mutate(m); }}>{t('team.code.reset')}</Button>
                      <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: m.membership_id, is_active: !m.is_active })}>
                        {m.is_active ? t('admin.deactivate') : t('admin.activate')}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal wide open={creating} onClose={() => setCreating(false)} title={t('team.staff.addTitle')}
        footer={<>
          <Button variant="secondary" onClick={() => setCreating(false)}>{t('common.cancel')}</Button>
          <Button loading={create.isPending} icon={<KeyRound className="h-4 w-4" />} onClick={() => { setError(null); create.mutate(); }}>{t('team.staff.create')}</Button>
        </>}>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('team.staff.personTitle')}><Input value={person.title} placeholder="Dr." onChange={(e) => setPerson({ ...person, title: e.target.value })} /></Field>
          <Field label={t('admin.fullNameEn')}><Input dir="ltr" value={person.full_name_en} onChange={(e) => setPerson({ ...person, full_name_en: e.target.value })} /></Field>
          <Field label={t('admin.fullNameAr')}><Input dir="rtl" value={person.full_name_ar} onChange={(e) => setPerson({ ...person, full_name_ar: e.target.value })} /></Field>
        </div>
        {adminClinics.length > 1 && (
          <Field label={t('common.clinic')}>
            <Select value={person.clinic_id || adminClinics[0]?.id || ''} onChange={(e) => setPerson({ ...person, clinic_id: e.target.value })}>
              {adminClinics.map((c) => <option key={c.id} value={c.id}>{clinicName(c, lang)}</option>)}
            </Select>
          </Field>
        )}
        <AccessEditor value={newAccess} onChange={setNewAccess} roles={roles} isSuperAdmin={isSA} />
      </Modal>

      <Modal wide open={!!editing} onClose={() => setEditing(null)} title={editing ? t('team.staff.editTitle', { name: profileName(editing.profile, lang) }) : ''}
        footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>{t('common.cancel')}</Button>
          <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
        </>}>
        {error && <Alert tone="error">{error}</Alert>}
        <AccessEditor value={editAccess} onChange={setEditAccess} roles={roles} isSuperAdmin={isSA} />
      </Modal>

      {issued && <CodeReveal code={issued.code} title={t('team.code.titleFor', { name: issued.name })} onClose={() => setIssued(null)} />}
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '@/components/ui';
import { assignableRoles, type Role } from '@/rbac/permissions';
import { clinicName, profileName } from '@/lib/format';
import { useClinics, useLang } from '@/lib/queries';

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
  const update = useMutation({
    mutationFn: (v: { id: string; role?: Role; is_active?: boolean }) => api.updateMembership(v.id, { role: v.role, is_active: v.is_active }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['staff'] }),
    onError: (e) => setError((e as Error).message),
  });

  const [open, setOpen] = useState(false);
  const [inv, setInv] = useState({ email: '', clinic_id: '', role: 'resident' as Role, full_name_en: '', full_name_ar: '' });
  const invite = useMutation({
    mutationFn: () => api.inviteStaff({ ...inv, clinic_id: inv.clinic_id || adminClinics[0]?.id }),
    onSuccess: () => { setOpen(false); setInfo(t('admin.inviteSent')); void qc.invalidateQueries({ queryKey: ['staff'] }); void qc.invalidateQueries({ queryKey: ['profiles'] }); },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t('admin.staffTitle')} subtitle={t('admin.staffSubtitle')}
        actions={adminClinics.length > 0 && <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => { setError(null); setOpen(true); }}>{t('admin.invite')}</Button>} />
      {error && <Alert tone="error">{error}</Alert>}
      {info && <Alert tone="success">{info}</Alert>}

      <Card bodyClassName="p-0">
        {staff.isLoading ? <Spinner /> : !staff.data?.length ? <EmptyState title={t('common.noResults')} /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-th">{t('common.user')}</th>
                  <th className="table-th">{t('common.clinic')}</th>
                  <th className="table-th">{t('common.role')}</th>
                  <th className="table-th">{t('common.status')}</th>
                  <th className="table-th">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.data.map((m) => {
                  const self = m.user_id === user?.id;
                  const editable = can('admin.users', m.clinic_id) && !self && (isSA || m.role !== 'clinic_admin');
                  return (
                    <tr key={m.membership_id}>
                      <td className="table-td">
                        <p className="font-medium text-slate-800">{profileName(m.profile, lang)} {self && <Badge tone="brand">{t('admin.self')}</Badge>}</p>
                        <p className="text-xs text-slate-500" dir="ltr">{m.profile.email}</p>
                      </td>
                      <td className="table-td text-xs">{clinicName(clinicById.get(m.clinic_id), lang)}</td>
                      <td className="table-td">
                        {editable ? (
                          <Select value={m.role} className="py-1 text-xs" onChange={(e) => update.mutate({ id: m.membership_id, role: e.target.value as Role })}>
                            {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
                          </Select>
                        ) : t(`roles.${m.role}`)}
                      </td>
                      <td className="table-td"><Badge tone={m.is_active ? 'green' : 'slate'}>{m.is_active ? t('common.active') : t('common.inactive')}</Badge></td>
                      <td className="table-td">
                        {editable && (
                          <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: m.membership_id, is_active: !m.is_active })}>
                            {m.is_active ? t('admin.deactivate') : t('admin.activate')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('admin.invite')}
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button loading={invite.isPending} disabled={!inv.email} onClick={() => invite.mutate()}>{t('admin.invite')}</Button>
        </>}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={t('auth.email')} required><Input type="email" dir="ltr" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} /></Field>
        <Field label={t('admin.fullNameEn')}><Input dir="ltr" value={inv.full_name_en} onChange={(e) => setInv({ ...inv, full_name_en: e.target.value })} /></Field>
        <Field label={t('admin.fullNameAr')}><Input dir="rtl" value={inv.full_name_ar} onChange={(e) => setInv({ ...inv, full_name_ar: e.target.value })} /></Field>
        <Field label={t('common.clinic')}>
          <Select value={inv.clinic_id || adminClinics[0]?.id || ''} onChange={(e) => setInv({ ...inv, clinic_id: e.target.value })}>
            {adminClinics.map((c) => <option key={c.id} value={c.id}>{clinicName(c, lang)}</option>)}
          </Select>
        </Field>
        <Field label={t('common.role')}>
          <Select value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value as Role })}>
            {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
          </Select>
        </Field>
      </Modal>
    </div>
  );
}

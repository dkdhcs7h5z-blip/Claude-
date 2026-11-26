import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Siren, UserPlus, Building2, User } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Spinner, Textarea } from '@/components/ui';
import type { AccessLevel, Patient } from '@/data/types';
import { clinicName, formatDateTime, profileName } from '@/lib/format';
import { useClinics, useLang, useProfiles } from '@/lib/queries';

export function SharingTab({ patient, canShare }: { patient: Patient; canShare: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: profiles = [], byId } = useProfiles();
  const clinics = useClinics();
  const clinicById = new Map((clinics.data ?? []).map((c) => [c.id, c]));

  const grants = useQuery({ queryKey: ['grants', patient.id], queryFn: () => api.listGrants(patient.id) });
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'user' | 'clinic'>('user');
  const [target, setTarget] = useState('');
  const [level, setLevel] = useState<AccessLevel>('read');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createGrant({
      patient_id: patient.id,
      grantee_user_id: kind === 'user' ? target : null,
      grantee_clinic_id: kind === 'clinic' ? target : null,
      access_level: level, reason: reason || undefined,
      expires_at: expires ? new Date(expires).toISOString() : null,
    }),
    onSuccess: () => { setOpen(false); setTarget(''); setReason(''); setExpires(''); void qc.invalidateQueries({ queryKey: ['grants', patient.id] }); },
    onError: (e) => setError((e as Error).message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeGrant(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['grants', patient.id] }),
    onError: (e) => setError((e as Error).message),
  });

  const now = new Date();
  const list = grants.data ?? [];

  return (
    <div className="space-y-4">
      {error && <Alert tone="error">{error}</Alert>}
      <Card title={t('sharing.howAccessWorks')}>
        <ul className="list-disc space-y-1 ps-5 text-sm text-slate-600">
          {(t('sharing.rules', { returnObjects: true }) as string[]).map((r) => <li key={r}>{r}</li>)}
        </ul>
      </Card>

      <Card title={t('sharing.grants')} bodyClassName="p-0"
        actions={canShare && <Button size="sm" icon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => { setError(null); setOpen(true); }}>{t('sharing.grant')}</Button>}>
        {grants.isLoading ? <Spinner /> : !list.length ? <EmptyState title={t('sharing.none')} /> : (
          <ul className="divide-y divide-slate-100">
            {list.map((g) => {
              const expired = g.expires_at && new Date(g.expires_at) <= now;
              const inactive = !!g.revoked_at || !!expired;
              return (
                <li key={g.id} className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${inactive ? 'opacity-60' : ''}`}>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      {g.grantee_user_id ? <User className="h-4 w-4 text-slate-400" /> : <Building2 className="h-4 w-4 text-slate-400" />}
                      {g.grantee_user_id ? profileName(byId.get(g.grantee_user_id), lang) : clinicName(clinicById.get(g.grantee_clinic_id!), lang)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {g.reason && <>{g.reason} · </>}
                      {t('sharing.expires')}: {g.expires_at ? formatDateTime(g.expires_at, lang) : t('sharing.never')}
                      {g.granted_by && <> · {profileName(byId.get(g.granted_by), lang)}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {g.is_emergency && <Badge tone="red" icon={<Siren className="h-3 w-3" />}>{t('sharing.emergency')}</Badge>}
                    <Badge tone={g.access_level === 'write' ? 'brand' : 'slate'}>{t(`sharing.${g.access_level}`)}</Badge>
                    {g.revoked_at ? <Badge>{t('sharing.revoked')}</Badge> : !expired && (canShare || g.granted_by === user?.id) && !g.is_emergency && (
                      <Button size="sm" variant="ghost" onClick={() => revoke.mutate(g.id)}>{t('sharing.revoke')}</Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title={t('sharing.grant')}
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button loading={create.isPending} disabled={!target} onClick={() => create.mutate()}>{t('sharing.grant')}</Button>
        </>}>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={t('sharing.grantee')}>
          <Select value={kind} onChange={(e) => { setKind(e.target.value as 'user' | 'clinic'); setTarget(''); }}>
            <option value="user">{t('sharing.toUser')}</option>
            {patient.visibility === 'clinic' && <option value="clinic">{t('sharing.toClinic')}</option>}
          </Select>
        </Field>
        <Field label={kind === 'user' ? t('common.user') : t('common.clinic')} required>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">—</option>
            {kind === 'user'
              ? profiles.filter((p) => p.id !== user?.id && p.is_active).map((p) => <option key={p.id} value={p.id}>{profileName(p, lang)}</option>)
              : (clinics.data ?? []).filter((c) => c.id !== patient.clinic_id).map((c) => <option key={c.id} value={c.id}>{clinicName(c, lang)}</option>)}
          </Select>
        </Field>
        <Field label={t('sharing.level')}>
          <Select value={level} onChange={(e) => setLevel(e.target.value as AccessLevel)}>
            <option value="read">{t('sharing.read')}</option>
            <option value="write">{t('sharing.write')}</option>
          </Select>
        </Field>
        <Field label={t('common.reason')}><Input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        <Field label={t('sharing.expires')} help={t('common.optional')}>
          <Input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} dir="ltr" />
        </Field>
      </Modal>
    </div>
  );
}

export function EmergencyAccessButton({ patientId, onGranted }: { patientId: string; onGranted: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [hours, setHours] = useState(4);
  const [error, setError] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: () => api.requestEmergencyAccess(patientId, reason, hours),
    onSuccess: () => { setOpen(false); onGranted(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <>
      <Button variant="danger" icon={<Siren className="h-4 w-4" />} onClick={() => setOpen(true)}>{t('patients.requestEmergency')}</Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('sharing.emergencyTitle')}
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" loading={m.isPending} disabled={reason.trim().length < 15} onClick={() => m.mutate()}>{t('common.confirm')}</Button>
        </>}>
        <Alert tone="warning">{t('sharing.emergencyHelp')}</Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={t('sharing.emergencyReason')} required>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={15} />
        </Field>
        <Field label={t('sharing.hours')}>
          <Select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {[1, 2, 4, 8, 12, 24].map((h) => <option key={h} value={h}>{h}</option>)}
          </Select>
        </Field>
      </Modal>
    </>
  );
}

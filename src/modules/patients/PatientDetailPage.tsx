import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Archive, ArrowLeft, Lock, Pencil, ShieldAlert, Droplet } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, EmptyState, Spinner, Tabs } from '@/components/ui';
import { SPECIALTY_TONE } from '@/modules/registry';
import { patientCan } from '@/rbac/access';
import type { Permission } from '@/rbac/permissions';
import type { Patient, Specialty } from '@/data/types';
import { ageInYears } from '@/clinical/obstetrics';
import { clinicName, formatDate, patientName, profileName } from '@/lib/format';
import { useClinics, useLang, useProfiles } from '@/lib/queries';
import { CyclesPanel, EncountersPanel, FetalPanel, PregnanciesPanel, PregnancyCard } from './ClinicalPanels';
import { DocumentsTab } from './DocumentsTab';
import { EmergencyAccessButton, SharingTab } from './SharingTab';
import { AuditTable } from '@/modules/admin/AuditTable';

type TabId = 'overview' | Specialty | 'documents' | 'sharing' | 'audit';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-end font-medium text-slate-800">{value || '—'}</dd>
    </div>
  );
}

function Demographics({ p }: { p: Patient }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { byId } = useProfiles();
  return (
    <Card title={t('patients.demographics')}>
      <dl className="divide-y divide-slate-100">
        <Row label={t('patients.dob')} value={formatDate(p.date_of_birth, lang)} />
        <Row label={t('patients.nationalId')} value={p.national_id && <span className="ltr-num">{p.national_id}</span>} />
        <Row label={t('patients.phone')} value={p.phone && <span className="ltr-num">{p.phone}</span>} />
        <Row label={t('patients.email')} value={p.email} />
        <Row label={t('patients.maritalStatus')} value={p.marital_status && t(`patients.marital.${p.marital_status}`)} />
        <Row label={t('patients.nationality')} value={p.nationality} />
        <Row label={t('patients.emergencyName')} value={p.emergency_contact_name && <>{p.emergency_contact_name} <span className="ltr-num">{p.emergency_contact_phone}</span></>} />
        <Row label={t('patients.primaryPhysician')} value={p.primary_physician_id && profileName(byId.get(p.primary_physician_id), lang)} />
        <Row label={t('patients.researchConsent')} value={p.research_consent ? t('common.yes') : t('common.no')} />
      </dl>
    </Card>
  );
}

export function PatientDetailPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { access, can } = useAuth();
  const clinics = useClinics();
  const [tab, setTab] = useState<TabId>('overview');

  const patientQ = useQuery({ queryKey: ['patient', id], queryFn: () => api.getPatient(id) });
  const p = patientQ.data;
  const grantsQ = useQuery({ queryKey: ['grants', id], queryFn: () => api.listGrants(id), enabled: !!p });
  const allowed = (perm: Permission) => !!p && patientCan(access, p, grantsQ.data ?? [], perm);
  const clinicalQ = useQuery({ queryKey: ['clinical', id], queryFn: () => api.getPatientClinical(id), enabled: !!p && allowed('clinical.read') });
  const auditQ = useQuery({ queryKey: ['audit', 'patient', id], queryFn: () => api.listAudit({ patientId: id }), enabled: !!p && tab === 'audit' });

  // Record a VIEW event once per opened record (read access is auditable PHI access).
  const logged = useRef<string | null>(null);
  useEffect(() => {
    if (p && logged.current !== p.id) { logged.current = p.id; void api.logAccess('VIEW', p.id, 'patients', p.id); }
  }, [p]);

  const archive = useMutation({
    mutationFn: () => api.archivePatient(id),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['patients'] }); navigate('/patients'); },
  });

  const tabs = useMemo(() => {
    if (!p) return [];
    const list: Array<{ id: TabId; label: string }> = [{ id: 'overview', label: t('patients.tabs.overview') }];
    if (allowed('clinical.read')) {
      (['obstetrics', 'gynecology', 'infertility', 'fetal_medicine'] as const).forEach((s) => list.push({ id: s, label: t(`patients.tabs.${s}`) }));
    }
    if (allowed('document.read')) list.push({ id: 'documents', label: t('patients.tabs.documents') });
    list.push({ id: 'sharing', label: t('patients.tabs.sharing') });
    if (can('audit.read', p.clinic_id)) list.push({ id: 'audit', label: t('patients.tabs.audit') });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p, grantsQ.data, access, t]);

  if (patientQ.isLoading) return <Spinner />;
  if (!p) {
    return (
      <EmptyState icon={<ShieldAlert className="h-12 w-12" />} title={t('patients.notFound')}>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={() => navigate('/patients')}>{t('common.back')}</Button>
          {can('clinical.read') && <EmergencyAccessButton patientId={id} onGranted={() => { void qc.invalidateQueries({ queryKey: ['patient', id] }); }} />}
        </div>
      </EmptyState>
    );
  }

  const clinic = clinics.data?.find((c) => c.id === p.clinic_id);
  const c = clinicalQ.data;
  const active = c?.pregnancies.find((g) => g.status === 'active');
  const bySpecialty = (s: Specialty) => c?.encounters.filter((e) => e.specialty === s) ?? [];

  return (
    <div className="space-y-5">
      <Link to="/patients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('patients.title')}
      </Link>

      {/* Patient banner */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{patientName(p, lang)}</h1>
              {p.visibility === 'private' && <Badge tone="amber" icon={<Lock className="h-3 w-3" />}>{t('patients.private')}</Badge>}
              {p.deleted_at && <Badge tone="red">{t('patients.archived')}</Badge>}
            </div>
            {(lang === 'ar' ? p.first_name_en : p.first_name_ar) && (
              <p className="text-sm text-slate-500"><bdi>{patientName(p, lang === 'ar' ? 'en' : 'ar')}</bdi></p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span>{t('patients.mrn')}: <span className="ltr-num font-mono font-medium">{p.mrn}</span></span>
              <span>{t('patients.years', { count: ageInYears(p.date_of_birth) })}</span>
              {p.blood_group && (
                <span className="inline-flex items-center gap-1"><Droplet className="h-3.5 w-3.5 text-red-500" />
                  <span className="ltr-num">{p.blood_group}{p.rh_factor === 'positive' ? '+' : p.rh_factor === 'negative' ? '−' : ''}</span>
                </span>
              )}
              <span>{clinicName(clinic, lang)}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {p.specialties.map((s) => <Badge key={s} tone={SPECIALTY_TONE[s]}>{t(`specialty.${s}`)}</Badge>)}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {allowed('patient.update') && (
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/patients/${p.id}/edit`)}>{t('common.edit')}</Button>
            )}
            {allowed('patient.delete') && !p.deleted_at && (
              <Button variant="ghost" icon={<Archive className="h-4 w-4" />} loading={archive.isPending}
                onClick={() => confirm(t('patients.archiveConfirm')) && archive.mutate()}>{t('common.archive')}</Button>
            )}
          </div>
        </div>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-1"><Demographics p={p} /></div>
          <div className="space-y-5 lg:col-span-2">
            {allowed('clinical.read') ? (
              clinicalQ.isLoading ? <Spinner /> : (
                <>
                  {active && <Card title={t('patients.clinicalSummary')}><PregnancyCard p={active} /></Card>}
                  {!!c?.fertility_cycles.length && <CyclesPanel items={c.fertility_cycles.slice(0, 2)} />}
                  <EncountersPanel items={(c?.encounters ?? []).slice(0, 5)} />
                </>
              )
            ) : <Alert tone="info">{t('patients.noClinicalAccess')}</Alert>}
          </div>
        </div>
      )}

      {tab === 'obstetrics' && c && (<div className="space-y-5"><PregnanciesPanel items={c.pregnancies} /><EncountersPanel items={bySpecialty('obstetrics')} /></div>)}
      {tab === 'gynecology' && c && <EncountersPanel items={bySpecialty('gynecology')} />}
      {tab === 'infertility' && c && (<div className="space-y-5"><CyclesPanel items={c.fertility_cycles} /><EncountersPanel items={bySpecialty('infertility')} /></div>)}
      {tab === 'fetal_medicine' && c && (<div className="space-y-5"><FetalPanel items={c.fetal_assessments} /><EncountersPanel items={bySpecialty('fetal_medicine')} /></div>)}
      {tab === 'documents' && <DocumentsTab patient={p} canUpload={allowed('document.upload')} canArchive={allowed('document.delete')} />}
      {tab === 'sharing' && <SharingTab patient={p} canShare={allowed('patient.share')} />}
      {tab === 'audit' && (
        <Card bodyClassName="p-0">{auditQ.isLoading ? <Spinner /> : <AuditTable events={auditQ.data ?? []} showPatient={false} />}</Card>
      )}
    </div>
  );
}

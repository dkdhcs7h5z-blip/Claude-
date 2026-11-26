import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Users, Baby, AlertTriangle, Microscope, HeartPulse, CalendarCheck, FileSignature, Activity, ChevronRight,
} from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import { SPECIALTY_NAV, SPECIALTY_TONE } from '@/modules/registry';
import { formatRelative, patientName, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';
import { ageInYears } from '@/clinical/obstetrics';

export function DashboardPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { profile, can, activeClinicId, user, inScope } = useAuth();
  const { byId } = useProfiles();
  const canPatients = can('patient.read');
  const canAudit = can('audit.read');

  const stats = useQuery({
    queryKey: ['dashboard', user?.id, activeClinicId],
    queryFn: () => api.dashboardStats(activeClinicId),
    enabled: canPatients || can('clinical.read'),
  });
  const recent = useQuery({
    queryKey: ['patients', 'recent', user?.id, activeClinicId],
    queryFn: () => api.listPatients({ clinicId: activeClinicId, limit: 6 }),
    enabled: canPatients,
  });
  const activity = useQuery({
    queryKey: ['audit', 'recent', user?.id, activeClinicId],
    queryFn: () => api.listAudit({ clinicId: activeClinicId, limit: 8 }),
    enabled: canAudit,
  });

  const s = stats.data;
  const clinical = can('clinical.read');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.greeting', { name: profileName(profile, lang) })}
        subtitle={t('dashboard.subtitle')}
      />

      {!canPatients && can('research.access') && <Alert tone="info">{t('dashboard.researcherNotice')}</Alert>}

      {(canPatients || clinical) && (
        stats.isLoading ? <Spinner /> : s && (
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {canPatients && <StatCard label={t('dashboard.patients')} value={s.patients} icon={<Users className="h-5 w-5" />} />}
            {clinical && <StatCard label={t('dashboard.activePregnancies')} value={s.active_pregnancies} tone="pink" icon={<Baby className="h-5 w-5" />} />}
            {clinical && <StatCard label={t('dashboard.highRisk')} value={s.high_risk_pregnancies} tone="red" icon={<AlertTriangle className="h-5 w-5" />} />}
            {clinical && <StatCard label={t('dashboard.activeCycles')} value={s.active_fertility_cycles} tone="teal" icon={<Microscope className="h-5 w-5" />} />}
            {clinical && <StatCard label={t('dashboard.fetal30d')} value={s.fetal_assessments_30d} tone="blue" icon={<HeartPulse className="h-5 w-5" />} />}
            {clinical && <StatCard label={t('dashboard.encountersToday')} value={s.encounters_today} tone="violet" icon={<CalendarCheck className="h-5 w-5" />} />}
            {can('clinical.write') && <StatCard label={t('dashboard.unsigned')} value={s.unsigned_encounters} tone="amber" icon={<FileSignature className="h-5 w-5" />} />}
          </div>
        )
      )}

      {clinical && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{t('dashboard.quickAccess')}</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {SPECIALTY_NAV.filter((m) => inScope(m.specialty!)).map((m) => (
              <Link key={m.key} to={m.path} className="card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center justify-between">
                  <Badge tone={m.tone}><m.icon className="h-4 w-4" /></Badge>
                  <ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:text-slate-500 rtl:rotate-180" />
                </div>
                <span className="text-sm font-semibold text-slate-800">{t(`specialty.${m.specialty}`)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {canPatients && (
          <Card title={t('dashboard.recentPatients')} bodyClassName="p-0"
            actions={<Link to="/patients" className="text-xs font-medium text-brand-700 hover:underline">{t('common.viewAll')}</Link>}>
            {recent.isLoading ? <Spinner /> : recent.data?.length ? (
              <ul className="divide-y divide-slate-100">
                {recent.data.map((p) => (
                  <li key={p.id}>
                    <Link to={`/patients/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 sm:px-5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{patientName(p, lang)}</p>
                        <p className="text-xs text-slate-500"><span className="ltr-num">{p.mrn}</span> · {t('patients.years', { count: ageInYears(p.date_of_birth) })}</p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-1">
                        {p.specialties.slice(0, 2).map((sp) => <Badge key={sp} tone={SPECIALTY_TONE[sp]}>{t(`specialty.${sp}`)}</Badge>)}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title={t('patients.none')} />}
          </Card>
        )}

        {canAudit && (
          <Card title={t('dashboard.recentActivity')} bodyClassName="p-0"
            actions={<Link to="/admin/audit" className="text-xs font-medium text-brand-700 hover:underline">{t('common.viewAll')}</Link>}>
            {activity.isLoading ? <Spinner /> : activity.data?.length ? (
              <ul className="divide-y divide-slate-100">
                {activity.data.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                    <Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0 flex-1 text-sm">
                      <span className="font-medium text-slate-800">{e.actor_id ? profileName(byId.get(e.actor_id), lang) : t('audit.system')}</span>{' '}
                      <span className="text-slate-600">{t(`audit.actions.${e.action}`)}</span>{' '}
                      <span className="font-mono text-xs text-slate-500">{e.table_name}</span>
                    </div>
                    <span className="shrink-0 text-xs text-slate-400">{formatRelative(e.occurred_at, lang)}</span>
                  </li>
                ))}
              </ul>
            ) : <EmptyState title={t('dashboard.noActivity')} />}
          </Card>
        )}
      </div>
    </div>
  );
}

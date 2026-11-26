import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Baby, CalendarClock, Hourglass } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import type { ObstetricWorklistRow } from '@/data/types';
import { daysBetween, effectiveEdd, formatGADays, gaDaysOn, todayIso, trimesterOf } from '@/clinical/obstetrics';
import { pregnancyAlerts, sortAlerts, severityRank, visitAlerts } from '@/clinical/obstetricRisk';
import { formatDate, patientName } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { AlertCountBadge } from './AlertList';

type Filter = 'all' | 'highRisk' | 'alerts' | 'term' | 'overdueVisit' | 't1' | 't2' | 't3';
const riskTone = { low: 'green', moderate: 'amber', high: 'red' } as const;

function enrich(r: ObstetricWorklistRow) {
  const ga = gaDaysOn(r);
  const lastVisitGa = r.last_visit_date ? gaDaysOn(r, r.last_visit_date) : null;
  const alerts = sortAlerts([
    ...pregnancyAlerts({ status: 'active' }, ga, r.rh_factor),
    ...visitAlerts({
      bp_systolic: r.last_bp_systolic, bp_diastolic: r.last_bp_diastolic, urine_protein: r.last_urine_protein,
      fetal_movements: r.last_fetal_movements, urine_glucose: null, fetal_heart_rate: null, fundal_height_cm: null,
      hemoglobin_g_dl: null, presentation: null, edema: null,
    }, lastVisitGa, r.plurality),
  ]);
  const daysSinceVisit = r.last_visit_date ? daysBetween(r.last_visit_date, todayIso()) : null;
  return { ...r, ga, edd: effectiveEdd(r), alerts, daysSinceVisit, worst: alerts[0] ? severityRank[alerts[0].severity] : 9 };
}

export function ObstetricsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { activeClinicId, user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({ queryKey: ['ob-worklist', user?.id, activeClinicId], queryFn: () => api.listObstetricWorklist(activeClinicId) });

  const rows = useMemo(() => (q.data ?? []).map(enrich).sort((a, b) => a.worst - b.worst || (b.ga ?? 0) - (a.ga ?? 0)), [q.data]);
  const filtered = rows.filter((r) => {
    switch (filter) {
      case 'highRisk': return r.risk_level === 'high';
      case 'alerts': return r.alerts.some((a) => a.severity !== 'info');
      case 'term': return (r.ga ?? 0) >= 259;
      case 'overdueVisit': return r.daysSinceVisit == null || r.daysSinceVisit > 28;
      case 't1': case 't2': case 't3': return r.ga != null && `t${trimesterOf(r.ga)}` === filter;
      default: return true;
    }
  });
  const filters: Filter[] = ['all', 'highRisk', 'alerts', 'term', 'overdueVisit', 't1', 't2', 't3'];

  return (
    <div className="space-y-5">
      <PageHeader title={t('ob.worklist')} subtitle={t('ob.subtitle')}
        icon={<Badge tone="pink"><Baby className="h-6 w-6" /></Badge>} />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label={t('ob.stats.active')} value={rows.length} tone="pink" icon={<Baby className="h-5 w-5" />} />
        <StatCard label={t('ob.stats.highRisk')} value={rows.filter((r) => r.risk_level === 'high').length} tone="red" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label={t('ob.stats.term')} value={rows.filter((r) => (r.ga ?? 0) >= 259).length} tone="violet" icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label={t('ob.stats.postDates')} value={rows.filter((r) => (r.ga ?? 0) >= 287).length} tone="amber" icon={<Hourglass className="h-5 w-5" />} />
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist">
        {filters.map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={clsx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
              filter === f ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
            {t(`ob.filters.${f}`)}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {q.isLoading ? <Spinner /> : !filtered.length ? <EmptyState icon={<Baby className="h-10 w-10" />} title={t('ob.noPregnancies')} /> : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((r) => (
                <li key={r.pregnancy_id}>
                  <Link to={`/patients/${r.patient_id}?tab=obstetrics`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{patientName(r, lang)}</p>
                      <span className="ltr-num text-lg font-semibold tabular-nums">{formatGADays(r.ga)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="ltr-num">{r.mrn}</span>
                      <span>{t('ob.cols.edd')}: {formatDate(r.edd, lang)}</span>
                      <Badge tone={riskTone[r.risk_level]}>{t(`clinical.riskLevel.${r.risk_level}`)}</Badge>
                      <AlertCountBadge alerts={r.alerts} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {(['patient', 'ga', 'edd', 'risk', 'lastVisit', 'lastBp', 'alerts', 'visits'] as const).map((c) => (
                      <th key={c} className="table-th">{t(`ob.cols.${c}`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.pregnancy_id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/patients/${r.patient_id}?tab=obstetrics`)}>
                      <td className="table-td">
                        <Link to={`/patients/${r.patient_id}?tab=obstetrics`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:text-brand-700">
                          {patientName(r, lang)}
                        </Link>
                        <p className="ltr-num text-xs text-slate-500">{r.mrn}{r.plurality > 1 ? ` · ×${r.plurality}` : ''}</p>
                      </td>
                      <td className="table-td ltr-num font-semibold tabular-nums">{formatGADays(r.ga)}</td>
                      <td className="table-td whitespace-nowrap">{formatDate(r.edd, lang)}</td>
                      <td className="table-td"><Badge tone={riskTone[r.risk_level]}>{t(`clinical.riskLevel.${r.risk_level}`)}</Badge></td>
                      <td className={clsx('table-td whitespace-nowrap', (r.daysSinceVisit == null || r.daysSinceVisit > 28) && 'font-medium text-amber-700')}>
                        {r.last_visit_date ? formatDate(r.last_visit_date, lang) : t('ob.never')}
                      </td>
                      <td className="table-td ltr-num tabular-nums">{r.last_bp_systolic != null ? `${r.last_bp_systolic}/${r.last_bp_diastolic}` : '—'}</td>
                      <td className="table-td" title={r.alerts.map((a) => t(`ob.alerts.${a.code}`, a.values ?? {})).join('\n')}>
                        <AlertCountBadge alerts={r.alerts} />
                      </td>
                      <td className="table-td tabular-nums">{r.visit_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

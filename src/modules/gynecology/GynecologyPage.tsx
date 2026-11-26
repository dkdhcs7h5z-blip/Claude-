import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { AlertTriangle, CalendarClock, Flower2, FlaskConical, Users } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import type { GynWorklistRow } from '@/data/types';
import { screeningStatus, type ScreeningStatus } from '@/clinical/gynecology';
import { ageInYears } from '@/clinical/obstetrics';
import { formatDate, patientName } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { statusTone } from './ScreeningSection';

type Filter = 'all' | 'action' | 'overdue' | 'pending' | 'histology' | 'postmenopausal';
const rank: Record<ScreeningStatus, number> = { action_needed: 0, overdue: 1, never: 2, pending_result: 3, due_soon: 4, up_to_date: 5, not_applicable: 6 };

function enrich(r: GynWorklistRow) {
  const age = ageInYears(r.date_of_birth);
  const status = screeningStatus({
    ageYears: age, hysterectomy: r.hysterectomy, lastSampleDate: r.last_screening_date, lastStatus: r.last_screening_status,
    nextDue: r.screening_next_due, recommendation: r.screening_recommendation,
    colposcopyAfterSample: !!(r.last_colposcopy_date && r.last_screening_date && r.last_colposcopy_date >= r.last_screening_date),
  });
  return { ...r, age, status };
}

export function GynecologyPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { activeClinicId, user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({ queryKey: ['gyn-worklist', user?.id, activeClinicId], queryFn: () => api.listGynWorklist(activeClinicId) });
  const rows = useMemo(() => (q.data ?? []).map(enrich).sort((a, b) => rank[a.status] - rank[b.status] || b.pending_histology - a.pending_histology), [q.data]);
  const filtered = rows.filter((r) => {
    switch (filter) {
      case 'action': return r.status === 'action_needed';
      case 'overdue': return r.status === 'overdue' || r.status === 'never';
      case 'pending': return r.status === 'pending_result';
      case 'histology': return r.pending_histology > 0;
      case 'postmenopausal': return r.menopause_status === 'postmenopausal' || r.menopause_status === 'surgical';
      default: return true;
    }
  });
  const result = (r: GynWorklistRow) => [r.last_hpv_result && `HPV ${t(`gyn.hpvV.${r.last_hpv_result}`)}`, r.last_cytology_result && t(`gyn.cytologyV.${r.last_cytology_result}`)].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <PageHeader title={t('gyn.worklist')} subtitle={t('gyn.subtitle')} icon={<Badge tone="violet"><Flower2 className="h-6 w-6" /></Badge>} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label={t('gyn.stats.patients')} value={rows.length} tone="violet" icon={<Users className="h-5 w-5" />} />
        <StatCard label={t('gyn.stats.action')} value={rows.filter((r) => r.status === 'action_needed').length} tone="red" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label={t('gyn.stats.overdue')} value={rows.filter((r) => r.status === 'overdue' || r.status === 'never').length} tone="amber" icon={<CalendarClock className="h-5 w-5" />} />
        <StatCard label={t('gyn.stats.histology')} value={rows.filter((r) => r.pending_histology > 0).length} tone="blue" icon={<FlaskConical className="h-5 w-5" />} />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist">
        {(['all', 'action', 'overdue', 'pending', 'histology', 'postmenopausal'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={clsx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
              filter === f ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
            {t(`gyn.filters.${f}`)}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        {q.isLoading ? <Spinner /> : !filtered.length ? <EmptyState icon={<Flower2 className="h-10 w-10" />} title={t('gyn.none')} /> : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((r) => (
                <li key={r.patient_id}>
                  <Link to={`/patients/${r.patient_id}?tab=gynecology`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{patientName(r, lang)}</p>
                      <Badge tone={statusTone[r.status]}>{t(`gyn.statusV.${r.status}`)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500"><span className="ltr-num">{r.mrn}</span> · {t('patients.years', { count: r.age })}{r.last_screening_date && <> · {result(r)}</>}</p>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr>
                  {(['patient', 'age', 'menopause', 'lastScreening', 'result', 'next', 'status', 'histology', 'lastVisit'] as const).map((c) => <th key={c} className="table-th">{t(`gyn.cols.${c}`)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.patient_id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/patients/${r.patient_id}?tab=gynecology`)}>
                      <td className="table-td">
                        <Link to={`/patients/${r.patient_id}?tab=gynecology`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:text-brand-700">{patientName(r, lang)}</Link>
                        <p className="ltr-num text-xs text-slate-500">{r.mrn}</p>
                      </td>
                      <td className="table-td tabular-nums">{r.age}</td>
                      <td className="table-td text-xs">{r.menopause_status ? t(`gyn.menopauseV.${r.menopause_status}`) : '—'}</td>
                      <td className="table-td whitespace-nowrap">{formatDate(r.last_screening_date, lang)}</td>
                      <td className="table-td text-xs">{result(r) || '—'}</td>
                      <td className="table-td text-xs">{r.screening_recommendation ? t(`gyn.actionV.${r.screening_recommendation}`, r.screening_recommendation) : '—'}</td>
                      <td className="table-td"><Badge tone={statusTone[r.status]}>{t(`gyn.statusV.${r.status}`)}</Badge></td>
                      <td className="table-td">{r.pending_histology > 0 ? <Badge tone="blue">{r.pending_histology}</Badge> : '—'}</td>
                      <td className="table-td whitespace-nowrap">{formatDate(r.last_visit_date, lang)}</td>
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

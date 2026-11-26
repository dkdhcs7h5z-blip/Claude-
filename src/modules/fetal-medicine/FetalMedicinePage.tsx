import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Activity, AlertTriangle, Clock, HeartPulse, Users } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import type { FmWorklistRow } from '@/data/types';
import { ANAEMIA_MOM, MONOCHORIONIC_DIAMNIOTIC, TTTS_DONOR_MVP, TTTS_RECIPIENT_MVP, screeningCategory } from '@/clinical/fetalMedicine';
import { formatGADays } from '@/clinical/obstetrics';
import { formatDate, patientName } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { callTone, categoryTone, conclusionTone, oneIn } from './shared';

type Filter = 'all' | 'highRisk' | 'doppler' | 'anomaly' | 'pending' | 'multiples';

function enrich(r: FmWorklistRow) {
  const minRisk = [r.last_risk_t21, r.last_risk_t18, r.last_risk_t13].filter((x): x is number => x != null);
  const risk = minRisk.length ? Math.min(...minRisk) : null;
  const cfHigh = [r.cfdna_t21, r.cfdna_t18, r.cfdna_t13].includes('high_risk');
  const highRisk = (risk != null && screeningCategory(risk) === 'high') || cfHigh;
  const critical = r.last_ua_edf === 'absent' || r.last_ua_edf === 'reversed' || r.last_dv_a_wave === 'absent' || r.last_dv_a_wave === 'reversed'
    || (r.last_mca_psv_mom ?? 0) >= ANAEMIA_MOM || !!r.last_hydrops;
  const ttts = MONOCHORIONIC_DIAMNIOTIC.includes(r.chorionicity ?? '') && r.last_mvp_min != null && r.last_mvp_max != null
    && r.last_mvp_min < TTTS_DONOR_MVP && r.last_mvp_max > TTTS_RECIPIENT_MVP;
  const dopplerFlag: 'critical' | 'abnormal' | 'normal' | null = !r.last_doppler_at ? null
    : critical || ttts ? 'critical' : r.last_cpr_low || r.last_ua_pi_high ? 'abnormal' : 'normal';
  const pending = r.pending_procedures + (r.cfdna_status === 'pending' ? 1 : 0);
  const rank = dopplerFlag === 'critical' ? 0 : highRisk ? 1 : r.anomaly_conclusion === 'anomaly_suspected' ? 2 : dopplerFlag === 'abnormal' ? 3 : pending ? 4 : 5;
  return { ...r, risk, cfHigh, highRisk, ttts, dopplerFlag, pending, rank };
}

export function FetalMedicinePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { activeClinicId, user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({ queryKey: ['fm-worklist', user?.id, activeClinicId], queryFn: () => api.listFmWorklist(activeClinicId) });
  const rows = useMemo(() => (q.data ?? []).map(enrich).sort((a, b) => a.rank - b.rank || (b.ga_days ?? 0) - (a.ga_days ?? 0)), [q.data]);
  const filtered = rows.filter((r) => {
    switch (filter) {
      case 'highRisk': return r.highRisk;
      case 'doppler': return r.dopplerFlag === 'critical' || r.dopplerFlag === 'abnormal';
      case 'anomaly': return r.anomaly_conclusion === 'anomaly_suspected';
      case 'pending': return r.pending > 0;
      case 'multiples': return r.plurality > 1;
      default: return true;
    }
  });
  const href = (r: FmWorklistRow) => `/patients/${r.patient_id}?tab=fetal_medicine`;
  const screening = (r: ReturnType<typeof enrich>) => r.risk != null ? <Badge tone={categoryTone[screeningCategory(r.risk)]}>{oneIn(r.risk)}</Badge> : '—';
  const cfdna = (r: ReturnType<typeof enrich>) => !r.cfdna_status ? '—' : r.cfdna_status === 'pending' ? <Badge tone="amber">{t('fm.cfdnaStatusV.pending')}</Badge>
    : r.cfdna_status === 'failed' ? <Badge tone="slate">{t('fm.cfdnaStatusV.failed')}</Badge>
    : <Badge tone={callTone[r.cfHigh ? 'high_risk' : 'low_risk']}>{t(`fm.callV.${r.cfHigh ? 'high_risk' : 'low_risk'}`)}</Badge>;
  const doppler = (r: ReturnType<typeof enrich>) => !r.dopplerFlag ? '—'
    : <Badge tone={r.dopplerFlag === 'critical' ? 'red' : r.dopplerFlag === 'abnormal' ? 'amber' : 'green'}>{r.ttts ? 'TTTS' : t(`fm.dopplerFlagV.${r.dopplerFlag}`)}</Badge>;

  return (
    <div className="space-y-5">
      <PageHeader title={t('fm.worklist')} subtitle={t('fm.subtitle')} icon={<Badge tone="blue"><HeartPulse className="h-6 w-6" /></Badge>} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label={t('fm.stats.active')} value={rows.length} tone="blue" icon={<Users className="h-5 w-5" />} />
        <StatCard label={t('fm.stats.highRisk')} value={rows.filter((r) => r.highRisk).length} tone="amber" icon={<AlertTriangle className="h-5 w-5" />} />
        <StatCard label={t('fm.stats.doppler')} value={rows.filter((r) => r.dopplerFlag === 'critical' || r.dopplerFlag === 'abnormal').length} tone="red" icon={<Activity className="h-5 w-5" />} />
        <StatCard label={t('fm.stats.pending')} value={rows.filter((r) => r.pending > 0).length} tone="violet" icon={<Clock className="h-5 w-5" />} />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist">
        {(['all', 'highRisk', 'doppler', 'anomaly', 'pending', 'multiples'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={clsx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
              filter === f ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
            {t(`fm.filters.${f}`)}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        {q.isLoading ? <Spinner /> : !filtered.length ? <EmptyState icon={<HeartPulse className="h-10 w-10" />} title={t('fm.none')} /> : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((r) => (
                <li key={r.pregnancy_id}>
                  <Link to={href(r)} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{patientName(r, lang)}</p>
                      <span className="ltr-num text-sm font-semibold">{formatGADays(r.ga_days)}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500"><span className="ltr-num">{r.mrn}</span>{r.plurality > 1 && <> · ×{r.plurality}{r.chorionicity && ` ${r.chorionicity.toUpperCase()}`}</>}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {r.highRisk && <Badge tone="red">{t('fm.filters.highRisk')}</Badge>}
                      {r.dopplerFlag && r.dopplerFlag !== 'normal' && doppler(r)}
                      {r.anomaly_conclusion && r.anomaly_conclusion !== 'normal' && <Badge tone={conclusionTone[r.anomaly_conclusion]}>{t(`fm.conclusionV.${r.anomaly_conclusion}`)}</Badge>}
                      {r.pending > 0 && <Badge tone="violet">{t('fm.cols.procedures')}: {r.pending}</Badge>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr>
                  {(['patient', 'ga', 'screening', 'cfdna', 'anomaly', 'doppler', 'procedures', 'lastScan'] as const).map((c) => <th key={c} className="table-th">{t(`fm.cols.${c}`)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.pregnancy_id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(href(r))}>
                      <td className="table-td">
                        <Link to={href(r)} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:text-brand-700">{patientName(r, lang)}</Link>
                        <p className="ltr-num text-xs text-slate-500">{r.mrn}{r.plurality > 1 && ` · ×${r.plurality}${r.chorionicity ? ` ${r.chorionicity.toUpperCase()}` : ''}`}</p>
                      </td>
                      <td className="table-td ltr-num tabular-nums">{formatGADays(r.ga_days)}</td>
                      <td className="table-td">{screening(r)}</td>
                      <td className="table-td">{cfdna(r)}</td>
                      <td className="table-td">{r.anomaly_conclusion ? <Badge tone={conclusionTone[r.anomaly_conclusion]}>{t(`fm.conclusionV.${r.anomaly_conclusion}`)}</Badge> : '—'}</td>
                      <td className="table-td">{doppler(r)}</td>
                      <td className="table-td">{r.pending > 0 ? <Badge tone="violet">{r.pending}</Badge> : '—'}</td>
                      <td className="table-td whitespace-nowrap">{formatDate(r.last_scan_at, lang)}</td>
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

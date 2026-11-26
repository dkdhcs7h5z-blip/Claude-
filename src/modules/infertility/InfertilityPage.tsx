import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Activity, Baby, HeartPulse, Snowflake, Syringe } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, EmptyState, PageHeader, Spinner, StatCard } from '@/components/ui';
import type { FertilityWorklistRow } from '@/data/types';
import { betaHcgDue, follicleSummary } from '@/clinical/fertility';
import { formatDate, patientName } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { statusTone } from './CycleDetail';

type Filter = 'all' | 'stimulation' | 'trigger' | 'luteal' | 'iui';

function enrich(r: FertilityWorklistRow) {
  const f = follicleSummary(r.last_follicles_right ?? [], r.last_follicles_left ?? []);
  const triggerReady = r.status === 'stimulation' && !r.trigger_at && f.ge17 >= 3;
  const awaitingHcg = r.last_transfer_outcome === 'pending' && !!r.last_transfer_on;
  const hcgDue = awaitingHcg ? betaHcgDue(r.last_transfer_on!, r.last_transfer_day ?? 5) : null;
  return { ...r, f, triggerReady, awaitingHcg, hcgDue };
}

export function InfertilityPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const { activeClinicId, user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const q = useQuery({ queryKey: ['ivf-worklist', user?.id, activeClinicId], queryFn: () => api.listFertilityWorklist(activeClinicId) });
  const cryo = useQuery({ queryKey: ['cryo', user?.id, activeClinicId], queryFn: () => api.listCryoInventory(activeClinicId) });
  const rows = useMemo(() => (q.data ?? []).map(enrich)
    .sort((a, b) => Number(b.triggerReady) - Number(a.triggerReady) || Number(b.awaitingHcg) - Number(a.awaitingHcg) || b.start_date.localeCompare(a.start_date)), [q.data]);
  const filtered = rows.filter((r) => {
    switch (filter) {
      case 'stimulation': return r.status === 'stimulation';
      case 'trigger': return r.triggerReady;
      case 'luteal': return r.awaitingHcg;
      case 'iui': return r.cycle_type === 'iui';
      default: return true;
    }
  });
  const next = (r: ReturnType<typeof enrich>) => r.triggerReady ? <Badge tone="violet">{t('ivf.filters.trigger')}</Badge>
    : r.hcgDue ? <span className="text-xs font-medium text-amber-700">{t('ivf.transfer.hcgDue', { date: formatDate(r.hcgDue, lang) })}</span>
    : r.retrieval_at ? <span className="ltr-num text-xs">{t('ivf.cycle.oocytes')} {r.oocytes_retrieved ?? '—'}</span> : '—';
  const href = (r: FertilityWorklistRow) => `/patients/${r.patient_id}?tab=infertility`;

  return (
    <div className="space-y-5">
      <PageHeader title={t('ivf.worklist')} subtitle={t('ivf.subtitle')} icon={<Badge tone="teal"><HeartPulse className="h-6 w-6" /></Badge>}
        actions={<Link to="/infertility/cryostorage" className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm"><Snowflake className="h-4 w-4" />{t('ivf.openCryo')}</Link>} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label={t('ivf.stats.active')} value={rows.length} tone="teal" icon={<Activity className="h-5 w-5" />} />
        <StatCard label={t('ivf.stats.stimulation')} value={rows.filter((r) => r.status === 'stimulation').length} tone="violet" icon={<Syringe className="h-5 w-5" />} />
        <StatCard label={t('ivf.stats.pendingHcg')} value={rows.filter((r) => r.awaitingHcg).length} tone="amber" icon={<Baby className="h-5 w-5" />} />
        <StatCard label={t('ivf.stats.frozen')} value={cryo.data?.length ?? '—'} tone="blue" icon={<Snowflake className="h-5 w-5" />} />
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist">
        {(['all', 'stimulation', 'trigger', 'luteal', 'iui'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)}
            className={clsx('shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition',
              filter === f ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50')}>
            {t(`ivf.filters.${f}`)}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        {q.isLoading ? <Spinner /> : !filtered.length ? <EmptyState icon={<HeartPulse className="h-10 w-10" />} title={t('ivf.none')} /> : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {filtered.map((r) => (
                <li key={r.cycle_id}>
                  <Link to={href(r)} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{patientName(r, lang)}</p>
                      <Badge tone={statusTone[r.status]}>{t(`ivf.statusV.${r.status}`)}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="ltr-num">{r.mrn}</span> · {t(`ivf.cycleTypeV.${r.cycle_type}`)}
                      {r.last_stim_day != null && <> · {t('ivf.cols.stimDay')} {r.last_stim_day} · <span className="ltr-num">≥17: {r.f.ge17}</span></>}
                    </p>
                    <div className="mt-1">{next(r)}</div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr>
                  {(['patient', 'cycle', 'protocol', 'status', 'stimDay', 'follicles', 'e2', 'next'] as const).map((c) => <th key={c} className="table-th">{t(`ivf.cols.${c}`)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={r.cycle_id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(href(r))}>
                      <td className="table-td">
                        <Link to={href(r)} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:text-brand-700">{patientName(r, lang)}</Link>
                        <p className="ltr-num text-xs text-slate-500">{r.mrn}</p>
                      </td>
                      <td className="table-td text-sm">{t('ivf.cycle.number', { n: r.cycle_number ?? '—' })} · {t(`ivf.cycleTypeV.${r.cycle_type}`)}
                        <p className="text-xs text-slate-500">{formatDate(r.start_date, lang)}</p></td>
                      <td className="table-td text-xs">{r.stim_protocol ? t(`ivf.protocolV.${r.stim_protocol}`) : '—'}</td>
                      <td className="table-td"><Badge tone={statusTone[r.status]}>{t(`ivf.statusV.${r.status}`)}</Badge></td>
                      <td className="table-td tabular-nums">{r.last_stim_day ?? '—'}</td>
                      <td className="table-td ltr-num tabular-nums">{r.last_monitoring_on ? `${r.f.ge17} / ${r.f.ge14}` : '—'}</td>
                      <td className="table-td tabular-nums">{r.last_e2 ?? '—'}</td>
                      <td className="table-td">{next(r)}</td>
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

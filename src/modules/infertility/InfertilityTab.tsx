import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Plus } from 'lucide-react';
import { api } from '@/data';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import type { Patient } from '@/data/types';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { AlertList } from '@/modules/obstetrics/AlertList';
import { deriveFertility } from './derive';
import { ReserveCard, SemenCard, WorkupCard } from './WorkupSection';
import { CycleDetail, CycleModal, statusTone } from './CycleDetail';

export function InfertilityTab({ patient, canWrite }: { patient: Patient; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useQuery({ queryKey: ['ivf', patient.id], queryFn: () => api.getFertilityDetail(patient.id) });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (q.isLoading || !q.data) return <Spinner />;
  const det = q.data;
  const d = deriveFertility(patient, det);
  const cycles = [...det.cycles].sort((a, b) => b.start_date.localeCompare(a.start_date));
  const current = cycles.find((c) => c.id === selected) ?? cycles.find((c) => !['completed', 'cancelled'].includes(c.status)) ?? cycles[0];

  return (
    <div className="space-y-5">
      {d.alerts.length > 0 && <Card title={t('ob.alerts.title')}><AlertList alerts={d.alerts} /></Card>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2"><WorkupCard patient={patient} profile={det.profile} canWrite={canWrite} /></div>
        <ReserveCard d={d} />
      </div>
      <SemenCard patient={patient} items={det.semen} canWrite={canWrite} />

      <Card title={t('ivf.cycle.cycles')} bodyClassName="p-0"
        actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCreating(true)}>{t('ivf.cycle.new')}</Button>}>
        {!cycles.length ? <EmptyState title={t('ivf.cycle.none')} /> : (
          <ul className="divide-y divide-slate-100" role="listbox" aria-label={t('ivf.cycle.cycles')}>
            {cycles.map((c) => (
              <li key={c.id} role="option" aria-selected={current?.id === c.id}>
                <button type="button" onClick={() => setSelected(c.id)}
                  className={clsx('flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-start transition sm:px-5',
                    current?.id === c.id ? 'bg-brand-50' : 'hover:bg-slate-50')}>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800">{t('ivf.cycle.number', { n: c.cycle_number ?? '—' })} · {t(`ivf.cycleTypeV.${c.cycle_type}`)}</span>
                    <span className="block text-xs text-slate-500">
                      {formatDate(c.start_date, lang)}{c.stim_protocol && <> · {t(`ivf.protocolV.${c.stim_protocol}`)}</>}
                      {c.oocytes_retrieved != null && <> · <span className="ltr-num">{t('ivf.cycle.oocytes')} {c.oocytes_retrieved}</span></>}
                    </span>
                  </span>
                  <Badge tone={statusTone[c.status]}>{t(`ivf.statusV.${c.status}`)}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {current && <CycleDetail key={current.id} patient={patient} cycle={current} detail={det} canWrite={canWrite} />}
      <p className="text-xs text-slate-500">{t('ivf.source')}</p>
      {creating && <CycleModal patient={patient} onClose={() => setCreating(false)} />}
    </div>
  );
}

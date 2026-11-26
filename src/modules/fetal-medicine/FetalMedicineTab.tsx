import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Baby } from 'lucide-react';
import { api } from '@/data';
import { Badge, Card, EmptyState, Select, Spinner } from '@/components/ui';
import type { Patient, Pregnancy } from '@/data/types';
import { effectiveEdd, formatGADays } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { AlertList } from '@/modules/obstetrics/AlertList';
import { deriveFm } from './derive';
import { ScreeningSection } from './ScreeningSection';
import { AnomalySection } from './AnomalySection';
import { DopplerSection } from './DopplerSection';
import { ProceduresSection } from './ProceduresSection';
import { oneIn } from './shared';

function Stat({ label, value, help }: { label: string; value: React.ReactNode; help?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-semibold text-slate-900">{value ?? '—'}</dd>
      {help && <dd className="text-[11px] text-slate-400">{help}</dd>}
    </div>
  );
}

export function FetalMedicineTab({ patient, pregnancies, canWrite }: { patient: Patient; pregnancies: Pregnancy[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const sorted = [...pregnancies].sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active')
    || (effectiveEdd(b) ?? '').localeCompare(effectiveEdd(a) ?? ''));
  const [selected, setSelected] = useState<string | undefined>(sorted[0]?.id);
  const id = selected ?? sorted[0]?.id;
  const q = useQuery({ queryKey: ['fm', id], queryFn: () => api.getFetalMedicineDetail(id!), enabled: !!id });

  if (!sorted.length) {
    return (
      <EmptyState icon={<Baby className="h-10 w-10" />} title={t('fm.noPregnancy')}>
        <Link to={`/patients/${patient.id}?tab=obstetrics`} className="font-medium text-brand-700 hover:underline">{t('fm.registerInOb')}</Link>
      </EmptyState>
    );
  }
  if (q.isLoading || !q.data) return <Spinner />;
  const d = q.data;
  const g = d.pregnancy;
  const derived = deriveFm(patient, d);
  const active = g.status === 'active';
  const write = canWrite && active;

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        {sorted.length > 1 && (
          <label className="mb-3 block max-w-sm">
            <span className="label">{t('fm.pregnancy')}</span>
            <Select value={id} onChange={(e) => setSelected(e.target.value)}>
              {sorted.map((p) => (
                <option key={p.id} value={p.id}>{t('fm.pregnancyLabel', { edd: formatDate(effectiveEdd(p), lang), status: t(`clinical.pregnancyStatus.${p.status}`) })}</option>
              ))}
            </Select>
          </label>
        )}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label={t('fm.summary.ga')} value={active ? <span className="ltr-num">{formatGADays(derived.ga)}</span> : t(`clinical.pregnancyStatus.${g.status}`)} />
          <Stat label={t('fm.summary.edd')} value={formatDate(effectiveEdd(g), lang)} />
          <Stat label={t('fm.summary.fetuses')} value={<>{g.plurality}{g.chorionicity && <span className="block text-xs font-normal text-slate-600">{t(`ob.chorionicityV.${g.chorionicity}`)}</span>}</>} />
          <Stat label={t('fm.summary.ageRisk')} value={<span className="ltr-num">{oneIn(derived.ageRisk)}</span>} help={`${t('patients.years', { count: derived.age })} · ${t('fm.summary.ageRiskHelp')}`} />
          <Stat label={t('fm.summary.rh')} value={patient.rh_factor
            ? <>{patient.blood_group ?? ''}{patient.rh_factor === 'negative' ? '−' : '+'}{derived.sensitised && <Badge tone="red">{t('fm.summary.alloimmunised')}</Badge>}</> : '—'} />
        </dl>
      </div>

      {derived.alerts.length > 0 && <Card title={t('ob.alerts.title')}><AlertList alerts={derived.alerts} /></Card>}
      <ScreeningSection d={d} groups={derived.ft} canWrite={write} />
      <AnomalySection d={d} groups={derived.an} canWrite={write} />
      <DopplerSection d={d} groups={derived.dp} derived={derived} canWrite={write} />
      <ProceduresSection d={d} patient={patient} sensitised={derived.sensitised} canWrite={write} />
      <p className="text-xs text-slate-500">{t('fm.source')}</p>
    </div>
  );
}

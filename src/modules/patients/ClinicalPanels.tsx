import { useTranslation } from 'react-i18next';
import { Lock } from 'lucide-react';
import type { Encounter, FertilityCycle, Pregnancy } from '@/data/types';
import { Badge, Card, EmptyState, type Tone } from '@/components/ui';
import { effectiveEdd, formatGADays, gaDaysOn, gpal, trimesterOf } from '@/clinical/obstetrics';
import { formatDate, formatDateTime } from '@/lib/format';
import { useLang } from '@/lib/queries';

const riskTone: Record<Pregnancy['risk_level'], Tone> = { low: 'green', moderate: 'amber', high: 'red' };

export function PregnancyCard({ p }: { p: Pregnancy }) {
  const { t } = useTranslation();
  const lang = useLang();
  const ga = p.status === 'active' ? gaDaysOn(p) : null;
  const edd = effectiveEdd(p);
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">{t('clinical.pregnancy')}</span>
          <Badge tone={p.status === 'active' ? 'pink' : 'slate'}>{t(`clinical.pregnancyStatus.${p.status}`)}</Badge>
        </div>
        <Badge tone={riskTone[p.risk_level]}>{t('clinical.risk')}: {t(`clinical.riskLevel.${p.risk_level}`)}</Badge>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">{t('clinical.ga')}</dt>
          <dd className="font-semibold tabular-nums"><span className="ltr-num">{formatGADays(ga)}</span>{ga != null && <span className="ms-1 text-xs font-normal text-slate-500">{t('clinical.trimester', { n: trimesterOf(ga) })}</span>}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('clinical.edd')}</dt><dd className="font-medium">{formatDate(edd, lang)}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('clinical.gpal')}</dt><dd className="font-medium"><span className="ltr-num">{gpal(p)}</span></dd></div>
        <div><dt className="text-xs text-slate-500">{t('clinical.plurality')}</dt><dd className="font-medium">{p.plurality}{p.conception ? ` · ${t(`clinical.conceptionType.${p.conception}`, p.conception)}` : ''}</dd></div>
      </dl>
      {p.risk_factors.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {p.risk_factors.map((r) => <Badge key={r} tone="amber">{t(`ob.riskFactors.${r}`, r)}</Badge>)}
        </div>
      )}
    </div>
  );
}

export function CyclesPanel({ items }: { items: FertilityCycle[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Card title={t('clinical.cycles')} bodyClassName="p-0">
      {items.length ? (
        <ul className="divide-y divide-slate-100">
          {items.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
              <div>
                <p className="text-sm font-semibold text-slate-800">{c.cycle_type.toUpperCase()} <span className="font-normal text-slate-500">· {c.protocol ?? '—'}</span></p>
                <p className="text-xs text-slate-500">{t('clinical.startDate')}: {formatDate(c.start_date, lang)}</p>
              </div>
              <div className="flex gap-1">
                <Badge tone={['completed', 'cancelled'].includes(c.status) ? 'slate' : 'teal'}>{t(`clinical.cycleStatus.${c.status}`)}</Badge>
                {c.outcome && <Badge tone="green">{c.outcome}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t('clinical.noCycles')} />}
    </Card>
  );
}

export function EncountersPanel({ items }: { items: Encounter[] }) {
  const { t } = useTranslation();
  const lang = useLang();
  const tone = { draft: 'amber', signed: 'green', amended: 'slate' } as const;
  return (
    <Card title={t('clinical.encounters')} bodyClassName="p-0">
      {items.length ? (
        <ul className="divide-y divide-slate-100">
          {items.map((e) => (
            <li key={e.id} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-800">
                  {t(`clinical.encounterType.${e.encounter_type}`, e.encounter_type)}
                  {e.chief_complaint && <span className="font-normal text-slate-600"> — {e.chief_complaint}</span>}
                </p>
                <div className="flex items-center gap-1">
                  {e.is_private && <Badge tone="amber" icon={<Lock className="h-3 w-3" />}>{t('clinical.private')}</Badge>}
                  <Badge tone={tone[e.status]}>{t(`clinical.${e.status}`)}</Badge>
                </div>
              </div>
              <p className="text-xs text-slate-500">{formatDateTime(e.encounter_at, lang)}</p>
              {(e.assessment || e.plan) && (
                <p className="mt-1 text-sm text-slate-600">{e.assessment}{e.plan && <span className="text-slate-500"> · {e.plan}</span>}</p>
              )}
            </li>
          ))}
        </ul>
      ) : <EmptyState title={t('clinical.noEncounters')} />}
    </Card>
  );
}

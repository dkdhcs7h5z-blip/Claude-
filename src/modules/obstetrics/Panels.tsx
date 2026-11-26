import { useTranslation } from 'react-i18next';
import { CheckCircle2, Circle, CircleDot, CircleDashed, ShieldCheck } from 'lucide-react';
import { clsx } from 'clsx';
import { Card } from '@/components/ui';
import type { GdmAssessment, PreeclampsiaAssessment } from '@/clinical/obstetricRisk';
import type { RiskClassification } from '@/clinical/highRisk';
import { Badge, Button } from '@/components/ui';
import type { ScheduleItem } from '@/clinical/antenatalSchedule';
import { formatGADays } from '@/clinical/obstetrics';

const riskTone = { low: 'green', moderate: 'amber', high: 'red' } as const;

export function RiskPanel({ pe, gdm, bmi, suggestion, currentLevel, detected, onApplyLevel, onAddFactor }: {
  pe: PreeclampsiaAssessment; gdm: GdmAssessment; bmi: number | null;
  suggestion: RiskClassification; currentLevel: 'low' | 'moderate' | 'high'; detected: string[];
  onApplyLevel?: () => void; onAddFactor?: (code: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const sep = i18n.language === 'ar' ? '، ' : ', ';
  const label = (c: string) => t(`ob.riskFactors.${c}`, { defaultValue: t(`ob.derived.${c}`, { defaultValue: t(`ob.highRisk.${c}`, c) }) });
  return (
    <Card title={t('ob.risk.title')}>
      <div className="space-y-4 text-sm">
        <section>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-slate-800">{t('ob.highRisk.suggested')}</h3>
            <Badge tone={riskTone[suggestion.level]}>{t(`clinical.riskLevel.${suggestion.level}`)}</Badge>
            {onApplyLevel && suggestion.level !== currentLevel && (
              <Button size="sm" variant="secondary" onClick={onApplyLevel}>{t('ob.highRisk.apply')}</Button>
            )}
          </div>
          {suggestion.reasons.length > 0 && (
            <p className="mt-1 text-xs text-slate-600"><span className="font-medium">{t('ob.highRisk.reasons')}:</span> {suggestion.reasons.map(label).join(sep)}</p>
          )}
          {detected.length > 0 && (
            <div className="mt-2 rounded-lg bg-amber-50 p-2 ring-1 ring-inset ring-amber-200">
              <p className="text-xs font-semibold text-amber-900">{t('ob.highRisk.detected')}</p>
              <p className="text-[11px] text-amber-800">{t('ob.highRisk.detectedHelp')}</p>
              <ul className="mt-1.5 space-y-1">
                {detected.map((c) => (
                  <li key={c} className="flex items-center justify-between gap-2 text-xs text-amber-900">
                    <span>{label(c)}</span>
                    {onAddFactor && <Button size="sm" variant="secondary" onClick={() => onAddFactor(c)}>{t('ob.highRisk.add')}</Button>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
        <section className="border-t border-slate-100 pt-3">
          <h3 className="font-semibold text-slate-800">{t('ob.risk.pe')}</h3>
          <p className={clsx('mt-1', pe.aspirinRecommended ? 'font-medium text-amber-900' : 'text-slate-500')}>
            {pe.aspirinRecommended ? t('ob.risk.aspirin') : t('ob.risk.noAspirin')}
          </p>
          {pe.high.length > 0 && <p className="mt-1 text-xs text-slate-600"><span className="font-medium">{t('ob.risk.high')}:</span> {pe.high.map(label).join(sep)}</p>}
          {pe.moderate.length > 0 && <p className="mt-0.5 text-xs text-slate-600"><span className="font-medium">{t('ob.risk.moderate')}:</span> {pe.moderate.map(label).join(sep)}</p>}
          <p className="mt-1 text-[11px] text-slate-400">{t('ob.risk.source')}: NICE NG133</p>
        </section>
        <section className="border-t border-slate-100 pt-3">
          <h3 className="font-semibold text-slate-800">{t('ob.risk.gdm')}</h3>
          <p className={clsx('mt-1', gdm.ogttIndicated || gdm.preexistingDiabetes || gdm.diagnosed ? 'font-medium text-amber-900' : 'text-slate-500')}>
            {gdm.preexistingDiabetes ? t('ob.risk.preexisting') : gdm.diagnosed ? t('ob.diagnosedGdm') : gdm.earlyTesting ? t('ob.risk.ogttEarly') : gdm.ogttIndicated ? t('ob.risk.ogtt') : t('ob.risk.noOgtt')}
          </p>
          {gdm.reasons.length > 0 && <p className="mt-1 text-xs text-slate-600"><span className="font-medium">{t('ob.risk.reasons')}:</span> {gdm.reasons.map(label).join(sep)}{bmi ? ` (BMI ${bmi})` : ''}</p>}
          <p className="mt-1 text-[11px] text-slate-400">{t('ob.risk.source')}: NICE NG3</p>
        </section>
        <p className="flex items-start gap-1.5 rounded-lg bg-slate-50 p-2 text-[11px] text-slate-500">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />{t('ob.risk.disclaimer')}
        </p>
      </div>
    </Card>
  );
}

const statusIcon = { done: CheckCircle2, due: CircleDot, upcoming: Circle, passed: CircleDashed } as const;
const statusCls = {
  done: 'text-emerald-600', due: 'text-brand-700', upcoming: 'text-slate-300', passed: 'text-amber-500',
} as const;

export function SchedulePanel({ items, ga }: { items: ScheduleItem[]; ga: number | null }) {
  const { t } = useTranslation();
  return (
    <Card title={t('ob.schedule.title')} bodyClassName="p-0">
      <ol className="divide-y divide-slate-100">
        {items.map((it) => {
          const Icon = statusIcon[it.status];
          return (
            <li key={it.code} className={clsx('flex items-center gap-3 px-4 py-2 sm:px-5', it.status === 'due' && 'bg-brand-50/50')}>
              <Icon className={clsx('h-4 w-4 shrink-0', statusCls[it.status])} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className={clsx('text-sm', it.status === 'due' ? 'font-semibold text-slate-900' : 'text-slate-700')}>{t(`ob.schedule.items.${it.code}`)}</p>
                {it.status !== 'upcoming' && <p className={clsx('text-[11px]', it.status === 'passed' ? 'text-amber-700' : it.status === 'done' ? 'text-emerald-700' : 'text-brand-700')}>{t(`ob.schedule.status.${it.status}`)}</p>}
              </div>
              <span className="ltr-num shrink-0 text-xs tabular-nums text-slate-500">{formatGADays(it.start)}–{formatGADays(it.end)}</span>
            </li>
          );
        })}
      </ol>
      {items.some((i) => i.status === 'passed') && <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-amber-700 sm:px-5">{t('ob.schedule.passedHint')}</p>}
      {ga != null && <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500 sm:px-5">{t('clinical.ga')}: <span className="ltr-num font-medium">{formatGADays(ga)}</span></p>}
    </Card>
  );
}

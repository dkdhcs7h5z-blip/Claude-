import { useTranslation } from 'react-i18next';
import { AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';
import type { ClinicalAlert } from '@/clinical/obstetricRisk';

const style = {
  critical: { cls: 'bg-red-50 text-red-900 ring-red-200', icon: AlertOctagon, ic: 'text-red-600' },
  warning: { cls: 'bg-amber-50 text-amber-900 ring-amber-200', icon: AlertTriangle, ic: 'text-amber-600' },
  info: { cls: 'bg-blue-50 text-blue-900 ring-blue-200', icon: Info, ic: 'text-blue-600' },
} as const;

/** Status colours always ship with an icon and text, never colour alone. */
export function AlertList({ alerts, compact = false }: { alerts: ClinicalAlert[]; compact?: boolean }) {
  const { t } = useTranslation();
  if (!alerts.length) return compact ? null : <p className="text-sm text-slate-500">{t('ob.alerts.none')}</p>;
  return (
    <ul className="space-y-1.5">
      {alerts.map((a, i) => {
        const s = style[a.severity];
        const Icon = s.icon;
        return (
          <li key={`${a.code}-${i}`} className={clsx('flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm ring-1 ring-inset', s.cls)}>
            <Icon className={clsx('mt-0.5 h-4 w-4 shrink-0', s.ic)} aria-hidden />
            <span>{t(`ob.alerts.${a.code}`, a.values ?? {})}</span>
          </li>
        );
      })}
    </ul>
  );
}

export function AlertCountBadge({ alerts }: { alerts: ClinicalAlert[] }) {
  if (!alerts.length) return <span className="text-slate-300">—</span>;
  const crit = alerts.filter((a) => a.severity === 'critical').length;
  const warn = alerts.filter((a) => a.severity === 'warning').length;
  return (
    <span className="inline-flex gap-1">
      {crit > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-inset ring-red-200"><AlertOctagon className="h-3 w-3" />{crit}</span>}
      {warn > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200"><AlertTriangle className="h-3 w-3" />{warn}</span>}
      {crit + warn === 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200"><Info className="h-3 w-3" />{alerts.length}</span>}
    </span>
  );
}

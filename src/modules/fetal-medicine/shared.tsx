import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Button, type Tone } from '@/components/ui';
import type { AnomalyConclusion, FetusLabel, Pregnancy } from '@/data/types';

export const LABELS: FetusLabel[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const fetusLabels = (g: Pick<Pregnancy, 'plurality'>) => LABELS.slice(0, Math.max(1, g.plurality));

export const conclusionTone: Record<AnomalyConclusion, Tone> = { normal: 'green', soft_markers: 'blue', incomplete: 'amber', anomaly_suspected: 'red' };
export const categoryTone = { high: 'red', intermediate: 'amber', low: 'green' } as const;
export const callTone = { low_risk: 'green', high_risk: 'red', no_call: 'amber', not_tested: 'slate' } as const;
export const resultTone = { pending: 'amber', normal: 'green', abnormal: 'red', failed: 'slate', not_applicable: 'slate' } as const;

export function useFmInvalidate(pregnancyId: string, patientId: string) {
  const qc = useQueryClient();
  return () => {
    for (const key of [['fm', pregnancyId], ['fm-worklist'], ['pregnancy', pregnancyId], ['clinical', patientId], ['dashboard']]) {
      void qc.invalidateQueries({ queryKey: key });
    }
  };
}

export function ModalFooter({ onClose, onSave, saving, disabled }: { onClose: () => void; onSave: () => void; saving: boolean; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
      <Button loading={saving} disabled={disabled} onClick={onSave}>{t('common.save')}</Button>
    </>
  );
}

/** Fetus switcher for multiple pregnancies (renders nothing for a singleton). */
export function FetusTabs({ labels, value, onChange, flagged = [] }: { labels: string[]; value: string; onChange: (l: string) => void; flagged?: string[] }) {
  const { t } = useTranslation();
  if (labels.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('fm.fetus')}>
      {labels.map((l) => (
        <button key={l} type="button" role="tab" aria-selected={value === l} onClick={() => onChange(l)}
          className={clsx('rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset transition',
            value === l ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
          {t('ob.fetusN', { label: l })}{flagged.includes(l) && <span className="ms-1" aria-hidden>•</span>}
        </button>
      ))}
    </div>
  );
}

export function Dl({ items }: { items: Array<[string, ReactNode]> }) {
  const shown = items.filter(([, v]) => v != null && v !== '' && v !== false);
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3 lg:grid-cols-4">
      {shown.map(([k, v]) => (
        <div key={k} className="min-w-0"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>
      ))}
    </dl>
  );
}

export const oneIn = (n: number | null | undefined) => (n == null ? '—' : `1:${n.toLocaleString('en-US')}`);

import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Field, Input, Select } from '@/components/ui';

/** Small field helpers shared by gynecology forms (labels are wrapped for a11y by <Field>). */
export function NumField({ label, value, onChange, min = 0, max, step = 1 }: {
  label: string; value: string; onChange: (v: string) => void; min?: number; max: number; step?: number;
}) {
  return <Field label={label}><Input type="number" dir="ltr" inputMode="decimal" min={min} max={max} step={step} value={value} onChange={(e) => onChange(e.target.value)} /></Field>;
}

export function EnumField({ label, value, onChange, values, ns, empty = true }: {
  label: string; value: string; onChange: (v: string) => void; values: readonly string[]; ns: string; empty?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        {empty && <option value="">—</option>}
        {values.map((v) => <option key={v} value={v}>{t(`${ns}.${v}`)}</option>)}
      </Select>
    </Field>
  );
}

export function BoolField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        <option value="true">{t('common.yes')}</option>
        <option value="false">{t('common.no')}</option>
      </Select>
    </Field>
  );
}

/** Multi-select as toggle chips (complaints, PALM-COEIN, IOTA features). */
export function ChipSelect({ legend, values, selected, onChange, ns, help }: {
  legend: string; values: readonly string[]; selected: string[]; onChange: (v: string[]) => void; ns: string; help?: string;
}) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      {help && <p className="-mt-0.5 mb-1.5 text-xs text-slate-500">{help}</p>}
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => {
          const on = selected.includes(v);
          return (
            <button key={v} type="button" aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((x) => x !== v) : [...selected, v])}
              className={clsx('rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition',
                on ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>
              {t(`${ns}.${v}`)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export const boolOrNull = (v: string): boolean | null => (v === '' ? null : v === 'true');
export const boolStr = (v: boolean | null | undefined): string => (v == null ? '' : String(v));

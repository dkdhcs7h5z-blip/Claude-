import { clsx } from 'clsx';
import { Loader2, X, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import {
  forwardRef, useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';

// --- Button ------------------------------------------------------------------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
const variants: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode;
}>(({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest }, ref) => (
  <button
    ref={ref}
    disabled={disabled || loading}
    className={clsx(
      'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
      size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2 text-sm',
      variants[variant], className,
    )}
    {...rest}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    {children}
  </button>
));
Button.displayName = 'Button';

// --- Card ----------------------------------------------------------------------
export function Card({ title, actions, children, className, bodyClassName }: {
  title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string;
}) {
  return (
    <section className={clsx('card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-100 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          {actions}
        </header>
      )}
      <div className={clsx('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

// --- Badge ---------------------------------------------------------------------
const tones = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
  pink: 'bg-pink-50 text-pink-700 ring-pink-200',
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = 'slate', children, icon }: { tone?: Tone; children: ReactNode; icon?: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', tones[tone])}>
      {icon}{children}
    </span>
  );
}

// --- Form fields -----------------------------------------------------------------
export function Field({ label, help, error, required, children, htmlFor }: {
  label: ReactNode; help?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; htmlFor?: string;
}) {
  // Wrapping the control in its <label> associates them for screen readers and
  // makes the label clickable, without every caller having to wire ids.
  const caption = <>{label}{required && <span className="text-red-600"> *</span>}</>;
  return (
    <div>
      {htmlFor ? (
        <><label className="label" htmlFor={htmlFor}>{caption}</label>{children}</>
      ) : (
        <label className="block"><span className="label">{caption}</span>{children}</label>
      )}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : help ? <p className="mt-1 text-xs text-slate-500">{help}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={clsx('input', className)} {...p} />
));
Input.displayName = 'Input';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={clsx('input pe-8', className)} {...p} />
));
Select.displayName = 'Select';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={clsx('input min-h-[80px]', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export function Checkbox({ label, help, checked, onChange, disabled }: {
  label: ReactNode; help?: ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500" />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {help && <span className="block text-xs text-slate-500">{help}</span>}
      </label>
    </div>
  );
}

// --- Page scaffolding ---------------------------------------------------------------
export function PageHeader({ title, subtitle, actions, icon }: {
  title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        {icon}
        <div>
          <h1 className="text-xl font-semibold text-slate-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-brand-600" />{label}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <div className="text-slate-300">{icon}</div>}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {children && <div className="text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'warning' | 'error' | 'success'; title?: ReactNode; children: ReactNode }) {
  const map = {
    info: ['bg-blue-50 text-blue-900 ring-blue-200', <Info key="i" className="h-5 w-5 shrink-0 text-blue-600" />],
    warning: ['bg-amber-50 text-amber-900 ring-amber-200', <AlertTriangle key="w" className="h-5 w-5 shrink-0 text-amber-600" />],
    error: ['bg-red-50 text-red-900 ring-red-200', <AlertTriangle key="e" className="h-5 w-5 shrink-0 text-red-600" />],
    success: ['bg-emerald-50 text-emerald-900 ring-emerald-200', <CheckCircle2 key="s" className="h-5 w-5 shrink-0 text-emerald-600" />],
  } as const;
  const [cls, icon] = map[tone];
  return (
    <div className={clsx('flex gap-3 rounded-lg p-3 text-sm ring-1 ring-inset', cls)} role={tone === 'error' ? 'alert' : undefined}>
      {icon}
      <div>{title && <p className="font-semibold">{title}</p>}{children}</div>
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'brand', hint }: {
  label: ReactNode; value: ReactNode; icon: ReactNode; tone?: Tone; hint?: ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <div className={clsx('flex h-10 w-10 shrink-0 sm:h-11 sm:w-11 items-center justify-center rounded-xl ring-1 ring-inset', tones[tone])}>{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-snug text-slate-500 sm:truncate">{label}</p>
        <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
    </div>
  );
}

// --- Tabs ----------------------------------------------------------------------------
export function Tabs<T extends string>({ tabs, value, onChange }: {
  tabs: Array<{ id: T; label: ReactNode; icon?: ReactNode }>; value: T; onChange: (id: T) => void;
}) {
  return (
    <div className="-mx-4 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0" role="tablist">
      <div className="flex min-w-max gap-1">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
            className={clsx(
              'flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              value === t.id ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800',
            )}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Modal -----------------------------------------------------------------------------
export function Modal({ open, onClose, title, children, footer, wide = false }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}
        className={clsx('max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-xl sm:rounded-2xl', wide ? 'sm:max-w-2xl' : 'sm:max-w-lg')}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">{children}</div>
        {footer && <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

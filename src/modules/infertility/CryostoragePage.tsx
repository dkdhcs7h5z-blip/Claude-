import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Snowflake } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, EmptyState, PageHeader, Spinner } from '@/components/ui';
import type { CryoRow } from '@/data/types';
import { embryoGrade } from '@/clinical/fertility';
import { todayIso } from '@/clinical/obstetrics';
import { formatDate, patientName } from '@/lib/format';
import { useLang } from '@/lib/queries';

function consentState(r: CryoRow, today: string) {
  if (!r.consent_expires_on) return 'none' as const;
  if (r.consent_expires_on < today) return 'expired' as const;
  const d = (Date.parse(r.consent_expires_on) - Date.parse(today)) / 86400000;
  return d <= 90 ? 'expiring' as const : 'valid' as const;
}

export function CryostoragePage() {
  const { t } = useTranslation();
  const lang = useLang();
  const { activeClinicId, user } = useAuth();
  const q = useQuery({ queryKey: ['cryo', user?.id, activeClinicId], queryFn: () => api.listCryoInventory(activeClinicId) });
  const today = todayIso();
  const rows = [...(q.data ?? [])].sort((a, b) => (a.consent_expires_on ?? '9999').localeCompare(b.consent_expires_on ?? '9999'));
  const tone = { expired: 'red', expiring: 'amber', valid: 'green', none: 'slate' } as const;
  const consent = (r: CryoRow) => {
    const s = consentState(r, today);
    return s === 'none' ? <Badge tone="slate">—</Badge>
      : <Badge tone={tone[s]}>{formatDate(r.consent_expires_on, lang)}{s !== 'valid' && ` · ${t(`ivf.consentV.${s}`)}`}</Badge>;
  };
  const href = (r: CryoRow) => `/patients/${r.patient_id}?tab=infertility`;
  return (
    <div className="space-y-5">
      <PageHeader title={t('ivf.cryo')} subtitle={t('ivf.cryoSubtitle')} icon={<Badge tone="blue"><Snowflake className="h-6 w-6" /></Badge>}
        actions={<Link to="/infertility" className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm">{t('ivf.worklist')}</Link>} />
      <div className="card overflow-hidden">
        {q.isLoading ? <Spinner /> : !rows.length ? <EmptyState icon={<Snowflake className="h-10 w-10" />} title={t('ivf.noneCryo')} /> : (
          <>
            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((r) => (
                <li key={r.embryo_id}>
                  <Link to={href(r)} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-slate-800">{patientName(r, lang)}</p>
                      <span className="ltr-num text-sm font-semibold">#{r.embryo_no} · {embryoGrade(r)}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500"><span className="ltr-num">{r.mrn}</span> · {r.storage_location ?? '—'} · {t(`ivf.pgtV.${r.pgt_result}`)}</p>
                    <div className="mt-1">{consent(r)}</div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="relative hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50"><tr>
                  {(['patient', 'cycle', 'embryo', 'grade', 'pgt', 'frozen', 'location', 'consent'] as const).map((c) => <th key={c} className="table-th">{t(`ivf.cols.${c}`)}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.embryo_id}>
                      <td className="table-td">
                        <Link to={href(r)} className="font-medium text-slate-900 hover:text-brand-700">{patientName(r, lang)}</Link>
                        <p className="ltr-num text-xs text-slate-500">{r.mrn}</p>
                      </td>
                      <td className="table-td text-sm">{t('ivf.cycle.number', { n: r.cycle_number ?? '—' })}</td>
                      <td className="table-td">#{r.embryo_no} · D{r.day_observed ?? '–'}</td>
                      <td className="table-td ltr-num font-semibold">{embryoGrade(r)}</td>
                      <td className="table-td text-xs">{t(`ivf.pgtV.${r.pgt_result}`)}</td>
                      <td className="table-td whitespace-nowrap">{formatDate(r.frozen_at, lang)}</td>
                      <td className="table-td text-xs">{r.storage_location ?? '—'}</td>
                      <td className="table-td">{consent(r)}</td>
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

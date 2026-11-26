import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ScanLine } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import type { FetalAssessment, FetalBiometry, FetalBiometryInput, PlacentaLocation, Pregnancy, Presentation, UaEdf } from '@/data/types';
import { efwCentile, hadlockCentileWeight, hadlockEfw, GROWTH_STANDARD_RANGE } from '@/clinical/fetalGrowth';
import { formatGADays, gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { num, orNull } from './formUtils';

// Categorical slots 1–2 of the validated reference palette (twin A / twin B).
const FETUS_COLORS = ['#257de0', '#f47230', '#00b894'];
const LABELS = ['A', 'B', 'C', 'D'];

import type { TFunction } from 'i18next';

function centileText(efw: number | null, ga: number | null, t: TFunction) {
  if (efw == null || ga == null) return '—';
  const c = efwCentile(efw, ga);
  return c == null ? t('ob.growth.outOfRange') : t('ob.growth.centileShort', { c: c < 1 ? '<1' : c > 99 ? '>99' : Math.round(c) });
}

export function GrowthPanel({ pregnancy, scans, biometry, canWrite }: {
  pregnancy: Pregnancy; scans: FetalAssessment[]; biometry: FetalBiometry[]; canWrite: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const labels = LABELS.slice(0, Math.max(1, pregnancy.plurality));
  const gaNow = gaDaysOn(pregnancy) ?? 0;
  const pts = biometry.filter((b) => b.efw_g != null && b.ga_days != null);
  const x0 = Math.max(GROWTH_STANDARD_RANGE[0], Math.min(140, ...pts.map((b) => b.ga_days!)) - 14);
  const x1 = Math.min(294, Math.max(gaNow + 14, 224, ...pts.map((b) => b.ga_days! + 14)));
  const scanRows = scans.filter((s) => biometry.some((b) => b.fetal_assessment_id === s.id))
    .sort((a, b) => b.performed_at.localeCompare(a.performed_at));

  return (
    <Card title={t('ob.growth.title')}
      actions={canWrite && pregnancy.status === 'active' && <Button size="sm" icon={<ScanLine className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('ob.growth.newScan')}</Button>}>
      <LineChart title={t('ob.growth.efwChart')} xDomain={[x0, x1]} formatX={formatGADays} formatY={(y) => String(Math.round(y))}
        emptyText={t('ob.charts.notEnough')} height={240}
        series={labels.map((l, i) => ({
          key: l, label: labels.length > 1 ? t('ob.fetusN', { label: l }) : t('ob.growth.efw'), color: FETUS_COLORS[i] ?? FETUS_COLORS[0],
          points: pts.filter((b) => b.fetus_label === l).map((b) => ({ x: b.ga_days!, y: b.efw_g! })),
        }))}
        curves={([10, 50, 90] as const).map((c) => ({
          label: String(c), from: x0, to: Math.min(x1, GROWTH_STANDARD_RANGE[1]), fn: (x: number) => hadlockCentileWeight(c, x),
        }))} />
      <p className="mt-1 text-xs text-slate-500">{t('ob.growth.curves')} · {t('ob.growth.source')}</p>

      {scanRows.length === 0 ? <EmptyState title={t('ob.growth.noScans')} /> : (
        <div className="relative -mx-4 mt-4 overflow-x-auto sm:-mx-5">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {[t('common.date'), t('clinical.ga'), t('clinical.type'), ...(labels.length > 1 ? [''] : []), t('ob.growth.bpd'), t('ob.growth.hc'),
                  t('ob.growth.ac'), t('ob.growth.fl'), t('ob.growth.efw'), t('ob.growth.centile'), t('ob.growth.liquor'), t('ob.growth.doppler'), t('ob.growth.impression')]
                  .map((h, i) => <th key={i} className="table-th">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {scanRows.flatMap((s) => {
                const rows = biometry.filter((b) => b.fetal_assessment_id === s.id).sort((a, b) => a.fetus_label.localeCompare(b.fetus_label));
                return rows.map((b, i) => (
                  <tr key={b.id} className="align-top">
                    {i === 0 && <>
                      <td className="table-td whitespace-nowrap" rowSpan={rows.length}>{formatDate(s.performed_at, lang)}</td>
                      <td className="table-td ltr-num" rowSpan={rows.length}>{formatGADays(s.gestational_age_days)}</td>
                      <td className="table-td" rowSpan={rows.length}>{t(`clinical.assessmentType.${s.assessment_type}`, s.assessment_type)}</td>
                    </>}
                    {labels.length > 1 && <td className="table-td font-semibold">{b.fetus_label}</td>}
                    <td className="table-td tabular-nums">{b.bpd_mm ?? (b.crl_mm != null ? `CRL ${b.crl_mm}` : '—')}</td>
                    <td className="table-td tabular-nums">{b.hc_mm ?? '—'}</td>
                    <td className="table-td tabular-nums">{b.ac_mm ?? '—'}</td>
                    <td className="table-td tabular-nums">{b.fl_mm ?? '—'}</td>
                    <td className="table-td font-medium tabular-nums">{b.efw_g ?? '—'}</td>
                    <td className="table-td whitespace-nowrap">{centileText(b.efw_g, b.ga_days, t)}</td>
                    <td className="table-td whitespace-nowrap text-xs">{b.dvp_cm != null ? `DVP ${b.dvp_cm}` : ''}{b.afi_cm != null ? ` AFI ${b.afi_cm}` : ''}</td>
                    <td className="table-td whitespace-nowrap text-xs">
                      {b.ua_pi != null && <>UA PI {b.ua_pi} </>}{b.ua_edf && b.ua_edf !== 'present' && <strong className="text-red-700">{t(`ob.growth.uaEdfV.${b.ua_edf}`)} EDF </strong>}
                      {b.mca_pi != null && <>MCA PI {b.mca_pi}</>}
                    </td>
                    {i === 0 && <td className="table-td text-xs text-slate-600" rowSpan={rows.length}>{s.impression}</td>}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && <FetalScanModal pregnancy={pregnancy} onClose={() => setOpen(false)} />}
    </Card>
  );
}

type FetusForm = Record<'crl' | 'bpd' | 'hc' | 'ac' | 'fl' | 'afi' | 'dvp' | 'uaPi' | 'mcaPi' | 'fhr', string> & {
  uaEdf: string; presentation: string; placenta: string;
};
const emptyFetus = (): FetusForm => ({ crl: '', bpd: '', hc: '', ac: '', fl: '', afi: '', dvp: '', uaPi: '', mcaPi: '', fhr: '', uaEdf: '', presentation: '', placenta: '' });

function FetalScanModal({ pregnancy, onClose }: { pregnancy: Pregnancy; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { access, activeClinicId } = useAuth();
  const labels = LABELS.slice(0, Math.max(1, pregnancy.plurality));
  const [date, setDate] = useState(todayIso());
  const [type, setType] = useState('growth_scan');
  const [impression, setImpression] = useState('');
  const [fetuses, setFetuses] = useState<FetusForm[]>(() => labels.map(emptyFetus));
  const [error, setError] = useState<string | null>(null);
  const ga = gaDaysOn(pregnancy, date);
  const setF = (i: number, k: keyof FetusForm, v: string) => setFetuses((fs) => fs.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  const clinicId = access?.memberships.some((m) => m.clinic_id === pregnancy.clinic_id) ? pregnancy.clinic_id
    : activeClinicId ?? access?.memberships[0]?.clinic_id ?? pregnancy.clinic_id;

  const payload: FetalBiometryInput[] = useMemo(() => fetuses.map((f, i) => ({
    fetus_label: labels[i], crl_mm: num(f.crl), bpd_mm: num(f.bpd), hc_mm: num(f.hc), ac_mm: num(f.ac), fl_mm: num(f.fl),
    afi_cm: num(f.afi), dvp_cm: num(f.dvp), ua_pi: num(f.uaPi), mca_pi: num(f.mcaPi), fhr: num(f.fhr),
    ua_edf: orNull<UaEdf>(f.uaEdf), presentation: orNull<Presentation>(f.presentation), placenta_location: orNull<PlacentaLocation>(f.placenta),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [fetuses]);

  const save = useMutation({
    mutationFn: () => api.recordFetalScan(pregnancy.id, {
      performed_at: date === todayIso() ? new Date().toISOString() : `${date}T09:00:00.000Z`, assessment_type: type,
      impression: orNull(impression), clinic_id: clinicId,
    }, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pregnancy', pregnancy.id] });
      void qc.invalidateQueries({ queryKey: ['clinical', pregnancy.patient_id] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  const n = (i: number, k: keyof FetusForm, label: string, max: number, step = 0.1) => (
    <Field label={label}><Input type="number" dir="ltr" inputMode="decimal" min={0} max={max} step={step} value={fetuses[i][k]} onChange={(e) => setF(i, k, e.target.value)} /></Field>
  );
  const sel = (i: number, k: keyof FetusForm, label: string, values: readonly string[], ns: string) => (
    <Field label={label}>
      <Select value={fetuses[i][k]} onChange={(e) => setF(i, k, e.target.value)}>
        <option value="">—</option>
        {values.map((v) => <option key={v} value={v}>{t(`${ns}.${v}`)}</option>)}
      </Select>
    </Field>
  );

  return (
    <Modal wide open onClose={onClose} title={t('ob.growth.newScan')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-3 gap-3">
        <Field label={t('ob.growth.scanDate')}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
        <div><p className="label">{t('clinical.ga')}</p><p className="ltr-num py-2 text-lg font-semibold">{formatGADays(ga)}</p></div>
        <Field label={t('ob.growth.scanType')}>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {['dating_scan', 'nt_scan', 'anomaly_scan', 'growth_scan', 'doppler', 'fetal_echo', 'other'].map((x) => (
              <option key={x} value={x}>{t(`clinical.assessmentType.${x}`)}</option>
            ))}
          </Select>
        </Field>
      </div>
      {fetuses.map((f, i) => {
        const efw = hadlockEfw(num(f.hc), num(f.ac), num(f.fl));
        return (
          <fieldset key={i} className="rounded-lg border border-slate-200 p-3">
            <legend className="px-1 text-sm font-semibold text-slate-700">{labels.length > 1 ? t('ob.fetusN', { label: labels[i] }) : t('ob.growth.biometry')}</legend>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {n(i, 'crl', `${t('ob.growth.crl')} (mm)`, 100)}
              {n(i, 'bpd', `${t('ob.growth.bpd')} (mm)`, 120)}
              {n(i, 'hc', `${t('ob.growth.hc')} (mm)`, 420)}
              {n(i, 'ac', `${t('ob.growth.ac')} (mm)`, 450)}
              {n(i, 'fl', `${t('ob.growth.fl')} (mm)`, 90)}
            </div>
            <p className="mt-2 rounded-md bg-brand-50 px-2.5 py-1.5 text-sm text-brand-900">
              {t('ob.growth.liveEfw')}: <strong className="ltr-num">{efw != null ? `${efw} g` : '—'}</strong>
              {efw != null && <> · {centileText(efw, ga, t)}</>}
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {n(i, 'dvp', t('ob.growth.dvp'), 25)}
              {n(i, 'afi', t('ob.growth.afi'), 60)}
              {n(i, 'uaPi', t('ob.growth.uaPi'), 5, 0.01)}
              {sel(i, 'uaEdf', t('ob.growth.uaEdf'), ['present', 'absent', 'reversed'], 'ob.growth.uaEdfV')}
              {n(i, 'mcaPi', t('ob.growth.mcaPi'), 5, 0.01)}
              {n(i, 'fhr', t('ob.growth.fhr'), 240, 1)}
              {sel(i, 'presentation', t('ob.growth.presentation'), ['cephalic', 'breech', 'transverse', 'oblique', 'unstable'], 'ob.presentationV')}
              {sel(i, 'placenta', t('ob.growth.placenta'), ['anterior', 'posterior', 'fundal', 'lateral', 'low_lying', 'previa'], 'ob.growth.placentaV')}
            </div>
          </fieldset>
        );
      })}
      <Field label={t('ob.growth.impression')}><Textarea value={impression} onChange={(e) => setImpression(e.target.value)} /></Field>
    </Modal>
  );
}

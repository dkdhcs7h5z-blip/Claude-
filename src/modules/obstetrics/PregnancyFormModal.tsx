import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { Chorionicity, Patient, Pregnancy, PregnancyInput } from '@/data/types';
import { bmi, computeEdd, formatGADays, todayIso, type DatingMethod } from '@/clinical/obstetrics';
import { assessPreeclampsia, ONGOING_CODES, PAST_HISTORY_CODES, SCREENING_CODES } from '@/clinical/obstetricRisk';
import { classifyRisk } from '@/clinical/highRisk';
import { ageInYears } from '@/clinical/obstetrics';
import { Badge } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { clinicName } from '@/lib/format';
import { num, orNull, str } from './formUtils';

const riskTone = { low: 'green', moderate: 'amber', high: 'red' } as const;

function initialMethod(p?: Pregnancy | null): DatingMethod {
  if (!p) return 'lmp';
  if (p.edd_basis === 'ivf_transfer' || p.transfer_date) return 'ivf_transfer';
  if (p.us_dating_date) return 'ultrasound';
  return 'lmp';
}

export function PregnancyFormModal({ open, onClose, patient, pregnancy, prefill, onSaved }: {
  open: boolean; onClose: () => void; patient: Patient; pregnancy?: Pregnancy | null;
  /** used when registering from an IVF transfer */
  prefill?: { transferDate: string; embryoAgeDays: 3 | 5 | 6; plurality: number; conception: string };
  onSaved?: (p: Pregnancy) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { access, activeClinicId } = useAuth();
  const editing = !!pregnancy;

  const memberClinics = access?.memberships ?? [];
  const defaultClinic = pregnancy?.clinic_id
    ?? memberClinics.find((m) => m.clinic_id === patient.clinic_id)?.clinic_id
    ?? memberClinics.find((m) => m.clinic_id === activeClinicId)?.clinic_id
    ?? memberClinics[0]?.clinic_id ?? patient.clinic_id;

  const [f, setF] = useState(() => ({
    clinic_id: defaultClinic,
    method: prefill ? ('ivf_transfer' as DatingMethod) : initialMethod(pregnancy),
    lmp: str(pregnancy?.lmp), cycle: str(pregnancy?.cycle_length_days ?? 28),
    usDate: str(pregnancy?.us_dating_date),
    usWeeks: pregnancy?.us_dating_ga_days != null ? String(Math.floor(pregnancy.us_dating_ga_days / 7)) : '',
    usDays: pregnancy?.us_dating_ga_days != null ? String(pregnancy.us_dating_ga_days % 7) : '0',
    transferDate: str(prefill?.transferDate ?? pregnancy?.transfer_date), embryoAge: str(prefill?.embryoAgeDays ?? pregnancy?.embryo_age_days ?? 5),
    cs: str(pregnancy?.previous_cs_count ?? 0), plan: str(pregnancy?.high_risk_plan), meds: str(pregnancy?.current_medications),
    gravida: str(pregnancy?.gravida ?? 1), para: str(pregnancy?.para ?? 0), abortus: str(pregnancy?.abortus ?? 0), living: str(pregnancy?.living ?? 0),
    plurality: str(prefill?.plurality ?? pregnancy?.plurality ?? 1), chorionicity: pregnancy?.chorionicity ?? '',
    conception: prefill?.conception ?? pregnancy?.conception ?? 'spontaneous',
    risk_level: pregnancy?.risk_level ?? 'low', risk_factors: pregnancy?.risk_factors ?? [] as string[],
    booking_date: str(pregnancy?.booking_date ?? todayIso()), weight: str(pregnancy?.booking_weight_kg), height: str(pregnancy?.height_cm),
    notes: str(pregnancy?.notes),
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const [error, setError] = useState<string | null>(null);

  const usGaDays = f.usWeeks === '' ? null : Number(f.usWeeks) * 7 + Number(f.usDays || 0);
  const dating = useMemo(() => computeEdd({
    method: f.method,
    lmp: f.lmp || null,
    cycleLengthDays: Number(f.cycle) || 28,
    usDate: f.usDate || null,
    usGaDays,
    transferDate: f.transferDate || null,
    embryoAgeDays: (Number(f.embryoAge) || null) as 3 | 5 | 6 | null,
  }), [f.method, f.lmp, f.cycle, f.usDate, usGaDays, f.transferDate, f.embryoAge]);

  const save = useMutation({
    mutationFn: async () => {
      if (!dating) throw new Error(t('ob.dating.incomplete'));
      const input: PregnancyInput = {
        patient_id: patient.id,
        clinic_id: f.clinic_id,
        lmp: f.method === 'ivf_transfer' ? null : f.lmp || null,
        cycle_length_days: Number(f.cycle) || 28,
        edd: dating.edd,
        edd_basis: dating.basis,
        us_dating_date: f.method === 'ultrasound' ? f.usDate || null : null,
        us_dating_ga_days: f.method === 'ultrasound' ? usGaDays : null,
        transfer_date: f.method === 'ivf_transfer' ? f.transferDate || null : null,
        embryo_age_days: f.method === 'ivf_transfer' ? (Number(f.embryoAge) as 3 | 5 | 6) : null,
        gravida: num(f.gravida), para: num(f.para), abortus: num(f.abortus), living: num(f.living),
        plurality: Number(f.plurality) || 1,
        chorionicity: Number(f.plurality) > 1 ? orNull<Chorionicity>(f.chorionicity) : null,
        conception: f.method === 'ivf_transfer' && f.conception === 'spontaneous' ? 'ivf' : f.conception,
        risk_level: f.risk_level as Pregnancy['risk_level'],
        risk_factors: f.risk_factors,
        booking_date: f.booking_date || null,
        booking_weight_kg: num(f.weight), height_cm: num(f.height),
        notes: orNull(f.notes),
        previous_cs_count: num(f.cs),
        high_risk_plan: orNull(f.plan),
        current_medications: orNull(f.meds),
        status: pregnancy?.status ?? 'active',
        outcome_date: pregnancy?.outcome_date ?? null,
      };
      return editing ? api.updatePregnancy(pregnancy!.id, input) : api.createPregnancy(input);
    },
    onSuccess: (saved) => {
      onSaved?.(saved);
      void qc.invalidateQueries({ queryKey: ['clinical', patient.id] });
      void qc.invalidateQueries({ queryKey: ['patient', patient.id] });
      void qc.invalidateQueries({ queryKey: ['patients'] });
      void qc.invalidateQueries({ queryKey: ['pregnancy'] });
      void qc.invalidateQueries({ queryKey: ['ob-worklist'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  const toggleFactor = (c: string) =>
    set('risk_factors', f.risk_factors.includes(c) ? f.risk_factors.filter((x) => x !== c) : [...f.risk_factors, c]);
  const b = bmi(num(f.weight), num(f.height));

  const plurality = Number(f.plurality) || 1;
  const pe = assessPreeclampsia({ riskFactors: f.risk_factors, para: num(f.para), ageYears: ageInYears(patient.date_of_birth), plurality, bmi: b });
  const suggestion = classifyRisk({ riskFactors: f.risk_factors, plurality, aspirinRecommended: pe.aspirinRecommended });
  const reasonLabel = (c: string) => t(`ob.riskFactors.${c}`, { defaultValue: t(`ob.highRisk.${c}`, c) });

  const group = (title: string, codes: readonly string[], tone: string, extra?: React.ReactNode) => (
    <div className={`rounded-lg p-3 ring-1 ring-inset ${tone}`}>
      <p className="mb-2 text-sm font-semibold text-slate-800">{title}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {extra}
        {codes.map((c) => <Checkbox key={c} label={t(`ob.riskFactors.${c}`)} checked={f.risk_factors.includes(c)} onChange={() => toggleFactor(c)} />)}
      </div>
    </div>
  );

  return (
    <Modal wide open={open} onClose={onClose} title={editing ? t('ob.edit') : t('ob.register')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} disabled={!dating} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}

      {memberClinics.length > 1 && !editing && (
        <Field label={t('common.clinic')}>
          <Select value={f.clinic_id} onChange={(e) => set('clinic_id', e.target.value)}>
            {memberClinics.map((m) => <option key={m.clinic_id} value={m.clinic_id}>{clinicName({ name_en: m.clinic_name_en, name_ar: m.clinic_name_ar }, lang)}</option>)}
          </Select>
        </Field>
      )}

      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">{t('ob.dating.title')}</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('ob.dating.method')}>
          {(['lmp', 'ultrasound', 'ivf_transfer'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={f.method === m} onClick={() => set('method', m)}
              className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${f.method === m ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50'}`}>
              {m === 'lmp' ? t('ob.dating.lmp') : m === 'ultrasound' ? t('ob.dating.ultrasound') : t('ob.dating.ivf')}
            </button>
          ))}
        </div>
        {f.method !== 'ivf_transfer' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('ob.dating.lmp')} help={f.method === 'ultrasound' ? t('common.optional') : undefined}>
              <Input type="date" dir="ltr" value={f.lmp} max={todayIso()} onChange={(e) => set('lmp', e.target.value)} />
            </Field>
            <Field label={t('ob.dating.cycleLength')}>
              <Input type="number" dir="ltr" min={20} max={45} value={f.cycle} onChange={(e) => set('cycle', e.target.value)} />
            </Field>
          </div>
        )}
        {f.method === 'ultrasound' && (
          <div className="grid grid-cols-3 gap-3">
            <Field label={t('ob.dating.usDate')}><Input type="date" dir="ltr" value={f.usDate} max={todayIso()} onChange={(e) => set('usDate', e.target.value)} /></Field>
            <Field label={`${t('ob.dating.usGa')} (${t('ob.dating.weeks')})`}><Input type="number" dir="ltr" min={5} max={28} value={f.usWeeks} onChange={(e) => set('usWeeks', e.target.value)} /></Field>
            <Field label={t('ob.dating.days')}><Input type="number" dir="ltr" min={0} max={6} value={f.usDays} onChange={(e) => set('usDays', e.target.value)} /></Field>
          </div>
        )}
        {f.method === 'ivf_transfer' && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('ob.dating.transferDate')}><Input type="date" dir="ltr" value={f.transferDate} max={todayIso()} onChange={(e) => set('transferDate', e.target.value)} /></Field>
            <Field label={t('ob.dating.embryoAge')}>
              <Select value={f.embryoAge} onChange={(e) => set('embryoAge', e.target.value)}>
                {[3, 5, 6].map((n) => <option key={n} value={n}>{t('ob.dating.dayN', { n })}</option>)}
              </Select>
            </Field>
          </div>
        )}
        {dating ? (
          <div className="rounded-lg bg-brand-50 p-2.5 text-sm text-brand-900">
            <p><span className="font-medium">{t('ob.dating.computed')}:</span> {formatDate(dating.edd, lang)} · {t('ob.dating.basis')}: {t(`ob.dating.basisV.${dating.basis}`)}</p>
            {dating.reconciliation && (
              <p className="mt-1 text-xs">
                {t('ob.dating.reconcile', { diff: dating.reconciliation.differenceDays, threshold: dating.reconciliation.thresholdDays })}{' '}
                <strong>{dating.reconciliation.useUltrasound ? t('ob.dating.useUs') : t('ob.dating.keepLmp')}</strong>
              </p>
            )}
            {usGaDays != null && f.method === 'ultrasound' && <p className="ltr-num mt-0.5 text-xs">{formatGADays(usGaDays)}</p>}
          </div>
        ) : <p className="text-xs text-slate-500">{t('ob.dating.incomplete')}</p>}
      </fieldset>

      <div>
        <p className="label">{t('ob.history.title')}</p>
        <div className="grid grid-cols-5 gap-2">
          {(['gravida', 'para', 'abortus', 'living'] as const).map((k) => (
            <Field key={k} label={<span className="text-xs">{t(`ob.history.${k}`)}</span>}>
              <Input type="number" dir="ltr" min={0} max={30} value={f[k]} onChange={(e) => set(k, e.target.value)} />
            </Field>
          ))}
          <Field label={<span className="text-xs">{t('ob.highRisk.csCount')}</span>}>
            <Input type="number" dir="ltr" min={0} max={10} value={f.cs} onChange={(e) => set('cs', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('ob.pregnancy.plurality')}>
          <Select value={f.plurality} onChange={(e) => set('plurality', e.target.value)}>{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</Select>
        </Field>
        {Number(f.plurality) > 1 && (
          <Field label={t('ob.pregnancy.chorionicity')}>
            <Select value={f.chorionicity} onChange={(e) => set('chorionicity', e.target.value)}>
              <option value="">{t('common.unknown')}</option>
              {(Number(f.plurality) === 2 ? ['dcda', 'mcda', 'mcma'] : ['tcta', 'dcta', 'mcta', 'other']).map((c) => (
                <option key={c} value={c}>{t(`ob.chorionicityV.${c}`)}</option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={t('ob.pregnancy.conception')}>
          <Select value={f.conception} onChange={(e) => set('conception', e.target.value)}>
            {['spontaneous', 'ovulation_induction', 'iui', 'ivf', 'icsi', 'other'].map((c) => <option key={c} value={c}>{t(`clinical.conceptionType.${c}`)}</option>)}
          </Select>
        </Field>
        <Field label={t('ob.pregnancy.riskLevel')}>
          <Select value={f.risk_level} onChange={(e) => set('risk_level', e.target.value as Pregnancy['risk_level'])}>
            {(['low', 'moderate', 'high'] as const).map((r) => <option key={r} value={r}>{t(`clinical.riskLevel.${r}`)}</option>)}
          </Select>
        </Field>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Field label={t('ob.booking.date')}><Input type="date" dir="ltr" value={f.booking_date} max={todayIso()} onChange={(e) => set('booking_date', e.target.value)} /></Field>
        <Field label={t('ob.booking.weight')}><Input type="number" dir="ltr" step="0.1" min={25} max={300} value={f.weight} onChange={(e) => set('weight', e.target.value)} /></Field>
        <Field label={t('ob.booking.height')} help={b ? `${t('ob.booking.bmi')} ${b}` : undefined}>
          <Input type="number" dir="ltr" step="0.1" min={100} max={230} value={f.height} onChange={(e) => set('height', e.target.value)} />
        </Field>
      </div>

      <fieldset className="space-y-3">
        <legend className="label">{t('ob.pregnancy.riskFactors')}</legend>
        {group(t('ob.riskGroups.past'), PAST_HISTORY_CODES, 'bg-emerald-50/40 ring-emerald-200')}
        {group(t('ob.riskGroups.ongoing'), ONGOING_CODES, 'bg-red-50/40 ring-red-200',
          <Checkbox label={t('ob.riskFactors.multiple_pregnancy')} help={t('ob.highRisk.multipleAuto')} checked={plurality > 1} onChange={() => undefined} disabled />)}
        {group(t('ob.riskGroups.screening'), SCREENING_CODES, 'bg-slate-50 ring-slate-200')}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
        <span className="font-medium text-slate-700">{t('ob.highRisk.suggested')}:</span>
        <Badge tone={riskTone[suggestion.level]}>{t(`clinical.riskLevel.${suggestion.level}`)}</Badge>
        {suggestion.level !== f.risk_level && (
          <Button size="sm" variant="secondary" onClick={() => set('risk_level', suggestion.level)}>{t('ob.highRisk.apply')}</Button>
        )}
        {suggestion.reasons.length > 0 && (
          <span className="w-full text-xs text-slate-500">{t('ob.highRisk.reasons')}: {suggestion.reasons.map(reasonLabel).join(lang === 'ar' ? '، ' : ', ')}</span>
        )}
      </div>

      <Field label={t('ob.highRisk.plan')}><Textarea value={f.plan} onChange={(e) => set('plan', e.target.value)} /></Field>
      <Field label={t('ob.highRisk.medications')}><Textarea value={f.meds} onChange={(e) => set('meds', e.target.value)} /></Field>

      <Field label={t('ob.pregnancy.notes')}><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}

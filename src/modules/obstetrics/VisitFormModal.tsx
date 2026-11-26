import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type {
  AntenatalVisitInput, AntenatalVisitRow, Edema, FetalMovements, Pregnancy, Presentation, UrineDip,
} from '@/data/types';
import { formatGADays, gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { visitAlerts } from '@/clinical/obstetricRisk';
import { AlertList } from './AlertList';
import { num, orNull, str } from './formUtils';

const DIPS: UrineDip[] = ['negative', 'trace', '1+', '2+', '3+', '4+'];
const PRESENTATIONS: Presentation[] = ['cephalic', 'breech', 'transverse', 'oblique', 'unstable', 'not_assessed'];
const MOVEMENTS: FetalMovements[] = ['normal', 'reduced', 'absent', 'not_assessed'];
const EDEMA: Edema[] = ['none', 'mild', 'moderate', 'severe'];

export function VisitFormModal({ open, onClose, pregnancy, visit }: {
  open: boolean; onClose: () => void; pregnancy: Pregnancy; visit?: AntenatalVisitRow | null;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { activeClinicId, access } = useAuth();
  const editing = !!visit;
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState(() => ({
    visit_date: visit?.visit_date ?? todayIso(),
    weight: str(visit?.weight_kg), sys: str(visit?.bp_systolic), dia: str(visit?.bp_diastolic), pulse: str(visit?.pulse),
    protein: str(visit?.urine_protein), glucose: str(visit?.urine_glucose), sfh: str(visit?.fundal_height_cm),
    fhr: str(visit?.fetal_heart_rate), presentation: str(visit?.presentation), movements: str(visit?.fetal_movements),
    edema: str(visit?.edema), hb: str(visit?.hemoglobin_g_dl), notes: str(visit?.notes),
    next: str(visit?.next_visit_date),
    fhrs: Array.from({ length: Math.max(1, pregnancy.plurality) }, (_, i) => str(visit?.fhr_by_fetus?.[i] ?? (i === 0 ? visit?.fetal_heart_rate : null))),
    pres: Array.from({ length: Math.max(1, pregnancy.plurality) }, (_, i) => str(visit?.presentation_by_fetus?.[i] ?? (i === 0 ? visit?.presentation : null))),
    assessment: str(visit?.encounter.assessment), plan: str(visit?.encounter.plan), is_private: visit?.encounter.is_private ?? false,
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const payload: AntenatalVisitInput = {
    visit_date: f.visit_date, weight_kg: num(f.weight), bp_systolic: num(f.sys), bp_diastolic: num(f.dia), pulse: num(f.pulse),
    urine_protein: orNull<UrineDip>(f.protein), urine_glucose: orNull<UrineDip>(f.glucose), fundal_height_cm: num(f.sfh),
    fetal_heart_rate: num(f.fhr), presentation: orNull<Presentation>(f.presentation),
    fetal_movements: orNull<FetalMovements>(f.movements), edema: orNull<Edema>(f.edema), hemoglobin_g_dl: num(f.hb),
    notes: orNull(f.notes),
    next_visit_date: f.next || null,
  };
  const multi = pregnancy.plurality > 1;
  if (multi) {
    const fhrs = f.fhrs.map(num);
    // store per-fetus values only when every fetus was measured (keeps fetus order unambiguous)
    payload.fhr_by_fetus = fhrs.every((x) => x != null) ? (fhrs as number[]) : null;
    payload.fetal_heart_rate = fhrs[0] ?? null;
    const pres = f.pres.map((x) => orNull<Presentation>(x));
    payload.presentation_by_fetus = pres.every((x) => x == null) ? null : pres.map((x) => x ?? 'not_assessed');
    payload.presentation = pres[0] ?? null;
  }
  const ga = gaDaysOn(pregnancy, f.visit_date || todayIso());
  const liveAlerts = useMemo(() => visitAlerts({
    bp_systolic: payload.bp_systolic ?? null, bp_diastolic: payload.bp_diastolic ?? null,
    urine_protein: payload.urine_protein ?? null, urine_glucose: payload.urine_glucose ?? null,
    fetal_movements: payload.fetal_movements ?? null, fetal_heart_rate: payload.fetal_heart_rate ?? null,
    fundal_height_cm: payload.fundal_height_cm ?? null, hemoglobin_g_dl: payload.hemoglobin_g_dl ?? null,
    presentation: payload.presentation ?? null, edema: payload.edema ?? null,
    fhr_by_fetus: payload.fhr_by_fetus ?? null, presentation_by_fetus: payload.presentation_by_fetus ?? null,
  }, ga, pregnancy.plurality),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [f, ga, pregnancy.plurality]);

  const clinicId = access?.memberships.some((m) => m.clinic_id === pregnancy.clinic_id) ? pregnancy.clinic_id
    : activeClinicId ?? access?.memberships[0]?.clinic_id ?? pregnancy.clinic_id;

  const save = useMutation({
    mutationFn: async () => {
      if ((payload.bp_systolic == null) !== (payload.bp_diastolic == null)) throw new Error(`${t('ob.visit.systolic')} / ${t('ob.visit.diastolic')}`);
      const narrative = { assessment: orNull(f.assessment), plan: orNull(f.plan) };
      if (editing) await api.updateAntenatalVisit(visit!.id, visit!.encounter.id, payload, narrative);
      else await api.recordAntenatalVisit(pregnancy.id, payload, {
        ...narrative, chief_complaint: t('ob.visit.title'), is_private: f.is_private, clinic_id: clinicId,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pregnancy', pregnancy.id] });
      void qc.invalidateQueries({ queryKey: ['clinical', pregnancy.patient_id] });
      void qc.invalidateQueries({ queryKey: ['ob-worklist'] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  const numField = (k: keyof typeof f, label: string, props: { min: number; max: number; step?: number }) => (
    <Field label={label}>
      <Input type="number" inputMode="decimal" dir="ltr" {...props} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} />
    </Field>
  );
  const selectField = (k: keyof typeof f, label: string, values: readonly string[], ns: string) => (
    <Field label={label}>
      <Select value={f[k] as string} onChange={(e) => set(k, e.target.value as never)}>
        <option value="">—</option>
        {values.map((v) => <option key={v} value={v}>{t(`${ns}.${v}`)}</option>)}
      </Select>
    </Field>
  );

  return (
    <Modal wide open={open} onClose={onClose} title={editing ? t('ob.visit.edit') : t('ob.visit.new')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ob.visit.date')}>
          <Input type="date" dir="ltr" value={f.visit_date} max={todayIso()} onChange={(e) => set('visit_date', e.target.value)} />
        </Field>
        <div>
          <p className="label">{t('ob.visit.ga')}</p>
          <p className="ltr-num py-2 text-lg font-semibold text-slate-900">{formatGADays(ga)}</p>
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('ob.visit.vitals')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {numField('sys', t('ob.visit.systolic'), { min: 50, max: 260 })}
          {numField('dia', t('ob.visit.diastolic'), { min: 30, max: 180 })}
          {numField('pulse', t('ob.visit.pulse'), { min: 30, max: 220 })}
          {numField('weight', t('ob.visit.weight'), { min: 25, max: 300, step: 0.1 })}
          {selectField('edema', t('ob.visit.edema'), EDEMA, 'ob.edemaV')}
          {numField('sfh', t('ob.visit.sfh'), { min: 5, max: 50, step: 0.5 })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('ob.visit.fetal')}</legend>
        {multi ? (
          <div className="space-y-2">
            {f.fhrs.map((_, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
                <span className="pb-2 text-sm font-semibold text-slate-600">{String.fromCharCode(65 + i)}</span>
                <Field label={t('ob.visit.fhr')}>
                  <Input type="number" dir="ltr" min={60} max={240} value={f.fhrs[i]}
                    onChange={(e) => setF((x) => ({ ...x, fhrs: x.fhrs.map((v, j) => (j === i ? e.target.value : v)) }))} />
                </Field>
                <Field label={t('ob.visit.presentation')}>
                  <Select value={f.pres[i]} onChange={(e) => setF((x) => ({ ...x, pres: x.pres.map((v, j) => (j === i ? e.target.value : v)) }))}>
                    <option value="">—</option>
                    {PRESENTATIONS.map((v) => <option key={v} value={v}>{t(`ob.presentationV.${v}`)}</option>)}
                  </Select>
                </Field>
              </div>
            ))}
            <div className="grid grid-cols-2 gap-3">{selectField('movements', t('ob.visit.movements'), MOVEMENTS, 'ob.movementsV')}</div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {numField('fhr', t('ob.visit.fhr'), { min: 60, max: 240 })}
            {selectField('presentation', t('ob.visit.presentation'), PRESENTATIONS, 'ob.presentationV')}
            {selectField('movements', t('ob.visit.movements'), MOVEMENTS, 'ob.movementsV')}
          </div>
        )}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('ob.visit.labs')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {selectField('protein', t('ob.visit.urineProtein'), DIPS, 'ob.dipV')}
          {selectField('glucose', t('ob.visit.urineGlucose'), DIPS, 'ob.dipV')}
          {numField('hb', t('ob.visit.hb'), { min: 3, max: 20, step: 0.1 })}
        </div>
      </fieldset>

      {liveAlerts.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ob.visit.liveAlerts')}</p>
          <AlertList alerts={liveAlerts} />
        </div>
      )}

      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('ob.visit.clinical')}</legend>
        <Field label={t('ob.visit.assessment')}><Textarea value={f.assessment} onChange={(e) => set('assessment', e.target.value)} /></Field>
        <Field label={t('ob.visit.plan')}><Textarea value={f.plan} onChange={(e) => set('plan', e.target.value)} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('ob.visit.notes')}><Input value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <Field label={t('ob.nextVisit')}><Input type="date" dir="ltr" value={f.next} min={f.visit_date} onChange={(e) => set('next', e.target.value)} /></Field>
        </div>
        {!editing && <Checkbox label={t('ob.visit.private')} help={t('ob.visit.privateHelp')} checked={f.is_private} onChange={(v) => set('is_private', v)} />}
      </fieldset>
    </Modal>
  );
}

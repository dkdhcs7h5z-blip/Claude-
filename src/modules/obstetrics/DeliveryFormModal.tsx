import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Button, Checkbox, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { Anesthesia, DeliveryMode, DeliveryOnset, Newborn, NewbornInput, Perineum, Pregnancy, PregnancyStatus } from '@/data/types';
import { formatGADays, gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { num, orNull } from './formUtils';

const ONSETS: DeliveryOnset[] = ['spontaneous', 'induced', 'prelabour_cs'];
const MODES: DeliveryMode[] = ['svd', 'vacuum', 'forceps', 'vaginal_breech', 'cs_elective', 'cs_emergency'];
const ANESTHESIA: Anesthesia[] = ['none', 'epidural', 'spinal', 'combined_spinal_epidural', 'general', 'local'];
const PERINEUM: Perineum[] = ['intact', 'first_degree', 'second_degree', 'third_degree', 'fourth_degree', 'episiotomy', 'not_applicable'];
const COMPLICATIONS = ['pph', 'shoulder_dystocia', 'eclampsia', 'chorioamnionitis', 'retained_placenta', 'uterine_rupture', 'blood_transfusion', 'hysterectomy', 'icu_admission'];

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

interface BabyForm { sex: string; weight: string; apgar1: string; apgar5: string; outcome: Newborn['outcome']; nicu: boolean }

export function DeliveryFormModal({ open, onClose, pregnancy }: { open: boolean; onClose: () => void; pregnancy: Pregnancy }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { access, activeClinicId } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    at: localNow(), onset: 'spontaneous' as DeliveryOnset, mode: 'svd' as DeliveryMode, indication: '',
    anesthesia: '' as Anesthesia | '', ebl: '', perineum: '' as Perineum | '', complications: [] as string[], notes: '',
  });
  const [babies, setBabies] = useState<BabyForm[]>(() => Array.from({ length: pregnancy.plurality }, () => ({
    sex: '', weight: '', apgar1: '', apgar5: '', outcome: 'live_birth', nicu: false,
  })));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setBaby = (i: number, patch: Partial<BabyForm>) => setBabies((b) => b.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const ga = gaDaysOn(pregnancy, f.at.slice(0, 10));
  const clinicId = access?.memberships.some((m) => m.clinic_id === pregnancy.clinic_id) ? pregnancy.clinic_id
    : activeClinicId ?? access?.memberships[0]?.clinic_id ?? pregnancy.clinic_id;

  const save = useMutation({
    mutationFn: () => api.recordDelivery(pregnancy.id, {
      clinic_id: clinicId,
      delivered_at: new Date(f.at).toISOString(), onset: f.onset, mode: f.mode, indication: orNull(f.indication),
      anesthesia: orNull<Anesthesia>(f.anesthesia), blood_loss_ml: num(f.ebl), perineum: orNull<Perineum>(f.perineum),
      complications: f.complications, notes: orNull(f.notes),
    }, babies.map<NewbornInput>((b) => ({
      sex: orNull<'female' | 'male' | 'undetermined'>(b.sex), birth_weight_g: num(b.weight), apgar_1: num(b.apgar1), apgar_5: num(b.apgar5),
      outcome: b.outcome, nicu_admission: b.nicu, notes: null,
    }))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pregnancy', pregnancy.id] });
      void qc.invalidateQueries({ queryKey: ['clinical', pregnancy.patient_id] });
      void qc.invalidateQueries({ queryKey: ['ob-worklist'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });

  const sel = <T extends string>(label: string, value: string, values: readonly T[], ns: string, onChange: (v: T) => void, empty = false) => (
    <Field label={label}>
      <Select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {empty && <option value="">—</option>}
        {values.map((v) => <option key={v} value={v}>{t(`${ns}.${v as string}` as string)}</option>)}
      </Select>
    </Field>
  );

  return (
    <Modal wide open={open} onClose={onClose} title={t('ob.delivery.record')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ob.delivery.deliveredAt')}>
          <Input type="datetime-local" dir="ltr" value={f.at} max={localNow()} onChange={(e) => set('at', e.target.value)} />
        </Field>
        <div><p className="label">{t('ob.delivery.gaAtDelivery')}</p><p className="ltr-num py-2 text-lg font-semibold">{formatGADays(ga)}</p></div>
        {sel(t('ob.delivery.onset'), f.onset, ONSETS, 'ob.delivery.onsetV', (v) => set('onset', v))}
        {sel(t('ob.delivery.mode'), f.mode, MODES, 'ob.delivery.modeV', (v) => set('mode', v))}
        {sel(t('ob.delivery.anesthesia'), f.anesthesia, ANESTHESIA, 'ob.delivery.anesthesiaV', (v) => set('anesthesia', v), true)}
        {sel(t('ob.delivery.perineum'), f.perineum, PERINEUM, 'ob.delivery.perineumV', (v) => set('perineum', v), true)}
        <Field label={t('ob.delivery.ebl')}><Input type="number" dir="ltr" min={0} max={20000} value={f.ebl} onChange={(e) => set('ebl', e.target.value)} /></Field>
        <Field label={t('ob.delivery.indication')}><Input value={f.indication} onChange={(e) => set('indication', e.target.value)} /></Field>
      </div>
      <fieldset>
        <legend className="label">{t('ob.delivery.complications')}</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {COMPLICATIONS.map((c) => (
            <Checkbox key={c} label={t(`ob.delivery.complicationsV.${c}`)} checked={f.complications.includes(c)}
              onChange={() => set('complications', f.complications.includes(c) ? f.complications.filter((x) => x !== c) : [...f.complications, c])} />
          ))}
        </div>
      </fieldset>
      {babies.map((b, i) => (
        <fieldset key={i} className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-sm font-semibold text-slate-700">{t('ob.delivery.newborn', { n: i + 1 })}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {sel(t('ob.delivery.sex'), b.sex, ['female', 'male', 'undetermined'] as const, 'ob.delivery.sexV', (v) => setBaby(i, { sex: v }), true)}
            <Field label={t('ob.delivery.weight')}><Input type="number" dir="ltr" min={200} max={7000} value={b.weight} onChange={(e) => setBaby(i, { weight: e.target.value })} /></Field>
            {sel(t('ob.delivery.outcome'), b.outcome, ['live_birth', 'stillbirth', 'neonatal_death'] as const, 'ob.delivery.outcomeV', (v) => setBaby(i, { outcome: v }))}
            <Field label={t('ob.delivery.apgar1')}><Input type="number" dir="ltr" min={0} max={10} value={b.apgar1} onChange={(e) => setBaby(i, { apgar1: e.target.value })} /></Field>
            <Field label={t('ob.delivery.apgar5')}><Input type="number" dir="ltr" min={0} max={10} value={b.apgar5} onChange={(e) => setBaby(i, { apgar5: e.target.value })} /></Field>
            <div className="flex items-end pb-2"><Checkbox label={t('ob.delivery.nicu')} checked={b.nicu} onChange={(v) => setBaby(i, { nicu: v })} /></div>
          </div>
        </fieldset>
      ))}
      <Field label={t('ob.delivery.notes')}><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}

const LOSS: PregnancyStatus[] = ['miscarriage', 'ectopic', 'termination'];

export function PregnancyLossModal({ open, onClose, pregnancy }: { open: boolean; onClose: () => void; pregnancy: Pregnancy }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [status, setStatus] = useState<PregnancyStatus>('miscarriage');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.updatePregnancy(pregnancy.id, { status, outcome_date: date }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pregnancy', pregnancy.id] });
      void qc.invalidateQueries({ queryKey: ['clinical', pregnancy.patient_id] });
      void qc.invalidateQueries({ queryKey: ['ob-worklist'] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal open={open} onClose={onClose} title={t('ob.closeLoss')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" loading={save.isPending} onClick={() => save.mutate()}>{t('common.confirm')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('ob.lossStatus')}>
        <Select value={status} onChange={(e) => setStatus(e.target.value as PregnancyStatus)}>
          {LOSS.map((s) => <option key={s} value={s}>{t(`ob.lossV.${s}`)}</option>)}
        </Select>
      </Field>
      <Field label={t('ob.lossDate')}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
    </Modal>
  );
}

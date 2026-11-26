import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Check, CircleHelp, Plus, X } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import type { AnomalyConclusion, FetalMedicineDetail, FmAnomalyScan, FmAnomalyScanInput } from '@/data/types';
import { anomalyAlerts, suggestConclusion } from '@/clinical/fetalMedicine';
import { formatGADays, todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { num, orNull } from '@/modules/obstetrics/formUtils';
import { AlertList } from '@/modules/obstetrics/AlertList';
import { ChipSelect, EnumField, NumField } from '@/modules/gynecology/fields';
import type { ScanGroup } from './derive';
import { Dl, FetusTabs, ModalFooter, conclusionTone, fetusLabels, useFmInvalidate } from './shared';

export const REGIONS: Record<string, string[]> = {
  cns: ['skull', 'midline_falx', 'cavum_septi_pellucidi', 'lateral_ventricles', 'cerebellum', 'cisterna_magna'],
  face: ['orbits', 'lips', 'profile', 'neck'],
  thorax: ['lungs', 'diaphragm', 'heart_situs', 'four_chamber', 'lvot', 'rvot', 'three_vessel_trachea'],
  abdomen: ['stomach', 'bowel', 'abdominal_wall', 'cord_insertion', 'kidneys', 'bladder'],
  skeleton: ['spine', 'arms', 'hands', 'legs', 'feet', 'genitalia'],
};
export const SOFT_MARKERS = ['echogenic_intracardiac_focus', 'choroid_plexus_cyst', 'echogenic_bowel', 'mild_pyelectasis', 'short_femur',
  'short_humerus', 'nasal_bone_hypoplasia', 'thick_nuchal_fold', 'mild_ventriculomegaly', 'single_umbilical_artery', 'aberrant_right_subclavian'];
const CONCLUSIONS: AnomalyConclusion[] = ['normal', 'soft_markers', 'incomplete', 'anomaly_suspected'];
type State = 'normal' | 'abnormal' | 'not_seen';
const nextState: Record<State, State> = { normal: 'abnormal', abnormal: 'not_seen', not_seen: 'normal' };

interface FetusForm {
  states: Record<string, State>; atrium: string; tcd: string; cm: string; nf: string; rp: string; placenta: string; os: string;
  cord: string; af: string; markers: string[]; sex: string; anomalies: string; conclusion: AnomalyConclusion | null;
}
const emptyForm = (): FetusForm => ({ states: {}, atrium: '', tcd: '', cm: '', nf: '', rp: '', placenta: '', os: '', cord: '3', af: 'normal', markers: [], sex: '', anomalies: '', conclusion: null });

function StructureGrid({ states, onChange }: { states: Record<string, State>; onChange: (s: Record<string, State>) => void }) {
  const { t } = useTranslation();
  const style: Record<State, { cls: string; icon: typeof Check }> = {
    normal: { cls: 'bg-white text-slate-700 ring-slate-300', icon: Check },
    abnormal: { cls: 'bg-red-50 text-red-800 ring-red-300', icon: X },
    not_seen: { cls: 'bg-amber-50 text-amber-900 ring-amber-300', icon: CircleHelp },
  };
  const label: Record<State, string> = { normal: t('fm.anomaly.normal'), abnormal: t('fm.anomaly.abnormal'), not_seen: t('fm.anomaly.notSeen') };
  return (
    <fieldset className="space-y-3">
      <legend className="label">{t('fm.anomaly.structures')}</legend>
      <p className="-mt-1 text-xs text-slate-500">{t('fm.anomaly.structuresHelp')}</p>
      {Object.entries(REGIONS).map(([region, items]) => (
        <div key={region}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t(`fm.regionV.${region}`)}</p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((s) => {
              const st = states[s] ?? 'normal';
              const Icon = style[st].icon;
              return (
                <button key={s} type="button" aria-label={`${t(`fm.structureV.${s}`)}: ${label[st]}`}
                  onClick={() => onChange({ ...states, [s]: nextState[st] })}
                  className={clsx('inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset transition', style[st].cls)}>
                  <Icon className="h-3 w-3" aria-hidden />{t(`fm.structureV.${s}`)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}

function toInput(label: string, f: FetusForm, cervix: string): FmAnomalyScanInput {
  const abnormal = Object.entries(f.states).filter(([, s]) => s === 'abnormal').map(([k]) => k);
  const notSeen = Object.entries(f.states).filter(([, s]) => s === 'not_seen').map(([k]) => k);
  const suggested = suggestConclusion({ abnormal_structures: abnormal, not_visualised: notSeen, soft_markers: f.markers, anomalies: f.anomalies });
  return {
    fetus_label: label as FmAnomalyScan['fetus_label'], abnormal_structures: abnormal, not_visualised: notSeen, atrium_mm: num(f.atrium), tcd_mm: num(f.tcd),
    cisterna_magna_mm: num(f.cm), nuchal_fold_mm: num(f.nf), renal_pelvis_mm: num(f.rp), cervical_length_mm: num(cervix),
    placenta_location: orNull(f.placenta), placenta_os_mm: num(f.os), cord_vessels: f.cord ? (Number(f.cord) as 2 | 3) : null,
    amniotic_fluid: orNull(f.af), soft_markers: f.markers, fetal_sex: orNull(f.sex), anomalies: orNull(f.anomalies.trim()),
    conclusion: f.conclusion ?? suggested, notes: null,
  };
}

function AnomalyModal({ d, onClose }: { d: FetalMedicineDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const g = d.pregnancy;
  const labels = fetusLabels(g);
  const invalidate = useFmInvalidate(g.id, g.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [impression, setImpression] = useState('');
  const [cervix, setCervix] = useState('');
  const [fetus, setFetus] = useState('A');
  const [forms, setForms] = useState<Record<string, FetusForm>>(Object.fromEntries(labels.map((l) => [l, emptyForm()])));
  const f = forms[fetus];
  const set = <K extends keyof FetusForm>(k: K) => (v: FetusForm[K]) => setForms((x) => ({ ...x, [fetus]: { ...x[fetus], [k]: v } }));
  const inputs = labels.map((l) => toInput(l, forms[l], cervix));
  const current = inputs[labels.indexOf(fetus as never)];
  const suggested = suggestConclusion({ ...current, anomalies: f.anomalies });
  const live = anomalyAlerts(inputs.map((i) => ({ ...i, ga_days: null })));
  const save = useMutation({
    mutationFn: () => api.recordFmScan(g.id, 'anomaly_scan', { performed_at: date === todayIso() ? new Date().toISOString() : `${date}T09:00:00.000Z`, impression: orNull(impression) }, inputs),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('fm.anomaly.new')} footer={<ModalFooter onClose={onClose} saving={save.isPending} onSave={() => { setError(null); save.mutate(); }} />}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('fm.scan.date')}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
        <NumField label={t('fm.anomaly.cervix')} value={cervix} onChange={setCervix} max={80} step={0.1} />
      </div>
      <FetusTabs labels={labels} value={fetus} onChange={setFetus} />
      <StructureGrid states={f.states} onChange={set('states')} />
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <legend className="label">{t('fm.anomaly.measurements')}</legend>
        <NumField label={t('fm.anomaly.atrium')} value={f.atrium} onChange={set('atrium')} max={50} step={0.1} />
        <NumField label={t('fm.anomaly.tcd')} value={f.tcd} onChange={set('tcd')} min={5} max={70} step={0.1} />
        <NumField label={t('fm.anomaly.cm')} value={f.cm} onChange={set('cm')} max={40} step={0.1} />
        <NumField label={t('fm.anomaly.nf')} value={f.nf} onChange={set('nf')} max={20} step={0.1} />
        <NumField label={t('fm.anomaly.rp')} value={f.rp} onChange={set('rp')} max={60} step={0.1} />
        <EnumField label={t('fm.anomaly.placenta')} value={f.placenta} onChange={set('placenta')} values={['anterior', 'posterior', 'fundal', 'lateral', 'low_lying', 'previa']} ns="ob.growth.placentaV" />
        <Field label={t('fm.anomaly.placentaOs')} help={t('fm.anomaly.placentaOsHelp')}>
          <Input type="number" inputMode="decimal" dir="ltr" min={-60} max={150} step={1} value={f.os} onChange={(e) => set('os')(e.target.value)} />
        </Field>
        <EnumField label={t('fm.anomaly.cord')} value={f.cord} onChange={set('cord')} values={['3', '2']} ns="fm.cordV" />
        <EnumField label={t('fm.anomaly.af')} value={f.af} onChange={set('af')} values={['normal', 'oligohydramnios', 'polyhydramnios', 'anhydramnios']} ns="fm.afV" />
        <EnumField label={t('fm.anomaly.sex')} value={f.sex} onChange={set('sex')} values={['female', 'male', 'undetermined', 'not_disclosed']} ns="fm.fetalSexV" />
      </fieldset>
      <ChipSelect legend={t('fm.anomaly.softMarkers')} values={SOFT_MARKERS} selected={f.markers} onChange={set('markers')} ns="fm.softMarkerV" />
      <Field label={t('fm.anomaly.anomalies')}><Textarea value={f.anomalies} onChange={(e) => set('anomalies')(e.target.value)} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <EnumField label={t('fm.anomaly.conclusion')} value={f.conclusion ?? suggested} onChange={(v) => set('conclusion')(v as AnomalyConclusion)} values={CONCLUSIONS} ns="fm.conclusionV" empty={false} />
        <p className="flex items-end pb-2 text-xs text-slate-500">{t('fm.anomaly.suggested', { c: t(`fm.conclusionV.${suggested}`) })}</p>
      </div>
      <Field label={t('fm.scan.impression')}><Textarea value={impression} onChange={(e) => setImpression(e.target.value)} /></Field>
      {live.length > 0 && <AlertList alerts={live} />}
    </Modal>
  );
}

export function AnomalySection({ d, groups, canWrite }: { d: FetalMedicineDetail; groups: ScanGroup<FmAnomalyScan>[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const multi = d.pregnancy.plurality > 1;
  return (
    <Card title={t('fm.anomaly.title')} actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('fm.anomaly.new')}</Button>}>
      {!groups.length ? <EmptyState title={t('fm.anomaly.none')} /> : (
        <ul className="space-y-4">
          {groups.map((gr) => (
            <li key={gr.scan.id} className="space-y-3 rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold">{formatDate(gr.scan.performed_at, lang)} <span className="ltr-num font-normal text-slate-500">({formatGADays(gr.scan.gestational_age_days)})</span></p>
              {gr.rows.map((r) => (
                <div key={r.id} className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {multi && <span className="text-sm font-semibold">{t('ob.fetusN', { label: r.fetus_label })}</span>}
                    <Badge tone={conclusionTone[r.conclusion]}>{t(`fm.conclusionV.${r.conclusion}`)}</Badge>
                    {r.conclusion === 'normal' && <span className="text-xs text-slate-500">{t('fm.anomaly.allNormal')}</span>}
                  </div>
                  {(r.abnormal_structures.length > 0 || r.not_visualised.length > 0 || r.soft_markers.length > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.abnormal_structures.map((s) => <Badge key={s} tone="red" icon={<X className="h-3 w-3" />}>{t(`fm.structureV.${s}`)}</Badge>)}
                      {r.not_visualised.map((s) => <Badge key={s} tone="amber" icon={<CircleHelp className="h-3 w-3" />}>{t(`fm.structureV.${s}`)}</Badge>)}
                      {r.soft_markers.map((s) => <Badge key={s} tone="blue">{t(`fm.softMarkerV.${s}`)}</Badge>)}
                    </div>
                  )}
                  {r.anomalies && <p className="text-sm font-medium text-red-800">{r.anomalies}</p>}
                  <Dl items={[
                    [t('fm.anomaly.atrium'), r.atrium_mm], [t('fm.anomaly.tcd'), r.tcd_mm], [t('fm.anomaly.cm'), r.cisterna_magna_mm],
                    [t('fm.anomaly.nf'), r.nuchal_fold_mm], [t('fm.anomaly.rp'), r.renal_pelvis_mm], [t('fm.anomaly.cervix'), r.cervical_length_mm],
                    [t('fm.anomaly.placenta'), r.placenta_location ? `${t(`ob.growth.placentaV.${r.placenta_location}`)}${r.placenta_os_mm != null ? ` · ${r.placenta_os_mm} mm` : ''}` : null],
                    [t('fm.anomaly.cord'), r.cord_vessels], [t('fm.anomaly.af'), r.amniotic_fluid && r.amniotic_fluid !== 'normal' ? t(`fm.afV.${r.amniotic_fluid}`) : null],
                    [t('fm.anomaly.sex'), r.fetal_sex ? t(`fm.fetalSexV.${r.fetal_sex}`) : null],
                  ]} />
                </div>
              ))}
              {gr.scan.impression && <p className="text-sm text-slate-600">{gr.scan.impression}</p>}
            </li>
          ))}
        </ul>
      )}
      {open && <AnomalyModal d={d} onClose={() => setOpen(false)} />}
    </Card>
  );
}

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Syringe } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import type { FetalMedicineDetail, FmProcedure, FmProcedureType, Patient } from '@/data/types';
import { MIN_GA_DAYS } from '@/clinical/fetalMedicine';
import { formatGADays, gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { formatDate, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';
import { num, orNull } from '@/modules/obstetrics/formUtils';
import { BoolField, ChipSelect, EnumField, NumField, boolOrNull } from '@/modules/gynecology/fields';
import { Dl, ModalFooter, fetusLabels, resultTone, useFmInvalidate } from './shared';

const TYPES: FmProcedureType[] = ['cvs', 'amniocentesis', 'cordocentesis', 'intrauterine_transfusion', 'amnioreduction', 'amnioinfusion',
  'laser_ablation', 'shunt', 'feto', 'selective_reduction', 'other'];
const INDICATIONS = ['screen_positive', 'cfdna_high_risk', 'structural_anomaly', 'previous_aneuploidy', 'parental_rearrangement', 'monogenic',
  'infection', 'fetal_anaemia', 'ttts', 'polyhydramnios', 'other'];
const COMPLICATIONS = ['none', 'bleeding', 'fluid_leak', 'membrane_rupture', 'bradycardia', 'infection', 'failed_sampling', 'miscarriage', 'preterm_labour', 'fetal_death'];
const TESTS = ['qf_pcr', 'karyotype', 'microarray', 'exome', 'single_gene', 'infection_pcr', 'fetal_blood_count'];
const SAMPLING: FmProcedureType[] = ['cvs', 'amniocentesis', 'cordocentesis'];
const HB: FmProcedureType[] = ['intrauterine_transfusion', 'cordocentesis'];
const VOLUME: FmProcedureType[] = ['intrauterine_transfusion', 'amnioreduction', 'amnioinfusion'];

function ProcedureModal({ d, patient, sensitised, onClose }: { d: FetalMedicineDetail; patient: Patient; sensitised: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const g = d.pregnancy;
  const labels = fetusLabels(g);
  const invalidate = useFmInvalidate(g.id, g.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    type: 'amniocentesis' as FmProcedureType, date: todayIso(), fetus: 'A', indication: '', approach: 'transabdominal', gauge: '', passes: '1',
    transplacental: '', antiD: '', volume: '', preHb: '', postHb: '', notes: '',
  });
  const [complications, setComplications] = useState<string[]>(['none']);
  const [tests, setTests] = useState<string[]>(['qf_pcr']);
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const ga = gaDaysOn(g, f.date);
  const min = MIN_GA_DAYS[f.type];
  const rhNeg = patient.rh_factor === 'negative';
  const sampling = SAMPLING.includes(f.type);
  const save = useMutation({
    mutationFn: () => api.recordFmProcedure(g.id, {
      procedure_type: f.type, performed_on: f.date, fetus_label: f.fetus as FmProcedure['fetus_label'], indication: f.indication,
      approach: orNull(f.approach), needle_gauge: num(f.gauge), needle_passes: num(f.passes), transplacental: boolOrNull(f.transplacental),
      anti_d_given: boolOrNull(f.antiD), volume_ml: VOLUME.includes(f.type) ? num(f.volume) : null,
      pre_hb_g_dl: HB.includes(f.type) ? num(f.preHb) : null, post_hb_g_dl: HB.includes(f.type) ? num(f.postHb) : null,
      complications, tests: sampling || f.type === 'intrauterine_transfusion' ? tests : [],
      result_status: sampling || (f.type === 'intrauterine_transfusion' && tests.length) ? 'pending' : 'not_applicable',
      result_summary: null, resulted_on: null, notes: orNull(f.notes),
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('fm.procedure.new')}
      footer={<ModalFooter onClose={onClose} saving={save.isPending} disabled={!f.indication} onSave={() => { setError(null); save.mutate(); }} />}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <EnumField label={t('fm.procedure.type')} value={f.type} onChange={(v) => { set('type')(v); if (v !== 'cvs') set('approach')('transabdominal'); }} values={TYPES} ns="fm.procedureV" empty={false} />
        <Field label={t('fm.procedure.date')} help={ga != null ? formatGADays(ga) : undefined}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        {labels.length > 1 && <EnumField label={t('fm.fetus')} value={f.fetus} onChange={set('fetus')} values={labels} ns="fm.fetusV" empty={false} />}
        <EnumField label={t('fm.procedure.indication')} value={f.indication} onChange={set('indication')} values={INDICATIONS} ns="fm.indicationV" />
        <EnumField label={t('fm.procedure.approach')} value={f.approach} onChange={set('approach')} values={f.type === 'cvs' ? ['transabdominal', 'transcervical'] : ['transabdominal']} ns="fm.approachV" empty={false} />
        <NumField label={t('fm.procedure.gauge')} value={f.gauge} onChange={set('gauge')} min={12} max={27} />
        <NumField label={t('fm.procedure.passes')} value={f.passes} onChange={set('passes')} min={1} max={6} />
        <BoolField label={t('fm.procedure.transplacental')} value={f.transplacental} onChange={set('transplacental')} />
        {VOLUME.includes(f.type) && <NumField label={t('fm.procedure.volume')} value={f.volume} onChange={set('volume')} max={5000} step={0.1} />}
        {HB.includes(f.type) && <>
          <NumField label={t('fm.procedure.preHb')} value={f.preHb} onChange={set('preHb')} min={1} max={20} step={0.1} />
          <NumField label={t('fm.procedure.postHb')} value={f.postHb} onChange={set('postHb')} min={1} max={20} step={0.1} />
        </>}
        {rhNeg && !sensitised && <BoolField label={t('fm.procedure.antiD')} value={f.antiD} onChange={set('antiD')} />}
      </div>
      {rhNeg && <Alert tone={sensitised ? 'info' : 'warning'}>{sensitised ? t('fm.procedure.sensitised') : t('fm.procedure.rhNegative')}</Alert>}
      {min != null && ga != null && ga < min && <Alert tone="warning">{t('ob.alerts.procedure_early', { weeks: Math.floor(min / 7) })}</Alert>}
      {(sampling || f.type === 'intrauterine_transfusion') && <ChipSelect legend={t('fm.procedure.tests')} values={TESTS} selected={tests} onChange={setTests} ns="fm.testV" />}
      <ChipSelect legend={t('fm.procedure.complications')} values={COMPLICATIONS} selected={complications}
        onChange={(v) => setComplications(v.includes('none') && !complications.includes('none') ? ['none'] : v.filter((x) => x !== 'none' || v.length === 1))} ns="fm.complicationV" />
      <Field label={t('ob.visit.notes')}><Textarea value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
    </Modal>
  );
}

function ResultModal({ p, onClose }: { p: FmProcedure; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useFmInvalidate(p.pregnancy_id, p.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ status: p.result_status === 'pending' ? 'normal' : p.result_status, date: p.resulted_on ?? todayIso(), summary: p.result_summary ?? '' });
  const save = useMutation({
    mutationFn: () => api.updateFmProcedure(p.id, { result_status: f.status as FmProcedure['result_status'], resulted_on: f.date, result_summary: orNull(f.summary.trim()) }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal open onClose={onClose} title={t('fm.procedure.enterResult')} footer={<ModalFooter onClose={onClose} saving={save.isPending} onSave={() => { setError(null); save.mutate(); }} />}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <EnumField label={t('fm.procedure.resultStatus')} value={f.status} onChange={(v) => setF({ ...f, status: v as typeof f.status })} values={['normal', 'abnormal', 'failed']} ns="fm.resultV" empty={false} />
        <Field label={t('fm.procedure.resultedOn')}><Input type="date" dir="ltr" value={f.date} min={p.performed_on} max={todayIso()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </div>
      <Field label={t('fm.procedure.summary')}><Textarea value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /></Field>
    </Modal>
  );
}

export function ProceduresSection({ d, patient, sensitised, canWrite }: { d: FetalMedicineDetail; patient: Patient; sensitised: boolean; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const { byId } = useProfiles();
  const [modal, setModal] = useState<null | 'new' | { result: FmProcedure }>(null);
  const multi = d.pregnancy.plurality > 1;
  return (
    <Card title={t('fm.procedure.title')} actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal('new')}>{t('fm.procedure.new')}</Button>}>
      {!d.procedures.length ? <EmptyState icon={<Syringe className="h-8 w-8" />} title={t('fm.procedure.none')} /> : (
        <ul className="space-y-3">
          {[...d.procedures].reverse().map((p) => (
            <li key={p.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{t(`fm.procedureV.${p.procedure_type}`)}{multi && ` · ${t('ob.fetusN', { label: p.fetus_label })}`}
                  <span className="ms-1 font-normal text-slate-500">{formatDate(p.performed_on, lang)} <span className="ltr-num">({formatGADays(p.ga_days)})</span></span></p>
                <Badge tone={resultTone[p.result_status]}>{t(`fm.resultV.${p.result_status}`)}</Badge>
              </div>
              <Dl items={[
                [t('fm.procedure.indication'), t(`fm.indicationV.${p.indication}`)],
                [t('fm.procedure.approach'), p.approach ? t(`fm.approachV.${p.approach}`) : null],
                [t('fm.procedure.gauge'), p.needle_gauge != null ? `${p.needle_gauge}G × ${p.needle_passes ?? 1}` : null],
                [t('fm.procedure.volume'), p.volume_ml],
                [t('fm.procedure.preHb'), p.pre_hb_g_dl], [t('fm.procedure.postHb'), p.post_hb_g_dl],
                [t('fm.procedure.antiD'), p.anti_d_given == null ? null : p.anti_d_given ? t('common.yes') : t('common.no')],
                [t('fm.procedure.tests'), p.tests.length ? p.tests.map((x) => t(`fm.testV.${x}`)).join(', ') : null],
                [t('fm.procedure.complications'), p.complications.length ? p.complications.map((x) => t(`fm.complicationV.${x}`)).join(', ') : null],
                [t('fm.procedure.operator'), profileName(byId.get(p.operator_id ?? ''), lang)],
              ]} />
              {p.result_summary && <p className={p.result_status === 'abnormal' ? 'font-medium text-red-800' : 'text-slate-700'}>{p.result_summary}</p>}
              {canWrite && p.result_status === 'pending' && <Button size="sm" variant="secondary" onClick={() => setModal({ result: p })}>{t('fm.procedure.enterResult')}</Button>}
            </li>
          ))}
        </ul>
      )}
      {modal === 'new' && <ProcedureModal d={d} patient={patient} sensitised={sensitised} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <ResultModal p={modal.result} onClose={() => setModal(null)} />}
    </Card>
  );
}

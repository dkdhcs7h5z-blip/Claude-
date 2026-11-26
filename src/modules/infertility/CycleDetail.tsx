import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Baby, Pencil, Plus, Snowflake, Syringe } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, Textarea, type Tone } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import type { Embryo, EmbryoTransfer, FertilityCycle, FertilityDetail, Patient, Pregnancy } from '@/data/types';
import {
  betaHcgDue, cycleKpis, embryoGrade, embryoQuality, follicleSummary, kpiStatus, stimulationAlerts,
} from '@/clinical/fertility';
import { todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { num, orNull, str } from '@/modules/obstetrics/formUtils';
import { AlertList } from '@/modules/obstetrics/AlertList';
import { PregnancyFormModal } from '@/modules/obstetrics/PregnancyFormModal';
import { EnumField, NumField } from '@/modules/gynecology/fields';
import { parseFollicles } from './derive';

export const statusTone: Record<FertilityCycle['status'], Tone> = {
  planned: 'slate', stimulation: 'teal', retrieval: 'blue', transfer: 'violet', luteal: 'amber', completed: 'green', cancelled: 'slate',
};
const qualityTone = { good: 'green', fair: 'amber', poor: 'red', ungraded: 'slate' } as const;
const outcomeTone: Record<EmbryoTransfer['outcome'], Tone> = { pending: 'amber', negative: 'slate', biochemical: 'slate', clinical: 'green', ongoing: 'green', ectopic: 'red', miscarriage: 'red' };
const kpiTone = { benchmark: 'green', competent: 'blue', below: 'red' } as const;
const PROTOCOLS = ['antagonist', 'long_agonist', 'short_agonist', 'ppos', 'mild', 'natural', 'letrozole', 'clomiphene', 'hrt_fet', 'natural_fet'];
const CYCLE_TYPES = ['icsi', 'ivf', 'iui', 'fet', 'ovulation_induction', 'natural', 'oocyte_cryopreservation'];
const STATUSES = ['planned', 'stimulation', 'retrieval', 'transfer', 'luteal', 'completed', 'cancelled'];

function useInvalidate(patientId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['ivf', patientId] }); void qc.invalidateQueries({ queryKey: ['ivf-worklist'] });
    void qc.invalidateQueries({ queryKey: ['cryo'] }); void qc.invalidateQueries({ queryKey: ['clinical', patientId] });
  };
}
const modalFooter = (t: (k: string) => string, onClose: () => void, save: { isPending: boolean; mutate: () => void }, setError: (e: string | null) => void, disabled = false) => (
  <><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} disabled={disabled} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>
);

// ---------------------------------------------------------------------------
export function CycleModal({ patient, cycle, onClose }: { patient: Patient; cycle?: FertilityCycle | null; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(patient.id);
  const { access, activeClinicId } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    type: cycle?.cycle_type ?? 'icsi', start: cycle?.start_date ?? todayIso(), day1: str(cycle?.day1_date), indication: str(cycle?.indication),
    protocol: str(cycle?.stim_protocol), dose: str(cycle?.starting_dose_iu), gonadotropin: str(cycle?.gonadotropin), insemination: str(cycle?.insemination),
    sperm: str(cycle?.sperm_source), status: cycle?.status ?? 'planned', trigger: str(cycle?.trigger_type), triggerAt: cycle?.trigger_at ? cycle.trigger_at.slice(0, 16) : '',
    retrievalAt: str(cycle?.retrieval_at), oocytes: str(cycle?.oocytes_retrieved), mii: str(cycle?.mii_oocytes), pn: str(cycle?.fertilized_2pn),
    complications: str(cycle?.retrieval_complications), freezeAll: cycle?.freeze_all ?? false, freezeReason: str(cycle?.freeze_all_reason), cancel: str(cycle?.cancel_reason),
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const retrievalCycle = ['icsi', 'ivf', 'oocyte_cryopreservation'].includes(f.type);
  const body = {
    cycle_type: f.type as FertilityCycle['cycle_type'], start_date: f.start, day1_date: orNull(f.day1), indication: orNull(f.indication),
    stim_protocol: orNull(f.protocol), starting_dose_iu: num(f.dose), gonadotropin: orNull(f.gonadotropin), insemination: orNull(f.insemination),
    sperm_source: orNull(f.sperm), status: f.status as FertilityCycle['status'], trigger_type: orNull(f.trigger),
    trigger_at: f.triggerAt ? new Date(f.triggerAt).toISOString() : null,
    retrieval_at: retrievalCycle ? orNull(f.retrievalAt) : null, oocytes_retrieved: retrievalCycle ? num(f.oocytes) : null,
    mii_oocytes: retrievalCycle ? num(f.mii) : null, fertilized_2pn: retrievalCycle ? num(f.pn) : null,
    retrieval_complications: orNull(f.complications), freeze_all: f.freezeAll, freeze_all_reason: f.freezeAll ? orNull(f.freezeReason) : null,
    cancel_reason: f.status === 'cancelled' ? orNull(f.cancel) : null,
  } as Partial<FertilityCycle>;
  const clinicId = access?.memberships.some((m) => m.clinic_id === patient.clinic_id) ? patient.clinic_id : activeClinicId ?? access?.memberships[0]?.clinic_id ?? patient.clinic_id;
  const save = useMutation({
    mutationFn: async () => { if (cycle) await api.updateFertilityCycle(cycle.id, body); else await
      api.createFertilityCycle(patient.id, { ...(body as FertilityCycle), protocol: f.protocol ? t(`ivf.protocolV.${f.protocol}`) : null, outcome: null, clinic_id: clinicId }); },
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={cycle ? t('ivf.cycle.edit') : t('ivf.cycle.new')} footer={modalFooter(t, onClose, save, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <EnumField label={t('ivf.cycle.type')} value={f.type} onChange={(v) => set('type')(v as never)} values={CYCLE_TYPES} ns="ivf.cycleTypeV" empty={false} />
        <Field label={t('ivf.cycle.startDate')}><Input type="date" dir="ltr" value={f.start} onChange={(e) => set('start')(e.target.value)} /></Field>
        <Field label={t('ivf.cycle.day1')}><Input type="date" dir="ltr" value={f.day1} max={todayIso()} onChange={(e) => set('day1')(e.target.value)} /></Field>
        <EnumField label={t('ivf.cycle.protocol')} value={f.protocol} onChange={set('protocol')} values={PROTOCOLS} ns="ivf.protocolV" />
        <NumField label={t('ivf.cycle.dose')} value={f.dose} onChange={set('dose')} max={600} />
        <Field label={t('ivf.cycle.gonadotropin')}><Input value={f.gonadotropin} onChange={(e) => set('gonadotropin')(e.target.value)} /></Field>
        <EnumField label={t('ivf.cycle.insemination')} value={f.insemination} onChange={set('insemination')} values={['icsi', 'ivf', 'iui', 'none']} ns="ivf.inseminationV" />
        <EnumField label={t('ivf.cycle.spermSource')} value={f.sperm} onChange={set('sperm')} values={['partner_fresh', 'partner_frozen', 'donor', 'surgical']} ns="ivf.spermV" />
        <EnumField label={t('ivf.cycle.status')} value={f.status} onChange={(v) => set('status')(v as never)} values={STATUSES} ns="ivf.statusV" empty={false} />
        <EnumField label={t('ivf.cycle.trigger')} value={f.trigger} onChange={set('trigger')} values={['hcg', 'gnrh_agonist', 'dual', 'none']} ns="ivf.triggerV" />
        {f.trigger && f.trigger !== 'none' && <Field label={t('ivf.cycle.triggerAt')}><Input type="datetime-local" dir="ltr" value={f.triggerAt} onChange={(e) => set('triggerAt')(e.target.value)} /></Field>}
      </div>
      <Field label={t('ivf.cycle.indication')}><Input value={f.indication} onChange={(e) => set('indication')(e.target.value)} /></Field>
      {retrievalCycle && (
        <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
          <legend className="px-1 text-sm font-semibold text-slate-700">{t('ivf.cycle.retrieval')}</legend>
          <Field label={t('ivf.cycle.retrievalAt')}><Input type="date" dir="ltr" value={f.retrievalAt} min={f.start} max={todayIso()} onChange={(e) => set('retrievalAt')(e.target.value)} /></Field>
          <NumField label={t('ivf.cycle.oocytes')} value={f.oocytes} onChange={set('oocytes')} max={100} />
          <NumField label={t('ivf.cycle.mii')} value={f.mii} onChange={set('mii')} max={100} />
          <NumField label={t('ivf.cycle.twoPn')} value={f.pn} onChange={set('pn')} max={100} />
          <div className="col-span-2 sm:col-span-4"><Field label={t('ivf.cycle.complications')}><Input value={f.complications} onChange={(e) => set('complications')(e.target.value)} /></Field></div>
        </fieldset>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-end pb-2"><Checkbox label={t('ivf.cycle.freezeAll')} checked={f.freezeAll} onChange={set('freezeAll')} /></div>
        {f.freezeAll && <EnumField label={t('ivf.cycle.freezeReason')} value={f.freezeReason} onChange={set('freezeReason')} values={['ohss_risk', 'progesterone', 'endometrium', 'pgt', 'elective', 'other']} ns="ivf.freezeReasonV" />}
        {f.status === 'cancelled' && <Field label={t('ivf.cycle.cancelReason')}><Input value={f.cancel} onChange={(e) => set('cancel')(e.target.value)} /></Field>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
function MonitoringModal({ cycle, onClose }: { cycle: FertilityCycle; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(cycle.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ date: todayIso(), day: '', e2: '', lh: '', p4: '', endo: '', right: '', left: '', dose: '', antagonist: false });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const right = parseFollicles(f.right), left = parseFollicles(f.left);
  const summary = follicleSummary(right, left);
  const live = stimulationAlerts({ follicles_right: right, follicles_left: left, e2_pmol_l: num(f.e2), lh_iu_l: num(f.lh), p4_nmol_l: num(f.p4), endometrium_mm: num(f.endo), antagonist: f.antagonist },
    { protocol: cycle.stim_protocol, triggered: !!cycle.trigger_at });
  const save = useMutation({
    mutationFn: () => api.recordMonitoring(cycle.id, {
      monitored_on: f.date, stim_day: num(f.day), e2_pmol_l: num(f.e2), lh_iu_l: num(f.lh), p4_nmol_l: num(f.p4), endometrium_mm: num(f.endo),
      follicles_right: right, follicles_left: left, fsh_dose_iu: num(f.dose), antagonist: f.antagonist, notes: null,
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('ivf.monitoring.new')} footer={modalFooter(t, onClose, save, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t('ivf.monitoring.date')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <NumField label={t('ivf.monitoring.stimDay')} value={f.day} onChange={set('day')} max={30} />
        <NumField label={t('ivf.monitoring.dose')} value={f.dose} onChange={set('dose')} max={600} />
        <NumField label={t('ivf.monitoring.endometrium')} value={f.endo} onChange={set('endo')} max={30} step={0.1} />
        <NumField label={t('ivf.monitoring.e2')} value={f.e2} onChange={set('e2')} max={50000} />
        <NumField label={t('ivf.monitoring.lh')} value={f.lh} onChange={set('lh')} max={200} step={0.1} />
        <NumField label={t('ivf.monitoring.p4')} value={f.p4} onChange={set('p4')} max={200} step={0.01} />
        <div className="flex items-end pb-2"><Checkbox label={t('ivf.monitoring.antagonist')} checked={f.antagonist} onChange={set('antagonist')} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('ivf.monitoring.right')} help={t('ivf.monitoring.follicleHelp')}><Input dir="ltr" value={f.right} onChange={(e) => set('right')(e.target.value)} /></Field>
        <Field label={t('ivf.monitoring.left')}><Input dir="ltr" value={f.left} onChange={(e) => set('left')(e.target.value)} /></Field>
      </div>
      <p className="ltr-num rounded-lg bg-slate-50 p-2.5 text-sm">
        {t('ivf.monitoring.total')} {summary.total} · {t('ivf.monitoring.ge14')} {summary.ge14} · {t('ivf.monitoring.ge17')} {summary.ge17} · {t('ivf.monitoring.leading')} {summary.leading ?? '—'}
      </p>
      {live.length > 0 && <AlertList alerts={live} />}
    </Modal>
  );
}

function EmbryoModal({ cycle, embryo, nextNo, onClose }: { cycle: FertilityCycle; embryo?: Embryo | null; nextNo: number; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(cycle.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    no: str(embryo?.embryo_no ?? nextNo), day: str(embryo?.day_observed ?? 5), stage: embryo?.stage ?? 'blastocyst', cells: str(embryo?.cell_count),
    frag: str(embryo?.fragmentation_grade), exp: str(embryo?.blast_expansion), icm: str(embryo?.icm_grade), te: str(embryo?.te_grade),
    pgt: embryo?.pgt_result ?? 'not_tested', status: embryo?.status ?? 'in_culture', frozenAt: str(embryo?.frozen_at), location: str(embryo?.storage_location),
    consent: str(embryo?.consent_expires_on), notes: str(embryo?.notes),
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const blast = f.stage === 'blastocyst';
  const e = {
    embryo_no: Number(f.no), day_observed: num(f.day), stage: f.stage as Embryo['stage'], cell_count: !blast ? num(f.cells) : null,
    fragmentation_grade: !blast ? num(f.frag) : null, blast_expansion: blast ? num(f.exp) : null, icm_grade: blast ? orNull<'A' | 'B' | 'C'>(f.icm) : null,
    te_grade: blast ? orNull<'A' | 'B' | 'C'>(f.te) : null, pgt_result: f.pgt as Embryo['pgt_result'], status: f.status as Embryo['status'],
    frozen_at: f.status === 'frozen' || f.status === 'thawed' ? orNull(f.frozenAt) : null, storage_location: f.status === 'frozen' ? orNull(f.location) : null,
    consent_expires_on: f.status === 'frozen' ? orNull(f.consent) : null, notes: orNull(f.notes),
  };
  const save = useMutation({
    mutationFn: () => api.saveEmbryo(cycle.id, e, embryo?.id),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (err) => setError((err as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={embryo ? t('ivf.embryology.edit') : t('ivf.embryology.add')} footer={modalFooter(t, onClose, save, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField label={t('ivf.embryology.no')} value={f.no} onChange={set('no')} min={1} max={100} />
        <NumField label={t('ivf.embryology.day')} value={f.day} onChange={set('day')} min={1} max={7} />
        <EnumField label={t('ivf.embryology.stage')} value={f.stage} onChange={set('stage')} values={['zygote', 'cleavage', 'morula', 'blastocyst', 'arrested']} ns="ivf.stageV" empty={false} />
        <EnumField label={t('ivf.embryology.pgt')} value={f.pgt} onChange={set('pgt')} values={['not_tested', 'pending', 'euploid', 'aneuploid', 'mosaic', 'no_result']} ns="ivf.pgtV" empty={false} />
        {blast ? <>
          <NumField label={t('ivf.embryology.expansion')} value={f.exp} onChange={set('exp')} min={1} max={6} />
          <Field label={t('ivf.embryology.icm')}><select className="input" value={f.icm} onChange={(ev) => set('icm')(ev.target.value)}><option value="">—</option>{['A', 'B', 'C'].map((g) => <option key={g}>{g}</option>)}</select></Field>
          <Field label={t('ivf.embryology.te')}><select className="input" value={f.te} onChange={(ev) => set('te')(ev.target.value)}><option value="">—</option>{['A', 'B', 'C'].map((g) => <option key={g}>{g}</option>)}</select></Field>
        </> : <>
          <NumField label={t('ivf.embryology.cells')} value={f.cells} onChange={set('cells')} min={1} max={32} />
          <NumField label={t('ivf.embryology.fragmentation')} value={f.frag} onChange={set('frag')} min={1} max={4} />
        </>}
        <EnumField label={t('ivf.embryology.status')} value={f.status} onChange={set('status')} values={['in_culture', 'frozen', 'thawed', 'discarded']} ns="ivf.embryoStatusV" empty={false} />
      </div>
      <p className="text-sm">{t('ivf.embryology.grade')}: <strong className="ltr-num">{embryoGrade(e)}</strong> · {t('ivf.embryology.quality')}: <Badge tone={qualityTone[embryoQuality(e)]}>{t(`ivf.qualityV.${embryoQuality(e)}`)}</Badge></p>
      {f.status === 'frozen' && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('ivf.embryology.frozenAt')}><Input type="date" dir="ltr" value={f.frozenAt} max={todayIso()} onChange={(ev) => set('frozenAt')(ev.target.value)} /></Field>
          <Field label={t('ivf.embryology.location')}><Input value={f.location} placeholder="Tank / Canister / Straw" onChange={(ev) => set('location')(ev.target.value)} /></Field>
          <Field label={t('ivf.embryology.consent')}><Input type="date" dir="ltr" value={f.consent} min={f.frozenAt || undefined} onChange={(ev) => set('consent')(ev.target.value)} /></Field>
        </div>
      )}
    </Modal>
  );
}

function TransferModal({ cycle, embryos, onClose }: { cycle: FertilityCycle; embryos: Embryo[]; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(cycle.patient_id);
  const [error, setError] = useState<string | null>(null);
  const available = embryos.filter((e) => ['in_culture', 'frozen', 'thawed'].includes(e.status));
  const [selected, setSelected] = useState<string[]>([]);
  const [f, setF] = useState({ date: todayIso(), fresh: cycle.cycle_type !== 'fet', day: '5', count: '1', endo: '', difficulty: 'easy', notes: '' });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const count = selected.length || Number(f.count) || 1;
  const save = useMutation({
    mutationFn: () => api.recordTransfer(cycle.id, {
      transfer_on: f.date, fresh: f.fresh, embryo_ids: selected, embryos_transferred: count, embryo_day: Number(f.day), endometrium_mm: num(f.endo),
      difficulty: orNull(f.difficulty), notes: orNull(f.notes),
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('ivf.transfer.new')} footer={modalFooter(t, onClose, save, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={t('ivf.transfer.date')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <EnumField label={t('ivf.transfer.day')} value={f.day} onChange={set('day')} values={['2', '3', '5', '6', '7']} ns="ivf.dayV" empty={false} />
        <NumField label={t('ivf.transfer.endometrium')} value={f.endo} onChange={set('endo')} max={30} step={0.1} />
        <EnumField label={t('ivf.transfer.difficulty')} value={f.difficulty} onChange={set('difficulty')} values={['easy', 'difficult', 'very_difficult']} ns="ivf.difficultyV" empty={false} />
      </div>
      <Checkbox label={t('ivf.transfer.fresh')} checked={f.fresh} onChange={set('fresh')} />
      {available.length > 0 ? (
        <fieldset>
          <legend className="label">{t('ivf.transfer.select')}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {available.map((e) => (
              <Checkbox key={e.id} label={`#${e.embryo_no} · ${embryoGrade(e)} · ${t(`ivf.embryoStatusV.${e.status}`)}`} checked={selected.includes(e.id)}
                onChange={(v) => setSelected((s) => (v ? [...s, e.id] : s.filter((x) => x !== e.id)))} />
            ))}
          </div>
        </fieldset>
      ) : <NumField label={t('ivf.transfer.embryos')} value={f.count} onChange={set('count')} min={1} max={4} />}
      <Field label={t('ob.visit.notes')}><Textarea value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
    </Modal>
  );
}

function OutcomeModal({ transfer, onClose }: { transfer: EmbryoTransfer; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(transfer.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    hcgOn: transfer.beta_hcg_on ?? betaHcgDue(transfer.transfer_on, transfer.embryo_day), hcg: str(transfer.beta_hcg_value),
    sacs: str(transfer.gestational_sacs), hearts: str(transfer.fetal_hearts), outcome: transfer.outcome,
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => api.updateTransfer(transfer.id, {
      beta_hcg_on: orNull(f.hcgOn), beta_hcg_value: num(f.hcg), gestational_sacs: num(f.sacs), fetal_hearts: num(f.hearts), outcome: f.outcome as EmbryoTransfer['outcome'],
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal open onClose={onClose} title={t('ivf.transfer.recordOutcome')} footer={modalFooter(t, onClose, save, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ivf.transfer.hcgDate')}><Input type="date" dir="ltr" value={f.hcgOn} min={transfer.transfer_on} onChange={(e) => set('hcgOn')(e.target.value)} /></Field>
        <NumField label={t('ivf.transfer.hcgValue')} value={f.hcg} onChange={set('hcg')} max={1000000} step={0.1} />
        <NumField label={t('ivf.transfer.sacs')} value={f.sacs} onChange={set('sacs')} max={6} />
        <NumField label={t('ivf.transfer.hearts')} value={f.hearts} onChange={set('hearts')} max={6} />
      </div>
      <EnumField label={t('ivf.transfer.outcome')} value={f.outcome} onChange={set('outcome')} values={['pending', 'negative', 'biochemical', 'clinical', 'ongoing', 'ectopic', 'miscarriage']} ns="ivf.transferOutcomeV" empty={false} />
    </Modal>
  );
}

// ---------------------------------------------------------------------------
export function CycleDetail({ patient, cycle, detail, canWrite }: { patient: Patient; cycle: FertilityCycle; detail: FertilityDetail; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const invalidate = useInvalidate(patient.id);
  const [modal, setModal] = useState<null | 'edit' | 'monitor' | 'embryo' | 'transfer' | { outcome: EmbryoTransfer } | { embryo: Embryo } | { pregnancy: EmbryoTransfer }>(null);
  const monitoring = detail.monitoring.filter((m) => m.cycle_id === cycle.id);
  const embryos = detail.embryos.filter((e) => e.cycle_id === cycle.id);
  const transfers = detail.transfers.filter((x) => x.cycle_id === cycle.id);
  const latest = monitoring.at(-1);
  const alerts = latest && !['completed', 'cancelled'].includes(cycle.status)
    ? stimulationAlerts(latest, { protocol: cycle.stim_protocol, triggered: !!cycle.trigger_at }) : [];
  const pendingTransfer = transfers.find((x) => x.outcome === 'pending');
  if (pendingTransfer) alerts.push({ code: 'beta_hcg_due', severity: 'info', values: { date: formatDate(betaHcgDue(pendingTransfer.transfer_on, pendingTransfer.embryo_day), lang) } });
  const kpis = cycleKpis({
    insemination: cycle.insemination ?? null, oocytes: cycle.oocytes_retrieved ?? null, mii: cycle.mii_oocytes ?? null, fertilized2pn: cycle.fertilized_2pn ?? null,
    blastocysts: embryos.filter((e) => e.stage === 'blastocyst').length, transfers,
  });
  const dayOf = (m: typeof monitoring[number], i: number) => m.stim_day ?? i + 1;
  const sorted = (m: typeof monitoring[number]) => [...m.follicles_right, ...m.follicles_left].sort((a, b) => b - a);
  const xMax = Math.max(12, ...monitoring.map((m, i) => dayOf(m, i) + 1));
  const link = useMutation({ mutationFn: (v: { id: string; pregnancyId: string }) => api.updateTransfer(v.id, { pregnancy_id: v.pregnancyId }), onSuccess: invalidate });

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold">{t('ivf.cycle.number', { n: cycle.cycle_number ?? '—' })} · {t(`ivf.cycleTypeV.${cycle.cycle_type}`)}</h3>
              <Badge tone={statusTone[cycle.status]}>{t(`ivf.statusV.${cycle.status}`)}</Badge>
              {cycle.freeze_all && <Badge tone="blue" icon={<Snowflake className="h-3 w-3" />}>{t('ivf.cycle.freezeAll')}{cycle.freeze_all_reason && ` · ${t(`ivf.freezeReasonV.${cycle.freeze_all_reason}`)}`}</Badge>}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {formatDate(cycle.start_date, lang)}{cycle.stim_protocol && <> · {t(`ivf.protocolV.${cycle.stim_protocol}`)}</>}
              {cycle.starting_dose_iu != null && <> · <span className="ltr-num">{cycle.starting_dose_iu} IU</span></>}{cycle.gonadotropin && <> {cycle.gonadotropin}</>}
              {cycle.insemination && <> · {t(`ivf.inseminationV.${cycle.insemination}`)}</>}
            </p>
            {cycle.indication && <p className="text-sm text-slate-600">{t('ivf.cycle.indication')}: {cycle.indication}</p>}
            {cycle.retrieval_at && (
              <p className="ltr-num mt-1 text-sm font-medium">{t('ivf.cycle.retrieval')} {formatDate(cycle.retrieval_at, lang)}: {t('ivf.cycle.oocytes')} {cycle.oocytes_retrieved ?? '–'} · MII {cycle.mii_oocytes ?? '–'} · 2PN {cycle.fertilized_2pn ?? '–'}</p>
            )}
            {cycle.trigger_at && <p className="text-xs text-slate-500">{t('ivf.cycle.trigger')}: {cycle.trigger_type ? t(`ivf.triggerV.${cycle.trigger_type}`) : ''} · {formatDate(cycle.trigger_at, lang)}</p>}
          </div>
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setModal('edit')}>{t('ivf.cycle.edit')}</Button>
              <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal('monitor')}>{t('ivf.monitoring.new')}</Button>
            </div>
          )}
        </div>
      </div>

      {alerts.length > 0 && <Card title={t('ob.alerts.title')}><AlertList alerts={alerts} /></Card>}

      <Card title={t('ivf.monitoring.title')}>
        {!monitoring.length ? <EmptyState title={t('ivf.monitoring.none')} /> : (
          <>
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <LineChart title={t('ivf.monitoring.chartSize')} xDomain={[0, xMax]} yDomain={[0, 25]} tickStep={2}
                formatX={(x) => `${t('ivf.monitoring.stimDay')} ${x}`} formatTick={(x) => String(x)} emptyText=""
                series={[
                  { key: 'lead', label: t('ivf.monitoring.leadingSeries'), color: '#257de0', points: monitoring.map((m, i) => ({ x: dayOf(m, i), y: sorted(m)[0] })).filter((p) => p.y != null) },
                  { key: 'third', label: t('ivf.monitoring.thirdSeries'), color: '#f47230', points: monitoring.map((m, i) => ({ x: dayOf(m, i), y: sorted(m)[2] })).filter((p) => p.y != null) },
                ]}
                refLines={[{ y: 17, label: '17' }]} />
              <LineChart title={t('ivf.monitoring.chartE2')} xDomain={[0, xMax]} tickStep={2} formatX={(x) => `${t('ivf.monitoring.stimDay')} ${x}`}
                formatTick={(x) => String(x)} formatY={(y) => String(Math.round(y))} emptyText=""
                series={[{ key: 'e2', label: 'E2', color: '#257de0', points: monitoring.filter((m) => m.e2_pmol_l != null).map((m) => ({ x: dayOf(m, monitoring.indexOf(m)), y: m.e2_pmol_l! })) }]} />
            </div>
            <p className="mt-1 text-xs text-slate-500">{t('ivf.monitoring.stimDayAxis')}</p>
            <div className="relative -mx-4 mt-4 overflow-x-auto sm:-mx-5">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50"><tr>
                  {[t('ivf.monitoring.date'), t('ivf.monitoring.stimDay'), t('ivf.monitoring.right'), t('ivf.monitoring.left'), t('ivf.monitoring.ge17'), t('ivf.monitoring.ge14'),
                    'E2', 'LH', 'P4', t('ivf.monitoring.endometrium'), t('ivf.monitoring.dose')].map((h) => <th key={h} className="table-th">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {[...monitoring].reverse().map((m) => {
                    const s = follicleSummary(m.follicles_right, m.follicles_left);
                    return (
                      <tr key={m.id}>
                        <td className="table-td whitespace-nowrap">{formatDate(m.monitored_on, lang)}</td>
                        <td className="table-td tabular-nums">{m.stim_day ?? '—'}{m.antagonist && <Syringe className="ms-1 inline h-3.5 w-3.5 text-violet-600" aria-label={t('ivf.monitoring.antagonist')} />}</td>
                        <td className="table-td ltr-num text-xs">{m.follicles_right.join(' ') || '—'}</td>
                        <td className="table-td ltr-num text-xs">{m.follicles_left.join(' ') || '—'}</td>
                        <td className="table-td font-semibold tabular-nums">{s.ge17}</td>
                        <td className="table-td tabular-nums">{s.ge14}</td>
                        <td className="table-td tabular-nums">{m.e2_pmol_l ?? '—'}</td>
                        <td className="table-td tabular-nums">{m.lh_iu_l ?? '—'}</td>
                        <td className="table-td tabular-nums">{m.p4_nmol_l ?? '—'}</td>
                        <td className="table-td tabular-nums">{m.endometrium_mm ?? '—'}</td>
                        <td className="table-td tabular-nums">{m.fsh_dose_iu ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {['icsi', 'ivf', 'fet', 'oocyte_cryopreservation'].includes(cycle.cycle_type) && (
        <Card title={t('ivf.embryology.title')} actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal('embryo')}>{t('ivf.embryology.add')}</Button>}>
          {!embryos.length ? <EmptyState title={t('ivf.embryology.none')} /> : (
            <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50"><tr>
                  {[t('ivf.embryology.no'), t('ivf.embryology.day'), t('ivf.embryology.stage'), t('ivf.embryology.grade'), t('ivf.embryology.quality'), t('ivf.embryology.pgt'),
                    t('ivf.embryology.status'), t('ivf.embryology.location'), ''].map((h, i) => <th key={i} className="table-th">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {embryos.map((e) => {
                    const q = embryoQuality(e);
                    return (
                      <tr key={e.id}>
                        <td className="table-td font-semibold">#{e.embryo_no}</td>
                        <td className="table-td">D{e.day_observed ?? '–'}</td>
                        <td className="table-td">{t(`ivf.stageV.${e.stage}`)}</td>
                        <td className="table-td ltr-num font-semibold">{embryoGrade(e)}</td>
                        <td className="table-td"><Badge tone={qualityTone[q]}>{t(`ivf.qualityV.${q}`)}</Badge></td>
                        <td className="table-td text-xs">{t(`ivf.pgtV.${e.pgt_result}`)}</td>
                        <td className="table-td"><Badge tone={e.status === 'frozen' ? 'blue' : e.status === 'transferred' ? 'green' : 'slate'}>{t(`ivf.embryoStatusV.${e.status}`)}</Badge></td>
                        <td className="table-td text-xs">{e.storage_location ?? '—'}{e.consent_expires_on && <span className="block text-slate-400">{t('ivf.embryology.consent')}: {formatDate(e.consent_expires_on, lang)}</span>}</td>
                        <td className="table-td">{canWrite && e.status !== 'transferred' && <Button size="sm" variant="ghost" aria-label={t('common.edit')} icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setModal({ embryo: e })} />}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {(cycle.oocytes_retrieved != null || embryos.length > 0) && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ivf.embryology.kpis')}</p>
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(Object.keys(kpis) as Array<keyof typeof kpis>).map((k) => {
                  const st = kpiStatus(kpis[k]);
                  return (
                    <div key={k} className="rounded-lg border border-slate-200 p-2.5">
                      <dt className="text-xs text-slate-500">{t(`ivf.embryology.kpiNames.${k}`)}</dt>
                      <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="ltr-num text-lg font-semibold">{kpis[k].value != null ? `${kpis[k].value}%` : '—'}</span>
                        {st && <Badge tone={kpiTone[st]}>{t(`ivf.embryology.kpiStatusV.${st}`)}</Badge>}
                      </dd>
                      <dd className="text-[11px] text-slate-400">{t('ivf.embryology.kpiHelp', { c: kpis[k].competence, b: kpis[k].benchmark })}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          )}
        </Card>
      )}

      {cycle.cycle_type !== 'oocyte_cryopreservation' && (
        <Card title={t('ivf.transfer.title')} actions={canWrite && cycle.cycle_type !== 'iui' && cycle.cycle_type !== 'ovulation_induction' && cycle.cycle_type !== 'natural' &&
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal('transfer')}>{t('ivf.transfer.new')}</Button>}>
          {!transfers.length ? <EmptyState title={t('ivf.transfer.none')} /> : (
            <ul className="space-y-3">
              {[...transfers].reverse().map((x) => {
                const ids = x.embryo_ids.map((id) => embryos.find((e) => e.id === id)).filter(Boolean) as Embryo[];
                return (
                  <li key={x.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{formatDate(x.transfer_on, lang)} · {x.fresh ? t('ivf.transfer.fresh') : t('ivf.transfer.frozen')} · D{x.embryo_day} × {x.embryos_transferred}</p>
                      <Badge tone={outcomeTone[x.outcome]}>{t(`ivf.transferOutcomeV.${x.outcome}`)}</Badge>
                    </div>
                    <p className="ltr-num mt-1 text-xs text-slate-600">
                      {ids.map((e) => `#${e.embryo_no} ${embryoGrade(e)}`).join(', ')}{x.endometrium_mm != null && ` · ${t('ivf.transfer.endometrium')} ${x.endometrium_mm}`}
                      {x.beta_hcg_value != null && ` · β-hCG ${x.beta_hcg_value}`}{x.gestational_sacs != null && ` · ${t('ivf.transfer.sacs')} ${x.gestational_sacs}`}
                      {x.fetal_hearts != null && ` · ${t('ivf.transfer.hearts')} ${x.fetal_hearts}`}
                    </p>
                    {x.outcome === 'pending' && <p className="mt-1 text-xs font-medium text-amber-700">{t('ivf.transfer.hcgDue', { date: formatDate(betaHcgDue(x.transfer_on, x.embryo_day), lang) })}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {canWrite && <Button size="sm" variant="secondary" onClick={() => setModal({ outcome: x })}>{t('ivf.transfer.recordOutcome')}</Button>}
                      {['clinical', 'ongoing'].includes(x.outcome) && (x.pregnancy_id
                        ? <Badge tone="green" icon={<Baby className="h-3 w-3" />}>{t('ivf.transfer.linkedPregnancy')}</Badge>
                        : canWrite && <Button size="sm" icon={<Baby className="h-3.5 w-3.5" />} onClick={() => setModal({ pregnancy: x })}>{t('ivf.transfer.registerPregnancy')}</Button>)}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {modal === 'edit' && <CycleModal patient={patient} cycle={cycle} onClose={() => setModal(null)} />}
      {modal === 'monitor' && <MonitoringModal cycle={cycle} onClose={() => setModal(null)} />}
      {modal === 'embryo' && <EmbryoModal cycle={cycle} nextNo={Math.max(0, ...embryos.map((e) => e.embryo_no)) + 1} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'embryo' in modal && <EmbryoModal cycle={cycle} embryo={modal.embryo} nextNo={0} onClose={() => setModal(null)} />}
      {modal === 'transfer' && <TransferModal cycle={cycle} embryos={embryos} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'outcome' in modal && <OutcomeModal transfer={modal.outcome} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && 'pregnancy' in modal && (
        <PregnancyFormModal open patient={patient} onClose={() => setModal(null)}
          prefill={{ transferDate: modal.pregnancy.transfer_on, embryoAgeDays: (modal.pregnancy.embryo_day >= 6 ? 6 : modal.pregnancy.embryo_day >= 5 ? 5 : 3) as 3 | 5 | 6,
            plurality: Math.max(1, modal.pregnancy.fetal_hearts ?? modal.pregnancy.gestational_sacs ?? 1), conception: cycle.insemination === 'ivf' ? 'ivf' : 'icsi' }}
          onSaved={(p: Pregnancy) => link.mutate({ id: modal.pregnancy.id, pregnancyId: p.id })} />
      )}
    </div>
  );
}

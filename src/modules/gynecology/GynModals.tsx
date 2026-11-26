import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Checkbox, Field, Input, Modal, Textarea } from '@/components/ui';
import type { Fibroid, GynProfile, GynUltrasound, GynVisitInput, GynVisitRow, Patient } from '@/data/types';
import { RMI_FEATURES } from '@/clinical/ovarian';
import { OvarianRiskBlock } from './Assessments';
import { FIGO_FIBROID_TYPES, GYN_COMPLAINTS, IOTA_B, IOTA_M, PALM_COEIN, iotaSimpleRules } from '@/clinical/gynecology';
import { todayIso } from '@/clinical/obstetrics';
import { num, orNull, str } from '@/modules/obstetrics/formUtils';
import { BoolField, ChipSelect, EnumField, NumField, boolOrNull, boolStr } from './fields';

function useClinicFor(patient: Patient) {
  const { access, activeClinicId } = useAuth();
  return access?.memberships.some((m) => m.clinic_id === patient.clinic_id) ? patient.clinic_id
    : activeClinicId ?? access?.memberships[0]?.clinic_id ?? patient.clinic_id;
}

function useSave(patientId: string, fn: () => Promise<unknown>, onClose: () => void, setError: (e: string) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['gyn', patientId] });
      void qc.invalidateQueries({ queryKey: ['gyn-worklist'] });
      void qc.invalidateQueries({ queryKey: ['patient', patientId] });
      onClose();
    },
    onError: (e) => setError((e as Error).message),
  });
}

const footer = (onClose: () => void, save: { isPending: boolean; mutate: () => void }, t: (k: string) => string, setError: (e: string | null) => void) => (
  <>
    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
    <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
  </>
);

// ---------------------------------------------------------------------------
export function HistoryModal({ patient, profile, onClose }: { patient: Patient; profile: GynProfile | null; onClose: () => void }) {
  const { t } = useTranslation();
  const clinicId = useClinicFor(patient);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    menarche: str(profile?.menarche_age), cycle: str(profile?.cycle_length_days), duration: str(profile?.period_duration_days),
    regularity: str(profile?.cycle_regularity), flow: str(profile?.menstrual_flow), dysmenorrhea: str(profile?.dysmenorrhea),
    menopause: str(profile?.menopause_status), menopauseAge: str(profile?.menopause_age), hrt: boolStr(profile?.on_hrt),
    contraception: str(profile?.contraception), active: boolStr(profile?.sexually_active), hpv: str(profile?.hpv_vaccinated),
    hysterectomy: str(profile?.hysterectomy ?? 'none'), surgery: str(profile?.previous_gyn_surgery), notes: str(profile?.notes),
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const post = ['postmenopausal', 'surgical'].includes(f.menopause);
  const save = useSave(patient.id, () => api.saveGynProfile(patient.id, {
    clinic_id: profile?.clinic_id ?? clinicId, menarche_age: num(f.menarche), cycle_length_days: num(f.cycle), period_duration_days: num(f.duration),
    cycle_regularity: orNull(f.regularity), menstrual_flow: orNull(f.flow), dysmenorrhea: orNull(f.dysmenorrhea),
    menopause_status: orNull(f.menopause), menopause_age: post ? num(f.menopauseAge) : null, on_hrt: post ? boolOrNull(f.hrt) : null,
    contraception: orNull(f.contraception), sexually_active: boolOrNull(f.active), hpv_vaccinated: orNull(f.hpv),
    hysterectomy: orNull(f.hysterectomy), previous_gyn_surgery: orNull(f.surgery), notes: orNull(f.notes),
  }), onClose, setError);

  return (
    <Modal wide open onClose={onClose} title={profile ? t('gyn.history.edit') : t('gyn.history.record')} footer={footer(onClose, save, t, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <NumField label={t('gyn.history.menarche')} value={f.menarche} onChange={set('menarche')} min={7} max={20} />
        <NumField label={t('gyn.history.cycleLength')} value={f.cycle} onChange={set('cycle')} min={15} max={120} />
        <NumField label={t('gyn.history.periodDuration')} value={f.duration} onChange={set('duration')} min={1} max={15} />
        <EnumField label={t('gyn.history.regularity')} value={f.regularity} onChange={set('regularity')} values={['regular', 'irregular', 'absent']} ns="gyn.regularityV" />
        <EnumField label={t('gyn.history.flow')} value={f.flow} onChange={set('flow')} values={['light', 'normal', 'heavy']} ns="gyn.flowV" />
        <EnumField label={t('gyn.history.dysmenorrhea')} value={f.dysmenorrhea} onChange={set('dysmenorrhea')} values={['none', 'mild', 'moderate', 'severe']} ns="gyn.dysmenorrheaV" />
        <EnumField label={t('gyn.history.menopauseStatus')} value={f.menopause} onChange={set('menopause')} values={['premenopausal', 'perimenopausal', 'postmenopausal', 'surgical']} ns="gyn.menopauseV" />
        {post && <NumField label={t('gyn.history.menopauseAge')} value={f.menopauseAge} onChange={set('menopauseAge')} min={25} max={65} />}
        {post && <BoolField label={t('gyn.history.hrt')} value={f.hrt} onChange={set('hrt')} />}
        <EnumField label={t('gyn.history.contraception')} value={f.contraception} onChange={set('contraception')}
          values={['none', 'coc', 'pop', 'iud_copper', 'lng_ius', 'implant', 'injectable', 'condom', 'sterilization', 'other']} ns="gyn.contraceptionV" />
        <BoolField label={t('gyn.history.sexuallyActive')} value={f.active} onChange={set('active')} />
        <EnumField label={t('gyn.history.hpvVaccinated')} value={f.hpv} onChange={set('hpv')} values={['yes', 'no', 'unknown']} ns="gyn.yesNoUnknownV" />
        <EnumField label={t('gyn.history.hysterectomy')} value={f.hysterectomy} onChange={set('hysterectomy')} values={['none', 'subtotal', 'total']} ns="gyn.hysterectomyV" empty={false} />
      </div>
      <Field label={t('gyn.history.previousSurgery')}><Textarea value={f.surgery} onChange={(e) => set('surgery')(e.target.value)} /></Field>
      <Field label={t('gyn.history.notes')}><Textarea value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
export function GynVisitModal({ patient, visit, onClose }: { patient: Patient; visit?: GynVisitRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const clinicId = useClinicFor(patient);
  const [error, setError] = useState<string | null>(null);
  const [complaints, setComplaints] = useState<string[]>(visit?.complaints ?? []);
  const [palm, setPalm] = useState<string[]>(visit?.palm_coein ?? []);
  const [f, setF] = useState({
    date: visit?.visit_date ?? todayIso(), lmp: str(visit?.lmp), pain: str(visit?.pain_score), sys: str(visit?.bp_systolic), dia: str(visit?.bp_diastolic),
    weight: str(visit?.weight_kg), height: str(visit?.height_cm), cha: visit?.clinical_hyperandrogenism ?? false, bha: visit?.biochemical_hyperandrogenism ?? false,
    abdominal: str(visit?.abdominal_exam), speculum: str(visit?.speculum_exam), bimanual: str(visit?.bimanual_exam), uterus: str(visit?.uterus_size),
    adnexal: visit?.adnexal_tenderness ?? false, cmt: visit?.cervical_motion_tenderness ?? false, pop: str(visit?.pop_stage),
    diagnosis: str(visit?.diagnosis), assessment: str(visit?.encounter.assessment), plan: str(visit?.encounter.plan), isPrivate: false,
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const bleeding = complaints.some((c) => ['aub', 'pmb', 'postcoital_bleeding'].includes(c));
  const payload: GynVisitInput = {
    visit_date: f.date, complaints, palm_coein: bleeding ? palm : [], lmp: f.lmp || null, pain_score: num(f.pain),
    bp_systolic: num(f.sys), bp_diastolic: num(f.dia), weight_kg: num(f.weight), height_cm: num(f.height),
    clinical_hyperandrogenism: f.cha, biochemical_hyperandrogenism: f.bha, abdominal_exam: orNull(f.abdominal), speculum_exam: orNull(f.speculum),
    bimanual_exam: orNull(f.bimanual), uterus_size: orNull<NonNullable<GynVisitInput['uterus_size']>>(f.uterus), adnexal_tenderness: f.adnexal, cervical_motion_tenderness: f.cmt,
    pop_stage: num(f.pop), diagnosis: orNull(f.diagnosis),
  };
  const narrative = { assessment: orNull(f.assessment), plan: orNull(f.plan), chief_complaint: complaints.map((c) => t(`gyn.complaintV.${c}`)).join(', ') || null };
  const save = useSave(patient.id, () => (visit
    ? api.updateGynVisit(visit.id, visit.encounter.id, payload, narrative)
    : api.recordGynVisit(patient.id, payload, { ...narrative, is_private: f.isPrivate, clinic_id: clinicId })), onClose, setError);

  return (
    <Modal wide open onClose={onClose} title={visit ? t('gyn.visit.edit') : t('gyn.visit.new')} footer={footer(onClose, save, t, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('ob.visit.date')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <Field label={t('gyn.visit.lmp')}><Input type="date" dir="ltr" value={f.lmp} max={f.date} onChange={(e) => set('lmp')(e.target.value)} /></Field>
        <NumField label={t('gyn.visit.pain')} value={f.pain} onChange={set('pain')} max={10} />
      </div>
      <ChipSelect legend={t('gyn.visit.complaints')} values={GYN_COMPLAINTS} selected={complaints} onChange={setComplaints} ns="gyn.complaintV" />
      {bleeding && <ChipSelect legend={t('gyn.visit.palmCoein')} help={t('gyn.visit.palmHelp')} values={PALM_COEIN} selected={palm} onChange={setPalm} ns="gyn.palmV" />}
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('gyn.visit.vitals')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField label={t('ob.visit.systolic')} value={f.sys} onChange={set('sys')} min={50} max={260} />
          <NumField label={t('ob.visit.diastolic')} value={f.dia} onChange={set('dia')} min={30} max={180} />
          <NumField label={t('ob.visit.weight')} value={f.weight} onChange={set('weight')} min={25} max={300} step={0.1} />
          <NumField label={t('ob.booking.height')} value={f.height} onChange={set('height')} min={100} max={230} step={0.1} />
        </div>
      </fieldset>
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('gyn.visit.exam')}</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t('gyn.visit.abdominal')}><Textarea value={f.abdominal} onChange={(e) => set('abdominal')(e.target.value)} /></Field>
          <Field label={t('gyn.visit.speculum')}><Textarea value={f.speculum} onChange={(e) => set('speculum')(e.target.value)} /></Field>
          <Field label={t('gyn.visit.bimanual')}><Textarea value={f.bimanual} onChange={(e) => set('bimanual')(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <EnumField label={t('gyn.visit.uterusSize')} value={f.uterus} onChange={set('uterus')} values={['normal', 'bulky', 'enlarged_lt12w', 'enlarged_ge12w', 'not_assessed']} ns="gyn.uterusSizeV" />
          <NumField label={t('gyn.visit.popStage')} value={f.pop} onChange={set('pop')} max={4} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Checkbox label={t('gyn.visit.adnexalTenderness')} checked={f.adnexal} onChange={set('adnexal')} />
          <Checkbox label={t('gyn.visit.cmt')} checked={f.cmt} onChange={set('cmt')} />
          <Checkbox label={t('gyn.visit.clinicalHA')} checked={f.cha} onChange={set('cha')} />
          <Checkbox label={t('gyn.visit.biochemicalHA')} checked={f.bha} onChange={set('bha')} />
        </div>
      </fieldset>
      <Field label={t('gyn.visit.diagnosis')}><Input value={f.diagnosis} onChange={(e) => set('diagnosis')(e.target.value)} /></Field>
      <Field label={t('ob.visit.assessment')}><Textarea value={f.assessment} onChange={(e) => set('assessment')(e.target.value)} /></Field>
      <Field label={t('ob.visit.plan')}><Textarea value={f.plan} onChange={(e) => set('plan')(e.target.value)} /></Field>
      {!visit && <Checkbox label={t('ob.visit.private')} help={t('ob.visit.privateHelp')} checked={f.isPrivate} onChange={set('isPrivate')} />}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
const iotaTone = { benign: 'green', malignant: 'red', inconclusive: 'amber' } as const;

export function UltrasoundModal({ patient, postmenopausal, ca125, he4, onClose }: {
  patient: Patient; postmenopausal: boolean; ca125: number | null; he4: number | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const clinicId = useClinicFor(patient);
  const [error, setError] = useState<string | null>(null);
  const [fibroids, setFibroids] = useState<Array<{ figo: string; size: string; location: string }>>([]);
  const [b, setB] = useState<string[]>([]);
  const [m, setM] = useState<string[]>([]);
  const [rmiF, setRmiF] = useState<string[]>([]);
  const [orads, setOrads] = useState('');
  const [f, setF] = useState({
    date: todayIso(), route: 'transvaginal', length: '', ap: '', width: '', position: '', et: '', endometrium: '',
    rVol: '', lVol: '', rFoll: '', lFoll: '', mass: false, side: '', diameter: '', fluid: '', impression: '',
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const iota = f.mass ? iotaSimpleRules(b, m) : null;
  const payload: Omit<GynUltrasound, 'id' | 'patient_id' | 'clinic_id' | 'performed_by'> = {
    performed_at: f.date === todayIso() ? new Date().toISOString() : `${f.date}T09:00:00.000Z`, route: orNull(f.route),
    uterus_length_mm: num(f.length), uterus_ap_mm: num(f.ap), uterus_width_mm: num(f.width), uterus_position: orNull(f.position),
    endometrial_thickness_mm: num(f.et), endometrium_appearance: orNull(f.endometrium),
    fibroids: fibroids.filter((x) => x.figo).map<Fibroid>((x) => ({ figo_type: x.figo, size_mm: num(x.size), location: orNull(x.location) })),
    right_ovary_volume_ml: num(f.rVol), left_ovary_volume_ml: num(f.lVol), right_follicle_count: num(f.rFoll), left_follicle_count: num(f.lFoll),
    adnexal_mass: f.mass, mass_side: f.mass ? orNull(f.side) : null, mass_max_diameter_mm: f.mass ? num(f.diameter) : null,
    iota_b_features: f.mass ? b : [], iota_m_features: f.mass ? m : [], free_fluid: orNull(f.fluid), impression: orNull(f.impression),
    orads_category: f.mass && orads !== '' ? Number(orads) : null, rmi_features: f.mass ? rmiF : [],
  };
  const save = useSave(patient.id, () => api.recordGynUltrasound(patient.id, { ...payload, clinic_id: clinicId }), onClose, setError);

  return (
    <Modal wide open onClose={onClose} title={t('gyn.us.new')} footer={footer(onClose, save, t, setError)}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('gyn.us.date')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <EnumField label={t('gyn.us.route')} value={f.route} onChange={set('route')} values={['transabdominal', 'transvaginal', 'transrectal']} ns="gyn.routeV" empty={false} />
        <EnumField label={t('gyn.us.position')} value={f.position} onChange={set('position')} values={['anteverted', 'retroverted', 'axial', 'absent']} ns="gyn.positionV" />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('gyn.us.uterus')}</legend>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          <NumField label="L (mm)" value={f.length} onChange={set('length')} max={300} step={0.1} />
          <NumField label="AP (mm)" value={f.ap} onChange={set('ap')} max={200} step={0.1} />
          <NumField label="W (mm)" value={f.width} onChange={set('width')} max={200} step={0.1} />
          <NumField label={t('gyn.us.et')} value={f.et} onChange={set('et')} max={50} step={0.1} />
          <EnumField label={t('gyn.us.endometrium')} value={f.endometrium} onChange={set('endometrium')} values={['normal', 'thickened', 'heterogeneous', 'polyp', 'fluid', 'not_seen']} ns="gyn.endometriumV" />
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">{t('gyn.us.fibroids')}</legend>
        <div className="space-y-2">
          {fibroids.map((fb, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_1fr_auto] items-end gap-2">
              <EnumField label={t('gyn.us.figoType')} value={fb.figo} onChange={(v) => setFibroids((a) => a.map((x, j) => (j === i ? { ...x, figo: v } : x)))} values={FIGO_FIBROID_TYPES} ns="gyn.figoV" />
              <NumField label={t('gyn.us.size')} value={fb.size} onChange={(v) => setFibroids((a) => a.map((x, j) => (j === i ? { ...x, size: v } : x)))} max={300} />
              <Field label={t('gyn.us.location')}><Input value={fb.location} onChange={(e) => setFibroids((a) => a.map((x, j) => (j === i ? { ...x, location: e.target.value } : x)))} /></Field>
              <Button variant="ghost" size="sm" className="mb-1" aria-label={t('gyn.us.remove')} icon={<Trash2 className="h-4 w-4" />} onClick={() => setFibroids((a) => a.filter((_, j) => j !== i))} />
            </div>
          ))}
          <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setFibroids((a) => [...a, { figo: '', size: '', location: '' }])}>{t('gyn.us.addFibroid')}</Button>
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-slate-700">{t('gyn.us.ovaries')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <NumField label={`${t('gyn.us.right')} — ${t('gyn.us.volume')}`} value={f.rVol} onChange={set('rVol')} max={1000} step={0.1} />
          <NumField label={`${t('gyn.us.right')} — ${t('gyn.us.follicles')}`} value={f.rFoll} onChange={set('rFoll')} max={100} />
          <NumField label={`${t('gyn.us.left')} — ${t('gyn.us.volume')}`} value={f.lVol} onChange={set('lVol')} max={1000} step={0.1} />
          <NumField label={`${t('gyn.us.left')} — ${t('gyn.us.follicles')}`} value={f.lFoll} onChange={set('lFoll')} max={100} />
        </div>
      </fieldset>
      <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3">
        <Checkbox label={t('gyn.us.adnexalMass')} checked={f.mass} onChange={set('mass')} />
        {f.mass && <>
          <div className="grid grid-cols-2 gap-3">
            <EnumField label={t('gyn.us.side')} value={f.side} onChange={set('side')} values={['right', 'left', 'bilateral']} ns="gyn.sideV" />
            <NumField label={t('gyn.us.diameter')} value={f.diameter} onChange={set('diameter')} min={1} max={400} />
          </div>
          <ChipSelect legend={t('gyn.us.iotaB')} values={IOTA_B} selected={b} onChange={setB} ns="gyn.iotaV" />
          <ChipSelect legend={t('gyn.us.iotaM')} values={IOTA_M} selected={m} onChange={setM} ns="gyn.iotaV" />
          {iota && <p className="text-sm">{t('gyn.us.iotaResult')}: <Badge tone={iotaTone[iota]}>{t(`gyn.iotaResultV.${iota}`)}</Badge></p>}
          <ChipSelect legend={t('gyn.ovarian.rmiFeatures')} values={RMI_FEATURES} selected={rmiF} onChange={setRmiF} ns="gyn.ovarian.rmiFeatureV" />
          <EnumField label={t('gyn.ovarian.orads')} value={orads} onChange={setOrads} values={['0', '1', '2', '3', '4', '5']} ns="gyn.ovarian.oradsV" />
          <OvarianRiskBlock orads={orads === '' ? null : Number(orads)} rmiFeatures={rmiF} postmenopausal={postmenopausal} ca125={ca125} he4={he4} />
        </>}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-3">
        <EnumField label={t('gyn.us.freeFluid')} value={f.fluid} onChange={set('fluid')} values={['none', 'small', 'moderate', 'large']} ns="gyn.fluidV" />
        <div className="sm:col-span-2"><Field label={t('gyn.us.impression')}><Input value={f.impression} onChange={(e) => set('impression')(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

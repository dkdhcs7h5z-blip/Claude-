import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FlaskRound, Pencil, Plus } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea, type Tone } from '@/components/ui';
import type { FertilityProfile, Patient, SemenAnalysis } from '@/data/types';
import { classifySemen } from '@/clinical/fertility';
import { todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { num, orNull, str } from '@/modules/obstetrics/formUtils';
import { BoolField, ChipSelect, EnumField, NumField, boolOrNull, boolStr } from '@/modules/gynecology/fields';
import type { deriveFertility } from './derive';

const levelTone: Record<string, Tone> = { very_low: 'red', low: 'amber', normal: 'green', high: 'violet' };
const responseTone: Record<string, Tone> = { poor: 'amber', normal: 'green', hyper: 'red' };

function useInvalidate(patientId: string) {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ['ivf', patientId] }); void qc.invalidateQueries({ queryKey: ['ivf-worklist'] }); void qc.invalidateQueries({ queryKey: ['patient', patientId] }); };
}

export function WorkupCard({ patient, profile, canWrite }: { patient: Patient; profile: FertilityProfile | null; canWrite: boolean }) {
  const { t, i18n } = useTranslation();
  const sep = i18n.language === 'ar' ? '، ' : ', ';
  const [open, setOpen] = useState(false);
  return (
    <Card title={t('ivf.workup.title')} actions={canWrite && <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{profile ? t('ivf.workup.edit') : t('ivf.workup.record')}</Button>}>
      {!profile ? <EmptyState title={t('ivf.workup.none')} /> : (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-slate-500">{t('ivf.workup.type')}</dt><dd className="font-semibold">{profile.infertility_type ? t(`ivf.infertilityTypeV.${profile.infertility_type}`) : '—'}{profile.duration_months != null && ` · ${t('ivf.workup.months', { n: profile.duration_months })}`}</dd></div>
          <div><dt className="text-xs text-slate-500">{t('ivf.workup.tubal')}</dt><dd className="font-semibold">{profile.tubal_assessment ? t(`ivf.tubalV.${profile.tubal_assessment}`) : '—'}{profile.tubal_method && <span className="font-normal text-slate-500"> ({t(`ivf.tubalMethodV.${profile.tubal_method}`)})</span>}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">{t('ivf.workup.femaleFactors')}</dt>
            <dd className="mt-0.5 flex flex-wrap gap-1">{profile.female_factors.length ? profile.female_factors.map((f) => <Badge key={f} tone="pink">{t(`ivf.femaleFactorV.${f}`)}</Badge>) : '—'}
              {profile.male_factor && <Badge tone="blue">{t('ivf.workup.maleFactor')}</Badge>}</dd></div>
          <div className="col-span-2"><dt className="text-xs text-slate-500">{t('ivf.workup.partner')}</dt><dd className="font-semibold">{[profile.partner_name, profile.partner_blood_group, profile.partner_dob && formatDate(profile.partner_dob, i18n.language === 'ar' ? 'ar' : 'en')].filter(Boolean).join(sep) || '—'}</dd></div>
          {profile.previous_treatments && <div className="col-span-2"><dt className="text-xs text-slate-500">{t('ivf.workup.previous')}</dt><dd>{profile.previous_treatments}</dd></div>}
        </dl>
      )}
      {open && <WorkupModal patient={patient} profile={profile} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function WorkupModal({ patient, profile, onClose }: { patient: Patient; profile: FertilityProfile | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { access, activeClinicId } = useAuth();
  const invalidate = useInvalidate(patient.id);
  const clinicId = profile?.clinic_id ?? (access?.memberships.some((m) => m.clinic_id === patient.clinic_id) ? patient.clinic_id : activeClinicId ?? access?.memberships[0]?.clinic_id ?? patient.clinic_id);
  const [error, setError] = useState<string | null>(null);
  const [factors, setFactors] = useState<string[]>(profile?.female_factors ?? []);
  const [f, setF] = useState({
    type: str(profile?.infertility_type), duration: str(profile?.duration_months), male: boolStr(profile?.male_factor), tubal: str(profile?.tubal_assessment),
    method: str(profile?.tubal_method), name: str(profile?.partner_name), dob: str(profile?.partner_dob), phone: str(profile?.partner_phone),
    blood: str(profile?.partner_blood_group), previous: str(profile?.previous_treatments), notes: str(profile?.notes),
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => api.saveFertilityProfile(patient.id, {
      clinic_id: clinicId, infertility_type: orNull(f.type), duration_months: num(f.duration), female_factors: factors, male_factor: boolOrNull(f.male),
      tubal_assessment: orNull(f.tubal), tubal_method: f.tubal && f.tubal !== 'not_done' ? orNull(f.method) : null, partner_name: orNull(f.name),
      partner_dob: orNull(f.dob), partner_phone: orNull(f.phone), partner_blood_group: orNull(f.blood), previous_treatments: orNull(f.previous), notes: orNull(f.notes),
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={profile ? t('ivf.workup.edit') : t('ivf.workup.record')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <EnumField label={t('ivf.workup.type')} value={f.type} onChange={set('type')} values={['primary', 'secondary']} ns="ivf.infertilityTypeV" />
        <NumField label={t('ivf.workup.duration')} value={f.duration} onChange={set('duration')} max={600} />
        <BoolField label={t('ivf.workup.maleFactor')} value={f.male} onChange={set('male')} />
        <EnumField label={t('ivf.workup.tubal')} value={f.tubal} onChange={set('tubal')} values={['not_done', 'bilateral_patent', 'unilateral_patent', 'bilateral_blocked', 'hydrosalpinx']} ns="ivf.tubalV" />
        {f.tubal && f.tubal !== 'not_done' && <EnumField label={t('ivf.workup.tubalMethod')} value={f.method} onChange={set('method')} values={['hsg', 'hycosy', 'laparoscopy']} ns="ivf.tubalMethodV" />}
      </div>
      <ChipSelect legend={t('ivf.workup.femaleFactors')} values={['ovulatory', 'tubal', 'endometriosis', 'uterine', 'diminished_reserve', 'unexplained', 'other']} selected={factors} onChange={setFactors} ns="ivf.femaleFactorV" />
      <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">{t('ivf.workup.partner')}</legend>
        <Field label={t('ivf.workup.partnerName')}><Input value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
        <Field label={t('ivf.workup.partnerDob')}><Input type="date" dir="ltr" value={f.dob} max={todayIso()} onChange={(e) => set('dob')(e.target.value)} /></Field>
        <Field label={t('ivf.workup.partnerPhone')}><Input type="tel" dir="ltr" value={f.phone} onChange={(e) => set('phone')(e.target.value)} /></Field>
        <Field label={t('ivf.workup.partnerBlood')}>
          <select className="input" value={f.blood} onChange={(e) => set('blood')(e.target.value)}>
            <option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}
          </select>
        </Field>
      </fieldset>
      <Field label={t('ivf.workup.previous')}><Textarea value={f.previous} onChange={(e) => set('previous')(e.target.value)} /></Field>
    </Modal>
  );
}

export function ReserveCard({ d }: { d: ReturnType<typeof deriveFertility> }) {
  const { t } = useTranslation();
  return (
    <Card title={t('ivf.reserve.title')}>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-slate-500">{t('ivf.reserve.amh')}</dt><dd className="font-semibold">{d.amh != null ? <><span className="ltr-num">{d.amh} ng/mL</span> <Badge tone={levelTone[d.amhLevel!]}>{t(`ivf.reserve.levelV.${d.amhLevel}`)}</Badge></> : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('ivf.reserve.afc')}</dt><dd className="font-semibold">{d.afc != null ? <><span className="ltr-num">{d.afc}</span> <Badge tone={levelTone[d.afcLevel!]}>{t(`ivf.reserve.levelV.${d.afcLevel}`)}</Badge></> : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('ivf.reserve.expected')}</dt><dd>{d.response ? <Badge tone={responseTone[d.response]}>{t(`ivf.reserve.responseV.${d.response}`)}</Badge> : '—'}</dd></div>
        <div><dt className="text-xs text-slate-500">{t('ivf.reserve.bologna')}</dt><dd className="font-semibold">{t('ivf.reserve.met', { n: d.bologna.met })}</dd></div>
      </dl>
      <p className="mt-2 text-[11px] text-slate-400">{t('ivf.reserve.source')}</p>
    </Card>
  );
}

export function SemenCard({ patient, items, canWrite }: { patient: Patient; items: SemenAnalysis[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  return (
    <Card title={<span className="flex items-center gap-2"><FlaskRound className="h-4 w-4 text-slate-400" />{t('ivf.semen.title')}</span>}
      actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('ivf.semen.new')}</Button>}>
      {!items.length ? <EmptyState title={t('ivf.semen.none')} /> : (
        <ul className="space-y-2">
          {[...items].reverse().map((s) => {
            const r = classifySemen(s);
            return (
              <li key={s.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{formatDate(s.collected_at, lang)} · {t(`ivf.semen.sampleTypeV.${s.sample_type}`)}</span>
                  <div className="flex flex-wrap gap-1">
                    {r.oat && <Badge tone="red">{t('ivf.semen.oat')}</Badge>}
                    {r.findings.map((f) => <Badge key={f} tone={f === 'normozoospermia' ? 'green' : 'amber'}>{t(`ivf.semen.findingV.${f}`)}</Badge>)}
                  </div>
                </div>
                <p className="ltr-num mt-1 text-xs text-slate-600">
                  {s.volume_ml ?? '–'} mL · {s.concentration_m_ml ?? '–'} M/mL · PR {s.progressive_pct ?? '–'}% · TM {s.total_motility_pct ?? '–'}% · NF {s.normal_forms_pct ?? '–'}%
                  {r.totalCount != null && <> · {t('ivf.semen.totalCount')} {r.totalCount} M</>}{r.tmsc != null && <> · {t('ivf.semen.tmsc')} {r.tmsc} M</>}
                  {s.dna_fragmentation_pct != null && <> · DFI {s.dna_fragmentation_pct}%</>}
                </p>
                {r.iui && <p className="mt-0.5 text-xs">{t('ivf.semen.iui')}: <strong>{t(`ivf.semen.iuiV.${r.iui}`)}</strong></p>}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-slate-400">{t('ivf.semen.source')}</p>
      {open && <SemenModal patient={patient} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function SemenModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(patient.id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ date: todayIso(), type: 'diagnostic', abst: '', vol: '', conc: '', pr: '', tm: '', nf: '', vit: '', ph: '', wbc: '', dfi: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const input = {
    volume_ml: num(f.vol), concentration_m_ml: num(f.conc), progressive_pct: num(f.pr), total_motility_pct: num(f.tm), normal_forms_pct: num(f.nf),
    vitality_pct: num(f.vit), leukocytes_m_ml: num(f.wbc), dna_fragmentation_pct: num(f.dfi),
  };
  const r = classifySemen(input);
  const save = useMutation({
    mutationFn: () => api.recordSemenAnalysis(patient.id, { ...input, collected_at: f.date, sample_type: f.type as SemenAnalysis['sample_type'], abstinence_days: num(f.abst), ph: num(f.ph), notes: null }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('ivf.semen.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('ivf.semen.date')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <EnumField label={t('ivf.semen.sampleType')} value={f.type} onChange={set('type')} values={['diagnostic', 'post_wash', 'frozen_thawed', 'surgical']} ns="ivf.semen.sampleTypeV" empty={false} />
        <NumField label={t('ivf.semen.abstinence')} value={f.abst} onChange={set('abst')} max={30} />
        <NumField label={t('ivf.semen.volume')} value={f.vol} onChange={set('vol')} max={20} step={0.1} />
        <NumField label={t('ivf.semen.concentration')} value={f.conc} onChange={set('conc')} max={500} step={0.1} />
        <NumField label={t('ivf.semen.progressive')} value={f.pr} onChange={set('pr')} max={100} step={0.5} />
        <NumField label={t('ivf.semen.totalMotility')} value={f.tm} onChange={set('tm')} max={100} step={0.5} />
        <NumField label={t('ivf.semen.normalForms')} value={f.nf} onChange={set('nf')} max={100} step={0.5} />
        <NumField label={t('ivf.semen.vitality')} value={f.vit} onChange={set('vit')} max={100} step={0.5} />
        <NumField label={t('ivf.semen.ph')} value={f.ph} onChange={set('ph')} min={6} max={9} step={0.1} />
        <NumField label={t('ivf.semen.leukocytes')} value={f.wbc} onChange={set('wbc')} max={50} step={0.1} />
        <NumField label={t('ivf.semen.dfi')} value={f.dfi} onChange={set('dfi')} max={100} step={0.5} />
      </div>
      {r.findings.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-50 p-3 text-sm">
          {r.findings.map((x) => <Badge key={x} tone={x === 'normozoospermia' ? 'green' : 'amber'}>{t(`ivf.semen.findingV.${x}`)}</Badge>)}
          {r.totalCount != null && <span className="ltr-num text-xs">· {t('ivf.semen.totalCount')} {r.totalCount} M</span>}
          {r.tmsc != null && <span className="ltr-num text-xs">· {t('ivf.semen.tmsc')} {r.tmsc} M</span>}
          {r.iui && <span className="w-full text-xs">{t('ivf.semen.iui')}: <strong>{t(`ivf.semen.iuiV.${r.iui}`)}</strong></span>}
        </div>
      )}
    </Modal>
  );
}

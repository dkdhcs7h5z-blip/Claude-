import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FlaskConical, Plus } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import type { FetalMedicineDetail, FmCfdna, FmFirstTrimester, FmFirstTrimesterInput } from '@/data/types';
import { CRL_SCREENING_RANGE, gaFromCrl, ntP95, screeningCategory } from '@/clinical/fetalMedicine';
import { formatGADays, todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { num, orNull, str } from '@/modules/obstetrics/formUtils';
import { AlertList } from '@/modules/obstetrics/AlertList';
import { firstTrimesterAlerts } from '@/clinical/fetalMedicine';
import { BoolField, EnumField, NumField, boolOrNull } from '@/modules/gynecology/fields';
import type { ScanGroup } from './derive';
import { FetusTabs, ModalFooter, callTone, categoryTone, fetusLabels, oneIn, useFmInvalidate } from './shared';

type FtForm = Record<'crl' | 'nt' | 'nb' | 'dv' | 'tr' | 'fhr' | 'pappa' | 'bhcg' | 't21' | 't18' | 't13' | 'method' | 'software' | 'anatomy', string>;
const emptyFt: FtForm = { crl: '', nt: '', nb: '', dv: '', tr: '', fhr: '', pappa: '', bhcg: '', t21: '', t18: '', t13: '', method: '', software: '', anatomy: '' };

function toInput(label: string, f: FtForm): FmFirstTrimesterInput {
  return {
    fetus_label: label as FmFirstTrimester['fetus_label'], crl_mm: num(f.crl), nt_mm: num(f.nt), nasal_bone: orNull(f.nb), dv_a_wave: orNull(f.dv),
    tricuspid_regurgitation: boolOrNull(f.tr), fhr: num(f.fhr), papp_a_mom: num(f.pappa), free_bhcg_mom: num(f.bhcg), risk_t21: num(f.t21),
    risk_t18: num(f.t18), risk_t13: num(f.t13), risk_method: orNull(f.method), risk_software: orNull(f.software), early_anatomy: orNull(f.anatomy), notes: null,
  };
}

function FirstTrimesterModal({ d, onClose }: { d: FetalMedicineDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const g = d.pregnancy;
  const labels = fetusLabels(g);
  const invalidate = useFmInvalidate(g.id, g.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [impression, setImpression] = useState('');
  const [fetus, setFetus] = useState<string>('A');
  const [forms, setForms] = useState<Record<string, FtForm>>(Object.fromEntries(labels.map((l) => [l, { ...emptyFt }])));
  const f = forms[fetus];
  const set = (k: keyof FtForm) => (v: string) => setForms((x) => ({ ...x, [fetus]: { ...x[fetus], [k]: v } }));
  const inputs = labels.map((l) => toInput(l, forms[l]));
  const live = firstTrimesterAlerts(inputs.map((i) => ({ ...i, fetus_label: i.fetus_label })));
  const crl = num(f.crl);
  const save = useMutation({
    mutationFn: () => api.recordFmScan(g.id, 'nt_scan', { performed_at: date === todayIso() ? new Date().toISOString() : `${date}T09:00:00.000Z`, impression: orNull(impression) }, inputs),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('fm.ft.new')} footer={<ModalFooter onClose={onClose} saving={save.isPending} onSave={() => { setError(null); save.mutate(); }} />}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('fm.scan.date')}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
      <FetusTabs labels={labels} value={fetus} onChange={setFetus} />
      <fieldset className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <legend className="sr-only">{t('fm.ft.markers')}</legend>
        <NumField label={t('fm.ft.crl')} value={f.crl} onChange={set('crl')} min={20} max={100} step={0.1} />
        <NumField label={t('fm.ft.nt')} value={f.nt} onChange={set('nt')} min={0.3} max={20} step={0.1} />
        <EnumField label={t('fm.ft.nasalBone')} value={f.nb} onChange={set('nb')} values={['present', 'absent', 'hypoplastic', 'not_assessed']} ns="fm.nasalBoneV" />
        <EnumField label={t('fm.ft.dv')} value={f.dv} onChange={set('dv')} values={['positive', 'absent', 'reversed', 'not_assessed']} ns="fm.aWaveV" />
        <BoolField label={t('fm.ft.tr')} value={f.tr} onChange={set('tr')} />
        <NumField label={t('fm.ft.fhr')} value={f.fhr} onChange={set('fhr')} min={60} max={240} />
        <NumField label={t('fm.ft.pappa')} value={f.pappa} onChange={set('pappa')} min={0.01} max={20} step={0.01} />
        <NumField label={t('fm.ft.bhcg')} value={f.bhcg} onChange={set('bhcg')} min={0.01} max={30} step={0.01} />
      </fieldset>
      {crl != null && (
        <p className="ltr-num rounded-lg bg-slate-50 p-2.5 text-sm">
          {t('fm.ft.gaByCrl', { ga: formatGADays(gaFromCrl(crl)) })} · {t('fm.ft.ntP95', { v: ntP95(crl) })}
          {(crl < CRL_SCREENING_RANGE[0] || crl > CRL_SCREENING_RANGE[1]) && ' · CRL 45–84 mm'}
        </p>
      )}
      <fieldset className="space-y-2 rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">{t('fm.ft.risks')}</legend>
        <p className="text-xs text-slate-500">{t('fm.ft.riskHelp')}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <NumField label={t('fm.ft.riskT21')} value={f.t21} onChange={set('t21')} min={2} max={1000000} />
          <NumField label={t('fm.ft.riskT18')} value={f.t18} onChange={set('t18')} min={2} max={1000000} />
          <NumField label={t('fm.ft.riskT13')} value={f.t13} onChange={set('t13')} min={2} max={1000000} />
          <EnumField label={t('fm.ft.method')} value={f.method} onChange={set('method')} values={['combined', 'nt_maternal_age', 'combined_extended', 'second_trimester', 'other']} ns="fm.methodV" />
          <Field label={t('fm.ft.software')}><Input value={f.software} onChange={(e) => set('software')(e.target.value)} /></Field>
        </div>
      </fieldset>
      <Field label={t('fm.ft.earlyAnatomy')}><Input value={f.anatomy} onChange={(e) => set('anatomy')(e.target.value)} /></Field>
      <Field label={t('fm.scan.impression')}><Textarea value={impression} onChange={(e) => setImpression(e.target.value)} /></Field>
      {live.length > 0 && <AlertList alerts={live} />}
    </Modal>
  );
}

function CfdnaSampleModal({ d, onClose }: { d: FetalMedicineDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useFmInvalidate(d.pregnancy.id, d.pregnancy.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ date: todayIso(), lab: '', notes: '' });
  const save = useMutation({
    mutationFn: () => api.recordCfdna(d.pregnancy.id, { sampled_on: f.date, laboratory: orNull(f.lab), notes: orNull(f.notes) }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal open onClose={onClose} title={t('fm.cfdna.new')} footer={<ModalFooter onClose={onClose} saving={save.isPending} onSave={() => { setError(null); save.mutate(); }} />}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('fm.cfdna.sampled')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={t('fm.cfdna.lab')}><Input value={f.lab} onChange={(e) => setF({ ...f, lab: e.target.value })} /></Field>
      </div>
      <Field label={t('ob.visit.notes')}><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Modal>
  );
}

function CfdnaResultModal({ c, onClose }: { c: FmCfdna; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useFmInvalidate(c.pregnancy_id, c.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    status: c.result_status === 'pending' ? 'resulted' : c.result_status, date: c.resulted_on ?? todayIso(), ff: str(c.fetal_fraction_pct),
    t21: c.t21 ?? 'low_risk', t18: c.t18 ?? 'low_risk', t13: c.t13 ?? 'low_risk', sca: c.sex_chromosomes ?? 'not_tested', sex: c.fetal_sex ?? 'not_reported',
  });
  const set = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const resulted = f.status === 'resulted';
  const save = useMutation({
    mutationFn: () => api.updateCfdna(c.id, {
      result_status: f.status as FmCfdna['result_status'], resulted_on: f.date, fetal_fraction_pct: num(f.ff),
      t21: resulted ? f.t21 as FmCfdna['t21'] : null, t18: resulted ? f.t18 as FmCfdna['t18'] : null, t13: resulted ? f.t13 as FmCfdna['t13'] : null,
      sex_chromosomes: resulted ? f.sca as FmCfdna['sex_chromosomes'] : null, fetal_sex: resulted ? f.sex as FmCfdna['fetal_sex'] : null,
    }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const calls = ['low_risk', 'high_risk', 'no_call', 'not_tested'];
  return (
    <Modal open onClose={onClose} title={t('fm.cfdna.result')} footer={<ModalFooter onClose={onClose} saving={save.isPending} onSave={() => { setError(null); save.mutate(); }} />}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <EnumField label={t('fm.cfdna.status')} value={f.status} onChange={set('status')} values={['resulted', 'failed']} ns="fm.cfdnaStatusV" empty={false} />
        <Field label={t('fm.cfdna.resultedOn')}><Input type="date" dir="ltr" value={f.date} min={c.sampled_on} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <NumField label={t('fm.cfdna.ff')} value={f.ff} onChange={set('ff')} max={60} step={0.1} />
        {resulted && <>
          <EnumField label={t('fm.cfdna.t21')} value={f.t21} onChange={set('t21')} values={calls} ns="fm.callV" empty={false} />
          <EnumField label={t('fm.cfdna.t18')} value={f.t18} onChange={set('t18')} values={calls} ns="fm.callV" empty={false} />
          <EnumField label={t('fm.cfdna.t13')} value={f.t13} onChange={set('t13')} values={calls} ns="fm.callV" empty={false} />
          <EnumField label={t('fm.cfdna.sca')} value={f.sca} onChange={set('sca')} values={calls} ns="fm.callV" empty={false} />
          <EnumField label={t('fm.cfdna.sex')} value={f.sex} onChange={set('sex')} values={['female', 'male', 'not_reported']} ns="fm.fetalSexV" empty={false} />
        </>}
      </div>
      <p className="text-xs text-slate-500">{t('fm.cfdna.screeningNote')}</p>
    </Modal>
  );
}

export function ScreeningSection({ d, groups, canWrite }: { d: FetalMedicineDetail; groups: ScanGroup<FmFirstTrimester>[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [modal, setModal] = useState<null | 'ft' | 'cf' | { result: FmCfdna }>(null);
  const multi = d.pregnancy.plurality > 1;
  const risk = (n: number | null) => n == null ? '—' : <Badge tone={categoryTone[screeningCategory(n)]}>{oneIn(n)}</Badge>;
  return (
    <>
      <Card title={t('fm.ft.title')} actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal('ft')}>{t('fm.ft.new')}</Button>}>
        {!groups.length ? <EmptyState title={t('fm.ft.none')} /> : (
          <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50"><tr>
                {[t('fm.scan.date'), ...(multi ? [t('fm.fetus')] : []), 'CRL', 'NT', t('fm.ft.nasalBone'), t('fm.ft.dv'), 'PAPP-A', 'β-hCG', 'T21', 'T18', 'T13'].map((h) => <th key={h} className="table-th">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {groups.flatMap((gr) => gr.rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="table-td whitespace-nowrap">{i === 0 && <>{formatDate(gr.scan.performed_at, lang)}<span className="ltr-num block text-xs text-slate-500">{formatGADays(r.ga_days)}</span></>}</td>
                    {multi && <td className="table-td font-semibold">{r.fetus_label}</td>}
                    <td className="table-td tabular-nums">{r.crl_mm ?? '—'}</td>
                    <td className="table-td tabular-nums">
                      <span className={r.nt_mm != null && r.crl_mm != null && r.nt_mm > ntP95(r.crl_mm) ? 'font-semibold text-red-700' : ''}>{r.nt_mm ?? '—'}</span>
                    </td>
                    <td className="table-td text-xs">{r.nasal_bone ? t(`fm.nasalBoneV.${r.nasal_bone}`) : '—'}</td>
                    <td className="table-td text-xs">{r.dv_a_wave ? t(`fm.aWaveV.${r.dv_a_wave}`) : '—'}</td>
                    <td className="table-td tabular-nums">{r.papp_a_mom ?? '—'}</td>
                    <td className="table-td tabular-nums">{r.free_bhcg_mom ?? '—'}</td>
                    <td className="table-td">{risk(r.risk_t21)}</td>
                    <td className="table-td">{risk(r.risk_t18)}</td>
                    <td className="table-td">{risk(r.risk_t13)}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
        {groups[0]?.rows[0]?.risk_method && (
          <p className="mt-2 text-xs text-slate-500">{t(`fm.methodV.${groups[0].rows[0].risk_method}`)}{groups[0].rows[0].risk_software && ` · ${groups[0].rows[0].risk_software}`}</p>
        )}
      </Card>

      <Card title={t('fm.cfdna.title')} actions={canWrite && <Button size="sm" variant="secondary" icon={<FlaskConical className="h-3.5 w-3.5" />} onClick={() => setModal('cf')}>{t('fm.cfdna.new')}</Button>}>
        {!d.cfdna.length ? <EmptyState title={t('fm.cfdna.none')} /> : (
          <ul className="space-y-2">
            {[...d.cfdna].reverse().map((c) => (
              <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">{formatDate(c.sampled_on, lang)} <span className="ltr-num text-xs text-slate-500">({formatGADays(c.ga_days)})</span>{c.laboratory && <span className="text-slate-500"> · {c.laboratory}</span>}</p>
                  <Badge tone={c.result_status === 'pending' ? 'amber' : c.result_status === 'failed' ? 'slate' : 'green'}>{t(`fm.cfdnaStatusV.${c.result_status}`)}</Badge>
                </div>
                {c.result_status === 'resulted' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['t21', 't18', 't13', 'sex_chromosomes'] as const).map((k) => c[k] && (
                      <Badge key={k} tone={callTone[c[k]!]}>{t(`fm.cfdna.${k === 'sex_chromosomes' ? 'sca' : k}`)}: {t(`fm.callV.${c[k]}`)}</Badge>
                    ))}
                    {c.fetal_fraction_pct != null && <Badge tone="slate">FF {c.fetal_fraction_pct}%</Badge>}
                  </div>
                )}
                {canWrite && c.result_status === 'pending' && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={() => setModal({ result: c })}>{t('fm.cfdna.result')}</Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modal === 'ft' && <FirstTrimesterModal d={d} onClose={() => setModal(null)} />}
      {modal === 'cf' && <CfdnaSampleModal d={d} onClose={() => setModal(null)} />}
      {modal && typeof modal === 'object' && <CfdnaResultModal c={modal.result} onClose={() => setModal(null)} />}
    </>
  );
}

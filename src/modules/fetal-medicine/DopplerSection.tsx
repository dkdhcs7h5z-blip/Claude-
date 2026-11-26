import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, Textarea } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import type { FetalMedicineDetail, FmDoppler, FmDopplerInput } from '@/data/types';
import { ANAEMIA_MOM, cprLow, dopplerAlerts, mcaPsvMom, quinteroStage } from '@/clinical/fetalMedicine';
import { formatGADays, gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { num, orNull } from '@/modules/obstetrics/formUtils';
import { AlertList } from '@/modules/obstetrics/AlertList';
import { BoolField, EnumField, NumField, boolOrNull } from '@/modules/gynecology/fields';
import type { DerivedFm, ScanGroup } from './derive';
import { FetusTabs, ModalFooter, fetusLabels, useFmInvalidate } from './shared';

type DForm = Record<'uaPi' | 'uaC' | 'edf' | 'mcaPi' | 'mcaC' | 'psv' | 'cprC' | 'dvPi' | 'dvC' | 'dvWave' | 'uv' | 'mvp' | 'bladder' | 'ctg', string>
  & { hydrops: boolean; demise: boolean };
const emptyD = (): DForm => ({ uaPi: '', uaC: '', edf: '', mcaPi: '', mcaC: '', psv: '', cprC: '', dvPi: '', dvC: '', dvWave: '', uv: '', mvp: '', bladder: '', ctg: '', hydrops: false, demise: false });
const round2 = (x: number) => Math.round(x * 100) / 100;

function DopplerModal({ d, onClose }: { d: FetalMedicineDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const g = d.pregnancy;
  const labels = fetusLabels(g);
  const invalidate = useFmInvalidate(g.id, g.patient_id);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(todayIso());
  const [impression, setImpression] = useState('');
  const [uta, setUta] = useState({ l: '', r: '', c: '', notch: '' });
  const [fetus, setFetus] = useState('A');
  const [forms, setForms] = useState<Record<string, DForm>>(Object.fromEntries(labels.map((l) => [l, emptyD()])));
  const f = forms[fetus];
  const set = <K extends keyof DForm>(k: K) => (v: DForm[K]) => setForms((x) => ({ ...x, [fetus]: { ...x[fetus], [k]: v } }));
  const ga = gaDaysOn(g, date);
  const inputs: FmDopplerInput[] = labels.map((l) => {
    const x = forms[l];
    return {
      fetus_label: l as FmDoppler['fetus_label'], ua_pi: num(x.uaPi), ua_pi_centile: num(x.uaC), ua_edf: orNull(x.edf), mca_pi: num(x.mcaPi),
      mca_pi_centile: num(x.mcaC), mca_psv_cm_s: num(x.psv), cpr_centile: num(x.cprC), uta_left_pi: num(uta.l), uta_right_pi: num(uta.r),
      uta_pi_centile: num(uta.c), uta_notching: boolOrNull(uta.notch), dv_pi: num(x.dvPi), dv_pi_centile: num(x.dvC), dv_a_wave: orNull(x.dvWave),
      uv_pulsation: boolOrNull(x.uv), mvp_cm: num(x.mvp), bladder_visible: boolOrNull(x.bladder), hydrops: x.hydrops, fetal_demise: x.demise,
      ctg: orNull(x.ctg), notes: null,
    };
  });
  const derived = inputs.map((i) => ({
    ...i, ga_days: ga, cpr: i.mca_pi != null && i.ua_pi ? round2(i.mca_pi / i.ua_pi) : null, mca_psv_mom: mcaPsvMom(i.mca_psv_cm_s, ga),
  }));
  const cur = derived[labels.indexOf(fetus as never)];
  const live = [...dopplerAlerts(derived)];
  const tt = quinteroStage(derived, g.chorionicity);
  if (tt) live.unshift({ code: 'ttts', severity: 'critical', values: { stage: tt.stage, donor: tt.donor, recipient: tt.recipient } });
  // only fetuses with at least one finding are sent
  const filled = inputs.filter((_i, idx) => labels.length === 1 || Object.entries(forms[labels[idx]]).some(([, v]) => v !== '' && v !== false) || uta.l || uta.r);
  const save = useMutation({
    mutationFn: () => api.recordFmScan(g.id, 'doppler', { performed_at: date === todayIso() ? new Date().toISOString() : `${date}T09:00:00.000Z`, impression: orNull(impression) }, filled),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('fm.doppler.new')} footer={<ModalFooter onClose={onClose} saving={save.isPending} onSave={() => { setError(null); save.mutate(); }} />}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('fm.scan.date')} help={ga != null ? formatGADays(ga) : undefined}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      <fieldset className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-4">
        <legend className="px-1 text-sm font-semibold text-slate-700">{t('fm.doppler.uta')}</legend>
        <NumField label={t('fm.doppler.utaLeft')} value={uta.l} onChange={(v) => setUta({ ...uta, l: v })} min={0.1} max={5} step={0.01} />
        <NumField label={t('fm.doppler.utaRight')} value={uta.r} onChange={(v) => setUta({ ...uta, r: v })} min={0.1} max={5} step={0.01} />
        <NumField label={t('fm.doppler.utaCentile')} value={uta.c} onChange={(v) => setUta({ ...uta, c: v })} max={100} step={0.1} />
        <BoolField label={t('fm.doppler.notching')} value={uta.notch} onChange={(v) => setUta({ ...uta, notch: v })} />
      </fieldset>
      <FetusTabs labels={labels} value={fetus} onChange={setFetus} />
      <p className="text-xs text-slate-500">{t('fm.doppler.centileHelp')}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <NumField label={t('fm.doppler.uaPi')} value={f.uaPi} onChange={set('uaPi')} min={0.1} max={5} step={0.01} />
        <NumField label={`${t('fm.doppler.uaPi')} · ${t('fm.doppler.centile')}`} value={f.uaC} onChange={set('uaC')} max={100} step={0.1} />
        <EnumField label={t('fm.doppler.uaEdf')} value={f.edf} onChange={set('edf')} values={['present', 'absent', 'reversed']} ns="fm.edfV" />
        <NumField label={t('fm.doppler.mcaPi')} value={f.mcaPi} onChange={set('mcaPi')} min={0.1} max={5} step={0.01} />
        <NumField label={`${t('fm.doppler.mcaPi')} · ${t('fm.doppler.centile')}`} value={f.mcaC} onChange={set('mcaC')} max={100} step={0.1} />
        <NumField label={t('fm.doppler.mcaPsv')} value={f.psv} onChange={set('psv')} min={5} max={150} step={0.1} />
        <NumField label={t('fm.doppler.cprCentile')} value={f.cprC} onChange={set('cprC')} max={100} step={0.1} />
        <NumField label={t('fm.doppler.dvPi')} value={f.dvPi} onChange={set('dvPi')} min={0.05} max={5} step={0.01} />
        <NumField label={t('fm.doppler.dvCentile')} value={f.dvC} onChange={set('dvC')} max={100} step={0.1} />
        <EnumField label={t('fm.doppler.dvWave')} value={f.dvWave} onChange={set('dvWave')} values={['positive', 'absent', 'reversed']} ns="fm.aWaveV" />
        <BoolField label={t('fm.doppler.uv')} value={f.uv} onChange={set('uv')} />
        <NumField label={t('fm.doppler.mvp')} value={f.mvp} onChange={set('mvp')} max={25} step={0.1} />
        <BoolField label={t('fm.doppler.bladder')} value={f.bladder} onChange={set('bladder')} />
        <EnumField label={t('fm.doppler.ctg')} value={f.ctg} onChange={set('ctg')} values={['normal', 'suspicious', 'pathological', 'not_done']} ns="fm.ctgV" />
        <div className="flex items-end pb-2"><Checkbox label={t('fm.doppler.hydrops')} checked={f.hydrops} onChange={set('hydrops')} /></div>
        <div className="flex items-end pb-2"><Checkbox label={t('fm.doppler.demise')} checked={f.demise} onChange={set('demise')} /></div>
      </div>
      {(cur.cpr != null || cur.mca_psv_mom != null) && (
        <p className="ltr-num rounded-lg bg-slate-50 p-2.5 text-sm">
          {t('fm.doppler.live')}: {cur.cpr != null && <>CPR {cur.cpr}</>}{cur.cpr != null && cur.mca_psv_mom != null && ' · '}
          {cur.mca_psv_mom != null && <>MCA PSV {cur.mca_psv_mom} MoM</>}
        </p>
      )}
      <Field label={t('fm.scan.impression')}><Textarea value={impression} onChange={(e) => setImpression(e.target.value)} /></Field>
      {live.length > 0 && <AlertList alerts={live} />}
    </Modal>
  );
}

export function GrowthStatus({ derived, multi }: { derived: DerivedFm; multi: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  if (!derived.growth.length && !derived.ttts) return null;
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {derived.growth.map((x) => {
        const r = x.result;
        // without a recent EFW, only Doppler-defined FGR (e.g. UA AEDF) can be called; otherwise it is not assessable
        const unknown = !x.efw && !r.fgr;
        const tone = r.fgr ? (r.stage! >= 3 ? 'red' : 'amber') : unknown ? 'slate' : r.sga ? 'blue' : 'green';
        return (
          <div key={x.label} className="rounded-lg border border-slate-200 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('fm.fgr.title')}{multi && ` · ${t('ob.fetusN', { label: x.label })}`}</p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={tone}>
                {r.fgr ? t('fm.fgr.stage', { onset: t(`fm.fgr.onsetV.${r.onset}`), stage: r.stage }) : unknown ? t('fm.fgr.unknown') : r.sga ? t('fm.fgr.sga') : t('fm.fgr.none')}
              </Badge>
              {r.deliverAtWeeks != null && <span className="text-xs font-medium text-slate-700">{t('fm.fgr.deliver', { w: r.deliverAtWeeks })}</span>}
            </div>
            <p className="mt-1 text-xs text-slate-500">{x.efw ? t('fm.fgr.efw', { c: x.efw.centile, date: formatDate(x.efw.date, lang) }) : t('fm.fgr.noEfw')}</p>
            {r.criteria.length > 0 && <p className="mt-1 text-xs text-slate-600">{t('fm.fgr.criteria')}: {r.criteria.map((c) => t(`fm.fgr.criteriaV.${c}`)).join(' · ')}</p>}
          </div>
        );
      })}
      {derived.ttts && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide">{t('fm.ttts.title')}</p>
          <p className="font-semibold">{t('fm.ttts.stage', { s: derived.ttts.stage })}</p>
          <p className="text-xs">{t('fm.ttts.criteria')}</p>
        </div>
      )}
    </div>
  );
}

export function DopplerSection({ d, groups, derived, canWrite }: { d: FetalMedicineDetail; groups: ScanGroup<FmDoppler>[]; derived: DerivedFm; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const labels = fetusLabels(d.pregnancy);
  const [fetus, setFetus] = useState('A');
  const multi = labels.length > 1;
  const rows = d.doppler.filter((r) => r.ga_days != null);
  const mine = rows.filter((r) => r.fetus_label === fetus);
  const gas = rows.map((r) => r.ga_days!);
  const xDomain: [number, number] = gas.length ? [Math.floor((Math.min(...gas) - 7) / 7) * 7, Math.ceil((Math.max(...gas) + 7) / 7) * 7] : [98, 280];
  const pts = (k: 'ua_pi' | 'mca_pi' | 'cpr') => mine.filter((r) => r[k] != null).map((r) => ({ x: r.ga_days!, y: r[k]! }));
  const psvSeries = labels.map((l, i) => ({
    key: l, label: multi ? t('ob.fetusN', { label: l }) : 'MCA PSV', color: ['#257de0', '#f47230', '#00b894'][i % 3],
    points: rows.filter((r) => r.fetus_label === l && r.mca_psv_mom != null).map((r) => ({ x: r.ga_days!, y: r.mca_psv_mom! })),
  })).filter((s) => s.points.length);
  const flagged = (r: FmDoppler) => r.ua_edf === 'absent' || r.ua_edf === 'reversed' || r.dv_a_wave === 'absent' || r.dv_a_wave === 'reversed'
    || (r.mca_psv_mom ?? 0) >= ANAEMIA_MOM || r.hydrops || r.fetal_demise;
  const cell = (v: number | null | undefined, bad = false) => <span className={bad ? 'font-semibold text-red-700' : ''}>{v ?? '—'}</span>;
  return (
    <Card title={t('fm.doppler.title')} actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('fm.doppler.new')}</Button>}>
      <div className="space-y-4">
        <GrowthStatus derived={derived} multi={multi} />
        {!groups.length ? <EmptyState title={t('fm.doppler.none')} /> : (
          <>
            <FetusTabs labels={labels} value={fetus} onChange={setFetus} flagged={[...new Set(rows.filter(flagged).map((r) => r.fetus_label))]} />
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <LineChart title={`${t('fm.doppler.chartPi')}${multi ? ` · ${t('ob.fetusN', { label: fetus })}` : ''}`} xDomain={xDomain} tickStep={14}
                formatX={(x) => formatGADays(x)} formatY={(y) => y.toFixed(2)} emptyText={t('fm.doppler.none')}
                series={[
                  { key: 'ua', label: t('fm.doppler.uaPi'), color: '#257de0', points: pts('ua_pi') },
                  { key: 'mca', label: t('fm.doppler.mcaPi'), color: '#f47230', points: pts('mca_pi') },
                  { key: 'cpr', label: t('fm.doppler.cpr'), color: '#00b894', points: pts('cpr') },
                ].filter((s) => s.points.length)}
                refLines={[{ y: 1, label: 'CPR 1' }]} />
              {psvSeries.length > 0 && (
                <LineChart title={t('fm.doppler.chartPsv')} xDomain={xDomain} tickStep={14} yDomain={[0.5, 2.2]}
                  formatX={(x) => formatGADays(x)} formatY={(y) => y.toFixed(2)} emptyText="" series={psvSeries}
                  refLines={[{ y: ANAEMIA_MOM, label: t('fm.doppler.psvLine') }]} />
              )}
            </div>
            <p className="text-xs text-slate-500">{t('fm.doppler.gaAxis')}</p>
            <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50"><tr>
                  {[t('fm.scan.date'), ...(multi ? [t('fm.fetus')] : []), t('fm.doppler.uaPi'), 'EDF', t('fm.doppler.mcaPi'), 'PSV MoM', 'CPR',
                    t('fm.doppler.utaMean'), t('fm.doppler.dvWave'), t('fm.doppler.mvp')].map((h) => <th key={h} className="table-th">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {groups.flatMap((gr) => gr.rows.map((r, i) => (
                    <tr key={r.id} className={flagged(r) ? 'bg-red-50/50' : ''}>
                      <td className="table-td whitespace-nowrap">{i === 0 && <>{formatDate(gr.scan.performed_at, lang)}<span className="ltr-num block text-xs text-slate-500">{formatGADays(r.ga_days)}</span></>}</td>
                      {multi && <td className="table-td font-semibold">{r.fetus_label}</td>}
                      <td className="table-td tabular-nums">{cell(r.ua_pi, (r.ua_pi_centile ?? 0) > 95)}{r.ua_pi_centile != null && <span className="block text-[11px] text-slate-400">P{r.ua_pi_centile}</span>}</td>
                      <td className="table-td text-xs">{r.ua_edf ? <span className={r.ua_edf !== 'present' ? 'font-semibold text-red-700' : ''}>{t(`fm.edfV.${r.ua_edf}`)}</span> : '—'}</td>
                      <td className="table-td tabular-nums">{cell(r.mca_pi)}</td>
                      <td className="table-td tabular-nums">{cell(r.mca_psv_mom, (r.mca_psv_mom ?? 0) >= ANAEMIA_MOM)}</td>
                      <td className="table-td tabular-nums">{cell(r.cpr, cprLow(r))}</td>
                      <td className="table-td tabular-nums">{cell(r.uta_mean_pi, (r.uta_pi_centile ?? 0) > 95)}</td>
                      <td className="table-td text-xs">{r.dv_a_wave ? <span className={r.dv_a_wave !== 'positive' ? 'font-semibold text-red-700' : ''}>{t(`fm.aWaveV.${r.dv_a_wave}`)}</span> : '—'}</td>
                      <td className="table-td tabular-nums">{r.mvp_cm ?? '—'}{r.bladder_visible === false && <span className="block text-[11px] text-red-700">{t('fm.doppler.bladder')}: {t('common.no')}</span>}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {open && <DopplerModal d={d} onClose={() => setOpen(false)} />}
    </Card>
  );
}

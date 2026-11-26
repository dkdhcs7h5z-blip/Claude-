import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { ClipboardList, FlaskConical, Plus, Trash2 } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, type Tone } from '@/components/ui';
import type { LabResult, LabResultInput, MenopauseAssessment, Patient, UrogynAssessment } from '@/data/types';
import { LAB_CATALOG, labDef, labFlag } from '@/clinical/labs';
import { ICIQ_SITUATIONS, MRS_ITEMS, scoreIciq, scoreMrs, type Severity } from '@/clinical/questionnaires';
import { ORADS_RISK, RMI_REFERRAL_THRESHOLD, rmi, roma } from '@/clinical/ovarian';
import { todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { num } from '@/modules/obstetrics/formUtils';
import { ChipSelect } from './fields';

const sevTone: Record<Severity, Tone> = { none: 'green', mild: 'blue', moderate: 'amber', severe: 'red' };
const flagTone = { low: 'blue', high: 'red', normal: 'green' } as const;

function useInvalidate(patientId: string) {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: ['gyn', patientId] }); void qc.invalidateQueries({ queryKey: ['gyn-worklist'] }); };
}

// ---------------------------------------------------------------------------
// Ovarian mass risk (RMI · ROMA · O-RADS)
// ---------------------------------------------------------------------------
export function OvarianRiskBlock({ orads, rmiFeatures, postmenopausal, ca125, he4 }: {
  orads: number | null; rmiFeatures: string[]; postmenopausal: boolean; ca125: number | null; he4: number | null;
}) {
  const { t } = useTranslation();
  const r = rmi(rmiFeatures, postmenopausal, ca125);
  const ro = roma(he4, ca125, postmenopausal);
  return (
    <div className="space-y-1.5 rounded-lg bg-slate-50 p-2.5 text-xs text-slate-700">
      <p>
        <strong>{t('gyn.ovarian.rmi')}:</strong>{' '}
        {r.value == null ? <span className="text-slate-400">U {r.u} × M {r.m} × CA-125 — {t('gyn.ovarian.needsCa125')}</span> : (
          <><span className="ltr-num">U {r.u} × M {r.m} × {ca125} = </span>
            <Badge tone={r.value >= RMI_REFERRAL_THRESHOLD ? 'red' : 'green'}><span className="ltr-num">{r.value}</span></Badge></>
        )}
        <span className="block text-[11px] text-slate-500">{t('gyn.ovarian.rmiThreshold')}</span>
      </p>
      <p>
        <strong>{t('gyn.ovarian.roma')}:</strong>{' '}
        {ro == null ? <span className="text-slate-400">{t('gyn.ovarian.needsHe4')}</span> : (
          <Badge tone={ro.high ? 'red' : 'green'}><span className="ltr-num">{ro.value}%</span></Badge>
        )}
        {ro && <span className="block text-[11px] text-slate-500">{t('gyn.ovarian.romaCutoff', { cutoff: ro.cutoff })}</span>}
      </p>
      {orads != null && (
        <p>
          <strong>{t(`gyn.ovarian.oradsV.${orads}`)}</strong> · {t('gyn.ovarian.risk')}: <span className="ltr-num">{ORADS_RISK[orads]}</span>
          <span className="block">{t('gyn.ovarian.management')}: {t(`gyn.ovarian.oradsMgmt.${orads}`)}</span>
          <span className="block text-[11px] text-slate-500">{t('gyn.ovarian.oradsSource')}</span>
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Laboratory results
// ---------------------------------------------------------------------------
const PANELS: Record<string, string[]> = {
  reproductive: ['fsh', 'lh', 'estradiol', 'prolactin', 'amh'],
  pcos: ['lh', 'fsh', 'testosterone', 'shbg', 'dheas', 'oh17_progesterone', 'prolactin', 'tsh', 'hba1c'],
  thyroid: ['tsh', 'free_t4'],
  metabolic: ['hba1c', 'fasting_glucose', 'vitamin_d'],
  tumour: ['ca125', 'he4'],
  anaemia: ['hemoglobin', 'ferritin'],
};

export function LabsCard({ patient, labs, fai, lhFsh, canWrite }: { patient: Patient; labs: LabResult[]; fai: number | null; lhFsh: number | null; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  const dates = [...new Set(labs.map((l) => l.collected_at))].sort().reverse();
  return (
    <Card title={<span className="flex items-center gap-2"><FlaskConical className="h-4 w-4 text-slate-400" />{t('gyn.labs.title')}</span>}
      actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('gyn.labs.add')}</Button>}>
      {!labs.length ? <EmptyState title={t('gyn.labs.none')} /> : (
        <div className="space-y-4">
          {(fai != null || lhFsh != null) && (
            <p className="text-xs text-slate-600">
              <span className="font-semibold">{t('gyn.labs.derived')}:</span>
              {fai != null && <> {t('gyn.labs.fai')} <strong className="ltr-num">{fai}</strong></>}
              {lhFsh != null && <> · {t('gyn.labs.lhFsh')} <strong className="ltr-num">{lhFsh}</strong></>}
            </p>
          )}
          {dates.map((d) => (
            <div key={d}>
              <p className="mb-1 text-xs font-semibold text-slate-500">{formatDate(d, lang)}</p>
              <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
                <table className="min-w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {labs.filter((l) => l.collected_at === d).map((l) => {
                      const f = labFlag(l.value, l.ref_low, l.ref_high);
                      return (
                        <tr key={l.id}>
                          <td className="table-td py-1.5 font-medium">{t(`gyn.labNames.${l.test_code}`)}{l.cycle_day != null && <span className="text-xs font-normal text-slate-400"> · D{l.cycle_day}</span>}</td>
                          <td className="table-td py-1.5 ltr-num whitespace-nowrap font-semibold tabular-nums">{l.value} <span className="font-normal text-slate-500">{l.unit}</span></td>
                          <td className="table-td py-1.5 ltr-num whitespace-nowrap text-xs text-slate-500">{l.ref_low != null || l.ref_high != null ? `${l.ref_low ?? ''}–${l.ref_high ?? ''}` : ''}</td>
                          <td className="table-td py-1.5">{f && <Badge tone={flagTone[f]}>{t(`gyn.labs.flagV.${f}`)}</Badge>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && <LabModal patient={patient} onClose={() => setOpen(false)} />}
    </Card>
  );
}

interface Row { code: string; value: string; unit: string; low: string; high: string }
const rowFor = (code: string): Row => {
  const d = labDef(code);
  return { code, value: '', unit: d?.unit ?? '', low: d?.low != null ? String(d.low) : '', high: d?.high != null ? String(d.high) : '' };
};

function LabModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(patient.id);
  const [date, setDate] = useState(todayIso());
  const [cycleDay, setCycleDay] = useState('');
  const [rows, setRows] = useState<Row[]>(() => PANELS.reproductive.map(rowFor));
  const [error, setError] = useState<string | null>(null);
  const setRow = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const filled = rows.filter((r) => r.value.trim() !== '');
  const save = useMutation({
    mutationFn: () => api.recordLabResults(patient.id, filled.map<LabResultInput>((r) => ({
      collected_at: date, test_code: r.code, value: Number(r.value), unit: r.unit, ref_low: num(r.low), ref_high: num(r.high),
      cycle_day: ['fsh', 'lh', 'estradiol', 'progesterone'].includes(r.code) ? num(cycleDay) : null, notes: null,
    }))),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('gyn.labs.add')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} disabled={!filled.length} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('gyn.labs.date')}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t('gyn.labs.cycleDay')}><Input type="number" dir="ltr" min={1} max={60} value={cycleDay} onChange={(e) => setCycleDay(e.target.value)} /></Field>
        <Field label={t('gyn.labs.panel')}>
          <Select value="" onChange={(e) => e.target.value && setRows(PANELS[e.target.value].map(rowFor))}>
            <option value="">—</option>
            {Object.keys(PANELS).map((p) => <option key={p} value={p}>{t(`gyn.labs.panels.${p}`)}</option>)}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-slate-500">{t('gyn.labs.rangeHelp')}</p>
      <div className="space-y-2">
        {rows.map((r, i) => {
          const f = r.value !== '' ? labFlag(Number(r.value), num(r.low), num(r.high)) : null;
          return (
            <div key={i} className="grid grid-cols-4 items-end gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1.6fr_1fr_0.9fr_0.8fr_0.8fr_auto] sm:rounded-none sm:border-0 sm:p-0">
              <div className="col-span-4 sm:col-span-1">
                <Field label={<span className={clsx(i > 0 && 'sm:sr-only')}>{t('gyn.labs.test')}</span>}>
                  <Select value={r.code} onChange={(e) => setRows((rs) => rs.map((x, j) => (j === i ? rowFor(e.target.value) : x)))}>
                    {LAB_CATALOG.map((l) => <option key={l.code} value={l.code}>{t(`gyn.labNames.${l.code}`)}</option>)}
                  </Select>
                </Field>
              </div>
              <Field label={<span className={clsx(i > 0 && 'sm:sr-only')}>{t('gyn.labs.value')}</span>}>
                <Input type="number" dir="ltr" min={0} step="any" value={r.value} onChange={(e) => setRow(i, 'value', e.target.value)}
                  className={clsx(f === 'high' && 'border-red-400', f === 'low' && 'border-blue-400')} aria-label={`${t(`gyn.labNames.${r.code}`)} ${t('gyn.labs.value')}`} />
              </Field>
              <Field label={<span className={clsx(i > 0 && 'sm:sr-only')}>{t('gyn.labs.unit')}</span>}><Input dir="ltr" value={r.unit} onChange={(e) => setRow(i, 'unit', e.target.value)} /></Field>
              <Field label={<span className={clsx(i > 0 && 'sm:sr-only')}>{t('gyn.labs.low')}</span>}><Input type="number" dir="ltr" step="any" value={r.low} onChange={(e) => setRow(i, 'low', e.target.value)} /></Field>
              <Field label={<span className={clsx(i > 0 && 'sm:sr-only')}>{t('gyn.labs.high')}</span>}><Input type="number" dir="ltr" step="any" value={r.high} onChange={(e) => setRow(i, 'high', e.target.value)} /></Field>
              <div className="col-span-4 flex justify-end sm:col-span-1">
                <Button variant="ghost" size="sm" className="mb-1" aria-label={t('gyn.us.remove')} icon={<Trash2 className="h-4 w-4" />} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} />
              </div>
            </div>
          );
        })}
        <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setRows((rs) => [...rs, rowFor('tsh')])}>{t('gyn.labs.addRow')}</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Menopause Rating Scale
// ---------------------------------------------------------------------------
export function MenopauseCard({ patient, items, canWrite }: { patient: Patient; items: MenopauseAssessment[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  return (
    <Card title={t('gyn.mrs.title')} actions={canWrite && <Button size="sm" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('gyn.mrs.new')}</Button>}>
      {!items.length ? <EmptyState title={t('gyn.mrs.none')} /> : (
        <ul className="space-y-2">
          {[...items].reverse().map((a) => {
            const s = scoreMrs(a.items);
            return (
              <li key={a.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{formatDate(a.assessed_at, lang)}</span>
                  <Badge tone={sevTone[s.severity]}>{t('gyn.mrs.total')} {s.total} · {t(`gyn.mrs.severityV.${s.severity}`)}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {t('gyn.mrs.somatic')} {s.somatic} ({t(`gyn.mrs.severityV.${s.somaticSeverity}`)}) · {t('gyn.mrs.psychological')} {s.psychological} ({t(`gyn.mrs.severityV.${s.psychologicalSeverity}`)}) ·
                  {' '}{t('gyn.mrs.urogenital')} {s.urogenital} ({t(`gyn.mrs.severityV.${s.urogenitalSeverity}`)})
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {open && <MrsModal patient={patient} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function MrsModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(patient.id);
  const [items, setItems] = useState<number[]>(() => MRS_ITEMS.map(() => 0));
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  const s = useMemo(() => scoreMrs(items), [items]);
  const scale = t('gyn.mrs.scale', { returnObjects: true }) as string[];
  const save = useMutation({
    mutationFn: () => api.recordMenopauseAssessment(patient.id, { assessed_at: date, items, notes: null }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('gyn.mrs.title')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('ob.visit.date')}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
      <p className="text-xs text-slate-500">{t('gyn.mrs.help')}</p>
      <ol className="space-y-2">
        {MRS_ITEMS.map((code, i) => (
          <li key={code} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-slate-800">{i + 1}. {t(`gyn.mrs.items.${code}`)}</span>
            <div className="flex gap-1" role="radiogroup" aria-label={t(`gyn.mrs.items.${code}`)}>
              {[0, 1, 2, 3, 4].map((v) => (
                <button key={v} type="button" role="radio" aria-checked={items[i] === v} title={scale[v]}
                  onClick={() => setItems((a) => a.map((x, j) => (j === i ? v : x)))}
                  className={clsx('h-8 w-8 rounded-md text-sm font-semibold ring-1 ring-inset',
                    items[i] === v ? 'bg-brand-700 text-white ring-brand-700' : 'bg-white text-slate-600 ring-slate-300 hover:bg-slate-50')}>{v}</button>
              ))}
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
        <Badge tone={sevTone[s.severity]}>{t('gyn.mrs.total')} {s.total} · {t(`gyn.mrs.severityV.${s.severity}`)}</Badge>
        <span>{t('gyn.mrs.somatic')} {s.somatic}</span>·<span>{t('gyn.mrs.psychological')} {s.psychological}</span>·<span>{t('gyn.mrs.urogenital')} {s.urogenital}</span>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// ICIQ-UI Short Form
// ---------------------------------------------------------------------------
const iciqTone = { none: 'green', slight: 'blue', moderate: 'amber', severe: 'red', very_severe: 'red' } as const;

export function UrogynCard({ patient, items, canWrite }: { patient: Patient; items: UrogynAssessment[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const [open, setOpen] = useState(false);
  return (
    <Card title={t('gyn.iciq.title')} actions={canWrite && <Button size="sm" icon={<ClipboardList className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('gyn.iciq.new')}</Button>}>
      {!items.length ? <EmptyState title={t('gyn.iciq.none')} /> : (
        <ul className="space-y-2">
          {[...items].reverse().map((a) => {
            const s = scoreIciq(a.frequency, a.amount, a.interference, a.leak_situations);
            return (
              <li key={a.id} className="rounded-lg border border-slate-200 p-2.5 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{formatDate(a.assessed_at, lang)}</span>
                  <Badge tone={iciqTone[s.severity]}>{t('gyn.iciq.score')} {s.score}/21 · {t(`gyn.iciq.severityV.${s.severity}`)}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-600">{t('gyn.iciq.type')}: {t(`gyn.iciq.typeV.${s.type}`)}{a.leak_situations.length > 0 && <> · {a.leak_situations.map((x) => t(`gyn.iciq.situationsV.${x}`)).join(lang === 'ar' ? '، ' : ', ')}</>}</p>
              </li>
            );
          })}
        </ul>
      )}
      {open && <IciqModal patient={patient} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function IciqModal({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const { t } = useTranslation();
  const invalidate = useInvalidate(patient.id);
  const [date, setDate] = useState(todayIso());
  const [frequency, setFrequency] = useState(0);
  const [amount, setAmount] = useState(0);
  const [interference, setInterference] = useState(0);
  const [situations, setSituations] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const s = scoreIciq(frequency, amount, interference, situations);
  const freqV = t('gyn.iciq.frequencyV', { returnObjects: true }) as string[];
  const save = useMutation({
    mutationFn: () => api.recordUrogynAssessment(patient.id, { assessed_at: date, frequency, amount, interference, leak_situations: situations, notes: null }),
    onSuccess: () => { invalidate(); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('gyn.iciq.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('ob.visit.date')}><Input type="date" dir="ltr" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} /></Field>
      <Field label={t('gyn.iciq.frequency')}>
        <Select value={frequency} onChange={(e) => setFrequency(Number(e.target.value))}>{freqV.map((l, i) => <option key={i} value={i}>{i} — {l}</option>)}</Select>
      </Field>
      <Field label={t('gyn.iciq.amount')}>
        <Select value={amount} onChange={(e) => setAmount(Number(e.target.value))}>{[0, 2, 4, 6].map((v) => <option key={v} value={v}>{v} — {t(`gyn.iciq.amountV.${v}`)}</option>)}</Select>
      </Field>
      <Field label={t('gyn.iciq.interference')}>
        <Input type="range" min={0} max={10} value={interference} onChange={(e) => setInterference(Number(e.target.value))} className="px-0" />
      </Field>
      <p className="-mt-2 text-sm font-semibold">{interference}/10</p>
      <ChipSelect legend={t('gyn.iciq.situations')} values={ICIQ_SITUATIONS} selected={situations} onChange={setSituations} ns="gyn.iciq.situationsV" />
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 p-3 text-sm">
        <Badge tone={iciqTone[s.severity]}>{t('gyn.iciq.score')} {s.score}/21 · {t(`gyn.iciq.severityV.${s.severity}`)}</Badge>
        <span>{t('gyn.iciq.type')}: {t(`gyn.iciq.typeV.${s.type}`)}</span>
      </div>
    </Modal>
  );
}

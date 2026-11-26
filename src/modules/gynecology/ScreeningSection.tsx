import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Microscope, Plus } from 'lucide-react';
import { api } from '@/data';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, Textarea, type Tone } from '@/components/ui';
import type { CervicalScreening, Colposcopy, Patient } from '@/data/types';
import { addMonths, recommendScreening, type CytologyResult, type HpvResult, type ScreeningStatus } from '@/clinical/gynecology';
import { todayIso } from '@/clinical/obstetrics';
import { formatDate } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { orNull } from '@/modules/obstetrics/formUtils';
import { EnumField } from './fields';

export const statusTone: Record<ScreeningStatus, Tone> = {
  not_applicable: 'slate', never: 'amber', action_needed: 'red', overdue: 'amber', due_soon: 'blue', up_to_date: 'green', pending_result: 'violet',
};
const ABNORMAL = ['asc_us', 'lsil', 'asc_h', 'hsil', 'agc', 'scc', 'adenocarcinoma'];

function resultText(s: CervicalScreening, t: (k: string) => string) {
  if (s.status === 'pending') return t('gyn.resultStatusV.pending');
  return [s.hpv_result && `HPV: ${t(`gyn.hpvV.${s.hpv_result}`)}`, s.cytology_result && t(`gyn.cytologyV.${s.cytology_result}`)].filter(Boolean).join(' · ');
}

export function ScreeningSection({ patient, ageYears, hysterectomy, screenings, colposcopies, status, canWrite }: {
  patient: Patient; ageYears: number; hysterectomy?: 'none' | 'subtotal' | 'total' | null;
  screenings: CervicalScreening[]; colposcopies: Colposcopy[]; status: ScreeningStatus; canWrite: boolean;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const [modal, setModal] = useState<null | { kind: 'screening'; edit?: CervicalScreening } | { kind: 'colpo'; screeningId?: string }>(null);
  const qc = useQueryClient();
  const updateColpo = useMutation({
    mutationFn: (v: { id: string; histology: Colposcopy['histology'] }) => api.updateColposcopy(v.id, { histology: v.histology }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['gyn', patient.id] }); void qc.invalidateQueries({ queryKey: ['gyn-worklist'] }); },
  });

  return (
    <Card title={<span className="flex items-center gap-2">{t('gyn.screening.title')}<Badge tone={statusTone[status]}>{t(`gyn.statusV.${status}`)}</Badge></span>}
      actions={canWrite && (
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<Microscope className="h-3.5 w-3.5" />} onClick={() => setModal({ kind: 'colpo' })}>{t('gyn.colpo.new')}</Button>
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setModal({ kind: 'screening' })}>{t('gyn.screening.new')}</Button>
        </div>
      )}>
      {!screenings.length ? <EmptyState title={t('gyn.screening.none')} /> : (
        <ol className="space-y-3">
          {[...screenings].reverse().map((s) => {
            const colpos = colposcopies.filter((c) => c.screening_id === s.id);
            const abnormal = (s.cytology_result && ABNORMAL.includes(s.cytology_result)) || (s.hpv_result && s.hpv_result !== 'negative');
            return (
              <li key={s.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {formatDate(s.sample_date, lang)} · {t(`gyn.testTypeV.${s.test_type}`)}
                  </p>
                  <Badge tone={s.status === 'pending' ? 'violet' : abnormal ? 'red' : 'green'}>{resultText(s, t)}</Badge>
                </div>
                {s.recommendation && (
                  <p className="mt-1 text-sm text-slate-700">
                    {t('gyn.screening.recommendation')}: <strong>{t(`gyn.actionV.${s.recommendation}`, s.recommendation)}</strong>
                    {s.next_due_date && <> · {t('gyn.screening.nextDue')}: {formatDate(s.next_due_date, lang)}</>}
                  </p>
                )}
                {colpos.map((c) => (
                  <div key={c.id} className="mt-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                    <strong>{t('gyn.colpo.title')}</strong> {formatDate(c.performed_at, lang)}
                    {c.tz_type && <> · TZ {c.tz_type}</>}
                    {c.findings && <> · {t(`gyn.findingsV.${c.findings}`)}</>}
                    {c.histology && <> · {t('gyn.colpo.histology')}: <strong>{t(`gyn.histologyV.${c.histology}`)}</strong></>}
                    {c.treatment && c.treatment !== 'none' && <> · {t(`gyn.treatmentV.${c.treatment}`)}</>}
                    {canWrite && c.histology === 'pending' && (
                      <select aria-label={t('gyn.colpo.histology')} className="ms-2 rounded border border-slate-300 px-1 py-0.5 text-xs" value=""
                        onChange={(e) => e.target.value && updateColpo.mutate({ id: c.id, histology: e.target.value as Colposcopy['histology'] })}>
                        <option value="">{t('gyn.procedure.updateHistology')}</option>
                        {['normal', 'cin1', 'cin2', 'cin3', 'ais', 'invasive'].map((h) => <option key={h} value={h}>{t(`gyn.histologyV.${h}`)}</option>)}
                      </select>
                    )}
                  </div>
                ))}
                {canWrite && (
                  <div className="mt-2 flex gap-2">
                    {s.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => setModal({ kind: 'screening', edit: s })}>{t('gyn.screening.enterResult')}</Button>}
                    {s.recommendation?.startsWith('colposcopy') && !colpos.length && (
                      <Button size="sm" variant="secondary" icon={<Microscope className="h-3.5 w-3.5" />} onClick={() => setModal({ kind: 'colpo', screeningId: s.id })}>{t('gyn.colpo.new')}</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-[11px] text-slate-400">{t('gyn.screening.source')}</p>
      {modal?.kind === 'screening' && <ScreeningModal patient={patient} ageYears={ageYears} hysterectomy={hysterectomy} edit={modal.edit} onClose={() => setModal(null)} />}
      {modal?.kind === 'colpo' && <ColposcopyModal patient={patient} screenings={screenings} screeningId={modal.screeningId} onClose={() => setModal(null)} />}
    </Card>
  );
}

function ScreeningModal({ patient, ageYears, hysterectomy, edit, onClose }: {
  patient: Patient; ageYears: number; hysterectomy?: 'none' | 'subtotal' | 'total' | null; edit?: CervicalScreening; onClose: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    date: edit?.sample_date ?? todayIso(), test: edit?.test_type ?? 'cotest', hpv: edit?.hpv_result ?? '', cyto: edit?.cytology_result ?? '',
    resulted: edit ? true : false, notes: edit?.notes ?? '', recommendation: '', due: '',
  });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const needsHpv = f.test !== 'cytology', needsCyto = f.test !== 'hpv_primary';
  const complete = (!needsHpv || f.hpv) && (f.test !== 'cotest' && f.test !== 'cytology' ? true : !!f.cyto);
  const suggestion = f.resulted && complete ? recommendScreening({
    ageYears, testType: f.test as CervicalScreening['test_type'], hpv: orNull<HpvResult>(f.hpv), cytology: orNull<CytologyResult>(f.cyto), hysterectomy,
  }) : null;
  const recommendation = f.recommendation || suggestion?.action || '';
  const due = f.due || (suggestion?.months ? addMonths(f.date, suggestion.months) : '');
  const save = useMutation({
    mutationFn: async () => {
      const body = {
        sample_date: f.date, test_type: f.test as CervicalScreening['test_type'],
        hpv_result: needsHpv ? orNull<NonNullable<CervicalScreening['hpv_result']>>(f.hpv) : null,
        cytology_result: needsCyto ? orNull<NonNullable<CervicalScreening['cytology_result']>>(f.cyto) : null,
        status: (f.resulted ? 'resulted' : 'pending') as CervicalScreening['status'],
        recommendation: f.resulted ? recommendation || null : null, next_due_date: f.resulted ? due || null : null, notes: orNull(f.notes),
      };
      if (edit) await api.updateScreening(edit.id, body);
      else await api.recordScreening(patient.id, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['gyn', patient.id] }); void qc.invalidateQueries({ queryKey: ['gyn-worklist'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });

  return (
    <Modal wide open onClose={onClose} title={edit ? t('gyn.screening.enterResult') : t('gyn.screening.new')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} disabled={f.resulted && !complete} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('gyn.screening.sampleDate')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} disabled={!!edit} onChange={(e) => set('date')(e.target.value)} /></Field>
        <EnumField label={t('gyn.screening.testType')} value={f.test} onChange={(v) => set('test')(v as never)} values={['cytology', 'hpv_primary', 'cotest']} ns="gyn.testTypeV" empty={false} />
      </div>
      <Checkbox label={t('gyn.resultStatusV.resulted')} checked={f.resulted} onChange={set('resulted')} />
      {f.resulted && (
        <div className="grid grid-cols-2 gap-3">
          {needsHpv && <EnumField label={t('gyn.screening.hpv')} value={f.hpv} onChange={set('hpv')} values={['negative', 'hpv16', 'hpv18', 'hpv16_18', 'other_hr', 'positive_untyped']} ns="gyn.hpvV" />}
          {needsCyto && <EnumField label={t('gyn.screening.cytology')} value={f.cyto} onChange={set('cyto')} values={['nilm', 'asc_us', 'lsil', 'asc_h', 'hsil', 'agc', 'scc', 'adenocarcinoma', 'unsatisfactory']} ns="gyn.cytologyV" />}
        </div>
      )}
      {suggestion && (
        <div className={`rounded-lg p-3 text-sm ring-1 ring-inset ${suggestion.urgency === 'urgent' ? 'bg-red-50 ring-red-200' : suggestion.urgency === 'soon' ? 'bg-amber-50 ring-amber-200' : 'bg-emerald-50 ring-emerald-200'}`}>
          <p><span className="font-medium">{t('gyn.screening.suggested')}:</span> <strong>{t(`gyn.actionV.${suggestion.action}`)}</strong>
            {suggestion.months && <> · {t('gyn.screening.nextDue')}: {formatDate(addMonths(f.date, suggestion.months), lang)}</>}</p>
          <p className="mt-1 text-[11px] text-slate-500">{t('gyn.screening.source')}</p>
        </div>
      )}
      {f.resulted && (
        <div className="grid grid-cols-2 gap-3">
          <EnumField label={t('gyn.screening.recommendation')} value={recommendation} onChange={set('recommendation')}
            values={['routine_3y', 'routine_5y', 'repeat_3y', 'repeat_1y', 'repeat_short', 'reflex_hpv', 'colposcopy', 'colposcopy_expedited', 'colposcopy_endometrial', 'urgent_referral', 'not_indicated_under_21', 'exit_over_65', 'stop_post_hysterectomy']}
            ns="gyn.actionV" />
          <Field label={t('gyn.screening.nextDue')}><Input type="date" dir="ltr" value={due} min={f.date} onChange={(e) => set('due')(e.target.value)} /></Field>
        </div>
      )}
      <Field label={t('ob.visit.notes')}><Textarea value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
    </Modal>
  );
}

function ColposcopyModal({ patient, screenings, screeningId, onClose }: { patient: Patient; screenings: CervicalScreening[]; screeningId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ date: todayIso(), screening: screeningId ?? screenings.at(-1)?.id ?? '', tz: '', findings: '', biopsy: false, histology: '', treatment: '', notes: '' });
  const set = <K extends keyof typeof f>(k: K) => (v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const save = useMutation({
    mutationFn: () => api.recordColposcopy(patient.id, {
      screening_id: f.screening || null, performed_at: f.date, tz_type: f.tz ? (Number(f.tz) as 1 | 2 | 3) : null, findings: orNull(f.findings),
      biopsy_taken: f.biopsy, histology: orNull(f.histology), treatment: orNull(f.treatment), notes: orNull(f.notes),
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['gyn', patient.id] }); void qc.invalidateQueries({ queryKey: ['gyn-worklist'] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  return (
    <Modal wide open onClose={onClose} title={t('gyn.colpo.new')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button></>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Field label={t('gyn.colpo.date')}><Input type="date" dir="ltr" value={f.date} max={todayIso()} onChange={(e) => set('date')(e.target.value)} /></Field>
        <Field label={t('gyn.colpo.linked')}>
          <select className="input" value={f.screening} onChange={(e) => set('screening')(e.target.value)}>
            <option value="">—</option>
            {screenings.map((s) => <option key={s.id} value={s.id}>{formatDate(s.sample_date, lang)} · {t(`gyn.testTypeV.${s.test_type}`)}</option>)}
          </select>
        </Field>
        <Field label={t('gyn.colpo.tz')}>
          <select className="input" value={f.tz} onChange={(e) => set('tz')(e.target.value)}><option value="">—</option>{[1, 2, 3].map((n) => <option key={n}>{n}</option>)}</select>
        </Field>
        <EnumField label={t('gyn.colpo.findings')} value={f.findings} onChange={set('findings')} values={['normal', 'minor_grade1', 'major_grade2', 'suspicious_invasion', 'non_specific']} ns="gyn.findingsV" />
        <EnumField label={t('gyn.colpo.treatment')} value={f.treatment} onChange={set('treatment')} values={['none', 'lletz', 'cone', 'ablation', 'follow_up']} ns="gyn.treatmentV" />
        <div className="flex items-end pb-2"><Checkbox label={t('gyn.colpo.biopsy')} checked={f.biopsy} onChange={set('biopsy')} /></div>
        {(f.biopsy || ['lletz', 'cone'].includes(f.treatment)) && (
          <EnumField label={t('gyn.colpo.histology')} value={f.histology} onChange={set('histology')} values={['pending', 'normal', 'cin1', 'cin2', 'cin3', 'ais', 'invasive']} ns="gyn.histologyV" />
        )}
      </div>
      <Field label={t('ob.visit.notes')}><Textarea value={f.notes} onChange={(e) => set('notes')(e.target.value)} /></Field>
    </Modal>
  );
}

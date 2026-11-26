import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { clsx } from 'clsx';
import { Activity, Plus } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import type { LabourObservation, Liquor, Pregnancy } from '@/data/types';
import {
  ACTION_LINE_OFFSET_H, actionLineAt, activePhase, alertLineAt, hoursBetween, labourAlerts, progressStatus, validObservations,
} from '@/clinical/partogram';
import { formatDateTime, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';
import { AlertList } from './AlertList';
import { num, orNull } from './formUtils';

const statusTone = { not_active: 'slate', normal: 'green', alert: 'amber', action: 'red', fully_dilated: 'blue' } as const;

export function LabourSection({ pregnancy, observations, canWrite }: { pregnancy: Pregnancy; observations: LabourObservation[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { byId } = useProfiles();
  const [open, setOpen] = useState(false);
  const markError = useMutation({
    mutationFn: (id: string) => api.markLabourObservationError(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pregnancy', pregnancy.id] }),
  });
  const valid = validObservations(observations);
  const phase = activePhase(valid);
  const status = progressStatus(valid);
  const origin = phase?.start ?? valid[0]?.observed_at;
  const hx = (o: LabourObservation) => (origin ? Math.round(hoursBetween(origin, o.observed_at) * 100) / 100 : 0);
  const lastH = valid.length ? Math.max(...valid.map(hx)) : 0;
  const xMin = Math.min(0, ...valid.map(hx));
  const xMax = Math.max(12, Math.ceil(lastH) + 2);
  const fmtH = (h: number) => t('ob.labour.hoursShort', { h: Math.round(h * 10) / 10 });

  return (
    <Card title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-slate-400" />{t('ob.labour.title')}</span>}
      actions={canWrite && <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('ob.labour.add')}</Button>}>
      {!observations.length ? <EmptyState title={t('ob.labour.none')} /> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[status]}>{t(`ob.labour.status.${status}`)}</Badge>
          </div>
          <AlertList alerts={labourAlerts(valid)} compact />
          <LineChart title={t('ob.labour.chart')} xDomain={[xMin, xMax]} yDomain={[0, 10]} tickStep={2}
            formatX={fmtH} formatTick={(x) => String(Math.round(x))} formatY={(y) => String(y)} emptyText="" height={240}
            series={[
              { key: 'dil', label: t('ob.labour.dilationSeries'), color: '#257de0',
                points: valid.filter((o) => o.cervical_dilation_cm != null).map((o) => ({ x: hx(o), y: o.cervical_dilation_cm! })) },
              { key: 'desc', label: t('ob.labour.descentSeries'), color: '#f47230',
                points: valid.filter((o) => o.descent_fifths != null).map((o) => ({ x: hx(o), y: o.descent_fifths! })) },
            ]}
            curves={phase ? [
              { label: t('ob.labour.alertLine'), from: 0, to: 10 - phase.startDilation, fn: (h) => alertLineAt(phase, h) },
              { label: t('ob.labour.actionLine'), from: ACTION_LINE_OFFSET_H, to: ACTION_LINE_OFFSET_H + 10 - phase.startDilation, fn: (h) => actionLineAt(phase, h) },
            ] : []} />
          <LineChart title={t('ob.labour.fhrChart')} xDomain={[xMin, xMax]} yDomain={[80, 200]} tickStep={2}
            formatX={fmtH} formatTick={(x) => String(Math.round(x))} emptyText="" height={150}
            series={[{ key: 'fhr', label: 'FHR', color: '#257de0', points: valid.filter((o) => o.fhr != null).map((o) => ({ x: hx(o), y: o.fhr! })) }]}
            refLines={[{ y: 160, label: '160' }, { y: 110, label: '110' }]} />
          <p className="text-xs text-slate-500">{t('ob.labour.hoursAxis')} · {t('ob.labour.reference')}</p>

          <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  {[t('ob.labour.observedAt'), t('ob.labour.dilation'), t('ob.labour.descent'), t('ob.labour.contractions'), t('ob.labour.fhr'),
                    t('ob.labour.liquor'), t('ob.labour.moulding'), t('ob.visit.bp'), t('ob.labour.temperature'), t('ob.labour.oxytocin'), '']
                    .map((h, i) => <th key={i} className="table-th">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...observations].reverse().map((o) => (
                  <tr key={o.id} className={clsx('align-top', o.entered_in_error && 'text-slate-400 line-through')}>
                    <td className="table-td whitespace-nowrap">{formatDateTime(o.observed_at, lang)}<p className="text-[11px] text-slate-400 no-underline">{profileName(byId.get(o.recorded_by ?? ''), lang)}</p></td>
                    <td className="table-td tabular-nums">{o.cervical_dilation_cm ?? '—'}</td>
                    <td className="table-td tabular-nums">{o.descent_fifths != null ? `${o.descent_fifths}/5` : '—'}</td>
                    <td className="table-td tabular-nums">{o.contractions_per_10min != null ? `${o.contractions_per_10min}${o.contraction_duration_s ? ` × ${o.contraction_duration_s}s` : ''}` : '—'}</td>
                    <td className="table-td tabular-nums">{o.fhr ?? '—'}</td>
                    <td className="table-td">{o.liquor ? t(`ob.labour.liquorV.${o.liquor}`) : '—'}</td>
                    <td className="table-td">{o.moulding ?? '—'}</td>
                    <td className="table-td ltr-num">{o.bp_systolic != null ? `${o.bp_systolic}/${o.bp_diastolic}` : '—'}</td>
                    <td className="table-td">{o.temperature_c ?? '—'}</td>
                    <td className="table-td">{o.oxytocin_mu_min ?? '—'}</td>
                    <td className="table-td whitespace-nowrap">
                      {o.entered_in_error ? <Badge>{t('ob.labour.enteredInError')}</Badge> : canWrite && (
                        <Button size="sm" variant="ghost" onClick={() => confirm(t('ob.labour.markErrorConfirm')) && markError.mutate(o.id)}>{t('ob.labour.markError')}</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {open && <LabourObservationModal pregnancy={pregnancy} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function localNow(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function LabourObservationModal({ pregnancy, onClose }: { pregnancy: Pregnancy; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { access, activeClinicId } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ at: localNow(), dil: '', descent: '', ctx: '', dur: '', fhr: '', liquor: '', moulding: '', sys: '', dia: '', pulse: '', temp: '', oxy: '', notes: '' });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const clinicId = access?.memberships.some((m) => m.clinic_id === pregnancy.clinic_id) ? pregnancy.clinic_id
    : activeClinicId ?? access?.memberships[0]?.clinic_id ?? pregnancy.clinic_id;
  const save = useMutation({
    mutationFn: () => api.addLabourObservation(pregnancy.id, {
      observed_at: new Date(f.at).toISOString(), cervical_dilation_cm: num(f.dil), descent_fifths: num(f.descent),
      contractions_per_10min: num(f.ctx), contraction_duration_s: num(f.dur), fhr: num(f.fhr), liquor: orNull<Liquor>(f.liquor),
      moulding: num(f.moulding), bp_systolic: num(f.sys), bp_diastolic: num(f.dia), pulse: num(f.pulse), temperature_c: num(f.temp),
      oxytocin_mu_min: num(f.oxy), notes: orNull(f.notes), clinic_id: clinicId,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pregnancy', pregnancy.id] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const n = (k: keyof typeof f, label: string, min: number, max: number, step = 1) => (
    <Field label={label}><Input type="number" dir="ltr" min={min} max={max} step={step} value={f[k]} onChange={(e) => set(k, e.target.value)} /></Field>
  );
  return (
    <Modal wide open onClose={onClose} title={t('ob.labour.add')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label={t('ob.labour.observedAt')}><Input type="datetime-local" dir="ltr" value={f.at} max={localNow()} onChange={(e) => set('at', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {n('dil', t('ob.labour.dilation'), 0, 10, 0.5)}{n('descent', t('ob.labour.descent'), 0, 5)}
        {n('ctx', t('ob.labour.contractions'), 0, 8)}{n('dur', t('ob.labour.duration'), 0, 180)}
        {n('fhr', t('ob.labour.fhr'), 50, 240)}
        <Field label={t('ob.labour.liquor')}>
          <Select value={f.liquor} onChange={(e) => set('liquor', e.target.value)}>
            <option value="">—</option>
            {['intact', 'clear', 'meconium_light', 'meconium_thick', 'blood_stained', 'absent'].map((v) => <option key={v} value={v}>{t(`ob.labour.liquorV.${v}`)}</option>)}
          </Select>
        </Field>
        {n('moulding', t('ob.labour.moulding'), 0, 3)}{n('oxy', t('ob.labour.oxytocin'), 0, 40, 0.5)}
        {n('sys', t('ob.visit.systolic'), 50, 260)}{n('dia', t('ob.visit.diastolic'), 30, 180)}
        {n('pulse', t('ob.visit.pulse'), 30, 220)}{n('temp', t('ob.labour.temperature'), 34, 43, 0.1)}
      </div>
      <Field label={t('ob.visit.notes')}><Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PenLine } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Badge, Button, Card, Checkbox, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import type { Delivery, PostnatalVisit, PostnatalVisitInput, PostnatalVisitRow } from '@/data/types';
import { postnatalAlerts } from '@/clinical/postnatal';
import { daysBetween, todayIso } from '@/clinical/obstetrics';
import { formatDate, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';
import { AlertCountBadge, AlertList } from './AlertList';
import { num, orNull } from './formUtils';

export function PostnatalSection({ delivery, visits, canWrite }: { delivery: Delivery; visits: PostnatalVisitRow[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { can } = useAuth();
  const { byId } = useProfiles();
  const [open, setOpen] = useState(false);
  const sign = useMutation({
    mutationFn: (id: string) => api.signEncounter(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pregnancy', delivery.pregnancy_id] }),
  });
  const latest = visits.at(-1);
  const dash = <span className="text-slate-300">—</span>;
  const tone = { draft: 'amber', signed: 'green', amended: 'slate' } as const;

  return (
    <Card title={t('ob.postnatal.title')}
      actions={canWrite && <Button size="sm" icon={<PenLine className="h-3.5 w-3.5" />} onClick={() => setOpen(true)}>{t('ob.postnatal.new')}</Button>}>
      {latest && <div className="mb-3"><AlertList alerts={postnatalAlerts(latest)} compact /></div>}
      {!visits.length ? <EmptyState title={t('ob.postnatal.noVisits')} /> : (
        <div className="relative -mx-4 overflow-x-auto sm:-mx-5">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                {[t('common.date'), t('ob.postnatal.daysPostpartum'), t('ob.visit.bp'), t('ob.postnatal.temperature'), t('ob.postnatal.uterus'),
                  t('ob.postnatal.lochia'), t('ob.postnatal.wound'), t('ob.postnatal.breastfeeding'), 'EPDS', t('ob.alerts.title'), t('common.status'), '']
                  .map((h, i) => <th key={i} className="table-th">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[...visits].reverse().map((v) => (
                <tr key={v.id} className="align-top">
                  <td className="table-td whitespace-nowrap">{formatDate(v.visit_date, lang)}<p className="text-[11px] text-slate-400">{profileName(byId.get(v.encounter.provider_id), lang)}</p></td>
                  <td className="table-td">{t('ob.postnatal.day', { n: v.days_postpartum ?? '—' })}</td>
                  <td className="table-td ltr-num whitespace-nowrap">{v.bp_systolic != null ? `${v.bp_systolic}/${v.bp_diastolic}` : dash}</td>
                  <td className="table-td tabular-nums">{v.temperature_c ?? dash}</td>
                  <td className="table-td">{v.uterus ? t(`ob.postnatal.uterusV.${v.uterus}`) : dash}</td>
                  <td className="table-td">{v.lochia ? t(`ob.postnatal.lochiaV.${v.lochia}`) : dash}</td>
                  <td className="table-td">{v.wound ? t(`ob.postnatal.woundV.${v.wound}`) : dash}</td>
                  <td className="table-td">{v.breastfeeding ? t(`ob.postnatal.breastfeedingV.${v.breastfeeding}`) : dash}</td>
                  <td className="table-td tabular-nums">{v.epds_score ?? dash}{v.epds_self_harm && <strong className="ms-1 text-red-700">Q10+</strong>}</td>
                  <td className="table-td"><AlertCountBadge alerts={postnatalAlerts(v)} /></td>
                  <td className="table-td"><Badge tone={tone[v.encounter.status]}>{t(`ob.visit.${v.encounter.status}`)}</Badge></td>
                  <td className="table-td">
                    {v.encounter.status === 'draft' && can('clinical.sign', v.clinic_id) && (
                      <Button size="sm" variant="secondary" loading={sign.isPending && sign.variables === v.encounter.id}
                        onClick={() => confirm(t('ob.visit.signConfirm')) && sign.mutate(v.encounter.id)}>{t('ob.visit.sign')}</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {open && <PostnatalVisitModal delivery={delivery} onClose={() => setOpen(false)} />}
    </Card>
  );
}

function PostnatalVisitModal({ delivery, onClose }: { delivery: Delivery; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { access, activeClinicId } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    date: todayIso(), sys: '', dia: '', pulse: '', temp: '', uterus: '', lochia: '', wound: delivery.mode.startsWith('cs_') ? 'healing' : '',
    breastfeeding: '', breasts: '', epds: '', selfHarm: false, hb: '', contraception: '', assessment: '', plan: '',
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const payload: PostnatalVisitInput = {
    visit_date: f.date, bp_systolic: num(f.sys), bp_diastolic: num(f.dia), pulse: num(f.pulse), temperature_c: num(f.temp),
    uterus: orNull<NonNullable<PostnatalVisit['uterus']>>(f.uterus), lochia: orNull<NonNullable<PostnatalVisit['lochia']>>(f.lochia),
    wound: orNull<NonNullable<PostnatalVisit['wound']>>(f.wound), breastfeeding: orNull<NonNullable<PostnatalVisit['breastfeeding']>>(f.breastfeeding),
    breasts: orNull<NonNullable<PostnatalVisit['breasts']>>(f.breasts), epds_score: num(f.epds), epds_self_harm: f.epds ? f.selfHarm : null,
    hemoglobin_g_dl: num(f.hb), contraception: orNull(f.contraception),
  };
  const live = postnatalAlerts({
    bp_systolic: payload.bp_systolic ?? null, bp_diastolic: payload.bp_diastolic ?? null, temperature_c: payload.temperature_c ?? null,
    uterus: payload.uterus ?? null, lochia: payload.lochia ?? null, wound: payload.wound ?? null, breasts: payload.breasts ?? null,
    epds_score: payload.epds_score ?? null, epds_self_harm: f.selfHarm, hemoglobin_g_dl: payload.hemoglobin_g_dl ?? null,
  });
  const clinicId = access?.memberships.some((m) => m.clinic_id === delivery.clinic_id) ? delivery.clinic_id
    : activeClinicId ?? access?.memberships[0]?.clinic_id ?? delivery.clinic_id;
  const save = useMutation({
    mutationFn: () => api.recordPostnatalVisit(delivery.id, payload, {
      chief_complaint: t('ob.postnatal.title'), assessment: orNull(f.assessment), plan: orNull(f.plan), clinic_id: clinicId,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pregnancy', delivery.pregnancy_id] }); onClose(); },
    onError: (e) => setError((e as Error).message),
  });
  const sel = (k: keyof typeof f, label: string, values: string[], ns: string) => (
    <Field label={label}>
      <Select value={f[k] as string} onChange={(e) => set(k, e.target.value as never)}>
        <option value="">—</option>
        {values.map((v) => <option key={v} value={v}>{t(`${ns}.${v}`)}</option>)}
      </Select>
    </Field>
  );
  const n = (k: keyof typeof f, label: string, min: number, max: number, step = 1) => (
    <Field label={label}><Input type="number" dir="ltr" min={min} max={max} step={step} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} /></Field>
  );
  const day = daysBetween(delivery.delivered_at.slice(0, 10), f.date);

  return (
    <Modal wide open onClose={onClose} title={t('ob.postnatal.new')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>{t('common.save')}</Button>
      </>}>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('ob.visit.date')}><Input type="date" dir="ltr" value={f.date} min={delivery.delivered_at.slice(0, 10)} max={todayIso()} onChange={(e) => set('date', e.target.value)} /></Field>
        <div><p className="label">{t('ob.postnatal.daysPostpartum')}</p><p className="py-2 text-lg font-semibold">{t('ob.postnatal.day', { n: day })}</p></div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {n('sys', t('ob.visit.systolic'), 50, 260)}{n('dia', t('ob.visit.diastolic'), 30, 180)}
        {n('pulse', t('ob.visit.pulse'), 30, 220)}{n('temp', t('ob.postnatal.temperature'), 34, 43, 0.1)}
        {sel('uterus', t('ob.postnatal.uterus'), ['well_contracted', 'subinvolution', 'tender'], 'ob.postnatal.uterusV')}
        {sel('lochia', t('ob.postnatal.lochia'), ['normal', 'heavy', 'offensive', 'absent'], 'ob.postnatal.lochiaV')}
        {sel('wound', t('ob.postnatal.wound'), ['not_applicable', 'healing', 'infection', 'dehiscence'], 'ob.postnatal.woundV')}
        {n('hb', t('ob.visit.hb'), 3, 20, 0.1)}
        {sel('breastfeeding', t('ob.postnatal.breastfeeding'), ['exclusive', 'mixed', 'formula', 'not_feeding'], 'ob.postnatal.breastfeedingV')}
        {sel('breasts', t('ob.postnatal.breasts'), ['normal', 'engorgement', 'mastitis', 'nipple_trauma'], 'ob.postnatal.breastsV')}
      </div>
      <fieldset className="rounded-lg border border-slate-200 p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">EPDS</legend>
        <p className="mb-2 text-xs text-slate-500">{t('ob.postnatal.epdsHelp')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {n('epds', t('ob.postnatal.epds'), 0, 30)}
          <div className="flex items-end pb-2"><Checkbox label={t('ob.postnatal.epdsSelfHarm')} checked={f.selfHarm} onChange={(v) => set('selfHarm', v)} /></div>
        </div>
      </fieldset>
      {live.length > 0 && <div><p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('ob.visit.liveAlerts')}</p><AlertList alerts={live} /></div>}
      <Field label={t('ob.postnatal.contraception')}><Input value={f.contraception} onChange={(e) => set('contraception', e.target.value)} /></Field>
      <Field label={t('ob.visit.assessment')}><Textarea value={f.assessment} onChange={(e) => set('assessment', e.target.value)} /></Field>
      <Field label={t('ob.visit.plan')}><Textarea value={f.plan} onChange={(e) => set('plan', e.target.value)} /></Field>
    </Modal>
  );
}

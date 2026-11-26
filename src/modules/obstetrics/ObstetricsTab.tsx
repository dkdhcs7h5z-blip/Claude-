import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Baby, CalendarPlus, ClipboardList, HeartCrack, Pencil, PenLine, Pill, Printer, Stethoscope } from 'lucide-react';
import { api } from '@/data';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import type { AntenatalVisitRow, Patient, Pregnancy, PatientClinical } from '@/data/types';
import { formatGADays, gpal, trimesterOf } from '@/clinical/obstetrics';
import { formatDate, formatDateTime } from '@/lib/format';
import { useLang } from '@/lib/queries';
import { deriveObstetric } from './derive';
import { AlertList } from './AlertList';
import { RiskPanel, SchedulePanel } from './Panels';
import { ObstetricCharts } from './Charts';
import { FlowSheet } from './FlowSheet';
import { PregnancyFormModal } from './PregnancyFormModal';
import { VisitFormModal } from './VisitFormModal';
import { DeliveryFormModal, PregnancyLossModal } from './DeliveryFormModal';
import { GrowthPanel } from './GrowthPanel';
import { PostnatalSection } from './PostnatalSection';
import { LabourSection } from './LabourSection';
import { daysBetween, todayIso } from '@/clinical/obstetrics';
import { labourAlerts } from '@/clinical/partogram';
import { sortAlerts } from '@/clinical/obstetricRisk';

const riskTone = { low: 'green', moderate: 'amber', high: 'red' } as const;

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-base font-semibold text-slate-900">{value}</dd>
      {sub && <dd className="text-xs text-slate-500">{sub}</dd>}
    </div>
  );
}

function DeliverySummary({ pregnancyId, canWrite }: { pregnancyId: string; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const q = useQuery({ queryKey: ['pregnancy', pregnancyId], queryFn: () => api.getPregnancyDetail(pregnancyId) });
  const d = q.data?.delivery;
  if (!d) return null;
  const recent = daysBetween(d.delivered_at.slice(0, 10), todayIso()) <= 365;
  return (
    <>
    <div className="mt-2 rounded-lg bg-slate-50 p-3 text-sm">
      <p className="font-medium text-slate-800">
        {t(`ob.delivery.modeV.${d.mode}`)} · {formatDateTime(d.delivered_at, lang)} · <span className="ltr-num">{formatGADays(d.ga_days)}</span>
      </p>
      <p className="text-xs text-slate-600">
        {t('ob.delivery.onset')}: {t(`ob.delivery.onsetV.${d.onset}`)}
        {d.blood_loss_ml != null && <> · {t('ob.delivery.ebl')}: <span className="ltr-num">{d.blood_loss_ml}</span></>}
        {d.perineum && <> · {t(`ob.delivery.perineumV.${d.perineum}`)}</>}
      </p>
      {q.data!.newborns.map((n) => (
        <p key={n.id} className="mt-1 text-xs text-slate-700">
          <Baby className="me-1 inline h-3.5 w-3.5 text-slate-400" />
          {t('ob.delivery.newborn', { n: n.birth_order })}: {n.sex ? t(`ob.delivery.sexV.${n.sex}`) : '—'}
          {n.birth_weight_g != null && <> · <span className="ltr-num">{n.birth_weight_g} g</span></>}
          {n.apgar_1 != null && <> · Apgar <span className="ltr-num">{n.apgar_1}/{n.apgar_5 ?? '—'}</span></>}
          {' · '}{t(`ob.delivery.outcomeV.${n.outcome}`)}
          {n.nicu_admission && <> · NICU</>}
        </p>
      ))}
    </div>
    {recent && <div className="mt-3"><PostnatalSection delivery={d} visits={q.data!.postnatal_visits} canWrite={canWrite} /></div>}
    </>
  );
}

export function ObstetricsTab({ patient, clinical, canWrite }: { patient: Patient; clinical: PatientClinical; canWrite: boolean }) {
  const { t } = useTranslation();
  const lang = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const active = clinical.pregnancies.find((g) => g.status === 'active');
  const previous = clinical.pregnancies.filter((g) => g.status !== 'active')
    .sort((a, b) => (b.outcome_date ?? '').localeCompare(a.outcome_date ?? ''));
  const patchPregnancy = useMutation({
    mutationFn: (patch: Partial<Pregnancy>) => api.updatePregnancy(active!.id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pregnancy', active?.id] });
      void qc.invalidateQueries({ queryKey: ['clinical', patient.id] });
      void qc.invalidateQueries({ queryKey: ['ob-worklist'] });
    },
  });
  const [modal, setModal] = useState<null | 'register' | 'edit' | 'visit' | 'delivery' | 'loss'>(null);
  const [editVisit, setEditVisit] = useState<AntenatalVisitRow | null>(null);

  const detail = useQuery({
    queryKey: ['pregnancy', active?.id],
    queryFn: () => api.getPregnancyDetail(active!.id),
    enabled: !!active,
  });

  const previousCard = previous.length > 0 && (
    <Card title={t('ob.previous')} bodyClassName="p-0">
      <ul className="divide-y divide-slate-100">
        {previous.map((g: Pregnancy) => (
          <li key={g.id} className="px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-800">
                {t(`clinical.pregnancyStatus.${g.status}`)} · {formatDate(g.outcome_date, lang)}
              </p>
              <span className="ltr-num text-xs text-slate-500">{gpal(g)}</span>
            </div>
            {g.status === 'delivered' && <DeliverySummary pregnancyId={g.id} canWrite={canWrite} />}
          </li>
        ))}
      </ul>
    </Card>
  );

  if (!active) {
    return (
      <div className="space-y-5">
        <Card>
          <EmptyState icon={<Stethoscope className="h-10 w-10" />} title={t('ob.noneOngoing')}>
            {canWrite && <Button className="mt-3" icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setModal('register')}>{t('ob.register')}</Button>}
          </EmptyState>
        </Card>
        {previousCard}
        {modal === 'register' && <PregnancyFormModal open onClose={() => setModal(null)} patient={patient} />}
      </div>
    );
  }

  if (detail.isLoading || !detail.data) return <Spinner />;
  const { pregnancy, visits, fetal_assessments, biometry, labour } = detail.data;
  const d = deriveObstetric(pregnancy, patient, visits, fetal_assessments, biometry);
  const showLabour = d.ga != null && d.ga >= 140 && (labour.length > 0 || d.ga >= 238);

  return (
    <div className="space-y-5">
      {/* Pregnancy header */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900">{t('ob.ongoing')}</h2>
              <Badge tone={riskTone[pregnancy.risk_level]}>{t('clinical.risk')}: {t(`clinical.riskLevel.${pregnancy.risk_level}`)}</Badge>
              {pregnancy.plurality > 1 && <Badge tone="violet">×{pregnancy.plurality}</Badge>}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
              <Stat label={t('clinical.ga')} value={<span className="ltr-num text-2xl">{formatGADays(d.ga)}</span>}
                sub={d.ga != null && t('clinical.trimester', { n: trimesterOf(d.ga) })} />
              <Stat label={t('clinical.edd')} value={formatDate(d.edd, lang)} sub={pregnancy.edd_basis && t(`ob.dating.basisV.${pregnancy.edd_basis}`)} />
              <Stat label={t('clinical.gpal')} value={<span className="ltr-num">{gpal(pregnancy)}</span>} />
              <Stat label={t('clinical.conception')} value={pregnancy.conception ? t(`clinical.conceptionType.${pregnancy.conception}`) : '—'} />
              <Stat label={t('ob.booking.bmi')} value={d.bmi ?? '—'} />
            </dl>
            {pregnancy.previous_cs_count != null && pregnancy.previous_cs_count > 0 && (
              <p className="mt-2 text-xs text-slate-600">{t('ob.highRisk.csCount')}: <span className="ltr-num font-semibold">{pregnancy.previous_cs_count}</span></p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 lg:max-w-md lg:justify-end">
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => navigate(`/patients/${patient.id}/antenatal-card/${pregnancy.id}`)}>{t('ob.print.action')}</Button>
          {canWrite && (
            <>
              <Button icon={<PenLine className="h-4 w-4" />} onClick={() => { setEditVisit(null); setModal('visit'); }}>{t('ob.visit.new')}</Button>
              <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setModal('edit')}>{t('common.edit')}</Button>
              {d.ga != null && d.ga >= 140 && <Button variant="secondary" icon={<Baby className="h-4 w-4" />} onClick={() => setModal('delivery')}>{t('ob.delivery.record')}</Button>}
              {d.ga != null && d.ga < 168 && <Button variant="ghost" icon={<HeartCrack className="h-4 w-4" />} onClick={() => setModal('loss')}>{t('ob.closeLoss')}</Button>}
            </>
          )}
          </div>
        </div>
        {pregnancy.risk_factors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {pregnancy.risk_factors.map((r) => <Badge key={r} tone="amber">{t(`ob.riskFactors.${r}`, r)}</Badge>)}
          </div>
        )}
        {(pregnancy.high_risk_plan || pregnancy.current_medications) && (
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-sm sm:grid-cols-2">
            {pregnancy.high_risk_plan && (
              <div><p className="flex items-center gap-1 text-xs font-semibold text-red-800"><ClipboardList className="h-3.5 w-3.5" />{t('ob.highRisk.plan')}</p>
                <p className="mt-0.5 whitespace-pre-line text-slate-700">{pregnancy.high_risk_plan}</p></div>
            )}
            {pregnancy.current_medications && (
              <div><p className="flex items-center gap-1 text-xs font-semibold text-slate-600"><Pill className="h-3.5 w-3.5" />{t('ob.highRisk.medications')}</p>
                <p className="mt-0.5 whitespace-pre-line text-slate-700">{pregnancy.current_medications}</p></div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Card title={t('ob.alerts.title')}><AlertList alerts={sortAlerts([...labourAlerts(labour), ...d.alerts])} /></Card>
          {showLabour && <LabourSection pregnancy={pregnancy} observations={labour} canWrite={canWrite} />}
          <ObstetricCharts visits={visits} gaNow={d.ga} plurality={pregnancy.plurality} />
          <GrowthPanel pregnancy={pregnancy} scans={fetal_assessments} biometry={biometry} canWrite={canWrite} />
          <FlowSheet pregnancy={pregnancy} visits={visits} canWrite={canWrite}
            onNew={canWrite ? () => { setEditVisit(null); setModal('visit'); } : undefined}
            onEdit={(v) => { setEditVisit(v); setModal('visit'); }} />
        </div>
        <div className="space-y-5">
          <RiskPanel pe={d.pe} gdm={d.gdm} bmi={d.bmi} suggestion={d.suggestion} currentLevel={pregnancy.risk_level} detected={d.detected}
            onApplyLevel={canWrite ? () => patchPregnancy.mutate({ risk_level: d.suggestion.level }) : undefined}
            onAddFactor={canWrite ? (c) => patchPregnancy.mutate({ risk_factors: [...pregnancy.risk_factors, c] }) : undefined} />
          <SchedulePanel items={d.schedule} ga={d.ga} />
        </div>
      </div>

      {previousCard}

      {modal === 'edit' && <PregnancyFormModal open onClose={() => setModal(null)} patient={patient} pregnancy={pregnancy} />}
      {modal === 'visit' && <VisitFormModal key={editVisit?.id ?? 'new'} open onClose={() => setModal(null)} pregnancy={pregnancy} visit={editVisit} />}
      {modal === 'delivery' && <DeliveryFormModal open onClose={() => setModal(null)} pregnancy={pregnancy} />}
      {modal === 'loss' && <PregnancyLossModal open onClose={() => setModal(null)} pregnancy={pregnancy} />}
    </div>
  );
}

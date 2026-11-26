import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Lock, Pencil, PenLine, ScanLine, History, CheckCircle2, Circle } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Badge, Button, Card, EmptyState, Spinner } from '@/components/ui';
import type { GynUltrasound, GynVisitRow, Patient } from '@/data/types';
import { iotaSimpleRules } from '@/clinical/gynecology';
import { formatDate, profileName } from '@/lib/format';
import { useLang, useProfiles } from '@/lib/queries';
import { AlertList } from '@/modules/obstetrics/AlertList';
import { deriveGyn } from './derive';
import { GynVisitModal, HistoryModal, UltrasoundModal } from './GynModals';
import { ScreeningSection, statusTone } from './ScreeningSection';
import { ProceduresSection } from './ProceduresSection';
import { LabsCard, MenopauseCard, OvarianRiskBlock, UrogynCard } from './Assessments';

const iotaTone = { benign: 'green', malignant: 'red', inconclusive: 'amber' } as const;

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="text-sm font-semibold text-slate-900">{value || '—'}</dd></div>;
}

function VisitsCard({ patient, visits, canWrite, onNew, onEdit }: {
  patient: Patient; visits: GynVisitRow[]; canWrite: boolean; onNew: () => void; onEdit: (v: GynVisitRow) => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const { can, user } = useAuth();
  const { byId } = useProfiles();
  const sign = useMutation({ mutationFn: (id: string) => api.signEncounter(id), onSuccess: () => void qc.invalidateQueries({ queryKey: ['gyn', patient.id] }) });
  const tone = { draft: 'amber', signed: 'green', amended: 'slate' } as const;
  return (
    <Card title={t('gyn.visit.title')} bodyClassName="p-0" actions={canWrite && <Button size="sm" icon={<PenLine className="h-3.5 w-3.5" />} onClick={onNew}>{t('gyn.visit.new')}</Button>}>
      {!visits.length ? <EmptyState title={t('gyn.visit.none')} /> : (
        <ul className="divide-y divide-slate-100">
          {[...visits].reverse().map((v) => {
            const e = v.encounter;
            return (
              <li key={v.id} className="px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{formatDate(v.visit_date, lang)} · {profileName(byId.get(e.provider_id), lang)}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {v.complaints.map((c) => <Badge key={c} tone="violet">{t(`gyn.complaintV.${c}`)}</Badge>)}
                      {v.palm_coein.map((c) => <Badge key={c} tone="slate">{c} · {t(`gyn.palmV.${c}`)}</Badge>)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {e.is_private && <Badge tone="amber" icon={<Lock className="h-3 w-3" />}>{t('patients.private')}</Badge>}
                    <Badge tone={tone[e.status]}>{t(`ob.visit.${e.status}`)}</Badge>
                    {canWrite && e.status === 'draft' && (!e.is_private || e.provider_id === user?.id) && (
                      <Button size="sm" variant="ghost" aria-label={t('common.edit')} icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => onEdit(v)} />
                    )}
                    {e.status === 'draft' && can('clinical.sign', v.clinic_id) && (
                      <Button size="sm" variant="secondary" onClick={() => confirm(t('ob.visit.signConfirm')) && sign.mutate(e.id)}>{t('ob.visit.sign')}</Button>
                    )}
                  </div>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {v.pain_score != null && <>{t('gyn.visit.pain')}: {v.pain_score}/10 · </>}
                  {v.bp_systolic != null && <><span className="ltr-num">{v.bp_systolic}/{v.bp_diastolic}</span> · </>}
                  {v.uterus_size && <>{t('gyn.visit.uterusSize')}: {t(`gyn.uterusSizeV.${v.uterus_size}`)} · </>}
                  {v.pop_stage != null && <>POP-Q {v.pop_stage}</>}
                </p>
                {v.diagnosis && <p className="mt-1 text-sm font-medium text-slate-800">{v.diagnosis}</p>}
                {(e.assessment || e.plan) && <p className="text-sm text-slate-600">{[e.assessment, e.plan].filter(Boolean).join(' · ')}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function UltrasoundCard({ items, canWrite, onNew, postmenopausal, ca125, he4 }: {
  items: GynUltrasound[]; canWrite: boolean; onNew: () => void; postmenopausal: boolean; ca125: number | null; he4: number | null;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  return (
    <Card title={t('gyn.us.title')} bodyClassName="p-0" actions={canWrite && <Button size="sm" icon={<ScanLine className="h-3.5 w-3.5" />} onClick={onNew}>{t('gyn.us.new')}</Button>}>
      {!items.length ? <EmptyState title={t('gyn.us.none')} /> : (
        <ul className="divide-y divide-slate-100">
          {[...items].reverse().map((u) => {
            const iota = u.adnexal_mass ? iotaSimpleRules(u.iota_b_features, u.iota_m_features) : null;
            return (
              <li key={u.id} className="space-y-1 px-4 py-3 text-sm sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{formatDate(u.performed_at, lang)}{u.route && <span className="font-normal text-slate-500"> · {t(`gyn.routeV.${u.route}`)}</span>}</p>
                  {iota && <Badge tone={iotaTone[iota]}>IOTA: {t(`gyn.iotaResultV.${iota}`)}</Badge>}
                </div>
                <p className="text-slate-700">
                  {u.uterus_length_mm != null && <span className="ltr-num">{u.uterus_length_mm}×{u.uterus_ap_mm ?? '–'}×{u.uterus_width_mm ?? '–'} mm · </span>}
                  {u.endometrial_thickness_mm != null && <>{t('gyn.us.et')}: <strong className="ltr-num">{u.endometrial_thickness_mm}</strong></>}
                  {u.endometrium_appearance && <> ({t(`gyn.endometriumV.${u.endometrium_appearance}`)})</>}
                </p>
                {u.fibroids.length > 0 && (
                  <p className="text-slate-700">{t('gyn.us.fibroids')}: {u.fibroids.map((f) => `FIGO ${f.figo_type}${f.size_mm ? ` ${f.size_mm} mm` : ''}${f.location ? ` (${f.location})` : ''}`).join(' · ')}</p>
                )}
                {(u.right_ovary_volume_ml != null || u.left_ovary_volume_ml != null) && (
                  <p className="text-xs text-slate-600">
                    {t('gyn.us.right')}: {u.right_ovary_volume_ml ?? '–'} mL{u.right_follicle_count != null && `, ${u.right_follicle_count} ${t('gyn.us.follicles')}`} ·
                    {' '}{t('gyn.us.left')}: {u.left_ovary_volume_ml ?? '–'} mL{u.left_follicle_count != null && `, ${u.left_follicle_count} ${t('gyn.us.follicles')}`}
                  </p>
                )}
                {u.adnexal_mass && (
                  <p className="text-xs text-slate-600">{t('gyn.us.adnexalMass')}: {u.mass_side ? t(`gyn.sideV.${u.mass_side}`) : ''} {u.mass_max_diameter_mm ?? ''} mm
                    {[...u.iota_b_features, ...u.iota_m_features].length > 0 && <> · {[...u.iota_b_features, ...u.iota_m_features].join(', ')}</>}</p>
                )}
                {u.impression && <p className="text-slate-600">{u.impression}</p>}
                {u.adnexal_mass && <OvarianRiskBlock orads={u.orads_category} rmiFeatures={u.rmi_features} postmenopausal={postmenopausal} ca125={ca125} he4={he4} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function GynecologyTab({ patient, canWrite }: { patient: Patient; canWrite: boolean }) {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['gyn', patient.id], queryFn: () => api.getGynDetail(patient.id) });
  const [modal, setModal] = useState<null | 'history' | 'visit' | 'us'>(null);
  const [editVisit, setEditVisit] = useState<GynVisitRow | null>(null);
  if (q.isLoading || !q.data) return <Spinner />;
  const det = q.data;
  const d = deriveGyn(patient, det);
  const p = d.profile;

  return (
    <div className="space-y-5">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            <Stat label={t('gyn.summary.menopause')} value={p?.menopause_status && <>{t(`gyn.menopauseV.${p.menopause_status}`)}{p.menopause_age ? ` (${p.menopause_age})` : ''}</>} />
            <Stat label={t('gyn.summary.cycle')} value={p?.cycle_regularity && <>{t(`gyn.regularityV.${p.cycle_regularity}`)}{p.cycle_length_days ? ` · ${t('gyn.daysN', { n: p.cycle_length_days })}` : ''}</>} />
            <Stat label={t('gyn.summary.contraception')} value={p?.contraception && t(`gyn.contraceptionV.${p.contraception}`)} />
            <Stat label={t('gyn.screening.currentStatus')} value={<Badge tone={statusTone[d.screening]}>{t(`gyn.statusV.${d.screening}`)}</Badge>} />
          </dl>
          {canWrite && (
            <div className="flex flex-wrap gap-2 lg:justify-end">
              <Button icon={<PenLine className="h-4 w-4" />} onClick={() => { setEditVisit(null); setModal('visit'); }}>{t('gyn.visit.new')}</Button>
              <Button variant="secondary" icon={<ScanLine className="h-4 w-4" />} onClick={() => setModal('us')}>{t('gyn.us.new')}</Button>
              <Button variant="secondary" icon={<History className="h-4 w-4" />} onClick={() => setModal('history')}>{p ? t('gyn.history.edit') : t('gyn.history.record')}</Button>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-5 xl:col-span-2">
          <Card title={t('ob.alerts.title')}><AlertList alerts={d.alerts} /></Card>
          <VisitsCard patient={patient} visits={det.visits} canWrite={canWrite} onNew={() => { setEditVisit(null); setModal('visit'); }}
            onEdit={(v) => { setEditVisit(v); setModal('visit'); }} />
          <UltrasoundCard items={det.ultrasounds} canWrite={canWrite} onNew={() => setModal('us')} postmenopausal={d.postmenopausal} ca125={d.ca125} he4={d.he4} />
          <LabsCard patient={patient} labs={det.labs} fai={d.fai} lhFsh={d.lhFsh} canWrite={canWrite} />
          <ProceduresSection patient={patient} procedures={det.procedures} canWrite={canWrite} />
        </div>
        <div className="min-w-0 space-y-5">
          <ScreeningSection patient={patient} ageYears={d.age} hysterectomy={p?.hysterectomy} screenings={det.screenings}
            colposcopies={det.colposcopies} status={d.screening} canWrite={canWrite} />
          {(d.postmenopausal || p?.menopause_status === 'perimenopausal' || det.menopause_assessments.length > 0
            || det.visits.some((v) => v.complaints.includes('menopause_symptoms'))) && (
            <MenopauseCard patient={patient} items={det.menopause_assessments} canWrite={canWrite} />
          )}
          {(det.urogyn_assessments.length > 0 || det.visits.some((v) => v.complaints.includes('incontinence') || v.complaints.includes('prolapse') || (v.pop_stage ?? 0) >= 1)) && (
            <UrogynCard patient={patient} items={det.urogyn_assessments} canWrite={canWrite} />
          )}
          {d.premenopausal && d.pcos.met > 0 && (
            <Card title={t('gyn.pcos.title')}>
              <ul className="space-y-1.5 text-sm">
                {(['ovulatoryDysfunction', 'hyperandrogenism', 'pcom'] as const).map((k) => (
                  <li key={k} className="flex items-center gap-2">
                    {d.pcos[k] ? <CheckCircle2 className="h-4 w-4 text-brand-700" /> : <Circle className="h-4 w-4 text-slate-300" />}
                    {t(`gyn.pcos.${k === 'ovulatoryDysfunction' ? 'ovulatory' : k}`)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm font-semibold">{t('gyn.pcos.met', { n: d.pcos.met })}</p>
              <p className="mt-1 text-[11px] text-slate-500">{t('gyn.pcos.note')}</p>
            </Card>
          )}
          <Card title={t('gyn.history.title')}>
            {!p ? <EmptyState title={t('gyn.history.none')} /> : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Stat label={t('gyn.history.menarche')} value={p.menarche_age} />
                <Stat label={t('gyn.history.periodDuration')} value={p.period_duration_days} />
                <Stat label={t('gyn.history.flow')} value={p.menstrual_flow && t(`gyn.flowV.${p.menstrual_flow}`)} />
                <Stat label={t('gyn.history.dysmenorrhea')} value={p.dysmenorrhea && t(`gyn.dysmenorrheaV.${p.dysmenorrhea}`)} />
                <Stat label={t('gyn.history.hpvVaccinated')} value={p.hpv_vaccinated && t(`gyn.yesNoUnknownV.${p.hpv_vaccinated}`)} />
                <Stat label={t('gyn.history.hysterectomy')} value={p.hysterectomy && t(`gyn.hysterectomyV.${p.hysterectomy}`)} />
                {p.on_hrt != null && <Stat label={t('gyn.history.hrt')} value={p.on_hrt ? t('common.yes') : t('common.no')} />}
                {p.previous_gyn_surgery && <div className="col-span-2"><Stat label={t('gyn.history.previousSurgery')} value={p.previous_gyn_surgery} /></div>}
              </dl>
            )}
          </Card>
        </div>
      </div>

      {modal === 'history' && <HistoryModal patient={patient} profile={p} onClose={() => setModal(null)} />}
      {modal === 'visit' && <GynVisitModal key={editVisit?.id ?? 'new'} patient={patient} visit={editVisit} onClose={() => setModal(null)} />}
      {modal === 'us' && <UltrasoundModal patient={patient} postmenopausal={d.postmenopausal} ca125={d.ca125} he4={d.he4} onClose={() => setModal(null)} />}
    </div>
  );
}

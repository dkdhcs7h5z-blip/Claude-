import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '@/data';
import { useAuth } from '@/auth/AuthProvider';
import { Alert, Button, Spinner } from '@/components/ui';
import { ONGOING_CODES, PAST_HISTORY_CODES } from '@/clinical/obstetricRisk';
import { efwCentile } from '@/clinical/fetalGrowth';
import { daysBetween, formatGADays, gpal } from '@/clinical/obstetrics';
import { clinicName, formatDate, formatDateTime, patientName, profileName } from '@/lib/format';
import { useClinics, useLang, useProfiles } from '@/lib/queries';
import { deriveObstetric } from './derive';
import type { ScheduleCode } from '@/clinical/antenatalSchedule';

const SCAN_ITEMS: Array<{ code: ScheduleCode; types: string[] }> = [
  { code: 'dating_nt_scan', types: ['dating_scan', 'nt_scan'] },
  { code: 'anomaly_scan', types: ['anomaly_scan'] },
  { code: 'cervical_length', types: [] },
  { code: 'fetal_echo', types: ['fetal_echo'] },
  { code: 'growth_doppler', types: ['growth_scan', 'doppler'] },
];
const LAB_ITEMS: ScheduleCode[] = ['labs_t1', 'early_ogtt', 'ogtt', 'cbc_t2', 'anti_d', 'labs_t3', 'gbs_screen'];
const BLANK_ROWS = 6;

function Box({ checked }: { checked: boolean }) {
  return (
    <span className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] font-bold leading-none ${checked ? 'border-red-700 bg-red-700 text-white' : 'border-slate-400'}`}>
      {checked ? '✓' : ''}
    </span>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-lg border border-slate-300 p-3 print:rounded-none">
      <h2 className="mb-2 border-b-2 border-teal-700 pb-1 text-sm font-bold uppercase tracking-wide text-teal-800">{n}. {title}</h2>
      {children}
    </section>
  );
}

export function AntenatalCardPage() {
  const { id = '', pregnancyId = '' } = useParams();
  const { t } = useTranslation();
  const lang = useLang();
  const { profile } = useAuth();
  const clinics = useClinics();
  const { byId } = useProfiles();
  const patientQ = useQuery({ queryKey: ['patient', id], queryFn: () => api.getPatient(id) });
  const detailQ = useQuery({ queryKey: ['pregnancy', pregnancyId], queryFn: () => api.getPregnancyDetail(pregnancyId) });
  const clinicalQ = useQuery({ queryKey: ['clinical', id], queryFn: () => api.getPatientClinical(id), enabled: !!patientQ.data });

  useEffect(() => {
    const onPrint = () => { void api.logAccess('PRINT', id, 'pregnancies', pregnancyId); };
    window.addEventListener('beforeprint', onPrint);
    return () => window.removeEventListener('beforeprint', onPrint);
  }, [id, pregnancyId]);

  if (patientQ.isLoading || detailQ.isLoading) return <Spinner />;
  const p = patientQ.data, det = detailQ.data;
  if (!p || !det) return <div className="p-6"><Alert tone="error">{t('patients.notFound')}</Alert></div>;

  const g = det.pregnancy;
  const d = deriveObstetric(g, p, det.visits, det.fetal_assessments, det.biometry);
  const rf = new Set([...g.risk_factors]);
  const clinic = clinics.data?.find((c) => c.id === g.clinic_id);
  const physician = g.status === 'active' && p.primary_physician_id ? byId.get(p.primary_physician_id) : null;
  const lastDelivery = (clinicalQ.data?.pregnancies ?? []).filter((x) => x.id !== g.id && x.outcome_date)
    .sort((a, b) => (b.outcome_date ?? '').localeCompare(a.outcome_date ?? ''))[0];
  const scheduleBy = new Map(d.schedule.map((s) => [s.code, s]));
  const sep = lang === 'ar' ? '، ' : ', ';

  const scanResult = (types: string[]) => det.fetal_assessments
    .filter((f) => types.includes(f.assessment_type))
    .map((f) => {
      const bio = det.biometry.filter((b) => b.fetal_assessment_id === f.id);
      const efw = bio.filter((b) => b.efw_g != null).map((b) => {
        const c = b.ga_days != null ? efwCentile(b.efw_g!, b.ga_days) : null;
        return `${bio.length > 1 ? `${b.fetus_label}: ` : ''}EFW ${b.efw_g} g${c != null ? ` (${t('ob.growth.centileShort', { c: Math.round(c) })})` : ''}`;
      });
      return `${formatDate(f.performed_at, lang)} — ${[...efw, f.impression].filter(Boolean).join(sep)}`;
    });
  const nearScan = (date: string) => det.fetal_assessments.find((f) => Math.abs(daysBetween(f.performed_at.slice(0, 10), date)) <= 3);
  const bioText = (faId: string) => det.biometry.filter((b) => b.fetal_assessment_id === faId)
    .map((b) => [b.ua_pi != null ? `UA PI ${b.ua_pi}` : null, b.ua_edf && b.ua_edf !== 'present' ? `${b.ua_edf} EDF` : null,
      b.dvp_cm != null ? `DVP ${b.dvp_cm}` : null, b.afi_cm != null ? `AFI ${b.afi_cm}` : null].filter(Boolean).join(' ')).filter(Boolean).join(' | ');

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 px-4 print:hidden">
        <Link to={`/patients/${id}?tab=obstetrics`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />{t('ob.print.back')}
        </Link>
        <Button icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>{t('ob.print.print')}</Button>
      </div>

      <div className="overflow-x-auto px-2 print:overflow-visible print:px-0">
      <article className="mx-auto min-w-[180mm] max-w-[210mm] space-y-3 bg-white p-6 text-[12px] leading-snug text-slate-800 shadow print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 rounded-lg bg-teal-800 p-4 text-white print:rounded-none print:[-webkit-print-color-adjust:exact] print:[print-color-adjust:exact]">
          <div>
            <p className="text-lg font-bold">{clinicName(clinic, lang)}</p>
            {physician && <p className="text-sm text-teal-100">{profileName(physician, lang)}</p>}
            <p className="text-xs text-teal-200">{t('app.tagline')}</p>
          </div>
          <div className="text-end">
            <p className="rounded-full border border-teal-200 px-3 py-1 text-xs font-semibold">{t('ob.print.title')}</p>
            <p className="mt-1 text-[10px] text-teal-200">{t('ob.print.confidential')}</p>
          </div>
        </header>

        <Section n={1} title={`${t('ob.print.patient')} & ${t('ob.history.title')}`}>
          <div className="grid grid-cols-3 gap-x-4 gap-y-1">
            <p><b>{t('patients.name')}:</b> {patientName(p, lang)}</p>
            <p><b>{t('patients.mrn')}:</b> <span className="ltr-num">{p.mrn}</span></p>
            <p><b>{t('patients.phone')}:</b> <span className="ltr-num">{p.phone ?? '—'}</span></p>
            <p><b>{t('clinical.lmp')}:</b> {formatDate(g.lmp, lang)}</p>
            <p><b>{t('clinical.edd')}:</b> {formatDate(d.edd, lang)} <span className="text-slate-500">({g.edd_basis ? t(`ob.dating.basisV.${g.edd_basis}`) : '—'})</span></p>
            <p><b>{t('patients.bloodGroup')}:</b> <span className="ltr-num">{p.blood_group ?? '—'}{p.rh_factor === 'positive' ? '+' : p.rh_factor === 'negative' ? '−' : ''}</span></p>
            <p><b>{t('patients.dob')}:</b> {formatDate(p.date_of_birth, lang)} ({t('patients.years', { count: d.ageYears })})</p>
            <p><b>{t('clinical.ga')}:</b> <span className="ltr-num">{formatGADays(d.ga)}</span></p>
            <p><b>{t('ob.booking.bmi')}:</b> {d.bmi ?? '—'}</p>
          </div>
          <p className="mt-1.5">
            <b>{t('clinical.gpal')}:</b> <span className="ltr-num">{gpal(g)} · {t('ob.highRisk.csCount')} {g.previous_cs_count ?? '—'}</span>
            {g.plurality > 1 && <> · ×{g.plurality}{g.chorionicity ? ` (${g.chorionicity.toUpperCase()})` : ''}</>}
            {lastDelivery && <> · <b>{t('ob.previous')}:</b> {t(`clinical.pregnancyStatus.${lastDelivery.status}`)} {formatDate(lastDelivery.outcome_date, lang)}</>}
          </p>
        </Section>

        <Section n={2} title={t('ob.risk.title')}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded bg-emerald-50 p-2 print:[print-color-adjust:exact]">
              <p className="mb-1 font-bold text-emerald-900">{t('ob.riskGroups.past')}</p>
              <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                {PAST_HISTORY_CODES.map((c) => <li key={c} className="flex items-start gap-1"><Box checked={rf.has(c)} /><span>{t(`ob.riskFactors.${c}`)}</span></li>)}
              </ul>
            </div>
            <div className="rounded bg-red-50 p-2 print:[print-color-adjust:exact]">
              <p className="mb-1 font-bold text-red-900">{t('ob.riskGroups.ongoing')}</p>
              <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
                <li className="flex items-start gap-1"><Box checked={g.plurality > 1} /><span>{t('ob.riskFactors.multiple_pregnancy')}</span></li>
                {ONGOING_CODES.map((c) => <li key={c} className="flex items-start gap-1"><Box checked={rf.has(c)} /><span>{t(`ob.riskFactors.${c}`)}</span></li>)}
              </ul>
            </div>
          </div>
          <p className="mt-2"><b>{t('ob.pregnancy.riskLevel')}:</b> {t(`clinical.riskLevel.${g.risk_level}`)}
            {d.suggestion.level !== g.risk_level && <> · {t('ob.highRisk.suggested')}: {t(`clinical.riskLevel.${d.suggestion.level}`)}</>}
            {d.pe.aspirinRecommended && <> · <b>{t('ob.risk.aspirin')}</b></>}
          </p>
          <p className="mt-1"><b>{t('ob.highRisk.plan')}:</b> <span className="whitespace-pre-line">{g.high_risk_plan ?? '—'}</span></p>
          <p className="mt-1"><b>{t('ob.highRisk.medications')}:</b> <span className="whitespace-pre-line">{g.current_medications ?? '—'}</span></p>
        </Section>

        <Section n={3} title={t('ob.print.scans')}>
          <table className="w-full border-collapse text-[11px]">
            <thead><tr className="bg-teal-700 text-white print:[print-color-adjust:exact]">
              <th className="border border-slate-300 p-1 text-start">{t('clinical.type')}</th>
              <th className="border border-slate-300 p-1 text-start">{t('clinical.ga')}</th>
              <th className="border border-slate-300 p-1 text-start">{t('common.date')} / {t('ob.outcomeShort')}</th>
            </tr></thead>
            <tbody>
              {SCAN_ITEMS.map((s) => {
                const item = scheduleBy.get(s.code);
                const res = scanResult(s.types);
                return (
                  <tr key={s.code}>
                    <td className="border border-slate-300 p-1 font-semibold">{t(`ob.schedule.items.${s.code}`)}{!item && <span className="font-normal text-slate-400"> ({t('ob.notIndicated')})</span>}</td>
                    <td className="ltr-num whitespace-nowrap border border-slate-300 p-1">{item ? `${formatGADays(item.start)}–${formatGADays(item.end)}` : '—'}</td>
                    <td className="border border-slate-300 p-1">{res.length ? res.join(' · ') : <span className="inline-block min-w-[40mm]">&nbsp;</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <table className="mt-2 w-full border-collapse text-[11px]">
            <tbody>
              {LAB_ITEMS.map((code) => scheduleBy.get(code)).filter(Boolean).map((it) => (
                <tr key={it!.code}>
                  <td className="w-1/2 border border-slate-300 p-1 font-semibold">{t(`ob.schedule.items.${it!.code}`)}</td>
                  <td className="ltr-num whitespace-nowrap border border-slate-300 p-1">{formatGADays(it!.start)}–{formatGADays(it!.end)}</td>
                  <td className="w-1/3 border border-slate-300 p-1">&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section n={4} title={t('ob.print.visits')}>
          <table className="w-full border-collapse text-[10.5px]">
            <thead><tr className="bg-teal-700 text-white print:[print-color-adjust:exact]">
              {[t('common.date'), t('clinical.ga'), t('ob.visit.weight'), t('ob.visit.bp'), t('ob.visit.sfh'), t('ob.visit.fhr'), 'Hb',
                t('ob.print.urine'), t('ob.print.dopplerAfi'), t('ob.print.notes'), t('ob.nextVisit')].map((h) => (
                <th key={h} className="border border-slate-300 p-1 text-start font-semibold">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {det.visits.map((v) => {
                const scan = nearScan(v.visit_date);
                return (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap border border-slate-300 p-1">{formatDate(v.visit_date, lang)}</td>
                    <td className="ltr-num border border-slate-300 p-1">{formatGADays(v.ga_days)}</td>
                    <td className="border border-slate-300 p-1">{v.weight_kg ?? ''}</td>
                    <td className="ltr-num whitespace-nowrap border border-slate-300 p-1">{v.bp_systolic != null ? `${v.bp_systolic}/${v.bp_diastolic}` : ''}</td>
                    <td className="border border-slate-300 p-1">{v.fundal_height_cm ?? ''}</td>
                    <td className="ltr-num border border-slate-300 p-1">{v.fhr_by_fetus?.join('/') ?? v.fetal_heart_rate ?? ''}</td>
                    <td className="border border-slate-300 p-1">{v.hemoglobin_g_dl ?? ''}</td>
                    <td className="border border-slate-300 p-1">{[v.urine_protein && `${t('ob.print.pShort')} ${t(`ob.dipV.${v.urine_protein}`)}`, v.urine_glucose && `${t('ob.print.gShort')} ${t(`ob.dipV.${v.urine_glucose}`)}`].filter(Boolean).join(' ')}</td>
                    <td className="border border-slate-300 p-1">{scan ? bioText(scan.id) : ''}</td>
                    <td className="border border-slate-300 p-1">{[v.encounter.assessment, v.encounter.plan, v.notes].filter(Boolean).join(' — ')}</td>
                    <td className="whitespace-nowrap border border-slate-300 p-1">{v.next_visit_date ? formatDate(v.next_visit_date, lang) : ''}</td>
                  </tr>
                );
              })}
              {Array.from({ length: BLANK_ROWS }, (_, i) => (
                <tr key={`blank-${i}`}>{Array.from({ length: 11 }, (_, j) => <td key={j} className="h-6 border border-slate-300 p-1">&nbsp;</td>)}</tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="grid grid-cols-2 gap-3 break-inside-avoid">
          <div className="rounded-lg border-s-4 border-red-600 bg-red-50 p-3 print:[print-color-adjust:exact]">
            <p className="mb-1 font-bold text-red-800">{t('ob.warning.title')}</p>
            <ul className="list-disc space-y-0.5 ps-4 text-red-900">
              {(t('ob.warning.items', { returnObjects: true }) as string[]).map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
          <div className="rounded-lg border-s-4 border-emerald-600 bg-emerald-50 p-3 print:[print-color-adjust:exact]">
            <p className="mb-1 font-bold text-emerald-800">{t('ob.care.title')}</p>
            <ul className="list-disc space-y-0.5 ps-4 text-emerald-900">
              {(t('ob.care.items', { returnObjects: true }) as string[]).map((x) => <li key={x}>{x}</li>)}
            </ul>
          </div>
        </div>

        <footer className="flex justify-between border-t border-slate-200 pt-2 text-[10px] text-slate-500">
          <span>{clinicName(clinic, lang)}{clinic && <> · {clinic.code}</>}</span>
          <span>{t('ob.print.generated', { date: formatDateTime(new Date().toISOString(), lang), user: profileName(profile, lang) })}</span>
        </footer>
      </article>
      </div>
    </div>
  );
}

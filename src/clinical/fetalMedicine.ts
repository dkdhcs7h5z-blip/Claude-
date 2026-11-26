/**
 * Fetal medicine — pure decision-support functions.
 *
 * Sources (see docs/FETAL_MEDICINE.md):
 *   Maternal-age T21 risk at term   Morris JK, Mutton DE, Alberman E. J Med Screen 2002;9:2
 *       risk = 1 / (1 + exp(7.330 − 4.211 / (1 + exp(−0.282 × (age − 37.23)))))
 *   GA from CRL                      Robinson HP, Fleming JE. BJOG 1975 (days = 8.052·√CRL + 23.73)
 *   NT 95th centile                  Nicolaides KH (FMF): ≈ 2.1 mm at CRL 45 → 2.7 mm at CRL 84; ≥ 3.5 mm > 99th
 *   Screening cut-offs               UK NHS FASP: high chance ≤ 1:150; contingent band 1:151–1:1000
 *   Low PAPP-A                       RCOG GTG 31: < 0.415 MoM is a major risk factor for SGA
 *   Mid-trimester scan               ISUOG Practice Guidelines 2022; ventriculomegaly ≥ 10 mm; UTD 2014 (APD ≥ 4 mm)
 *   Short cervix                     NICE NG25: ≤ 25 mm at 16+0–24+0 → vaginal progesterone / cerclage
 *   Low-lying placenta               RCOG GTG 27a: < 20 mm from the os at 20 weeks → rescan at 32 weeks
 *   MCA PSV MoM                      Mari G et al. NEJM 2000; median = exp(2.31 + 0.046·GA weeks); ≥ 1.5 MoM = anaemia
 *   FGR definition                   Delphi consensus, Gordijn SJ et al. UOG 2016
 *   FGR staging & timing             Figueras F, Gratacós E. Fetal Diagn Ther 2014 (Barcelona protocol)
 *   TTTS staging                     Quintero RA et al. J Perinatol 1999
 *   Invasive procedures              RCOG GTG 8 (CVS ≥ 10+0, amniocentesis ≥ 15+0); anti-D within 72 h (BSH 2014)
 */
import type { AlertCode, ClinicalAlert } from './obstetricRisk';

export const FM_ALERT_CODES = [
  'combined_high_risk', 'combined_intermediate', 'nt_increased', 'nt_above_p95', 'nasal_bone_absent', 'ft_dv_reversed',
  'tricuspid_regurgitation', 'low_papp_a', 'crl_out_of_range', 'cfdna_high_risk', 'cfdna_no_call', 'cfdna_pending',
  'anomaly_suspected', 'anomaly_incomplete', 'ventriculomegaly', 'cisterna_magna_large', 'nuchal_fold_thick', 'pyelectasis',
  'short_cervix', 'single_umbilical_artery', 'soft_markers', 'amniotic_fluid_abnormal', 'dv_abnormal', 'fetal_anaemia',
  'cpr_low', 'ua_pi_high', 'uta_pi_high', 'hydrops', 'fetal_demise', 'ctg_pathological', 'uv_pulsation', 'fgr_stage',
  'sga_normal_doppler', 'ttts', 'anti_d_needed', 'procedure_early', 'procedure_result_overdue', 'procedure_result_abnormal',
] as const;
export type FmAlertCode = (typeof FM_ALERT_CODES)[number];

const alert = (code: FmAlertCode | AlertCode, severity: ClinicalAlert['severity'], values?: ClinicalAlert['values']): ClinicalAlert =>
  ({ code: code as AlertCode, severity, ...(values ? { values } : {}) });

// ---------------------------------------------------------------------------
// Screening
// ---------------------------------------------------------------------------
/** Maternal-age-related risk of trisomy 21 at term, as the denominator N of 1:N. */
export function ageRiskT21(ageYears: number): number {
  const p = 1 / (1 + Math.exp(7.33 - 4.211 / (1 + Math.exp(-0.282 * (ageYears - 37.23)))));
  return Math.round(1 / p);
}

export const CRL_SCREENING_RANGE: [number, number] = [45, 84];

/** Gestational age (days) from crown-rump length (mm), Robinson & Fleming 1975. */
export function gaFromCrl(crlMm: number): number {
  return Math.round(8.052 * Math.sqrt(crlMm) + 23.73);
}

/** Approximate NT 95th centile (mm) for a CRL of 45–84 mm. */
export function ntP95(crlMm: number): number {
  const c = Math.min(CRL_SCREENING_RANGE[1], Math.max(CRL_SCREENING_RANGE[0], crlMm));
  return Math.round((2.1 + ((c - 45) * 0.6) / 39) * 100) / 100;
}
export const NT_INCREASED_MM = 3.5;

export const HIGH_CHANCE_CUTOFF = 150;
export const CONTINGENT_CUTOFF = 1000;
export type ScreeningCategory = 'high' | 'intermediate' | 'low';
export const screeningCategory = (oneIn: number): ScreeningCategory =>
  (oneIn <= HIGH_CHANCE_CUTOFF ? 'high' : oneIn <= CONTINGENT_CUTOFF ? 'intermediate' : 'low');

export const LOW_PAPP_A_MOM = 0.415;

export interface FirstTrimesterLike {
  fetus_label: string;
  crl_mm: number | null; nt_mm: number | null; nasal_bone: string | null; dv_a_wave: string | null;
  tricuspid_regurgitation: boolean | null; papp_a_mom: number | null;
  risk_t21: number | null; risk_t18: number | null; risk_t13: number | null;
}

export function firstTrimesterAlerts(records: FirstTrimesterLike[]): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const multi = records.length > 1;
  const papp = new Set<number>();
  for (const r of records) {
    const fetus = multi ? r.fetus_label : '';
    const risks = ([['21', r.risk_t21], ['18', r.risk_t18], ['13', r.risk_t13]] as const).filter(([, n]) => n != null) as Array<[string, number]>;
    const high = risks.filter(([, n]) => screeningCategory(n) === 'high');
    const mid = risks.filter(([, n]) => screeningCategory(n) === 'intermediate');
    if (high.length) out.push(alert('combined_high_risk', 'warning', { fetus, trisomies: high.map(([t, n]) => `T${t} 1:${n}`).join(', ') }));
    else if (mid.length) out.push(alert('combined_intermediate', 'info', { fetus, trisomies: mid.map(([t, n]) => `T${t} 1:${n}`).join(', ') }));
    if (r.crl_mm != null && (r.crl_mm < CRL_SCREENING_RANGE[0] || r.crl_mm > CRL_SCREENING_RANGE[1])) {
      out.push(alert('crl_out_of_range', 'info', { fetus, crl: r.crl_mm }));
    }
    if (r.nt_mm != null) {
      if (r.nt_mm >= NT_INCREASED_MM) out.push(alert('nt_increased', 'warning', { fetus, nt: r.nt_mm }));
      else if (r.crl_mm != null && r.nt_mm > ntP95(r.crl_mm)) out.push(alert('nt_above_p95', 'info', { fetus, nt: r.nt_mm, p95: ntP95(r.crl_mm) }));
    }
    if (r.nasal_bone === 'absent') out.push(alert('nasal_bone_absent', 'info', { fetus }));
    if (r.dv_a_wave === 'reversed') out.push(alert('ft_dv_reversed', 'info', { fetus }));
    if (r.tricuspid_regurgitation) out.push(alert('tricuspid_regurgitation', 'info', { fetus }));
    if (r.papp_a_mom != null && r.papp_a_mom < LOW_PAPP_A_MOM) papp.add(r.papp_a_mom);
  }
  if (papp.size) out.push(alert('low_papp_a', 'warning', { mom: Math.min(...papp) }));
  return out;
}

export interface CfdnaLike {
  sampled_on: string; result_status: 'pending' | 'resulted' | 'failed';
  t21: string | null; t18: string | null; t13: string | null; sex_chromosomes: string | null; fetal_fraction_pct: number | null;
}

export function cfdnaAlerts(c: CfdnaLike | null, today: string): ClinicalAlert[] {
  if (!c) return [];
  if (c.result_status === 'pending') {
    const days = Math.round((Date.parse(today) - Date.parse(c.sampled_on)) / 86400000);
    return days > 14 ? [alert('cfdna_pending', 'info', { days })] : [];
  }
  const map = { T21: c.t21, T18: c.t18, T13: c.t13, SCA: c.sex_chromosomes };
  const high = Object.entries(map).filter(([, v]) => v === 'high_risk').map(([k]) => k);
  const out: ClinicalAlert[] = [];
  if (high.length) out.push(alert('cfdna_high_risk', 'warning', { conditions: high.join(', ') }));
  if (c.result_status === 'failed' || Object.values(map).some((v) => v === 'no_call')) {
    out.push(alert('cfdna_no_call', 'info', { ff: c.fetal_fraction_pct ?? '—' }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mid-trimester anomaly scan
// ---------------------------------------------------------------------------
export const VENTRICULOMEGALY_MM = 10;
export const SHORT_CERVIX_MM = 25;
export const LOW_PLACENTA_MM = 20;

export type VentriculomegalyGrade = 'mild' | 'moderate' | 'severe';
export const ventriculomegalyGrade = (mm: number): VentriculomegalyGrade | null =>
  (mm < VENTRICULOMEGALY_MM ? null : mm <= 12 ? 'mild' : mm <= 15 ? 'moderate' : 'severe');

export interface AnomalyLike {
  fetus_label: string; ga_days: number | null; abnormal_structures: string[]; not_visualised: string[];
  atrium_mm: number | null; cisterna_magna_mm: number | null; nuchal_fold_mm: number | null; renal_pelvis_mm: number | null;
  cervical_length_mm: number | null; placenta_location: string | null; placenta_os_mm: number | null; cord_vessels: number | null;
  amniotic_fluid: string | null; soft_markers: string[]; conclusion: 'normal' | 'soft_markers' | 'anomaly_suspected' | 'incomplete';
}

/** Suggested conclusion from the recorded findings (the clinician confirms). */
export function suggestConclusion(a: Pick<AnomalyLike, 'abnormal_structures' | 'not_visualised' | 'soft_markers'> & { anomalies?: string | null }): AnomalyLike['conclusion'] {
  if (a.abnormal_structures.length || (a.anomalies ?? '').trim()) return 'anomaly_suspected';
  if (a.not_visualised.length) return 'incomplete';
  if (a.soft_markers.length) return 'soft_markers';
  return 'normal';
}

export function anomalyAlerts(records: AnomalyLike[]): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const multi = records.length > 1;
  for (const a of records) {
    const fetus = multi ? a.fetus_label : '';
    if (a.conclusion === 'anomaly_suspected') out.push(alert('anomaly_suspected', 'warning', { fetus }));
    if (a.not_visualised.length) out.push(alert('anomaly_incomplete', 'info', { fetus, n: a.not_visualised.length }));
    if (a.atrium_mm != null) {
      const g = ventriculomegalyGrade(a.atrium_mm);
      if (g) out.push(alert('ventriculomegaly', g === 'mild' ? 'warning' : 'critical', { fetus, mm: a.atrium_mm, grade: g }));
    }
    if (a.cisterna_magna_mm != null && a.cisterna_magna_mm > 10) out.push(alert('cisterna_magna_large', 'info', { fetus, mm: a.cisterna_magna_mm }));
    if (a.nuchal_fold_mm != null && a.nuchal_fold_mm >= 6) out.push(alert('nuchal_fold_thick', 'info', { fetus, mm: a.nuchal_fold_mm }));
    if (a.renal_pelvis_mm != null && a.renal_pelvis_mm >= 4) {
      out.push(alert('pyelectasis', a.renal_pelvis_mm >= 10 ? 'warning' : 'info', { fetus, mm: a.renal_pelvis_mm }));
    }
    if (a.cord_vessels === 2) out.push(alert('single_umbilical_artery', 'info', { fetus }));
    const markers = a.soft_markers.filter((m) => m !== 'single_umbilical_artery');
    if (markers.length) out.push(alert('soft_markers', 'info', { fetus, n: markers.length }));
    if (a.amniotic_fluid && a.amniotic_fluid !== 'normal') out.push(alert('amniotic_fluid_abnormal', 'warning', { fetus, af: a.amniotic_fluid }));
  }
  // maternal findings: take the latest record of the scan (same for all fetuses)
  const m = records.find((r) => r.cervical_length_mm != null) ?? records[0];
  if (m?.cervical_length_mm != null && m.cervical_length_mm <= SHORT_CERVIX_MM && (m.ga_days == null || m.ga_days <= 168)) {
    out.push(alert('short_cervix', 'warning', { mm: m.cervical_length_mm }));
  }
  const p = records.find((r) => r.placenta_location != null);
  if (p && (p.placenta_location === 'previa' || (p.placenta_os_mm != null && p.placenta_os_mm <= 0))) out.push(alert('low_placenta_previa', 'warning'));
  else if (p && (p.placenta_location === 'low_lying' || (p.placenta_os_mm != null && p.placenta_os_mm < LOW_PLACENTA_MM))) out.push(alert('low_placenta', 'info'));
  return out;
}

// ---------------------------------------------------------------------------
// Doppler and surveillance
// ---------------------------------------------------------------------------
export const mcaPsvMedian = (gaDays: number) => Math.exp(2.31 + (0.046 * gaDays) / 7);
export function mcaPsvMom(psv: number | null, gaDays: number | null): number | null {
  if (psv == null || gaDays == null || gaDays < 112 || gaDays > 280) return null;
  return Math.round((psv / mcaPsvMedian(gaDays)) * 100) / 100;
}
export const ANAEMIA_MOM = 1.5;

export interface DopplerLike {
  fetus_label: string; ga_days: number | null;
  ua_pi: number | null; ua_pi_centile: number | null; ua_edf: 'present' | 'absent' | 'reversed' | null;
  mca_pi: number | null; mca_psv_mom: number | null; cpr: number | null; cpr_centile: number | null;
  uta_pi_centile: number | null; dv_pi_centile: number | null; dv_a_wave: 'positive' | 'absent' | 'reversed' | null;
  uv_pulsation: boolean | null; mvp_cm: number | null; bladder_visible: boolean | null; hydrops: boolean; fetal_demise: boolean;
  ctg: string | null;
}

export const cprLow = (d: Pick<DopplerLike, 'cpr' | 'cpr_centile'>) =>
  d.cpr_centile != null ? d.cpr_centile < 5 : d.cpr != null && d.cpr < 1;

export function dopplerAlerts(records: DopplerLike[]): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const multi = records.length > 1;
  for (const d of records) {
    const fetus = multi ? d.fetus_label : '';
    if (d.fetal_demise) { out.push(alert('fetal_demise', 'critical', { fetus })); continue; }
    if (d.hydrops) out.push(alert('hydrops', 'critical', { fetus }));
    if (d.ua_edf === 'absent' || d.ua_edf === 'reversed') out.push(alert(d.ua_edf === 'absent' ? 'ua_aedf' : 'ua_redf', 'critical', { fetus }));
    if (d.dv_a_wave === 'absent' || d.dv_a_wave === 'reversed') out.push(alert('dv_abnormal', 'critical', { fetus, wave: d.dv_a_wave }));
    if (d.mca_psv_mom != null && d.mca_psv_mom >= ANAEMIA_MOM) out.push(alert('fetal_anaemia', 'critical', { fetus, mom: d.mca_psv_mom }));
    if (d.ctg === 'pathological') out.push(alert('ctg_pathological', 'critical', { fetus }));
    if (d.uv_pulsation) out.push(alert('uv_pulsation', 'warning', { fetus }));
    if (cprLow(d)) out.push(alert('cpr_low', 'warning', { fetus, cpr: d.cpr ?? '—' }));
    if (d.ua_pi_centile != null && d.ua_pi_centile > 95 && d.ua_edf !== 'absent' && d.ua_edf !== 'reversed') {
      out.push(alert('ua_pi_high', 'warning', { fetus, pi: d.ua_pi ?? '—' }));
    }
  }
  const uta = records.find((r) => r.uta_pi_centile != null);
  if (uta && uta.uta_pi_centile! > 95) out.push(alert('uta_pi_high', 'info'));
  return out;
}

// ---------------------------------------------------------------------------
// Fetal growth restriction: Delphi definition + Barcelona stage
// ---------------------------------------------------------------------------
export interface FgrInput {
  gaDays: number;
  efwCentile: number | null;
  previousEfwCentile?: number | null;
  uaEdf?: DopplerLike['ua_edf'];
  uaPiCentile?: number | null;
  cpr?: number | null;
  cprCentile?: number | null;
  utaPiCentile?: number | null;
  dvPiCentile?: number | null;
  dvAWave?: DopplerLike['dv_a_wave'];
  ctg?: string | null;
}
export type FgrStage = 1 | 2 | 3 | 4;
export interface FgrResult {
  fgr: boolean; sga: boolean; onset: 'early' | 'late' | null; stage: FgrStage | null;
  /** suggested delivery (completed weeks) per the Barcelona protocol */
  deliverAtWeeks: number | null; criteria: string[];
}
const DELIVER_AT: Record<FgrStage, number> = { 1: 37, 2: 34, 3: 30, 4: 26 };

export function assessFgr(i: FgrInput): FgrResult {
  const criteria: string[] = [];
  const efw = i.efwCentile;
  const aredf = i.uaEdf === 'absent' || i.uaEdf === 'reversed';
  const uaHigh = i.uaPiCentile != null && i.uaPiCentile > 95;
  const utaHigh = i.utaPiCentile != null && i.utaPiCentile > 95;
  const cprAbn = cprLow({ cpr: i.cpr ?? null, cpr_centile: i.cprCentile ?? null });
  const early = i.gaDays < 224;
  let fgr = false;
  if (efw != null && efw < 3) { fgr = true; criteria.push('efw_lt3'); }
  if (early) {
    if (aredf) { fgr = true; criteria.push('ua_aredf'); }
    if (efw != null && efw < 10 && (uaHigh || utaHigh)) { fgr = true; criteria.push(uaHigh ? 'efw_lt10_ua' : 'efw_lt10_uta'); }
  } else {
    const crossing = i.previousEfwCentile != null && efw != null && i.previousEfwCentile - efw >= 50;
    const count = [efw != null && efw < 10, crossing, cprAbn || uaHigh].filter(Boolean).length;
    if (count >= 2) {
      fgr = true;
      if (efw != null && efw < 10) criteria.push('efw_lt10');
      if (crossing) criteria.push('crossing_centiles');
      if (cprAbn || uaHigh) criteria.push(cprAbn ? 'cpr_low' : 'ua_pi_high');
    }
  }
  const sga = !fgr && efw != null && efw < 10;
  if (!fgr) return { fgr: false, sga, onset: null, stage: null, deliverAtWeeks: sga ? 40 : null, criteria };
  let stage: FgrStage = 1;
  if (i.uaEdf === 'absent') stage = 2;
  if (i.uaEdf === 'reversed' || (i.dvPiCentile != null && i.dvPiCentile > 95)) stage = 3;
  if (i.dvAWave === 'reversed' || i.dvAWave === 'absent' || i.ctg === 'pathological') stage = 4;
  return { fgr: true, sga: false, onset: early ? 'early' : 'late', stage, deliverAtWeeks: DELIVER_AT[stage], criteria };
}

export function fgrAlert(r: FgrResult, fetus = ''): ClinicalAlert | null {
  if (r.fgr && r.stage) return alert('fgr_stage', r.stage >= 3 ? 'critical' : 'warning', { fetus, stage: r.stage, weeks: r.deliverAtWeeks!, onset: r.onset! });
  if (r.sga) return alert('sga_normal_doppler', 'info', { fetus });
  return null;
}

// ---------------------------------------------------------------------------
// Twin-twin transfusion syndrome (monochorionic diamniotic) — Quintero stage
// ---------------------------------------------------------------------------
export const TTTS_DONOR_MVP = 2;
export const TTTS_RECIPIENT_MVP = 8;
export const MONOCHORIONIC_DIAMNIOTIC = ['mcda', 'mcta'];

export function quinteroStage(fetuses: DopplerLike[], chorionicity: string | null | undefined): { stage: 1 | 2 | 3 | 4 | 5; donor: string; recipient: string } | null {
  if (!chorionicity || !MONOCHORIONIC_DIAMNIOTIC.includes(chorionicity)) return null;
  const withMvp = fetuses.filter((f) => f.mvp_cm != null);
  if (withMvp.length < 2) return null;
  const sorted = [...withMvp].sort((a, b) => a.mvp_cm! - b.mvp_cm!);
  const donor = sorted[0], recipient = sorted[sorted.length - 1];
  if (!(donor.mvp_cm! < TTTS_DONOR_MVP && recipient.mvp_cm! > TTTS_RECIPIENT_MVP)) return null;
  const pair = [donor, recipient];
  const critical = (f: DopplerLike) => f.ua_edf === 'absent' || f.ua_edf === 'reversed' || f.dv_a_wave === 'reversed' || !!f.uv_pulsation;
  let stage: 1 | 2 | 3 | 4 | 5 = 1;
  if (donor.bladder_visible === false) stage = 2;
  if (pair.some(critical)) stage = 3;
  if (pair.some((f) => f.hydrops)) stage = 4;
  if (pair.some((f) => f.fetal_demise)) stage = 5;
  return { stage, donor: donor.fetus_label, recipient: recipient.fetus_label };
}

// ---------------------------------------------------------------------------
// Invasive procedures
// ---------------------------------------------------------------------------
export const MIN_GA_DAYS: Record<string, number> = { cvs: 70, amniocentesis: 105 };
export interface ProcedureLike {
  procedure_type: string; performed_on: string; ga_days: number | null; anti_d_given: boolean | null;
  result_status: string; tests: string[];
}

export function procedureAlerts(items: ProcedureLike[], opts: { rhNegative: boolean; sensitised?: boolean; today: string }): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  for (const p of items) {
    const age = Math.round((Date.parse(opts.today) - Date.parse(p.performed_on)) / 86400000);
    if (opts.rhNegative && !opts.sensitised && p.anti_d_given !== true && age <= 3) out.push(alert('anti_d_needed', 'warning', { date: p.performed_on }));
    const min = MIN_GA_DAYS[p.procedure_type];
    if (min != null && p.ga_days != null && p.ga_days < min) out.push(alert('procedure_early', 'info', { weeks: Math.floor(min / 7) }));
    if (p.result_status === 'pending' && p.tests.length && age > 21) out.push(alert('procedure_result_overdue', 'info', { days: age }));
    if (p.result_status === 'abnormal') out.push(alert('procedure_result_abnormal', 'warning'));
  }
  return out;
}

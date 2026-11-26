/**
 * Obstetric clinical decision support — pure functions, no I/O.
 *
 * These are guideline-based DEFAULTS to support (not replace) clinical judgement.
 * Sources:
 *   - Pre-eclampsia aspirin criteria: NICE NG133 (Hypertension in pregnancy), 2019/2023.
 *   - GDM risk-factor screening: NICE NG3 (Diabetes in pregnancy). Many settings
 *     instead screen universally (WHO 2013 / IADPSG) — follow local policy.
 *   - BP thresholds: NICE NG133 / ACOG PB 222 (≥140/90 hypertension; ≥160/110 severe).
 *   - Anaemia: NICE antenatal care (Hb < 11.0 g/dL first trimester, < 10.5 thereafter); WHO severe < 7.0.
 *   - Fetal heart rate normal range 110–160 bpm; SFH ≈ GA (weeks) ± 2 cm from 24 weeks.
 */
import type { AntenatalVisit, Pregnancy } from '@/data/types';

export const RISK_FACTOR_CODES = [
  // pre-eclampsia — high risk (NICE NG133)
  'prev_hypertensive_pregnancy', 'chronic_kidney_disease', 'autoimmune_disease', 'diabetes_preexisting', 'chronic_hypertension',
  // pre-eclampsia — moderate risk (age, parity, BMI, plurality are derived)
  'pregnancy_interval_over_10y', 'family_history_preeclampsia',
  // GDM (NICE NG3)
  'previous_gdm', 'previous_macrosomia', 'family_history_diabetes', 'high_prevalence_ethnicity_diabetes',
  // general obstetric history / conditions
  'previous_cs', 'previous_preterm_birth', 'previous_stillbirth', 'recurrent_miscarriage', 'placenta_previa',
  'thyroid_disease', 'epilepsy', 'cardiac_disease', 'smoking', 'rh_alloimmunization',
] as const;
export type RiskFactorCode = (typeof RISK_FACTOR_CODES)[number];

export const PE_HIGH_FACTORS: RiskFactorCode[] = [
  'prev_hypertensive_pregnancy', 'chronic_kidney_disease', 'autoimmune_disease', 'diabetes_preexisting', 'chronic_hypertension',
];

export type DerivedModerate = 'nulliparity' | 'age_40_plus' | 'bmi_35_plus' | 'multiple_pregnancy';

export interface PreeclampsiaAssessment {
  high: RiskFactorCode[];
  moderate: Array<RiskFactorCode | DerivedModerate>;
  aspirinRecommended: boolean;
}

export interface MaternalContext {
  riskFactors: string[];
  para: number | null;
  ageYears: number;
  plurality: number;
  bmi: number | null;
}

export function assessPreeclampsia(c: MaternalContext): PreeclampsiaAssessment {
  const rf = new Set(c.riskFactors);
  const high = PE_HIGH_FACTORS.filter((f) => rf.has(f));
  const moderate: Array<RiskFactorCode | DerivedModerate> = [];
  if (c.para === 0) moderate.push('nulliparity');
  if (c.ageYears >= 40) moderate.push('age_40_plus');
  if (rf.has('pregnancy_interval_over_10y')) moderate.push('pregnancy_interval_over_10y');
  if (c.bmi != null && c.bmi >= 35) moderate.push('bmi_35_plus');
  if (rf.has('family_history_preeclampsia')) moderate.push('family_history_preeclampsia');
  if (c.plurality > 1) moderate.push('multiple_pregnancy');
  return { high, moderate, aspirinRecommended: high.length >= 1 || moderate.length >= 2 };
}

export type GdmReason = 'bmi_over_30' | 'previous_gdm' | 'previous_macrosomia' | 'family_history_diabetes' | 'high_prevalence_ethnicity_diabetes';

export interface GdmAssessment {
  reasons: GdmReason[];
  ogttIndicated: boolean;
  /** previous GDM → early testing (booking) in addition to 24–28 weeks */
  earlyTesting: boolean;
  /** pre-existing diabetes is managed as diabetes, not screened */
  preexistingDiabetes: boolean;
}

export function assessGdm(c: Pick<MaternalContext, 'riskFactors' | 'bmi'>): GdmAssessment {
  const rf = new Set(c.riskFactors);
  const reasons: GdmReason[] = [];
  if (c.bmi != null && c.bmi > 30) reasons.push('bmi_over_30');
  (['previous_gdm', 'previous_macrosomia', 'family_history_diabetes', 'high_prevalence_ethnicity_diabetes'] as const)
    .forEach((r) => rf.has(r) && reasons.push(r));
  const preexistingDiabetes = rf.has('diabetes_preexisting');
  return {
    reasons,
    ogttIndicated: !preexistingDiabetes && reasons.length > 0,
    earlyTesting: !preexistingDiabetes && rf.has('previous_gdm'),
    preexistingDiabetes,
  };
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertCode =
  | 'severe_hypertension' | 'suspected_preeclampsia' | 'hypertension' | 'proteinuria' | 'glycosuria'
  | 'absent_fetal_movements' | 'reduced_fetal_movements' | 'fhr_abnormal' | 'sfh_large' | 'sfh_small'
  | 'severe_anemia' | 'anemia' | 'malpresentation' | 'severe_edema'
  | 'rh_negative' | 'post_dates' | 'post_term';

export interface ClinicalAlert {
  code: AlertCode;
  severity: AlertSeverity;
  /** values for message interpolation */
  values?: Record<string, string | number>;
}

const proteinRank = { negative: 0, trace: 0.5, '1+': 1, '2+': 2, '3+': 3, '4+': 4 } as const;

export function visitAlerts(
  v: Pick<AntenatalVisit, 'bp_systolic' | 'bp_diastolic' | 'urine_protein' | 'urine_glucose' | 'fetal_movements'
    | 'fetal_heart_rate' | 'fundal_height_cm' | 'hemoglobin_g_dl' | 'presentation' | 'edema'>,
  gaDays: number | null,
  plurality = 1,
): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const weeks = gaDays == null ? null : gaDays / 7;
  const sys = v.bp_systolic, dia = v.bp_diastolic;
  const protein = v.urine_protein ? proteinRank[v.urine_protein] : 0;

  if (sys != null && dia != null) {
    const bp = `${sys}/${dia}`;
    if (sys >= 160 || dia >= 110) out.push({ code: 'severe_hypertension', severity: 'critical', values: { bp } });
    if ((sys >= 140 || dia >= 90) && protein >= 1 && (weeks == null || weeks >= 20)) {
      out.push({ code: 'suspected_preeclampsia', severity: 'critical', values: { bp, protein: v.urine_protein! } });
    } else if ((sys >= 140 || dia >= 90) && sys < 160 && dia < 110) {
      out.push({ code: 'hypertension', severity: 'warning', values: { bp } });
    }
  }
  if (protein >= 2 && !out.some((a) => a.code === 'suspected_preeclampsia')) {
    out.push({ code: 'proteinuria', severity: 'warning', values: { protein: v.urine_protein! } });
  }
  if (v.urine_glucose && proteinRank[v.urine_glucose] >= 2) {
    out.push({ code: 'glycosuria', severity: 'warning', values: { glucose: v.urine_glucose } });
  }
  if (weeks == null || weeks >= 24) {
    if (v.fetal_movements === 'absent') out.push({ code: 'absent_fetal_movements', severity: 'critical' });
    else if (v.fetal_movements === 'reduced') out.push({ code: 'reduced_fetal_movements', severity: 'warning' });
  }
  if (v.fetal_heart_rate != null && (v.fetal_heart_rate < 110 || v.fetal_heart_rate > 160)) {
    out.push({ code: 'fhr_abnormal', severity: 'warning', values: { fhr: v.fetal_heart_rate } });
  }
  if (v.fundal_height_cm != null && weeks != null && weeks >= 24 && plurality === 1) {
    const diff = v.fundal_height_cm - Math.floor(weeks);
    if (diff > 2) out.push({ code: 'sfh_large', severity: 'warning', values: { sfh: v.fundal_height_cm, weeks: Math.floor(weeks) } });
    if (diff < -2) out.push({ code: 'sfh_small', severity: 'warning', values: { sfh: v.fundal_height_cm, weeks: Math.floor(weeks) } });
  }
  if (v.hemoglobin_g_dl != null) {
    const limit = weeks != null && weeks < 14 ? 11 : 10.5;
    if (v.hemoglobin_g_dl < 7) out.push({ code: 'severe_anemia', severity: 'critical', values: { hb: v.hemoglobin_g_dl } });
    else if (v.hemoglobin_g_dl < limit) out.push({ code: 'anemia', severity: 'warning', values: { hb: v.hemoglobin_g_dl, limit } });
  }
  if (weeks != null && weeks >= 36 && v.presentation && !['cephalic', 'not_assessed'].includes(v.presentation)) {
    out.push({ code: 'malpresentation', severity: 'warning', values: { presentation: v.presentation } });
  }
  if (v.edema === 'severe') out.push({ code: 'severe_edema', severity: 'info' });
  return out;
}

export function pregnancyAlerts(
  p: Pick<Pregnancy, 'status'>, gaDays: number | null, rhFactor: 'positive' | 'negative' | null,
): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  if (p.status !== 'active') return out;
  if (rhFactor === 'negative') out.push({ code: 'rh_negative', severity: 'info' });
  if (gaDays != null && gaDays >= 294) out.push({ code: 'post_term', severity: 'critical' });
  else if (gaDays != null && gaDays >= 287) out.push({ code: 'post_dates', severity: 'warning' });
  return out;
}

export const severityRank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
export function sortAlerts(a: ClinicalAlert[]): ClinicalAlert[] {
  return [...a].sort((x, y) => severityRank[x.severity] - severityRank[y.severity]);
}

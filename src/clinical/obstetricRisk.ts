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

/**
 * Risk-factor codes, grouped as on the clinic's antenatal follow-up card:
 *   A. past obstetric & medical history, B. ongoing-pregnancy high-risk factors,
 *   plus additional screening factors used by the NICE pre-eclampsia / GDM rules.
 */
export const PAST_HISTORY_CODES = [
  'prev_hypertensive_pregnancy', 'previous_gdm', 'diabetes_preexisting', 'previous_preterm_birth', 'previous_fgr',
  'previous_stillbirth', 'recurrent_miscarriage', 'cervical_insufficiency', 'previous_fetal_anomaly', 'chronic_hypertension',
  'chronic_kidney_disease', 'thyroid_disease', 'thrombophilia', 'autoimmune_disease', 'previous_pph', 'previous_uterine_surgery',
  'previous_cs', 'cardiac_disease', 'epilepsy',
] as const;

export const ONGOING_CODES = [
  'current_hypertensive_disorder', 'current_gdm', 'current_fgr_abnormal_doppler', 'short_cervix_threatened_ptl',
  'rh_alloimmunization', 'placenta_previa', 'oligo_polyhydramnios', 'suspected_fetal_anomaly', 'anticoagulant_or_aspirin',
] as const;

export const SCREENING_CODES = [
  'pregnancy_interval_over_10y', 'family_history_preeclampsia', 'previous_macrosomia', 'family_history_diabetes',
  'high_prevalence_ethnicity_diabetes', 'smoking',
] as const;

export const RISK_FACTOR_CODES = [...PAST_HISTORY_CODES, ...ONGOING_CODES, ...SCREENING_CODES] as const;
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
  /** GDM already diagnosed in this pregnancy */
  diagnosed: boolean;
}

export function assessGdm(c: Pick<MaternalContext, 'riskFactors' | 'bmi'>): GdmAssessment {
  const rf = new Set(c.riskFactors);
  const reasons: GdmReason[] = [];
  if (c.bmi != null && c.bmi > 30) reasons.push('bmi_over_30');
  (['previous_gdm', 'previous_macrosomia', 'family_history_diabetes', 'high_prevalence_ethnicity_diabetes'] as const)
    .forEach((r) => rf.has(r) && reasons.push(r));
  const preexistingDiabetes = rf.has('diabetes_preexisting');
  const diagnosed = rf.has('current_gdm');
  return {
    reasons,
    ogttIndicated: !preexistingDiabetes && !diagnosed && reasons.length > 0,
    earlyTesting: !preexistingDiabetes && !diagnosed && rf.has('previous_gdm'),
    preexistingDiabetes,
    diagnosed,
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
  | 'rh_negative' | 'post_dates' | 'post_term'
  // fetal growth / multiples
  | 'fgr_suspected' | 'sga' | 'lga' | 'ua_aedf' | 'ua_redf' | 'oligohydramnios' | 'polyhydramnios' | 'low_placenta' | 'low_placenta_previa'
  | 'twin_discordance' | 'monochorionic' | 'chorionicity_unknown'
  // postnatal
  | 'pn_severe_hypertension' | 'pn_hypertension' | 'epds_self_harm' | 'pn_fever' | 'pn_heavy_lochia' | 'pn_endometritis'
  | 'pn_subinvolution' | 'pn_wound' | 'pn_mastitis' | 'epds_probable' | 'epds_possible' | 'pn_anemia'
  // labour
  | 'partogram_action' | 'partogram_alert' | 'thick_meconium' | 'tachysystole' | 'intrapartum_fever'
  // gynecology
  | 'pmb_thick_endometrium' | 'pmb_thin_endometrium' | 'pmb_needs_assessment' | 'asymptomatic_thick_endometrium'
  | 'aub_45_sampling' | 'postcoital_bleeding' | 'iota_malignant' | 'iota_inconclusive' | 'screening_action'
  | 'screening_overdue' | 'histology_pending' | 'pcos_criteria' | 'prolapse_stage' | 'severe_pain' | 'gyn_hypertension'
  | 'poi_confirmed' | 'poi_possible' | 'hyperprolactinemia' | 'tsh_high' | 'tsh_low' | 'hyperandrogenism_lab' | 'diabetes_range'
  | 'prediabetes_range' | 'anemia_lab' | 'iron_deficiency' | 'ca125_raised' | 'mrs_severe' | 'mrs_psychological'
  | 'continuous_leakage' | 'iciq_severe' | 'orads_5' | 'orads_4' | 'rmi_high' | 'roma_high'
  // fertility
  | 'ohss_risk' | 'trigger_ready' | 'start_antagonist' | 'premature_lh' | 'p4_elevated' | 'thin_endometrium'
  | 'storage_consent_expired' | 'storage_consent_expiring' | 'beta_hcg_due' | 'poor_responder' | 'hyper_responder'
  | 'iui_unlikely' | 'azoospermia' | 'tubal_blocked';

export interface ClinicalAlert {
  code: AlertCode;
  severity: AlertSeverity;
  /** values for message interpolation */
  values?: Record<string, string | number>;
}

const proteinRank = { negative: 0, trace: 0.5, '1+': 1, '2+': 2, '3+': 3, '4+': 4 } as const;

export function visitAlerts(
  v: Pick<AntenatalVisit, 'bp_systolic' | 'bp_diastolic' | 'urine_protein' | 'urine_glucose' | 'fetal_movements'
    | 'fetal_heart_rate' | 'fundal_height_cm' | 'hemoglobin_g_dl' | 'presentation' | 'edema'>
    & { fhr_by_fetus?: number[] | null; presentation_by_fetus?: string[] | null },
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
  const fhrs = v.fhr_by_fetus?.length ? v.fhr_by_fetus : v.fetal_heart_rate != null ? [v.fetal_heart_rate] : [];
  fhrs.forEach((fhr, i) => {
    if (fhr != null && (fhr < 110 || fhr > 160)) {
      out.push({ code: 'fhr_abnormal', severity: 'warning', values: { fhr, fetus: fhrs.length > 1 ? String.fromCharCode(65 + i) : '' } });
    }
  });
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
  const presentations = v.presentation_by_fetus?.length ? v.presentation_by_fetus : v.presentation ? [v.presentation] : [];
  if (weeks != null && weeks >= 36) {
    presentations.forEach((p, i) => {
      if (p && !['cephalic', 'not_assessed'].includes(p)) {
        out.push({ code: 'malpresentation', severity: 'warning', values: { presentation: p, fetus: presentations.length > 1 ? String.fromCharCode(65 + i) : '' } });
      }
    });
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

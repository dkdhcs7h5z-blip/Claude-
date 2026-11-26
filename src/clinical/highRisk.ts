/**
 * High-risk pregnancy classification — pure functions.
 *
 * Mirrors sections 2A/2B of the clinic's antenatal follow-up card. The result is a
 * SUGGESTION shown next to the clinician-set risk level; it never overwrites it.
 *
 *   high      any ongoing-pregnancy factor (2B), multiple pregnancy, or a major
 *             past/medical factor (list below)
 *   moderate  any other recorded risk factor, or aspirin criteria met
 *   low       none of the above
 */
import { ONGOING_CODES, type ClinicalAlert } from './obstetricRisk';

export const MAJOR_PAST_CODES = [
  'prev_hypertensive_pregnancy', 'diabetes_preexisting', 'previous_preterm_birth', 'previous_fgr', 'previous_stillbirth',
  'cervical_insufficiency', 'chronic_hypertension', 'chronic_kidney_disease', 'thrombophilia', 'autoimmune_disease',
  'cardiac_disease', 'previous_fetal_anomaly',
];

export type RiskLevel = 'low' | 'moderate' | 'high';

export interface RiskClassification {
  level: RiskLevel;
  reasons: string[];
}

export function classifyRisk(input: {
  riskFactors: string[]; plurality: number; aspirinRecommended: boolean; detected?: string[];
}): RiskClassification {
  const all = [...new Set([...input.riskFactors, ...(input.detected ?? [])])];
  const ongoing = all.filter((c) => (ONGOING_CODES as readonly string[]).includes(c));
  const major = all.filter((c) => MAJOR_PAST_CODES.includes(c));
  const high = [...(input.plurality > 1 ? ['multiple_pregnancy'] : []), ...ongoing, ...major];
  if (high.length) return { level: 'high', reasons: high };
  if (all.length || input.aspirinRecommended) {
    return { level: 'moderate', reasons: all.length ? all : ['aspirin_criteria'] };
  }
  return { level: 'low', reasons: [] };
}

/**
 * Ongoing-pregnancy factors evidenced by recorded data but not yet ticked.
 * `visitAlertCodes` are alerts from visits at ≥ 20 weeks; `scanAlertCodes` from scans.
 */
export function detectOngoingFactors(input: {
  riskFactors: string[]; visitAlertCodes: string[]; scanAlertCodes: string[];
}): string[] {
  const has = new Set(input.riskFactors);
  const v = new Set(input.visitAlertCodes);
  const s = new Set(input.scanAlertCodes);
  const out: string[] = [];
  if (['hypertension', 'severe_hypertension', 'suspected_preeclampsia'].some((c) => v.has(c))) out.push('current_hypertensive_disorder');
  if (['fgr_suspected', 'sga', 'ua_aedf', 'ua_redf'].some((c) => s.has(c))) out.push('current_fgr_abnormal_doppler');
  if (s.has('oligohydramnios') || s.has('polyhydramnios')) out.push('oligo_polyhydramnios');
  if (s.has('low_placenta_previa')) out.push('placenta_previa');
  return out.filter((c) => !has.has(c));
}

export const alertCodes = (alerts: ClinicalAlert[]) => alerts.map((a) => a.code as string);

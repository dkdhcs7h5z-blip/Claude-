/**
 * Ovarian-mass malignancy risk — pure functions.
 *  - RMI I (Jacobs 1990): RMI = U × M × CA-125 (U/mL). U = 0 (no features), 1 (one),
 *    3 (two or more) of: multilocular, solid areas, bilateral, ascites, intra-abdominal
 *    metastases. M = 1 premenopausal, 3 postmenopausal. RCOG GTG 34/62: RMI ≥ 200 → refer
 *    to a gynaecological oncology team.
 *  - ROMA (Moore 2009): premenopausal PI = −12.0 + 2.38·ln(HE4) + 0.0626·ln(CA-125);
 *    postmenopausal PI = −8.09 + 1.04·ln(HE4) + 0.732·ln(CA-125); ROMA = e^PI / (1 + e^PI).
 *    High-risk cut-offs are ASSAY-SPECIFIC — defaults are Abbott ARCHITECT (7.4 % / 25.3 %).
 *  - O-RADS US (ACR, v2022): category assigned by the clinician from the lexicon; this
 *    module only supplies the risk band and management summary for the chosen category.
 */
import type { ClinicalAlert } from './obstetricRisk';

export const RMI_FEATURES = ['multilocular', 'solid_areas', 'bilateral', 'ascites', 'metastases'] as const;
export const RMI_REFERRAL_THRESHOLD = 200;

export function rmi(features: string[], postmenopausal: boolean, ca125: number | null): { u: number; m: number; value: number | null } {
  const n = features.length;
  const u = n === 0 ? 0 : n === 1 ? 1 : 3;
  const m = postmenopausal ? 3 : 1;
  return { u, m, value: ca125 == null ? null : Math.round(u * m * ca125) };
}

export const ROMA_CUTOFFS = { premenopausal: 7.4, postmenopausal: 25.3 };

export function roma(he4: number | null, ca125: number | null, postmenopausal: boolean, cutoffs = ROMA_CUTOFFS) {
  if (he4 == null || ca125 == null || he4 <= 0 || ca125 <= 0) return null;
  const pi = postmenopausal ? -8.09 + 1.04 * Math.log(he4) + 0.732 * Math.log(ca125) : -12.0 + 2.38 * Math.log(he4) + 0.0626 * Math.log(ca125);
  const value = Math.round((Math.exp(pi) / (1 + Math.exp(pi))) * 1000) / 10;
  const cutoff = postmenopausal ? cutoffs.postmenopausal : cutoffs.premenopausal;
  return { value, cutoff, high: value >= cutoff };
}

export const ORADS_RISK: Record<number, string> = { 0: 'incomplete', 1: '0%', 2: '<1%', 3: '1–<10%', 4: '10–<50%', 5: '≥50%' };

export function ovarianAlerts(input: { orads?: number | null; rmiValue?: number | null; roma?: { value: number; high: boolean } | null }): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  if (input.orads === 5) out.push({ code: 'orads_5', severity: 'critical' });
  else if (input.orads === 4) out.push({ code: 'orads_4', severity: 'warning' });
  if (input.rmiValue != null && input.rmiValue >= RMI_REFERRAL_THRESHOLD) out.push({ code: 'rmi_high', severity: 'critical', values: { rmi: input.rmiValue } });
  if (input.roma?.high) out.push({ code: 'roma_high', severity: 'warning', values: { roma: input.roma.value } });
  return out;
}

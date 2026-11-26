/**
 * Validated questionnaires — scoring only (no I/O).
 *  - Menopause Rating Scale (Heinemann et al. 2004): 11 items 0–4.
 *    Total: 0–4 none/little · 5–8 mild · 9–16 moderate · ≥ 17 severe.
 *    Somatic (1,2,3,11): 0–2 · 3–4 · 5–8 · ≥ 9. Psychological (4–7): 0–1 · 2–3 · 4–6 · ≥ 7.
 *    Urogenital (8–10): 0 · 1 · 2–3 · ≥ 4.
 *  - ICIQ-UI Short Form (Avery et al. 2004): frequency 0–5 + amount 0/2/4/6 + interference
 *    0–10 = 0–21. Severity (Klovning et al. 2009): 1–5 slight · 6–12 moderate · 13–18 severe ·
 *    19–21 very severe. Q6 leak situations suggest the type (stress / urge / mixed).
 */
import type { ClinicalAlert } from './obstetricRisk';

export const MRS_ITEMS = ['hot_flushes', 'heart_discomfort', 'sleep', 'depressive_mood', 'irritability', 'anxiety', 'exhaustion',
  'sexual', 'bladder', 'vaginal_dryness', 'joint_muscle'] as const;
export type Severity = 'none' | 'mild' | 'moderate' | 'severe';

const band = (v: number, cuts: [number, number, number]): Severity => (v <= cuts[0] ? 'none' : v <= cuts[1] ? 'mild' : v <= cuts[2] ? 'moderate' : 'severe');

export function scoreMrs(items: number[]) {
  const s = (idx: number[]) => idx.reduce((a, i) => a + (items[i] ?? 0), 0);
  const somatic = s([0, 1, 2, 10]), psychological = s([3, 4, 5, 6]), urogenital = s([7, 8, 9]);
  const total = somatic + psychological + urogenital;
  return {
    total, somatic, psychological, urogenital,
    severity: band(total, [4, 8, 16]),
    somaticSeverity: band(somatic, [2, 4, 8]),
    psychologicalSeverity: band(psychological, [1, 3, 6]),
    urogenitalSeverity: band(urogenital, [0, 1, 3]),
  };
}

export const ICIQ_SITUATIONS = ['never', 'before_toilet', 'cough_sneeze', 'asleep', 'physical_activity', 'after_voiding', 'no_reason', 'all_the_time'] as const;
export type IciqSeverity = 'none' | 'slight' | 'moderate' | 'severe' | 'very_severe';
export type IncontinenceType = 'stress' | 'urge' | 'mixed' | 'other' | 'none';

export function scoreIciq(frequency: number, amount: number, interference: number, situations: string[]) {
  const score = frequency + amount + interference;
  const severity: IciqSeverity = score === 0 ? 'none' : score <= 5 ? 'slight' : score <= 12 ? 'moderate' : score <= 18 ? 'severe' : 'very_severe';
  const s = new Set(situations);
  const stress = s.has('cough_sneeze') || s.has('physical_activity');
  const urge = s.has('before_toilet');
  const type: IncontinenceType = stress && urge ? 'mixed' : stress ? 'stress' : urge ? 'urge' : score === 0 || s.has('never') ? 'none' : 'other';
  return { score, severity, type, continuous: s.has('all_the_time') };
}

export function questionnaireAlerts(mrs: number[] | null, iciq: { frequency: number; amount: number; interference: number; leak_situations: string[] } | null): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  if (mrs) {
    const m = scoreMrs(mrs);
    if (m.severity === 'severe') out.push({ code: 'mrs_severe', severity: 'warning', values: { score: m.total } });
    if (m.psychologicalSeverity === 'severe') out.push({ code: 'mrs_psychological', severity: 'warning' });
  }
  if (iciq) {
    const q = scoreIciq(iciq.frequency, iciq.amount, iciq.interference, iciq.leak_situations);
    if (q.continuous) out.push({ code: 'continuous_leakage', severity: 'warning' });
    if (q.severity === 'severe' || q.severity === 'very_severe') out.push({ code: 'iciq_severe', severity: 'info', values: { score: q.score } });
  }
  return out;
}

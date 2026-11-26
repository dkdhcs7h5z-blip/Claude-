/**
 * Laboratory catalogue and interpretation — pure functions.
 *
 * Reference ranges here are ADULT FEMALE DEFAULTS used only to pre-fill the form
 * (typical immunoassay ranges). Each stored result carries the reporting
 * laboratory's own range, and flags are computed from that stored range.
 *
 * Interpretation rules:
 *  - Premature ovarian insufficiency (ESHRE 2016): age < 40 with FSH > 25 IU/L on two
 *    occasions ≥ 4 weeks apart; a single raised FSH prompts a repeat.
 *  - Biochemical hyperandrogenism: testosterone above range or free androgen index
 *    (FAI = T nmol/L × 100 / SHBG nmol/L) ≥ 5 (default; lab/population dependent).
 *  - Glycaemia (ADA): HbA1c ≥ 6.5 % or FPG ≥ 7.0 mmol/L diabetes; 5.7–6.4 % or 5.6–6.9 mmol/L prediabetes.
 *  - Iron deficiency: ferritin < 30 µg/L (NICE NG88, heavy menstrual bleeding).
 */
import type { ClinicalAlert } from './obstetricRisk';

export interface LabDef { code: string; unit: string; low: number | null; high: number | null; group: 'reproductive' | 'thyroid' | 'androgen' | 'metabolic' | 'tumour' | 'haematology' | 'other' }

export const LAB_CATALOG: LabDef[] = [
  { code: 'fsh', unit: 'IU/L', low: 3.5, high: 12.5, group: 'reproductive' },
  { code: 'lh', unit: 'IU/L', low: 2.4, high: 12.6, group: 'reproductive' },
  { code: 'estradiol', unit: 'pmol/L', low: 46, high: 607, group: 'reproductive' },
  { code: 'progesterone', unit: 'nmol/L', low: null, high: null, group: 'reproductive' },
  { code: 'amh', unit: 'ng/mL', low: null, high: null, group: 'reproductive' },
  { code: 'prolactin', unit: 'mIU/L', low: 102, high: 496, group: 'reproductive' },
  { code: 'beta_hcg', unit: 'IU/L', low: null, high: null, group: 'reproductive' },
  { code: 'tsh', unit: 'mIU/L', low: 0.27, high: 4.2, group: 'thyroid' },
  { code: 'free_t4', unit: 'pmol/L', low: 12, high: 22, group: 'thyroid' },
  { code: 'testosterone', unit: 'nmol/L', low: 0.29, high: 1.67, group: 'androgen' },
  { code: 'shbg', unit: 'nmol/L', low: 26.1, high: 110, group: 'androgen' },
  { code: 'dheas', unit: 'µmol/L', low: null, high: null, group: 'androgen' },
  { code: 'oh17_progesterone', unit: 'nmol/L', low: null, high: null, group: 'androgen' },
  { code: 'hba1c', unit: '%', low: 4.0, high: 5.6, group: 'metabolic' },
  { code: 'fasting_glucose', unit: 'mmol/L', low: 3.9, high: 5.5, group: 'metabolic' },
  { code: 'vitamin_d', unit: 'nmol/L', low: 50, high: 125, group: 'metabolic' },
  { code: 'ca125', unit: 'U/mL', low: 0, high: 35, group: 'tumour' },
  { code: 'he4', unit: 'pmol/L', low: null, high: null, group: 'tumour' },
  { code: 'hemoglobin', unit: 'g/dL', low: 12, high: 15.5, group: 'haematology' },
  { code: 'ferritin', unit: 'µg/L', low: 15, high: 150, group: 'haematology' },
];
export const labDef = (code: string) => LAB_CATALOG.find((l) => l.code === code);

export type LabFlag = 'low' | 'high' | 'normal';
export function labFlag(value: number, low: number | null, high: number | null): LabFlag | null {
  if (low == null && high == null) return null;
  if (low != null && value < low) return 'low';
  if (high != null && value > high) return 'high';
  return 'normal';
}

export interface LabLike { test_code: string; value: number; collected_at: string; ref_low: number | null; ref_high: number | null }

const byDateDesc = (a: LabLike, b: LabLike) => b.collected_at.localeCompare(a.collected_at);
export function latest(labs: LabLike[], code: string): LabLike | null {
  return labs.filter((l) => l.test_code === code).sort(byDateDesc)[0] ?? null;
}
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** FAI from the latest testosterone and an SHBG within 30 days of it. */
export function freeAndrogenIndex(labs: LabLike[]): number | null {
  const t = latest(labs, 'testosterone');
  if (!t) return null;
  const s = labs.filter((l) => l.test_code === 'shbg' && days(l.collected_at, t.collected_at) <= 30).sort(byDateDesc)[0];
  if (!s || s.value <= 0) return null;
  return Math.round((t.value * 100 / s.value) * 10) / 10;
}

export function lhFshRatio(labs: LabLike[]): number | null {
  const lh = latest(labs, 'lh');
  if (!lh) return null;
  const fsh = labs.filter((l) => l.test_code === 'fsh' && l.collected_at === lh.collected_at)[0];
  return fsh && fsh.value > 0 ? Math.round((lh.value / fsh.value) * 10) / 10 : null;
}

export const FAI_THRESHOLD = 5;

export function biochemicalHyperandrogenism(labs: LabLike[]): boolean {
  const t = latest(labs, 'testosterone');
  const fai = freeAndrogenIndex(labs);
  return (!!t && t.ref_high != null && t.value > t.ref_high) || (fai != null && fai >= FAI_THRESHOLD);
}

export function labAlerts(labs: LabLike[], ageYears: number): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const high = (code: string) => { const l = latest(labs, code); return l && l.ref_high != null && l.value > l.ref_high ? l : null; };
  const low = (code: string) => { const l = latest(labs, code); return l && l.ref_low != null && l.value < l.ref_low ? l : null; };

  const fshHigh = labs.filter((l) => l.test_code === 'fsh' && l.value > 25).sort(byDateDesc);
  if (ageYears < 40 && fshHigh.length) {
    const confirmed = fshHigh.some((a) => fshHigh.some((b) => days(a.collected_at, b.collected_at) >= 28));
    out.push({ code: confirmed ? 'poi_confirmed' : 'poi_possible', severity: 'warning', values: { fsh: fshHigh[0].value } });
  }
  const prl = high('prolactin');
  if (prl) out.push({ code: 'hyperprolactinemia', severity: 'warning', values: { value: prl.value } });
  const tshH = high('tsh'), tshL = low('tsh');
  if (tshH) out.push({ code: 'tsh_high', severity: 'warning', values: { value: tshH.value } });
  else if (tshL) out.push({ code: 'tsh_low', severity: 'warning', values: { value: tshL.value } });
  if (biochemicalHyperandrogenism(labs)) {
    const fai = freeAndrogenIndex(labs);
    out.push({ code: 'hyperandrogenism_lab', severity: 'info', values: { fai: fai ?? '—' } });
  }
  const a1c = latest(labs, 'hba1c'), fpg = latest(labs, 'fasting_glucose');
  if ((a1c && a1c.value >= 6.5) || (fpg && fpg.value >= 7.0)) out.push({ code: 'diabetes_range', severity: 'warning' });
  else if ((a1c && a1c.value >= 5.7) || (fpg && fpg.value >= 5.6)) out.push({ code: 'prediabetes_range', severity: 'info' });
  const hb = latest(labs, 'hemoglobin');
  if (hb && hb.value < 12) out.push({ code: 'anemia_lab', severity: hb.value < 8 ? 'critical' : 'warning', values: { hb: hb.value } });
  const fer = latest(labs, 'ferritin');
  if (fer && fer.value < 30) out.push({ code: 'iron_deficiency', severity: 'info', values: { value: fer.value } });
  const ca = latest(labs, 'ca125');
  if (ca && ca.value > 35) out.push({ code: 'ca125_raised', severity: 'info', values: { value: ca.value } });
  return out;
}

/**
 * Fetal growth — pure functions.
 *
 * EFW: Hadlock 4 (HC, AC, FL) — Hadlock FP et al., Am J Obstet Gynecol 1985;151:333.
 *   log10(EFW g) = 1.326 − 0.00326·AC·FL + 0.0107·HC + 0.0438·AC + 0.158·FL   (cm)
 *   Mirrors SQL private.hadlock_efw().
 * Weight standard: Hadlock FP et al., Radiology 1991;181:129 — in-utero weight
 *   ln(median g) = 0.578 + 0.332·t − 0.00354·t²  (t = GA in weeks), SD = 12.7 % of median.
 *   Valid 10–40 weeks. Clinics using INTERGROWTH-21st / WHO fetal growth charts can
 *   swap `efwCentile` without touching callers.
 * Thresholds: SGA < 10th, suspected FGR < 3rd centile (Delphi consensus, Gordijn 2016),
 *   LGA > 90th; oligohydramnios DVP < 2 cm or AFI < 5 cm; polyhydramnios DVP ≥ 8 cm or
 *   AFI ≥ 25 cm; twin EFW discordance ≥ 20 % and monochorionic surveillance (NICE NG137).
 */
import type { ClinicalAlert } from './obstetricRisk';

export function hadlockEfw(hcMm?: number | null, acMm?: number | null, flMm?: number | null): number | null {
  if (hcMm == null || acMm == null || flMm == null) return null;
  const hc = hcMm / 10, ac = acMm / 10, fl = flMm / 10;
  return Math.round(10 ** (1.326 - 0.00326 * ac * fl + 0.0107 * hc + 0.0438 * ac + 0.158 * fl));
}

export const HADLOCK_SD_FRACTION = 0.127;

export function hadlockMedianWeight(gaDays: number): number {
  const t = gaDays / 7;
  return Math.exp(0.578 + 0.332 * t - 0.00354 * t * t);
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

const Z: Record<number, number> = { 3: -1.8808, 10: -1.2816, 50: 0, 90: 1.2816, 97: 1.8808 };

/** Weight (g) at a given centile of the Hadlock 1991 standard. */
export function hadlockCentileWeight(centile: 3 | 10 | 50 | 90 | 97, gaDays: number): number {
  return hadlockMedianWeight(gaDays) * (1 + Z[centile] * HADLOCK_SD_FRACTION);
}

export const GROWTH_STANDARD_RANGE: [number, number] = [70, 280]; // 10+0 – 40+0

/** EFW centile (0–100, one decimal) or null outside the standard's GA range. */
export function efwCentile(efwG: number, gaDays: number): number | null {
  if (gaDays < GROWTH_STANDARD_RANGE[0] || gaDays > GROWTH_STANDARD_RANGE[1] + 14) return null;
  const median = hadlockMedianWeight(gaDays);
  const z = (efwG - median) / (HADLOCK_SD_FRACTION * median);
  return Math.round(normalCdf(z) * 1000) / 10;
}

export interface BiometryLike {
  fetus_label: string;
  efw_g: number | null;
  ga_days: number | null;
  afi_cm: number | null;
  dvp_cm: number | null;
  ua_edf: 'present' | 'absent' | 'reversed' | null;
  placenta_location: string | null;
}

/** Alerts for one scan (all fetuses of that scan). */
export function biometryAlerts(fetuses: BiometryLike[]): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const multi = fetuses.length > 1;
  for (const f of fetuses) {
    const fetus = multi ? f.fetus_label : '';
    if (f.efw_g != null && f.ga_days != null) {
      const c = efwCentile(f.efw_g, f.ga_days);
      if (c != null && c < 3) out.push({ code: 'fgr_suspected', severity: 'critical', values: { fetus, centile: c, efw: f.efw_g } });
      else if (c != null && c < 10) out.push({ code: 'sga', severity: 'warning', values: { fetus, centile: c, efw: f.efw_g } });
      else if (c != null && c > 90) out.push({ code: 'lga', severity: 'warning', values: { fetus, centile: c, efw: f.efw_g } });
    }
    if (f.ua_edf === 'absent' || f.ua_edf === 'reversed') {
      out.push({ code: f.ua_edf === 'absent' ? 'ua_aedf' : 'ua_redf', severity: 'critical', values: { fetus } });
    }
    if ((f.dvp_cm != null && f.dvp_cm < 2) || (f.afi_cm != null && f.afi_cm < 5)) {
      out.push({ code: 'oligohydramnios', severity: 'warning', values: { fetus } });
    } else if ((f.dvp_cm != null && f.dvp_cm >= 8) || (f.afi_cm != null && f.afi_cm >= 25)) {
      out.push({ code: 'polyhydramnios', severity: 'warning', values: { fetus } });
    }
    if (f.placenta_location === 'previa') out.push({ code: 'low_placenta_previa', severity: 'warning', values: { fetus } });
    else if (f.placenta_location === 'low_lying') out.push({ code: 'low_placenta', severity: 'info', values: { fetus } });
  }
  const efws = fetuses.map((f) => f.efw_g).filter((x): x is number => x != null);
  if (efws.length >= 2) {
    const max = Math.max(...efws), min = Math.min(...efws);
    const pct = Math.round(((max - min) / max) * 100);
    if (pct >= 20) out.push({ code: 'twin_discordance', severity: 'warning', values: { pct } });
  }
  return out;
}

export function chorionicityAlerts(plurality: number, chorionicity: string | null | undefined): ClinicalAlert[] {
  if (plurality < 2) return [];
  if (!chorionicity) return [{ code: 'chorionicity_unknown', severity: 'warning' }];
  if (chorionicity.startsWith('mc')) return [{ code: 'monochorionic', severity: 'info' }];
  return [];
}

/**
 * Obstetric date calculations.
 * All dates are handled as calendar dates (YYYY-MM-DD) in UTC to avoid DST
 * and timezone off-by-one errors.
 */
const DAY = 86_400_000;
export const TERM_DAYS = 280;

function toUtcDate(d: string | Date): number {
  if (typeof d === 'string') {
    const [y, m, day] = d.slice(0, 10).split('-').map(Number);
    return Date.UTC(y, m - 1, day);
  }
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Naegele's rule: EDD = LMP + 280 days (for a 28-day cycle; adjust by cycle length − 28). */
export function eddFromLmp(lmp: string, cycleLengthDays = 28): string {
  return toIso(toUtcDate(lmp) + (TERM_DAYS + (cycleLengthDays - 28)) * DAY);
}

/** LMP-equivalent date from an EDD. */
export function lmpFromEdd(edd: string): string {
  return toIso(toUtcDate(edd) - TERM_DAYS * DAY);
}

/**
 * EDD after embryo transfer: transfer date + (266 − embryo age in days).
 * Day-5 blastocyst → +261 days; day-3 embryo → +263 days.
 */
export function eddFromTransfer(transferDate: string, embryoAgeDays: 3 | 5 | 6 = 5): string {
  return toIso(toUtcDate(transferDate) + (266 - embryoAgeDays) * DAY);
}

export interface GestationalAge {
  totalDays: number;
  weeks: number;
  days: number;
  trimester: 1 | 2 | 3;
}

export function gestationalAge(opts: { lmp?: string | null; edd?: string | null }, on: string | Date = new Date()): GestationalAge | null {
  const refLmp = opts.edd ? lmpFromEdd(opts.edd) : opts.lmp;
  if (!refLmp) return null;
  const totalDays = Math.floor((toUtcDate(on) - toUtcDate(refLmp)) / DAY);
  if (totalDays < 0 || totalDays > 315) return null;
  const weeks = Math.floor(totalDays / 7);
  return {
    totalDays,
    weeks,
    days: totalDays % 7,
    trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3,
  };
}

export function formatGA(ga: GestationalAge | null): string {
  return ga ? `${ga.weeks}+${ga.days}` : '—';
}

/** Obstetric formula: G (gravida) P (para) A (abortus) L (living). */
export function gpal(p: { gravida: number | null; para: number | null; abortus: number | null; living: number | null }): string {
  const v = (n: number | null) => (n ?? '–').toString();
  return `G${v(p.gravida)} P${v(p.para)} A${v(p.abortus)} L${v(p.living)}`;
}

export function ageInYears(dob: string, on: string | Date = new Date()): number {
  const ref = typeof on === 'string' ? new Date(on) : on;
  const [y, m, d] = dob.split('-').map(Number);
  let age = ref.getFullYear() - y;
  if (ref.getMonth() + 1 < m || (ref.getMonth() + 1 === m && ref.getDate() < d)) age--;
  return age;
}

/** EDD from an ultrasound: scan date + (280 − GA at scan). */
export function eddFromUltrasound(scanDate: string, gaDaysAtScan: number): string {
  return toIso(toUtcDate(scanDate) + (TERM_DAYS - gaDaysAtScan) * DAY);
}

/** Days between two ISO dates (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((toUtcDate(b) - toUtcDate(a)) / DAY);
}

export function addDays(date: string, days: number): string {
  return toIso(toUtcDate(date) + days * DAY);
}

export function todayIso(): string {
  return toIso(toUtcDate(new Date()));
}

/**
 * Redating thresholds — ACOG Committee Opinion 700 (Methods for Estimating the
 * Due Date). If LMP- and ultrasound-derived GA differ by MORE than the threshold
 * for the GA at the scan, the pregnancy is redated by ultrasound.
 */
export function redatingThresholdDays(usGaDays: number): number {
  if (usGaDays <= 62) return 5;    // ≤ 8+6
  if (usGaDays <= 111) return 7;   // 9+0 – 15+6
  if (usGaDays <= 153) return 10;  // 16+0 – 21+6
  if (usGaDays <= 195) return 14;  // 22+0 – 27+6
  return 21;                       // ≥ 28+0
}

export interface DatingReconciliation {
  lmpEdd: string;
  usEdd: string;
  differenceDays: number;
  thresholdDays: number;
  useUltrasound: boolean;
  finalEdd: string;
}

export function reconcileDating(input: {
  lmp: string; cycleLengthDays?: number; usDate: string; usGaDays: number;
}): DatingReconciliation {
  const cycle = input.cycleLengthDays ?? 28;
  const lmpEdd = eddFromLmp(input.lmp, cycle);
  const usEdd = eddFromUltrasound(input.usDate, input.usGaDays);
  const differenceDays = Math.abs(daysBetween(lmpEdd, usEdd));
  const thresholdDays = redatingThresholdDays(input.usGaDays);
  const useUltrasound = differenceDays > thresholdDays;
  return { lmpEdd, usEdd, differenceDays, thresholdDays, useUltrasound, finalEdd: useUltrasound ? usEdd : lmpEdd };
}

export type DatingMethod = 'lmp' | 'ultrasound' | 'ivf_transfer';

export interface DatingInput {
  method: DatingMethod;
  lmp?: string | null;
  cycleLengthDays?: number;
  usDate?: string | null;
  usGaDays?: number | null;
  transferDate?: string | null;
  embryoAgeDays?: 3 | 5 | 6 | null;
}

/** Final EDD and its basis from the chosen dating method. Returns null when inputs are incomplete. */
export function computeEdd(d: DatingInput): { edd: string; basis: DatingMethod; reconciliation?: DatingReconciliation } | null {
  if (d.method === 'ivf_transfer') {
    return d.transferDate && d.embryoAgeDays ? { edd: eddFromTransfer(d.transferDate, d.embryoAgeDays), basis: 'ivf_transfer' } : null;
  }
  if (d.method === 'ultrasound') {
    if (!d.usDate || d.usGaDays == null) return null;
    if (d.lmp) {
      const r = reconcileDating({ lmp: d.lmp, cycleLengthDays: d.cycleLengthDays, usDate: d.usDate, usGaDays: d.usGaDays });
      return { edd: r.finalEdd, basis: r.useUltrasound ? 'ultrasound' : 'lmp', reconciliation: r };
    }
    return { edd: eddFromUltrasound(d.usDate, d.usGaDays), basis: 'ultrasound' };
  }
  return d.lmp ? { edd: eddFromLmp(d.lmp, d.cycleLengthDays ?? 28), basis: 'lmp' } : null;
}

export function bmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null;
  return Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
}

export function formatGADays(days: number | null | undefined): string {
  return days == null ? '—' : `${Math.floor(days / 7)}+${days % 7}`;
}

/**
 * GA (days) of a pregnancy on a date — mirrors SQL private.pregnancy_ga_days():
 * EDD-based when an EDD exists, otherwise LMP adjusted for cycle length.
 */
export function gaDaysOn(
  p: { edd?: string | null; lmp?: string | null; cycle_length_days?: number | null },
  on: string = todayIso(),
): number | null {
  if (p.edd) return TERM_DAYS - daysBetween(on, p.edd);
  if (p.lmp) return daysBetween(p.lmp, on) - ((p.cycle_length_days ?? 28) - 28);
  return null;
}

export function trimesterOf(gaDays: number): 1 | 2 | 3 {
  const w = gaDays / 7;
  return w < 14 ? 1 : w < 28 ? 2 : 3;
}

/** EDD for display: stored EDD, else derived from LMP. */
export function effectiveEdd(p: { edd?: string | null; lmp?: string | null; cycle_length_days?: number | null }): string | null {
  return p.edd ?? (p.lmp ? eddFromLmp(p.lmp, p.cycle_length_days ?? 28) : null);
}

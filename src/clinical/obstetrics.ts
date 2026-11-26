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

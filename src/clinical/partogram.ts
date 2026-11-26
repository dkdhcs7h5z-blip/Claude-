/**
 * Partogram logic — pure functions.
 *
 * Reference lines follow the classic WHO partograph: the active phase starts at the
 * first cervical dilation ≥ 4 cm; the ALERT line rises 1 cm/hour from that point and
 * the ACTION line runs 4 hours to its right. (The 2020 WHO Labour Care Guide uses
 * 5 cm and per-centimetre time limits; ACTIVE_PHASE_CM / ACTION_LINE_OFFSET_H are the
 * only values to change if a clinic adopts it.)
 * Other alerts: FHR < 110 or > 160; thick meconium; tachysystole > 5 contractions per
 * 10 minutes; maternal temperature ≥ 38 °C; BP ≥ 140/90 (≥ 160/110 severe).
 */
import type { ClinicalAlert } from './obstetricRisk';

export const ACTIVE_PHASE_CM = 4;
export const ACTION_LINE_OFFSET_H = 4;

export interface LabourObs {
  observed_at: string;
  cervical_dilation_cm: number | null;
  descent_fifths: number | null;
  contractions_per_10min: number | null;
  fhr: number | null;
  liquor: string | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  entered_in_error?: boolean;
}

const HOUR = 3_600_000;
export const hoursBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / HOUR;

export function validObservations<T extends LabourObs>(obs: T[]): T[] {
  return obs.filter((o) => !o.entered_in_error).sort((a, b) => a.observed_at.localeCompare(b.observed_at));
}

export interface ActivePhase { start: string; startDilation: number }

export function activePhase(obs: LabourObs[]): ActivePhase | null {
  const first = validObservations(obs).find((o) => (o.cervical_dilation_cm ?? 0) >= ACTIVE_PHASE_CM);
  return first ? { start: first.observed_at, startDilation: first.cervical_dilation_cm! } : null;
}

/** Expected dilation on the alert line at time t (hours since active phase start). */
export const alertLineAt = (phase: ActivePhase, hours: number) => Math.min(10, phase.startDilation + hours);
export const actionLineAt = (phase: ActivePhase, hours: number) =>
  hours < ACTION_LINE_OFFSET_H ? null : Math.min(10, phase.startDilation + hours - ACTION_LINE_OFFSET_H);

export type ProgressStatus = 'not_active' | 'normal' | 'alert' | 'action' | 'fully_dilated';

export function progressStatus(obs: LabourObs[]): ProgressStatus {
  const phase = activePhase(obs);
  if (!phase) return 'not_active';
  const withDil = validObservations(obs).filter((o) => o.cervical_dilation_cm != null);
  const last = withDil[withDil.length - 1];
  if (last.cervical_dilation_cm! >= 10) return 'fully_dilated';
  const h = hoursBetween(phase.start, last.observed_at);
  const action = actionLineAt(phase, h);
  if (action != null && last.cervical_dilation_cm! <= action) return 'action';
  if (last.cervical_dilation_cm! < alertLineAt(phase, h)) return 'alert';
  return 'normal';
}

export function labourAlerts(obs: LabourObs[]): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const valid = validObservations(obs);
  const status = progressStatus(valid);
  if (status === 'action') out.push({ code: 'partogram_action', severity: 'critical' });
  else if (status === 'alert') out.push({ code: 'partogram_alert', severity: 'warning' });
  const latest = <K extends keyof LabourObs>(k: K) => [...valid].reverse().find((o) => o[k] != null)?.[k] ?? null;
  const fhr = latest('fhr') as number | null;
  if (fhr != null && (fhr < 110 || fhr > 160)) out.push({ code: 'fhr_abnormal', severity: 'critical', values: { fhr } });
  const liquor = latest('liquor');
  if (liquor === 'meconium_thick') out.push({ code: 'thick_meconium', severity: 'warning' });
  const ctx = latest('contractions_per_10min') as number | null;
  if (ctx != null && ctx > 5) out.push({ code: 'tachysystole', severity: 'warning', values: { n: ctx } });
  const temp = latest('temperature_c') as number | null;
  if (temp != null && temp >= 38) out.push({ code: 'intrapartum_fever', severity: 'warning', values: { temp } });
  const bpObs = [...valid].reverse().find((o) => o.bp_systolic != null);
  if (bpObs) {
    const bp = `${bpObs.bp_systolic}/${bpObs.bp_diastolic}`;
    if (bpObs.bp_systolic! >= 160 || bpObs.bp_diastolic! >= 110) out.push({ code: 'severe_hypertension', severity: 'critical', values: { bp } });
    else if (bpObs.bp_systolic! >= 140 || bpObs.bp_diastolic! >= 90) out.push({ code: 'hypertension', severity: 'warning', values: { bp } });
  }
  return out;
}

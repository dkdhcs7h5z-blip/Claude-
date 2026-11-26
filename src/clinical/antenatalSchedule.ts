/**
 * Default antenatal care schedule (gestational-age windows, in days).
 * Based on common NICE / ACOG / WHO recommendations; clinics should adapt the
 * table to local protocol. Items with `when` only apply if the condition holds.
 */
export type ScheduleCode =
  | 'booking' | 'dating_nt_scan' | 'aspirin_start' | 'early_ogtt' | 'anomaly_scan' | 'ogtt' | 'anti_d'
  | 'tdap' | 'presentation_check' | 'gbs_screen' | 'term_review' | 'post_dates_review';

export interface ScheduleContext {
  rhNegative: boolean;
  aspirinRecommended: boolean;
  ogttIndicated: boolean;
  earlyOgtt: boolean;
}

interface ScheduleDef {
  code: ScheduleCode;
  start: number;
  end: number;
  when?: (c: ScheduleContext) => boolean;
}

const w = (weeks: number, days = 0) => weeks * 7 + days;

export const SCHEDULE: ScheduleDef[] = [
  { code: 'booking', start: 0, end: w(10) },
  { code: 'early_ogtt', start: 0, end: w(14), when: (c) => c.earlyOgtt },
  { code: 'dating_nt_scan', start: w(11), end: w(13, 6) },
  { code: 'aspirin_start', start: w(12), end: w(16), when: (c) => c.aspirinRecommended },
  { code: 'anomaly_scan', start: w(18), end: w(22) },
  { code: 'ogtt', start: w(24), end: w(28), when: (c) => c.ogttIndicated },
  { code: 'tdap', start: w(27), end: w(36) },
  { code: 'anti_d', start: w(28), end: w(28, 6), when: (c) => c.rhNegative },
  { code: 'presentation_check', start: w(36), end: w(36, 6) },
  { code: 'gbs_screen', start: w(36), end: w(37, 6) },
  { code: 'term_review', start: w(40), end: w(40, 6) },
  { code: 'post_dates_review', start: w(41), end: w(41, 6) },
];

export type ScheduleStatus = 'done' | 'due' | 'upcoming' | 'passed';

export interface ScheduleItem {
  code: ScheduleCode;
  start: number;
  end: number;
  status: ScheduleStatus;
}

/** `completed` lists items known to be done (e.g. a recorded anomaly scan). */
export function buildSchedule(gaDays: number | null, ctx: ScheduleContext, completed: ScheduleCode[] = []): ScheduleItem[] {
  const done = new Set(completed);
  return SCHEDULE.filter((s) => !s.when || s.when(ctx)).map((s) => ({
    code: s.code,
    start: s.start,
    end: s.end,
    status: done.has(s.code) ? 'done'
      : gaDays == null ? 'upcoming'
      : gaDays < s.start ? 'upcoming'
      : gaDays <= s.end ? 'due'
      : 'passed',
  }));
}

/** Map recorded fetal assessments to schedule items they fulfil. */
export function completedFromAssessments(types: string[]): ScheduleCode[] {
  const out: ScheduleCode[] = [];
  if (types.some((t) => t === 'nt_scan' || t === 'dating_scan')) out.push('dating_nt_scan');
  if (types.includes('anomaly_scan')) out.push('anomaly_scan');
  return out;
}

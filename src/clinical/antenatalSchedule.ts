/**
 * Default antenatal care schedule (gestational-age windows, in days).
 * Based on common NICE / ACOG / WHO recommendations; clinics should adapt the
 * table to local protocol. Items with `when` only apply if the condition holds.
 */
export type ScheduleCode =
  | 'booking' | 'labs_t1' | 'dating_nt_scan' | 'aspirin_start' | 'early_ogtt' | 'cervical_length' | 'anomaly_scan' | 'fetal_echo'
  | 'ogtt' | 'cbc_t2' | 'anti_d' | 'tdap' | 'growth_doppler' | 'labs_t3' | 'presentation_check' | 'gbs_screen'
  | 'term_review' | 'post_dates_review';

export interface ScheduleContext {
  rhNegative: boolean;
  aspirinRecommended: boolean;
  ogttIndicated: boolean;
  earlyOgtt: boolean;
  /** pre-existing/gestational diabetes, prior or suspected anomaly, monochorionic twins */
  fetalEchoIndicated?: boolean;
  /** high-risk pregnancy → serial growth & Doppler 28–38 w */
  highRisk?: boolean;
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
  { code: 'labs_t1', start: 0, end: w(13, 6) },
  { code: 'early_ogtt', start: 0, end: w(14), when: (c) => c.earlyOgtt },
  { code: 'dating_nt_scan', start: w(11), end: w(13, 6) },
  { code: 'aspirin_start', start: w(12), end: w(16), when: (c) => c.aspirinRecommended },
  { code: 'cervical_length', start: w(16), end: w(24) },
  { code: 'anomaly_scan', start: w(18), end: w(22) },
  { code: 'fetal_echo', start: w(20), end: w(24), when: (c) => !!c.fetalEchoIndicated },
  { code: 'ogtt', start: w(24), end: w(28), when: (c) => c.ogttIndicated },
  { code: 'cbc_t2', start: w(24), end: w(28) },
  { code: 'tdap', start: w(27), end: w(36) },
  { code: 'anti_d', start: w(28), end: w(28, 6), when: (c) => c.rhNegative },
  { code: 'growth_doppler', start: w(28), end: w(38), when: (c) => !!c.highRisk },
  { code: 'labs_t3', start: w(34), end: w(37) },
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
  if (types.includes('fetal_echo')) out.push('fetal_echo');
  return out;
}

import type { FetalAssessment, FetalBiometry, FetalMedicineDetail, FmDoppler, Patient } from '@/data/types';
import { ageInYears, gaDaysOn, todayIso } from '@/clinical/obstetrics';
import { efwCentile } from '@/clinical/fetalGrowth';
import {
  ageRiskT21, anomalyAlerts, assessFgr, cfdnaAlerts, dopplerAlerts, fgrAlert, firstTrimesterAlerts, procedureAlerts, quinteroStage,
  type FgrResult,
} from '@/clinical/fetalMedicine';
import { sortAlerts, type ClinicalAlert } from '@/clinical/obstetricRisk';

export interface ScanGroup<T> { scan: FetalAssessment; rows: T[] }

/** Per-fetus records grouped by their scan header, newest first. */
export function groupByScan<T extends { fetal_assessment_id: string; fetus_label: string }>(rows: T[], scans: FetalAssessment[]): ScanGroup<T>[] {
  const byId = new Map(scans.map((s) => [s.id, s]));
  const groups = new Map<string, ScanGroup<T>>();
  for (const r of rows) {
    const scan = byId.get(r.fetal_assessment_id);
    if (!scan) continue;
    const g = groups.get(scan.id) ?? { scan, rows: [] };
    g.rows.push(r);
    groups.set(scan.id, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, rows: g.rows.sort((a, b) => a.fetus_label.localeCompare(b.fetus_label)) }))
    .sort((a, b) => b.scan.performed_at.localeCompare(a.scan.performed_at));
}

export interface EfwPoint { centile: number; efw: number; ga: number; date: string }

/** Latest EFW centile for a fetus within 3 weeks before `gaDays`, plus an earlier one (≥ 2 weeks before) for crossing centiles. */
export function efwForFetus(biometry: FetalBiometry[], scans: FetalAssessment[], label: string, gaDays: number): { current: EfwPoint | null; previous: EfwPoint | null } {
  const pts = biometry
    .filter((b) => b.fetus_label === label && b.efw_g != null && b.ga_days != null && b.ga_days <= gaDays)
    .map((b) => ({ centile: efwCentile(b.efw_g!, b.ga_days!), efw: b.efw_g!, ga: b.ga_days!, date: scans.find((s) => s.id === b.fetal_assessment_id)?.performed_at ?? '' }))
    .filter((p): p is EfwPoint => p.centile != null)
    .sort((a, b) => b.ga - a.ga);
  const current = pts.find((p) => gaDays - p.ga <= 21) ?? null;
  const previous = current ? pts.find((p) => current.ga - p.ga >= 14) ?? null : null;
  return { current, previous };
}

export interface FetusGrowth { label: string; doppler: FmDoppler; efw: EfwPoint | null; result: FgrResult }

export function deriveFm(patient: Pick<Patient, 'date_of_birth' | 'rh_factor'>, d: FetalMedicineDetail, today = todayIso()) {
  const g = d.pregnancy;
  const ga = gaDaysOn(g, today);
  const age = ageInYears(patient.date_of_birth);
  const ft = groupByScan(d.firstTrimester, d.scans);
  const an = groupByScan(d.anomaly, d.scans);
  const dp = groupByScan(d.doppler, d.scans);
  const cf = d.cfdna.at(-1) ?? null;
  const sensitised = g.risk_factors.includes('rh_alloimmunization');

  const growth: FetusGrowth[] = (dp[0]?.rows ?? []).map((row) => {
    const { current, previous } = efwForFetus(d.biometry, d.scans, row.fetus_label, row.ga_days ?? ga ?? 0);
    const result = assessFgr({
      gaDays: row.ga_days ?? ga ?? 0, efwCentile: current?.centile ?? null, previousEfwCentile: previous?.centile ?? null,
      uaEdf: row.ua_edf, uaPiCentile: row.ua_pi_centile, cpr: row.cpr, cprCentile: row.cpr_centile, utaPiCentile: row.uta_pi_centile,
      dvPiCentile: row.dv_pi_centile, dvAWave: row.dv_a_wave, ctg: row.ctg,
    });
    return { label: row.fetus_label, doppler: row, efw: current, result };
  });
  const ttts = dp[0] ? quinteroStage(dp[0].rows, g.chorionicity) : null;

  const multi = g.plurality > 1;
  const alerts: ClinicalAlert[] = [
    ...(ft[0] ? firstTrimesterAlerts(ft[0].rows) : []),
    ...cfdnaAlerts(cf, today),
    ...(an[0] ? anomalyAlerts(an[0].rows) : []),
    ...(dp[0] ? dopplerAlerts(dp[0].rows) : []),
    ...growth.flatMap((x) => { const a = fgrAlert(x.result, multi ? x.label : ''); return a ? [a] : []; }),
    ...(ttts ? [{ code: 'ttts', severity: 'critical', values: { stage: ttts.stage, donor: ttts.donor, recipient: ttts.recipient } } as ClinicalAlert] : []),
    ...procedureAlerts(d.procedures, { rhNegative: patient.rh_factor === 'negative', sensitised, today }),
  ];

  return { ga, age, ageRisk: ageRiskT21(age), ft, an, dp, cf, growth, ttts, sensitised, alerts: sortAlerts(alerts) };
}
export type DerivedFm = ReturnType<typeof deriveFm>;

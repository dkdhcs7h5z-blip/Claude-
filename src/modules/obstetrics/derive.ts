import type { AntenatalVisit, FetalAssessment, FetalBiometry, Patient, Pregnancy } from '@/data/types';
import { ageInYears, bmi as calcBmi, effectiveEdd, gaDaysOn } from '@/clinical/obstetrics';
import {
  assessGdm, assessPreeclampsia, pregnancyAlerts, sortAlerts, visitAlerts, type ClinicalAlert,
} from '@/clinical/obstetricRisk';
import { biometryAlerts, chorionicityAlerts } from '@/clinical/fetalGrowth';
import { alertCodes, classifyRisk, detectOngoingFactors } from '@/clinical/highRisk';
import { buildSchedule, completedFromAssessments } from '@/clinical/antenatalSchedule';

/** Biometry rows of the most recent scan that has any. */
export function latestScanBiometry(biometry: FetalBiometry[], scans: Pick<FetalAssessment, 'id' | 'performed_at'>[]): FetalBiometry[] {
  const withBio = scans.filter((s) => biometry.some((b) => b.fetal_assessment_id === s.id))
    .sort((a, b) => a.performed_at.localeCompare(b.performed_at));
  const last = withBio[withBio.length - 1];
  return last ? biometry.filter((b) => b.fetal_assessment_id === last.id) : [];
}

/** Everything the obstetric UI derives from a pregnancy and its records. */
export function deriveObstetric(
  pregnancy: Pregnancy,
  patient: Pick<Patient, 'date_of_birth' | 'rh_factor'>,
  visits: AntenatalVisit[],
  fetal: Pick<FetalAssessment, 'id' | 'assessment_type' | 'performed_at'>[] = [],
  biometry: FetalBiometry[] = [],
) {
  const ga = pregnancy.status === 'active' ? gaDaysOn(pregnancy) : null;
  const edd = effectiveEdd(pregnancy);
  const bmi = calcBmi(pregnancy.booking_weight_kg, pregnancy.height_cm);
  const ageYears = ageInYears(patient.date_of_birth);
  const ctx = { riskFactors: pregnancy.risk_factors, para: pregnancy.para, ageYears, plurality: pregnancy.plurality, bmi };
  const pe = assessPreeclampsia(ctx);
  const gdm = assessGdm(ctx);

  const sorted = [...visits].sort((a, b) => a.visit_date.localeCompare(b.visit_date));
  const latest = sorted.at(-1);
  const scanBio = latestScanBiometry(biometry, fetal);
  const scanAlerts = biometryAlerts(scanBio);

  // ongoing factors evidenced by records (visits ≥ 20 w, latest scan)
  const visitCodes = sorted.filter((v) => (v.ga_days ?? 0) >= 140)
    .flatMap((v) => alertCodes(visitAlerts(v, v.ga_days, pregnancy.plurality)));
  const detected = detectOngoingFactors({ riskFactors: pregnancy.risk_factors, visitAlertCodes: visitCodes, scanAlertCodes: alertCodes(scanAlerts) });
  const suggestion = classifyRisk({ riskFactors: pregnancy.risk_factors, plurality: pregnancy.plurality, aspirinRecommended: pe.aspirinRecommended, detected });

  const rf = new Set(pregnancy.risk_factors);
  const schedule = buildSchedule(ga, {
    rhNegative: patient.rh_factor === 'negative',
    aspirinRecommended: pe.aspirinRecommended,
    ogttIndicated: gdm.ogttIndicated,
    earlyOgtt: gdm.earlyTesting,
    fetalEchoIndicated: rf.has('diabetes_preexisting') || rf.has('current_gdm') || rf.has('previous_fetal_anomaly')
      || rf.has('suspected_fetal_anomaly') || (pregnancy.chorionicity ?? '').startsWith('mc') || ['ivf', 'icsi'].includes(pregnancy.conception ?? ''),
    highRisk: pregnancy.risk_level === 'high' || suggestion.level === 'high',
  }, completedFromAssessments(fetal.map((f) => f.assessment_type)));

  const alerts: ClinicalAlert[] = sortAlerts([
    ...pregnancyAlerts(pregnancy, ga, patient.rh_factor),
    ...chorionicityAlerts(pregnancy.plurality, pregnancy.chorionicity),
    ...(latest ? visitAlerts(latest, latest.ga_days, pregnancy.plurality) : []),
    ...scanAlerts,
  ]);
  return { ga, edd, bmi, ageYears, pe, gdm, schedule, alerts, latest, detected, suggestion };
}

import type { AntenatalVisit, Patient, Pregnancy, FetalAssessment } from '@/data/types';
import { ageInYears, bmi as calcBmi, effectiveEdd, gaDaysOn } from '@/clinical/obstetrics';
import {
  assessGdm, assessPreeclampsia, pregnancyAlerts, sortAlerts, visitAlerts, type ClinicalAlert,
} from '@/clinical/obstetricRisk';
import { buildSchedule, completedFromAssessments } from '@/clinical/antenatalSchedule';

/** Everything the obstetric UI derives from a pregnancy + its visits. */
export function deriveObstetric(
  pregnancy: Pregnancy,
  patient: Pick<Patient, 'date_of_birth' | 'rh_factor'>,
  visits: AntenatalVisit[],
  fetal: Pick<FetalAssessment, 'assessment_type'>[] = [],
) {
  const ga = pregnancy.status === 'active' ? gaDaysOn(pregnancy) : null;
  const edd = effectiveEdd(pregnancy);
  const bmi = calcBmi(pregnancy.booking_weight_kg, pregnancy.height_cm);
  const ageYears = ageInYears(patient.date_of_birth);
  const ctx = { riskFactors: pregnancy.risk_factors, para: pregnancy.para, ageYears, plurality: pregnancy.plurality, bmi };
  const pe = assessPreeclampsia(ctx);
  const gdm = assessGdm(ctx);
  const schedule = buildSchedule(ga, {
    rhNegative: patient.rh_factor === 'negative',
    aspirinRecommended: pe.aspirinRecommended,
    ogttIndicated: gdm.ogttIndicated,
    earlyOgtt: gdm.earlyTesting,
  }, completedFromAssessments(fetal.map((f) => f.assessment_type)));
  const latest = [...visits].sort((a, b) => a.visit_date.localeCompare(b.visit_date)).at(-1);
  const alerts: ClinicalAlert[] = sortAlerts([
    ...pregnancyAlerts(pregnancy, ga, patient.rh_factor),
    ...(latest ? visitAlerts(latest, latest.ga_days, pregnancy.plurality) : []),
  ]);
  return { ga, edd, bmi, ageYears, pe, gdm, schedule, alerts, latest };
}

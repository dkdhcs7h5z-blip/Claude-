import type { GynDetail, Patient } from '@/data/types';
import { ageInYears } from '@/clinical/obstetrics';
import { gynAlerts, iotaSimpleRules, rotterdam, screeningStatus } from '@/clinical/gynecology';
import { sortAlerts } from '@/clinical/obstetricRisk';
import { biochemicalHyperandrogenism, freeAndrogenIndex, labAlerts, latest, lhFshRatio } from '@/clinical/labs';
import { questionnaireAlerts } from '@/clinical/questionnaires';
import { ovarianAlerts, rmi, roma } from '@/clinical/ovarian';

export function deriveGyn(patient: Pick<Patient, 'date_of_birth'>, d: GynDetail) {
  const age = ageInYears(patient.date_of_birth);
  const profile = d.profile;
  const latestVisit = d.visits.at(-1) ?? null;
  const latestUs = d.ultrasounds.at(-1) ?? null;
  const iota = latestUs?.adnexal_mass ? iotaSimpleRules(latestUs.iota_b_features, latestUs.iota_m_features) : null;
  const pcos = rotterdam({
    cycleRegularity: profile?.cycle_regularity, cycleLengthDays: profile?.cycle_length_days,
    clinicalHyperandrogenism: d.visits.some((v) => v.clinical_hyperandrogenism),
    biochemicalHyperandrogenism: d.visits.some((v) => v.biochemical_hyperandrogenism) || biochemicalHyperandrogenism(d.labs),
    follicleCounts: [latestUs?.right_follicle_count, latestUs?.left_follicle_count],
    ovaryVolumesMl: [latestUs?.right_ovary_volume_ml, latestUs?.left_ovary_volume_ml],
  });
  const lastScreening = d.screenings.at(-1) ?? null;
  const screening = screeningStatus({
    ageYears: age, hysterectomy: profile?.hysterectomy, lastSampleDate: lastScreening?.sample_date, lastStatus: lastScreening?.status,
    nextDue: lastScreening?.next_due_date, recommendation: lastScreening?.recommendation,
    colposcopyAfterSample: !!lastScreening && d.colposcopies.some((c) => c.performed_at >= lastScreening.sample_date),
  });
  const pendingHistology = d.procedures.filter((p) => p.histology_status === 'pending').length
    + d.colposcopies.filter((c) => c.histology === 'pending').length;
  const premenopausal = !profile?.menopause_status || ['premenopausal', 'perimenopausal'].includes(profile.menopause_status);
  const postmenopausal = !premenopausal;
  const ca125 = latest(d.labs, 'ca125')?.value ?? null;
  const he4 = latest(d.labs, 'he4')?.value ?? null;
  const massUs = [...d.ultrasounds].reverse().find((u) => u.adnexal_mass) ?? null;
  const rmiResult = massUs ? rmi(massUs.rmi_features, postmenopausal, ca125) : null;
  const romaResult = massUs ? roma(he4, ca125, postmenopausal) : null;
  const latestMrs = d.menopause_assessments.at(-1) ?? null;
  const latestIciq = d.urogyn_assessments.at(-1) ?? null;
  const fai = freeAndrogenIndex(d.labs);
  const lhFsh = lhFshRatio(d.labs);
  const alerts = sortAlerts(gynAlerts({
    ageYears: age,
    menopauseStatus: profile?.menopause_status,
    complaints: latestVisit?.complaints ?? [],
    endometrialThicknessMm: latestUs?.endometrial_thickness_mm,
    iota,
    rotterdam: premenopausal && pcos.met > 0 ? pcos : null,
    popStage: latestVisit?.pop_stage,
    painScore: latestVisit?.pain_score,
    bp: latestVisit ? { systolic: latestVisit.bp_systolic, diastolic: latestVisit.bp_diastolic } : null,
    screening,
    pendingHistology,
  }).concat(
    labAlerts(d.labs, age),
    questionnaireAlerts(latestMrs?.items ?? null, latestIciq),
    ovarianAlerts({ orads: massUs?.orads_category, rmiValue: rmiResult?.value, roma: romaResult }),
  ));
  return {
    age, profile, latestVisit, latestUs, iota, pcos, premenopausal, postmenopausal, lastScreening, screening, pendingHistology, alerts,
    ca125, he4, massUs, rmiResult, romaResult, latestMrs, latestIciq, fai, lhFsh,
  };
}

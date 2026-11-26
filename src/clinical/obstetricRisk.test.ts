import { describe, expect, it } from 'vitest';
import { assessGdm, assessPreeclampsia, pregnancyAlerts, sortAlerts, visitAlerts } from './obstetricRisk';
import { buildSchedule, completedFromAssessments } from './antenatalSchedule';
import { bmi, computeEdd, eddFromUltrasound, reconcileDating, redatingThresholdDays } from './obstetrics';

const base = { riskFactors: [] as string[], para: 1, ageYears: 30, plurality: 1, bmi: 24 };
const visit = {
  bp_systolic: null, bp_diastolic: null, urine_protein: null, urine_glucose: null, fetal_movements: null,
  fetal_heart_rate: null, fundal_height_cm: null, hemoglobin_g_dl: null, presentation: null, edema: null,
} as const;
const codes = (a: { code: string }[]) => a.map((x) => x.code);

describe('pre-eclampsia aspirin criteria (NICE NG133)', () => {
  it('recommends aspirin for one high-risk factor', () => {
    const r = assessPreeclampsia({ ...base, riskFactors: ['chronic_hypertension'] });
    expect(r.high).toEqual(['chronic_hypertension']);
    expect(r.aspirinRecommended).toBe(true);
  });
  it('needs two moderate factors', () => {
    expect(assessPreeclampsia({ ...base, para: 0 }).aspirinRecommended).toBe(false);
    const r = assessPreeclampsia({ ...base, para: 0, ageYears: 41 });
    expect(r.moderate).toEqual(['nulliparity', 'age_40_plus']);
    expect(r.aspirinRecommended).toBe(true);
  });
  it('derives BMI and multiple pregnancy', () => {
    expect(assessPreeclampsia({ ...base, bmi: 36, plurality: 2 }).moderate).toEqual(['bmi_35_plus', 'multiple_pregnancy']);
  });
  it('no factors → no aspirin', () => {
    expect(assessPreeclampsia(base)).toEqual({ high: [], moderate: [], aspirinRecommended: false });
  });
});

describe('GDM screening (NICE NG3)', () => {
  it('flags BMI > 30 and history', () => {
    const r = assessGdm({ riskFactors: ['previous_gdm'], bmi: 31 });
    expect(r.reasons).toEqual(['bmi_over_30', 'previous_gdm']);
    expect(r.ogttIndicated && r.earlyTesting).toBe(true);
  });
  it('BMI exactly 30 is not a risk factor', () => {
    expect(assessGdm({ riskFactors: [], bmi: 30 }).ogttIndicated).toBe(false);
  });
  it('does not screen known diabetes', () => {
    const r = assessGdm({ riskFactors: ['diabetes_preexisting', 'family_history_diabetes'], bmi: 33 });
    expect(r.ogttIndicated).toBe(false);
    expect(r.preexistingDiabetes).toBe(true);
  });
});

describe('visit alerts', () => {
  it('severe hypertension', () => {
    expect(codes(visitAlerts({ ...visit, bp_systolic: 162, bp_diastolic: 100 }, 200))).toEqual(['severe_hypertension']);
  });
  it('suspected pre-eclampsia ≥ 20 weeks with proteinuria', () => {
    expect(codes(visitAlerts({ ...visit, bp_systolic: 145, bp_diastolic: 92, urine_protein: '1+' }, 30 * 7)))
      .toEqual(['suspected_preeclampsia']);
  });
  it('hypertension without proteinuria, and before 20 weeks', () => {
    expect(codes(visitAlerts({ ...visit, bp_systolic: 142, bp_diastolic: 85 }, 25 * 7))).toEqual(['hypertension']);
    expect(codes(visitAlerts({ ...visit, bp_systolic: 142, bp_diastolic: 85, urine_protein: '2+' }, 12 * 7)))
      .toEqual(['hypertension', 'proteinuria']);
  });
  it('normal BP gives no alert at 140 boundary minus one', () => {
    expect(visitAlerts({ ...visit, bp_systolic: 139, bp_diastolic: 89 }, 200)).toEqual([]);
  });
  it('fetal movements only from 24 weeks', () => {
    expect(codes(visitAlerts({ ...visit, fetal_movements: 'reduced' }, 20 * 7))).toEqual([]);
    expect(codes(visitAlerts({ ...visit, fetal_movements: 'absent' }, 30 * 7))).toEqual(['absent_fetal_movements']);
  });
  it('fundal height outside GA ± 2 cm (singleton, ≥ 24 w)', () => {
    expect(codes(visitAlerts({ ...visit, fundal_height_cm: 26 }, 30 * 7 + 3))).toEqual(['sfh_small']);
    expect(codes(visitAlerts({ ...visit, fundal_height_cm: 33 }, 30 * 7))).toEqual(['sfh_large']);
    expect(codes(visitAlerts({ ...visit, fundal_height_cm: 32 }, 30 * 7))).toEqual([]);
    expect(codes(visitAlerts({ ...visit, fundal_height_cm: 26 }, 30 * 7, 2))).toEqual([]);
  });
  it('anaemia thresholds by trimester', () => {
    expect(codes(visitAlerts({ ...visit, hemoglobin_g_dl: 10.8 }, 10 * 7))).toEqual(['anemia']);
    expect(codes(visitAlerts({ ...visit, hemoglobin_g_dl: 10.8 }, 20 * 7))).toEqual([]);
    expect(codes(visitAlerts({ ...visit, hemoglobin_g_dl: 6.5 }, 20 * 7))).toEqual(['severe_anemia']);
  });
  it('FHR and malpresentation', () => {
    expect(codes(visitAlerts({ ...visit, fetal_heart_rate: 172, presentation: 'breech' }, 37 * 7)))
      .toEqual(['fhr_abnormal', 'malpresentation']);
    expect(codes(visitAlerts({ ...visit, presentation: 'breech' }, 30 * 7))).toEqual([]);
  });
  it('pregnancy alerts and sorting', () => {
    const a = pregnancyAlerts({ status: 'active' }, 295, 'negative');
    expect(codes(sortAlerts(a))).toEqual(['post_term', 'rh_negative']);
    expect(pregnancyAlerts({ status: 'delivered' }, 295, 'negative')).toEqual([]);
  });
});

describe('dating (ACOG CO 700)', () => {
  it('thresholds by GA at scan', () => {
    expect([50, 70, 100, 120, 160, 200].map(redatingThresholdDays)).toEqual([5, 7, 7, 10, 14, 21]);
  });
  it('keeps LMP when within threshold', () => {
    // LMP 2026-01-01 → GA on 2026-03-12 = 70 d; scan says 74 d (diff 4 ≤ 7)
    const r = reconcileDating({ lmp: '2026-01-01', usDate: '2026-03-12', usGaDays: 74 });
    expect(r.differenceDays).toBe(4);
    expect(r.useUltrasound).toBe(false);
    expect(r.finalEdd).toBe('2026-10-08');
  });
  it('redates by ultrasound beyond threshold', () => {
    const r = reconcileDating({ lmp: '2026-01-01', usDate: '2026-03-12', usGaDays: 60 });
    expect(r.differenceDays).toBe(10);
    expect(r.useUltrasound).toBe(true);
    expect(r.finalEdd).toBe(eddFromUltrasound('2026-03-12', 60));
  });
  it('computeEdd for each method', () => {
    expect(computeEdd({ method: 'lmp', lmp: '2026-01-01' })).toEqual({ edd: '2026-10-08', basis: 'lmp' });
    expect(computeEdd({ method: 'ultrasound', usDate: '2026-03-12', usGaDays: 70 })?.edd).toBe('2026-10-08');
    expect(computeEdd({ method: 'ivf_transfer', transferDate: '2026-01-10', embryoAgeDays: 5 })?.edd).toBe('2026-09-28');
    expect(computeEdd({ method: 'ultrasound', usDate: null })).toBeNull();
  });
  it('bmi', () => {
    expect(bmi(70, 165)).toBe(25.7);
    expect(bmi(null, 165)).toBeNull();
  });
});

describe('antenatal schedule', () => {
  const ctx = { rhNegative: true, aspirinRecommended: false, ogttIndicated: true, earlyOgtt: false };
  it('filters conditional items and classifies status', () => {
    const s = buildSchedule(26 * 7, ctx, completedFromAssessments(['anomaly_scan']));
    const by = Object.fromEntries(s.map((i) => [i.code, i.status]));
    expect(by.aspirin_start).toBeUndefined();
    expect(by.booking).toBe('passed');
    expect(by.anomaly_scan).toBe('done');
    expect(by.ogtt).toBe('due');
    expect(by.anti_d).toBe('upcoming');
  });
});

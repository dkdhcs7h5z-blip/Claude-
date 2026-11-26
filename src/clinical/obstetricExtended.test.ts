import { describe, expect, it } from 'vitest';
import {
  biometryAlerts, chorionicityAlerts, efwCentile, hadlockCentileWeight, hadlockEfw, hadlockMedianWeight, normalCdf,
} from './fetalGrowth';
import { postnatalAlerts } from './postnatal';
import { activePhase, actionLineAt, alertLineAt, labourAlerts, progressStatus, type LabourObs } from './partogram';
import { visitAlerts } from './obstetricRisk';

const codes = (a: { code: string }[]) => a.map((x) => x.code);

describe('fetal growth', () => {
  it('Hadlock 4 EFW matches the SQL implementation', () => {
    expect(hadlockEfw(300, 300, 60)).toBe(2100);
    expect(hadlockEfw(300, null, 60)).toBeNull();
  });
  it('Hadlock 1991 median and 10th centile at 40 weeks', () => {
    expect(Math.round(hadlockMedianWeight(280))).toBe(3619);
    expect(Math.round(hadlockCentileWeight(10, 280))).toBe(3030);
  });
  it('normal CDF', () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.2816)).toBeCloseTo(0.9, 3);
    expect(normalCdf(-1.8808)).toBeCloseTo(0.03, 3);
  });
  it('EFW centile', () => {
    expect(efwCentile(Math.round(hadlockMedianWeight(224)), 224)).toBeCloseTo(50, 0);
    expect(efwCentile(2000, 30)).toBeNull();
  });
  const fetus = { fetus_label: 'A', ga_days: 224, afi_cm: null, dvp_cm: null, ua_edf: null, placenta_location: null } as const;
  it('growth classification', () => {
    const m = hadlockMedianWeight(224);
    expect(codes(biometryAlerts([{ ...fetus, efw_g: Math.round(m * 0.72) }]))).toEqual(['fgr_suspected']);
    expect(codes(biometryAlerts([{ ...fetus, efw_g: Math.round(m * 0.82) }]))).toEqual(['sga']);
    expect(codes(biometryAlerts([{ ...fetus, efw_g: Math.round(m * 1.2) }]))).toEqual(['lga']);
    expect(biometryAlerts([{ ...fetus, efw_g: Math.round(m) }])).toEqual([]);
  });
  it('Doppler, liquor and placenta', () => {
    expect(codes(biometryAlerts([{ ...fetus, efw_g: null, ua_edf: 'reversed', dvp_cm: 1.5, placenta_location: 'previa' }])))
      .toEqual(['ua_redf', 'oligohydramnios', 'low_placenta_previa']);
    expect(codes(biometryAlerts([{ ...fetus, efw_g: null, afi_cm: 26 }]))).toEqual(['polyhydramnios']);
  });
  it('twin discordance ≥ 20 %', () => {
    const m = hadlockMedianWeight(224);
    const a = { ...fetus, efw_g: Math.round(m) }, b = { ...fetus, fetus_label: 'B', efw_g: Math.round(m * 0.78) };
    const al = biometryAlerts([a, b]);
    expect(codes(al)).toContain('twin_discordance');
    expect(al.find((x) => x.code === 'sga')?.values?.fetus).toBe('B');
  });
  it('chorionicity', () => {
    expect(codes(chorionicityAlerts(2, 'mcda'))).toEqual(['monochorionic']);
    expect(codes(chorionicityAlerts(2, null))).toEqual(['chorionicity_unknown']);
    expect(chorionicityAlerts(1, null)).toEqual([]);
  });
  it('per-fetus FHR and presentation at visits', () => {
    const v = { bp_systolic: null, bp_diastolic: null, urine_protein: null, urine_glucose: null, fetal_movements: null,
      fetal_heart_rate: null, fundal_height_cm: null, hemoglobin_g_dl: null, presentation: null, edema: null } as const;
    const al = visitAlerts({ ...v, fhr_by_fetus: [140, 172], presentation_by_fetus: ['cephalic', 'breech'] }, 252, 2);
    expect(al.map((a) => [a.code, a.values?.fetus])).toEqual([['fhr_abnormal', 'B'], ['malpresentation', 'B']]);
  });
});

describe('postnatal alerts', () => {
  const base = { bp_systolic: null, bp_diastolic: null, temperature_c: null, uterus: null, lochia: null, wound: null,
    breasts: null, epds_score: null, epds_self_harm: null, hemoglobin_g_dl: null };
  it('blood pressure', () => {
    expect(codes(postnatalAlerts({ ...base, bp_systolic: 162, bp_diastolic: 95 }))).toEqual(['pn_severe_hypertension']);
    expect(codes(postnatalAlerts({ ...base, bp_systolic: 142, bp_diastolic: 85 }))).toEqual(['pn_hypertension']);
  });
  it('EPDS', () => {
    expect(codes(postnatalAlerts({ ...base, epds_score: 14 }))).toEqual(['epds_probable']);
    expect(codes(postnatalAlerts({ ...base, epds_score: 11 }))).toEqual(['epds_possible']);
    expect(codes(postnatalAlerts({ ...base, epds_score: 4, epds_self_harm: true }))).toEqual(['epds_self_harm']);
  });
  it('infection signs', () => {
    expect(codes(postnatalAlerts({ ...base, temperature_c: 38.2, lochia: 'offensive', wound: 'infection', breasts: 'mastitis' })))
      .toEqual(['pn_fever', 'pn_endometritis', 'pn_wound', 'pn_mastitis']);
  });
});

describe('partogram', () => {
  const t0 = new Date('2026-11-26T08:00:00Z').getTime();
  const at = (h: number) => new Date(t0 + h * 3_600_000).toISOString();
  const o = (h: number, dil: number | null, extra: Partial<LabourObs> = {}): LabourObs => ({
    observed_at: at(h), cervical_dilation_cm: dil, descent_fifths: null, contractions_per_10min: null, fhr: null,
    liquor: null, bp_systolic: null, bp_diastolic: null, temperature_c: null, ...extra,
  });
  it('active phase starts at first dilation ≥ 4 cm', () => {
    expect(activePhase([o(0, 3), o(2, 4), o(4, 6)])).toEqual({ start: at(2), startDilation: 4 });
    expect(activePhase([o(0, 3)])).toBeNull();
  });
  it('alert and action lines', () => {
    const p = { start: at(0), startDilation: 4 };
    expect(alertLineAt(p, 3)).toBe(7);
    expect(alertLineAt(p, 10)).toBe(10);
    expect(actionLineAt(p, 3)).toBeNull();
    expect(actionLineAt(p, 6)).toBe(6);
  });
  it('progress status', () => {
    expect(progressStatus([o(0, 4), o(4, 8)])).toBe('normal');
    expect(progressStatus([o(0, 4), o(4, 6)])).toBe('alert');
    expect(progressStatus([o(0, 4), o(6, 6)])).toBe('action');
    expect(progressStatus([o(0, 4), o(5, 10)])).toBe('fully_dilated');
    expect(progressStatus([o(0, 4), o(5, 5, { entered_in_error: true }), o(5.1, 9.5)])).toBe('normal');
  });
  it('labour alerts', () => {
    expect(codes(labourAlerts([o(0, 4, { fhr: 100, liquor: 'meconium_thick', contractions_per_10min: 6, temperature_c: 38.4 }), o(6, 5)])))
      .toEqual(['partogram_action', 'fhr_abnormal', 'thick_meconium', 'tachysystole', 'intrapartum_fever']);
  });
});

import { classifyRisk, detectOngoingFactors } from './highRisk';
import { assessGdm } from './obstetricRisk';
import { buildSchedule } from './antenatalSchedule';

describe('high-risk classification (follow-up card sections 2A/2B)', () => {
  it('ongoing factor or multiple pregnancy → high', () => {
    expect(classifyRisk({ riskFactors: ['short_cervix_threatened_ptl'], plurality: 1, aspirinRecommended: false }))
      .toEqual({ level: 'high', reasons: ['short_cervix_threatened_ptl'] });
    expect(classifyRisk({ riskFactors: [], plurality: 2, aspirinRecommended: false }).level).toBe('high');
  });
  it('major past factor → high; minor → moderate; none → low', () => {
    expect(classifyRisk({ riskFactors: ['thrombophilia'], plurality: 1, aspirinRecommended: false }).level).toBe('high');
    expect(classifyRisk({ riskFactors: ['previous_cs'], plurality: 1, aspirinRecommended: false }).level).toBe('moderate');
    expect(classifyRisk({ riskFactors: [], plurality: 1, aspirinRecommended: true }).level).toBe('moderate');
    expect(classifyRisk({ riskFactors: [], plurality: 1, aspirinRecommended: false }).level).toBe('low');
  });
  it('detected factors count', () => {
    expect(classifyRisk({ riskFactors: [], plurality: 1, aspirinRecommended: false, detected: ['oligo_polyhydramnios'] }).level).toBe('high');
  });
  it('detects ongoing factors from records, skipping those already ticked', () => {
    expect(detectOngoingFactors({ riskFactors: ['oligo_polyhydramnios'], visitAlertCodes: ['hypertension'],
      scanAlertCodes: ['sga', 'oligohydramnios', 'low_placenta_previa'] }))
      .toEqual(['current_hypertensive_disorder', 'current_fgr_abnormal_doppler', 'placenta_previa']);
  });
  it('diagnosed GDM is not screened again', () => {
    const g = assessGdm({ riskFactors: ['current_gdm', 'previous_gdm'], bmi: 33 });
    expect(g.diagnosed && !g.ogttIndicated && !g.earlyTesting).toBe(true);
  });
  it('clinic protocol schedule items', () => {
    const base = { rhNegative: false, aspirinRecommended: false, ogttIndicated: false, earlyOgtt: false };
    const codes = (x: { code: string }[]) => x.map((i) => i.code);
    expect(codes(buildSchedule(20 * 7, base))).toEqual(expect.arrayContaining(['labs_t1', 'cervical_length', 'cbc_t2', 'labs_t3']));
    expect(codes(buildSchedule(20 * 7, base))).not.toContain('growth_doppler');
    expect(codes(buildSchedule(20 * 7, { ...base, highRisk: true, fetalEchoIndicated: true }))).toEqual(expect.arrayContaining(['growth_doppler', 'fetal_echo']));
  });
});

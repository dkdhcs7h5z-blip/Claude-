import { describe, expect, it } from 'vitest';
import { biochemicalHyperandrogenism, freeAndrogenIndex, labAlerts, labFlag, lhFshRatio, type LabLike } from './labs';
import { questionnaireAlerts, scoreIciq, scoreMrs } from './questionnaires';
import { ovarianAlerts, rmi, roma } from './ovarian';

const codes = (a: { code: string }[]) => a.map((x) => x.code);
const L = (test_code: string, value: number, collected_at = '2026-11-01', ref_low: number | null = null, ref_high: number | null = null): LabLike =>
  ({ test_code, value, collected_at, ref_low, ref_high });

describe('labs', () => {
  it('flags against the stored range', () => {
    expect(labFlag(5, 1, 4)).toBe('high');
    expect(labFlag(0.5, 1, 4)).toBe('low');
    expect(labFlag(2, 1, 4)).toBe('normal');
    expect(labFlag(2, null, null)).toBeNull();
  });
  it('FAI and LH:FSH', () => {
    const labs = [L('testosterone', 2.4), L('shbg', 30, '2026-10-20'), L('lh', 12), L('fsh', 5)];
    expect(freeAndrogenIndex(labs)).toBe(8);
    expect(lhFshRatio(labs)).toBe(2.4);
    expect(freeAndrogenIndex([L('testosterone', 2.4), L('shbg', 30, '2026-08-01')])).toBeNull();
    expect(biochemicalHyperandrogenism(labs)).toBe(true);
    expect(biochemicalHyperandrogenism([L('testosterone', 1.2, '2026-11-01', 0.29, 1.67), L('shbg', 60)])).toBe(false);
  });
  it('POI needs two FSH > 25 at least 4 weeks apart, age < 40', () => {
    expect(codes(labAlerts([L('fsh', 40, '2026-11-01')], 35))).toEqual(['poi_possible']);
    expect(codes(labAlerts([L('fsh', 40, '2026-11-01'), L('fsh', 38, '2026-09-20')], 35))).toEqual(['poi_confirmed']);
    expect(codes(labAlerts([L('fsh', 40, '2026-11-01'), L('fsh', 38, '2026-09-20')], 45))).toEqual([]);
  });
  it('endocrine, metabolic and haematology alerts', () => {
    expect(codes(labAlerts([L('prolactin', 900, '2026-11-01', 102, 496), L('tsh', 6.1, '2026-11-01', 0.27, 4.2),
      L('hba1c', 6.0), L('hemoglobin', 9.5), L('ferritin', 8), L('ca125', 80)], 30)))
      .toEqual(['hyperprolactinemia', 'tsh_high', 'prediabetes_range', 'anemia_lab', 'iron_deficiency', 'ca125_raised']);
    expect(codes(labAlerts([L('fasting_glucose', 7.4), L('hemoglobin', 7.5)], 30))).toEqual(['diabetes_range', 'anemia_lab']);
    expect(labAlerts([L('hemoglobin', 7.5)], 30)[0].severity).toBe('critical');
  });
});

describe('questionnaires', () => {
  it('MRS scoring and bands', () => {
    const r = scoreMrs([4, 1, 3, 2, 2, 1, 3, 2, 1, 3, 2]);
    expect(r).toMatchObject({ total: 24, somatic: 10, psychological: 8, urogenital: 6, severity: 'severe' });
    expect(scoreMrs([1, 0, 1, 0, 1, 0, 0, 0, 1, 0, 0]).severity).toBe('none');
    expect(scoreMrs([2, 1, 2, 0, 1, 0, 0, 0, 0, 1, 1]).severity).toBe('mild');
    expect(scoreMrs([3, 2, 2, 1, 1, 1, 1, 1, 0, 1, 1]).severity).toBe('moderate');
  });
  it('ICIQ-UI SF scoring, severity and type', () => {
    expect(scoreIciq(3, 4, 7, ['cough_sneeze', 'physical_activity'])).toMatchObject({ score: 14, severity: 'severe', type: 'stress' });
    expect(scoreIciq(2, 2, 3, ['before_toilet', 'cough_sneeze']).type).toBe('mixed');
    expect(scoreIciq(1, 2, 1, ['before_toilet'])).toMatchObject({ score: 4, severity: 'slight', type: 'urge' });
    expect(scoreIciq(0, 0, 0, ['never'])).toMatchObject({ severity: 'none', type: 'none' });
    expect(scoreIciq(5, 6, 10, ['all_the_time'])).toMatchObject({ severity: 'very_severe', continuous: true });
  });
  it('questionnaire alerts', () => {
    expect(codes(questionnaireAlerts([4, 2, 3, 4, 3, 3, 3, 2, 1, 3, 2], { frequency: 5, amount: 6, interference: 8, leak_situations: ['all_the_time'] })))
      .toEqual(['mrs_severe', 'mrs_psychological', 'continuous_leakage', 'iciq_severe']);
  });
});

describe('ovarian mass risk', () => {
  it('RMI I', () => {
    expect(rmi(['multilocular', 'solid_areas'], true, 120)).toEqual({ u: 3, m: 3, value: 1080 });
    expect(rmi(['multilocular'], false, 40)).toEqual({ u: 1, m: 1, value: 40 });
    expect(rmi([], true, 300).value).toBe(0);
    expect(rmi(['ascites'], true, null).value).toBeNull();
  });
  it('ROMA (Moore 2009 equations)', () => {
    // expected values verified independently (Python, same published equations)
    const post = roma(150, 120, true)!;
    expect(post.value).toBeCloseTo(65.15, 0);
    expect(post.high).toBe(true);
    const pre = roma(50, 30, false)!;
    expect(pre.value).toBeCloseTo(7.75, 0);
    expect(pre.high).toBe(true);                       // ≥ 7.4 % premenopausal cut-off
    expect(roma(40, 20, false)!.high).toBe(false);
    expect(roma(null, 30, false)).toBeNull();
  });
  it('alerts', () => {
    expect(codes(ovarianAlerts({ orads: 5, rmiValue: 250, roma: { value: 40, high: true } }))).toEqual(['orads_5', 'rmi_high', 'roma_high']);
    expect(codes(ovarianAlerts({ orads: 4, rmiValue: 150 }))).toEqual(['orads_4']);
  });
});

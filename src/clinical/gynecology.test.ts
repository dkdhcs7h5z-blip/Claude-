import { describe, expect, it } from 'vitest';
import { addMonths, gynAlerts, iotaSimpleRules, recommendScreening, rotterdam, screeningStatus } from './gynecology';

const rec = (o: Parameters<typeof recommendScreening>[0]) => recommendScreening(o).action;
const codes = (a: { code: string }[]) => a.map((x) => x.code);

describe('cervical screening next step', () => {
  it('negative results → routine recall by test type and age', () => {
    expect(rec({ ageYears: 27, testType: 'cytology', cytology: 'nilm' })).toBe('routine_3y');
    expect(rec({ ageYears: 40, testType: 'cotest', cytology: 'nilm', hpv: 'negative' })).toBe('routine_5y');
    expect(recommendScreening({ ageYears: 40, testType: 'hpv_primary', hpv: 'negative' }).months).toBe(60);
    expect(rec({ ageYears: 19, testType: 'cytology', cytology: 'nilm' })).toBe('not_indicated_under_21');
    expect(rec({ ageYears: 66, testType: 'cotest', cytology: 'nilm', hpv: 'negative' })).toBe('exit_over_65');
    expect(rec({ ageYears: 45, testType: 'cytology', cytology: 'nilm', hysterectomy: 'total' })).toBe('stop_post_hysterectomy');
  });
  it('HPV 16/18 → colposcopy regardless of cytology', () => {
    expect(rec({ ageYears: 35, testType: 'cotest', cytology: 'nilm', hpv: 'hpv16' })).toBe('colposcopy');
  });
  it('other hrHPV with NILM → repeat in 1 year; HPV-primary without cytology → triage', () => {
    expect(rec({ ageYears: 35, testType: 'cotest', cytology: 'nilm', hpv: 'other_hr' })).toBe('repeat_1y');
    expect(rec({ ageYears: 35, testType: 'hpv_primary', hpv: 'other_hr' })).toBe('reflex_hpv');
  });
  it('ASC-US by HPV status', () => {
    expect(rec({ ageYears: 30, testType: 'cotest', cytology: 'asc_us', hpv: 'negative' })).toBe('repeat_3y');
    expect(rec({ ageYears: 30, testType: 'cotest', cytology: 'asc_us', hpv: 'other_hr' })).toBe('colposcopy');
    expect(rec({ ageYears: 30, testType: 'cytology', cytology: 'asc_us' })).toBe('reflex_hpv');
  });
  it('LSIL, high grade, glandular, cancer, unsatisfactory', () => {
    expect(rec({ ageYears: 30, testType: 'cotest', cytology: 'lsil', hpv: 'negative' })).toBe('repeat_1y');
    expect(rec({ ageYears: 30, testType: 'cytology', cytology: 'lsil' })).toBe('colposcopy');
    expect(rec({ ageYears: 30, testType: 'cytology', cytology: 'hsil' })).toBe('colposcopy_expedited');
    expect(rec({ ageYears: 23, testType: 'cytology', cytology: 'hsil' })).toBe('colposcopy');
    expect(rec({ ageYears: 40, testType: 'cytology', cytology: 'agc' })).toBe('colposcopy_endometrial');
    expect(recommendScreening({ ageYears: 40, testType: 'cytology', cytology: 'scc' }).urgency).toBe('urgent');
    expect(recommendScreening({ ageYears: 40, testType: 'cytology', cytology: 'unsatisfactory' }).months).toBe(3);
  });
  it('addMonths handles month ends', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-11-26', 36)).toBe('2029-11-26');
  });
  it('screening status', () => {
    const today = '2026-11-26';
    expect(screeningStatus({ ageYears: 35, today })).toBe('never');
    expect(screeningStatus({ ageYears: 35, lastSampleDate: '2022-01-01', nextDue: '2025-01-01', today })).toBe('overdue');
    expect(screeningStatus({ ageYears: 35, lastSampleDate: '2024-01-01', nextDue: '2027-01-01', today })).toBe('due_soon');
    expect(screeningStatus({ ageYears: 35, lastSampleDate: '2025-01-01', nextDue: '2030-01-01', today })).toBe('up_to_date');
    expect(screeningStatus({ ageYears: 35, lastSampleDate: '2026-11-01', recommendation: 'colposcopy', today })).toBe('action_needed');
    expect(screeningStatus({ ageYears: 35, lastSampleDate: '2026-11-01', recommendation: 'colposcopy', colposcopyAfterSample: true, nextDue: '2027-11-01', today })).toBe('up_to_date');
    expect(screeningStatus({ ageYears: 35, lastSampleDate: '2026-11-20', lastStatus: 'pending', today })).toBe('pending_result');
    expect(screeningStatus({ ageYears: 19, today })).toBe('not_applicable');
  });
});

describe('IOTA simple rules', () => {
  it('classifies', () => {
    expect(iotaSimpleRules(['B1'], [])).toBe('benign');
    expect(iotaSimpleRules([], ['M1', 'M2'])).toBe('malignant');
    expect(iotaSimpleRules(['B1'], ['M5'])).toBe('inconclusive');
    expect(iotaSimpleRules([], [])).toBe('inconclusive');
  });
});

describe('Rotterdam PCOS', () => {
  it('2 of 3 criteria', () => {
    expect(rotterdam({ cycleRegularity: 'irregular', follicleCounts: [22, 14] }).criteriaMet).toBe(true);
    expect(rotterdam({ cycleLengthDays: 45, clinicalHyperandrogenism: true }).met).toBe(2);
    expect(rotterdam({ cycleRegularity: 'regular', ovaryVolumesMl: [11] })).toMatchObject({ met: 1, criteriaMet: false });
    expect(rotterdam({ follicleCounts: [19], ovaryVolumesMl: [9.9] }).pcom).toBe(false);
  });
});

describe('gynecology alerts', () => {
  it('postmenopausal bleeding by endometrial thickness', () => {
    expect(codes(gynAlerts({ ageYears: 58, menopauseStatus: 'postmenopausal', complaints: ['pmb'], endometrialThicknessMm: 7 })))
      .toEqual(['pmb_thick_endometrium']);
    expect(codes(gynAlerts({ ageYears: 58, menopauseStatus: 'postmenopausal', complaints: ['pmb'], endometrialThicknessMm: 3 })))
      .toEqual(['pmb_thin_endometrium']);
    expect(codes(gynAlerts({ ageYears: 58, menopauseStatus: 'postmenopausal', complaints: ['pmb'] }))).toEqual(['pmb_needs_assessment']);
    expect(codes(gynAlerts({ ageYears: 60, menopauseStatus: 'postmenopausal', endometrialThicknessMm: 12 }))).toEqual(['asymptomatic_thick_endometrium']);
  });
  it('AUB at ≥ 45, postcoital bleeding, IOTA, screening, PCOS, POP, pain', () => {
    expect(codes(gynAlerts({ ageYears: 47, menopauseStatus: 'premenopausal', complaints: ['aub', 'postcoital_bleeding'] })))
      .toEqual(['aub_45_sampling', 'postcoital_bleeding']);
    expect(codes(gynAlerts({ ageYears: 30, iota: 'malignant', screening: 'action_needed', pendingHistology: 1,
      rotterdam: { ovulatoryDysfunction: true, hyperandrogenism: true, pcom: false, met: 2, criteriaMet: true }, popStage: 2, painScore: 8 })))
      .toEqual(['iota_malignant', 'screening_action', 'histology_pending', 'pcos_criteria', 'prolapse_stage', 'severe_pain']);
    expect(codes(gynAlerts({ ageYears: 44, complaints: ['aub'] }))).toEqual([]);
  });
});

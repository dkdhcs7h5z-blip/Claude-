import { describe, expect, it } from 'vitest';
import en from '@/i18n/en';
import ar from '@/i18n/ar';
import {
  FM_ALERT_CODES, ageRiskT21, anomalyAlerts, assessFgr, cfdnaAlerts, dopplerAlerts, fgrAlert, firstTrimesterAlerts, gaFromCrl,
  mcaPsvMom, ntP95, procedureAlerts, quinteroStage, screeningCategory, suggestConclusion, ventriculomegalyGrade,
  type AnomalyLike, type DopplerLike, type FirstTrimesterLike,
} from './fetalMedicine';

const ft = (o: Partial<FirstTrimesterLike> = {}): FirstTrimesterLike => ({
  fetus_label: 'A', crl_mm: 62, nt_mm: 1.8, nasal_bone: 'present', dv_a_wave: 'positive', tricuspid_regurgitation: false,
  papp_a_mom: 1, risk_t21: 5000, risk_t18: 20000, risk_t13: 20000, ...o,
});
const an = (o: Partial<AnomalyLike> = {}): AnomalyLike => ({
  fetus_label: 'A', ga_days: 140, abnormal_structures: [], not_visualised: [], atrium_mm: 6, cisterna_magna_mm: 5, nuchal_fold_mm: 4,
  renal_pelvis_mm: 2, cervical_length_mm: 38, placenta_location: 'posterior', placenta_os_mm: 50, cord_vessels: 3, amniotic_fluid: 'normal',
  soft_markers: [], conclusion: 'normal', ...o,
});
const dp = (o: Partial<DopplerLike> = {}): DopplerLike => ({
  fetus_label: 'A', ga_days: 200, ua_pi: 1.0, ua_pi_centile: 50, ua_edf: 'present', mca_pi: 1.8, mca_psv_mom: 1.0, cpr: 1.8, cpr_centile: 40,
  uta_pi_centile: 50, dv_pi_centile: 50, dv_a_wave: 'positive', uv_pulsation: false, mvp_cm: 5, bladder_visible: true, hydrops: false,
  fetal_demise: false, ctg: null, ...o,
});
const codes = (a: { code: string }[]) => a.map((x) => x.code);

describe('screening', () => {
  it('maternal-age T21 risk at term (Morris 2002)', () => {
    expect([20, 30, 35, 40, 45].map(ageRiskT21)).toEqual([1478, 940, 354, 86, 36]);
  });
  it('GA from CRL (Robinson) spans 11+1 to 14+0 over the screening window', () => {
    expect(gaFromCrl(45)).toBe(78);
    expect(gaFromCrl(84)).toBe(98);
  });
  it('NT 95th centile rises from 2.1 to 2.7 mm', () => {
    expect(ntP95(45)).toBe(2.1);
    expect(ntP95(84)).toBe(2.7);
    expect(ntP95(62)).toBe(2.36);
    expect(ntP95(30)).toBe(2.1);
  });
  it('screening categories use 1:150 and 1:1000', () => {
    expect([150, 151, 1000, 1001].map(screeningCategory)).toEqual(['high', 'intermediate', 'intermediate', 'low']);
  });
  it('first-trimester alerts', () => {
    expect(firstTrimesterAlerts([ft()])).toEqual([]);
    const a = firstTrimesterAlerts([ft({ nt_mm: 3.8, risk_t21: 45, nasal_bone: 'absent', dv_a_wave: 'reversed', tricuspid_regurgitation: true, papp_a_mom: 0.3 })]);
    expect(codes(a)).toEqual(['combined_high_risk', 'nt_increased', 'nasal_bone_absent', 'ft_dv_reversed', 'tricuspid_regurgitation', 'low_papp_a']);
    expect(a[0].values).toMatchObject({ trisomies: 'T21 1:45' });
    expect(codes(firstTrimesterAlerts([ft({ nt_mm: 2.6, risk_t21: 400 })]))).toEqual(['combined_intermediate', 'nt_above_p95']);
    expect(codes(firstTrimesterAlerts([ft({ crl_mm: 90 })]))).toEqual(['crl_out_of_range']);
  });
  it('twins: per-fetus labels, one PAPP-A alert', () => {
    const a = firstTrimesterAlerts([ft({ papp_a_mom: 0.3, nt_mm: 3.6 }), ft({ fetus_label: 'B', papp_a_mom: 0.3 })]);
    expect(a.find((x) => x.code === 'nt_increased')?.values?.fetus).toBe('A');
    expect(a.filter((x) => x.code === 'low_papp_a')).toHaveLength(1);
  });
  it('cfDNA alerts', () => {
    const base = { sampled_on: '2026-10-01', t21: null, t18: null, t13: null, sex_chromosomes: null, fetal_fraction_pct: null };
    expect(cfdnaAlerts({ ...base, result_status: 'pending' }, '2026-10-10')).toEqual([]);
    expect(codes(cfdnaAlerts({ ...base, result_status: 'pending' }, '2026-10-20'))).toEqual(['cfdna_pending']);
    expect(cfdnaAlerts({ ...base, result_status: 'resulted', t21: 'high_risk', t18: 'low_risk', t13: 'no_call' }, '2026-10-20'))
      .toEqual([{ code: 'cfdna_high_risk', severity: 'warning', values: { conditions: 'T21' } }, { code: 'cfdna_no_call', severity: 'info', values: { ff: '—' } }]);
    expect(codes(cfdnaAlerts({ ...base, result_status: 'failed', fetal_fraction_pct: 2.1 }, '2026-10-20'))).toEqual(['cfdna_no_call']);
  });
});

describe('anomaly scan', () => {
  it('normal scan raises nothing', () => expect(anomalyAlerts([an()])).toEqual([]));
  it('ventriculomegaly grades', () => {
    expect([9.9, 10, 12, 12.1, 15, 15.1].map(ventriculomegalyGrade)).toEqual([null, 'mild', 'mild', 'moderate', 'moderate', 'severe']);
    expect(anomalyAlerts([an({ atrium_mm: 16 })])[0]).toMatchObject({ code: 'ventriculomegaly', severity: 'critical', values: { grade: 'severe' } });
  });
  it('maternal and placental findings', () => {
    expect(codes(anomalyAlerts([an({ cervical_length_mm: 22 })]))).toEqual(['short_cervix']);
    expect(codes(anomalyAlerts([an({ cervical_length_mm: 22, ga_days: 175 })]))).toEqual([]);
    expect(codes(anomalyAlerts([an({ placenta_os_mm: 12 })]))).toEqual(['low_placenta']);
    expect(codes(anomalyAlerts([an({ placenta_os_mm: -5 })]))).toEqual(['low_placenta_previa']);
  });
  it('markers, SUA and incomplete views', () => {
    const a = anomalyAlerts([an({ cord_vessels: 2, soft_markers: ['single_umbilical_artery', 'echogenic_bowel'], renal_pelvis_mm: 11,
      not_visualised: ['lvot', 'rvot'], conclusion: 'incomplete', nuchal_fold_mm: 6.5 })]);
    expect(codes(a)).toEqual(['anomaly_incomplete', 'nuchal_fold_thick', 'pyelectasis', 'single_umbilical_artery', 'soft_markers']);
    expect(a.find((x) => x.code === 'pyelectasis')?.severity).toBe('warning');
    expect(a.find((x) => x.code === 'soft_markers')?.values?.n).toBe(1);
  });
  it('suggested conclusion', () => {
    expect(suggestConclusion({ abnormal_structures: [], not_visualised: [], soft_markers: [] })).toBe('normal');
    expect(suggestConclusion({ abnormal_structures: [], not_visualised: [], soft_markers: ['echogenic_bowel'] })).toBe('soft_markers');
    expect(suggestConclusion({ abnormal_structures: [], not_visualised: ['lips'], soft_markers: ['echogenic_bowel'] })).toBe('incomplete');
    expect(suggestConclusion({ abnormal_structures: [], not_visualised: [], soft_markers: [], anomalies: 'talipes' })).toBe('anomaly_suspected');
  });
});

describe('Doppler', () => {
  it('MCA PSV MoM against Mari medians', () => {
    expect(mcaPsvMom(40, 154)).toBe(1.44);
    expect(mcaPsvMom(60, 210)).toBe(1.5);
    expect(mcaPsvMom(40, 100)).toBeNull();
  });
  it('alerts by severity', () => {
    expect(dopplerAlerts([dp()])).toEqual([]);
    expect(codes(dopplerAlerts([dp({ ua_edf: 'reversed', dv_a_wave: 'reversed', mca_psv_mom: 1.6, cpr: 0.6, cpr_centile: null })])))
      .toEqual(['ua_redf', 'dv_abnormal', 'fetal_anaemia', 'cpr_low']);
    expect(codes(dopplerAlerts([dp({ ua_pi_centile: 97, cpr_centile: 3, uta_pi_centile: 98 })]))).toEqual(['cpr_low', 'ua_pi_high', 'uta_pi_high']);
    expect(codes(dopplerAlerts([dp({ fetal_demise: true, ua_edf: 'absent' })]))).toEqual(['fetal_demise']);
  });
  it('CPR centile takes precedence over the CPR < 1 fallback', () => {
    expect(dopplerAlerts([dp({ cpr: 0.9, cpr_centile: 20 })])).toEqual([]);
  });
});

describe('FGR (Delphi + Barcelona)', () => {
  it('early FGR by EFW < 3rd', () => {
    expect(assessFgr({ gaDays: 196, efwCentile: 2 })).toMatchObject({ fgr: true, onset: 'early', stage: 1, deliverAtWeeks: 37 });
  });
  it('early FGR by UA AEDF alone, stage II', () => {
    expect(assessFgr({ gaDays: 196, efwCentile: 15, uaEdf: 'absent' })).toMatchObject({ fgr: true, stage: 2, deliverAtWeeks: 34 });
  });
  it('early: EFW < 10th needs abnormal UA or UtA', () => {
    expect(assessFgr({ gaDays: 196, efwCentile: 6 })).toMatchObject({ fgr: false, sga: true, deliverAtWeeks: 40 });
    expect(assessFgr({ gaDays: 196, efwCentile: 6, utaPiCentile: 97 })).toMatchObject({ fgr: true, criteria: ['efw_lt10_uta'] });
  });
  it('late: two of three contributory criteria', () => {
    expect(assessFgr({ gaDays: 245, efwCentile: 6 }).fgr).toBe(false);
    expect(assessFgr({ gaDays: 245, efwCentile: 6, cpr: 0.8 })).toMatchObject({ fgr: true, onset: 'late', criteria: ['efw_lt10', 'cpr_low'] });
    expect(assessFgr({ gaDays: 245, efwCentile: 20, previousEfwCentile: 75, uaPiCentile: 97 })).toMatchObject({ fgr: true, criteria: ['crossing_centiles', 'ua_pi_high'] });
  });
  it('Barcelona stages III and IV', () => {
    expect(assessFgr({ gaDays: 196, efwCentile: 1, uaEdf: 'reversed' }).stage).toBe(3);
    expect(assessFgr({ gaDays: 196, efwCentile: 1, dvPiCentile: 97 }).stage).toBe(3);
    expect(assessFgr({ gaDays: 196, efwCentile: 1, dvAWave: 'reversed' })).toMatchObject({ stage: 4, deliverAtWeeks: 26 });
  });
  it('alerts', () => {
    expect(fgrAlert(assessFgr({ gaDays: 196, efwCentile: 1, uaEdf: 'reversed' }))).toMatchObject({ code: 'fgr_stage', severity: 'critical' });
    expect(fgrAlert(assessFgr({ gaDays: 196, efwCentile: 6 }))?.code).toBe('sga_normal_doppler');
    expect(fgrAlert(assessFgr({ gaDays: 196, efwCentile: 40 }))).toBeNull();
  });
});

describe('TTTS (Quintero)', () => {
  const donor = dp({ fetus_label: 'A', mvp_cm: 1.5 });
  const recipient = dp({ fetus_label: 'B', mvp_cm: 9.2 });
  it('only for monochorionic diamniotic twins meeting the poly/oligo sequence', () => {
    expect(quinteroStage([donor, recipient], 'dcda')).toBeNull();
    expect(quinteroStage([donor, dp({ fetus_label: 'B', mvp_cm: 7 })], 'mcda')).toBeNull();
    expect(quinteroStage([donor, recipient], 'mcda')).toEqual({ stage: 1, donor: 'A', recipient: 'B' });
  });
  it('stages II–V', () => {
    expect(quinteroStage([{ ...donor, bladder_visible: false }, recipient], 'mcda')?.stage).toBe(2);
    expect(quinteroStage([{ ...donor, bladder_visible: false, ua_edf: 'absent' }, recipient], 'mcda')?.stage).toBe(3);
    expect(quinteroStage([donor, { ...recipient, hydrops: true }], 'mcda')?.stage).toBe(4);
    expect(quinteroStage([{ ...donor, fetal_demise: true }, recipient], 'mcda')?.stage).toBe(5);
  });
});

describe('procedures', () => {
  const p = { procedure_type: 'amniocentesis', performed_on: '2026-11-25', ga_days: 110, anti_d_given: null, result_status: 'pending', tests: ['qf_pcr'] };
  it('anti-D for Rh-negative non-sensitised women within 72 h', () => {
    expect(codes(procedureAlerts([p], { rhNegative: true, today: '2026-11-26' }))).toEqual(['anti_d_needed']);
    expect(procedureAlerts([p], { rhNegative: true, sensitised: true, today: '2026-11-26' })).toEqual([]);
    expect(procedureAlerts([{ ...p, anti_d_given: true }], { rhNegative: true, today: '2026-11-26' })).toEqual([]);
    expect(procedureAlerts([p], { rhNegative: false, today: '2026-11-26' })).toEqual([]);
  });
  it('early procedure, overdue and abnormal results', () => {
    expect(codes(procedureAlerts([{ ...p, ga_days: 98 }], { rhNegative: false, today: '2026-11-26' }))).toEqual(['procedure_early']);
    expect(codes(procedureAlerts([{ ...p, performed_on: '2026-10-01' }], { rhNegative: false, today: '2026-11-26' }))).toEqual(['procedure_result_overdue']);
    expect(codes(procedureAlerts([{ ...p, result_status: 'abnormal' }], { rhNegative: false, today: '2026-11-26' }))).toEqual(['procedure_result_abnormal']);
  });
});

describe('alert texts', () => {
  it('every fetal medicine alert has English and Arabic text', () => {
    const missing = FM_ALERT_CODES.filter((c) => !(c in en.ob.alerts) || !(c in ar.ob.alerts));
    expect(missing).toEqual([]);
  });
});

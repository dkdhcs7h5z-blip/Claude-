import { describe, expect, it } from 'vitest';
import {
  afcCategory, amhCategory, betaHcgDue, bologna, classifySemen, cycleKpis, embryoGrade, embryoQuality, expectedResponse,
  follicleSummary, kpiStatus, stimulationAlerts, storageAlerts,
} from './fertility';

const codes = (a: { code: string }[]) => a.map((x) => x.code);
const semen = { volume_ml: null, concentration_m_ml: null, progressive_pct: null, total_motility_pct: null, normal_forms_pct: null,
  vitality_pct: null, leukocytes_m_ml: null, dna_fragmentation_pct: null };

describe('semen analysis (WHO 2021)', () => {
  it('normozoospermia at the reference limits', () => {
    const r = classifySemen({ ...semen, volume_ml: 2, concentration_m_ml: 20, progressive_pct: 35, total_motility_pct: 50, normal_forms_pct: 4 });
    expect(r.findings).toEqual(['normozoospermia']);
    expect(r.totalCount).toBe(40);
    expect(r.tmsc).toBe(14);
    expect(r.iui).toBe('suitable');
  });
  it('OAT, total-count rule, hypospermia', () => {
    const r = classifySemen({ ...semen, volume_ml: 1.2, concentration_m_ml: 10, progressive_pct: 15, total_motility_pct: 30, normal_forms_pct: 2 });
    expect(r.oat).toBe(true);
    expect(r.findings).toEqual(['oligozoospermia', 'asthenozoospermia', 'teratozoospermia', 'hypospermia']);
    expect(r.iui).toBe('unlikely');
    // concentration normal but total count < 39
    expect(classifySemen({ ...semen, volume_ml: 1.5, concentration_m_ml: 20 }).findings).toContain('oligozoospermia');
  });
  it('azoospermia, leukocytes, DFI', () => {
    expect(classifySemen({ ...semen, volume_ml: 3, concentration_m_ml: 0 }).findings).toEqual(['azoospermia']);
    expect(classifySemen({ ...semen, leukocytes_m_ml: 1.5, dna_fragmentation_pct: 35 }).findings).toEqual(['leukocytospermia', 'high_dfi']);
  });
});

describe('ovarian reserve', () => {
  it('AMH / AFC bands', () => {
    expect([0.3, 0.8, 2, 5].map(amhCategory)).toEqual(['very_low', 'low', 'normal', 'high']);
    expect([3, 6, 12, 20].map(afcCategory)).toEqual(['very_low', 'low', 'normal', 'high']);
  });
  it('Bologna criteria and expected response', () => {
    expect(bologna({ ageYears: 41, afc: 5 }).poorResponder).toBe(true);
    expect(bologna({ ageYears: 35, previousPoorResponse: true, amh: 0.9 }).poorResponder).toBe(true);
    expect(bologna({ ageYears: 41, afc: 12, amh: 2 }).poorResponder).toBe(false);
    expect(expectedResponse(5, 10)).toBe('hyper');
    expect(expectedResponse(0.6, null)).toBe('poor');
    expect(expectedResponse(2, 12)).toBe('normal');
  });
});

describe('stimulation monitoring', () => {
  const m = { follicles_right: [] as number[], follicles_left: [] as number[], e2_pmol_l: null, lh_iu_l: null, p4_nmol_l: null, endometrium_mm: null, antagonist: true };
  it('follicle summary', () => {
    expect(follicleSummary([18, 17, 15, 12, 9], [17, 14, 11])).toEqual({ total: 8, ge10: 7, ge11: 7, ge14: 5, ge17: 3, leading: 18 });
  });
  it('trigger readiness and antagonist start', () => {
    expect(codes(stimulationAlerts({ ...m, follicles_right: [18, 17], follicles_left: [17] }, { protocol: 'antagonist' }))).toEqual(['trigger_ready']);
    expect(codes(stimulationAlerts({ ...m, antagonist: false, follicles_right: [14, 12] }, { protocol: 'antagonist' }))).toEqual(['start_antagonist']);
    expect(stimulationAlerts({ ...m, follicles_right: [18, 17, 17] }, { protocol: 'antagonist', triggered: true })).toEqual([]);
  });
  it('OHSS risk by follicle count or E2', () => {
    const many = Array.from({ length: 10 }, () => 12);
    expect(codes(stimulationAlerts({ ...m, follicles_right: many, follicles_left: many.slice(0, 8) }, {}))).toContain('ohss_risk');
    expect(codes(stimulationAlerts({ ...m, e2_pmol_l: 14000 }, {}))).toEqual(['ohss_risk']);
  });
  it('premature LH, progesterone, thin endometrium', () => {
    expect(codes(stimulationAlerts({ ...m, lh_iu_l: 12, p4_nmol_l: 5.2, endometrium_mm: 6, follicles_right: [15] }, { protocol: 'antagonist' })))
      .toEqual(['premature_lh', 'p4_elevated', 'thin_endometrium']);
    expect(stimulationAlerts({ ...m, lh_iu_l: 12 }, { protocol: 'long_agonist' })).toEqual([]);
  });
});

describe('embryology & KPIs', () => {
  const e = { stage: 'blastocyst', day_observed: 5, cell_count: null, fragmentation_grade: null, blast_expansion: 4, icm_grade: 'A', te_grade: 'B' };
  it('grading and quality', () => {
    expect(embryoGrade(e)).toBe('4AB');
    expect(embryoQuality(e)).toBe('good');
    expect(embryoQuality({ ...e, icm_grade: 'B', te_grade: 'B' })).toBe('fair');
    expect(embryoQuality({ ...e, te_grade: 'C' })).toBe('poor');
    const d3 = { stage: 'cleavage', day_observed: 3, cell_count: 8, fragmentation_grade: 1, blast_expansion: null, icm_grade: null, te_grade: null };
    expect(embryoGrade(d3)).toBe('8c F1');
    expect(embryoQuality(d3)).toBe('good');
    expect(embryoQuality({ ...d3, cell_count: 6, fragmentation_grade: 2 })).toBe('fair');
    expect(embryoQuality({ ...d3, cell_count: 4, fragmentation_grade: 3 })).toBe('poor');
  });
  it('Vienna consensus KPIs', () => {
    const k = cycleKpis({ insemination: 'icsi', oocytes: 12, mii: 10, fertilized2pn: 8, blastocysts: 5,
      transfers: [{ embryos_transferred: 1, gestational_sacs: 1, embryo_day: 5 }, { embryos_transferred: 1, gestational_sacs: 0, embryo_day: 5 }] });
    expect(k.miiRate.value).toBe(83.3);
    expect(k.fertilization.value).toBe(80);
    expect(kpiStatus(k.fertilization)).toBe('benchmark');
    expect(k.blastulation.value).toBe(62.5);
    expect(k.implantation.value).toBe(50);
    expect(kpiStatus(k.implantation)).toBe('competent');
    const ivf = cycleKpis({ insemination: 'ivf', oocytes: 10, mii: null, fertilized2pn: 5, blastocysts: 1, transfers: [] });
    expect(ivf.fertilization).toMatchObject({ value: 50, competence: 60 });
    expect(kpiStatus(ivf.fertilization)).toBe('below');
    expect(ivf.implantation.value).toBeNull();
  });
  it('β-hCG due and storage consent', () => {
    expect(betaHcgDue('2026-11-20', 5)).toBe('2026-11-29');
    expect(betaHcgDue('2026-11-20', 3)).toBe('2026-12-01');
    expect(codes(storageAlerts([
      { status: 'frozen', consent_expires_on: '2026-11-01' }, { status: 'frozen', consent_expires_on: '2027-01-15' },
      { status: 'frozen', consent_expires_on: '2030-01-01' }, { status: 'transferred', consent_expires_on: '2026-01-01' },
    ], '2026-11-26'))).toEqual(['storage_consent_expired', 'storage_consent_expiring']);
  });
});

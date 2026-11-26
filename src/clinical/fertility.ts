/**
 * Reproductive medicine decision support — pure functions.
 *
 * Sources / defaults (adapt to local protocol):
 *  - Semen analysis: WHO Laboratory Manual, 6th ed. (2021) lower reference limits (5th
 *    centile): volume 1.4 mL, concentration 16 ×10⁶/mL, total count 39 ×10⁶, total
 *    motility 42 %, progressive 30 %, vitality 54 %, normal forms 4 %. Leukocytospermia
 *    ≥ 1 ×10⁶/mL. DNA fragmentation > 30 % flagged. TMSC (volume × concentration ×
 *    progressive %) < 5 ×10⁶ makes IUI unlikely to succeed (common default).
 *  - Ovarian reserve: AMH (ng/mL) < 0.5 very low · 0.5–1.1 low · 1.1–3.5 normal · > 3.5
 *    high; AFC < 5 very low · 5–7 low · 8–15 normal · ≥ 16 high. Bologna criteria
 *    (ESHRE 2011) for expected poor response.
 *  - Stimulation: trigger when ≥ 3 follicles ≥ 17 mm; OHSS risk with ≥ 18 follicles
 *    ≥ 11 mm or E2 ≥ 12 850 pmol/L (≈ 3 500 pg/mL) — consider GnRH-agonist trigger /
 *    freeze-all (ESHRE 2019 ovarian stimulation guideline); premature LH rise ≥ 10 IU/L;
 *    progesterone > 4.77 nmol/L (1.5 ng/mL) near trigger → consider freeze-all;
 *    endometrium < 7 mm thin.
 *  - Embryology: Gardner blastocyst grading; Istanbul consensus (2011) day-3 grading;
 *    laboratory KPIs vs the Vienna consensus (2017) competence / benchmark values.
 */
import type { ClinicalAlert } from './obstetricRisk';

// ---------------------------------------------------------------------------
// Semen analysis
// ---------------------------------------------------------------------------
export const WHO_2021 = { volume: 1.4, concentration: 16, totalCount: 39, totalMotility: 42, progressive: 30, vitality: 54, normalForms: 4 };

export interface SemenLike {
  volume_ml: number | null; concentration_m_ml: number | null; progressive_pct: number | null; total_motility_pct: number | null;
  normal_forms_pct: number | null; vitality_pct: number | null; leukocytes_m_ml: number | null; dna_fragmentation_pct: number | null;
}

export type SemenFinding = 'azoospermia' | 'oligozoospermia' | 'asthenozoospermia' | 'teratozoospermia' | 'hypospermia'
  | 'low_vitality' | 'leukocytospermia' | 'high_dfi' | 'normozoospermia';

export function classifySemen(s: SemenLike) {
  const total = s.volume_ml != null && s.concentration_m_ml != null ? Math.round(s.volume_ml * s.concentration_m_ml * 10) / 10 : null;
  const tmsc = total != null && s.progressive_pct != null ? Math.round(total * s.progressive_pct) / 100 : null;
  const findings: SemenFinding[] = [];
  if (s.concentration_m_ml === 0) findings.push('azoospermia');
  else {
    if ((s.concentration_m_ml != null && s.concentration_m_ml < WHO_2021.concentration) || (total != null && total < WHO_2021.totalCount)) findings.push('oligozoospermia');
    if ((s.progressive_pct != null && s.progressive_pct < WHO_2021.progressive) || (s.total_motility_pct != null && s.total_motility_pct < WHO_2021.totalMotility)) findings.push('asthenozoospermia');
    if (s.normal_forms_pct != null && s.normal_forms_pct < WHO_2021.normalForms) findings.push('teratozoospermia');
    if (s.vitality_pct != null && s.vitality_pct < WHO_2021.vitality) findings.push('low_vitality');
  }
  if (s.volume_ml != null && s.volume_ml < WHO_2021.volume) findings.push('hypospermia');
  if (s.leukocytes_m_ml != null && s.leukocytes_m_ml >= 1) findings.push('leukocytospermia');
  if (s.dna_fragmentation_pct != null && s.dna_fragmentation_pct > 30) findings.push('high_dfi');
  const measured = [s.volume_ml, s.concentration_m_ml, s.progressive_pct, s.normal_forms_pct].every((v) => v != null);
  if (!findings.length && measured) findings.push('normozoospermia');
  const oat = ['oligozoospermia', 'asthenozoospermia', 'teratozoospermia'].every((f) => findings.includes(f as SemenFinding));
  const iui: 'suitable' | 'borderline' | 'unlikely' | null = tmsc == null ? null : tmsc < 5 ? 'unlikely' : tmsc < 10 ? 'borderline' : 'suitable';
  return { totalCount: total, tmsc, findings, oat, iui };
}

// ---------------------------------------------------------------------------
// Ovarian reserve
// ---------------------------------------------------------------------------
export type ReserveLevel = 'very_low' | 'low' | 'normal' | 'high';
export const amhCategory = (amh: number): ReserveLevel => (amh < 0.5 ? 'very_low' : amh < 1.1 ? 'low' : amh <= 3.5 ? 'normal' : 'high');
export const afcCategory = (afc: number): ReserveLevel => (afc < 5 ? 'very_low' : afc <= 7 ? 'low' : afc <= 15 ? 'normal' : 'high');

export function bologna(input: { ageYears: number; otherRiskFactor?: boolean; previousPoorResponse?: boolean; afc?: number | null; amh?: number | null }) {
  const ageOrRisk = input.ageYears >= 40 || !!input.otherRiskFactor;
  const prior = !!input.previousPoorResponse;
  const ort = (input.afc != null && input.afc < 7) || (input.amh != null && input.amh < 1.1);
  const met = [ageOrRisk, prior, ort].filter(Boolean).length;
  return { ageOrRisk, prior, ort, met, poorResponder: met >= 2 };
}

export function expectedResponse(amh: number | null, afc: number | null): 'poor' | 'normal' | 'hyper' | null {
  if (amh == null && afc == null) return null;
  if ((amh != null && amh > 3.5) || (afc != null && afc >= 16)) return 'hyper';
  if ((amh != null && amh < 1.1) || (afc != null && afc < 7)) return 'poor';
  return 'normal';
}

// ---------------------------------------------------------------------------
// Stimulation monitoring
// ---------------------------------------------------------------------------
export function follicleSummary(right: number[], left: number[]) {
  const all = [...right, ...left];
  const n = (min: number) => all.filter((f) => f >= min).length;
  return { total: all.length, ge10: n(10), ge11: n(11), ge14: n(14), ge17: n(17), leading: all.length ? Math.max(...all) : null };
}

export interface MonitoringLike {
  follicles_right: number[]; follicles_left: number[]; e2_pmol_l: number | null; lh_iu_l: number | null; p4_nmol_l: number | null;
  endometrium_mm: number | null; antagonist: boolean;
}

export const OHSS_FOLLICLES_GE11 = 18;
export const OHSS_E2_PMOL = 12850;

export function stimulationAlerts(m: MonitoringLike, ctx: { protocol?: string | null; triggered?: boolean }): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const f = follicleSummary(m.follicles_right, m.follicles_left);
  if (f.ge11 >= OHSS_FOLLICLES_GE11 || (m.e2_pmol_l != null && m.e2_pmol_l >= OHSS_E2_PMOL)) {
    out.push({ code: 'ohss_risk', severity: 'critical', values: { n: f.ge11, e2: m.e2_pmol_l ?? '—' } });
  }
  if (!ctx.triggered && f.ge17 >= 3) out.push({ code: 'trigger_ready', severity: 'info', values: { n: f.ge17 } });
  if (!ctx.triggered && ctx.protocol === 'antagonist' && !m.antagonist && f.leading != null && f.leading >= 14) {
    out.push({ code: 'start_antagonist', severity: 'warning', values: { size: f.leading } });
  }
  if (!ctx.triggered && m.lh_iu_l != null && m.lh_iu_l >= 10 && ['antagonist', 'ppos', 'mild', 'natural', 'letrozole', 'clomiphene'].includes(ctx.protocol ?? '')) {
    out.push({ code: 'premature_lh', severity: 'warning', values: { lh: m.lh_iu_l } });
  }
  if (m.p4_nmol_l != null && m.p4_nmol_l > 4.77) out.push({ code: 'p4_elevated', severity: 'warning', values: { p4: m.p4_nmol_l } });
  if (m.endometrium_mm != null && m.endometrium_mm < 7 && f.leading != null && f.leading >= 14) {
    out.push({ code: 'thin_endometrium', severity: 'info', values: { mm: m.endometrium_mm } });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Embryology
// ---------------------------------------------------------------------------
export interface EmbryoLike {
  stage: string; day_observed: number | null; cell_count: number | null; fragmentation_grade: number | null;
  blast_expansion: number | null; icm_grade: string | null; te_grade: string | null;
}

export function embryoGrade(e: EmbryoLike): string {
  if (e.stage === 'blastocyst' && e.blast_expansion != null) return `${e.blast_expansion}${e.icm_grade ?? ''}${e.te_grade ?? ''}`;
  if (e.stage === 'cleavage' && e.cell_count != null) return `${e.cell_count}c${e.fragmentation_grade ? ` F${e.fragmentation_grade}` : ''}`;
  return e.stage;
}

export type EmbryoQuality = 'good' | 'fair' | 'poor' | 'ungraded';

export function embryoQuality(e: EmbryoLike): EmbryoQuality {
  if (e.stage === 'arrested') return 'poor';
  if (e.stage === 'blastocyst') {
    if (e.blast_expansion == null || !e.icm_grade || !e.te_grade) return 'ungraded';
    if (e.icm_grade === 'C' || e.te_grade === 'C') return 'poor';
    if (e.blast_expansion >= 3 && (e.icm_grade === 'A' || e.te_grade === 'A')) return 'good';
    return 'fair';
  }
  if (e.stage === 'cleavage' && e.day_observed === 3 && e.cell_count != null && e.fragmentation_grade != null) {
    if (e.cell_count === 8 && e.fragmentation_grade === 1) return 'good';
    if (e.cell_count >= 6 && e.cell_count <= 10 && e.fragmentation_grade <= 2) return 'fair';
    return 'poor';
  }
  return 'ungraded';
}

export interface Kpi { value: number | null; competence: number; benchmark: number }
const pct = (num: number | null | undefined, den: number | null | undefined) => (num == null || !den ? null : Math.round((num / den) * 1000) / 10);

/** Vienna consensus (2017) — competence / benchmark values in %. */
export function cycleKpis(input: {
  insemination: string | null; oocytes: number | null; mii: number | null; fertilized2pn: number | null;
  blastocysts: number; transfers: Array<{ embryos_transferred: number; gestational_sacs: number | null; embryo_day: number }>;
}) {
  const icsi = input.insemination === 'icsi';
  const blastTransfers = input.transfers.filter((t) => t.embryo_day >= 5 && t.gestational_sacs != null);
  const transferred = blastTransfers.reduce((a, t) => a + t.embryos_transferred, 0);
  const sacs = blastTransfers.reduce((a, t) => a + (t.gestational_sacs ?? 0), 0);
  return {
    miiRate: { value: icsi ? pct(input.mii, input.oocytes) : null, competence: 75, benchmark: 90 } as Kpi,
    fertilization: { value: pct(input.fertilized2pn, icsi ? input.mii : input.oocytes), competence: icsi ? 65 : 60, benchmark: icsi ? 80 : 75 } as Kpi,
    blastulation: { value: input.fertilized2pn ? pct(input.blastocysts, input.fertilized2pn) : null, competence: 40, benchmark: 60 } as Kpi,
    implantation: { value: transferred ? pct(sacs, transferred) : null, competence: 35, benchmark: 60 } as Kpi,
  };
}

export const kpiStatus = (k: Kpi): 'benchmark' | 'competent' | 'below' | null =>
  k.value == null ? null : k.value >= k.benchmark ? 'benchmark' : k.value >= k.competence ? 'competent' : 'below';

// ---------------------------------------------------------------------------
// Transfer follow-up
// ---------------------------------------------------------------------------
/** Serum β-hCG ≈ 9 days after a day-5/6 transfer, 11 days after day-2/3 (default). */
export function betaHcgDue(transferOn: string, embryoDay: number): string {
  const d = new Date(`${transferOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + (embryoDay >= 5 ? 9 : 11));
  return d.toISOString().slice(0, 10);
}

export function storageAlerts(embryos: Array<{ status: string; consent_expires_on: string | null }>, today = new Date().toISOString().slice(0, 10)): ClinicalAlert[] {
  const frozen = embryos.filter((e) => e.status === 'frozen' && e.consent_expires_on);
  const expired = frozen.filter((e) => e.consent_expires_on! < today).length;
  const soon = frozen.filter((e) => e.consent_expires_on! >= today && Date.parse(e.consent_expires_on!) - Date.parse(today) <= 90 * 86_400_000).length;
  const out: ClinicalAlert[] = [];
  if (expired) out.push({ code: 'storage_consent_expired', severity: 'critical', values: { n: expired } });
  if (soon) out.push({ code: 'storage_consent_expiring', severity: 'warning', values: { n: soon } });
  return out;
}

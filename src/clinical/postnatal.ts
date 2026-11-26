/**
 * Postnatal alerts — pure functions.
 * Sources: NICE NG194 (Postnatal care) & NG133 (postpartum hypertension ≥ 140/90,
 * severe ≥ 160/110); temperature ≥ 38 °C prompts sepsis assessment; EPDS (Cox 1987):
 * ≥ 13 probable depression, 10–12 possible; any positive self-harm item (Q10) is urgent.
 */
import type { ClinicalAlert } from './obstetricRisk';

export interface PostnatalLike {
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  uterus: string | null;
  lochia: string | null;
  wound: string | null;
  breasts: string | null;
  epds_score: number | null;
  epds_self_harm: boolean | null;
  hemoglobin_g_dl: number | null;
}

export function postnatalAlerts(v: PostnatalLike): ClinicalAlert[] {
  const out: ClinicalAlert[] = [];
  const { bp_systolic: s, bp_diastolic: d } = v;
  if (s != null && d != null) {
    const bp = `${s}/${d}`;
    if (s >= 160 || d >= 110) out.push({ code: 'pn_severe_hypertension', severity: 'critical', values: { bp } });
    else if (s >= 140 || d >= 90) out.push({ code: 'pn_hypertension', severity: 'warning', values: { bp } });
  }
  if (v.epds_self_harm) out.push({ code: 'epds_self_harm', severity: 'critical' });
  if (v.temperature_c != null && v.temperature_c >= 38) out.push({ code: 'pn_fever', severity: 'warning', values: { temp: v.temperature_c } });
  if (v.lochia === 'heavy') out.push({ code: 'pn_heavy_lochia', severity: 'warning' });
  if (v.lochia === 'offensive' || v.uterus === 'tender') out.push({ code: 'pn_endometritis', severity: 'warning' });
  if (v.uterus === 'subinvolution') out.push({ code: 'pn_subinvolution', severity: 'info' });
  if (v.wound === 'infection' || v.wound === 'dehiscence') out.push({ code: 'pn_wound', severity: 'warning' });
  if (v.breasts === 'mastitis') out.push({ code: 'pn_mastitis', severity: 'warning' });
  if (v.epds_score != null && v.epds_score >= 13) out.push({ code: 'epds_probable', severity: 'warning', values: { score: v.epds_score } });
  else if (v.epds_score != null && v.epds_score >= 10) out.push({ code: 'epds_possible', severity: 'info', values: { score: v.epds_score } });
  if (v.hemoglobin_g_dl != null && v.hemoglobin_g_dl < 10) out.push({ code: 'pn_anemia', severity: 'warning', values: { hb: v.hemoglobin_g_dl } });
  return out;
}

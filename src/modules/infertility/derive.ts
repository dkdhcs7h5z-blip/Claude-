import type { FertilityDetail, Patient } from '@/data/types';
import { ageInYears } from '@/clinical/obstetrics';
import { latest } from '@/clinical/labs';
import { sortAlerts, type ClinicalAlert } from '@/clinical/obstetricRisk';
import { afcCategory, amhCategory, bologna, classifySemen, expectedResponse, storageAlerts } from '@/clinical/fertility';

/** Antral follicle count: follicles 2–10 mm on the latest baseline scan (stim day ≤ 2). */
export function antralFollicleCount(d: FertilityDetail): number | null {
  const baseline = [...d.monitoring].reverse().find((m) => m.stim_day == null || m.stim_day <= 2);
  if (!baseline) return null;
  return [...baseline.follicles_right, ...baseline.follicles_left].filter((f) => f >= 2 && f <= 10).length;
}

export function deriveFertility(patient: Pick<Patient, 'date_of_birth'>, d: FertilityDetail) {
  const age = ageInYears(patient.date_of_birth);
  const amh = latest(d.labs, 'amh')?.value ?? null;
  const afc = antralFollicleCount(d);
  const previousPoorResponse = d.cycles.some((c) => c.oocytes_retrieved != null && c.oocytes_retrieved <= 3 && c.retrieval_at);
  const bol = bologna({ ageYears: age, previousPoorResponse, afc, amh });
  const response = expectedResponse(amh, afc);
  const semen = d.semen.at(-1) ?? null;
  const semenResult = semen ? classifySemen(semen) : null;
  const alerts: ClinicalAlert[] = [];
  if (bol.poorResponder) alerts.push({ code: 'poor_responder', severity: 'warning' });
  else if (response === 'hyper') alerts.push({ code: 'hyper_responder', severity: 'warning' });
  if (semenResult?.findings.includes('azoospermia')) alerts.push({ code: 'azoospermia', severity: 'warning' });
  else if (semenResult?.iui === 'unlikely') alerts.push({ code: 'iui_unlikely', severity: 'info', values: { tmsc: semenResult.tmsc ?? '—' } });
  if (d.profile?.tubal_assessment === 'bilateral_blocked' || d.profile?.tubal_assessment === 'hydrosalpinx') alerts.push({ code: 'tubal_blocked', severity: 'info' });
  alerts.push(...storageAlerts(d.embryos));
  return {
    age, amh, afc, bologna: bol, response, semen, semenResult, alerts: sortAlerts(alerts),
    amhLevel: amh != null ? amhCategory(amh) : null, afcLevel: afc != null ? afcCategory(afc) : null,
  };
}

/** "18 17, 15;12" → [18, 17, 15, 12] */
export function parseFollicles(text: string): number[] {
  return text.split(/[\s,;،]+/).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
}

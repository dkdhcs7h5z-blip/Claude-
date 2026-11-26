import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui';
import { LineChart } from '@/components/LineChart';
import type { AntenatalVisit } from '@/data/types';
import { formatGADays } from '@/clinical/obstetrics';

// Reference palette categorical slots 1–2 (validated: CVD ΔE 26.6, normal ΔE 35.2).
const SERIES_1 = '#257de0';
const SERIES_2 = '#f47230';

export function ObstetricCharts({ visits, gaNow, plurality }: { visits: AntenatalVisit[]; gaNow: number | null; plurality: number }) {
  const { t } = useTranslation();
  const withGa = visits.filter((v) => v.ga_days != null);
  const gas = withGa.map((v) => v.ga_days!);
  const x0 = Math.max(0, Math.min(28, ...gas) - 7);
  const x1 = Math.min(294, Math.max(140, (gaNow ?? 0) + 14, ...gas.map((g) => g + 14)));
  const pts = (pick: (v: AntenatalVisit) => number | null) =>
    withGa.flatMap((v) => (pick(v) == null ? [] : [{ x: v.ga_days!, y: pick(v)! }]));
  const common = { xDomain: [x0, x1] as [number, number], formatX: formatGADays, emptyText: t('ob.charts.notEnough') };

  return (
    <Card title={t('ob.charts.title')}>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="xl:col-span-2">
          <LineChart {...common} title={t('ob.charts.bp')} yDomain={[40, 180]}
            series={[
              { key: 'sys', label: t('ob.charts.systolic'), color: SERIES_1, points: pts((v) => v.bp_systolic) },
              { key: 'dia', label: t('ob.charts.diastolic'), color: SERIES_2, points: pts((v) => v.bp_diastolic) },
            ]}
            refLines={[{ y: 140, label: '140' }, { y: 90, label: '90' }]} />
        </div>
        <LineChart {...common} title={t('ob.charts.weight')} formatY={(y) => y.toFixed(0)}
          series={[{ key: 'w', label: t('ob.charts.weight'), color: SERIES_1, points: pts((v) => v.weight_kg) }]} />
        <LineChart {...common} title={t('ob.charts.sfh')} yDomain={[10, 45]}
          series={[{ key: 'sfh', label: t('ob.charts.sfh'), color: SERIES_1, points: pts((v) => v.fundal_height_cm) }]}
          band={plurality === 1 ? { from: Math.max(168, x0), to: Math.min(280, x1), lo: (x) => x / 7 - 2, hi: (x) => x / 7 + 2, label: '±2' } : undefined} />
      </div>
      <p className="mt-2 text-xs text-slate-500">{t('ob.charts.gaAxis')}{plurality === 1 && <> · {t('ob.charts.expected')}</>}</p>
    </Card>
  );
}

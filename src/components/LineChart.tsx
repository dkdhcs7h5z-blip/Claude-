import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';

/**
 * Lightweight SVG line chart for clinical trends (x = gestational age in days).
 * Follows the data-viz mark spec: 2px lines, r=4 markers with a 2px surface ring,
 * recessive grid, legend for ≥ 2 series plus end-of-line direct labels, a
 * crosshair + tooltip on hover/touch, and an optional reference band / lines.
 * Charts are always laid out LTR (time runs left → right) even in Arabic UI.
 */
export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  points: Array<{ x: number; y: number }>;
}

interface Props {
  title: string;
  series: ChartSeries[];
  xDomain: [number, number];
  yDomain?: [number, number];
  refLines?: Array<{ y: number; label: string }>;
  /** expected-range band: y-range as a function of x */
  band?: { from: number; to: number; lo: (x: number) => number; hi: (x: number) => number; label: string };
  formatX: (x: number) => string;
  /** axis tick label (defaults to whole weeks) */
  formatTick?: (x: number) => string;
  formatY?: (y: number) => string;
  height?: number;
  emptyText: string;
}

const M = { top: 12, right: 72, bottom: 26, left: 36 };

function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? raw;
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

export function LineChart({ title, series, xDomain, yDomain, refLines = [], band, formatX, formatTick = (x) => String(Math.round(x / 7)), formatY = String, height = 200, emptyText }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.points);
  const [y0, y1] = useMemo(() => {
    if (yDomain) return yDomain;
    const ys = [...all.map((p) => p.y), ...refLines.map((r) => r.y)];
    if (!ys.length) return [0, 1];
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo) * 0.15 || 2;
    return [Math.floor(lo - pad), Math.ceil(hi + pad)];
  }, [all, refLines, yDomain]);

  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const sx = (x: number) => M.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0] || 1)) * iw;
  const sy = (y: number) => M.top + ih - ((y - y0) / (y1 - y0 || 1)) * ih;

  const xs = [...new Set(all.map((p) => p.x))].sort((a, b) => a - b);
  const yTicks = niceTicks(y0, y1);
  // 4-week ticks, widened to 8 weeks when the plot is narrow (≥ 36px per label)
  const tickStep = iw / ((xDomain[1] - xDomain[0]) / 28) < 36 ? 56 : 28;
  const weekStart = Math.ceil(xDomain[0] / tickStep) * tickStep;
  const xTicks: number[] = [];
  for (let d = weekStart; d <= xDomain[1]; d += tickStep) xTicks.push(d);

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!xs.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    let best = xs[0];
    for (const x of xs) if (Math.abs(sx(x) - px) < Math.abs(sx(best) - px)) best = x;
    setHoverX(best);
  };

  const bandPath = band && (() => {
    const steps = 24;
    const pts: number[] = Array.from({ length: steps + 1 }, (_, i) => band.from + ((band.to - band.from) * i) / steps);
    const top = pts.map((x) => `${sx(x)},${sy(Math.min(y1, band.hi(x)))}`);
    const bot = pts.reverse().map((x) => `${sx(x)},${sy(Math.max(y0, band.lo(x)))}`);
    return `M${top.join('L')}L${bot.join('L')}Z`;
  })();

  const hoverValues = hoverX == null ? [] : series
    .map((s) => ({ s, p: s.points.find((p) => p.x === hoverX) }))
    .filter((v): v is { s: ChartSeries; p: { x: number; y: number } } => !!v.p);

  return (
    <figure className="min-w-0">
      <figcaption className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{title}</span>
        {series.length >= 2 && (
          <span className="flex flex-wrap gap-3 text-xs text-slate-600">
            {series.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div ref={wrap} className="relative" dir="ltr">
        {all.length === 0 ? (
          <div className="flex items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400" style={{ height }}>{emptyText}</div>
        ) : (
          <svg width={width} height={height} role="img" aria-label={title} className="touch-none select-none"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHoverX(null)}>
            {/* grid + y axis */}
            {yTicks.map((t) => (
              <g key={t}>
                <line x1={M.left} x2={M.left + iw} y1={sy(t)} y2={sy(t)} stroke="#eef2f6" />
                <text x={M.left - 6} y={sy(t)} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[10px] tabular-nums">{formatY(t)}</text>
              </g>
            ))}
            {xTicks.map((t) => (
              <text key={t} x={sx(t)} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[10px] tabular-nums">{formatTick(t)}</text>
            ))}
            <line x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} stroke="#cbd5e1" />

            {bandPath && <path d={bandPath} fill="#64748b" fillOpacity={0.1} />}
            {band && (
              <text x={M.left + iw + 6} y={sy(Math.min(y1, band.hi(band.to)))} dy="0.32em" className="fill-slate-400 text-[10px]">{band.label}</text>
            )}
            {refLines.map((r) => (
              <g key={r.label}>
                <line x1={M.left} x2={M.left + iw} y1={sy(r.y)} y2={sy(r.y)} stroke="#94a3b8" strokeDasharray="4 4" />
                <text x={M.left + 4} y={sy(r.y) - 4} className="fill-slate-500 text-[10px]">{r.label}</text>
              </g>
            ))}

            {hoverX != null && <line x1={sx(hoverX)} x2={sx(hoverX)} y1={M.top} y2={M.top + ih} stroke="#94a3b8" />}

            {series.map((s) => {
              const pts = [...s.points].sort((a, b) => a.x - b.x);
              const last = pts[pts.length - 1];
              return (
                <g key={s.key}>
                  <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
                    points={pts.map((p) => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
                  {pts.map((p) => (
                    <circle key={p.x} cx={sx(p.x)} cy={sy(p.y)} r={hoverX === p.x ? 5 : 4} fill={s.color} stroke="#fff" strokeWidth={2} />
                  ))}
                  {series.length >= 2 && last && (
                    <text x={sx(last.x) + 8} y={sy(last.y)} dy="0.32em" className="fill-slate-600 text-[10px] font-medium">{s.label}</text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
        {hoverX != null && hoverValues.length > 0 && (
          <div className="pointer-events-none absolute top-0 z-10 rounded-lg bg-slate-900/90 px-2.5 py-1.5 text-xs text-white shadow-lg"
            style={{ left: Math.min(Math.max(sx(hoverX) + 10, 0), width - 150) }}>
            <p className="mb-0.5 font-medium">{formatX(hoverX)}</p>
            {hoverValues.map(({ s, p }) => (
              <p key={s.key} className="flex items-center gap-1.5 tabular-nums">
                <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label}: {formatY(p.y)}
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

import { tr } from '../i18n';
import { useMemo, type RefObject } from 'react';
import { decimalsFor, niceStep, ticks } from '../lib/labels';
import { markerPath } from '../lib/scene';
import { estimateWidth } from '../lib/richText';
import { computeTrend } from '../lib/trend';
import { useEditor } from '../state/store';
import type { MarkerShape } from '../state/types';
import { RichSvgText } from './RichText';

const INK = '#000000';
const SHAPES: MarkerShape[] = ['circle', 'square', 'triangle', 'diamond', 'invtriangle', 'star'];

function axisTicks(lo: number, hi: number, count: number) {
  const step = niceStep(hi - lo || 1, count);
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const dec = step >= 1 ? 0 : decimalsFor(step);
  return { lo: start, hi: end === start ? start + step : end, list: ticks(start, end, step), dec };
}

/** 推移グラフ。書き出しにもこの SVG をそのまま使う */
export function TrendChart({ svgRef }: { svgRef: RefObject<SVGSVGElement | null> }) {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const result = useMemo(() => computeTrend(doc, data), [doc, data]);
  const t = doc.trend;
  const f = doc.figure;
  const W = t.width;
  const H = t.height;
  const fs = f.tickFontSize + 1;
  const lfs = f.legendFontSize;
  const plot = { x: 62, y: 14, w: W - 62 - 16, h: H - 14 - 50 };

  const points = result.series.map((r) => {
    const k = t.regions.indexOf(r);
    return result.rows.filter((row) => row.values[k] !== null).map((row) => ({ t: row.time, v: row.values[k]! }));
  });
  const times = result.rows.map((r) => r.time);
  const values = points.flat().map((p) => p.v);
  const xt = axisTicks(Math.min(0, ...times), times.length ? Math.max(...times) : 1, Math.max(2, Math.round(plot.w / 70)));
  const yMax = t.normalize === 'sum' ? 100 : values.length ? Math.max(...values) : 1;
  const yMin = values.length ? Math.min(0, ...values) : 0;
  const yt = axisTicks(yMin, yMax, Math.max(2, Math.round(plot.h / 50)));
  // 端の点が枠に重ならないよう、軸の範囲を少し広げる
  const padX = (xt.hi - xt.lo) * 0.04;
  const padY = (yt.hi - yt.lo) * 0.04;
  const px = (v: number) => plot.x + ((v - xt.lo + padX) / (xt.hi - xt.lo + 2 * padX)) * plot.w;
  const py = (v: number) => plot.y + plot.h - ((v - yt.lo + padY) / (yt.hi - yt.lo + 2 * padY)) * plot.h;
  const bottom = plot.y + plot.h;

  const legendW = 26 + Math.max(0, ...result.series.map((r) => estimateWidth(r.name, lfs)));
  const rowH = Math.round(lfs * 1.45);
  const legendH = rowH * result.series.length + 8;
  const legendPos = pickLegendCorner(
    plot,
    legendW + 8,
    legendH,
    points.flatMap((pts) => densify(pts.map((p) => [px(p.t), py(p.v)]))),
  );

  return (
    <svg ref={svgRef} className="figure trend-chart" viewBox={`0 0 ${W} ${H}`}>
      <rect data-ui="bg" x={0} y={0} width={W} height={H} fill="#ffffff" />
      <g fontFamily={f.fontFamily}>
        {f.showBorder && <rect x={0.5} y={0.5} width={W - 1} height={H - 1} fill="none" stroke={INK} strokeWidth={1} />}
        <rect x={plot.x} y={plot.y} width={plot.w} height={plot.h} fill="none" stroke={INK} strokeWidth={1} />
        <path
          d={xt.list.map((v) => `M${px(v).toFixed(1)} ${bottom}v5`).join('') + yt.list.map((v) => `M${plot.x} ${py(v).toFixed(1)}h-5`).join('')}
          stroke={INK}
          strokeWidth={0.8}
        />
        {xt.list.map((v) => (
          <text key={`x${v}`} x={px(v)} y={bottom + 7 + fs} fontSize={fs} textAnchor="middle" fill={INK}>
            {v.toFixed(xt.dec)}
          </text>
        ))}
        {yt.list.map((v) => (
          <text key={`y${v}`} x={plot.x - 8} y={py(v) + fs * 0.35} fontSize={fs} textAnchor="end" fill={INK}>
            {v.toFixed(yt.dec)}
          </text>
        ))}
        <RichSvgText text={result.xLabel} x={plot.x + plot.w / 2} y={H - 10} fontSize={fs + 1} textAnchor="middle" fill={INK} />
        <RichSvgText
          text={result.yLabel}
          transform={`translate(${16} ${plot.y + plot.h / 2}) rotate(-90)`}
          fontSize={fs + 1}
          textAnchor="middle"
          fill={INK}
        />

        {result.series.map((r, i) => (
          <g key={r.id}>
            {points[i].length > 1 && (
              <polyline
                points={points[i].map((p) => `${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ')}
                fill="none"
                stroke={r.color}
                strokeWidth={1.5}
              />
            )}
            {points[i].map((p, j) => (
              <path key={j} d={markerPath(SHAPES[i % SHAPES.length], px(p.t), py(p.v), 9)} fill={r.color} />
            ))}
          </g>
        ))}

        {result.series.length > 0 && (
          <g>
            {result.series.map((r, i) => {
              const x = legendPos.x + 4;
              const cy = legendPos.y + 4 + rowH * (i + 0.5);
              return (
                <g key={r.id}>
                  <line x1={x} y1={cy} x2={x + 18} y2={cy} stroke={r.color} strokeWidth={1.5} />
                  <path d={markerPath(SHAPES[i % SHAPES.length], x + 9, cy, 8)} fill={r.color} />
                  <RichSvgText text={r.name} x={x + 24} y={cy + lfs * 0.35} fontSize={lfs} fill={INK} />
                </g>
              );
            })}
          </g>
        )}
      </g>
      {!result.series.length && (
        <text data-ui="empty" x={W / 2} y={H / 2} textAnchor="middle" fontSize={14} fill="#667085">
          {tr('右の「推移グラフ」で追跡する範囲を追加してください')}
        </text>
      )}
    </svg>
  );
}

type Pt = [number, number];

/** 線分の途中にも点を置く (凡例との重なりを線でも判定するため) */
function densify(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    out.push(pts[i]);
    if (i === pts.length - 1) break;
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
    for (let k = 1; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
  }
  return out;
}

/** 四隅のうち、データと一番重ならない場所に凡例を置く */
function pickLegendCorner(plot: { x: number; y: number; w: number; h: number }, w: number, h: number, pts: Pt[]) {
  const m = 8;
  const corners = [
    { x: plot.x + plot.w - w - m, y: plot.y + m },
    { x: plot.x + m, y: plot.y + m },
    { x: plot.x + plot.w - w - m, y: plot.y + plot.h - h - m },
    { x: plot.x + m, y: plot.y + plot.h - h - m },
  ];
  let best = corners[0];
  let bestCount = Infinity;
  for (const c of corners) {
    const count = pts.filter(([x, y]) => x >= c.x - 6 && x <= c.x + w + 6 && y >= c.y - 6 && y <= c.y + h + 6).length;
    if (count < bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

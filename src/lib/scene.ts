import type { Annotation, Dash, MarkerStyle, NmrDocument } from '../state/types';
import { decimalsFor, niceStep, spreadLabels, ticks } from './labels';
import { cumulative, integralValues } from './integrals';
import {
  captionText,
  citations,
  computeLayout,
  integralLabelLength,
  integralsOnAxis,
  peakLabelLength,
  peakLabelText,
  titleText,
  toPx,
  type LayerGeom,
  type Layout,
} from './layout';
import { estimateWidth } from './richText';
import { maxInRange, ppmAt } from './spectrum';

export interface PlacedPeakLabel {
  id: string;
  text: string;
  color: string;
  /** 引き出し線の頂点 */
  leader: [number, number][];
  /** 文字の基点 (rotate(-90) で描く) */
  tx: number;
  ty: number;
  anchor: 'start' | 'end';
}

export interface PlacedIntegral {
  id: string;
  layerId: string;
  color: string;
  /** 積分曲線 (表示しないときは null) */
  curve: string | null;
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** 軸の下に出すときのかぎ括弧と引き出し線 (折れ線の配列) */
  bracket: [number, number][][] | null;
  text: string;
  tx: number;
  ty: number;
  anchor: 'start' | 'end';
}

export interface PlacedMarker {
  id: string;
  x: number;
  y: number;
  style: MarkerStyle;
}

export interface PlacedLegend {
  x: number;
  y: number;
  w: number;
  h: number;
  rowH: number;
  rows: MarkerStyle[];
}

export interface PlacedAnnotation {
  a: Annotation;
  p1: { px: number; py: number };
  p2: { px: number; py: number };
}

export interface Scene {
  layout: Layout;
  xTicks: { major: { px: number; label: string }[]; minor: number[] };
  yTicks: { py: number; label: string }[] | null;
  peakLabels: PlacedPeakLabel[];
  integrals: PlacedIntegral[];
  markers: PlacedMarker[];
  legend: PlacedLegend | null;
  annotations: PlacedAnnotation[];
  layerLabels: { x: number; y: number; text: string; color: string }[];
  caption: string;
  /** 文献から作ったスペクトルの引用 (必ず図に出す) */
  citations: string[];
  title: string;
}

export function buildScene(doc: NmrDocument, dataMap: Record<string, Float32Array>): Scene {
  const layout = computeLayout(doc, dataMap);
  const f = doc.figure;
  const { plot } = layout;
  const geomById = new Map(layout.layers.map((g) => [g.layer.id, g]));
  const { xMin, xMax } = doc.view;

  // x 軸の目盛り
  const step = niceStep(xMax - xMin, Math.max(2, Math.round(plot.w / 80)));
  // 広い範囲 (13C, 31P) は整数、1H のような狭い範囲は Delta と同じく小数1桁以上
  const dec = step >= 10 ? 0 : decimalsFor(step);
  const major = ticks(xMin, xMax, step).map((v) => ({ px: layout.xToPx(v), label: v.toFixed(dec) }));
  const minor = ticks(xMin, xMax, step / 5).map((v) => layout.xToPx(v));

  // y 軸 (1本だけ、または重ね書きのとき)
  let yTicks: Scene['yTicks'] = null;
  const g0 = layout.layers[0];
  const singleLike = f.mode === 'overlay' || layout.layers.length <= 1;
  if (f.showYAxis && singleLike && g0) {
    const axisUnit = g0.unit / g0.layer.scale;
    const vmax = (g0.baseY - plot.y) / axisUnit;
    const ys = niceStep(vmax, 4);
    const yd = Math.max(0, decimalsFor(ys));
    yTicks = ticks(0, vmax, ys).map((v) => ({ py: g0.baseY - v * axisUnit, label: v.toFixed(yd) }));
  }

  const inView = (g: LayerGeom, ppm: number) => {
    const d = ppm + g.meta.refOffset;
    return d >= xMin && d <= xMax;
  };
  /** その ppm でのスペクトルの頂点の y (px)。隣の大きなピークを拾わないよう、ごく狭い範囲で探す */
  const peakTopY = (g: LayerGeom, ppm: number) => {
    const d = ppm + g.meta.refOffset;
    const step = Math.abs(g.meta.last - g.meta.first) / (g.meta.n - 1);
    const half = Math.max(step * 1.5, (0.5 * (xMax - xMin)) / plot.w);
    const v = maxInRange(g.data, g.meta, d - half, d + half) / g.meta.maxAbs;
    return Math.max(plot.y, g.baseY - v * g.unit);
  };

  // ピーク値ラベル
  const fs = f.peakLabelFontSize;
  const gap = fs * 1.05;
  const multiColor = layout.layers.length > 1;
  const visibleLabels = doc.peakLabels
    .map((p) => ({ p, g: geomById.get(p.layerId) }))
    .filter((x): x is { p: (typeof doc.peakLabels)[number]; g: LayerGeom } => !!x.g && inView(x.g, x.p.ppm));
  const peakLabels: PlacedPeakLabel[] = [];
  // 「軸の下」でも、積み重ねたときに軸の下へ出すのは一番下のスペクトルだけ。ほかはピークの上に出す
  const stacked = f.mode === 'stack' && layout.layers.length > 1;
  const bottomLayer = layout.layers[layout.layers.length - 1];
  const onAxis = (g: LayerGeom) => f.peakLabelPlacement === 'axis' && (!stacked || g === bottomLayer);
  if (layout.peakBand) {
    const top = layout.peakBand.top;
    const axisLabels = visibleLabels.filter(({ g }) => onAxis(g));
    const pxs = axisLabels.map(({ p, g }) => layout.xToPx(p.ppm + g.meta.refOffset));
    const lxs = spreadLabels(pxs, gap, plot.x + gap / 2, plot.x + plot.w - gap / 2);
    axisLabels.forEach(({ p, g }, k) => {
      peakLabels.push({
        id: p.id,
        text: peakLabelText(p.ppm + g.meta.refOffset, f.peakLabelDecimals),
        color: multiColor && !stacked ? g.layer.color : '#000000',
        leader: [
          [pxs[k], top],
          [pxs[k], top + 4],
          [lxs[k], top + 12],
          [lxs[k], top + 16],
        ],
        tx: lxs[k],
        ty: top + 19,
        anchor: 'end',
      });
    });
  }
  const textLen = peakLabelLength(f);
  for (const g of layout.layers) {
    if (onAxis(g)) continue;
    const mine = visibleLabels.filter((x) => x.g === g);
    if (!mine.length) continue;
    const pxs = mine.map(({ p }) => layout.xToPx(p.ppm + g.meta.refOffset));
    const tops = mine.map(({ p }) => peakTopY(g, p.ppm));
    const lxs = spreadLabels(pxs, gap, plot.x + gap / 2, plot.x + plot.w - gap / 2);
    const minTop = Math.max(plot.y, g.bandTop) + textLen + 16;
    const bandBottom = Math.max(minTop, Math.min(...tops) - 10);
    mine.forEach(({ p }, k) => {
      peakLabels.push({
        id: p.id,
        text: peakLabelText(p.ppm + g.meta.refOffset, f.peakLabelDecimals),
        color: multiColor && !stacked ? g.layer.color : '#000000',
        leader: [
          [pxs[k], Math.max(tops[k] - 3, bandBottom)],
          [pxs[k], bandBottom],
          [lxs[k], bandBottom - 8],
          [lxs[k], bandBottom - 12],
        ],
        tx: lxs[k],
        ty: bandBottom - 15,
        anchor: 'start',
      });
    });
  }

  const integrals = placeIntegrals(doc, dataMap, layout);

  // マーカー。同じピークに複数付いたら上に積む
  const styleById = new Map(doc.markerStyles.map((s) => [s.id, s]));
  const markers: PlacedMarker[] = [];
  const stackCount = new Map<string, number>();
  const size = f.markerSize;
  for (const m of doc.markers) {
    const g = geomById.get(m.layerId);
    const style = styleById.get(m.styleId);
    if (!g || !style || !inView(g, m.ppm)) continue;
    const x = layout.xToPx(m.ppm + g.meta.refOffset);
    const key = `${g.layer.id}:${Math.round(x / size)}`;
    const k = stackCount.get(key) ?? 0;
    stackCount.set(key, k + 1);
    const y = Math.max(plot.y + size / 2 + 1, peakTopY(g, m.ppm) - size / 2 - 4 - k * (size + 2));
    markers.push({ id: m.id, x, y, style });
  }

  // 凡例: 表示中のスペクトルで使っている種類だけ
  let legend: PlacedLegend | null = null;
  // 名前を入れていない種類 (色だけのマーカー) は凡例に出さない
  const usedStyles = doc.markerStyles.filter((s) => s.name && doc.markers.some((m) => m.styleId === s.id && geomById.has(m.layerId)));
  if (f.showLegend && usedStyles.length) {
    const lfs = f.legendFontSize;
    const rowH = Math.round(lfs * 1.45);
    const w = size + 8 + Math.max(...usedStyles.map((s) => estimateWidth(s.name, lfs))) + 6;
    const h = rowH * usedStyles.length + 4;
    const x = f.legendPos ? plot.x + f.legendPos.x * plot.w : plot.x + plot.w - w - 10;
    const y = f.legendPos ? plot.y + f.legendPos.y * plot.h : plot.y + 8;
    legend = { x, y, w, h, rowH, rows: usedStyles };
  }

  const annotations: PlacedAnnotation[] = [];
  for (const a of doc.annotations) {
    const g = geomById.get(a.layerId);
    if (!g) continue;
    annotations.push({ a, p1: toPx(g, layout, a.x1, a.y1), p2: toPx(g, layout, a.x2, a.y2) });
  }

  const layerLabels =
    f.showLayerLabels && layout.layers.length > 1 && f.mode === 'stack'
      ? layout.layers
          .filter((g) => g.layer.label)
          .map((g) => ({ x: plot.x + 8, y: g.baseY - 6, text: g.layer.label, color: g.layer.color }))
      : [];

  return {
    layout,
    xTicks: { major, minor },
    yTicks,
    peakLabels,
    integrals,
    markers,
    legend,
    annotations,
    layerLabels,
    caption: captionText(doc),
    citations: citations(doc),
    title: titleText(doc),
  };
}

/** 注釈の枠 (px)。テキストは文字幅から概算 */
export function annotationBox(pa: PlacedAnnotation) {
  const { a, p1, p2 } = pa;
  if (a.kind === 'text') {
    const lines = a.text.split('\n');
    const w = Math.max(10, ...lines.map((l) => estimateWidth(l, a.fontSize)));
    const lh = a.fontSize * 1.25;
    return { x: p1.px, y: p1.py - a.fontSize, w, h: lh * (lines.length - 1) + a.fontSize * 1.2 };
  }
  const x = Math.min(p1.px, p2.px);
  const y = Math.min(p1.py, p2.py);
  return { x, y, w: Math.abs(p2.px - p1.px), h: Math.abs(p2.py - p1.py) };
}

export function arrowHead(x1: number, y1: number, x2: number, y2: number, strokeWidth: number): string {
  const len = 6 + strokeWidth * 2.5;
  const half = len * 0.45;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const bx = x2 - len * Math.cos(ang);
  const by = y2 - len * Math.sin(ang);
  const nx = -Math.sin(ang) * half;
  const ny = Math.cos(ang) * half;
  const r = (v: number) => Math.round(v * 10) / 10;
  return `${r(x2)},${r(y2)} ${r(bx + nx)},${r(by + ny)} ${r(bx - nx)},${r(by - ny)}`;
}

export function markerPath(shape: MarkerStyle['shape'], x: number, y: number, size: number): string {
  const r = size / 2;
  const pts = (list: [number, number][]) => 'M' + list.map(([px, py]) => `${(x + px).toFixed(1)} ${(y + py).toFixed(1)}`).join('L') + 'Z';
  switch (shape) {
    case 'circle':
      return `M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
    case 'square':
      return pts([
        [-r * 0.85, -r * 0.85],
        [r * 0.85, -r * 0.85],
        [r * 0.85, r * 0.85],
        [-r * 0.85, r * 0.85],
      ]);
    case 'triangle':
      return pts([
        [0, -r * 1.1],
        [r, r * 0.75],
        [-r, r * 0.75],
      ]);
    case 'invtriangle':
      return pts([
        [0, r * 1.1],
        [r, -r * 0.75],
        [-r, -r * 0.75],
      ]);
    case 'diamond':
      return pts([
        [0, -r * 1.15],
        [r * 0.9, 0],
        [0, r * 1.15],
        [-r * 0.9, 0],
      ]);
    case 'star': {
      const list: [number, number][] = [];
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 ? r * 0.45 : r * 1.15;
        const ang = -Math.PI / 2 + (k * Math.PI) / 5;
        list.push([rr * Math.cos(ang), rr * Math.sin(ang)]);
      }
      return pts(list);
    }
  }
}

export function dashArray(dash: Dash, w: number): string | undefined {
  if (dash === 'dashed') return `${6 * Math.max(1, w * 0.7)} ${4 * Math.max(1, w * 0.7)}`;
  if (dash === 'dotted') return `${Math.max(1, w)} ${2.5 * Math.max(1, w)}`;
  return undefined;
}

/** 積分曲線と値の位置 */
function placeIntegrals(doc: NmrDocument, dataMap: Record<string, Float32Array>, layout: Layout): PlacedIntegral[] {
  const f = doc.figure;
  const { plot } = layout;
  const { xMin, xMax } = doc.view;
  const { values, areas } = integralValues(doc, dataMap);
  const ids = layout.layers.map((g) => g.layer.id);
  const fs = f.integralFontSize;
  const out: PlacedIntegral[] = [];
  const axisItems: { item: PlacedIntegral; left: number; right: number }[] = [];
  const clampX = (x: number) => Math.min(plot.x + plot.w, Math.max(plot.x, x));
  const clampY = (y: number) => Math.min(plot.y + plot.h, Math.max(plot.y, y));

  for (const g of layout.layers) {
    const mine = doc.integrals.filter((x) => x.layerId === g.layer.id);
    if (!mine.length) continue;
    const maxArea = Math.max(...mine.map((x) => Math.abs(areas.get(x.id) ?? 0))) || 1;
    const bandH = g.baseY - g.bandTop;
    const onAxis = integralsOnAxis(f, ids, g.layer.id);
    for (const x of mine) {
      const lo = Math.min(x.from, x.to) + g.meta.refOffset;
      const hi = Math.max(x.from, x.to) + g.meta.refOffset;
      if (hi < xMin || lo > xMax) continue;
      const pts = cumulative(g.data, g.meta, x.from, x.to, 240, f.integralBaseline !== false);
      const total = pts[pts.length - 1]?.value ?? 0;
      const height = (Math.abs(total) / maxArea) * f.integralHeight * bandH;
      const base = g.baseY - 3;
      const xy = pts.map((p) => ({
        x: clampX(layout.xToPx(ppmAt(g.meta, p.i))),
        y: clampY(base - (total ? p.value / total : 0) * height),
      }));
      const start = xy[0];
      const end = xy[xy.length - 1];
      const item: PlacedIntegral = {
        id: x.id,
        layerId: g.layer.id,
        color: f.integralColor,
        curve: f.showIntegralCurves ? 'M' + xy.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('L') : null,
        start,
        end,
        bracket: null,
        text: (values.get(x.id) ?? 0).toFixed(f.integralDecimals),
        tx: 0,
        ty: 0,
        anchor: 'start',
      };
      if (onAxis) {
        axisItems.push({ item, left: clampX(layout.xToPx(hi)), right: clampX(layout.xToPx(lo)) });
      } else {
        // 曲線の右上に縦書き (Delta と同じ)。上にはみ出すときは下げる
        const len = integralLabelLength(f);
        const top = f.showIntegralCurves ? end.y : base;
        item.tx = end.x + 2;
        item.ty = Math.max(plot.y + len + 2, top - 4);
      }
      out.push(item);
    }
  }

  const band = layout.integralBand;
  if (band && axisItems.length) {
    const gap = fs * 1.05;
    const lxs = spreadLabels(
      axisItems.map((a) => (a.left + a.right) / 2),
      gap,
      plot.x + gap / 2,
      plot.x + plot.w - gap / 2,
    );
    axisItems.forEach(({ item, left, right }, k) => {
      const t = band.top;
      const center = (left + right) / 2;
      item.bracket = [
        [
          [left, t],
          [left, t + 5],
          [right, t + 5],
          [right, t],
        ],
        [
          [center, t + 5],
          [lxs[k], t + 11],
          [lxs[k], t + 13],
        ],
      ];
      item.tx = lxs[k];
      item.ty = t + 15;
      item.anchor = 'end';
    });
  }
  return out;
}

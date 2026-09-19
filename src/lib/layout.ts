import type { FigureStyle, Layer, NmrDocument, SpectrumMeta } from '../state/types';
import { nucleusRich } from './nuclei';
import { solventInfo } from './solvents';
import { indexAt, maxInRange } from './spectrum';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayerGeom {
  layer: Layer;
  meta: SpectrumMeta;
  data: Float32Array;
  /** ベースラインの y (px) */
  baseY: number;
  /** 正規化強度 1.0 あたりの px */
  unit: number;
  /** 積み重ねのときにこのスペクトルが使う帯の上端 */
  bandTop: number;
}

export interface Layout {
  width: number;
  height: number;
  plot: Rect;
  /** x 軸の目盛りラベルの下端 */
  tickLabelBottom: number;
  /** 軸の下に積分値を並べる帯 */
  integralBand: { top: number; height: number } | null;
  /** 軸の下にピーク値を並べる帯 */
  peakBand: { top: number; height: number } | null;
  captionY: number;
  titleY: number;
  /** 文献の引用を出す y (1行目) */
  citationY: number;
  layers: LayerGeom[];
  xToPx: (ppm: number) => number;
  pxToX: (px: number) => number;
}

const TOP = 14;
const RIGHT = 16;

export function peakLabelText(ppm: number, decimals: number) {
  return ppm.toFixed(decimals);
}

/** 縦書きのピーク値ラベルの長さ (px) の概算 */
export function peakLabelLength(f: { peakLabelDecimals: number; peakLabelFontSize: number }) {
  return (f.peakLabelDecimals + 3) * f.peakLabelFontSize * 0.52;
}

export function integralLabelLength(f: { integralDecimals: number; integralFontSize: number }) {
  return (f.integralDecimals + 3) * f.integralFontSize * 0.52;
}

/** 積分値を軸の下に出すスペクトルか (積み重ねのときは一番下だけ) */
export function integralsOnAxis(f: FigureStyle, layerIds: string[], layerId: string) {
  return f.integralPlacement === 'axis' && (f.mode !== 'stack' || layerIds.length <= 1 || layerIds[layerIds.length - 1] === layerId);
}

export function computeLayout(doc: NmrDocument, dataMap: Record<string, Float32Array>): Layout {
  const f = doc.figure;
  const { xMax, xMin, yZoom } = doc.view;
  const visible = visibleLayers(doc, dataMap);
  const singleLike = f.mode === 'overlay' || visible.length <= 1;

  const left = f.showYAxis && singleLike ? 56 : 16;
  const tickBlock = 6 + f.tickFontSize + 4;
  // 積み重ねのときは一番下のスペクトルのラベルだけが軸の下に入る
  const axisLayers = f.mode === 'stack' && visible.length > 1 ? visible.slice(-1) : visible;
  const hasAxisLabels = f.peakLabelPlacement === 'axis' && doc.peakLabels.some((p) => axisLayers.some((v) => v.layer.id === p.layerId));
  const peakBandHeight = hasAxisLabels ? 22 + peakLabelLength(f) : 0;
  const visibleIds = visible.map((v) => v.layer.id);
  const hasAxisIntegrals = doc.integrals.some((x) => visibleIds.includes(x.layerId) && integralsOnAxis(f, visibleIds, x.layerId));
  const integralBandHeight = hasAxisIntegrals ? 20 + integralLabelLength(f) : 0;
  const captionBlock = f.showXCaption ? 14 : 0;
  const titleBlock = f.showTitle && titleText(doc) ? f.titleFontSize + 12 : 0;
  // 文献から作ったスペクトルがあれば、引用の行を必ず入れる (消せない)
  const citationBlock = citations(doc).length * 11;
  const bottom = tickBlock + integralBandHeight + peakBandHeight + captionBlock + titleBlock + citationBlock + 6;

  const plot: Rect = { x: left, y: TOP, w: f.width - left - RIGHT, h: Math.max(40, f.height - TOP - bottom) };
  const plotBottom = plot.y + plot.h;
  const tickLabelBottom = plotBottom + tickBlock;
  const span = xMax - xMin || 1;
  const xToPx = (ppm: number) => plot.x + ((xMax - ppm) / span) * plot.w;
  const pxToX = (px: number) => xMax - ((px - plot.x) / plot.w) * span;

  const pad = plot.h * 0.04;
  const usable = plot.h - 2 * pad;
  const n = visible.length;
  // ピークの上にラベルを出すスペクトルは、その分だけ低く描いて場所を空ける
  const headroom = peakLabelLength(f) + 24;
  const hasTopLabels = (layerId: string) =>
    (f.peakLabelPlacement === 'top' || !axisLayers.some((v) => v.layer.id === layerId)) && doc.peakLabels.some((p) => p.layerId === layerId);
  const shrink = (height: number, layerId: string) => (hasTopLabels(layerId) ? Math.max(height - headroom, height * 0.3) : height);
  const layers: LayerGeom[] = visible.map((v, k) => {
    if (f.mode === 'overlay' || n <= 1) {
      return { ...v, baseY: plotBottom - pad, unit: shrink(usable, v.layer.id) * yZoom * v.layer.scale, bandTop: plot.y };
    }
    const band = usable / n;
    const baseY = plotBottom - pad - (n - 1 - k) * band;
    return { ...v, baseY, unit: shrink(band, v.layer.id) * yZoom * v.layer.scale, bandTop: baseY - band };
  });

  const integralBand = hasAxisIntegrals ? { top: tickLabelBottom + 2, height: integralBandHeight } : null;
  const peakBand = hasAxisLabels ? { top: tickLabelBottom + integralBandHeight + 2, height: peakBandHeight } : null;
  const captionY = tickLabelBottom + integralBandHeight + peakBandHeight + (captionBlock ? 11 : 0);
  const titleY = captionY + (titleBlock ? f.titleFontSize + 6 : 0);
  const citationY = titleY + 12;
  return { width: f.width, height: f.height, plot, tickLabelBottom, integralBand, peakBand, captionY, titleY, citationY, layers, xToPx, pxToX };
}

/** 図に出す引用 (文献から作ったスペクトルのぶん。表示中のものだけ) */
export function citations(doc: NmrDocument): string[] {
  const list: string[] = [];
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
    const citation = meta?.simulated?.citation;
    if (citation && !list.includes(citation)) list.push(citation);
  }
  return list;
}

export function visibleLayers(doc: NmrDocument, dataMap: Record<string, Float32Array>) {
  const out: { layer: Layer; meta: SpectrumMeta; data: Float32Array }[] = [];
  for (const layer of doc.layers) {
    if (!layer.visible) continue;
    const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
    const data = dataMap[layer.spectrumId];
    if (meta && data) out.push({ layer, meta, data });
  }
  return out;
}

/** 表示範囲の一番高いピークが帯に収まる yZoom */
export function autoYZoom(doc: NmrDocument, dataMap: Record<string, Float32Array>): number {
  let m = 0;
  for (const { layer, meta, data } of visibleLayers(doc, dataMap)) {
    m = Math.max(m, (maxInRange(data, meta, doc.view.xMin, doc.view.xMax) / meta.maxAbs) * layer.scale);
  }
  return m > 0 ? 0.95 / m : 1;
}

/** 図のタイトル。自動のときは一番下のスペクトルから作る */
export function titleText(doc: NmrDocument): string {
  if (!doc.figure.titleAuto) return doc.figure.title;
  const bottom = [...doc.layers].reverse().find((l) => l.visible);
  const meta = bottom && doc.spectra.find((s) => s.id === bottom.spectrumId);
  if (!meta) return '';
  return autoTitle(meta);
}

export function autoTitle(meta: SpectrumMeta): string {
  const dec = meta.decoupled && meta.decoupled !== meta.nucleus ? `{${nucleusRich(meta.decoupled)}}` : '';
  const nuc = nucleusRich(meta.nucleus) + dec;
  const solvent = solventInfo(meta.solvent)?.label ?? meta.solventRaw;
  const parts = [`${Math.round(meta.freqMHz)} MHz`];
  if (solvent) parts.push(solvent);
  return `${nuc} NMR (${parts.join(', ')})`;
}

/** 画面上の点 (px) に一番関係の深いスペクトル */
export function layerAt(layout: Layout, px: number, py: number): LayerGeom | null {
  const ls = layout.layers;
  if (!ls.length) return null;
  const stacked = ls.length > 1 && ls[0].baseY !== ls[ls.length - 1].baseY;
  if (stacked) {
    for (const g of ls) if (py >= g.bandTop && py <= g.baseY + 4) return g;
    return py < ls[0].bandTop ? ls[0] : ls[ls.length - 1];
  }
  // 重ね書き: その x での線が一番近いもの
  let best = ls[0];
  let bestD = Infinity;
  for (const g of ls) {
    const i = Math.round(indexAt(g.meta, layout.pxToX(px)));
    const v = i >= 0 && i < g.data.length ? g.data[i] / g.meta.maxAbs : 0;
    const d = Math.abs(g.baseY - v * g.unit - py);
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return best;
}

export function toPx(g: LayerGeom, layout: Layout, x: number, y: number) {
  return { px: layout.xToPx(x + g.meta.refOffset), py: g.baseY - y * g.unit };
}

export function toData(g: LayerGeom, layout: Layout, px: number, py: number) {
  return { x: layout.pxToX(px) - g.meta.refOffset, y: (g.baseY - py) / g.unit };
}

export function captionText(doc: NmrDocument): string {
  const bottom = [...doc.layers].reverse().find((l) => l.visible);
  const meta = bottom && doc.spectra.find((s) => s.id === bottom.spectrumId);
  return `X : parts per Million : ${meta?.axisName ?? ''}`;
}

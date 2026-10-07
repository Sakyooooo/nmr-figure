/** 2D の図 (等高線) を組み立てる。1D の scene.ts と同じく、描画に必要なものだけを返す */
import { contourLevels, contourPath, projections, sampleGrid, type ContourGrid, type View2d } from './contour';
import type { Spectrum2dData } from './fid2d';
import { decimalsFor, niceStep, ticks } from './labels';
import { nucleusRich } from './nuclei';
import { solventInfo } from './solvents';
import type { NmrDocument, Plot2d, Side1d, Side2d, Spectrum2dMeta } from '../state/types';
import { experimentLabel2d } from './jdf2d';
import type { Rect } from './layout';
import { indexRange, ppmAt } from './spectrum';
import { atomMarkerPos, imageAnchorToPx, imageRect, placeLegend, type PlacedAnnotation, type PlacedLegend, type PlacedMarker } from './scene';

export interface Layout2d {
  width: number;
  height: number;
  plot: Rect;
  /** 上の投影の帯 (なければ null) */
  topBand: Rect | null;
  /** 右の投影の帯 */
  rightBand: Rect | null;
  captionY: number;
  titleY: number;
  xToPx: (ppm: number) => number;
  yToPx: (ppm: number) => number;
  pxToX: (px: number) => number;
  pxToY: (py: number) => number;
}

/** 上・右の帯の線 */
export interface SideTrace {
  path: string;
  /** 軸に沿って 1 px ごとの、いちばん高い所の高さ (px)。0 番目 = 帯の左端 (上の帯) / 上端 (右の帯)。マーカーを山の上に置く・クリックした所の山を探すのに使う */
  levels: Float32Array;
}

export interface Scene2d {
  layout: Layout2d;
  meta: Spectrum2dMeta;
  plot: Plot2d;
  /** 等高線 (低い方から) */
  contours: { level: number; d: string }[];
  /** 線が多すぎて描けなかった (雑音ばかりのとき) */
  tooDense: boolean;
  xTicks: { px: number; label: string }[];
  yTicks: { py: number; label: string }[];
  diagonal: { x1: number; y1: number; x2: number; y2: number } | null;
  topPath: string;
  rightPath: string;
  /** 上・右の帯の線 (読み込んだ 1D か、2D の投影)。帯を出さないときは null */
  top: SideTrace | null;
  right: SideTrace | null;
  caption: string;
  title: string;
  /** 図形・文字・交点の線 (2D に置いたもの。x, y は F2・F1 の ppm) */
  annotations: PlacedAnnotation[];
  /** マーカー (クロスピークと、構造式の原子に付けたもの) と凡例 */
  markers: PlacedMarker[];
  legend: PlacedLegend | null;
}

const TOP = 14;
const RIGHT = 16;
const BAND = 44;

export function layout2d(doc: NmrDocument, plot2d: Plot2d): Layout2d {
  const f = doc.figure;
  const left = 56;
  const tickBlock = 6 + f.tickFontSize + 4;
  const captionBlock = f.showXCaption ? 14 : 0;
  const titleBlock = f.showTitle && title2d(doc) ? f.titleFontSize + 12 : 0;
  const bottom = tickBlock + captionBlock + titleBlock + 6;
  const band = plot2d.showProjections ? BAND : 0;
  const room = sideRoom(doc, plot2d);
  const plot: Rect = {
    x: left,
    y: TOP + room.top + band,
    w: Math.max(40, f.width - left - RIGHT - room.right - band),
    h: Math.max(40, f.height - TOP - room.top - band - bottom),
  };
  const v = plot2d.view;
  const xToPx = (ppm: number) => plot.x + ((v.xMax - ppm) / (v.xMax - v.xMin || 1)) * plot.w;
  const pxToX = (px: number) => v.xMax - ((px - plot.x) / plot.w) * (v.xMax - v.xMin);
  const yToPx = (ppm: number) => plot.y + ((v.yMax - ppm) / (v.yMax - v.yMin || 1)) * plot.h;
  const pxToY = (py: number) => v.yMax - ((py - plot.y) / plot.h) * (v.yMax - v.yMin);
  const tickLabelBottom = plot.y + plot.h + tickBlock;
  return {
    width: f.width,
    height: f.height,
    plot,
    topBand: band ? { x: plot.x, y: TOP + room.top, w: plot.w, h: band - 6 } : null,
    rightBand: band ? { x: plot.x + plot.w + 6, y: plot.y, w: band - 6, h: plot.h } : null,
    captionY: tickLabelBottom + (captionBlock ? 11 : 0),
    titleY: tickLabelBottom + (captionBlock ? 11 : 0) + (titleBlock ? f.titleFontSize + 6 : 0),
    xToPx,
    yToPx,
    pxToX,
    pxToY,
  };
}

/** 上・右のスペクトルにマーカーがあれば、山の上 (右の帯は山の右) にマーカーの入る分だけ空ける */
function sideRoom(doc: NmrDocument, plot2d: Plot2d) {
  const has = (side: Side2d) => plot2d.showProjections && doc.markers.some((m) => m.side === side && m.space === '2d' && m.layerId === plot2d.spectrumId);
  const room = doc.figure.markerSize + 4;
  return { top: has('top') ? room : 0, right: has('right') ? room : 0 };
}

/** プロットの中身が正方形になる図の高さ (対角線が 45° になる) */
export function squareHeight(doc: NmrDocument, plot2d: Plot2d): number {
  const f = doc.figure;
  const band = plot2d.showProjections ? BAND : 0;
  const room = sideRoom(doc, plot2d);
  const tickBlock = 6 + f.tickFontSize + 4;
  const captionBlock = f.showXCaption ? 14 : 0;
  const titleBlock = f.showTitle && title2d(doc) ? f.titleFontSize + 12 : 0;
  const plotW = f.width - 56 - RIGHT - room.right - band;
  return Math.round(plotW + TOP + room.top + band + tickBlock + captionBlock + titleBlock + 6);
}

/** data1d は上・右に読み込んだ 1D のデータ (doc.spectra の id → 値) */
export function buildScene2d(doc: NmrDocument, data: Spectrum2dData | undefined, data1d: Record<string, Float32Array> = {}): Scene2d | null {
  const plot2d = doc.plot2d;
  const meta = plot2d && doc.spectra2d.find((s) => s.id === plot2d.spectrumId);
  if (!plot2d || !meta || !data) return null;
  const layout = layout2d(doc, plot2d);
  const { plot } = layout;
  const view = plot2d.view;

  // 画面の細かさに合わせて格子を作る (1px あたり 1.5 点くらい)
  const grid = sampleGrid(data, view, Math.round(plot.w * 1.5), Math.round(plot.h * 1.5));
  const levels = contourLevels(meta.maxAbs, plot2d.base, plot2d.levels, plot2d.factor);
  const toPx = (x: number, y: number): [number, number] => [layout.xToPx(x), layout.yToPx(y)];
  const drawn = levels.map((level) => ({ level, ...contourPath(grid, level, toPx) }));
  const contours = drawn.filter((c) => !c.truncated);
  const tooDense = drawn.some((c) => c.truncated);

  const xStep = niceStep(view.xMax - view.xMin, Math.max(2, Math.round(plot.w / 80)));
  const yStep = niceStep(view.yMax - view.yMin, Math.max(2, Math.round(plot.h / 60)));
  const xTicks = ticks(view.xMin, view.xMax, xStep).map((v) => ({
    px: layout.xToPx(v),
    label: v.toFixed(xStep >= 10 ? 0 : decimalsFor(xStep)),
  }));
  const yTicks = ticks(view.yMin, view.yMax, yStep).map((v) => ({
    py: layout.yToPx(v),
    label: v.toFixed(yStep >= 10 ? 0 : decimalsFor(yStep)),
  }));

  const diagonal =
    plot2d.showDiagonal && meta.x.nucleus === meta.y.nucleus
      ? (() => {
          const lo = Math.max(view.xMin, view.yMin);
          const hi = Math.min(view.xMax, view.yMax);
          return hi > lo ? { x1: layout.xToPx(hi), y1: layout.yToPx(hi), x2: layout.xToPx(lo), y2: layout.yToPx(lo) } : null;
        })()
      : null;

  // 上・右の帯: 読み込んだ 1D があればそれ、無ければ 2D の投影
  let top: SideTrace | null = null;
  let right: SideTrace | null = null;
  if (layout.topBand && layout.rightBand) {
    let proj: ReturnType<typeof projections> | null = null;
    const projection = () => (proj ??= projections(grid));
    top = side1dTrace(doc, plot2d.top, data1d, layout.topBand, 'x', view.xMin, view.xMax, layout) ?? projectionTrace(projection().top, layout.topBand, 'x', grid, layout);
    right = side1dTrace(doc, plot2d.right, data1d, layout.rightBand, 'y', view.yMin, view.yMax, layout) ?? projectionTrace(projection().right, layout.rightBand, 'y', grid, layout);
  }

  // マーカー: 構造式の原子 (帰属。1D の図と同じ) と、この 2D のクロスピーク (山の右上に少し離して置く。等高線に重ねない)
  const styleById = new Map(doc.markerStyles.map((s) => [s.id, s]));
  const size = doc.figure.markerSize;
  const markers: PlacedMarker[] = [];
  for (const m of doc.markers) {
    const style = styleById.get(m.styleId);
    if (!style) continue;
    const dx = m.dx ?? 0;
    const dy = m.dy ?? 0;
    if (m.imageId) {
      const image = doc.figureImages.find((x) => x.id === m.imageId);
      const pos = image && m.atomId ? atomMarkerPos(image, m.atomId, layout, size) : null;
      if (pos) markers.push({ id: m.id, x: pos.x + dx, y: pos.y + dy, style, imageId: m.imageId });
      continue;
    }
    if (m.space !== '2d' || m.layerId !== meta.id || m.ppm1 === undefined) continue;
    const px = layout.xToPx(m.ppm);
    const py = layout.yToPx(m.ppm1);
    if (px < plot.x || px > plot.x + plot.w || py < plot.y || py > plot.y + plot.h) continue;
    markers.push({ id: m.id, x: px + size * 0.9 + dx, y: py - size * 0.9 + dy, style });
  }
  // 上・右のスペクトルのマーカー: 山の上 (右の帯は山の右) に置く。同じ山に複数付いたら積む (1D の図と同じ)
  const stack = new Map<string, number>();
  for (const m of doc.markers) {
    if (!m.side || m.space !== '2d' || m.layerId !== meta.id) continue;
    const style = styleById.get(m.styleId);
    const band = m.side === 'top' ? layout.topBand : layout.rightBand;
    const trace = m.side === 'top' ? top : right;
    if (!style || !band || !trace) continue;
    const pos = m.side === 'top' ? layout.xToPx(m.ppm) : layout.yToPx(m.ppm);
    const start = m.side === 'top' ? band.x : band.y;
    if (pos < start || pos > start + (m.side === 'top' ? band.w : band.h)) continue;
    const key = `${m.side}:${Math.round(pos / size)}`;
    const k = stack.get(key) ?? 0;
    stack.set(key, k + 1);
    const lift = peakLevel(trace.levels, pos - start) + size / 2 + 3 + k * (size + 2);
    const x = m.side === 'top' ? pos : Math.min(layout.width - size / 2 - 1, band.x + lift);
    const y = m.side === 'top' ? Math.max(size / 2 + 1, band.y + band.h - lift) : pos;
    markers.push({ id: m.id, x: x + (m.dx ?? 0), y: y + (m.dy ?? 0), style });
  }
  // 凡例: この図に出ているマーカーの種類だけ (名前のないものは出さない)
  const shown = new Set(markers.map((m) => m.style.id));
  const legend = placeLegend(
    doc.figure,
    doc.markerStyles.filter((s) => s.name && shown.has(s.id)),
    plot,
  );

  return {
    layout,
    meta,
    plot: plot2d,
    markers,
    legend,
    contours,
    tooDense,
    xTicks,
    yTicks,
    diagonal,
    topPath: top?.path ?? '',
    rightPath: right?.path ?? '',
    top,
    right,
    caption: `X : ${meta.x.axisName}   Y : ${meta.y.axisName}  (parts per Million)`,
    title: title2d(doc),
    annotations: doc.annotations.flatMap((a): PlacedAnnotation[] => {
      if (a.space !== '2d') return [];
      // 構造式に固定した印 (帰属の文字など): 構造式の枠に対する割合。構造式を動かすと一緒に動く
      if (a.imageId) {
        const image = doc.figureImages.find((x) => x.id === a.imageId);
        return image ? [{ a, ...imageAnchorToPx(a, imageRect(image, layout)) }] : [];
      }
      if (a.layerId !== meta.id) return [];
      return [{ a, p1: { px: layout.xToPx(a.x1), py: layout.yToPx(a.y1) }, p2: { px: layout.xToPx(a.x2), py: layout.yToPx(a.y2) } }];
    }),
  };
}

/** 2D の投影の線。dir='x' は上の帯 (左右が ppm)、dir='y' は右の帯 (上下が ppm) */
function projectionTrace(values: Float32Array, band: Rect, dir: 'x' | 'y', grid: ContourGrid, layout: Layout2d): SideTrace {
  const n = values.length;
  const at = (i: number) => {
    const t = n > 1 ? i / (n - 1) : 0;
    return dir === 'x' ? layout.xToPx(grid.x0 + (grid.x1 - grid.x0) * t) : layout.yToPx(grid.y0 + (grid.y1 - grid.y0) * t);
  };
  return sideTrace(n, at, (i) => values[i], band, dir);
}

/** 上・右に読み込んだ 1D の線 (表示範囲の中だけ)。読み込んでいなければ null */
function side1dTrace(
  doc: NmrDocument,
  side: Side1d | null | undefined,
  data1d: Record<string, Float32Array>,
  band: Rect,
  dir: 'x' | 'y',
  lo: number,
  hi: number,
  layout: Layout2d,
): SideTrace | null {
  const meta = side && doc.spectra.find((s) => s.id === side.spectrumId);
  const data = meta && data1d[meta.id];
  if (!meta || !data) return null;
  const [i0, i1] = indexRange(meta, lo, hi);
  const toPx = dir === 'x' ? layout.xToPx : layout.yToPx;
  return sideTrace(Math.max(0, i1 - i0 + 1), (k) => toPx(ppmAt(meta, i0 + k)), (k) => data[i0 + k], band, dir);
}

/**
 * 帯の線を作る。高さは表示範囲でいちばん高い山を帯の 95% にする (負の値は 0)。
 * 1 px に 2 点より多く入るときは、その列の最初・最小・最大・最後だけ残す (1D の図と同じ間引き)
 */
export function sideTrace(n: number, at: (i: number) => number, value: (i: number) => number, band: Rect, dir: 'x' | 'y'): SideTrace {
  const start = dir === 'x' ? band.x : band.y;
  const len = Math.max(1, Math.ceil(dir === 'x' ? band.w : band.h));
  const depth = (dir === 'x' ? band.h : band.w) * 0.95;
  const levels = new Float32Array(len + 1);
  let max = 0;
  for (let i = 0; i < n; i++) if (value(i) > max) max = value(i);
  if (!max || n < 2) return { path: '', levels };
  const lv = (i: number) => (Math.max(0, value(i)) / max) * depth;
  const parts: string[] = [];
  const emit = (i: number) => {
    const p = Math.min(start + len, Math.max(start, at(i)));
    const l = lv(i);
    const [x, y] = dir === 'x' ? [p, band.y + band.h - l] : [band.x + l, p];
    parts.push(`${parts.length ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`);
  };
  for (let i = 0; i < n; i++) {
    const c = Math.floor(at(i) - start);
    if (c >= 0 && c <= len) levels[c] = Math.max(levels[c], lv(i));
  }
  if (n <= len * 2) {
    for (let i = 0; i < n; i++) emit(i);
    return { path: parts.join(''), levels };
  }
  let col = Math.floor(at(0));
  let first = 0;
  let last = 0;
  let minI = 0;
  let maxI = 0;
  const flush = () => {
    let prev = -1;
    for (const i of [first, minI, maxI, last].sort((a, b) => a - b)) {
      if (i !== prev) emit(i);
      prev = i;
    }
  };
  for (let i = 1; i < n; i++) {
    const c = Math.floor(at(i));
    if (c !== col) {
      flush();
      col = c;
      first = last = minI = maxI = i;
      continue;
    }
    last = i;
    if (value(i) < value(minI)) minI = i;
    if (value(i) > value(maxI)) maxI = i;
  }
  flush();
  return { path: parts.join(''), levels };
}

/** 帯の位置 c (px) のまわり ±2 px で、いちばん高い所 (マーカーを山の頂上の上に置く) */
export function peakLevel(levels: Float32Array, c: number): number {
  let best = 0;
  for (let i = Math.max(0, Math.round(c) - 2); i <= Math.min(levels.length - 1, Math.round(c) + 2); i++) best = Math.max(best, levels[i]);
  return best;
}

/** 2D の図のタイトル。例: ^{1}H-^{1}H COSY (400 MHz, C_{6}D_{6}) */
export function title2d(doc: NmrDocument): string {
  const f = doc.figure;
  if (!f.titleAuto) return f.title;
  const meta = doc.plot2d && doc.spectra2d.find((s) => s.id === doc.plot2d!.spectrumId);
  if (!meta) return '';
  return autoTitle2d(meta);
}

export function autoTitle2d(meta: Spectrum2dMeta): string {
  const pair = `${nucleusRich(meta.x.nucleus)}-${nucleusRich(meta.y.nucleus)}`;
  const name = experimentLabel2d(meta);
  const solvent = solventInfo(meta.solvent)?.label ?? meta.solventRaw;
  const parts = [`${Math.round(meta.x.freqMHz)} MHz`];
  if (solvent) parts.push(solvent);
  return `${pair} ${name} (${parts.join(', ')})`;
}

/** 表示範囲を全体に戻す */
export function fullView2d(meta: Spectrum2dMeta): View2d {
  return { xMax: meta.x.first, xMin: meta.x.last, yMax: meta.y.first, yMin: meta.y.last };
}

/** 2D の図 (等高線) を組み立てる。1D の scene.ts と同じく、描画に必要なものだけを返す */
import { contourLevels, contourPath, projections, sampleGrid, type ContourGrid, type View2d } from './contour';
import type { Spectrum2dData } from './fid2d';
import { decimalsFor, niceStep, ticks } from './labels';
import { nucleusRich } from './nuclei';
import { solventInfo } from './solvents';
import type { NmrDocument, Plot2d, Spectrum2dMeta } from '../state/types';
import { experimentLabel2d } from './jdf2d';
import type { Rect } from './layout';

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
  caption: string;
  title: string;
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
  const plot: Rect = {
    x: left,
    y: TOP + band,
    w: Math.max(40, f.width - left - RIGHT - band),
    h: Math.max(40, f.height - TOP - band - bottom),
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
    topBand: band ? { x: plot.x, y: TOP, w: plot.w, h: band - 6 } : null,
    rightBand: band ? { x: plot.x + plot.w + 6, y: plot.y, w: band - 6, h: plot.h } : null,
    captionY: tickLabelBottom + (captionBlock ? 11 : 0),
    titleY: tickLabelBottom + (captionBlock ? 11 : 0) + (titleBlock ? f.titleFontSize + 6 : 0),
    xToPx,
    yToPx,
    pxToX,
    pxToY,
  };
}

/** プロットの中身が正方形になる図の高さ (対角線が 45° になる) */
export function squareHeight(doc: NmrDocument, plot2d: Plot2d): number {
  const f = doc.figure;
  const band = plot2d.showProjections ? BAND : 0;
  const tickBlock = 6 + f.tickFontSize + 4;
  const captionBlock = f.showXCaption ? 14 : 0;
  const titleBlock = f.showTitle && title2d(doc) ? f.titleFontSize + 12 : 0;
  const plotW = f.width - 56 - RIGHT - band;
  return Math.round(plotW + TOP + band + tickBlock + captionBlock + titleBlock + 6);
}

export function buildScene2d(doc: NmrDocument, data: Spectrum2dData | undefined): Scene2d | null {
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

  let topPath = '';
  let rightPath = '';
  if (layout.topBand && layout.rightBand) {
    const { top, right } = projections(grid);
    topPath = bandPath(top, layout.topBand, 'x', grid, layout);
    rightPath = bandPath(right, layout.rightBand, 'y', grid, layout);
  }

  return {
    layout,
    meta,
    plot: plot2d,
    contours,
    tooDense,
    xTicks,
    yTicks,
    diagonal,
    topPath,
    rightPath,
    caption: `X : ${meta.x.axisName}   Y : ${meta.y.axisName}  (parts per Million)`,
    title: title2d(doc),
  };
}

/** 投影の線。dir='x' は上の帯 (左右が ppm)、dir='y' は右の帯 (上下が ppm) */
function bandPath(values: Float32Array, band: Rect, dir: 'x' | 'y', grid: ContourGrid, layout: Layout2d): string {
  let max = 0;
  for (const v of values) if (v > max) max = v;
  if (!max) return '';
  const parts: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const t = values.length > 1 ? i / (values.length - 1) : 0;
    const level = (values[i] / max) * (dir === 'x' ? band.h : band.w) * 0.95;
    const px = dir === 'x' ? layout.xToPx(grid.x0 + (grid.x1 - grid.x0) * t) : band.x + level;
    const py = dir === 'x' ? band.y + band.h - level : layout.yToPx(grid.y0 + (grid.y1 - grid.y0) * t);
    parts.push(`${parts.length ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`);
  }
  return parts.join('');
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

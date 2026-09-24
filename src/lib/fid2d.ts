/**
 * 2D の生データ (FID) を、このアプリでスペクトルにする。
 * 手順: 窓関数 (サインベル) → ゼロ詰め → F2 の FFT → 転置して F1 の FFT → 絶対値
 *
 * COSY・HMBC・HMQC は絶対値表示が普通なので、位相補正はしない。
 * (絶対値は位相に影響されないので、デジタルフィルターの遅れの補正も要らない)
 */
import { tr } from '../i18n';
import { fft } from './fid';

export interface Axis2d {
  /** スペクトル幅 (Hz) */
  sw: number;
  /** 0 ppm の周波数 (MHz) */
  refMHz: number;
  /** 中心の ppm */
  offsetPpm: number;
  /** 残す割合 (F2 は Delta の x_sweep_clipped / x_sweep)。端はフィルターで減衰している */
  clip: number;
}

export interface Fid2dData {
  /** 行 = t1 の点。各行は t2 の複素 FID */
  re: Float32Array[];
  im: Float32Array[];
  /** 直接観測の軸 (横軸) */
  x: Axis2d;
  /** 間接観測の軸 (縦軸) */
  y: Axis2d;
}

export interface Processing2d {
  /** 窓関数。絶対値表示ではサインベルが定番 */
  window: 'sine' | 'sine2' | 'none';
  /** ゼロ詰めの倍率 (2のべき乗に切り上げたあとに掛ける) */
  zf2: number;
  zf1: number;
}

export interface Spectrum2dData {
  /** n1 行 × n2 列 (行優先)。行 0 が first1、列 0 が first2 (どちらも大きい ppm から) */
  data: Float32Array;
  n2: number;
  n1: number;
  first2: number;
  last2: number;
  first1: number;
  last1: number;
  maxAbs: number;
  /** 雑音の目安 (全体の中央値。地図のほとんどは雑音なので) */
  noise: number;
}

export function defaultProcessing2d(): Processing2d {
  return { window: 'sine', zf2: 1, zf1: 2 };
}

function pow2ceil(n: number) {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

/** 窓関数の値 (0〜1)。k は 0〜n-1 */
function windowAt(kind: Processing2d['window'], k: number, n: number) {
  if (kind === 'none') return 1;
  const s = Math.sin((Math.PI * (k + 0.5)) / n);
  return kind === 'sine2' ? s * s : s;
}

/** 表示の向き (大きい ppm → 小さい ppm) に並べ替えたときの、r 番目の点の ppm */
function ppmOf(axis: Axis2d, size: number, keep: number, r: number) {
  const start = Math.floor((size - keep) / 2);
  const bin = size - 1 - (start + r) - size / 2;
  return axis.offsetPpm + (bin * (axis.sw / size)) / axis.refMHz;
}

/** 2次元の FT。絶対値のスペクトルを返す */
export function transform2d(fid: Fid2dData, p: Processing2d): Spectrum2dData {
  const n1 = fid.re.length;
  const n2 = fid.re[0]?.length ?? 0;
  if (!n1 || !n2) throw new Error(tr('2D のデータが空です'));
  const size2 = Math.min(pow2ceil(n2) * Math.max(1, p.zf2), 1 << 16);
  const size1 = Math.min(pow2ceil(n1) * Math.max(1, p.zf1), 1 << 14);
  const keep2 = Math.round(size2 * Math.min(1, Math.max(0.05, fid.x.clip)));
  const keep1 = Math.round(size1 * Math.min(1, Math.max(0.05, fid.y.clip)));
  const start2 = Math.floor((size2 - keep2) / 2);
  const start1 = Math.floor((size1 - keep1) / 2);

  // F2: 行ごとに FFT して、表示の向き (高 ppm → 低 ppm) で残す範囲だけ取り出す
  const rowRe: Float64Array[] = [];
  const rowIm: Float64Array[] = [];
  const re = new Float64Array(size2);
  const im = new Float64Array(size2);
  for (let r = 0; r < n1; r++) {
    re.fill(0);
    im.fill(0);
    const sr = fid.re[r];
    const si = fid.im[r];
    for (let k = 0; k < n2; k++) {
      const w = windowAt(p.window, k, n2);
      re[k] = sr[k] * w;
      im[k] = si[k] * w;
    }
    re[0] *= 0.5;
    im[0] *= 0.5;
    fft(re, im);
    const outRe = new Float64Array(keep2);
    const outIm = new Float64Array(keep2);
    for (let c = 0; c < keep2; c++) {
      const bin = size2 - 1 - (start2 + c) - size2 / 2;
      const src = (bin + size2) % size2;
      outRe[c] = re[src];
      outIm[c] = im[src];
    }
    rowRe.push(outRe);
    rowIm.push(outIm);
  }

  // F1: 列ごとに FFT して絶対値にする
  const out = new Float32Array(keep1 * keep2);
  const colRe = new Float64Array(size1);
  const colIm = new Float64Array(size1);
  let maxAbs = 0;
  for (let c = 0; c < keep2; c++) {
    colRe.fill(0);
    colIm.fill(0);
    for (let r = 0; r < n1; r++) {
      const w = windowAt(p.window, r, n1);
      colRe[r] = rowRe[r][c] * w;
      // 間接観測の軸は回る向きが逆 (共役にしないと、搬送波を中心に反転した像になる)
      colIm[r] = -rowIm[r][c] * w;
    }
    colRe[0] *= 0.5;
    colIm[0] *= 0.5;
    fft(colRe, colIm);
    for (let r = 0; r < keep1; r++) {
      const bin = size1 - 1 - (start1 + r) - size1 / 2;
      const src = (bin + size1) % size1;
      const v = Math.hypot(colRe[src], colIm[src]);
      out[r * keep2 + c] = v;
      if (v > maxAbs) maxAbs = v;
    }
  }

  // 雑音の目安 (間引いて中央値をとる)
  const sample: number[] = [];
  for (let i = 0; i < out.length; i += 37) sample.push(out[i]);
  sample.sort((a, b) => a - b);
  return {
    data: out,
    noise: sample[Math.floor(sample.length / 2)] || 0,
    n2: keep2,
    n1: keep1,
    first2: ppmOf(fid.x, size2, keep2, 0),
    last2: ppmOf(fid.x, size2, keep2, keep2 - 1),
    first1: ppmOf(fid.y, size1, keep1, 0),
    last1: ppmOf(fid.y, size1, keep1, keep1 - 1),
    maxAbs: maxAbs || 1,
  };
}

/** 行 (F1) / 列 (F2) の番号 → ppm */
export function ppm2At(s: Spectrum2dData, col: number) {
  return s.first2 + ((s.last2 - s.first2) * col) / (s.n2 - 1);
}

export function ppm1At(s: Spectrum2dData, row: number) {
  return s.first1 + ((s.last1 - s.first1) * row) / (s.n1 - 1);
}

/** ppm → 列 / 行 (範囲外も返す) */
export function colAt(s: Spectrum2dData, ppm: number) {
  return ((ppm - s.first2) / (s.last2 - s.first2)) * (s.n2 - 1);
}

export function rowAt(s: Spectrum2dData, ppm: number) {
  return ((ppm - s.first1) / (s.last1 - s.first1)) * (s.n1 - 1);
}

import type { SpectrumMeta } from '../state/types';

type Axis = Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset'>;

/** 点 i の表示 ppm (基準合わせ後) */
export function ppmAt(meta: Axis, i: number): number {
  return meta.first + ((meta.last - meta.first) * i) / (meta.n - 1) + meta.refOffset;
}

/** 表示 ppm に対応する (小数の) インデックス */
export function indexAt(meta: Axis, ppm: number): number {
  return ((ppm - meta.refOffset - meta.first) / (meta.last - meta.first)) * (meta.n - 1);
}

/** 表示 ppm の範囲 [lo, hi] に入るインデックス範囲 */
export function indexRange(meta: Axis, lo: number, hi: number): [number, number] {
  const a = indexAt(meta, lo);
  const b = indexAt(meta, hi);
  const i0 = Math.max(0, Math.floor(Math.min(a, b)));
  const i1 = Math.min(meta.n - 1, Math.ceil(Math.max(a, b)));
  return [i0, i1];
}

export function maxInRange(data: Float32Array, meta: Axis, lo: number, hi: number): number {
  const [i0, i1] = indexRange(meta, lo, hi);
  let m = 0;
  for (let i = i0; i <= i1; i++) if (data[i] > m) m = data[i];
  return m;
}

const noiseCache = new WeakMap<Float32Array, number>();

/** ノイズの標準偏差の推定値 (隣接差分の MAD。ベースラインの傾きやピークの影響を受けにくい) */
export function noiseLevel(data: Float32Array): number {
  const cached = noiseCache.get(data);
  if (cached !== undefined) return cached;
  const diffs = new Float32Array(data.length - 1);
  for (let i = 1; i < data.length; i++) diffs[i - 1] = Math.abs(data[i] - data[i - 1]);
  diffs.sort();
  const sigma = (1.4826 * diffs[Math.floor(diffs.length / 2)]) / Math.SQRT2;
  noiseCache.set(data, sigma);
  return sigma;
}

export interface Peak {
  ppm: number;
  height: number;
}

/** 放物線補間でピークの頂点を求める */
function refine(data: Float32Array, meta: Axis, i: number): Peak {
  const a = data[i - 1] ?? data[i];
  const b = data[i];
  const c = data[i + 1] ?? data[i];
  const denom = a - 2 * b + c;
  const frac = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
  return { ppm: ppmAt(meta, i + frac), height: b - 0.25 * (a - c) * frac };
}

/** 範囲内の極大のうち minHeight を超えるもの */
export function findPeaks(data: Float32Array, meta: Axis, lo: number, hi: number, minHeight: number): Peak[] {
  const [i0, i1] = indexRange(meta, lo, hi);
  const peaks: Peak[] = [];
  for (let i = Math.max(2, i0); i <= Math.min(data.length - 3, i1); i++) {
    const v = data[i];
    if (v < minHeight) continue;
    if (v > data[i - 1] && v >= data[i + 1] && v >= data[i - 2] && v >= data[i + 2]) peaks.push(refine(data, meta, i));
  }
  return peaks;
}

/** ppm の周辺 ±window で一番高い点をピークとして返す */
export function snapToPeak(data: Float32Array, meta: Axis, ppm: number, window: number): Peak | null {
  const [i0, i1] = indexRange(meta, ppm - window, ppm + window);
  if (i1 <= i0) return null;
  let best = i0;
  for (let i = i0; i <= i1; i++) if (data[i] > data[best]) best = i;
  return refine(data, meta, best);
}

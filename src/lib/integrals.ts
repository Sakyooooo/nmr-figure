import type { Integral, NmrDocument, SpectrumMeta } from '../state/types';
import { indexRange } from './spectrum';

type Axis = Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset'>;

/**
 * 積分 (範囲の強度の和 × 点の間隔)。ppm は基準合わせ前の値。
 * baseline = true のときは、範囲の両端を結ぶ直線を引いてから足す (Delta と同じ)。
 * Delta で 7〜8 ppm に引いた積分で確かめたところ、この出し方で Delta の値と 0.01% 以内で一致した。
 */
export function integralArea(data: Float32Array, meta: Axis, from: number, to: number, baseline = true): number {
  const [i0, i1] = rawRange(meta, from, to);
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += data[i];
  // 直線を引いた分 = 両端の平均 × 点数
  if (baseline && i1 > i0) sum -= ((data[i0] + data[i1]) / 2) * (i1 - i0 + 1);
  return sum * pointStep(meta);
}

export function pointStep(meta: Pick<SpectrumMeta, 'first' | 'last' | 'n'>) {
  return Math.abs(meta.last - meta.first) / (meta.n - 1);
}

function rawRange(meta: Axis, from: number, to: number) {
  return indexRange(meta, Math.min(from, to) + meta.refOffset, Math.max(from, to) + meta.refOffset);
}

/** 積分曲線の点 (範囲の左端 = 0 から右へ累積)。点数は maxPoints 以下に間引く */
export function cumulative(data: Float32Array, meta: Axis, from: number, to: number, maxPoints: number, baseline = true) {
  const [i0, i1] = rawRange(meta, from, to);
  // 面積と同じ直線を引く (曲線の両端が水平になる)
  const level = baseline && i1 > i0 ? (data[i0] + data[i1]) / 2 : 0;
  // 表示は左 (大きい ppm) から右へ。インデックスが増える向きと ppm の向きをそろえる
  const increasing = meta.last < meta.first;
  const order = increasing ? { start: i0, end: i1, step: 1 } : { start: i1, end: i0, step: -1 };
  const count = Math.abs(order.end - order.start) + 1;
  const every = Math.max(1, Math.ceil(count / maxPoints));
  const step = pointStep(meta);
  const points: { i: number; value: number }[] = [];
  let sum = 0;
  let k = 0;
  for (let i = order.start; ; i += order.step) {
    sum += (data[i] - level) * step;
    if (k % every === 0 || i === order.end) points.push({ i, value: sum });
    k++;
    if (i === order.end) break;
  }
  return points;
}

/**
 * 積分値。スペクトルごとに、基準 (integralRef) の積分を指定の値にしてそろえる。
 * 基準がなければ、そのスペクトルで最初に作った積分を 1.00 とする。
 */
export function integralValues(doc: NmrDocument, dataMap: Record<string, Float32Array>) {
  const values = new Map<string, number>();
  const areas = new Map<string, number>();
  for (const layer of doc.layers) {
    const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
    const data = dataMap[layer.spectrumId];
    if (!meta || !data) continue;
    const mine = doc.integrals.filter((x) => x.layerId === layer.id);
    if (!mine.length) continue;
    for (const x of mine) areas.set(x.id, integralArea(data, meta, x.from, x.to, doc.figure.integralBaseline !== false));
    const ref = (layer.integralRef && mine.find((x) => x.id === layer.integralRef!.id)) || mine[0];
    const refValue = layer.integralRef && ref.id === layer.integralRef.id ? layer.integralRef.value : 1;
    const refArea = areas.get(ref.id)!;
    for (const x of mine) values.set(x.id, refArea ? (areas.get(x.id)! / refArea) * refValue : 0);
  }
  return { values, areas };
}

export function isReference(doc: NmrDocument, integral: Integral) {
  const layer = doc.layers.find((l) => l.id === integral.layerId);
  const mine = doc.integrals.filter((x) => x.layerId === integral.layerId);
  const refId = layer?.integralRef && mine.some((x) => x.id === layer.integralRef!.id) ? layer.integralRef.id : mine[0]?.id;
  return refId === integral.id;
}

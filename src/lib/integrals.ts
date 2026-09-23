import type { Integral, IntegralBaseline, NmrDocument, SpectrumMeta } from '../state/types';
import { indexAt } from './spectrum';

type Axis = Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset'>;

/** Delta が範囲の端の高さを決めるときに平均する点の数 (端の点を中心に 11 点) */
const END_POINTS = 11;

/**
 * 積分 (範囲の強度の和 × 点の間隔)。ppm は基準合わせ前の値。
 * baseline = true のときは、ベースライン (範囲の両端を結ぶ直線) を引いてから足す。
 * 直線は Delta と同じく「両端それぞれ 11 点の平均」を結ぶ。研究室の .jdf の積分 406 件で、
 * Delta の値 = 強度の和 − 点数 × 直線の中央の高さ が計算の誤差の範囲で一致した (手で直したものは stored で渡す)。
 */
export function integralArea(
  data: Float32Array,
  meta: Axis,
  from: number,
  to: number,
  baseline = true,
  stored?: IntegralBaseline | null,
): number {
  const [i0, i1] = integralRange(meta, from, to);
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += data[i];
  // 直線の分 = 中央の高さ × 点数 (傾きの分は左右で打ち消し合う)
  if (baseline && i1 > i0) sum -= (stored ?? deltaBaseline(data, meta, from, to)).bias * (i1 - i0 + 1);
  return sum * pointStep(meta);
}

export function pointStep(meta: Pick<SpectrumMeta, 'first' | 'last' | 'n'>) {
  return Math.abs(meta.last - meta.first) / (meta.n - 1);
}

/**
 * 積分範囲のインデックス (両端を含む)。両端はそれぞれ一番近いデータ点にする。
 * Delta も積分の両端をデータ点に置くので、Delta に書き戻したときと同じ点を足すことになり、値がそろう。
 */
export function integralRange(meta: Axis, from: number, to: number): [number, number] {
  const a = Math.round(indexAt(meta, Math.max(from, to) + meta.refOffset));
  const b = Math.round(indexAt(meta, Math.min(from, to) + meta.refOffset));
  return [Math.max(0, Math.min(a, b)), Math.min(meta.n - 1, Math.max(a, b))];
}

/** 点 i の ppm (基準合わせ前) */
function rawPpm(meta: Axis, i: number) {
  return meta.first + ((meta.last - meta.first) * i) / (meta.n - 1);
}

/** 点 i を中心にした END_POINTS 点の平均 (スペクトルの端では入る点だけ) */
function endLevel(data: Float32Array, i: number) {
  const half = (END_POINTS - 1) / 2;
  let sum = 0;
  let count = 0;
  for (let k = i - half; k <= i + half; k++) {
    if (k < 0 || k >= data.length) continue;
    sum += data[k];
    count++;
  }
  return count ? sum / count : 0;
}

/** Delta と同じ出し方のベースライン: 範囲の両端それぞれ 11 点の平均を結ぶ直線 */
export function deltaBaseline(data: Float32Array, meta: Axis, from: number, to: number): IntegralBaseline {
  const [i0, i1] = integralRange(meta, from, to);
  const p0 = rawPpm(meta, i0);
  const p1 = rawPpm(meta, i1);
  const l0 = endLevel(data, i0);
  const l1 = endLevel(data, i1);
  return { bias: (l0 + l1) / 2, slope: p0 !== p1 ? (l0 - l1) / (p0 - p1) : 0 };
}

/** 積分曲線の点 (範囲の左端 = 0 から右へ累積)。点数は maxPoints 以下に間引く */
export function cumulative(
  data: Float32Array,
  meta: Axis,
  from: number,
  to: number,
  maxPoints: number,
  baseline = true,
  stored?: IntegralBaseline | null,
) {
  const [i0, i1] = integralRange(meta, from, to);
  // 面積と同じ直線を引く (傾きも引くので、曲線の両端が水平になる)
  const line = baseline && i1 > i0 ? (stored ?? deltaBaseline(data, meta, from, to)) : { bias: 0, slope: 0 };
  const center = (rawPpm(meta, i0) + rawPpm(meta, i1)) / 2;
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
    sum += (data[i] - line.bias - line.slope * (rawPpm(meta, i) - center)) * step;
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
    for (const x of mine) areas.set(x.id, integralArea(data, meta, x.from, x.to, doc.figure.integralBaseline !== false, x.baseline));
    const ref = (layer.integralRef && mine.find((x) => x.id === layer.integralRef!.id)) || mine[0];
    const refValue = layer.integralRef && ref.id === layer.integralRef.id ? layer.integralRef.value : 1;
    const refArea = areas.get(ref.id)!;
    for (const x of mine) values.set(x.id, refArea ? (areas.get(x.id)! / refArea) * refValue : 0);
  }
  return { values, areas };
}

/** そのスペクトルで、値の基準になっている積分と、その値 (基準が無ければ最初の積分 = 1) */
export function referenceOf(doc: NmrDocument, layerId: string): { id: string; value: number } | null {
  const layer = doc.layers.find((l) => l.id === layerId);
  const mine = doc.integrals.filter((x) => x.layerId === layerId);
  if (layer?.integralRef && mine.some((x) => x.id === layer.integralRef!.id)) return layer.integralRef;
  return mine[0] ? { id: mine[0].id, value: 1 } : null;
}

export function isReference(doc: NmrDocument, integral: Integral) {
  return referenceOf(doc, integral.layerId)?.id === integral.id;
}

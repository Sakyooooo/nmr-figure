/**
 * Delta との同期で使う、画面に依らない計算。
 * - このアプリの図 (スペクトル 1 本ぶん) のピーク値・積分と、.jdf の注釈を同じ形 (WritableAnnotations) で扱う
 * - 2 つが同じ中身かを「鍵」(文字列) で比べる。ピークはデータ点、積分は両端の点と Delta の画面に出る値で見るので、
 *   データ点の間の ppm の違いや、基準の積分の選び方の違いでは食い違わない
 * - .jdf の中身を図に入れるとき、同じ点・同じ範囲のものは id と SI テキストの上書きをそのまま残す
 */
import type { Draft } from 'immer';
import type { NmrDocument, SpectrumMeta } from '../state/types';
import { deltaBaseline, integralArea, integralRange, pointStep, referenceOf } from './integrals';
import { deltaReference, readAnnotations } from './jdfAnnotations';
import type { WritableAnnotations } from './jdfWrite';

type Axis = Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset'>;

/** Delta と行き来できるスペクトルか (Delta で処理済みの 1D。FID をこのアプリで処理したものや文献のものは不可) */
export function canSyncDelta(meta: SpectrumMeta | undefined): meta is SpectrumMeta {
  return !!meta && !meta.processing && !meta.simulated && /\.jdf$/i.test(syncFileOf(meta));
}

/** 同期する .jdf の名前 (図を .jdf に保存したあとの土台のスペクトルは、その図のファイル) */
export function syncFileOf(meta: SpectrumMeta): string {
  return meta.syncFile || meta.fileName;
}

/** 図のスペクトル 1 本ぶんのピーク値・積分 (積分は作った順。基準の積分とその値も) */
export function layerAnnotations(doc: NmrDocument, layerId: string): WritableAnnotations {
  const integrals = doc.integrals.filter((x) => x.layerId === layerId);
  const ref = referenceOf(doc, layerId);
  const index = ref ? integrals.findIndex((x) => x.id === ref.id) : -1;
  return {
    peaks: doc.peakLabels.filter((p) => p.layerId === layerId).map((p) => ({ ppm: p.ppm })),
    integrals: integrals.map((x) => ({ from: x.from, to: x.to, baseline: x.baseline ?? null })),
    reference: ref && index >= 0 ? { index, value: ref.value } : null,
  };
}

/** .jdf の注釈を、図と同じ形で読む */
export function fileAnnotations(buffer: ArrayBuffer): WritableAnnotations {
  const ann = readAnnotations(buffer);
  return {
    peaks: ann.peaks.map((p) => ({ ppm: p.ppm })),
    integrals: ann.integrals.map((x) => ({ from: x.from, to: x.to, baseline: x.baseline ?? null })),
    reference: deltaReference(ann),
  };
}

/** 積分ごとの Delta の画面の値 (生の値 × 倍率。基準が無ければ最初の積分 = 1) */
export function shownValues(ann: WritableAnnotations, data: Float32Array, meta: Axis): number[] {
  const step = pointStep(meta);
  const raw = ann.integrals.map((x) => integralArea(data, meta, x.from, x.to, true, x.baseline ?? deltaBaseline(data, meta, x.from, x.to)) / step);
  const index = ann.reference && ann.reference.index < raw.length ? ann.reference.index : 0;
  const value = ann.reference && ann.reference.index < raw.length ? ann.reference.value : 1;
  const scale = raw[index] ? value / raw[index] : 1;
  return raw.map((r) => r * scale);
}

/** 中身が同じかを比べる鍵 */
export function annotationKey(ann: WritableAnnotations, data: Float32Array, meta: Axis): string {
  const peaks = [...new Set(ann.peaks.map((p) => point(meta, p.ppm)))].sort((a, b) => a - b);
  const shown = shownValues(ann, data, meta);
  const integrals = ann.integrals
    .map((x, i) => {
      const [a, b] = integralRange(meta, x.from, x.to);
      return `${a}-${b}:${Number(shown[i].toPrecision(5))}`;
    })
    .sort();
  return `P${peaks.join(',')}|I${integrals.join(',')}`;
}

/** ppm (ファイルの軸) に一番近いデータ点 */
function point(meta: Axis, ppm: number) {
  return Math.round(((ppm - meta.first) / (meta.last - meta.first)) * (meta.n - 1));
}

/** 記録の一覧に出す短い説明 (例: ピーク 7 / 積分 5) */
export function summary(ann: WritableAnnotations) {
  return `ピーク ${ann.peaks.length} / 積分 ${ann.integrals.length}`;
}

/**
 * .jdf の中身を図のスペクトル 1 本に入れる。
 * 同じ点のピーク・同じ範囲の積分は、今のもの (id・ppm・SI テキストの上書き) を残し、ベースラインだけ .jdf に合わせる
 */
export function applyAnnotations(d: Draft<NmrDocument>, layerId: string, ann: WritableAnnotations, meta: Axis) {
  // ピーク値
  const wanted = new Map(ann.peaks.map((p) => [point(meta, p.ppm), p.ppm]));
  const keptPeaks = new Set<number>();
  d.peakLabels = d.peakLabels.filter((p) => {
    if (p.layerId !== layerId) return true;
    const k = point(meta, p.ppm);
    if (!wanted.has(k) || keptPeaks.has(k)) return false;
    keptPeaks.add(k);
    return true;
  });
  for (const [k, ppm] of wanted) if (!keptPeaks.has(k)) d.peakLabels.push({ id: crypto.randomUUID(), layerId, ppm });

  // 積分 (今の並び = 作った順を残し、新しいものは後ろに足す)
  const rangeKey = (from: number, to: number) => integralRange(meta, from, to).join('-');
  const incoming = ann.integrals.map((x) => ({ ...x, key: rangeKey(x.from, x.to) }));
  const ids: string[] = incoming.map(() => '');
  const kept = new Set<string>();
  d.integrals = d.integrals.filter((x) => {
    if (x.layerId !== layerId) return true;
    const key = rangeKey(x.from, x.to);
    const at = incoming.findIndex((y, i) => y.key === key && !ids[i]);
    if (at < 0 || kept.has(key)) return false;
    kept.add(key);
    ids[at] = x.id;
    x.baseline = incoming[at].baseline ?? null;
    return true;
  });
  incoming.forEach((x, i) => {
    if (ids[i]) return;
    ids[i] = crypto.randomUUID();
    d.integrals.push({ id: ids[i], layerId, from: x.from, to: x.to, baseline: x.baseline ?? null });
  });

  // 値のそろえ方
  const layer = d.layers.find((l) => l.id === layerId);
  if (layer) layer.integralRef = ann.reference && ids[ann.reference.index] ? { id: ids[ann.reference.index], value: ann.reference.value } : null;
}

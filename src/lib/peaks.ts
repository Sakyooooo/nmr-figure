/**
 * ピーク値の一覧 (ピークピックアップ)。
 * 図に付けたピーク値ラベルを、ppm と高さの表にして、Excel や文章に持ち出せるようにする。
 */
import type { NmrDocument } from '../state/types';
import { snapToPeak } from './spectrum';

export interface PeakRow {
  /** ピーク値ラベルの id */
  id: string;
  /** 図に出る ppm (基準合わせ後) */
  ppm: number;
  height: number;
  /** 一番高いピークを 100 とした高さ */
  relative: number;
}

/** 選んでいるスペクトルのピーク値ラベルを、ppm の大きい順に並べる。高さは今のデータから読む */
export function peakRows(doc: NmrDocument, dataMap: Record<string, Float32Array>, layerId: string): PeakRow[] {
  const layer = doc.layers.find((l) => l.id === layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const data = meta && dataMap[meta.id];
  if (!meta || !data) return [];
  // 頂点を探す幅はデータ点 2つぶん (ラベルの ppm は頂点に付いている)
  const window = (Math.abs(meta.last - meta.first) / (meta.n - 1)) * 2;
  const rows = doc.peakLabels
    .filter((p) => p.layerId === layerId)
    .map((p) => {
      const ppm = p.ppm + meta.refOffset;
      return { id: p.id, ppm, height: snapToPeak(data, meta, ppm, window)?.height ?? 0 };
    })
    .sort((a, b) => b.ppm - a.ppm);
  const top = Math.max(0, ...rows.map((r) => r.height));
  return rows.map((r) => ({ ...r, relative: top > 0 ? (r.height / top) * 100 : 0 }));
}

/** 表計算に貼れる形 (タブ区切り) */
export function peakTableText(rows: PeakRow[], decimals: number): string {
  const lines = ['δ (ppm)\t高さ (%)'];
  for (const r of rows) lines.push(`${r.ppm.toFixed(decimals)}\t${r.relative.toFixed(1)}`);
  return lines.join('\n');
}

/** 値だけ並べた形 (7.262, 3.451, 1.253) */
export function peakValuesText(rows: PeakRow[], decimals: number): string {
  return rows.map((r) => r.ppm.toFixed(decimals)).join(', ');
}

import { tr } from '../i18n';
import type { Layer, NmrDocument, SpectrumMeta, TrackedRegion, TrendSettings } from '../state/types';
import { amountsFor, regionArea, standardEquiv } from './nmrYield';
import { indexRange } from './spectrum';

/** 名前の最初の数値を時間として読む ("24 h" → 24, "t = 0.5h" → 0.5) */
export function parseTime(label: string): number | null {
  const m = /-?\d+(?:\.\d+)?/.exec(label);
  return m ? Number(m[0]) : null;
}

/**
 * 範囲の強度。両端の数点の平均を結んだ直線をベースラインとして引く。
 * area: ppm 幅で積分した値 / height: ベースラインからの最大の高さ
 */
export function measureRegion(
  data: Float32Array,
  meta: Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset'>,
  from: number,
  to: number,
  measure: TrendSettings['measure'],
): number {
  const [i0, i1] = indexRange(meta, Math.min(from, to), Math.max(from, to));
  if (i1 - i0 < 2) return 0;
  const edge = Math.min(3, Math.floor((i1 - i0 + 1) / 3));
  let b0 = 0;
  let b1 = 0;
  for (let k = 0; k < edge; k++) {
    b0 += data[i0 + k];
    b1 += data[i1 - k];
  }
  b0 /= edge;
  b1 /= edge;
  const step = Math.abs(meta.last - meta.first) / (meta.n - 1);
  let sum = 0;
  let max = 0;
  for (let i = i0; i <= i1; i++) {
    const v = data[i] - (b0 + ((b1 - b0) * (i - i0)) / (i1 - i0));
    sum += v;
    if (v > max) max = v;
  }
  return measure === 'area' ? sum * step : max;
}

export interface TrendRow {
  layer: Layer;
  time: number;
  /** 入力した時間 / 名前から推定 / 測定時刻から (最初の測定 = 0) / 並び順で代用 */
  timeSource: 'set' | 'label' | 'acquired' | 'order';
  /** 範囲ごとの正規化前の値 (nH で割ったもの) */
  raw: (number | null)[];
  /** 範囲ごとのグラフに出す値 */
  values: (number | null)[];
}

export interface TrendResult {
  rows: TrendRow[];
  /** グラフに出す範囲 (基準の範囲は除く) */
  series: TrackedRegion[];
  xLabel: string;
  yLabel: string;
  /** 注意書き (正規化の前提など) */
  notes: string[];
}

export function computeTrend(doc: NmrDocument, dataMap: Record<string, Float32Array>): TrendResult {
  const t = doc.trend;
  const notes: string[] = [];
  const ref = t.normalize === 'reference' || t.normalize === 'sum' || t.normalize === 'yield' ? t.regions.find((r) => r.id === t.referenceId) : undefined;
  const series = t.regions.filter((r) => r !== ref);
  if ((t.normalize === 'reference' || t.normalize === 'yield') && !ref) notes.push(tr('基準にする範囲を選んでください'));
  if (t.normalize === 'yield' && !doc.yield) notes.push(tr('NMR 収率は、解析の「NMR 収率」で内標と量を入れると出ます'));

  const rows: TrendRow[] = [];
  const unitMs = TIME_UNITS[t.timeUnit.trim().toLowerCase()] ?? TIME_UNITS.h;
  const acquired = doc.layers
    .filter((l) => l.visible)
    .map((l) => doc.spectra.find((s) => s.id === l.spectrumId)?.acquiredAt)
    .filter((v): v is number => typeof v === 'number');
  const t0 = acquired.length ? Math.min(...acquired) : 0;
  doc.layers.forEach((layer, index) => {
    const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
    const data = dataMap[layer.spectrumId];
    if (!meta || !data || !layer.visible) return;
    const fromLabel = parseTime(layer.label);
    const fromClock = meta.acquiredAt ? Math.round(((meta.acquiredAt - t0) / unitMs) * 1000) / 1000 : null;
    const time = layer.time ?? fromLabel ?? fromClock ?? index;
    const timeSource = layer.time != null ? 'set' : fromLabel !== null ? 'label' : fromClock !== null ? 'acquired' : 'order';
    // NMR 収率は、収率の表と同じ面積 (図の積分と同じ足し方) にする
    const raw = t.regions.map(
      (r) => (t.normalize === 'yield' && t.measure === 'area' ? regionArea(doc, data, meta, r.from, r.to) : measureRegion(data, meta, r.from, r.to, t.measure)) / (r.nH || 1),
    );
    rows.push({ layer, time, timeSource, raw, values: [] });
  });
  rows.sort((a, b) => a.time - b.time);
  if (rows.some((r) => r.timeSource === 'order')) notes.push(tr('時間が分からないスペクトルは、並び順 (0, 1, 2…) で置いています'));
  if (rows.some((r) => r.timeSource === 'acquired')) notes.push(tr('時間は測定時刻から求めています (最初の測定 = 0)。反応開始からの時間にするときは、名前か「時間」に入れてください'));

  const col = (r: TrackedRegion) => t.regions.indexOf(r);
  for (const row of rows) {
    const refValue = ref ? row.raw[col(ref)] : null;
    // 内標の当量 (スペクトルごとの量があればそれ)
    const equiv = t.normalize === 'yield' && doc.yield ? standardEquiv(amountsFor(doc.yield, row.layer.id), doc.yield.standard) : null;
    const total = series.reduce((sum, r) => sum + Math.max(0, row.raw[col(r)] ?? 0), 0);
    row.values = t.regions.map((r, k) => {
      const v = row.raw[k];
      if (v === null || r === ref) return null;
      switch (t.normalize) {
        case 'none':
          return v;
        case 'first': {
          const first = rows[0].raw[k];
          return first ? (v / first) * 100 : null;
        }
        case 'reference':
          return refValue ? v / refValue : null;
        case 'sum':
          return total > 0 ? (Math.max(0, v) / total) * 100 : null;
        case 'yield':
          return refValue && equiv !== null ? (v / refValue) * equiv * 100 : null;
      }
    });
  }
  if (t.normalize === 'first') notes.push(tr('積算回数や受信感度がそろっていないと比べられません。内部標準があれば「基準との比」を使ってください'));

  const refName = ref?.name ?? tr('基準');
  const autoY = {
    none: t.measure === 'area' ? 'Integral (a.u.)' : 'Intensity (a.u.)',
    first: 'Relative intensity (%)',
    reference: `Ratio to ${refName}`,
    sum: 'Ratio (%)',
    yield: 'NMR yield (%)',
  }[t.normalize];
  return {
    rows,
    series,
    xLabel: t.xLabel || `Time (${t.timeUnit})`,
    yLabel: t.yLabel || autoY,
    notes,
  };
}

export function trendCsv(result: TrendResult, regions: TrackedRegion[]): string {
  const head = ['label', 'time', ...regions.flatMap((r) => [`${r.name} (raw/nH)`, `${r.name} (value)`])];
  const lines = result.rows.map((row) =>
    [csvCell(row.layer.label), row.time, ...regions.flatMap((_, k) => [fmt(row.raw[k]), fmt(row.values[k])])].join(','),
  );
  return [head.map(csvCell).join(','), ...lines].join('\r\n');
}

function fmt(v: number | null) {
  return v === null ? '' : String(Number(v.toPrecision(6)));
}

function csvCell(s: string) {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const TIME_UNITS: Record<string, number> = {
  s: 1000,
  sec: 1000,
  min: 60_000,
  h: 3_600_000,
  hr: 3_600_000,
  d: 86_400_000,
  day: 86_400_000,
};

/**
 * 内標を入れた crude の NMR 収率 (本人の希望 2026-10-09)。
 *
 * 生成物の mmol = (生成物の範囲の面積 / H の数) ÷ (内標の範囲の面積 / H の数) × 内標の mmol
 * 収率 (%)      = 生成物の mmol ÷ 基質 (限定試薬) の mmol × 100
 *              = (生成物 / H) ÷ (内標 / H) × 内標の当量 × 100 (当量で入れたときは mmol は要らない)
 * 面積は図の積分と同じ足し方 (lib/integrals.ts。「両端の直線を引く」の設定も同じ) なので、表の値は図の積分の値の比から確かめられる
 */
import { tr } from '../i18n';
import { INTERNAL_STANDARDS, type InternalStandard, type StandardSignal } from '../data/internalStandards';
import type { Layer, NmrDocument, SpectrumMeta, StandardUnit, YieldAmounts, YieldSetup } from '../state/types';
import type { SolventKey } from './impurityTypes';
import { integralArea } from './integrals';
import { indexAt, noiseLevel, ppmAt } from './spectrum';

export function allStandards(custom: InternalStandard[] = []): InternalStandard[] {
  return [...INTERNAL_STANDARDS, ...custom];
}

export function findStandard(id: string, custom: InternalStandard[] = []): InternalStandard | undefined {
  return allStandards(custom).find((s) => s.id === id);
}

/** その核種の信号がある内標 */
export function standardsFor(nucleus: string, custom: InternalStandard[] = []): InternalStandard[] {
  return allStandards(custom).filter((s) => s.signals.some((x) => x.nucleus === nucleus));
}

/** 溶媒での ppm の目安。exact = その溶媒の値があった (無ければ CDCl3 の値) */
export function expectedPpm(signal: StandardSignal, solvent: SolventKey | null): { ppm: number; exact: boolean } {
  const own = solvent ? signal.shifts[solvent] : undefined;
  if (own !== undefined) return { ppm: own, exact: true };
  const cdcl3 = signal.shifts.CDCl3 ?? Object.values(signal.shifts)[0] ?? 0;
  return { ppm: cdcl3, exact: solvent === 'CDCl3' };
}

/** 内標を選んだときに図に入れておく値 */
export function standardSnapshot(std: InternalStandard, signal: number): YieldSetup['standard'] {
  const s = std.signals[signal] ?? std.signals[0];
  return { name: std.name, mw: std.mw, ...(std.density ? { density: std.density } : {}), nucleus: s.nucleus, nH: s.n };
}

type Axis = Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset' | 'vendor'>;

/**
 * 信号の範囲 (表示の ppm) を探す。期待値 ± window の中の山の頂上 (両隣 2 点より高い点) のうち一番高いものを取り、
 * 両側へ、山の 1% より低くなるか、半分より下がったあとでまた上がり始める (ほかの山との谷) までを範囲にする
 * (端に 2 点の余裕、片側 maxHalf ppm まで)。窓の端の、となりの大きな山の裾は山の頂上ではないので取らない (crude の芳香族の横のメシチレンなど)
 */
export function findSignalRange(
  data: Float32Array,
  meta: Axis,
  ppm: number,
  window: number,
  maxHalf = 0.1,
): { from: number; to: number; top: number } | null {
  const a = Math.round(indexAt(meta, ppm + window));
  const b = Math.round(indexAt(meta, ppm - window));
  const lo = Math.max(2, Math.min(a, b));
  const hi = Math.min(meta.n - 3, Math.max(a, b));
  if (hi <= lo) return null;
  let top = -1;
  for (let i = lo; i <= hi; i++) {
    const v = data[i];
    if (v > data[i - 1] && v >= data[i + 1] && v > data[i - 2] && v >= data[i + 2] && (top < 0 || v > data[top])) top = i;
  }
  if (top < 0) return null;
  const peak = data[top];
  if (!(peak > noiseLevel(data) * 10)) return null;
  const floor = Math.max(peak * 0.01, noiseLevel(data) * 3);
  const steps = Math.max(2, Math.round(maxHalf / Math.abs((meta.last - meta.first) / (meta.n - 1))));
  const walk = (dir: 1 | -1) => {
    let i = top;
    for (let k = 0; k < steps && i + dir > 0 && i + dir < meta.n - 1; k++) {
      const next = data[i + dir];
      if (next < floor) break;
      // 谷 (ほかの山の手前) で止める
      if (next > data[i] && data[i] < peak * 0.5) break;
      i += dir;
    }
    return Math.max(0, Math.min(meta.n - 1, i + dir * 2));
  };
  const p1 = ppmAt(meta, walk(-1));
  const p2 = ppmAt(meta, walk(1));
  return { from: Math.max(p1, p2), to: Math.min(p1, p2), top: ppmAt(meta, top) };
}

/** 範囲 (表示の ppm) の面積。図の積分と同じ足し方 */
export function regionArea(doc: Pick<NmrDocument, 'figure'>, data: Float32Array, meta: Axis, from: number, to: number): number {
  return integralArea(data, meta, Math.max(from, to) - meta.refOffset, Math.min(from, to) - meta.refOffset, doc.figure.integralBaseline !== false);
}

/** 内標の mmol (量から。当量で入れたときは基質の mmol があれば) */
export function standardMmol(a: YieldAmounts, std: YieldSetup['standard']): number | null {
  if (a.amount === null || !(a.amount > 0)) return null;
  switch (a.unit) {
    case 'mg':
      return a.amount / std.mw;
    case 'uL':
      return std.density ? (a.amount * std.density) / std.mw : null;
    case 'mmol':
      return a.amount;
    case 'equiv':
      return a.substrateMmol ? a.amount * a.substrateMmol : null;
  }
}

/** 内標と基質の比 (内標の mmol ÷ 基質の mmol = 当量)。分からなければ null */
export function standardEquiv(a: YieldAmounts, std: YieldSetup['standard']): number | null {
  if (a.unit === 'equiv') return a.amount !== null && a.amount > 0 ? a.amount : null;
  const mmol = standardMmol(a, std);
  return mmol !== null && a.substrateMmol && a.substrateMmol > 0 ? mmol / a.substrateMmol : null;
}

/** スペクトルごとの量 (違う量を入れていなければ全体の量) */
export function amountsFor(setup: YieldSetup, layerId: string): YieldAmounts {
  return setup.perLayer[layerId] ?? { amount: setup.amount, unit: setup.unit, substrateMmol: setup.substrateMmol };
}

export interface YieldRow {
  layer: Layer;
  meta: SpectrumMeta;
  amounts: YieldAmounts;
  /** 内標の当量 (null は量が足りない) */
  equiv: number | null;
  /** 内標の面積 / H の数 */
  standardPerH: number;
  /** 生成物ごとの収率 (%) と mmol */
  yields: (number | null)[];
  mmol: (number | null)[];
}

export interface YieldResult {
  rows: YieldRow[];
  notes: string[];
}

/** 図のスペクトル (見えているもの・内標と同じ核種) ごとの NMR 収率 */
export function computeYields(doc: NmrDocument, dataMap: Record<string, Float32Array>): YieldResult {
  const setup = doc.yield;
  const notes: string[] = [];
  if (!setup || !setup.standardRange) return { rows: [], notes };
  const std = setup.standard;
  const rows: YieldRow[] = [];
  for (const layer of doc.layers) {
    const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
    const data = dataMap[layer.spectrumId];
    if (!meta || !data || !layer.visible || meta.nucleus !== std.nucleus) continue;
    const amounts = amountsFor(setup, layer.id);
    const equiv = standardEquiv(amounts, std);
    const standardPerH = regionArea(doc, data, meta, setup.standardRange.from, setup.standardRange.to) / std.nH;
    const mmolStd = standardMmol(amounts, std);
    const perH = setup.products.map((p) => regionArea(doc, data, meta, p.from, p.to) / (p.nH || 1));
    const ok = standardPerH > 0;
    rows.push({
      layer,
      meta,
      amounts,
      equiv,
      standardPerH,
      yields: perH.map((v) => (ok && equiv !== null ? (v / standardPerH) * equiv * 100 : null)),
      mmol: perH.map((v) => (ok && mmolStd !== null ? (v / standardPerH) * mmolStd : null)),
    });
  }
  if (rows.some((r) => r.standardPerH <= 0)) notes.push(tr('内標の範囲の面積が 0 以下のスペクトルがあります。内標の範囲を確かめてください'));
  if (rows.some((r) => r.equiv === null)) {
    notes.push(
      setup.unit === 'uL' && !std.density
        ? tr('この内標は密度が分からないので、μL では計算できません。mg か mmol で入れてください')
        : tr('内標の量と基質の mmol (当量なら当量) を入れると収率が出ます'),
    );
  }
  return { rows, notes };
}

/** 量の単位の名前 */
export function unitLabel(unit: StandardUnit): string {
  return unit === 'uL' ? 'μL' : unit === 'equiv' ? tr('当量') : unit;
}

/** 収率の文字 (例: 78%)。小数 1 桁 */
export function percent(v: number | null): string {
  return v === null ? '—' : `${v.toFixed(1)}%`;
}

/** 図に書く文字。生成物が 1 つなら「NMR yield: 78%」、いくつかなら「3a 78%, 3b 12% (NMR)」 */
export function figureText(setup: YieldSetup, row: YieldRow): string {
  if (setup.products.length === 1) return `NMR yield: ${percent(row.yields[0])}`;
  return `${setup.products.map((p, k) => `${p.name || `P${k + 1}`} ${percent(row.yields[k])}`).join(', ')} (NMR)`;
}

/** 内標の量の説明 (例: 1,3,5-Trimethoxybenzene 16.8 mg (0.100 mmol)) */
export function standardText(setup: YieldSetup, a: YieldAmounts): string {
  const mmol = standardMmol(a, setup.standard);
  const amount = a.amount === null ? '—' : `${a.amount} ${unitLabel(a.unit)}`;
  return `${setup.standard.name} ${amount}${a.unit !== 'mmol' && a.unit !== 'equiv' && mmol !== null ? ` (${mmol.toFixed(3)} mmol)` : ''}`;
}

/** ホーム画面のサンプルのメモに残す 1 行 */
export function memoLine(setup: YieldSetup, row: YieldRow, day: string): string {
  const products = setup.products.map((p, k) => `${p.name || tr('生成物 {n}', { n: k + 1 })} ${percent(row.yields[k])}`).join('、');
  const substrate = row.amounts.unit !== 'equiv' && row.amounts.substrateMmol ? tr('、基質 {mmol} mmol', { mmol: row.amounts.substrateMmol }) : '';
  return tr('NMR 収率 ({day}): {products} (内標 {standard}{substrate})', { day, products, standard: standardText(setup, row.amounts), substrate });
}

/** 表を Excel・ノートに貼る形 (タブ区切り) */
export function yieldTsv(setup: YieldSetup, result: YieldResult): string {
  const head = [tr('スペクトル'), ...setup.products.map((p, k) => `${p.name || tr('生成物 {n}', { n: k + 1 })} (%)`), tr('内標'), tr('内標の当量')];
  const lines = result.rows.map((r) => [
    r.layer.label || r.meta.title || r.meta.fileName,
    ...r.yields.map((v) => (v === null ? '' : v.toFixed(1))),
    standardText(setup, r.amounts),
    r.equiv === null ? '' : r.equiv.toFixed(3),
  ]);
  return [head, ...lines].map((cells) => cells.join('\t')).join('\n');
}

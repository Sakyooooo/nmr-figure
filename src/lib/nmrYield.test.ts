import { describe, expect, it } from 'vitest';
import { INTERNAL_STANDARDS } from '../data/internalStandards';
import { emptyDocument, type NmrDocument, type SpectrumMeta, type YieldSetup } from '../state/types';
import {
  computeYields,
  expectedPpm,
  figureText,
  findSignalRange,
  findStandard,
  memoLine,
  standardEquiv,
  standardMmol,
  standardSnapshot,
  standardsFor,
  yieldTsv,
} from './nmrYield';
import { computeTrend } from './trend';

/** 12 → −1 ppm、0.001 ppm おきのガウス形の山 (裾がすぐ 0 になるので、範囲の取り方で面積が変わらない) */
function spectrum(id: string, peaks: [number, number][], shift = 0) {
  const meta = {
    id,
    fileName: `${id}.jdf`,
    title: id,
    nucleus: '1H',
    axisName: 'Proton',
    solventRaw: 'CDCl3',
    solvent: 'CDCl3',
    freqMHz: 400,
    temperatureC: null,
    scans: null,
    experiment: 'proton',
    date: null,
    first: 12,
    last: -1,
    n: 13001,
    refOffset: 0,
    maxAbs: 1,
  } as SpectrumMeta;
  const data = new Float32Array(meta.n);
  for (let i = 0; i < meta.n; i++) {
    const ppm = meta.first + ((meta.last - meta.first) * i) / (meta.n - 1);
    for (const [c, h] of peaks) data[i] += h * Math.exp(-(((ppm - c - shift) / 0.004) ** 2) / 2);
  }
  return { meta, data };
}

const TMB = findStandard('tmb')!;

/** 内標 (TMB の 6.09 ppm、3H) と、生成物 (4.10 ppm、2H) の crude を重ねた図 */
function makeDoc(products: [number, number][][], setup: Partial<YieldSetup> = {}) {
  const doc = emptyDocument() as NmrDocument;
  const data: Record<string, Float32Array> = {};
  products.forEach((peaks, k) => {
    const s = spectrum(`S${k}`, [[6.09, 3000], ...peaks]);
    doc.spectra.push(s.meta);
    doc.layers.push({ id: `L${k}`, spectrumId: s.meta.id, visible: true, color: '#000', label: `run ${k + 1}`, scale: 1, lineWidth: 1 });
    data[s.meta.id] = s.data;
  });
  doc.yield = {
    standardId: 'tmb',
    signal: 0,
    standard: standardSnapshot(TMB, 0),
    standardRange: { from: 6.12, to: 6.06 },
    amount: 16.819,
    unit: 'mg',
    substrateMmol: 0.1,
    products: [{ id: 'P', name: '3a', from: 4.13, to: 4.07, nH: 2 }],
    perLayer: {},
    ...setup,
  };
  return { doc, data };
}

describe('NMR 収率', () => {
  it('(生成物 / H) ÷ (内標 / H) × 内標の当量。mg は分子量から mmol に', () => {
    // 生成物 1H あたり 780、内標 1H あたり 1000 → 0.78 × (0.1 mmol / 0.1 mmol) = 78%
    const { doc, data } = makeDoc([[[4.1, 1560]]]);
    const { rows, notes } = computeYields(doc, data);
    expect(notes).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].equiv).toBeCloseTo(1, 4);
    expect(rows[0].yields[0]).toBeCloseTo(78, 1);
    expect(rows[0].mmol[0]).toBeCloseTo(0.078, 4);
  });

  it('量の入れ方: μL (密度)・mmol・当量', () => {
    const mes = standardSnapshot(findStandard('mesitylene')!, 0);
    expect(standardMmol({ amount: 13.911, unit: 'uL', substrateMmol: 0.1 }, mes)).toBeCloseTo(0.1, 4);
    expect(standardEquiv({ amount: 0.05, unit: 'mmol', substrateMmol: 0.1 }, mes)).toBeCloseTo(0.5, 9);
    expect(standardEquiv({ amount: 0.5, unit: 'equiv', substrateMmol: null }, mes)).toBe(0.5);
    // 固体 (密度なし) を μL では計算しない
    expect(standardMmol({ amount: 10, unit: 'uL', substrateMmol: 0.1 }, standardSnapshot(TMB, 0))).toBeNull();
    // 当量で入れたら基質の mmol は要らない
    const { doc, data } = makeDoc([[[4.1, 1560]]], { amount: 0.5, unit: 'equiv', substrateMmol: null });
    expect(computeYields(doc, data).rows[0].yields[0]).toBeCloseTo(39, 1);
  });

  it('量が足りないと出さずに知らせる', () => {
    const { doc, data } = makeDoc([[[4.1, 1560]]], { substrateMmol: null });
    const r = computeYields(doc, data);
    expect(r.rows[0].yields[0]).toBeNull();
    expect(r.notes.length).toBe(1);
  });

  it('重ねた crude ごとに量を変えられる', () => {
    const { doc, data } = makeDoc([[[4.1, 1560]], [[4.1, 600]]], { perLayer: { L1: { amount: 33.638, unit: 'mg', substrateMmol: 0.1 } } });
    const { rows } = computeYields(doc, data);
    expect(rows.map((r) => Number(r.yields[0]!.toFixed(1)))).toEqual([78, 60]);
    expect(yieldTsv(doc.yield!, { rows, notes: [] }).split('\n')[2]).toMatch(/^run 2\t60\.0\t/);
  });

  it('推移グラフの「NMR 収率」も表と同じ値', () => {
    const { doc, data } = makeDoc([[[4.1, 1560]], [[4.1, 600]]]);
    doc.trend.regions = [
      { id: 'is', name: 'TMB', color: '#000', from: 6.12, to: 6.06, nH: 3 },
      { id: 'p', name: '3a', color: '#f00', from: 4.13, to: 4.07, nH: 2 },
    ];
    doc.trend.referenceId = 'is';
    doc.trend.normalize = 'yield';
    const table = computeYields(doc, data).rows.map((r) => r.yields[0]!);
    const trend = computeTrend(doc, data);
    expect(trend.yLabel).toBe('NMR yield (%)');
    trend.rows.forEach((row, i) => expect(row.values[1]).toBeCloseTo(table[i], 6));
  });

  it('内標の信号を探す (少しずれていても、近くの一番高い山の裾まで)', () => {
    const { meta, data } = spectrum('S', [[6.11, 3000], [6.3, 5000], [4.1, 1500]]);
    const r = findSignalRange(data, meta, 6.09, 0.15)!;
    expect(r.top).toBeCloseTo(6.11, 3);
    expect(r.from).toBeGreaterThan(6.115);
    expect(r.from).toBeLessThan(6.14);
    expect(r.to).toBeLessThan(6.105);
    expect(r.to).toBeGreaterThan(6.08);
    // 山が無ければ null
    expect(findSignalRange(data, meta, 9, 0.15)).toBeNull();
    // 小さな内標 (6.78) のとなりに大きく幅の広い山 (7.0) があり、窓の端ではそちらの裾の方が高いとき: 裾は取らない
    const crude = spectrum('C', [[6.78, 300]]);
    for (let i = 0; i < crude.meta.n; i++) {
      const p = crude.meta.first + ((crude.meta.last - crude.meta.first) * i) / (crude.meta.n - 1);
      crude.data[i] += 50000 * Math.exp(-(((p - 7.0) / 0.05) ** 2) / 2);
    }
    const m = findSignalRange(crude.data, crude.meta, 6.78, 0.15)!;
    expect(m.top).toBeCloseTo(6.78, 3);
    expect(m.from).toBeLessThan(6.81);
    expect(m.to).toBeGreaterThan(6.75);
  });

  it('内標の一覧: 溶媒ごとの値 (無ければ CDCl3 の値)・19F', () => {
    const ch2cl2 = findStandard('ch2cl2')!.signals[0];
    expect(expectedPpm(ch2cl2, 'DMSO-d6')).toEqual({ ppm: 5.76, exact: true });
    expect(expectedPpm(TMB.signals[0], 'C6D6')).toEqual({ ppm: 6.09, exact: false });
    expect(standardsFor('19F').map((s) => s.id)).toContain('phcf3');
    expect(standardsFor('1H').every((s) => s.signals.some((x) => x.nucleus === '1H'))).toBe(true);
    // id が重ならない
    expect(new Set(INTERNAL_STANDARDS.map((s) => s.id)).size).toBe(INTERNAL_STANDARDS.length);
  });

  it('図に書く文字・メモの 1 行', () => {
    const { doc, data } = makeDoc([[[4.1, 1560]]]);
    const row = computeYields(doc, data).rows[0];
    expect(figureText(doc.yield!, row)).toBe('NMR yield: 78.0%');
    const two = { ...doc.yield!, products: [...doc.yield!.products, { id: 'Q', name: '3b', from: 1, to: 0.9, nH: 3 }] };
    expect(figureText(two, computeYields({ ...doc, yield: two }, data).rows[0])).toMatch(/^3a 78\.0%, 3b 0\.0% \(NMR\)$/);
    expect(memoLine(doc.yield!, row, '2026-10-09')).toBe('NMR 収率 (2026-10-09): 3a 78.0% (内標 1,3,5-Trimethoxybenzene 16.819 mg (0.100 mmol)、基質 0.1 mmol)');
  });
});

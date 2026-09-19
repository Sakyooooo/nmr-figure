import { describe, expect, it } from 'vitest';
import { emptyDocument, type NmrDocument } from '../state/types';
import { computeTrend, measureRegion, parseTime, trendCsv } from './trend';

const axis = { first: 10, last: 0, n: 1001, refOffset: 0 };

/** 2 ppm と 5 ppm にピークがあるスペクトル (高さを指定) */
function spectrum(h2: number, h5: number, baseline = 0) {
  const d = new Float32Array(axis.n);
  for (let i = 0; i < axis.n; i++) {
    const x = axis.first + ((axis.last - axis.first) * i) / (axis.n - 1);
    d[i] = baseline + h2 * Math.exp(-(((x - 2) / 0.03) ** 2)) + h5 * Math.exp(-(((x - 5) / 0.03) ** 2));
  }
  return d;
}

function makeDoc(labels: string[]): NmrDocument {
  const doc = emptyDocument();
  labels.forEach((label, k) => {
    doc.spectra.push({
      id: `s${k}`,
      fileName: `${k}.jdf`,
      title: '',
      nucleus: '1H',
      axisName: 'Proton',
      solventRaw: '',
      solvent: 'CDCl3',
      freqMHz: 400,
      temperatureC: null,
      scans: null,
      experiment: '',
      date: null,
      ...axis,
      maxAbs: 1,
    });
    doc.layers.push({ id: `l${k}`, spectrumId: `s${k}`, visible: true, color: '#000', label, scale: 1, lineWidth: 1 });
  });
  doc.trend.regions = [
    { id: 'sm', name: 'SM', color: '#f00', from: 5.2, to: 4.8, nH: 1 },
    { id: 'pr', name: 'P', color: '#00f', from: 2.2, to: 1.8, nH: 2 },
  ];
  return doc;
}

describe('推移グラフ', () => {
  it('名前から時間を読む', () => {
    expect(parseTime('24 h')).toBe(24);
    expect(parseTime('t = 0.5h')).toBe(0.5);
    expect(parseTime('SM')).toBeNull();
  });

  it('面積はベースラインを引いて求める', () => {
    const a = measureRegion(spectrum(0, 1), axis, 5.2, 4.8, 'area');
    const b = measureRegion(spectrum(0, 1, 0.3), axis, 5.2, 4.8, 'area');
    // ガウス関数の面積 = h·σ√π
    expect(a).toBeCloseTo(0.03 * Math.sqrt(Math.PI), 3);
    expect(b).toBeCloseTo(a, 3);
    expect(measureRegion(spectrum(0, 1, 0.3), axis, 5.2, 4.8, 'height')).toBeCloseTo(1, 2);
  });

  it('合計を100%にするときは nH で割ってから比べ、時間順に並べる', () => {
    const doc = makeDoc(['24 h', '0 h']);
    // 24 h: SM 1H 分が 0.25、P (2H) が 1.5 → 1H あたり 0.75 → 25% / 75%
    const data = { s0: spectrum(1.5, 0.25), s1: spectrum(0, 1) };
    const r = computeTrend(doc, data);
    expect(r.rows.map((x) => x.time)).toEqual([0, 24]);
    expect(r.rows[0].values[0]).toBeCloseTo(100, 1);
    expect(r.rows[1].values[0]).toBeCloseTo(25, 1);
    expect(r.rows[1].values[1]).toBeCloseTo(75, 1);
    expect(r.yLabel).toBe('Ratio (%)');
    expect(trendCsv(r, doc.trend.regions).split('\r\n')).toHaveLength(3);
  });

  it('基準の範囲との比。基準はグラフに出さない', () => {
    const doc = makeDoc(['0 h']);
    doc.trend.normalize = 'reference';
    doc.trend.referenceId = 'pr';
    const r = computeTrend(doc, { s0: spectrum(2, 3) });
    expect(r.series.map((s) => s.id)).toEqual(['sm']);
    // SM (3) / (P 2 / nH 2 = 1) = 3
    expect(r.rows[0].values[0]).toBeCloseTo(3, 2);
    expect(r.rows[0].values[1]).toBeNull();
  });

  it('時間が分からないときは並び順を使い、注意を出す', () => {
    const doc = makeDoc(['SM', 'crude']);
    const r = computeTrend(doc, { s0: spectrum(1, 1), s1: spectrum(1, 1) });
    expect(r.rows.map((x) => x.time)).toEqual([0, 1]);
    expect(r.notes.length).toBe(1);
  });
});

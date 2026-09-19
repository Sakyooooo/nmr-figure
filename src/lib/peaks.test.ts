import { describe, expect, it } from 'vitest';
import { emptyDocument, type NmrDocument, type SpectrumMeta } from '../state/types';
import { peakRows, peakTableText, peakValuesText } from './peaks';
import { detectSignals } from './siText';

const N = 4001;

/** 7.00 (高さ 1)、3.50 (0.5)、1.00 (0.02) にピークがある 1H スペクトル */
function sample(refOffset = 0): { doc: NmrDocument; meta: SpectrumMeta; data: Float32Array } {
  const meta: SpectrumMeta = {
    id: 's',
    fileName: 'h.jdf',
    title: '',
    nucleus: '1H',
    axisName: 'Proton',
    solventRaw: 'BENZENE-D6',
    solvent: 'C6D6',
    freqMHz: 400,
    temperatureC: 23,
    scans: 8,
    experiment: '',
    date: null,
    decoupled: null,
    first: 10,
    last: 0,
    n: N,
    refOffset,
    maxAbs: 1,
  };
  const data = new Float32Array(N);
  const put = (ppm: number, h: number) => {
    const i = Math.round(((meta.first - (ppm - refOffset)) / (meta.first - meta.last)) * (N - 1));
    data[i] += h;
    data[i - 1] += h / 2;
    data[i + 1] += h / 2;
  };
  put(7, 1);
  put(3.5, 0.5);
  put(1, 0.02);
  for (let i = 0; i < N; i++) data[i] += (((i * 7919) % 101) / 101 - 0.5) * 1e-4;
  const doc = emptyDocument();
  doc.spectra.push(meta);
  doc.layers.push({ id: 'l', spectrumId: 's', visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 });
  return { doc, meta, data };
}

describe('ピーク値の一覧', () => {
  it('ppm の大きい順に並べ、一番高いピークを 100% にする', () => {
    const { doc, data } = sample();
    doc.peakLabels.push({ id: 'b', layerId: 'l', ppm: 3.5 }, { id: 'a', layerId: 'l', ppm: 7 });
    const rows = peakRows(doc, { s: data }, 'l');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[0].ppm).toBeCloseTo(7, 3);
    expect(rows[0].relative).toBeCloseTo(100, 1);
    expect(rows[1].relative).toBeCloseTo(50, 0);
  });

  it('基準合わせのずれを足した ppm で読む', () => {
    const { doc, data } = sample(0.1);
    // 表示 7.00 のピークは、覚えている ppm では 6.90
    doc.peakLabels.push({ id: 'a', layerId: 'l', ppm: 6.9 });
    const rows = peakRows(doc, { s: data }, 'l');
    expect(rows[0].ppm).toBeCloseTo(7, 3);
    expect(rows[0].height).toBeGreaterThan(0.9);
  });

  it('ほかのスペクトルのラベルは混ざらない', () => {
    const { doc, data } = sample();
    doc.peakLabels.push({ id: 'a', layerId: 'l', ppm: 7 }, { id: 'x', layerId: 'other', ppm: 3.5 });
    expect(peakRows(doc, { s: data }, 'l')).toHaveLength(1);
  });

  it('データがなければ空', () => {
    const { doc } = sample();
    doc.peakLabels.push({ id: 'a', layerId: 'l', ppm: 7 });
    expect(peakRows(doc, {}, 'l')).toEqual([]);
  });

  it('表と値の文', () => {
    const rows = [
      { id: 'a', ppm: 7.2616, height: 1, relative: 100 },
      { id: 'b', ppm: 3.4512, height: 0.25, relative: 25 },
    ];
    expect(peakTableText(rows, 3)).toBe('δ (ppm)\t高さ (%)\n7.262\t100.0\n3.451\t25.0');
    expect(peakValuesText(rows, 2)).toBe('7.26, 3.45');
  });
});

describe('自動で積分する範囲', () => {
  it('表示範囲だけにすると、外の信号は拾わない', () => {
    const { doc, meta, data } = sample();
    const all = detectSignals(data, meta, [], { minFraction: 0.01 });
    expect(all.length).toBe(3);
    const near = detectSignals(data, meta, [], { range: [8, 5], minFraction: 0.01 });
    expect(near.length).toBe(1);
    expect(near[0][0]).toBeGreaterThan(7);
    expect(near[0][1]).toBeLessThan(7);
    expect(doc.integrals).toHaveLength(0);
  });

  it('高さの下限を上げると、小さい信号は落ちる', () => {
    const { meta, data } = sample();
    expect(detectSignals(data, meta, [], { minFraction: 0.01 }).length).toBe(3);
    // 1.00 の信号は一番高いピークの 2% しかないので、既定 (3%) では落ちる
    expect(detectSignals(data, meta, []).length).toBe(2);
  });
});

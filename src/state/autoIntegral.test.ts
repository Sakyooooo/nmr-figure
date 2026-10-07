import { describe, expect, it } from 'vitest';
import { integralValues } from '../lib/integrals';
import { autoDetectSignals, loadDocument, useEditor } from './store';
import { emptyDocument, type SpectrumMeta } from './types';

/** 12 → −1 ppm、0.001 ppm おきのローレンツ形の山の和 */
function spectrum(peaks: [number, number, number][]) {
  const meta: SpectrumMeta = {
    id: 'S',
    fileName: 'test.jdf',
    title: 'test',
    nucleus: '1H',
    axisName: 'Proton',
    solventRaw: 'BENZENE-D6',
    solvent: 'C6D6',
    freqMHz: 400,
    temperatureC: null,
    scans: null,
    experiment: 'proton',
    date: null,
    first: 12,
    last: -1,
    n: 13001,
    refOffset: 0,
    maxAbs: 1000,
  };
  const data = new Float32Array(meta.n);
  for (let i = 0; i < meta.n; i++) {
    const ppm = meta.first + ((meta.last - meta.first) * i) / (meta.n - 1);
    for (const [c, h, w] of peaks) data[i] += (h * w * w) / ((ppm - c) ** 2 + w * w);
  }
  return { meta, data };
}

describe('自動で積分', () => {
  it('溶媒の大きなピークの裾に乗った山 (値がマイナスになる範囲) は作らない。ほかの積分がマイナスにならない', () => {
    // C6D5H (7.15) の裾の 7.08 に小さな山、3.60 にふつうの信号
    const { meta, data } = spectrum([
      [7.15, 1000, 0.01],
      [7.08, 15, 0.002],
      [3.6, 300, 0.002],
    ]);
    const doc = emptyDocument();
    doc.spectra = [meta];
    doc.layers = [{ id: 'L', spectrumId: 'S', visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 }];
    loadDocument(doc, { S: data }, null, null);
    expect(autoDetectSignals('L')).toBe(1);
    const st = useEditor.getState();
    expect(st.doc.integrals).toHaveLength(1);
    const x = st.doc.integrals[0];
    expect(Math.max(x.from, x.to)).toBeLessThan(4);
    expect(integralValues(st.doc, st.data).values.get(x.id)).toBeCloseTo(1);
  });
});

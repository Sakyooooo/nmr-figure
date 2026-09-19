import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../state/types';
import { cumulative, integralArea, integralValues, isReference } from './integrals';

const meta = { first: 10, last: 0, n: 1001, refOffset: 0 };

/** 7 ppm に面積 3、2 ppm に面積 1 のピーク (ガウス関数) */
function spectrum() {
  const d = new Float32Array(meta.n);
  const w = 0.02;
  for (let i = 0; i < meta.n; i++) {
    const x = meta.first + ((meta.last - meta.first) * i) / (meta.n - 1);
    d[i] = (3 / (w * Math.sqrt(Math.PI))) * Math.exp(-(((x - 7) / w) ** 2)) + (1 / (w * Math.sqrt(Math.PI))) * Math.exp(-(((x - 2) / w) ** 2));
  }
  return d;
}

function doc() {
  const d = emptyDocument();
  d.spectra.push({
    id: 's',
    fileName: 'a.jdf',
    title: '',
    nucleus: '1H',
    axisName: 'Proton',
    solventRaw: '',
    solvent: null,
    freqMHz: 400,
    temperatureC: null,
    scans: null,
    experiment: '',
    date: null,
    ...meta,
    maxAbs: 1,
  });
  d.layers.push({ id: 'l', spectrumId: 's', visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 });
  d.integrals.push({ id: 'a', layerId: 'l', from: 7.2, to: 6.8 }, { id: 'b', layerId: 'l', from: 2.2, to: 1.8 });
  return d;
}

describe('積分', () => {
  it('面積を求める', () => {
    expect(integralArea(spectrum(), meta, 7.2, 6.8)).toBeCloseTo(3, 2);
  });

  it('基準がなければ最初の積分を 1 にする', () => {
    const { values } = integralValues(doc(), { s: spectrum() });
    expect(values.get('a')).toBeCloseTo(1, 3);
    expect(values.get('b')).toBeCloseTo(1 / 3, 3);
  });

  it('値を書き換えると、その積分を基準にそろえる', () => {
    const d = doc();
    d.layers[0].integralRef = { id: 'b', value: 2 };
    const { values } = integralValues(d, { s: spectrum() });
    expect(values.get('a')).toBeCloseTo(6, 2);
    expect(values.get('b')).toBeCloseTo(2, 5);
    expect(isReference(d, d.integrals[1])).toBe(true);
  });

  it('基準の積分を消したら最初の積分に戻る', () => {
    const d = doc();
    d.layers[0].integralRef = { id: 'gone', value: 2 };
    expect(integralValues(d, { s: spectrum() }).values.get('a')).toBeCloseTo(1, 3);
    expect(isReference(d, d.integrals[0])).toBe(true);
  });

  it('積分曲線は左 (大きい ppm) から右へ増える', () => {
    const pts = cumulative(spectrum(), meta, 7.2, 6.8, 50);
    expect(pts.length).toBeLessThanOrEqual(51);
    expect(pts[0].i).toBeLessThan(pts[pts.length - 1].i);
    expect(pts[pts.length - 1].value).toBeCloseTo(3, 2);
  });

  it('基準合わせをしても同じピークを積分する', () => {
    const shifted = { ...meta, refOffset: 0.5 };
    expect(integralArea(spectrum(), shifted, 7.2, 6.8)).toBeCloseTo(3, 2);
  });
});

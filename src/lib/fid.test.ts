import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyDocument } from '../state/types';
import { fft, finish, jeolGroupDelay, referenceShift, transform } from './fid';
import { readJdf, type LoadedSpectrum } from './jdf';
import { parseProject, serializeProject } from './projectFile';
import { defaultSettings, labReference } from './settings';
import { snapToPeak } from './spectrum';

describe('FID の処理の部品', () => {
  it('FFT: 周波数 k の複素正弦波は k 番目に出る', () => {
    const n = 64;
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      re[t] = Math.cos((2 * Math.PI * 5 * t) / n);
      im[t] = Math.sin((2 * Math.PI * 5 * t) / n);
    }
    fft(re, im);
    const mags = Array.from(re, (r, i) => Math.hypot(r, im[i]));
    expect(mags.indexOf(Math.max(...mags))).toBe(5);
    expect(mags[5]).toBeCloseTo(n, 6);
  });

  it('JEOL のデジタルフィルターの遅れ', () => {
    expect(jeolGroupDelay('25473', '82')).toBeCloseTo(19.656, 3);
    expect(jeolGroupDelay('22873', '42')).toBeCloseTo(19.6875, 4);
    expect(jeolGroupDelay('', '')).toBe(0);
  });

  it('溶媒の三重線は中央の線で基準を合わせる', () => {
    const n = 2001;
    const data = new Float64Array(n);
    // 130〜126 ppm。127.99 を中心に 0.24 ppm 間隔の三重線、少し離れて化合物のピーク
    const at = (ppm: number) => Math.round(((130 - ppm) / 4) * (n - 1));
    for (const p of [127.75, 127.99, 128.23]) data[at(p)] = 1;
    data[at(127.5)] = 1.5;
    expect(referenceShift(data, 130, 126, 128.06, '13C')).toBeCloseTo(0.07, 2);
  });
});

const dir = join(import.meta.dirname, '../../samples');
const has = (f: string) => existsSync(join(dir, f));
const read = (f: string) => {
  const buf = readFileSync(join(dir, f));
  const settings = defaultSettings();
  return readJdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), f, {
    reference: (s, n) => labReference(settings, s, n),
  });
};

/**
 * 2つのスペクトルの相関係数 (b の点で比べる)。基準のずれは ±0.2 ppm の範囲で一番合うところを使う。
 * range を渡すとその範囲 (b の ppm) だけで比べる
 */
function similarity(a: Pick<LoadedSpectrum, 'meta' | 'data'>, b: LoadedSpectrum, range?: [number, number]) {
  const { meta: m, data: x } = a;
  const { meta: d, data: y } = b;
  const step = Math.abs(d.last - d.first) / (d.n - 1);
  let best = -1;
  for (let lag = -0.2; lag <= 0.2; lag += step / 2) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let j = 0; j < d.n; j += 2) {
      const at = d.first + ((d.last - d.first) * j) / (d.n - 1);
      if (range && (at > range[0] || at < range[1])) continue;
      const i = Math.round(((at + lag - m.refOffset - m.first) / (m.last - m.first)) * (m.n - 1));
      if (i < 0 || i >= m.n) continue;
      xs.push(x[i]);
      ys.push(y[j]);
    }
    const mx = xs.reduce((t, v) => t + v, 0) / xs.length;
    const my = ys.reduce((t, v) => t + v, 0) / ys.length;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let k = 0; k < xs.length; k++) {
      sxy += (xs[k] - mx) * (ys[k] - my);
      sxx += (xs[k] - mx) ** 2;
      syy += (ys[k] - my) ** 2;
    }
    best = Math.max(best, sxy / Math.sqrt(sxx * syy));
  }
  return best;
}

describe.skipIf(!has('fid-c6d6-1h.jdf') || !has('sample-c6d6-1h.jdf'))('実データの FID', () => {
  it('1H: Delta で処理したスペクトルとほぼ同じになる', () => {
    const fid = read('fid-c6d6-1h.jdf');
    const delta = read('sample-c6d6-1h.jdf');
    expect(fid.meta.processing).toBeTruthy();
    expect(fid.fid).toBeTruthy();
    // Delta と同じく溶媒 (C6D6) を 7.15 に合わせる。Delta 側のずれも +0.0585 ppm だった
    expect(fid.meta.refOffset).toBeCloseTo(0.0585, 3);
    expect(snapToPeak(fid.data, fid.meta, 7.15, 0.05)!.ppm).toBeCloseTo(7.15, 3);
    // 同じ ppm で強度を比べる
    const m = fid.meta;
    const d = delta.meta;
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < m.n; i += 2) {
      const ppm = m.first + ((m.last - m.first) * i) / (m.n - 1) + m.refOffset;
      const j = Math.round(((ppm - d.first) / (d.last - d.first)) * (d.n - 1));
      if (j < 0 || j >= d.n) continue;
      sxy += fid.data[i] * delta.data[j];
      sxx += fid.data[i] ** 2;
      syy += delta.data[j] ** 2;
    }
    expect(sxy / Math.sqrt(sxx * syy)).toBeGreaterThan(0.99);
    // 位相が合っていれば、大きな負のピークはない
    const min = Math.min(...fid.data);
    expect(min / fid.meta.maxAbs).toBeGreaterThan(-0.02);
  });

  it.skipIf(!has('sample-c6d6-31p.jdf'))('31P: Delta で処理したものと形が同じ', () => {
    const ours = read('fid-c6d6-31p.jdf');
    expect(similarity(ours, read('sample-c6d6-31p.jdf'))).toBeGreaterThan(0.98);
    // 装置の遅れを補正したので、残りの 1次位相は小さい
    expect(Math.abs(ours.meta.processing!.ph1)).toBeLessThan(120);
  });

  it.skipIf(!has('delta-13c.jdf') || !has('fid-13c.jdf'))('13C: 溶媒から遠い脂肪族のピークも吸収形になる', () => {
    // 溶媒が飛び抜けて大きく、全体の形で位相を探すと 1次位相を外して、遠くのピークが分散形になりやすい
    const ours = read('fid-13c.jdf');
    const delta = read('delta-13c.jdf');
    expect(similarity(ours, delta)).toBeGreaterThan(0.98);
    expect(similarity(ours, delta, [60, 10])).toBeGreaterThan(0.9);
    // 1次位相を大きく外したもの (以前の自動補正の結果) は、脂肪族の部分が合わない
    const p = ours.meta.processing!;
    const wrong = finish(transform(ours.fid!, p.lb), { ...p, ph1: -144 });
    expect(similarity({ meta: ours.meta, data: wrong }, delta, [60, 10])).toBeLessThan(0.7);
  });

  it.each(['fid-c6d6-31p.jdf', 'fid-13c.jdf', 'fid-19f.jdf'].filter(has))('%s を処理できる', (f) => {
    const { meta, data } = read(f);
    expect(meta.processing).toBeTruthy();
    expect(Math.min(...data) / meta.maxAbs).toBeGreaterThan(-0.05);
    if (meta.nucleus === '13C' && meta.solvent === 'C6D6') {
      // C6D6 の三重線の中央が 128.06 に来る
      expect(snapToPeak(data, meta, 128.06, 0.05)!.ppm).toBeCloseTo(128.06, 2);
    }
  });

  it('保存して開き直しても FID が残る', () => {
    const fid = read('fid-c6d6-1h.jdf');
    const doc = emptyDocument();
    doc.spectra.push(fid.meta);
    const back = parseProject(serializeProject(doc, { [fid.meta.id]: fid.data }, { [fid.meta.id]: fid.fid! }));
    expect(back.fids[fid.meta.id].re).toEqual(fid.fid!.re);
    expect(back.fids[fid.meta.id].groupDelay).toBeCloseTo(fid.fid!.groupDelay, 6);
    expect(back.doc.spectra[0].processing).toEqual(fid.meta.processing);
  });
});

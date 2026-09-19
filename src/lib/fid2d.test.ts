import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contourLevels, contourPath, sampleGrid } from './contour';
import { ppm1At, ppm2At, transform2d, type Fid2dData } from './fid2d';
import { readJdf2d } from './jdf2d';
import { emptyDocument, defaultPlot2d } from '../state/types';
import { parseProject, serializeProject } from './projectFile';

/**
 * (ppm2, ppm1) にピークが 1本出るはずの FID (読み込みが終わった形)。
 * F2 は exp(+i2πf·t2) が +f に出て、F1 は共役してから FT するので -f に出る。
 */
function syntheticFid(ppm2: number, ppm1: number): Fid2dData {
  const n2 = 256;
  const n1 = 64;
  const sw2 = 4000;
  const sw1 = 2000;
  const refMHz = 400;
  const f2 = ppm2 * refMHz;
  const f1 = -ppm1 * refMHz;
  const re: Float32Array[] = [];
  const im: Float32Array[] = [];
  for (let r = 0; r < n1; r++) {
    const t1 = r / sw1;
    const rowRe = new Float32Array(n2);
    const rowIm = new Float32Array(n2);
    for (let k = 0; k < n2; k++) {
      const t2 = k / sw2;
      const decay = Math.exp(-(t2 * 8 + t1 * 8));
      const phase = 2 * Math.PI * (f2 * t2 + f1 * t1);
      rowRe[k] = decay * Math.cos(phase);
      rowIm[k] = decay * Math.sin(phase);
    }
    re.push(rowRe);
    im.push(rowIm);
  }
  return {
    re,
    im,
    x: { sw: sw2, refMHz, offsetPpm: 0, clip: 1 },
    y: { sw: sw1, refMHz, offsetPpm: 0, clip: 1 },
  };
}

describe('2D の FT', () => {
  it('ピークが F2・F1 の正しい位置に出る', () => {
    const s = transform2d(syntheticFid(1.0, -0.5), { window: 'none', zf2: 1, zf1: 1 });
    let best = { v: -1, row: 0, col: 0 };
    for (let r = 0; r < s.n1; r++) {
      for (let c = 0; c < s.n2; c++) {
        const v = s.data[r * s.n2 + c];
        if (v > best.v) best = { v, row: r, col: c };
      }
    }
    expect(ppm2At(s, best.col)).toBeCloseTo(1.0, 1);
    expect(ppm1At(s, best.row)).toBeCloseTo(-0.5, 1);
    expect(s.maxAbs).toBeGreaterThan(s.noise * 50);
  });

  it('軸の端と点の数', () => {
    const s = transform2d(syntheticFid(0, 0), { window: 'sine', zf2: 1, zf1: 2 });
    // 幅 4000 Hz / 400 MHz = 10 ppm を中心 0 で
    expect(s.first2).toBeCloseTo(5, 1);
    expect(s.last2).toBeCloseTo(-5, 1);
    expect(s.first1).toBeCloseTo(2.5, 1);
    expect(s.n1).toBe(128);
  });
});

describe('等高線', () => {
  it('しきい値の高さで線が出る', () => {
    // 中央に山を1つ作る
    const n = 32;
    const data = new Float32Array(n * n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        data[r * n + c] = Math.exp(-((r - 16) ** 2 + (c - 16) ** 2) / 8);
      }
    }
    const s = { data, n2: n, n1: n, first2: 10, last2: 0, first1: 10, last1: 0, maxAbs: 1, noise: 0 };
    const grid = sampleGrid(s, { xMax: 10, xMin: 0, yMax: 10, yMin: 0 }, 64, 64);
    const { d } = contourPath(grid, 0.5, (x, y) => [x * 10, y * 10]);
    expect(d.length).toBeGreaterThan(0);
    // 山より高いしきい値では線が出ない
    expect(contourPath(grid, 1.5, (x, y) => [x, y]).d).toBe('');
  });

  it('線が多すぎるときは打ち切る (雑音ばかりのとき)', () => {
    const n = 200;
    const data = new Float32Array(n * n);
    for (let i = 0; i < data.length; i++) data[i] = Math.random();
    const s = { data, n2: n, n1: n, first2: 10, last2: 0, first1: 10, last1: 0, maxAbs: 1, noise: 0.5 };
    const grid = sampleGrid(s, { xMax: 10, xMin: 0, yMax: 10, yMin: 0 }, 400, 400);
    const out = contourPath(grid, 0.5, (x, y) => [x, y], 100);
    expect(out.truncated).toBe(true);
    expect(out.d).toBe('');
  });

  it('等高線の高さは倍率で増える', () => {
    expect(contourLevels(100, 0.1, 3, 2)).toEqual([10, 20, 40]);
    // 最大値を超えたら止める
    expect(contourLevels(100, 0.5, 5, 2)).toEqual([50, 100]);
  });
});

const dir = join(import.meta.dirname, '../../samples');
const has = (f: string) => existsSync(join(dir, f));

describe.skipIf(!has('cosy-2d.jdf'))('実データの 2D (COSY)', () => {
  const read = () => {
    const buf = readFileSync(join(dir, 'cosy-2d.jdf'));
    return readJdf2d(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), 'cosy-2d.jdf');
  };

  it('対角線の上にピークが並ぶ', () => {
    const { meta, data } = read();
    expect(meta.x.nucleus).toBe('1H');
    expect(meta.y.nucleus).toBe('1H');
    expect(meta.experiment).toMatch(/cosy/i);
    // 強いピークを拾うと、どれも F1 ≒ F2 (対角線) になる
    const peaks: { f2: number; f1: number; v: number }[] = [];
    for (let r = 2; r < data.n1 - 2; r++) {
      for (let c = 2; c < data.n2 - 2; c++) {
        const v = data.data[r * data.n2 + c];
        if (v < data.maxAbs * 0.2) continue;
        let top = true;
        for (let dr = -2; dr <= 2 && top; dr++) for (let dc = -2; dc <= 2; dc++) if (data.data[(r + dr) * data.n2 + c + dc] > v) top = false;
        if (top) peaks.push({ f2: ppm2At(data, c), f1: ppm1At(data, r), v });
      }
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    for (const p of peaks) expect(Math.abs(p.f2 - p.f1)).toBeLessThan(0.1);
    // 1H のピーク (溶媒 7.15 付近) が含まれる
    expect(peaks.some((p) => Math.abs(p.f2 - 7.1) < 0.15)).toBe(true);
  });

  it('交差ピークは対角線について対称', () => {
    const { data } = read();
    const at = (f2: number, f1: number) => {
      const c = Math.round(((f2 - data.first2) / (data.last2 - data.first2)) * (data.n2 - 1));
      const r = Math.round(((f1 - data.first1) / (data.last1 - data.first1)) * (data.n1 - 1));
      let m = 0;
      for (let dr = -3; dr <= 3; dr++) for (let dc = -6; dc <= 6; dc++) m = Math.max(m, data.data[(r + dr) * data.n2 + c + dc] ?? 0);
      return m / data.maxAbs;
    };
    // iPr の CH3 (1.2) と CH (3.8) の交差ピーク
    expect(at(1.25, 3.8)).toBeGreaterThan(data.noise / data.maxAbs * 10);
    expect(at(3.8, 1.25)).toBeGreaterThan(data.noise / data.maxAbs * 10);
  });

  it('保存して開き直すと、同じ 2D に戻る', () => {
    const { meta, data, fid } = read();
    const doc = emptyDocument();
    doc.spectra2d.push(meta);
    doc.plot2d = defaultPlot2d(meta);
    const back = parseProject(serializeProject(doc, {}, {}, { [meta.id]: fid }));
    expect(back.doc.spectra2d[0].fileName).toBe('cosy-2d.jdf');
    const again = back.data2d[meta.id];
    expect(again.n2).toBe(data.n2);
    expect(again.n1).toBe(data.n1);
    expect(again.maxAbs).toBeCloseTo(data.maxAbs, 5);
  });
});

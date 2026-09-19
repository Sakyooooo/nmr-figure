import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findImpurityCandidates, referenceCorrection } from './impurities';
import { readJdf } from './jdf';
import { decimalsFor, niceStep, spreadLabels } from './labels';
import { autoTitle } from './layout';
import { normalizeNucleus } from './nuclei';
import { parseProject, serializeProject } from './projectFile';
import { parseRich, plainText } from './richText';
import { defaultSettings, labReference } from './settings';
import { detectSolvent } from './solvents';
import { findPeaks, noiseLevel, ppmAt, snapToPeak } from './spectrum';
import { emptyDocument } from '../state/types';

describe('spreadLabels', () => {
  it('重ならないように広げ、範囲内に収める', () => {
    const xs = spreadLabels([100, 101, 102, 300, 10], 12, 0, 400);
    const sorted = [...xs].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(12 - 1e-9);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(xs[3]).toBe(300);
  });
  it('端では内側に寄せる', () => {
    const xs = spreadLabels([398, 399, 400], 10, 0, 400);
    expect(Math.max(...xs)).toBeLessThanOrEqual(400);
  });
});

describe('目盛り', () => {
  it('きりのよい間隔と小数桁', () => {
    expect(niceStep(11, 11)).toBe(1);
    expect(niceStep(220, 11)).toBe(20);
    expect(decimalsFor(1)).toBe(1);
    expect(decimalsFor(0.05)).toBe(2);
    expect(decimalsFor(20)).toBe(1);
  });
});

describe('名前の判定', () => {
  it('溶媒', () => {
    expect(detectSolvent('BENZENE-D6')).toBe('C6D6');
    expect(detectSolvent('CHLOROFORM-D')).toBe('CDCl3');
    expect(detectSolvent('CHLOROBENZENE-D5')).toBe('C6D5Cl');
    expect(detectSolvent('ACETONITRILE-D3')).toBe('CD3CN');
    expect(detectSolvent('ACETONE-D6')).toBe('acetone-d6');
    expect(detectSolvent('DMSO-D6')).toBe('DMSO-d6');
    expect(detectSolvent('METHYLENE CHLORIDE-D2')).toBe('CD2Cl2');
    expect(detectSolvent('')).toBeNull();
  });
  it('核種', () => {
    expect(normalizeNucleus('Proton')).toBe('1H');
    expect(normalizeNucleus('Carbon13')).toBe('13C');
    expect(normalizeNucleus('Phosphorus31')).toBe('31P');
    expect(normalizeNucleus('Fluorine19')).toBe('19F');
  });
  it('リッチテキスト', () => {
    expect(parseRich('^{1}H NMR (C_{6}D_{6})')).toEqual([
      { text: '1', kind: 'sup' },
      { text: 'H NMR (C', kind: 'normal' },
      { text: '6', kind: 'sub' },
      { text: 'D', kind: 'normal' },
      { text: '6', kind: 'sub' },
      { text: ')', kind: 'normal' },
    ]);
  });
  it('リッチテキスト (斜体・太字)', () => {
    expect(parseRich('*{J. Am. Chem. Soc.} **{2024}, *{146}, 1234.')).toEqual([
      { text: 'J. Am. Chem. Soc.', kind: 'italic' },
      { text: ' ', kind: 'normal' },
      { text: '2024', kind: 'bold' },
      { text: ', ', kind: 'normal' },
      { text: '146', kind: 'italic' },
      { text: ', 1234.', kind: 'normal' },
    ]);
    expect(plainText('*{J. Am. Chem. Soc.} **{2024}')).toBe('J. Am. Chem. Soc. 2024');
  });
});

describe('不純物の照合', () => {
  const base = { nucleus: '1H', tolerance: 0.03, custom: [] };
  it('研究室の基準値との差で補正する (C6D6: 7.15 vs 表 7.16)', () => {
    expect(referenceCorrection({ nucleus: '1H', solvent: 'C6D6', labReference: 7.15 })).toBeCloseTo(-0.01);
  });
  it('Hexane とグリースはどちらも候補になる (CDCl3 の 1.26 / 0.86)', () => {
    const peaks = [
      { ppm: 7.26, height: 10 },
      { ppm: 1.535, height: 5 },
      { ppm: 1.258, height: 2 },
      { ppm: 0.86, height: 1 },
      { ppm: 0.07, height: 3 },
    ];
    const c = findImpurityCandidates(peaks, { ...base, solvent: 'CDCl3', labReference: 7.26 });
    const ids = c.map((x) => x.compoundId);
    expect(ids[0]).toBe('solvent-residual');
    expect(ids).toContain('water');
    expect(ids).toContain('hexane');
    expect(ids).toContain('grease');
    expect(ids).toContain('hmdso');
    expect(ids).not.toContain('chloroform');
    const grease = c.find((x) => x.compoundId === 'grease')!;
    expect(grease.matched).toBe(2);
    const water = c.find((x) => x.compoundId === 'water')!;
    expect(water.signals[0].observed?.ppm).toBe(1.535);
  });
  it('自作の不純物は補正せずに照合する', () => {
    const c = findImpurityCandidates([{ ppm: 140.2, height: 1 }], {
      nucleus: '31P',
      solvent: 'C6D6',
      labReference: null,
      tolerance: 0.5,
      custom: [{ id: 'p', name: 'P(OMe)_{3}', nucleus: '31P', solvent: 'any', shifts: [140.0] }],
    });
    expect(c.map((x) => x.compoundId)).toEqual(['p']);
  });
});

describe('スペクトルの計算', () => {
  const meta = { first: 10, last: 0, n: 1001, refOffset: 0 };
  const data = new Float32Array(1001);
  for (let i = 0; i < 1001; i++) {
    const x = ppmAt(meta, i);
    data[i] = 100 * Math.exp(-(((x - 7.263) / 0.004) ** 2)) + 20 * Math.exp(-(((x - 1.56) / 0.01) ** 2)) + ((i * 7919) % 13) / 13;
  }
  it('ピーク検出と頂点の補間', () => {
    const peaks = findPeaks(data, meta, 0, 10, noiseLevel(data) * 8);
    expect(peaks.map((p) => Math.round(p.ppm * 100) / 100)).toEqual([7.26, 1.56]);
    expect(snapToPeak(data, meta, 7.2, 0.1)!.ppm).toBeCloseTo(7.263, 2);
  });
});

describe('プロジェクトファイル', () => {
  it('保存して読み戻すとデータが一致する', () => {
    const doc = emptyDocument();
    doc.spectra.push({
      id: 's1',
      fileName: 'a.jdf',
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
      first: 1,
      last: 0,
      n: 3,
      refOffset: 0,
      maxAbs: 3,
    });
    const arr = new Float32Array([1.5, -2.25, 3]);
    const back = parseProject(serializeProject(doc, { s1: arr }));
    expect(Array.from(back.data.s1)).toEqual([1.5, -2.25, 3]);
    expect(back.doc.spectra[0].solvent).toBe('CDCl3');
  });
});

// 手元に samples/*.jdf があるときだけ、実データで ppm 軸を確かめる
const sampleDir = join(import.meta.dirname, '../../samples');
/** 1D の .jdf だけ (13 バイト目が次元の数。2D は fid2d.test.ts で確かめる) */
const samples = existsSync(sampleDir)
  ? readdirSync(sampleDir).filter((f) => f.endsWith('.jdf') && readFileSync(join(sampleDir, f)).readUInt8(12) === 1)
  : [];
describe.skipIf(!samples.length)('実データ (samples/)', () => {
  it.each(samples)('%s を読める', (name) => {
    const buf = readFileSync(join(sampleDir, name));
    const settings = defaultSettings();
    const { meta, data } = readJdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), name, {
      reference: (s, n) => labReference(settings, s, n),
    });
    expect(meta.n).toBe(data.length);
    expect(meta.freqMHz).toBeGreaterThan(100);
    if (meta.solvent === 'C6D6' && meta.nucleus === '1H') {
      // Delta で 7.15 に合わせてあるので、残存ピークは 7.150 に出るはず
      const peak = snapToPeak(data, meta, 7.15, 0.05)!;
      expect(peak.ppm).toBeCloseTo(7.15, 3);
    }
    if (meta.nucleus === '31P') {
      // 1H デカップリングの情報がタイトルに入る
      expect(meta.decoupled).toBe('1H');
      expect(autoTitle(meta)).toBe('^{31}P{^{1}H} NMR (162 MHz, C_{6}D_{6})');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { annotationKey } from './deltaSync';
import { integralValues } from './integrals';
import type { NmrDocument, SpectrumMeta } from '../state/types';
import {
  bundleAnnotations,
  bundleBlock,
  decodeBundle,
  encodeBundle,
  isBundle,
  parseIntrng,
  parsePeaklist,
  topspinAnnotations,
  withBundleBlock,
  withIntscl,
  writeBundle,
  writeTopspin,
  type TopspinBundle,
  type TopspinFiles,
} from './topspin';

/** 12 → −1 ppm、0.001 ppm おきのローレンツ形の山 (1r の整数 × 2^NC と同じ単位) */
function spectrum(peaks: [number, number, number][], offset = 0) {
  const meta = { first: 12, last: -1, n: 13001, refOffset: 0, vendor: 'bruker' } as SpectrumMeta;
  const data = new Float32Array(meta.n);
  for (let i = 0; i < meta.n; i++) {
    const ppm = meta.first + ((meta.last - meta.first) * i) / (meta.n - 1);
    data[i] = offset;
    for (const [c, h, w] of peaks) data[i] += (h * w * w) / ((ppm - c) ** 2 + w * w);
  }
  return { meta, data };
}

const PATH = { name: '1-crude', expno: '10', procno: '1' };

describe('TopSpin の積分 (intrng) を読む', () => {
  it('今の形 (bias・slope の 4 列) と古い形 (P 0、2 列)', () => {
    const now = parseIntrng('A 1.0 #regions in PPM\n# low field   high field  bias        slope\n  7.944  7.606  -0.0  -0.0  # for region 1\n  2.25  2.24  1.5E7  847.5  # for region 2\n');
    expect(now).toEqual([
      { from: 7.944, to: 7.606, bias: -0, slope: -0 },
      { from: 2.25, to: 2.24, bias: 1.5e7, slope: 847.5 },
    ]);
    const old = parseIntrng('P 0\n7.301127   7.081425\n1.631053   1.345655\n');
    expect(old.map((r) => [r.from, r.to, r.bias, r.slope])).toEqual([
      [7.301127, 7.081425, 0, 0],
      [1.631053, 1.345655, 0, 0],
    ]);
  });

  it('値 = (1r の整数の和 − ベースライン) × INTSCL。TopSpin で値を入れた積分 (整数) を基準にする', () => {
    const { meta, data } = spectrum([
      [7.2, 1000, 0.002],
      [3.6, 3000, 0.002],
    ]);
    const nc = 2;
    const files: TopspinFiles = { intrng: 'A 1.0 #regions in PPM\n  7.25  7.15  -0.0  -0.0  # for region 1\n  3.65  3.55  -0.0  -0.0  # for region 2\n', peaklist: null, intscl: 1, nc };
    const raw = topspinAnnotations(files, data, meta);
    // INTSCL = 3 / (3.6 の山の和) にすると、3.6 の山が 3 (TopSpin で「3 にする」と入れたとき)
    const sum36 = raw.integrals.find((x) => x.from === 3.65)!.value;
    const ann = topspinAnnotations({ ...files, intscl: 3 / sum36 }, data, meta);
    expect(ann.reference).toBe(3);
    expect(ann.integrals.find((x) => x.from === 3.65)!.shown).toBe(3);
    expect(ann.integrals.find((x) => x.from === 7.25)!.shown).toBeCloseTo(1, 2);
    // ベースラインは無し (bias・slope が 0)
    expect(Math.abs(ann.integrals[0].baseline!.bias)).toBe(0);
    expect(Math.abs(ann.integrals[0].baseline!.slope)).toBe(0);
  });

  it('ベースライン (bias・slope) を引く。このアプリのベースラインに直しても同じ値', () => {
    const { meta, data } = spectrum([[5, 2000, 0.003]], 400);
    const nc = 0;
    // 範囲の点で、bias + slope × j が 400 の直線 (slope は 0) → ベースラインを引くと山だけ
    const files: TopspinFiles = { intrng: 'A 1.0 #regions in PPM\n  5.05  4.95  400  0  # for region 1\n', peaklist: null, intscl: 1, nc };
    const ann = topspinAnnotations(files, data, meta);
    const flat = topspinAnnotations({ ...files, intrng: 'A 1.0 #regions in PPM\n  5.05  4.95  0  0  # for region 1\n' }, data, meta);
    // TopSpin は高磁場の端の点を足さない (5.05〜4.95 の 101 点のうち 100 点)
    const points = 100;
    expect(flat.integrals[0].value - ann.integrals[0].value).toBeCloseTo(400 * points, 0);
    expect(ann.integrals[0].baseline!.bias).toBeCloseTo(400, 6);
    expect(ann.integrals[0].baseline!.slope).toBeCloseTo(0, 9);
  });
});

describe('TopSpin に書き戻す', () => {
  const { meta, data } = spectrum([
    [7.2, 1000, 0.002],
    [3.6, 3000, 0.002],
    [1.2, 4500, 0.002],
  ]);
  const files: TopspinFiles = { intrng: null, peaklist: null, intscl: 1, nc: -2 };

  it('書いたものを読み直すと同じ中身 (積分の範囲・値・ピーク値)', () => {
    const ann = {
      peaks: [{ ppm: 7.2 }, { ppm: 3.6 }],
      integrals: [
        { from: 7.25, to: 7.15, baseline: null },
        { from: 3.65, to: 3.55, baseline: { bias: 2, slope: 0.5 } },
        { from: 1.25, to: 1.15, baseline: null },
      ],
      reference: { index: 1, value: 3 },
    };
    const out = writeTopspin(files, ann, data, meta, PATH, new Date(2026, 9, 9, 10, 0, 0));
    expect(out.intrng).toMatch(/^A 1\.0 #regions in PPM\n# low field/);
    expect(out.peaklist).toContain('<Peak1D F1="7.200000"');
    expect(out.peaklist).toContain('name="1-crude"');
    const back = bundleAnnotations(out, data, meta);
    expect(annotationKey(back, data, meta)).toBe(annotationKey(ann, data, meta));
    // TopSpin の画面の値: 基準の積分が 3
    const shown = topspinAnnotations(out, data, meta).integrals;
    expect(shown.find((x) => x.from === 3.65)!.shown).toBe(3);
  });

  it('図の積分の値と、TopSpin に出る値が同じ', () => {
    const ann = {
      peaks: [],
      integrals: [
        { from: 7.25, to: 7.15, baseline: null },
        { from: 1.25, to: 1.15, baseline: null },
      ],
      reference: { index: 0, value: 1 },
    };
    const out = writeTopspin(files, ann, data, meta, PATH);
    const doc = {
      layers: [{ id: 'L', spectrumId: 'S', integralRef: null }],
      spectra: [{ ...meta, id: 'S' }],
      integrals: ann.integrals.map((x, i) => ({ id: `I${i}`, layerId: 'L', ...x })),
      figure: { integralBaseline: true },
    } as unknown as NmrDocument;
    const app = integralValues(doc, { S: data }).values;
    const ts = topspinAnnotations(out, data, meta).integrals;
    expect(ts.find((x) => x.from === 1.25)!.shown).toBeCloseTo(app.get('I1')!, 6);
  });

  it('元から無いファイルは、書くものが無ければ作らない。ピーク値の見出しは元のものを残す', () => {
    const none = writeTopspin(files, { peaks: [], integrals: [], reference: null }, data, meta, PATH);
    expect(none.intrng).toBeNull();
    expect(none.peaklist).toBeNull();
    expect(none.intscl).toBe(1);
    const xml =
      '<?xml version="1.0" encoding="UTF-8"?>\n<PeakList modified="2025-04-10T15:50:43">\n  <PeakList1D>\n    <PeakList1DHeader creator="nmrsu" date="2025-04-10T15:50:43" expNo="10" name="1-crude" owner="" procNo="1" source="D:/NMRData/x">\n      <PeakPickDetails>F1=4.55ppm, F2=3.67ppm, MI=-0.67cm, MAXI=6.27cm, PC=1.000\n      </PeakPickDetails>\n    </PeakList1DHeader>\n    <Peak1D F1="7.2" intensity="2.5" type="0"/>\n  </PeakList1D>\n</PeakList>\n';
    expect(parsePeaklist(xml)).toEqual([{ ppm: 7.2, intensity: 2.5 }]);
    const out = writeTopspin({ ...files, peaklist: xml }, { peaks: [{ ppm: 7.2 }, { ppm: 1.2 }], integrals: [], reference: null }, data, meta, PATH);
    expect(out.peaklist).toContain('creator="nmrsu"');
    expect(out.peaklist).toContain('MAXI=6.27cm');
    const peaks = parsePeaklist(out.peaklist);
    expect(peaks.map((p) => p.ppm)).toEqual([7.2, 1.2]);
    // intensity は元のピークと同じ倍率 (7.2 の山が 2.5)
    expect(peaks[0].intensity).toBeCloseTo(2.5, 4);
    // ピークを全部消したら、空の一覧 (見出しは残す)
    const empty = writeTopspin({ ...files, peaklist: xml }, { peaks: [], integrals: [], reference: null }, data, meta, PATH);
    expect(parsePeaklist(empty.peaklist)).toEqual([]);
    expect(empty.peaklist).toContain('creator="nmrsu"');
  });

  it('procs は INTSCL の行だけ書き換える (改行の形もそのまま)', () => {
    const procs = '##TITLE= Parameter file\r\n##$INTBC= 1\r\n##$INTSCL= 1\r\n##$LB= 0.3\r\n##END=\r\n';
    // 数の書き方は TopSpin (Windows) と同じ (有効数字 15 桁、指数は 3 桁)
    expect(withIntscl(procs, 9.31914454895093e-11)).toBe('##TITLE= Parameter file\r\n##$INTBC= 1\r\n##$INTSCL= 9.31914454895093e-011\r\n##$LB= 0.3\r\n##END=\r\n');
    expect(withIntscl(procs, 4.341157980230005e-11)).toContain('##$INTSCL= 4.34115798023e-011\r\n');
    expect(withIntscl('##$LB= 0.3\n##END=\n', 2)).toBe('##$LB= 0.3\n##$INTSCL= 2\n##END=\n');
  });
});

describe('同期で使う仮のファイル', () => {
  const { meta, data } = spectrum([[3.6, 3000, 0.002]]);
  const bundle: TopspinBundle = {
    path: PATH,
    intrng: 'A 1.0 #regions in PPM\n  3.65  3.55  -0.0  -0.0  # for region 1\n',
    peaklist: null,
    intscl: 0.001,
    nc: 0,
    spectrum: '1|2|3',
  };

  it('中身を戻せる・TopSpin が書いた中身 (記録) を差し替えられる', () => {
    const bytes = encodeBundle(bundle);
    expect(isBundle(bytes)).toBe(true);
    expect(isBundle(new ArrayBuffer(4))).toBe(false);
    expect(decodeBundle(bytes)).toEqual(bundle);
    const block = bundleBlock({ ...bundle, intrng: null, intscl: 2 });
    const swapped = decodeBundle(withBundleBlock(bytes, block))!;
    expect(swapped.intrng).toBeNull();
    expect(swapped.intscl).toBe(2);
    expect(swapped.spectrum).toBe('1|2|3');
  });

  it('図の注釈を書き込んだ中身', () => {
    const out = decodeBundle(writeBundle(encodeBundle(bundle), { peaks: [{ ppm: 3.6 }], integrals: [{ from: 3.65, to: 3.55 }], reference: { index: 0, value: 2 } }, data, meta))!;
    expect(parsePeaklist(out.peaklist).map((p) => p.ppm)).toEqual([3.6]);
    expect(topspinAnnotations(out, data, meta).integrals[0].shown).toBe(2);
  });
});

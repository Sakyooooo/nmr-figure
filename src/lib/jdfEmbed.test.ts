import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJdf } from './jdf';
import { defaultSettings, labReference } from './settings';
import { checkAnnotationLinks } from './jdfAnnoteCheck';
import { readAnnotations } from './jdfAnnotations';
import { embedFigure, hasEmbeddedFigure, readEmbeddedFigure, removeFigure } from './jdfEmbed';
import { writeProcessedJdf } from './jdfProcessed';
import { buildJdf, readParams, replaceStoragePairs, splitJdf, storageStrings } from './jdfSections';
import { writeAnnotations } from './jdfWrite';

const dir = join(import.meta.dirname, '../../samples');
const has = (name: string) => existsSync(join(dir, name));
const buf = (name: string) => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const same = (a: ArrayBuffer, b: ArrayBuffer) => Buffer.compare(new Uint8Array(a), new Uint8Array(b)) === 0;

const samples = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jdf')) : [];
const DELTA = 'sample-c6d6-1h.jdf';
const FID = 'fid-c6d6-1h.jdf';

describe('PARAMETER_STORAGE の組', () => {
  it('足して、消すと元に戻る', () => {
    const empty = replaceStoragePairs(new Uint8Array(0), 'X_', []);
    const added = replaceStoragePairs(empty, 'NMRFIG_', [
      ['NMRFIG_INFO', 'v1'],
      ['NMRFIG_DATA_001', 'abc'.repeat(100)],
    ]);
    expect([...storageStrings(added, 'NMRFIG_')]).toEqual([
      ['NMRFIG_INFO', 'v1'],
      ['NMRFIG_DATA_001', 'abc'.repeat(100)],
    ]);
    expect([...replaceStoragePairs(added, 'NMRFIG_', [])]).toEqual([...empty]);
  });
});

describe.skipIf(!samples.length)('実データ (samples/)', () => {
  it('区画に分けて組み直すと、元のファイルと 1 バイトも違わない', () => {
    for (const name of samples) expect(same(buildJdf(splitJdf(buf(name))), buf(name)), name).toBe(true);
  });

  it.skipIf(!has(DELTA))('図を入れて取り出すと同じ。Delta の読み方 (測定データ・注釈) は変わらない', async () => {
    const source = buf(DELTA);
    const json = JSON.stringify({ format: 'nmr-figure-editor', text: '図 ✓', data: 'x'.repeat(300_000) });
    const out = await embedFigure(source, json);
    expect(hasEmbeddedFigure(source)).toBe(false);
    expect(hasEmbeddedFigure(out)).toBe(true);
    expect(await readEmbeddedFigure(out)).toBe(json);
    expect(await readEmbeddedFigure(source)).toBe(null);
    const before = readJdf(source, DELTA);
    const after = readJdf(out, DELTA);
    expect([...after.data]).toEqual([...before.data]);
    expect(after.meta.first).toBe(before.meta.first);
    expect(readAnnotations(out)).toEqual(readAnnotations(source));
    expect(checkAnnotationLinks(out)).toEqual([]);
    // 入れ直すと置き換わる (増えない)。取り除くと元のファイルに戻る
    const again = await embedFigure(out, '{"short":true}');
    expect(await readEmbeddedFigure(again)).toBe('{"short":true}');
    expect(readParams(splitJdf(again).params).filter((p) => p.name.startsWith('nmrfig_')).map((p) => p.name)).toEqual(['nmrfig_info', 'nmrfig_data_001']);
    expect(same(removeFigure(again), source)).toBe(true);
  });

  it.skipIf(!has(DELTA))('図を入れたあとも、ピーク値・積分を書き戻せる', async () => {
    const out = await embedFigure(buf(DELTA), '{"a":1}');
    const written = writeAnnotations(out, { peaks: [{ ppm: 7.15 }], integrals: [{ from: 7.3, to: 7.0 }] });
    expect(await readEmbeddedFigure(written)).toBe('{"a":1}');
    expect(readAnnotations(written).peaks).toHaveLength(1);
  });

  it.skipIf(!has(FID) || !has(DELTA))('FID から作った処理済みのファイルを読むと、Delta の処理と同じ位置にピークがある', () => {
    // Delta と同じく溶媒 (C6D6) で基準を合わせる
    const settings = defaultSettings();
    const raw = readJdf(buf(FID), FID, { reference: (s, n) => labReference(settings, s, n) });
    const fid = raw.fid!;
    expect(raw.meta.refOffset).not.toBe(0);
    const out = writeProcessedJdf(buf(FID), fid, raw.meta.processing!, raw.meta.refOffset);
    const mine = readJdf(out, 'mine.jdf');
    expect(mine.meta.processing).toBe(null); // 処理済み (ppm の軸) として読める
    expect(mine.meta.first).toBeCloseTo(raw.meta.first + raw.meta.refOffset, 9);
    expect(mine.meta.n).toBe(raw.meta.n);
    const delta = readJdf(buf(DELTA), DELTA);
    // 基準合わせのずれは Delta と同じ書き方 (zero_point = ずらした量 (Hz))
    const zp = (b: ArrayBuffer) => new DataView(b).getFloat64(1128) / new DataView(b).getFloat64(1064);
    expect(zp(out)).toBeCloseTo(zp(buf(DELTA)), 2);
    const tallest = (s: typeof mine) => {
      let k = 0;
      for (let i = 1; i < s.data.length; i++) if (s.data[i] > s.data[k]) k = i;
      return s.meta.first + ((s.meta.last - s.meta.first) * k) / (s.meta.n - 1);
    };
    expect(Math.abs(tallest(mine) - tallest(delta))).toBeLessThan(0.005);
    // 注釈 (ピーク値・積分) も書ける
    const withPeaks = writeAnnotations(out, { peaks: [{ ppm: tallest(mine) }], integrals: [{ from: 7.3, to: 7.0 }] });
    expect(checkAnnotationLinks(withPeaks)).toEqual([]);
    expect(readAnnotations(withPeaks).integrals).toHaveLength(1);
  });
});

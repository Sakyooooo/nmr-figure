import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJdf } from './jdf';
import { readAnnotations } from './jdfAnnotations';
import { indexAt } from './spectrum';
import { writeAnnotations } from './jdfWrite';

const dir = join(import.meta.dirname, '../../samples');
const has = (name: string) => existsSync(join(dir, name));
const buf = (name: string) => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const PLAIN = 'diphenylacetylene_thf-d8_Proton-1(compare)-1.jdf';
const DELTA = 'diphenylacetylene_thf-d8_Proton-1(integraltest,1-2,7-8)-1.jdf';

describe.skipIf(!has(PLAIN))('.jdf に書き戻す', () => {
  const ann = {
    peaks: [
      { ppm: 7.26, height: 1.5 },
      { ppm: 1.5, height: 0.25 },
    ],
    integrals: [
      { from: 8, to: 7, value: 77.24 },
      { from: 2, to: 1, value: -11.7 },
    ],
  };

  it('書いたものをそのまま読み返せる (ppm はデータ点に寄る)', () => {
    const out = writeAnnotations(buf(PLAIN), ann);
    const back = readAnnotations(out);
    expect(back.peaks).toHaveLength(2);
    expect(back.peaks[0].ppm).toBeCloseTo(7.26, 3);
    // 高さは Delta と同じく、その点の実測値を書く
    const { meta, data } = readJdf(buf(PLAIN), PLAIN);
    const k = Math.round(indexAt(meta, back.peaks[0].ppm + meta.refOffset));
    expect(back.peaks[0].height).toBeCloseTo(data[k], 6);
    expect(back.integrals).toHaveLength(2);
    expect(back.integrals[0].from).toBeCloseTo(8, 3);
    expect(back.integrals[0].to).toBeCloseTo(7, 3);
    expect(back.integrals[0].value).toBeCloseTo(77.24, 6);
    expect(back.integrals[1].from).toBeCloseTo(2, 3);
    expect(back.integrals[1].to).toBeCloseTo(1, 3);
  });

  it('ピークも積分の両端も、必ずデータ点の上に来る (Delta が固まらない条件)', () => {
    const file = buf(PLAIN);
    const out = writeAnnotations(file, ann);
    const v = new DataView(file);
    const first = v.getFloat64(272, false);
    const last = v.getFloat64(336, false);
    const points = v.getUint32(240, false) - v.getUint32(208, false) + 1;
    const index = (ppm: number) => ((ppm - first) / (last - first)) * (points - 1);
    const back = readAnnotations(out);
    for (const p of back.peaks) expect(index(p.ppm)).toBeCloseTo(Math.round(index(p.ppm)), 3);
    for (const x of back.integrals) {
      expect(index(x.from)).toBeCloseTo(Math.round(index(x.from)), 3);
      expect(index(x.to)).toBeCloseTo(Math.round(index(x.to)), 3);
    }
  });

  it('測定データは1バイトも変わらない', () => {
    const before = readJdf(buf(PLAIN), PLAIN);
    const after = readJdf(writeAnnotations(buf(PLAIN), ann), PLAIN);
    expect(after.data.length).toBe(before.data.length);
    expect(Array.from(after.data.slice(0, 200))).toEqual(Array.from(before.data.slice(0, 200)));
    expect(after.meta.first).toBe(before.meta.first);
    expect(after.meta.last).toBe(before.meta.last);
    expect(after.meta.scans).toBe(before.meta.scans);
  });

  it('ヘッダの長さと全体の大きさを書き直す', () => {
    const out = writeAnnotations(buf(PLAIN), ann);
    const v = new DataView(out);
    const start = Number(v.getBigUint64(1308, false));
    const length = v.getUint32(1316, false);
    expect(length).toBe(352 + 4 * 336); // 元のファイルの枠数 (4) のまま
    expect(Number(v.getBigUint64(1320, false))).toBe(out.byteLength);
    // Delta のファイルと同じく 64 バイト単位で、注釈のうしろは 0 埋め
    expect(out.byteLength % 64).toBe(0);
    expect(new Uint8Array(out.slice(start + length)).some((b) => b !== 0)).toBe(false);
    // 注釈より前は元のまま
    const src = new Uint8Array(buf(PLAIN)).subarray(0, 1300);
    expect(Array.from(new Uint8Array(out).subarray(0, 1300))).toEqual(Array.from(src));
  });

  it('何も無いときは空の注釈にする (枠は元のまま残す)', () => {
    const src = buf(PLAIN);
    const out = writeAnnotations(src, { peaks: [], integrals: [] });
    expect(readAnnotations(out)).toEqual({ peaks: [], integrals: [] });
    // 元のファイルと同じ大きさ・同じ枠数のまま (Delta のやり方に合わせる)
    expect(out.byteLength).toBe(src.byteLength);
    expect(new DataView(out).getUint32(1316, false)).toBe(new DataView(src).getUint32(1316, false));
  });

  it('Delta が書いたファイルと同じ形になる (レコードの中身が一致)', () => {
    if (!has(DELTA)) return;
    const delta = readAnnotations(buf(DELTA));
    // Delta と同じ範囲・値で書き、読み返して一致するか
    const out = writeAnnotations(buf(PLAIN), { peaks: [], integrals: delta.integrals });
    const back = readAnnotations(out);
    expect(back.integrals.length).toBe(delta.integrals.length);
    back.integrals.forEach((x, i) => {
      expect(x.from).toBeCloseTo(delta.integrals[i].from, 4);
      expect(x.to).toBeCloseTo(delta.integrals[i].to, 4);
      expect(x.value).toBeCloseTo(delta.integrals[i].value, 4);
    });
  });
});

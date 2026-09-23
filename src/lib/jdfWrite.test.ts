import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { integralArea, pointStep } from './integrals';
import { readJdf } from './jdf';
import { checkAnnotationLinks } from './jdfAnnoteCheck';
import { readAnnotations } from './jdfAnnotations';
import { indexAt } from './spectrum';
import { annotationBlock, JdfWriteError, withAnnotationBlock, writeAnnotations } from './jdfWrite';

const dir = join(import.meta.dirname, '../../samples');
const has = (name: string) => existsSync(join(dir, name));
const buf = (name: string) => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// 同じ測定を Delta で保存したもの: 注釈なし (空き枠 4) と、1〜2 ppm → 7〜8 ppm の順に積分を引いたもの
const PLAIN = 'diphenylacetylene_thf-d8_Proton-1(compare)-1.jdf';
const DELTA = 'diphenylacetylene_thf-d8_Proton-1(integraltest,1-2,7-8)-1.jdf';

const ann = {
  peaks: [{ ppm: 7.26 }, { ppm: 1.32 }],
  integrals: [
    { from: 8, to: 7 },
    { from: 2, to: 1 },
  ],
};

/** 注釈の見出しとレコードを読む (テスト用) */
function block(out: ArrayBuffer) {
  const v = new DataView(out);
  const start = Number(v.getBigUint64(1308, false));
  const slots = v.getUint32(start + 8, true);
  const rec = (i: number) => {
    const o = start + 352 + i * 336;
    return {
      ppm: v.getFloat64(o, true),
      next: v.getUint16(o + 64, true),
      type: v.getUint8(o + 82),
      flag: v.getUint8(o + 87),
      width: v.getFloat32(o + 96, true),
      raw: v.getFloat64(o + 128, true),
      shown: v.getFloat64(o + 136, true),
      slope: v.getFloat64(o + 144, true),
      newer: v.getUint16(o + 152, true),
      older: v.getUint16(o + 154, true),
      bias: v.getFloat64(o + 328, true),
    };
  };
  const u16 = (o: number) => v.getUint16(start + o, true);
  return { start, slots, rec, u16, scale: v.getFloat64(start + 224, true), setValue: v.getFloat64(start + 248, true) };
}

describe.skipIf(!has(PLAIN))('.jdf に書き戻す', () => {
  it('Delta 自身のファイルと同じ決まり (つながり・数・大きさ) を満たす', () => {
    expect(checkAnnotationLinks(buf(PLAIN))).toEqual([]);
    expect(checkAnnotationLinks(writeAnnotations(buf(PLAIN), ann))).toEqual([]);
  });

  it('レコードは ppm の大きい順の鎖でつながり、自分自身を指さない (以前 Delta が固まった原因)', () => {
    const b = block(writeAnnotations(buf(PLAIN), ann));
    expect(b.u16(20)).toBe(1);
    const seen: number[] = [];
    for (let p = b.u16(52); p; p = b.rec(p - 1).next) {
      expect(seen).not.toContain(p);
      seen.push(p);
    }
    expect(seen).toHaveLength(4);
    const ppms = seen.map((p) => b.rec(p - 1).ppm);
    expect(ppms).toEqual([...ppms].sort((x, y) => y - x));
  });

  it('書いたものをそのまま読み返せる (ppm はデータ点に寄る)', () => {
    const out = writeAnnotations(buf(PLAIN), ann);
    const back = readAnnotations(out);
    expect(back.peaks).toHaveLength(2);
    expect(back.peaks[0].ppm).toBeCloseTo(7.26, 3);
    // 高さは Delta と同じく、その点の実測値を書く
    const { meta, data } = readJdf(buf(PLAIN), PLAIN);
    expect(back.peaks[0].height).toBeCloseTo(data[Math.round(indexAt(meta, back.peaks[0].ppm))], 6);
    expect(back.integrals).toHaveLength(2);
    expect(back.integrals[0].from).toBeCloseTo(8, 3);
    expect(back.integrals[0].to).toBeCloseTo(7, 3);
    expect(back.integrals[1].from).toBeCloseTo(2, 3);
    expect(back.integrals[1].to).toBeCloseTo(1, 3);
  });

  it('ピークも積分の両端も、必ずデータ点の上に来る', () => {
    const file = buf(PLAIN);
    const v = new DataView(file);
    const first = v.getFloat64(272, false);
    const last = v.getFloat64(336, false);
    const points = v.getUint32(240, false) - v.getUint32(208, false) + 1;
    const index = (ppm: number) => ((ppm - first) / (last - first)) * (points - 1);
    const back = readAnnotations(writeAnnotations(file, ann));
    for (const p of back.peaks) expect(index(p.ppm)).toBeCloseTo(Math.round(index(p.ppm)), 3);
    for (const x of back.integrals) {
      expect(index(x.from)).toBeCloseTo(Math.round(index(x.from)), 3);
      expect(index(x.to)).toBeCloseTo(Math.round(index(x.to)), 3);
    }
  });

  it('測定データとパラメータは 1 バイトも変わらない', () => {
    const src = new Uint8Array(buf(PLAIN));
    const out = new Uint8Array(writeAnnotations(buf(PLAIN), ann));
    const start = block(out.buffer).start;
    for (let i = 0; i < start; i++) {
      // 1308〜1327 は注釈の長さと全体の大きさ
      if (i >= 1308 && i < 1328) continue;
      if (src[i] !== out[i]) throw new Error(`${i} バイト目が変わった`);
    }
  });

  it('枠はちょうどの数で、長さ・全体の大きさ・64 バイト境界がそろう', () => {
    const out = writeAnnotations(buf(PLAIN), ann);
    const v = new DataView(out);
    const b = block(out);
    const length = v.getUint32(1316, false);
    expect(b.slots).toBe(4);
    expect(length).toBe(352 + 4 * 336);
    expect(v.getUint32(b.start + 12, true)).toBe(5 * 336);
    expect(Number(v.getBigUint64(1320, false))).toBe(out.byteLength);
    expect(out.byteLength % 64).toBe(0);
    expect(new Uint8Array(out.slice(b.start + length)).some((x) => x !== 0)).toBe(false);
    // 空き枠がないときは +120 / +122 は 0 (Delta のファイルで一番多い形)
    expect(b.u16(120)).toBe(0);
    expect(b.u16(122)).toBe(0);
  });

  it('基準の積分を指定すると、Delta の画面にも同じ値が出るように倍率を書く', () => {
    const out = writeAnnotations(buf(PLAIN), { ...ann, reference: { index: 1, value: 3 } });
    const b = block(out);
    expect(b.setValue).toBe(3);
    const ints = [2, 3].map((i) => b.rec(i));
    expect(ints[1].shown).toBeCloseTo(3, 9);
    for (const x of ints) expect(x.shown).toBeCloseTo(x.raw * b.scale, 9);
  });

  it('データ点の間に端がある積分でも、このアプリの値と Delta に書いた値が一致する', () => {
    const file = buf(PLAIN);
    const { meta, data } = readJdf(file, PLAIN);
    const ranges = [
      { from: 7.52317, to: 7.44171 },
      { from: 7.40009, to: 7.26543 },
    ];
    const back = readAnnotations(writeAnnotations(file, { peaks: [], integrals: ranges }));
    back.integrals.forEach((x, i) => {
      const app = integralArea(data, meta, ranges[i].from, ranges[i].to) / pointStep(meta);
      expect(Math.abs(x.value - app) / Math.abs(app)).toBeLessThan(1e-6);
    });
  });

  it('ピークと中心が同じ積分は、Delta と同じく鎖から外す (積分の鎖には入れる)', () => {
    const file = buf(PLAIN);
    const out = writeAnnotations(file, { peaks: [{ ppm: 7.5 }], integrals: [{ from: 8, to: 7 }] });
    const b = block(out);
    // 積分の中心 (7.5) と同じ点のピーク
    expect(b.rec(0).ppm).toBeCloseTo(b.rec(1).ppm, 9);
    expect(b.u16(52)).toBe(1);
    expect(b.rec(0).next).toBe(0);
    expect(b.u16(222)).toBe(2);
    expect(checkAnnotationLinks(out)).toEqual([]);
  });

  it('注釈の場所が無いファイルにも、見出しから作って書ける', () => {
    // 注釈の長さを 0 にして「注釈なし」のファイルを作る
    const src = buf(PLAIN);
    const v = new DataView(src);
    const start = Number(v.getBigUint64(1308, false));
    const bare = src.slice(0, start);
    new DataView(bare).setUint32(1316, 0, false);
    new DataView(bare).setBigUint64(1320, BigInt(start), false);
    const out = writeAnnotations(bare, ann);
    expect(checkAnnotationLinks(out)).toEqual([]);
    expect(readAnnotations(out).integrals).toHaveLength(2);
  });

  it('FID には書かない', () => {
    if (has('fid-c6d6-1h.jdf')) expect(() => writeAnnotations(buf('fid-c6d6-1h.jdf'), ann)).toThrow(JdfWriteError);
  });

  it('全部消したときは、Delta が空の注釈を書いたときと同じ形にする', () => {
    // 積分を付けたファイルから全部消す → 注釈なしのファイル (PLAIN) と注釈の場所がバイト単位で同じになる
    const src = has(DELTA) ? buf(DELTA) : writeAnnotations(buf(PLAIN), ann);
    const out = writeAnnotations(src, { peaks: [], integrals: [] });
    expect(checkAnnotationLinks(out)).toEqual([]);
    expect(readAnnotations(out)).toMatchObject({ peaks: [], integrals: [] });
    const plain = annotationBlock(buf(PLAIN))!;
    const mine = annotationBlock(out)!;
    // 見出しの +122 (空き枠の続き番号) と積分の倍率など、前の中身が残る所は除いて比べる
    const differ = [...mine].map((b, i) => (b !== plain[i] ? i : -1)).filter((i) => i >= 0);
    expect(differ.filter((i) => i >= 352)).toEqual([]);
    expect(mine.length).toBe(plain.length);
  });

  it('記録しておいた注釈の場所を、そのまま戻せる', () => {
    const before = buf(PLAIN);
    const block = annotationBlock(writeAnnotations(before, ann))!;
    const back = withAnnotationBlock(before, block);
    expect(annotationBlock(back)).toEqual(block);
    expect(readAnnotations(back).integrals).toHaveLength(2);
  });
});

describe.skipIf(!has(PLAIN) || !has(DELTA))('Delta が書いたファイルとの突き合わせ', () => {
  it('同じ積分を同じ順に引くと、Delta が書いたレコードと中身が一致する', () => {
    const delta = block(buf(DELTA));
    // Delta のファイルは 1〜2 ppm (古い) → 7〜8 ppm (新しい) の順
    const ranges = [0, 1].map((i) => {
      const r = delta.rec(i);
      return { from: r.ppm + r.width / 2, to: r.ppm - r.width / 2 };
    });
    const mine = block(writeAnnotations(buf(PLAIN), { peaks: [], integrals: ranges }));
    for (const i of [0, 1]) {
      const a = mine.rec(i);
      const d = delta.rec(i);
      expect(a.type).toBe(d.type);
      expect(a.flag).toBe(d.flag);
      expect(a.ppm).toBeCloseTo(d.ppm, 9);
      expect(a.width).toBe(d.width);
      expect(a.next).toBe(d.next);
      expect(a.newer).toBe(d.newer);
      expect(a.older).toBe(d.older);
      // データを float32 で読むぶんの差だけ
      expect(Math.abs(a.raw - d.raw) / Math.abs(d.raw)).toBeLessThan(1e-6);
      expect(a.bias).toBeCloseTo(d.bias, 8);
      expect(a.slope).toBeCloseTo(d.slope, 7);
    }
    for (const o of [20, 52, 222]) expect(mine.u16(o)).toBe(delta.u16(o));
  });

  it('Delta のファイルを読んで書き直しても、同じ範囲と値に戻る', () => {
    const src = buf(DELTA);
    const before = readAnnotations(src);
    const back = readAnnotations(
      writeAnnotations(src, { peaks: [], integrals: before.integrals.map((x) => ({ from: x.from, to: x.to, baseline: x.baseline })) }),
    );
    expect(back.integrals).toHaveLength(2);
    back.integrals.forEach((x, i) => {
      expect(x.from).toBeCloseTo(before.integrals[i].from, 6);
      expect(x.to).toBeCloseTo(before.integrals[i].to, 6);
      expect(Math.abs(x.value - before.integrals[i].value) / Math.abs(before.integrals[i].value)).toBeLessThan(1e-5);
    });
  });
});

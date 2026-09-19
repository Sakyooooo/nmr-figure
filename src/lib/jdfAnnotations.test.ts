import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { integralArea, pointStep } from './integrals';
import { readJdf } from './jdf';
import { readAnnotations } from './jdfAnnotations';
import { snapToPeak } from './spectrum';

const dir = join(import.meta.dirname, '../../samples');
const buf = (name: string) => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const has = (name: string) => existsSync(join(dir, name));

describe.skipIf(!has('sample-c6d6-1h.jdf'))('Delta の注釈を読む', () => {
  it('ピーク値の ppm と高さが、データの頂点と合う', () => {
    const file = buf('sample-c6d6-1h.jdf');
    const { peaks } = readAnnotations(file);
    expect(peaks.length).toBeGreaterThan(0);
    const { meta, data } = readJdf(file, 'sample-c6d6-1h.jdf');
    for (const p of peaks) {
      // 注釈の ppm はファイルの軸のままなので、基準合わせのぶんを足して探す
      const top = snapToPeak(data, meta, p.ppm + meta.refOffset, 0.01);
      expect(top).not.toBeNull();
      expect(Math.abs(top!.ppm - (p.ppm + meta.refOffset))).toBeLessThan(0.01);
      // 高さは頂点の補間の仕方で少し変わるので、割合で見る
      expect(Math.abs(top!.height - p.height) / Math.abs(p.height)).toBeLessThan(0.05);
    }
  });

  it('積分は範囲と値を持ち、ppm の大きい順に並ぶ', () => {
    const { integrals } = readAnnotations(buf('sample-c6d6-1h.jdf'));
    expect(integrals.length).toBeGreaterThan(0);
    for (const x of integrals) {
      expect(x.from).toBeGreaterThan(x.to);
      expect(x.value).not.toBe(0);
    }
    const froms = integrals.map((x) => x.from);
    expect(froms).toEqual([...froms].sort((a, b) => b - a));
  });

  it('FID (注釈なし) では空を返す', () => {
    if (!has('fid-c6d6-1h.jdf')) return;
    expect(readAnnotations(buf('fid-c6d6-1h.jdf'))).toEqual({ peaks: [], integrals: [] });
  });

  it('壊れたデータでも落ちない', () => {
    expect(readAnnotations(new ArrayBuffer(8))).toEqual({ peaks: [], integrals: [] });
    expect(readAnnotations(new ArrayBuffer(4000))).toEqual({ peaks: [], integrals: [] });
  });
});

// Delta で 1〜2 ppm と 7〜8 ppm に積分を引いて保存したファイル (形を確かめるために作ってもらった)
const INTEG = 'diphenylacetylene_thf-d8_Proton-1(integraltest,1-2,7-8)-1.jdf';

describe.skipIf(!has(INTEG))('Delta で引いた積分', () => {
  it('範囲 (ppm ± 幅/2) を読み取れる', () => {
    const { integrals } = readAnnotations(buf(INTEG));
    expect(integrals).toHaveLength(2);
    expect(integrals[0].from).toBeCloseTo(8, 1);
    expect(integrals[0].to).toBeCloseTo(7, 1);
    expect(integrals[1].from).toBeCloseTo(2, 1);
    expect(integrals[1].to).toBeCloseTo(1, 1);
  });

  it('両端の直線を引いた面積が、Delta の値と合う', () => {
    const file = buf(INTEG);
    const { integrals } = readAnnotations(file);
    const { meta, data } = readJdf(file, INTEG);
    // Delta の値は点の間隔を掛けていないので、そろえてから比べる
    const area = integralArea(data, meta, integrals[0].from, integrals[0].to) / pointStep(meta);
    expect(Math.abs(area - integrals[0].value) / Math.abs(integrals[0].value)).toBeLessThan(0.01);
  });

  it('直線を引かないと Delta の値から外れる', () => {
    const file = buf(INTEG);
    const { integrals } = readAnnotations(file);
    const { meta, data } = readJdf(file, INTEG);
    const raw = integralArea(data, meta, integrals[0].from, integrals[0].to, false) / pointStep(meta);
    expect(Math.abs(raw - integrals[0].value) / Math.abs(integrals[0].value)).toBeGreaterThan(0.05);
  });
});

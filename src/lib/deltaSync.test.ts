import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { produce } from 'immer';
import { describe, expect, it } from 'vitest';
import { emptyDocument, type NmrDocument } from '../state/types';
import { annotationKey, applyAnnotations, fileAnnotations, layerAnnotations, shownValues } from './deltaSync';
import { readJdf } from './jdf';
import { writeAnnotations } from './jdfWrite';

const dir = join(import.meta.dirname, '../../samples');
const has = (name: string) => existsSync(join(dir, name));
const buf = (name: string) => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// Delta でピーク値 7 本・積分 5 件 (基準 9) を付けた実データ
const DELTA = 'W(=N(1,3iPr2C6H3)Cl2(P(OMe)3)3)_C6D6_Proton-1-2.jdf';

function docWith(name: string) {
  const { meta, data } = readJdf(buf(name), name);
  const doc = emptyDocument();
  doc.spectra.push(meta);
  doc.layers.push({ id: 'L', spectrumId: meta.id, visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 });
  return { doc, meta, data };
}

describe.skipIf(!has(DELTA))('Delta との同期の計算', () => {
  it('Delta の中身を図に入れると、図と .jdf が同じ中身 (同じ鍵) になる', () => {
    const { doc, meta, data } = docWith(DELTA);
    const fromFile = fileAnnotations(buf(DELTA));
    const next = produce(doc, (d) => applyAnnotations(d, 'L', fromFile, meta));
    expect(next.peakLabels).toHaveLength(7);
    expect(next.integrals).toHaveLength(5);
    expect(next.layers[0].integralRef?.value).toBe(9);
    expect(annotationKey(layerAnnotations(next, 'L'), data, meta)).toBe(annotationKey(fromFile, data, meta));
  });

  it('図で作ったもの (データ点の間の ppm) を書いて読み返しても、鍵は変わらない (書いた直後に読み直して食い違わない)', () => {
    const { doc, meta, data } = docWith(DELTA);
    const edited = produce(doc, (d: NmrDocument) => {
      d.peakLabels.push({ id: 'p1', layerId: 'L', ppm: 7.15023 }, { id: 'p2', layerId: 'L', ppm: 3.66871 });
      d.integrals.push({ id: 'i1', layerId: 'L', from: 7.0711, to: 7.0063 }, { id: 'i2', layerId: 'L', from: 3.7059, to: 3.6281 });
      d.layers[0].integralRef = { id: 'i2', value: 18 };
    });
    const app = layerAnnotations(edited, 'L');
    const out = writeAnnotations(buf(DELTA), app);
    expect(annotationKey(fileAnnotations(out), data, meta)).toBe(annotationKey(app, data, meta));
  });

  it('同じ点・同じ範囲のものは id と SI テキストの上書きを残し、無くなったものは消し、増えたものは足す', () => {
    const { doc, meta } = docWith(DELTA);
    const fromFile = fileAnnotations(buf(DELTA));
    const first = produce(doc, (d) => applyAnnotations(d, 'L', fromFile, meta));
    const kept = first.integrals[0];
    const withSi = produce(first, (d) => {
      d.integrals[0].si = { mult: 'dd', assign: 'OCH_{3}' };
      d.peakLabels.push({ id: 'extra', layerId: 'L', ppm: 5.0 });
    });
    // Delta 側で (SI を上書きしていない) 積分が 1 件消えた、という中身を入れる
    const gone = withSi.integrals[1];
    const fewer = { ...fromFile, integrals: fromFile.integrals.filter((x) => Math.abs(x.from - gone.from) > 1e-9), reference: null };
    const next = produce(withSi, (d) => applyAnnotations(d, 'L', fewer, meta));
    expect(next.integrals).toHaveLength(4);
    expect(next.integrals.find((x) => x.id === kept.id)?.si).toEqual({ mult: 'dd', assign: 'OCH_{3}' });
    expect(next.peakLabels.some((p) => p.id === 'extra')).toBe(false);
    expect(next.layers[0].integralRef).toBeNull();
  });

  it('積分を動かす・基準の値を変えると、鍵が変わる (Delta に書く変更として見つかる)', () => {
    const { doc, meta, data } = docWith(DELTA);
    const base = produce(doc, (d) => applyAnnotations(d, 'L', fileAnnotations(buf(DELTA)), meta));
    const key = annotationKey(layerAnnotations(base, 'L'), data, meta);
    const moved = produce(base, (d) => {
      d.integrals[0].from += 0.05;
    });
    const revalued = produce(base, (d) => {
      d.layers[0].integralRef = { ...d.layers[0].integralRef!, value: 12 };
    });
    expect(annotationKey(layerAnnotations(moved, 'L'), data, meta)).not.toBe(key);
    expect(annotationKey(layerAnnotations(revalued, 'L'), data, meta)).not.toBe(key);
    // 基準の積分を別のものに替えても、画面の値が同じなら同じ中身とみなす
    const ann = layerAnnotations(base, 'L');
    const shown = shownValues(ann, data, meta);
    const other = ann.reference!.index === 0 ? 1 : 0;
    const same = produce(base, (d) => {
      d.layers[0].integralRef = { id: d.integrals[other].id, value: shown[other] };
    });
    expect(annotationKey(layerAnnotations(same, 'L'), data, meta)).toBe(key);
  });
});

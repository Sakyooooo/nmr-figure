import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addSpectra, edit, loadDocument, useEditor } from '../state/store';
import { emptyDocument } from '../state/types';
import { annotationKey, canSyncDelta, fileAnnotations, fileShift, layerAnnotations, sameShape, shiftAnnotations } from './deltaSync';
import { writeProcessedJdf } from './jdfProcessed';
import { writeAnnotations } from './jdfWrite';
import { buildFigureJdf, figureBaseOf } from './figureJdf';
import { readJdf, type LoadedSpectrum } from './jdf';
import { readAnnotations } from './jdfAnnotations';
import { readEmbeddedFigure } from './jdfEmbed';
import { readJdfMeta } from './jdfMeta';
import { parseProject, serializeProject } from './projectFile';
import { defaultSettings, labReference } from './settings';

const dir = join(import.meta.dirname, '../../samples');
const has = (name: string) => existsSync(join(dir, name));
const buf = (name: string) => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const settings = defaultSettings();
const read = (name: string) => readJdf(buf(name), name, { reference: (s, n) => labReference(settings, s, n) });

function open(spectra: LoadedSpectrum[]) {
  loadDocument(emptyDocument(), {}, null, null);
  addSpectra(spectra);
  return useEditor.getState();
}

const DELTA = 'sample-c6d6-1h.jdf';
const DELTA_B = 'sample-c6d6-1h-b.jdf';
const FID = 'fid-c6d6-1h.jdf';

describe.skipIf(!has(DELTA) || !has(DELTA_B) || !has(FID))('図を .jdf にする (samples/)', () => {
  it('土台は一番下に描いているスペクトル (見えないもの・文献のものは後回し)', () => {
    const s = open([read(DELTA), read(DELTA_B)]);
    const [top, bottom] = s.doc.layers;
    expect(figureBaseOf(s.doc)?.layerId).toBe(bottom.id);
    edit((d) => {
      d.layers[1].visible = false;
    });
    expect(figureBaseOf(useEditor.getState().doc)?.layerId).toBe(top.id);
    edit((d) => {
      d.plot2d = { spectrumId: 'x' } as never;
    });
    expect(figureBaseOf(useEditor.getState().doc)).toBe(null);
  });

  it('Delta で処理したスペクトルを土台に、2 本重ねた図を入れる。開き直すと同じ図になる', async () => {
    const s = open([read(DELTA_B), read(DELTA)]);
    const base = figureBaseOf(s.doc)!;
    expect(base.meta.fileName).toBe(DELTA);
    const json = serializeProject(s.doc, s.data, s.fids, s.fids2d, { jdfBase: base.meta.id });
    const out = await buildFigureJdf(buf(DELTA), s.doc, base, json);
    const back = parseProject((await readEmbeddedFigure(out))!);
    expect(back.jdfBase).toBe(base.meta.id);
    expect(back.doc.layers).toHaveLength(2);
    expect([...back.data[base.meta.id]]).toEqual([...s.data[base.meta.id]]);
    // Delta に見えるのは土台の 1 本と、その図のピーク値・積分
    expect(readAnnotations(out).peaks.length).toBe(layerAnnotations(s.doc, base.layerId).peaks.length);
    // ホーム画面の一覧は、パラメーターだけ読んで「2 本・1H の図」と分かる
    const meta = await readJdfMeta(new File([out], 'fig.jdf'));
    expect(meta.figure).toEqual({ layers: 2, nuclei: ['1H'] });
    expect(meta.processed).toBe(true);
    expect((await readJdfMeta(new File([buf(DELTA)], DELTA))).figure).toBe(null);
  });

  it('FID から処理したスペクトルは Delta の処理済みの形にして入れる。開き直した図から保存し直せる', async () => {
    const s = open([read(FID)]);
    const base = figureBaseOf(s.doc)!;
    expect(base.meta.processing).toBeTruthy();
    const json = serializeProject(s.doc, s.data, s.fids, s.fids2d, { jdfBase: base.meta.id });
    const out = await buildFigureJdf(buf(FID), s.doc, base, json, s.fids[base.meta.id]);
    const asDelta = readJdf(out, 'fig.jdf');
    expect(asDelta.meta.processing).toBe(null);
    expect(asDelta.meta.n).toBe(base.meta.n);
    // 開き直した図 (FID も入っている) から、図入りの .jdf を土台にして保存し直す
    const back = parseProject((await readEmbeddedFigure(out))!);
    const again = await buildFigureJdf(out, back.doc, figureBaseOf(back.doc)!, json, back.fids[base.meta.id]);
    expect([...readJdf(again, 'again.jdf').data]).toEqual([...asDelta.data]);
    expect(await readEmbeddedFigure(again)).toBe(json);
  });

  it('FID の土台も保存したあとは同期できる。保存した直後はファイルと図が同じ中身で、位相を変えるとデータの違いが分かる', async () => {
    const s = open([read(FID)]);
    const base = figureBaseOf(s.doc)!;
    expect(canSyncDelta(base.meta)).toBe(false); // まだ .jdf に保存していない
    expect(canSyncDelta({ ...base.meta, syncFile: 'fig.jdf' })).toBe(true);
    const layer = base.layerId;
    edit((d) => {
      d.peakLabels.push({ id: 'p', layerId: layer, ppm: 7.15 });
      d.integrals.push({ id: 'i', layerId: layer, from: 7.3, to: 7.0 });
    });
    const st = useEditor.getState();
    const meta = st.doc.spectra[0];
    const json = serializeProject(st.doc, st.data, st.fids, st.fids2d, { jdfBase: meta.id });
    const out = await buildFigureJdf(buf(FID), st.doc, base, json, st.fids[meta.id]);
    // 注釈の鍵 (同期で比べるもの) が図と同じ = 保存した直後に読み直しや確認が起きない
    const app = layerAnnotations(st.doc, layer);
    expect(annotationKey(shiftAnnotations(fileAnnotations(out), -fileShift(out, meta)), st.data[meta.id], meta)).toBe(annotationKey(app, st.data[meta.id], meta));
    // Delta では、図に出ている ppm (基準合わせのあと) の所にピーク値が出る
    expect(meta.refOffset).not.toBe(0);
    expect(Math.abs(readAnnotations(out).peaks[0].ppm - (7.15 + meta.refOffset))).toBeLessThan(0.001);
    // ファイルのデータは今の処理と同じ (強度もこのアプリと同じ)
    const inFile = readJdf(out, 'fig.jdf').data;
    expect(sameShape(inFile, st.data[meta.id])).toBe(true);
    // 位相を変えると形が違う → 同期でデータを書き直す。書き直しても図の中身は残る
    const turned = { ...meta.processing!, ph0: meta.processing!.ph0 + 40 };
    const rewritten = writeAnnotations(writeProcessedJdf(out, st.fids[meta.id], turned, meta.refOffset), shiftAnnotations(app, meta.refOffset));
    expect(sameShape(readJdf(rewritten, 'fig.jdf').data, st.data[meta.id])).toBe(false);
    expect(await readEmbeddedFigure(rewritten)).toBe(json);
    expect(annotationKey(shiftAnnotations(fileAnnotations(rewritten), -fileShift(rewritten, meta)), st.data[meta.id], meta)).toBe(annotationKey(app, st.data[meta.id], meta));
  });

  it('土台が処理済みでも FID でもないファイルなら作らない', async () => {
    const s = open([read(DELTA)]);
    const base = figureBaseOf(s.doc)!;
    await expect(buildFigureJdf(buf(FID), s.doc, base, '{}')).rejects.toThrow('処理済み');
  });
});

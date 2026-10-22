import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { FigureContent } from '../components/FigureContent';
import { DEMO_CDXML } from '../demoCdxml';
import { placeHLabels } from '../lib/hLabels';
import { buildScene } from '../lib/scene';
import { clearHNumbers, mergeLabels, numberHydrogens, refreshHNumbers, setHLabel, setHOffset, toggleHAssign } from './hNumbers';
import { addFigureImage, deleteSelection, loadDocument, select, undo, useEditor } from './store';
import { emptyDocument, type NmrDocument, type SpectrumMeta } from './types';

/** 12 → −1 ppm の 1H (4.1・1.3 ppm に山) と、ChemDraw の構造式 (クロトン酸エチル) を置いた図 */
function setup() {
  const doc = emptyDocument() as NmrDocument;
  const meta = {
    id: 'S',
    fileName: 'S.jdf',
    title: 'S',
    nucleus: '1H',
    axisName: 'Proton',
    solventRaw: 'CDCl3',
    solvent: 'CDCl3',
    freqMHz: 400,
    temperatureC: null,
    scans: null,
    experiment: 'proton',
    date: null,
    first: 12,
    last: -1,
    n: 13001,
    refOffset: 0,
    maxAbs: 1,
  } as SpectrumMeta;
  const data = new Float32Array(meta.n);
  for (let i = 0; i < meta.n; i++) {
    const ppm = meta.first + ((meta.last - meta.first) * i) / (meta.n - 1);
    for (const c of [4.1, 1.3]) data[i] += Math.exp(-(((ppm - c) / 0.004) ** 2) / 2);
  }
  doc.spectra.push(meta);
  doc.layers.push({ id: 'L', spectrumId: 'S', visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 });
  loadDocument(doc, { S: data }, null, null);
  addFigureImage({ id: 'img', cdxml: DEMO_CDXML, svg: '<svg/>', ratio: 0.5, w: 0.3 });
  return { data };
}

const image = () => useEditor.getState().doc.figureImages.find((x) => x.id === 'img')!;

describe('H の番号 (図)', () => {
  beforeEach(() => setup());

  it('クロトン酸エチル: CH3-CH=CH-CO2-CH2-CH3 の H は 5 つの環境 (CH= は 2 つ別) で、番号は 1〜5', async () => {
    expect(await numberHydrogens('img')).toBe(true);
    const n = image().hNumbers!;
    expect(new Set(n.sites.map((s) => s.env)).size).toBe(5);
    expect([...new Set(Object.values(n.labels))].sort()).toEqual(['1', '2', '3', '4', '5']);
    // 元に戻すと番号のない構造式に
    undo();
    expect(image().hNumbers).toBeUndefined();
  });

  it('構造式に C–H³ を描き足し、ChemDraw で開く・Word の図にも入る', async () => {
    await numberHydrogens('img');
    const { doc, data } = useEditor.getState();
    const placed = placeHLabels(doc.figureImages, doc.figure);
    // 5 環境、6 か所 (CH3・CH=・=CH・CH2・CH3。文字のない炭素なので全部線と H)
    expect(placed.length).toBe(5);
    expect(placed.every((p) => p.line && p.h)).toBe(true);
    const svg = renderToStaticMarkup(<FigureContent scene={buildScene(doc, data)} figure={doc.figure} images={doc.figureImages} />);
    expect(svg.match(/data-hnum-of="img"/g)?.length).toBe(5);
  });

  it('H を選んでピークをクリック → ピークの上に番号。同じピークでもう一度で外す。番号を直すとピークの番号も', async () => {
    await numberHydrogens('img');
    const n = image().hNumbers!;
    const key = n.sites[0].key;
    useEditor.setState({ activeH: { imageId: 'img', key } });
    toggleHAssign('L', 4.1, 0.01);
    let { doc, data } = useEditor.getState();
    let scene = buildScene(doc, data);
    expect(scene.hPeaks).toEqual([expect.objectContaining({ text: n.labels[key], layerId: 'L' })]);
    // 番号を書き換える
    setHLabel('img', key, '7');
    ({ doc, data } = useEditor.getState());
    scene = buildScene(doc, data);
    expect(scene.hPeaks[0].text).toBe('7');
    // 2 つ目の番号を同じピークに → 「7, x」
    const other = n.sites.find((s) => s.env !== n.sites[0].env)!;
    useEditor.setState({ activeH: { imageId: 'img', key: other.key } });
    toggleHAssign('L', 4.1, 0.01);
    ({ doc, data } = useEditor.getState());
    expect(buildScene(doc, data).hPeaks[0].text.split(', ')).toHaveLength(2);
    // もう一度で外す
    toggleHAssign('L', 4.1005, 0.01);
    expect(useEditor.getState().doc.hAssigns).toHaveLength(1);
  });

  it('番号を外す・消す・構造式を消すと、ピークの上の番号も消える', async () => {
    await numberHydrogens('img');
    const key = image().hNumbers!.sites[0].key;
    useEditor.setState({ activeH: { imageId: 'img', key } });
    toggleHAssign('L', 4.1, 0.01);
    setHLabel('img', key, '');
    expect(useEditor.getState().doc.hAssigns).toHaveLength(0);
    expect(image().hNumbers!.labels[key]).toBeUndefined();

    toggleHAssign('L', 1.3, 0.01);
    useEditor.setState({ activeH: { imageId: 'img', key: image().hNumbers!.sites[1].key } });
    toggleHAssign('L', 1.3, 0.01);
    expect(useEditor.getState().doc.hAssigns).toHaveLength(1);
    clearHNumbers('img');
    expect(useEditor.getState().doc.hAssigns).toHaveLength(0);
    expect(image().hNumbers).toBeUndefined();

    await numberHydrogens('img');
    useEditor.setState({ activeH: { imageId: 'img', key: image().hNumbers!.sites[0].key } });
    toggleHAssign('L', 1.3, 0.01);
    select({ kind: 'image', id: 'img' });
    deleteSelection();
    expect(useEditor.getState().doc.hAssigns).toHaveLength(0);
  });

  it('ここから振り直す: 選んだ原子の H が 1 番', async () => {
    await numberHydrogens('img');
    const n = image().hNumbers!;
    const last = n.sites.find((s) => n.labels[s.key] === '5')!;
    await numberHydrogens('img', last.parent);
    expect(image().hNumbers!.labels[last.key]).toBe('1');
  });

  it('ChemDraw で直した構造式: 残った H の番号はそのまま、新しい H には続きの番号、外した番号は外したまま', async () => {
    await numberHydrogens('img');
    const n = image().hNumbers!;
    // 末端の CH3 の番号を外し、ほかを 10 番台に
    const removed = n.sites.find((s) => n.labels[s.key] === '1')!;
    setHLabel('img', removed.key, '');
    setHLabel('img', n.sites.find((s) => n.labels[s.key] === '2')!.key, '12');
    const before = image().hNumbers!;
    const merged = mergeLabels(before, before.sites);
    expect(merged[removed.key]).toBeUndefined();
    expect(Object.values(merged)).toContain('12');
    // 新しい H (前になかった key) には続きの番号
    const extra = mergeLabels(before, [...before.sites, { key: 'new', atomId: 'new', parent: 'new', drawn: false, env: 99, count: 1 }]);
    expect(extra.new).toBe('13');
    // 構造式が変わっていなければ求め直さない
    await refreshHNumbers('img');
    expect(image().hNumbers).toEqual(before);
  });

  it('H の字をずらす: 線の先と H がずれ、振り直しても残る。0 に戻すと元の位置', async () => {
    await numberHydrogens('img');
    const { doc } = useEditor.getState();
    const before = placeHLabels(doc.figureImages, doc.figure);
    const key = before[0].keys[0];
    setHOffset('img', key, 3, -2);
    const after = placeHLabels(useEditor.getState().doc.figureImages, doc.figure);
    const k = (before[0].size / 10) || 1;
    expect(after[0].h!.x - before[0].h!.x).toBeCloseTo(3 * k, 3);
    expect(after[0].h!.y - before[0].h!.y).toBeCloseTo(-2 * k, 3);
    expect(after[0].line!.x1).toBeCloseTo(before[0].line!.x1, 6);
    await numberHydrogens('img');
    expect(image().hNumbers!.offsets?.[key]).toEqual({ x: 3, y: -2 });
    setHOffset('img', key, 0, 0);
    expect(image().hNumbers!.offsets?.[key]).toBeUndefined();
  });
});

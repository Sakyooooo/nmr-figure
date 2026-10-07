import { beforeEach, describe, expect, it } from 'vitest';
import { defaultProcessing2d, type Spectrum2dData } from '../lib/fid2d';
import { buildScene2d } from '../lib/scene2d';
import { clearSide1d, markCrossPeaksFromSides, setSide1d, sideFromProject, sidesFor, type SideSource } from './side2d';
import { loadDocument, toggleMarker2d, toggleSideMarker, useEditor } from './store';
import { DEFAULT_MARKER_COLORS, defaultPlot2d, emptyDocument, type MarkerStyle, type NmrDocument, type Spectrum2dMeta, type SpectrumMeta } from './types';

const doc = () => useEditor.getState().doc;

function meta2d(x = '1H', y = '13C'): Spectrum2dMeta {
  return {
    id: 'S2',
    fileName: 'sample_hsqc.jdf',
    title: 'sample',
    experiment: 'hsqc',
    x: { nucleus: x, axisName: 'Proton', freqMHz: 400, first: 10, last: 0, n: 64 },
    y: { nucleus: y, axisName: 'Carbon13', freqMHz: 100, first: y === '1H' ? 10 : 200, last: 0, n: 64 },
    solvent: null,
    solventRaw: '',
    temperatureC: null,
    scans: null,
    date: null,
    acquiredAt: null,
    maxAbs: 1,
    noise: 0.001,
    processing: defaultProcessing2d(),
  };
}

/** (x, y) に山が 1 つある 64 × 64 の 2D */
function data2d(m: Spectrum2dMeta, peaks: [number, number][]): Spectrum2dData {
  const data = new Float32Array(64 * 64);
  for (const [x, y] of peaks) {
    const c = Math.round(((x - m.x.first) / (m.x.last - m.x.first)) * 63);
    const r = Math.round(((y - m.y.first) / (m.y.last - m.y.first)) * 63);
    data[r * 64 + c] = 1;
  }
  return { data, n1: 64, n2: 64, first2: m.x.first, last2: m.x.last, first1: m.y.first, last1: m.y.last, maxAbs: 1, noise: 0.001 };
}

function open2d(m = meta2d()) {
  const d = emptyDocument();
  d.spectra2d = [m];
  d.plot2d = defaultPlot2d(m);
  loadDocument(d, {}, null, null, {}, { data2d: { [m.id]: data2d(m, [[7.0, 128]]) }, fids2d: {} });
}

function meta1d(nucleus: string, first: number, refOffset = 0): SpectrumMeta {
  return {
    id: crypto.randomUUID(),
    fileName: `sample_${nucleus}.jdf`,
    title: 'sample',
    nucleus,
    axisName: nucleus,
    solventRaw: '',
    solvent: null,
    freqMHz: 400,
    temperatureC: null,
    scans: null,
    experiment: 'single_pulse',
    date: null,
    first,
    last: 0,
    n: 1001,
    refOffset,
    maxAbs: 1,
  };
}

const red: MarkerStyle = { id: 'r1', name: 'A', color: DEFAULT_MARKER_COLORS[0], shape: 'circle' };
const blue: MarkerStyle = { id: 'b1', name: '', color: '#123456', shape: 'square' };

function source(nucleus: string, marks: SideSource['marks'], from = 'H_図.jdf'): SideSource {
  const meta = meta1d(nucleus, nucleus === '1H' ? 10 : 200);
  return { meta, data: new Float32Array(meta.n).fill(0.01), from, marks, figure: true };
}

describe('2D の上・右に 1D を使う', () => {
  beforeEach(() => open2d());

  it('核種の合う側: 異種核は上か右、同核は両方', () => {
    expect(sidesFor(doc(), '1H')).toEqual(['top']);
    expect(sidesFor(doc(), '13C')).toEqual(['right']);
    expect(sidesFor(doc(), '19F')).toEqual([]);
    open2d(meta2d('1H', '1H'));
    expect(sidesFor(doc(), '1H')).toEqual(['top', 'right']);
  });

  it('帰属のマーカーも持ってくる。名前のある種類は、最初から並んでいる同じ色・形の種類に名前を入れて使う', () => {
    setSide1d(['top'], source('1H', [{ ppm: 7.0, style: red }, { ppm: 3.5, style: blue }]));
    const d = doc();
    expect(d.plot2d!.top).toMatchObject({ from: 'H_図.jdf' });
    expect(d.spectra).toHaveLength(1);
    expect(d.plot2d!.top!.spectrumId).toBe(d.spectra[0].id);
    expect(d.spectra[0].syncFile).toBeNull();
    const marks = d.markers.filter((m) => m.side === 'top');
    expect(marks.map((m) => m.ppm)).toEqual([7.0, 3.5]);
    expect(marks.every((m) => m.space === '2d' && m.layerId === 'S2' && m.from1d === d.spectra[0].id)).toBe(true);
    const redStyle = d.markerStyles.find((s) => s.id === marks[0].styleId)!;
    expect(redStyle.name).toBe('A');
    // 色の違う種類は足す
    expect(d.markerStyles.find((s) => s.id === marks[1].styleId)!.color).toBe('#123456');
    expect(d.markerStyles).toHaveLength(DEFAULT_MARKER_COLORS.length + 1);
  });

  it('¹H と ¹³C で同じ色・形・名前の帰属は 1 つの種類 (凡例が 1 行) になる', () => {
    setSide1d(['top'], source('1H', [{ ppm: 7.0, style: red }]));
    setSide1d(['right'], source('13C', [{ ppm: 128, style: { ...red, id: 'other-id' } }], 'C_図.jdf'));
    const d = doc();
    const top = d.markers.find((m) => m.side === 'top')!;
    const right = d.markers.find((m) => m.side === 'right')!;
    expect(top.styleId).toBe(right.styleId);
    expect(d.markerStyles.filter((s) => s.name === 'A')).toHaveLength(1);
  });

  it('替えると、前の 1D から持ってきたマーカーは外れる (手で付けたものは残る)', () => {
    setSide1d(['top'], source('1H', [{ ppm: 7.0, style: red }]));
    const styleId = doc().markers[0].styleId;
    toggleSideMarker('S2', 'top', styleId, 1.2, 0.05);
    setSide1d(['top'], source('1H', [{ ppm: 2.0, style: red }], 'H2_図.jdf'));
    const d = doc();
    expect(d.spectra).toHaveLength(1);
    expect(d.markers.map((m) => m.ppm).sort()).toEqual([1.2, 2.0]);
    clearSide1d(['top']);
    expect(doc().plot2d!.top).toBeNull();
    expect(doc().spectra).toHaveLength(0);
    expect(doc().markers.map((m) => m.ppm)).toEqual([1.2]);
  });

  it('同核の 2D は上と右に同じ 1D を使い、両方にマーカーを付ける', () => {
    open2d(meta2d('1H', '1H'));
    setSide1d(['top', 'right'], source('1H', [{ ppm: 7.0, style: red }]));
    const d = doc();
    expect(d.plot2d!.top!.spectrumId).toBe(d.plot2d!.right!.spectrumId);
    expect(d.markers.map((m) => m.side).sort()).toEqual(['right', 'top']);
    // 片方だけ戻しても 1D は残る
    clearSide1d(['top']);
    expect(doc().spectra).toHaveLength(1);
  });
});

describe('1D の図から読む', () => {
  it('土台のスペクトルに付けたマーカーだけ (表示の ppm にする。構造式の原子・ほかのスペクトルのものは除く)', () => {
    const d: NmrDocument = emptyDocument();
    const base = meta1d('1H', 10, 0.02);
    const other = meta1d('1H', 10);
    d.spectra = [base, other];
    d.layers = [
      { id: 'L2', spectrumId: other.id, visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 },
      { id: 'L1', spectrumId: base.id, visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 },
    ];
    d.markerStyles = [red];
    d.markers = [
      { id: 'a', layerId: 'L1', styleId: 'r1', ppm: 7.0 },
      { id: 'b', layerId: 'L2', styleId: 'r1', ppm: 5.0 },
      { id: 'c', layerId: '', styleId: 'r1', ppm: 0, imageId: 'img', atomId: '3' },
    ];
    const src = sideFromProject({ doc: d, data: { [base.id]: new Float32Array(1001), [other.id]: new Float32Array(1001) } }, '図')!;
    expect(src.meta.id).toBe(base.id);
    expect(src.marks).toHaveLength(1);
    expect(src.marks[0].ppm).toBeCloseTo(7.02);
    expect(src.marks[0].style.name).toBe('A');
  });

  it('2D の図は使えない', () => {
    const d = emptyDocument();
    d.plot2d = defaultPlot2d(meta2d());
    expect(sideFromProject({ doc: d, data: {} }, '図')).toBeNull();
  });
});

describe('上・右のスペクトルのマーカー', () => {
  beforeEach(() => open2d());

  it('付けて、近くをもう一度押すと外れる。クロスピークのマーカーとは別', () => {
    toggleSideMarker('S2', 'top', 'red', 7.0, 0.05);
    toggleMarker2d('S2', 'red', 7.0, 128, 0.05, 0.5);
    expect(doc().markers).toHaveLength(2);
    // クロスピークの付け外しは上のマーカーに触らない
    toggleMarker2d('S2', 'red', 7.0, 128, 0.05, 0.5);
    expect(doc().markers.map((m) => m.side)).toEqual(['top']);
    toggleSideMarker('S2', 'top', 'red', 7.02, 0.05);
    expect(doc().markers).toHaveLength(0);
  });

  it('上の帯の山の上に置き、帯の上にマーカーの入る分を空ける', () => {
    const before = buildScene2d(doc(), useEditor.getState().data2d.S2)!;
    const styleId = doc().markerStyles[0].id;
    toggleSideMarker('S2', 'top', styleId, 7.0, 0.05);
    toggleSideMarker('S2', 'right', styleId, 128, 0.5);
    const s = buildScene2d(doc(), useEditor.getState().data2d.S2)!;
    const band = s.layout.topBand!;
    expect(band.y).toBeGreaterThan(before.layout.topBand!.y);
    const [top, right] = s.markers;
    expect(top.x).toBeCloseTo(s.layout.xToPx(7.0));
    // 山 (投影の頂上) の上
    expect(top.y).toBeLessThan(band.y + band.h * 0.05);
    expect(right.y).toBeCloseTo(s.layout.yToPx(128));
    expect(right.x).toBeGreaterThan(s.layout.rightBand!.x + s.layout.rightBand!.w * 0.9);
    // 凡例の計算も通る (名前の無い種類は出さない)
    expect(s.legend).toBeNull();
  });

  it('読み込んだ 1D を上の帯に描く', () => {
    const src = source('1H', []);
    const i = Math.round(((10 - 3.0) / 10) * 1000);
    src.data[i] = 1;
    setSide1d(['top'], src);
    const st = useEditor.getState();
    const s = buildScene2d(st.doc, st.data2d.S2, st.data)!;
    const band = s.layout.topBand!;
    // 3.0 ppm の所がいちばん高い
    const c = Math.round(s.layout.xToPx(3.0) - band.x);
    const highest = s.top!.levels.indexOf(Math.max(...s.top!.levels));
    expect(Math.abs(highest - c)).toBeLessThanOrEqual(1);
    expect(s.topPath).not.toBe('');
  });
});

describe('同じマーカーのクロスピークにも付ける', () => {
  beforeEach(() => open2d());

  it('上と右に同じ種類があり、そこにクロスピークがあれば付ける (2 回目は付けない)', () => {
    const styleId = doc().markerStyles[0].id;
    const other = doc().markerStyles[1].id;
    toggleSideMarker('S2', 'top', styleId, 7.0, 0.01);
    toggleSideMarker('S2', 'right', styleId, 128.3, 0.01);
    // 違う種類の組、山の無い組は付けない
    toggleSideMarker('S2', 'top', other, 7.0, 0.01);
    toggleSideMarker('S2', 'right', other, 60, 0.01);
    expect(markCrossPeaksFromSides()).toBe(1);
    const cross = doc().markers.filter((m) => !m.side);
    expect(cross).toHaveLength(1);
    expect(cross[0]).toMatchObject({ space: '2d', styleId, layerId: 'S2' });
    expect(cross[0].ppm).toBeCloseTo(7.0, 0);
    expect(cross[0].ppm1).toBeCloseTo(128, -1);
    expect(markCrossPeaksFromSides()).toBe(0);
  });
});

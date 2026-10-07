/**
 * 2D の図の上・右に 1D のスペクトルを使う (本人の希望 2026-10-07「同じ H, C NMR の帰属したスペクトルを読み込めば、
 * それをそのまま 2D でも反映させて」)。
 * 1D の図 (このソフトで編集して保存した版) を読み込むと、その土台のスペクトルに付けたマーカー (帰属) も上・右に持ってくる。
 * マーカーの種類は、色・形・名前が同じものをまとめる (¹H と ¹³C で同じ色の帰属が 1 つの凡例になる)
 */
import { tr } from '../i18n';
import { figureBaseOf } from '../lib/figureJdf';
import { readJdf } from '../lib/jdf';
import { hasEmbeddedFigure, readEmbeddedFigure } from '../lib/jdfEmbed';
import type { Spectrum2dData } from '../lib/fid2d';
import type { ExperimentMeta } from '../lib/jdfMeta';
import { PROJECT_EXT, parseProject } from '../lib/projectFile';
import { labReference } from '../lib/settings';
import { figureFileOf, listedFiles, loadExperiment, sampleKeyOf, useLibrary } from './library';
import { edit, notify, useEditor } from './store';
import type { MarkerStyle, NmrDocument, Side2d, SpectrumMeta } from './types';

export interface SideSource {
  meta: SpectrumMeta;
  data: Float32Array;
  /** 読み込んだもの (編集した版ならその図の名前、測定ならファイル名) */
  from: string;
  /** 土台のスペクトルに付けたマーカー (ppm は表示の ppm) */
  marks: { ppm: number; style: MarkerStyle }[];
  /** 図 (編集した版) から読んだ */
  figure: boolean;
}

export const sideLabel = (side: Side2d) => (side === 'top' ? tr('上') : tr('右'));

/** FID から処理するときの基準合わせ (研究室の基準値)。fileOps の readOptions と同じ */
const readOptions = () => ({ reference: (solvent: Parameters<typeof labReference>[1], nucleus: string) => labReference(useEditor.getState().settings, solvent, nucleus) });

/** 1D の図 (プロジェクト) の土台のスペクトルと、それに付けたマーカー。2D の図・スペクトルの無い図は null */
export function sideFromProject(project: { doc: NmrDocument; data: Record<string, Float32Array> }, from: string): SideSource | null {
  const { doc, data } = project;
  if (doc.plot2d) return null;
  const base = figureBaseOf(doc);
  const layer = base ? doc.layers.find((l) => l.id === base.layerId) : doc.layers.find((l) => data[l.spectrumId]);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const values = meta && data[meta.id];
  if (!layer || !meta || !values) return null;
  const styles = new Map(doc.markerStyles.map((s) => [s.id, s]));
  const marks = doc.markers.flatMap((m) => {
    const style = styles.get(m.styleId);
    return style && m.layerId === layer.id && !m.imageId && m.space !== '2d' ? [{ ppm: m.ppm + meta.refOffset, style }] : [];
  });
  return { meta, data: values, from, marks, figure: true };
}

/** ファイル (.jdf・図入りの .jdf・.nmrfig) の 1D。2D・読めないものは null */
export async function sideFromFile(file: File): Promise<SideSource | null> {
  const name = file.name;
  if (name.toLowerCase().endsWith(PROJECT_EXT)) return sideFromProject(parseProject(await file.text()), name);
  if (!/\.jdf$/i.test(name)) return null;
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength > 16 && new DataView(buffer).getUint8(12) >= 2) return null;
  if (hasEmbeddedFigure(buffer)) {
    const json = await readEmbeddedFigure(buffer);
    if (json) return sideFromProject(parseProject(json), name);
  }
  const { meta, data } = readJdf(buffer, name, readOptions());
  return { meta, data, from: name, marks: [], figure: false };
}

/** ホーム画面の一覧の 1D (測定・編集した版) を読む */
export async function sideFromLibrary(e: ExperimentMeta): Promise<SideSource | null> {
  if (e.savedFigureId) {
    const f = useLibrary.getState().figures.find((x) => x.id === e.savedFigureId);
    return f ? sideFromProject(parseProject(f.json), f.name) : null;
  }
  if (e.figure) return sideFromFile((await figureFileOf(e.key)).file);
  const { meta, data } = await loadExperiment(e.key, readOptions());
  return { meta, data, from: e.fileName, marks: [], figure: false };
}

/** その核種を出す側 (同核の 2D は上と右の両方)。2D の図でなければ空 */
export function sidesFor(doc: NmrDocument, nucleus: string): Side2d[] {
  const meta = doc.plot2d && doc.spectra2d.find((s) => s.id === doc.plot2d!.spectrumId);
  if (!meta) return [];
  return [...(meta.x.nucleus === nucleus ? (['top'] as const) : []), ...(meta.y.nucleus === nucleus ? (['right'] as const) : [])];
}

/** その側を 2D の投影に戻す。そこへ読み込んだ 1D から持ってきたマーカーも外す (手で付けたものは残す) */
function removeSide(d: NmrDocument, side: Side2d) {
  const p = d.plot2d;
  const old = p?.[side];
  if (!p || !old) return;
  p[side] = null;
  d.markers = d.markers.filter((m) => !(m.side === side && m.from1d === old.spectrumId));
  if ((side === 'top' ? p.right : p.top)?.spectrumId !== old.spectrumId) d.spectra = d.spectra.filter((s) => s.id !== old.spectrumId);
}

/**
 * 持ってきたマーカーの種類を、この図の種類に合わせる: 色・形・名前が同じものはそれを使う。名前の無い同じ色・形で
 * まだ使っていないもの (最初から並んでいる色) には名前を入れて使う。無ければ足す
 */
function styleFor(d: NmrDocument, s: MarkerStyle): string {
  const same = (x: MarkerStyle) => x.color.toLowerCase() === s.color.toLowerCase() && x.shape === s.shape;
  const exact = d.markerStyles.find((x) => same(x) && x.name.trim() === s.name.trim());
  if (exact) return exact.id;
  const blank = s.name.trim() ? d.markerStyles.find((x) => same(x) && !x.name.trim() && !d.markers.some((m) => m.styleId === x.id)) : undefined;
  if (blank) {
    blank.name = s.name;
    if (s.compoundId) blank.compoundId = s.compoundId;
    return blank.id;
  }
  const id = crypto.randomUUID();
  d.markerStyles.push({ ...s, id });
  return id;
}

/**
 * 上・右に 1D を使う。前にその側へ読み込んだ 1D と、そこから持ってきたマーカーは外す。
 * 1D に付けたマーカー (帰属) をその側に付ける (同じ種類がもう近くにあれば足さない)
 */
export function setSide1d(sides: Side2d[], src: SideSource) {
  const { doc } = useEditor.getState();
  if (!doc.plot2d || !sides.length) return;
  const id = crypto.randomUUID();
  // 上・右に描くだけなので、Delta との同期・FID の処理はしない (処理したあとの値をそのまま使う)
  const meta: SpectrumMeta = { ...src.meta, id, processing: null, syncFile: null };
  const tol = (Math.abs(meta.last - meta.first) / Math.max(1, meta.n - 1)) * 1.5;
  useEditor.setState((s) => ({ data: { ...s.data, [id]: src.data } }));
  edit((d) => {
    const p = d.plot2d!;
    for (const side of sides) removeSide(d, side);
    d.spectra.push(meta);
    for (const side of sides) {
      p[side] = { spectrumId: id, from: src.from };
      for (const mk of src.marks) {
        const styleId = styleFor(d, mk.style);
        if (d.markers.some((m) => m.space === '2d' && m.side === side && m.layerId === p.spectrumId && m.styleId === styleId && Math.abs(m.ppm - mk.ppm) <= tol)) continue;
        d.markers.push({ id: crypto.randomUUID(), layerId: p.spectrumId, styleId, ppm: mk.ppm, space: '2d', side, from1d: id });
      }
    }
  });
}

/** 上・右を 2D の投影に戻す */
export function clearSide1d(sides: Side2d[]) {
  edit((d) => {
    for (const side of sides) removeSide(d, side);
  });
}

/** 上・右に使って、知らせる */
export function applySide(sides: Side2d[], src: SideSource) {
  setSide1d(sides, src);
  const side = sides.map(sideLabel).join(tr('と'));
  notify(
    src.marks.length
      ? tr('{from} を 2D の{side}に使いました (帰属のマーカー {n} 個も)', { from: src.from, side, n: src.marks.length })
      : tr('{from} を 2D の{side}に使いました', { from: src.from, side }),
  );
}

/** ホーム画面の 1D (測定・編集した版) を、編集中の 2D の核種の合う側に使う */
export async function attachSideFromLibrary(e: ExperimentMeta) {
  try {
    const src = await sideFromLibrary(e);
    if (!src) throw new Error(tr('スペクトルが見つかりません'));
    const sides = sidesFor(useEditor.getState().doc, src.meta.nucleus);
    if (!sides.length) {
      notify(tr('{fileName}: 2D の軸と核種 ({nucleus}) が違うので、上・右には使えません', { fileName: e.fileName, nucleus: src.meta.nucleus }), 'error');
      return;
    }
    applySide(sides, src);
  } catch (err) {
    notify(`${e.fileName}: ${(err as Error).message}`, 'error');
  }
}

/** 上・右に使える、同じサンプルの 1D (測定と編集した版。編集した版・新しいものが先) */
export function sideCandidates(doc: NmrDocument, nucleus: string): ExperimentMeta[] {
  const meta = doc.spectra2d[0];
  if (!meta) return [];
  const sample = sampleKeyOf(meta);
  return listedFiles(useLibrary.getState())
    .filter((e) => e.dimension === 1 && e.nuclei[0] === nucleus && sampleKeyOf(e) === sample)
    .sort((a, b) => Number(!!b.figure) - Number(!!a.figure) || b.lastModified - a.lastModified);
}

/**
 * 2D を開いたとき: 同じサンプルの帰属した 1D (マーカーを付けて保存した版) があれば、上・右に使う。
 * 帰属した版が無いときは今まで通り 2D の投影
 */
export async function autoSides() {
  const start = useEditor.getState().doc;
  const meta = start.spectra2d[0];
  if (!start.plot2d || !meta) return;
  const used: string[] = [];
  for (const nucleus of new Set([meta.x.nucleus, meta.y.nucleus])) {
    for (const e of sideCandidates(start, nucleus)
      .filter((c) => c.figure)
      .slice(0, 5)) {
      let src: SideSource | null = null;
      try {
        src = await sideFromLibrary(e);
      } catch {
        continue;
      }
      if (!src?.marks.length || src.meta.nucleus !== nucleus) continue;
      // 読んでいるあいだに別の図を開いたらやめる
      const doc = useEditor.getState().doc;
      if (doc.spectra2d[0]?.id !== meta.id || !doc.plot2d) return;
      setSide1d(sidesFor(doc, nucleus), src);
      used.push(`${nucleus}: ${src.from}`);
      break;
    }
  }
  if (used.length) notify(tr('同じサンプルの帰属した 1D を上・右に使いました ({list})。右の「上と右のスペクトル」で 2D の投影に戻せます', { list: used.join(', ') }));
}

/** (x, y) のまわり (横 ±tolX・縦 ±tolY ppm) で、いちばん強いクロスピークの点 */
function crossPeakNear(s: Spectrum2dData, x: number, y: number, tolX: number, tolY: number): { x: number; y: number; v: number } | null {
  const col = (p: number) => ((p - s.first2) / (s.last2 - s.first2)) * (s.n2 - 1);
  const row = (p: number) => ((p - s.first1) / (s.last1 - s.first1)) * (s.n1 - 1);
  // 窓は少なくとも 1 点ぶん (点の粗い軸でも、いちばん近い点に届くように)
  const tx = Math.max(tolX, Math.abs(s.first2 - s.last2) / Math.max(1, s.n2 - 1));
  const ty = Math.max(tolY, Math.abs(s.first1 - s.last1) / Math.max(1, s.n1 - 1));
  const [c0, c1] = [col(x - tx), col(x + tx)].sort((a, b) => a - b);
  const [r0, r1] = [row(y - ty), row(y + ty)].sort((a, b) => a - b);
  let best: { c: number; r: number; v: number } | null = null;
  for (let r = Math.max(0, Math.ceil(r0)); r <= Math.min(s.n1 - 1, Math.floor(r1)); r++)
    for (let c = Math.max(0, Math.ceil(c0)); c <= Math.min(s.n2 - 1, Math.floor(c1)); c++) {
      const v = Math.abs(s.data[r * s.n2 + c]);
      if (!best || v > best.v) best = { c, r, v };
    }
  if (!best) return null;
  return { x: s.first2 + ((s.last2 - s.first2) * best.c) / (s.n2 - 1), y: s.first1 + ((s.last1 - s.first1) * best.r) / (s.n1 - 1), v: best.v };
}

/** 上・右の同じ種類のマーカーを組にするときの許し幅 (¹H は 0.05 ppm、¹³C などは 1 ppm。1D と 2D の基準合わせの小さなずれは許す) */
const pairTol = (nucleus: string) => (nucleus === '1H' ? 0.05 : 1.0);

/**
 * 上と右に同じ種類のマーカーが付いている組 (¹H と ¹³C の帰属) で、そこにクロスピーク (一番低い等高線より強い山) があれば、
 * そのクロスピークにも同じマーカーを付ける。付けた数を返す (もう付いている所は飛ばす)
 */
export function markCrossPeaksFromSides(): number {
  const { doc, data2d } = useEditor.getState();
  const plot = doc.plot2d;
  const meta = plot && doc.spectra2d.find((s) => s.id === plot.spectrumId);
  const data = plot && data2d[plot.spectrumId];
  if (!plot || !meta || !data) return 0;
  const on = (side: Side2d) => doc.markers.filter((m) => m.space === '2d' && m.side === side && m.layerId === meta.id);
  const tolX = pairTol(meta.x.nucleus);
  const tolY = pairTol(meta.y.nucleus);
  const level = Math.max(meta.maxAbs * plot.base, data.noise * 6);
  const homo = meta.x.nucleus === meta.y.nucleus;
  const found: { styleId: string; x: number; y: number }[] = [];
  for (const h of on('top'))
    for (const c of on('right')) {
      // 同核 (COSY) の対角線は組にしない
      if (h.styleId !== c.styleId || (homo && Math.abs(h.ppm - c.ppm) < tolX * 2)) continue;
      const p = crossPeakNear(data, h.ppm, c.ppm, tolX, tolY);
      if (!p || p.v < level) continue;
      const dup = (q: { styleId: string; x: number; y: number }) => q.styleId === h.styleId && Math.abs(q.x - p.x) <= tolX && Math.abs(q.y - p.y) <= tolY;
      if (found.some(dup) || doc.markers.some((m) => m.space === '2d' && !m.side && m.layerId === meta.id && m.ppm1 !== undefined && dup({ styleId: m.styleId, x: m.ppm, y: m.ppm1 }))) continue;
      found.push({ styleId: h.styleId, x: p.x, y: p.y });
    }
  if (found.length)
    edit((d) => {
      for (const f of found) d.markers.push({ id: crypto.randomUUID(), layerId: meta.id, styleId: f.styleId, ppm: f.x, ppm1: f.y, space: '2d' });
    });
  return found.length;
}

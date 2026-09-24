import { resolveLang, setLang, tr } from '../i18n';
import { produce, type Draft } from 'immer';
import { create } from 'zustand';
import type { ImpurityCandidate } from '../lib/impurities';
import type { LoadedSpectrum } from '../lib/jdf';
import { deltaReference } from '../lib/jdfAnnotations';
import { isAutoSimulatedLabel, simulatedLabel } from '../lib/simulate';
import { autoYZoom } from '../lib/layout';
import { nucleusDefaults } from '../lib/nuclei';
import { labReference, loadSettings, saveSettings, templateFigure, type HomeSort, type LangSetting, type Settings, type StructureTool, type StyleTemplate } from '../lib/settings';
import { detectSignals, exclusions } from '../lib/siText';
import { findPeaks, maxInRange, noiseLevel } from '../lib/spectrum';
import { autoPhase, finish, referenceShift, tallestPpm, transform, type FidData, type Processing, type Spectrum } from '../lib/fid';
import { transform2d, type Fid2dData, type Processing2d, type Spectrum2dData } from '../lib/fid2d';
import { fullView2d, squareHeight } from '../lib/scene2d';
import type { Loaded2dSpectrum } from '../lib/jdf2d';
import {
  LAYER_COLORS,
  type SpectrumMeta,
  defaultPlot2d,
  type FigureImage,
  emptyDocument,
  type Annotation,
  type Plot2d,
  type MarkerShape,
  type NmrDocument,
  type Selection,
  type SiOptions,
  type SiOverride,
  type Tool,
  type ViewState,
} from './types';

export type FileHandle = {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string | Blob): Promise<void>; close(): Promise<void> }>;
  /** 保存先を覚えておいたときは、書き込みの許可を取り直す */
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
};

interface EditorState {
  doc: NmrDocument;
  /** spectrumId → 強度。大きいので元に戻す/やり直しの対象にしない */
  data: Record<string, Float32Array>;
  /** spectrumId → FID (このアプリで処理したスペクトルだけ)。位相をやり直すのに使う */
  fids: Record<string, FidData>;
  /** 2D: spectrumId → 等高線を引く元のデータ */
  data2d: Record<string, Spectrum2dData>;
  /** 2D: spectrumId → 生データ。窓関数などを変えたときに作り直す */
  fids2d: Record<string, Fid2dData>;
  /** spectrumId → 読み込んだ .jdf そのもの。Delta へ書き戻すときに使う (保存はしない) */
  sources: Record<string, ArrayBuffer>;
  past: NmrDocument[];
  future: NmrDocument[];
  gestureBase: NmrDocument | null;
  dirty: boolean;
  tool: Tool;
  selection: Selection;
  activeLayerId: string | null;
  activeMarkerStyleId: string | null;
  settings: Settings;
  fileHandle: FileHandle | null;
  projectName: string | null;
  /** 知らせ。undoDepth があれば、履歴がその深さのままのあいだ「元に戻す」を出す */
  message: { text: string; kind: 'info' | 'error'; at: number; undoDepth?: number } | null;
  pendingReference: { layerId: string; ppm: number } | null;
  clipboard: Annotation | null;
  /** ブラウザに自動保存した時刻 */
  autoSavedAt: number | null;
  cursorPpm: number | null;
  /** 2D の図で、カーソルの下の ppm */
  cursor2d: { x: number; y: number } | null;
  /** 印刷を頼んだ回数 (増えると PrintView が印刷する) */
  printRequest: number;
  /** 文献 (SI) の取り込みダイアログ。spectrumId があれば、その文献スペクトルを作り直す */
  siImport: { spectrumId: string | null } | null;
  /** 構造式エディタを開いているか。imageId が null なら新しく置く */
  structureEditor: { imageId: string | null; source: string | null } | null;
  /** 画面の表示倍率。'fit' は枠に合わせる */
  viewZoom: number | 'fit';
  canvasTab: 'spectrum' | 'trend';
  /** 右のパネル (インスペクター) のタブ */
  inspectorTab: InspectorTab;
  /** home: 実験を選ぶ画面 / editor: 図を作る画面 */
  screen: 'home' | 'editor';
}

export const useEditor = create<EditorState>(() => ({
  doc: emptyDocument(),
  data: {},
  fids: {},
  data2d: {},
  fids2d: {},
  sources: {},
  past: [],
  future: [],
  gestureBase: null,
  dirty: false,
  tool: 'select',
  selection: null,
  activeLayerId: null,
  activeMarkerStyleId: null,
  settings: loadSettings(),
  fileHandle: null,
  projectName: null,
  message: null,
  pendingReference: null,
  clipboard: null,
  autoSavedAt: null,
  cursorPpm: null,
  cursor2d: null,
  siImport: null,
  structureEditor: null,
  printRequest: 0,
  viewZoom: 'fit',
  canvasTab: 'spectrum',
  inspectorTab: 'analysis',
  screen: 'home',
}));

const get = useEditor.getState;
const set = useEditor.setState;
const HISTORY_LIMIT = 200;

/** 図の内容を変更する。record=false はドラッグ中など、履歴に積まない変更 */
export function edit(recipe: (d: Draft<NmrDocument>) => void, record = true) {
  const { doc, past, gestureBase } = get();
  const next = produce(doc, recipe);
  if (next === doc) return;
  if (record && !gestureBase) {
    set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [], dirty: true });
  } else {
    set({ doc: next, dirty: true });
  }
  syncProcessed();
}

/** FT 済みの複素スペクトル (位相補正の前)。LB が変わったときだけ作り直す */
const spectrumCache = new Map<string, { lb: number; fid: FidData; spec: Spectrum }>();
/** 今の data がどの処理設定で作られたか */
const processedKey = new Map<string, string>();

/**
 * 処理設定 (位相・LB・ベースライン) と表示中のデータを合わせる。
 * 元に戻す/やり直しで設定が戻ったときも、ここでデータが作り直される。
 */
function syncProcessed() {
  const { doc, fids, data } = get();
  let changed: Record<string, Float32Array> | null = null;
  for (const meta of doc.spectra) {
    const p = meta.processing;
    const fid = fids[meta.id];
    if (!p || !fid) continue;
    const key = JSON.stringify(p);
    if (processedKey.get(meta.id) === key && data[meta.id]) continue;
    let cached = spectrumCache.get(meta.id);
    if (!cached || cached.lb !== p.lb || cached.fid !== fid) {
      cached = { lb: p.lb, fid, spec: transform(fid, p.lb) };
      spectrumCache.set(meta.id, cached);
    }
    changed ??= {};
    changed[meta.id] = finish(cached.spec, p);
    processedKey.set(meta.id, key);
  }
  if (changed) set((s) => ({ data: { ...s.data, ...changed } }));
}

let gestureToken = 0;

/**
 * ドラッグや連続入力の開始。endGesture までの変更を1回分の履歴にまとめる。
 * 別の操作が始まったら、前の操作はその時点で確定する。戻り値は endGesture に渡す。
 */
export function beginGesture(): number {
  if (get().gestureBase) endGesture(gestureToken);
  set({ gestureBase: get().doc });
  return ++gestureToken;
}

export function endGesture(token: number) {
  const { gestureBase, doc, past } = get();
  if (!gestureBase || token !== gestureToken) return;
  if (gestureBase !== doc) set({ past: [...past, gestureBase].slice(-HISTORY_LIMIT), future: [] });
  set({ gestureBase: null });
}

export function isGestureOpen(token: number) {
  return token === gestureToken && get().gestureBase !== null;
}

export function undo() {
  const { past, doc, future } = get();
  if (!past.length) return;
  set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future], dirty: true });
  syncProcessed();
  validateSelection();
}

export function redo() {
  const { past, doc, future } = get();
  if (!future.length) return;
  set({ doc: future[0], past: [...past, doc], future: future.slice(1), dirty: true });
  syncProcessed();
  validateSelection();
}

function validateSelection() {
  const { selection, doc, activeLayerId, activeMarkerStyleId } = get();
  const exists = (id: string | null, list: { id: string }[]) => !!id && list.some((x) => x.id === id);
  const patch: Partial<EditorState> = {};
  if (selection && selection.kind !== 'legend') {
    const list = {
      annotation: doc.annotations,
      marker: doc.markers,
      peakLabel: doc.peakLabels,
      integral: doc.integrals,
      image: doc.figureImages,
    }[selection.kind];
    if (!exists(selection.id, list)) patch.selection = null;
  }
  if (!exists(activeLayerId, doc.layers)) patch.activeLayerId = doc.layers[0]?.id ?? null;
  if (activeMarkerStyleId && !exists(activeMarkerStyleId, doc.markerStyles)) patch.activeMarkerStyleId = null;
  set(patch);
}

export function notify(text: string, kind: 'info' | 'error' = 'info', opts: { undo?: boolean } = {}) {
  set({ message: { text, kind, at: Date.now(), undoDepth: opts.undo ? get().past.length : undefined } });
}

export function setTool(tool: Tool) {
  set({ tool });
}

export function select(selection: Selection) {
  // 選んだものの設定が見えるタブに切り替える (積分・ピーク値・マーカーは解析、図形・画像・凡例は図)
  const tab = selection ? (selection.kind === 'integral' || selection.kind === 'peakLabel' || selection.kind === 'marker' ? 'analysis' : 'figure') : null;
  set(tab ? { selection, inspectorTab: tab } : { selection });
}

export type InspectorTab = 'analysis' | 'figure' | 'record';
export function setInspectorTab(tab: InspectorTab) {
  set({ inspectorTab: tab });
}

/** 表示範囲の変更は履歴に積まない (拡大縮小のたびに履歴が埋まるため) */
export function setView(patch: Partial<ViewState>) {
  const { doc } = get();
  const view = { ...doc.view, ...patch };
  if (view.xMax < view.xMin) [view.xMax, view.xMin] = [view.xMin, view.xMax];
  set({ doc: { ...doc, view }, dirty: true });
}

/** 全部のスペクトルの高さを factor 倍する */
export function scaleY(factor: number) {
  const { doc } = get();
  setView({ yZoom: doc.view.yZoom * factor });
}

export function fitY() {
  const { doc, data } = get();
  setView({ yZoom: autoYZoom(doc, data) });
}

export function fullRange() {
  const { doc, data } = get();
  if (doc.plot2d) {
    const meta = doc.spectra2d.find((s) => s.id === doc.plot2d!.spectrumId);
    if (meta) setView2d(fullView2d(meta));
    return;
  }
  let hi = -Infinity;
  let lo = Infinity;
  for (const l of doc.layers) {
    const m = doc.spectra.find((s) => s.id === l.spectrumId);
    if (!m || !l.visible || !data[m.id]) continue;
    hi = Math.max(hi, m.first + m.refOffset, m.last + m.refOffset);
    lo = Math.min(lo, m.first + m.refOffset, m.last + m.refOffset);
  }
  if (!isFinite(hi)) return;
  setView({ xMax: hi, xMin: lo });
  fitY();
}

export function addSpectra(items: LoadedSpectrum[]) {
  if (!items.length) return;
  const { doc } = get();
  // 2D と 1D は同じ図に混ぜない
  if (doc.plot2d) {
    edit((d) => {
      d.plot2d = null;
      d.spectra2d = [];
    });
  }
  const firstLoad = doc.layers.length === 0;
  const nuclei = new Set([...doc.spectra.map((s) => s.nucleus), ...items.map((i) => i.meta.nucleus)]);
  set((s) => ({
    data: { ...s.data, ...Object.fromEntries(items.map((i) => [i.meta.id, i.data])) },
    fids: { ...s.fids, ...Object.fromEntries(items.filter((i) => i.fid).map((i) => [i.meta.id, i.fid!])) },
    sources: { ...s.sources, ...Object.fromEntries(items.filter((i) => i.source).map((i) => [i.meta.id, i.source!])) },
  }));
  for (const i of items) if (i.meta.processing) processedKey.set(i.meta.id, JSON.stringify(i.meta.processing));
  const layerIds: string[] = [];
  edit((d) => {
    for (const { meta } of items) {
      d.spectra.push(meta);
      const id = crypto.randomUUID();
      layerIds.push(id);
      d.layers.push({
        id,
        spectrumId: meta.id,
        visible: true,
        color: LAYER_COLORS[d.layers.length % LAYER_COLORS.length],
        label: '',
        scale: 1,
        lineWidth: 1,
      });
    }
    if (firstLoad) d.figure.peakLabelDecimals = nucleusDefaults(items[0].meta.nucleus).decimals;
  });
  set({ activeLayerId: layerIds[layerIds.length - 1] });
  if (firstLoad) {
    fullRange();
    const { settings } = get();
    const template = settings.templates.find((t) => t.id === settings.defaultTemplateId);
    if (template) applyTemplate(template);
  }
  if (nuclei.size > 1) notify(tr('核種の違うスペクトルが入っています ({join})。重ね書きには向きませんが、SI 用テキストはまとめて作れます', { join: [...nuclei].join(', ') }));
}

/** 2D のスペクトルを開く (1つの図に 1本)。前の図は置き換える */
export function addSpectrum2d(item: Loaded2dSpectrum) {
  const { meta, data, fid } = item;
  set((s) => ({ data2d: { ...s.data2d, [meta.id]: data }, fids2d: { ...s.fids2d, [meta.id]: fid } }));
  edit((d) => {
    d.spectra2d = [meta];
    d.plot2d = defaultPlot2d(meta);
    // 2D は正方形の図にする (対角線が 45°)
    d.figure.width = 700;
    d.figure.height = squareHeight(d as unknown as NmrDocument, d.plot2d);
    d.spectra = [];
    d.layers = [];
    d.markers = [];
    d.peakLabels = [];
    d.integrals = [];
    d.annotations = [];
  });
  set({ activeLayerId: null, selection: null, canvasTab: 'spectrum', screen: 'editor' });
}

/** 2D の表示範囲 */
export function setView2d(patch: Partial<Plot2d['view']>) {
  const { doc } = get();
  if (!doc.plot2d) return;
  const view = { ...doc.plot2d.view, ...patch };
  if (view.xMax < view.xMin) [view.xMax, view.xMin] = [view.xMin, view.xMax];
  if (view.yMax < view.yMin) [view.yMax, view.yMin] = [view.yMin, view.yMax];
  set({ doc: { ...doc, plot2d: { ...doc.plot2d, view } }, dirty: true });
}

/** 2D の等高線の設定 */
export function setPlot2d(patch: Partial<Omit<Plot2d, 'view' | 'spectrumId'>>) {
  edit((d) => {
    if (d.plot2d) Object.assign(d.plot2d, patch);
  });
}

/** 2D の処理 (窓関数・ゼロ詰め) をやり直す */
export function setProcessing2d(patch: Partial<Processing2d>) {
  const { doc, fids2d } = get();
  const meta = doc.spectra2d[0];
  const fid = meta && fids2d[meta.id];
  if (!meta || !fid) return;
  const processing = { ...meta.processing, ...patch };
  const data = transform2d(fid, processing);
  set((s) => ({ data2d: { ...s.data2d, [meta.id]: data } }));
  edit((d) => {
    const m = d.spectra2d[0];
    if (!m) return;
    m.processing = processing;
    m.maxAbs = data.maxAbs;
    m.noise = data.noise;
    m.x = { ...m.x, first: data.first2, last: data.last2, n: data.n2 };
    m.y = { ...m.y, first: data.first1, last: data.last1, n: data.n1 };
  });
}

/** 文献 (SI) の取り込みダイアログを開く。spectrumId があれば、その文献スペクトルを作り直す */
export function openSiImport(spectrumId: string | null = null) {
  set({ siImport: { spectrumId } });
}

export function closeSiImport() {
  set({ siImport: null });
}

/** 文献のスペクトルを作り直す (レイヤーの色や並びはそのまま) */
export function updateSimulated(spectrumId: string, meta: SpectrumMeta, data: Float32Array) {
  set((s) => ({ data: { ...s.data, [spectrumId]: data } }));
  edit((d) => {
    const at = d.spectra.findIndex((s) => s.id === spectrumId);
    if (at < 0) return;
    d.spectra[at] = { ...meta, id: spectrumId };
    // 名前を自分で付け替えていなければ、短い引用に合わせて付け直す
    const layer = d.layers.find((l) => l.spectrumId === spectrumId);
    if (layer && isAutoSimulatedLabel(layer.label)) layer.label = simulatedLabel(meta.simulated?.short);
  });
}

/** 文献 (SI) から作ったスペクトルを図に足す。色を変えて、名前に「文献値から作図」を付ける */
export function addSimulated(meta: SpectrumMeta, data: Float32Array) {
  const { doc } = get();
  if (doc.plot2d) {
    edit((d) => {
      d.plot2d = null;
      d.spectra2d = [];
    });
  }
  set((s) => ({ data: { ...s.data, [meta.id]: data } }));
  const layerId = crypto.randomUUID();
  const firstLoad = get().doc.layers.length === 0;
  edit((d) => {
    d.spectra.push(meta);
    d.layers.push({
      id: layerId,
      spectrumId: meta.id,
      visible: true,
      color: SIMULATED_COLOR,
      label: simulatedLabel(meta.simulated?.short),
      scale: 1,
      lineWidth: 1,
    });
  });
  set({ activeLayerId: layerId, screen: 'editor' });
  if (firstLoad) fullRange();
  return layerId;
}

export function loadDocument(
  doc: NmrDocument,
  data: Record<string, Float32Array>,
  name: string | null,
  handle: FileHandle | null,
  fids: Record<string, FidData> = {},
  two: { data2d: Record<string, Spectrum2dData>; fids2d: Record<string, Fid2dData> } = { data2d: {}, fids2d: {} },
) {
  spectrumCache.clear();
  processedKey.clear();
  set({
    doc,
    data,
    fids,
    data2d: two.data2d,
    fids2d: two.fids2d,
    past: [],
    future: [],
    dirty: false,
    selection: null,
    activeLayerId: doc.layers[0]?.id ?? null,
    activeMarkerStyleId: null,
    projectName: name,
    fileHandle: handle,
    tool: 'select',
    canvasTab: 'spectrum',
    screen: 'editor',
  });
}

export function markSaved(name: string, handle: FileHandle | null) {
  set({ dirty: false, projectName: name, fileHandle: handle });
}

export function removeLayer(layerId: string) {
  edit((d) => {
    const layer = d.layers.find((l) => l.id === layerId);
    if (!layer) return;
    d.layers = d.layers.filter((l) => l.id !== layerId);
    d.markers = d.markers.filter((m) => m.layerId !== layerId);
    d.peakLabels = d.peakLabels.filter((p) => p.layerId !== layerId);
    d.annotations = d.annotations.filter((a) => a.layerId !== layerId);
    d.integrals = d.integrals.filter((x) => x.layerId !== layerId);
    if (!d.layers.some((l) => l.spectrumId === layer.spectrumId)) d.spectra = d.spectra.filter((s) => s.id !== layer.spectrumId);
    pruneStyles(d);
  });
  validateSelection();
}

export function moveLayer(layerId: string, delta: -1 | 1) {
  edit((d) => {
    const i = d.layers.findIndex((l) => l.id === layerId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= d.layers.length) return;
    [d.layers[i], d.layers[j]] = [d.layers[j], d.layers[i]];
  });
}

/** 文献から作ったスペクトルの色 (実測と区別する) */
export const SIMULATED_COLOR = '#8a2bd1';

const MARKER_COLORS = ['#0b2a4a', '#8c8c8c', '#c0392b', '#2e86c1', '#d68910', '#7d3c98', '#117a65', '#b03a2e'];
const SHAPES: MarkerShape[] = ['circle', 'square', 'triangle', 'diamond', 'invtriangle', 'star'];

function nextStyle(d: NmrDocument) {
  const k = d.markerStyles.length;
  return {
    color: MARKER_COLORS[k % MARKER_COLORS.length],
    shape: SHAPES[Math.floor(k / MARKER_COLORS.length) % SHAPES.length],
  };
}

/** 不純物由来でマーカーが1つもなくなった凡例は消す */
function pruneStyles(d: Draft<NmrDocument>) {
  d.markerStyles = d.markerStyles.filter((s) => !s.compoundId || d.markers.some((m) => m.styleId === s.id));
}

export function isImpurityMarked(doc: NmrDocument, layerId: string, compoundId: string) {
  const style = doc.markerStyles.find((s) => s.compoundId === compoundId);
  return !!style && doc.markers.some((m) => m.layerId === layerId && m.styleId === style.id);
}

export function toggleImpurity(layerId: string, cand: ImpurityCandidate, on: boolean) {
  edit((d) => {
    const layer = d.layers.find((l) => l.id === layerId);
    const meta = layer && d.spectra.find((s) => s.id === layer.spectrumId);
    if (!meta) return;
    let style = d.markerStyles.find((s) => s.compoundId === cand.compoundId);
    if (!on) {
      if (style) d.markers = d.markers.filter((m) => !(m.layerId === layerId && m.styleId === style!.id));
      pruneStyles(d);
      return;
    }
    if (!style) {
      style = { id: crypto.randomUUID(), name: cand.name, compoundId: cand.compoundId, ...nextStyle(d) };
      d.markerStyles.push(style);
    }
    for (const sig of cand.signals) {
      if (!sig.observed) continue;
      const ppm = sig.observed.ppm - meta.refOffset;
      const dup = d.markers.some((m) => m.layerId === layerId && m.styleId === style!.id && Math.abs(m.ppm - ppm) < 1e-3);
      if (!dup) d.markers.push({ id: crypto.randomUUID(), layerId, styleId: style.id, ppm });
    }
  });
}

export function addMarkerStyle(name: string) {
  const id = crypto.randomUUID();
  edit((d) => {
    d.markerStyles.push({ id, name, ...nextStyle(d) });
  });
  set({ activeMarkerStyleId: id });
  return id;
}

export function removeMarkerStyle(styleId: string) {
  edit((d) => {
    d.markerStyles = d.markerStyles.filter((s) => s.id !== styleId);
    d.markers = d.markers.filter((m) => m.styleId !== styleId);
  });
  validateSelection();
}

/** 同じ場所に同じ種類のマーカーがあれば外し、なければ付ける (ppm は基準合わせ前の値) */
export function toggleMarker(layerId: string, styleId: string, ppm: number, tol: number) {
  edit((d) => {
    const i = d.markers.findIndex((m) => m.layerId === layerId && m.styleId === styleId && Math.abs(m.ppm - ppm) <= tol);
    if (i >= 0) d.markers.splice(i, 1);
    else d.markers.push({ id: crypto.randomUUID(), layerId, styleId, ppm });
    pruneStyles(d);
  });
}

export function togglePeakLabel(layerId: string, ppm: number, tol: number) {
  edit((d) => {
    const i = d.peakLabels.findIndex((p) => p.layerId === layerId && Math.abs(p.ppm - ppm) <= tol);
    if (i >= 0) d.peakLabels.splice(i, 1);
    else d.peakLabels.push({ id: crypto.randomUUID(), layerId, ppm });
  });
}

/** 最大ピークの fraction 以上の高さのピークすべてにラベルを付ける (既定は表示範囲だけ) */
export function autoPeakLabels(layerId: string, fraction: number, whole = false) {
  const { doc, data } = get();
  const layer = doc.layers.find((l) => l.id === layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const arr = meta && data[meta.id];
  if (!meta || !arr) return 0;
  const [xMin, xMax] = whole
    ? [Math.min(meta.first, meta.last) + meta.refOffset, Math.max(meta.first, meta.last) + meta.refOffset]
    : [doc.view.xMin, doc.view.xMax];
  const top = maxInRange(arr, meta, xMin, xMax);
  const peaks = findPeaks(arr, meta, xMin, xMax, Math.max(top * fraction, noiseLevel(arr) * 5));
  // 同じピークかどうかはデータ点の間隔で判定する (多重線の隣の線は別のピーク)
  const tol = pointSpacing(meta) * 1.5;
  let added = 0;
  edit((d) => {
    for (const p of peaks) {
      const ppm = p.ppm - meta.refOffset;
      if (d.peakLabels.some((x) => x.layerId === layerId && Math.abs(x.ppm - ppm) < tol)) continue;
      d.peakLabels.push({ id: crypto.randomUUID(), layerId, ppm });
      added++;
    }
  });
  return added;
}

export function pointSpacing(meta: { first: number; last: number; n: number }) {
  return Math.abs(meta.last - meta.first) / (meta.n - 1);
}

/** .jdf に入っていた Delta のピーク値を取り込む (すでに付いている所は飛ばす) */
export function importDeltaPeaks(layerId: string) {
  const { doc } = get();
  const layer = doc.layers.find((l) => l.id === layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const peaks = meta?.delta?.peaks ?? [];
  if (!meta || !peaks.length) return 0;
  // 注釈の ppm はファイルの軸のまま。覚えるときも基準合わせ前の値にする
  const tol = pointSpacing(meta) * 1.5;
  let added = 0;
  edit((d) => {
    for (const p of peaks) {
      if (d.peakLabels.some((x) => x.layerId === layerId && Math.abs(x.ppm - p.ppm) < tol)) continue;
      d.peakLabels.push({ id: crypto.randomUUID(), layerId, ppm: p.ppm });
      added++;
    }
  });
  return added;
}

/**
 * .jdf に入っていた Delta の積分を取り込む (重なる範囲はそのまま)。
 * ベースラインも Delta のものを使い、まだ基準が無ければ Delta の値のそろえ方も引き継ぐので、
 * Delta の画面と同じ数字になる。
 */
export function importDeltaIntegrals(layerId: string) {
  const { doc } = get();
  const layer = doc.layers.find((l) => l.id === layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const delta = meta?.delta;
  const ranges = delta?.integrals ?? [];
  if (!layer || !meta || !delta || !ranges.length) return 0;
  const existing = doc.integrals.filter((x) => x.layerId === layerId);
  const reference = existing.length ? null : deltaReference(delta);
  let added = 0;
  edit((d) => {
    ranges.forEach((r, i) => {
      const overlap = existing.some((x) => Math.max(x.to, r.to) < Math.min(x.from, r.from));
      if (overlap) return;
      const id = crypto.randomUUID();
      d.integrals.push({ id, layerId, from: r.from, to: r.to, baseline: r.baseline ?? null });
      added++;
      const target = d.layers.find((l) => l.id === layerId);
      if (reference && reference.index === i && target) target.integralRef = { id, value: reference.value };
    });
  });
  return added;
}

export function deletePeakLabel(id: string) {
  edit((d) => {
    d.peakLabels = d.peakLabels.filter((p) => p.id !== id);
  });
}

export function clearPeakLabels(layerId: string) {
  const n = get().doc.peakLabels.filter((p) => p.layerId === layerId).length;
  edit((d) => {
    d.peakLabels = d.peakLabels.filter((p) => p.layerId !== layerId);
  });
  if (n) notify(tr('ピーク値を {n} 本消しました', { n }), 'info', { undo: true });
}

export function addAnnotation(a: Omit<Annotation, 'id'>) {
  const id = crypto.randomUUID();
  edit((d) => {
    d.annotations.push({ ...a, id });
  });
  set({ selection: { kind: 'annotation', id }, tool: 'select', inspectorTab: 'figure' });
  return id;
}

export function updateAnnotation(id: string, patch: Partial<Annotation>, record = true) {
  edit((d) => {
    const a = d.annotations.find((x) => x.id === id);
    if (a) Object.assign(a, patch);
  }, record);
}

/**
 * 図に構造式・画像を置く。位置は図の左上からの割合。
 * ratio (高さ÷幅) は、SVG の viewBox や画像の大きさから計算して渡す
 */
export function addFigureImage(item: { id?: string; svg?: string | null; href?: string | null; source?: string | null; cdxml?: string | null; ratio: number; w?: number }) {
  const id = item.id ?? crypto.randomUUID();
  edit((d) => {
    // 少しずつずらして置く (重ならないように)
    const k = d.figureImages.length;
    d.figureImages.push({
      id,
      svg: item.svg ?? null,
      href: item.href ?? null,
      source: item.source ?? null,
      ...(item.cdxml ? { cdxml: item.cdxml } : {}),
      x: 0.08 + 0.03 * (k % 5),
      y: 0.08 + 0.03 * (k % 5),
      w: item.w ?? 0.26,
      ratio: item.ratio || 0.7,
    });
  });
  set({ selection: { kind: 'image', id }, tool: 'select', inspectorTab: 'figure' });
  return id;
}

/** 図と測定条件を印刷する */
export function printFigure() {
  set((s) => ({ printRequest: s.printRequest + 1 }));
}

/** 構造式エディタを開く (imageId を渡すと、その構造式を描き直す) */
export function openStructureEditor(imageId: string | null, source: string | null = null) {
  const { doc } = get();
  const image = imageId ? doc.figureImages.find((x) => x.id === imageId) : null;
  set({ structureEditor: { imageId, source: image?.source ?? source } });
}

export function closeStructureEditor() {
  set({ structureEditor: null });
}

export function updateFigureImage(id: string, patch: Partial<FigureImage>, record = true) {
  edit((d) => {
    const image = d.figureImages.find((x) => x.id === id);
    if (image) Object.assign(image, patch);
  }, record);
}

export function reorderAnnotation(id: string, toFront: boolean) {
  edit((d) => {
    const i = d.annotations.findIndex((x) => x.id === id);
    if (i < 0) return;
    const [a] = d.annotations.splice(i, 1);
    if (toFront) d.annotations.push(a);
    else d.annotations.unshift(a);
  });
}

export function deleteSelection() {
  const { selection } = get();
  if (!selection) return;
  edit((d) => {
    if (selection.kind === 'annotation') d.annotations = d.annotations.filter((a) => a.id !== selection.id);
    if (selection.kind === 'marker') d.markers = d.markers.filter((m) => m.id !== selection.id);
    if (selection.kind === 'peakLabel') d.peakLabels = d.peakLabels.filter((p) => p.id !== selection.id);
    if (selection.kind === 'integral') d.integrals = d.integrals.filter((x) => x.id !== selection.id);
    if (selection.kind === 'image') {
      d.figureImages = d.figureImages.filter((x) => x.id !== selection.id);
      // 構造式に固定した印も一緒に消す
      d.annotations = d.annotations.filter((a) => a.imageId !== selection.id);
    }
    if (selection.kind === 'legend') d.figure.showLegend = false;
    pruneStyles(d);
  });
  set({ selection: null });
}

export function copySelection() {
  const { selection, doc } = get();
  if (selection?.kind !== 'annotation') return false;
  const a = doc.annotations.find((x) => x.id === selection.id);
  if (a) set({ clipboard: a });
  return !!a;
}

/** 貼り付け・複製。少しずらして置く */
export function pasteAnnotation(source?: Annotation) {
  const a = source ?? get().clipboard;
  if (!a) return false;
  const { doc } = get();
  // 構造式に固定したものは枠に対する割合で、スペクトルに固定したものは ppm と強度でずらす
  const onImage = !!a.imageId && doc.figureImages.some((x) => x.id === a.imageId);
  const dx = onImage ? -0.04 : (doc.view.xMax - doc.view.xMin) * 0.015;
  const dy = onImage ? -0.04 : 0.03;
  const copy: Omit<Annotation, 'id'> & { id?: string } = { ...a, x1: a.x1 - dx, x2: a.x2 - dx, y1: a.y1 - dy, y2: a.y2 - dy };
  if (a.imageId && !onImage) return false;
  delete copy.id;
  addAnnotation(copy);
  return true;
}

export function setReferenceOffset(layerId: string, observedPpm: number, targetPpm: number) {
  edit((d) => {
    const layer = d.layers.find((l) => l.id === layerId);
    const meta = layer && d.spectra.find((s) => s.id === layer.spectrumId);
    if (meta) meta.refOffset += targetPpm - observedPpm;
  });
  set({ pendingReference: null, tool: 'select' });
}

export function updateSettings(recipe: (s: Draft<Settings>) => void) {
  const settings = produce(get().settings, recipe);
  saveSettings(settings);
  set({ settings });
}

export function applyTemplate(t: StyleTemplate) {
  const { doc, data } = get();
  edit((d) => {
    Object.assign(d.figure, templateFigure({ ...d.figure, ...t.figure }));
    d.layers.forEach((l, i) => {
      if (t.layerColors.length) l.color = t.layerColors[i % t.layerColors.length];
      l.lineWidth = t.lineWidth;
    });
  });
  const bottom = [...doc.layers].reverse().find((l) => l.visible);
  const nucleus = bottom && doc.spectra.find((s) => s.id === bottom.spectrumId)?.nucleus;
  if (t.range && t.range.nucleus === nucleus) {
    setView({ xMax: t.range.xMax, xMin: t.range.xMin });
    const next = get().doc;
    setView({ yZoom: autoYZoom(next, data) });
  }
}

/** 今の図の見た目をテンプレートとして保存する */
export function saveTemplate(name: string, includeRange: boolean) {
  const { doc, settings } = get();
  const bottom = [...doc.layers].reverse().find((l) => l.visible);
  const nucleus = bottom && doc.spectra.find((s) => s.id === bottom.spectrumId)?.nucleus;
  const template: StyleTemplate = {
    id: crypto.randomUUID(),
    name,
    figure: templateFigure(doc.figure),
    layerColors: doc.layers.map((l) => l.color),
    lineWidth: doc.layers[0]?.lineWidth ?? 1,
    range: includeRange && nucleus ? { nucleus, xMax: doc.view.xMax, xMin: doc.view.xMin } : null,
  };
  const existing = settings.templates.findIndex((x) => x.name === name);
  updateSettings((s) => {
    if (existing >= 0) s.templates[existing] = { ...template, id: s.templates[existing].id };
    else s.templates.push(template);
  });
  return existing >= 0 ? 'updated' : 'added';
}

export function setViewZoom(zoom: number | 'fit') {
  set({ viewZoom: zoom === 'fit' ? 'fit' : Math.min(4, Math.max(0.25, zoom)) });
}

export function setCanvasTab(tab: 'spectrum' | 'trend') {
  set({ canvasTab: tab, selection: null, tool: 'select' });
}

const REGION_COLORS = ['#d12b2b', '#1f4fd1', '#1f9e1f', '#d17a00', '#8a2bd1', '#0f8c8c'];

export function addRegion(from: number, to: number) {
  edit((d) => {
    const n = d.trend.regions.length;
    d.trend.regions.push({
      id: crypto.randomUUID(),
      name: tr('範囲{v0}', { v0: n + 1 }),
      color: REGION_COLORS[n % REGION_COLORS.length],
      from: Math.max(from, to),
      to: Math.min(from, to),
      nH: 1,
    });
  });
}

export function togglePanel(side: 'left' | 'right') {
  updateSettings((s) => {
    if (side === 'left') s.ui.leftOpen = !s.ui.leftOpen;
    else s.ui.rightOpen = !s.ui.rightOpen;
  });
}

/** 選んでいる文字の図形を書き換える: 右のパネル (図のタブ) を開いて、文字の欄に入る */
export function editAnnotationText() {
  const { settings } = get();
  if (!settings.ui.rightOpen) togglePanel('right');
  set({ inspectorTab: 'figure' });
  // パネルが描かれてから欄に入る
  setTimeout(() => {
    const el = document.getElementById('annotation-text') as HTMLTextAreaElement | HTMLInputElement | null;
    if (!el) return;
    el.focus();
    el.setSelectionRange?.(el.value.length, el.value.length);
  }, 0);
}

/** 画面の言語を変える (auto はブラウザの言語)。画面ごと描き直す */
export function setLanguage(lang: LangSetting) {
  updateSettings((s) => {
    s.ui.lang = lang;
  });
  setLang(resolveLang(lang));
}

/** 使い方の説明を見終わった (閉じた) ことを覚える。false にすると次に開いたときにまた出す */
export function setOnboardingDone(done: boolean) {
  updateSettings((s) => {
    s.ui.onboardingDone = done;
  });
}

/** 構造式を描くソフト (ChemDraw / このアプリ) */
export function setStructureTool(tool: StructureTool) {
  updateSettings((s) => {
    s.ui.structureTool = tool;
  });
}

/** ホーム画面の並び順 */
export function setHomeSort(patch: Partial<HomeSort>) {
  updateSettings((s) => {
    s.ui.homeSort = { ...s.ui.homeSort, ...patch };
  });
}

/** 積分を追加する (ppm は基準合わせ前の値) */
export function addIntegral(layerId: string, a: number, b: number) {
  const id = crypto.randomUUID();
  edit((d) => {
    d.integrals.push({ id, layerId, from: Math.max(a, b), to: Math.min(a, b) });
  });
  set({ selection: { kind: 'integral', id }, inspectorTab: 'analysis' });
  return id;
}

export function updateIntegral(id: string, patch: { from?: number; to?: number }, record = true) {
  edit((d) => {
    const x = d.integrals.find((i) => i.id === id);
    if (!x) return;
    const before = [x.from, x.to];
    Object.assign(x, patch);
    if (x.from < x.to) [x.from, x.to] = [x.to, x.from];
    // Delta から持ってきたベースラインは、その範囲のためのもの。範囲を変えたら Delta と同じ決め方に戻す
    if (x.from !== before[0] || x.to !== before[1]) delete x.baseline;
  }, record);
}

/** この積分をこの値にして、同じスペクトルのほかの積分をそろえる */
export function setIntegralValue(id: string, value: number) {
  edit((d) => {
    const x = d.integrals.find((i) => i.id === id);
    const layer = x && d.layers.find((l) => l.id === x.layerId);
    if (layer) layer.integralRef = { id, value };
  });
}

export function clearIntegrals(layerId: string) {
  const n = get().doc.integrals.filter((x) => x.layerId === layerId).length;
  edit((d) => {
    d.integrals = d.integrals.filter((x) => x.layerId !== layerId);
    const layer = d.layers.find((l) => l.id === layerId);
    if (layer) layer.integralRef = null;
  });
  if (n) notify(tr('積分を {n} 個消しました', { n }), 'info', { undo: true });
}

/** 上下ドラッグでスペクトルの高さを変える。all のときは全体の縦倍率 */
export function setLayerScale(layerId: string, scale: number) {
  edit((d) => {
    const layer = d.layers.find((l) => l.id === layerId);
    if (layer) layer.scale = Math.min(1000, Math.max(0.001, scale));
  }, false);
}

/** SI テキストで、自動判定を上書きする値を変える */
export function updateIntegralSi(id: string, patch: SiOverride) {
  edit((d) => {
    const x = d.integrals.find((i) => i.id === id);
    if (x) x.si = { ...x.si, ...patch };
  });
}

export function setSiOptions(patch: Partial<SiOptions>) {
  edit((d) => {
    Object.assign(d.si, patch);
  });
}

/** 信号を自動で見つけて積分にする。すでにある積分と重なる所には作らない */
export function autoDetectSignals(layerId: string, fraction = 0.03, visibleOnly = false) {
  const { doc, data, settings } = get();
  const layer = doc.layers.find((l) => l.id === layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const arr = meta && data[meta.id];
  if (!meta || !arr) return 0;
  const off = meta.refOffset;
  const existing = doc.integrals.filter((x) => x.layerId === layerId).map((x) => [x.from + off, x.to + off]);
  const range: [number, number] | undefined = visibleOnly ? [doc.view.xMin, doc.view.xMax] : undefined;
  const regions = detectSignals(arr, meta, exclusions(doc, meta, layerId, settings), { range, minFraction: fraction }).filter(
    ([hi, lo]) => !existing.some(([a, b]) => hi >= b && lo <= a),
  );
  if (!regions.length) return 0;
  edit((d) => {
    for (const [hi, lo] of regions) d.integrals.push({ id: crypto.randomUUID(), layerId, from: hi - off, to: lo - off });
  });
  return regions.length;
}

/** FID の処理設定を変える。record=false はスライダーを動かしている間 */
export function setProcessing(spectrumId: string, patch: Partial<Processing>, record = true) {
  edit((d) => {
    const meta = d.spectra.find((s) => s.id === spectrumId);
    if (meta?.processing) Object.assign(meta.processing, patch);
  }, record);
}

function specOf(spectrumId: string): Spectrum | null {
  const { doc, fids } = get();
  const meta = doc.spectra.find((s) => s.id === spectrumId);
  const fid = fids[spectrumId];
  if (!meta?.processing || !fid) return null;
  let cached = spectrumCache.get(spectrumId);
  if (!cached || cached.lb !== meta.processing.lb || cached.fid !== fid) {
    cached = { lb: meta.processing.lb, fid, spec: transform(fid, meta.processing.lb) };
    spectrumCache.set(spectrumId, cached);
  }
  return cached.spec;
}

/** 位相をもう一度自動で合わせる (1次位相の中心は一番大きいピーク) */
export function autoPhaseSpectrum(spectrumId: string) {
  const spec = specOf(spectrumId);
  const meta = get().doc.spectra.find((s) => s.id === spectrumId);
  if (!spec || !meta) return;
  const pivot = tallestPpm(spec);
  setProcessing(spectrumId, { ...autoPhase(spec, pivot, meta.nucleus), pivot });
}

/** 溶媒ピークで基準を合わせ直す。見つからなければ false */
export function autoReference(spectrumId: string) {
  const { doc, data, settings } = get();
  const meta = doc.spectra.find((s) => s.id === spectrumId);
  const arr = data[spectrumId];
  if (!meta || !arr) return false;
  const expected = labReference(settings, meta.solvent, meta.nucleus);
  if (expected === null) return false;
  const shift = referenceShift(arr, meta.first, meta.last, expected, meta.nucleus);
  if (shift === null) return false;
  edit((d) => {
    const m = d.spectra.find((s) => s.id === spectrumId);
    if (m) m.refOffset = shift;
  });
  return true;
}

/** 1次位相の中心を動かす。見た目が変わらないように 0次位相も合わせて変える */
export function setPivot(spectrumId: string, target: 'tallest' | number) {
  const spec = specOf(spectrumId);
  const p = get().doc.spectra.find((s) => s.id === spectrumId)?.processing;
  if (!spec || !p) return;
  const pivot = target === 'tallest' ? tallestPpm(spec) : target;
  const n = spec.re.length;
  const index = (ppm: number) => ((spec.first - ppm) / (spec.first - spec.last)) * (n - 1);
  const ph0 = p.ph0 + (p.ph1 * (index(pivot) - index(p.pivot))) / n;
  setProcessing(spectrumId, { pivot, ph0: ((((ph0 + 180) % 360) + 360) % 360) - 180 });
}

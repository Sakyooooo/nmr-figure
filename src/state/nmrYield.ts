/**
 * NMR 収率の操作 (lib/nmrYield.ts の計算を図と設定につなぐ)。
 * - 内標と量は、前に使ったもの (設定の履歴の一番上) を次の図で最初から選んでおく。図に入れるのは、何か変えたとき・生成物を足したとき
 * - 内標の範囲は、選んでいるスペクトルで内標の信号を探して決める (画面で直せる)
 */
import { tr } from '../i18n';
import type { InternalStandard } from '../data/internalStandards';
import type { YieldPreset } from '../lib/settings';
import { expectedPpm, findSignalRange, findStandard, figureText, memoLine, standardSnapshot, standardsFor, computeYields } from '../lib/nmrYield';
import { localDay, sampleKeyOf, saveNote, useLibrary } from './library';
import { edit, notify, setCanvasTab, updateSettings, useEditor } from './store';
import { annotationDefaults, type NmrDocument, type YieldAmounts, type YieldProduct, type YieldSetup } from './types';

/** 履歴に残す数 */
const RECENT_LIMIT = 10;
/** 内標の信号を探す幅 (ppm。その溶媒の値があるとき・無いとき) と、範囲の片側の幅の上限 */
const WINDOW: Record<string, [number, number, number]> = { '1H': [0.15, 0.35, 0.1], '19F': [1.5, 4, 0.6] };

function customs(): InternalStandard[] {
  return useEditor.getState().settings.yield.custom;
}

/** 選んでいるスペクトル (無ければ一番上のもの) */
function activeSpectrum(doc: NmrDocument) {
  const { activeLayerId, data } = useEditor.getState();
  const layer = doc.layers.find((l) => l.id === activeLayerId) ?? doc.layers[0];
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const values = meta && data[meta.id];
  return meta && values ? { layer, meta, data: values } : null;
}

/** 内標の信号の範囲を、選んでいるスペクトルで探す */
function detectRange(doc: NmrDocument, standardId: string, signal: number): YieldSetup['standardRange'] {
  const std = findStandard(standardId, customs());
  const sig = std?.signals[signal];
  const at = activeSpectrum(doc);
  if (!sig || !at || at.meta.nucleus !== sig.nucleus) return null;
  const { ppm, exact } = expectedPpm(sig, at.meta.solvent);
  const [near, wide, half] = WINDOW[sig.nucleus] ?? [0.3, 1, 0.3];
  const r = findSignalRange(at.data, at.meta, ppm, exact ? near : wide, half);
  return r ? { from: Number(r.from.toFixed(4)), to: Number(r.to.toFixed(4)) } : null;
}

/**
 * まだ図に入れていないときの内標と量: 前に使ったもの (このスペクトルの核種の内標のうち一番新しいもの)。
 * 無ければ、その核種の最初の内標 (1H は 1,3,5-トリメトキシベンゼン)
 */
export function draftSetup(doc: NmrDocument): YieldSetup | null {
  const at = activeSpectrum(doc);
  if (!at) return null;
  const nucleus = at.meta.nucleus;
  const { recent } = useEditor.getState().settings.yield;
  const pick = recent.find((p) => findStandard(p.standardId, customs())?.signals[p.signal]?.nucleus === nucleus);
  const std = pick ? findStandard(pick.standardId, customs()) : standardsFor(nucleus, customs())[0];
  if (!std) return null;
  const signal = pick ? pick.signal : Math.max(0, std.signals.findIndex((s) => s.nucleus === nucleus));
  return {
    standardId: std.id,
    signal,
    standard: standardSnapshot(std, signal),
    standardRange: detectRange(doc, std.id, signal),
    amount: pick?.amount ?? null,
    unit: pick?.unit ?? 'mg',
    substrateMmol: pick?.substrateMmol ?? null,
    products: [],
    perLayer: {},
  };
}

/** 図に入っている設定 (無ければ前に使ったものから作って入れる) を変える */
function change(recipe: (y: YieldSetup) => void) {
  const { doc } = useEditor.getState();
  const base = doc.yield ?? draftSetup(doc);
  if (!base) return;
  edit((d) => {
    if (!d.yield) d.yield = structuredClone(base);
    recipe(d.yield as YieldSetup);
  });
}

/** 内標と量を履歴に残す (同じものは一番上へ)。量を入れ終わっていないもの (量が空・当量でなく基質が空) は残さない */
function remember(y: YieldSetup) {
  if (y.amount === null || (y.unit !== 'equiv' && y.substrateMmol === null)) return;
  const preset: YieldPreset = { standardId: y.standardId, signal: y.signal, amount: y.amount, unit: y.unit, substrateMmol: y.substrateMmol, at: Date.now() };
  const same = (p: YieldPreset) =>
    p.standardId === preset.standardId && p.signal === preset.signal && p.amount === preset.amount && p.unit === preset.unit && p.substrateMmol === preset.substrateMmol;
  updateSettings((s) => {
    s.yield.recent = [preset, ...s.yield.recent.filter((p) => !same(p))].slice(0, RECENT_LIMIT);
  });
}

function rememberNow() {
  const y = useEditor.getState().doc.yield;
  if (y) remember(y);
}

/** 内標 (と使う信号) を選ぶ。範囲は探し直す */
export function setStandard(standardId: string, signal = 0) {
  const std = findStandard(standardId, customs());
  if (!std) return;
  const { doc } = useEditor.getState();
  const at = activeSpectrum(doc);
  // スペクトルの核種の信号を選ぶ (19F の図で 1H の信号を選ばない)
  const sig = at && std.signals[signal]?.nucleus !== at.meta.nucleus ? Math.max(0, std.signals.findIndex((s) => s.nucleus === at.meta.nucleus)) : signal;
  const range = detectRange(doc, std.id, sig);
  change((y) => {
    y.standardId = std.id;
    y.signal = sig;
    y.standard = standardSnapshot(std, sig);
    y.standardRange = range;
  });
  if (!range) notify(tr('{name} の信号が見つかりませんでした。内標の範囲を入れてください', { name: std.name }), 'error');
  rememberNow();
}

/** 前に使った内標と量を使う */
export function applyPreset(p: YieldPreset) {
  setStandard(p.standardId, p.signal);
  change((y) => {
    y.amount = p.amount;
    y.unit = p.unit;
    y.substrateMmol = p.substrateMmol;
  });
  rememberNow();
}

/** 内標の信号を探し直す */
export function redetectStandard() {
  const { doc } = useEditor.getState();
  const y = doc.yield ?? draftSetup(doc);
  if (!y) return;
  const range = detectRange(doc, y.standardId, y.signal);
  if (!range) return notify(tr('{name} の信号が見つかりませんでした。内標の範囲を入れてください', { name: y.standard.name }), 'error');
  change((d) => {
    d.standardRange = range;
  });
}

export function setStandardRange(range: { from: number; to: number }) {
  change((y) => {
    y.standardRange = range;
  });
}

/** 量を変える。layerId を渡すとそのスペクトルだけ (重ねた crude ごとに量が違うとき) */
export function setAmounts(patch: Partial<YieldAmounts>, layerId?: string) {
  change((y) => {
    if (layerId) {
      const now = y.perLayer[layerId] ?? { amount: y.amount, unit: y.unit, substrateMmol: y.substrateMmol };
      y.perLayer[layerId] = { ...now, ...patch };
    } else Object.assign(y, patch);
  });
  if (!layerId) rememberNow();
}

/** スペクトルごとの量をやめて、全部同じ量にする */
export function clearPerLayer() {
  change((y) => {
    y.perLayer = {};
  });
}

/** 積分の範囲を生成物にする (H の数は 1。あとで直す) */
export function addProductFromIntegral(integralId: string) {
  const { doc } = useEditor.getState();
  const x = doc.integrals.find((i) => i.id === integralId);
  const layer = x && doc.layers.find((l) => l.id === x.layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  if (!x || !meta) return;
  const off = meta.refOffset;
  const n = (doc.yield?.products.length ?? 0) + 1;
  change((y) => {
    y.products.push({ id: crypto.randomUUID(), name: n === 1 ? '' : tr('生成物 {n}', { n }), from: Math.max(x.from, x.to) + off, to: Math.min(x.from, x.to) + off, nH: 1 });
  });
  rememberNow();
}

export function updateProduct(id: string, patch: Partial<YieldProduct>) {
  change((y) => {
    const p = y.products.find((q) => q.id === id);
    if (p) Object.assign(p, patch);
  });
}

export function removeProduct(id: string) {
  change((y) => {
    y.products = y.products.filter((p) => p.id !== id);
  });
}

/** 自分で内標を足す (設定に残す) */
export function addCustomStandard(std: Omit<InternalStandard, 'id' | 'custom'>) {
  const id = `custom:${crypto.randomUUID()}`;
  updateSettings((s) => {
    s.yield.custom.push({ ...std, id, custom: true });
  });
  return id;
}

export function removeCustomStandard(id: string) {
  updateSettings((s) => {
    s.yield.custom = s.yield.custom.filter((c) => c.id !== id);
    s.yield.recent = s.yield.recent.filter((p) => p.standardId !== id);
  });
}

/** 図に収率を書く (スペクトルごとに右上。前に書いたものは入れ替える) */
export function writeYieldToFigure() {
  const { doc, data } = useEditor.getState();
  const y = doc.yield;
  if (!y) return;
  const { rows } = computeYields(doc, data);
  const ok = rows.filter((r) => r.yields.some((v) => v !== null));
  if (!ok.length) return notify(tr('まだ収率が出ていません (内標の量と生成物を入れてください)'), 'error');
  const v = doc.view;
  edit((d) => {
    const layers = new Set(ok.map((r) => r.layer.id));
    d.annotations = d.annotations.filter((a) => !(a.yieldText && layers.has(a.layerId)));
    for (const r of ok) {
      const x = v.xMin + (v.xMax - v.xMin) * 0.25 - r.meta.refOffset;
      d.annotations.push({ ...annotationDefaults('text'), id: crypto.randomUUID(), layerId: r.layer.id, x1: x, y1: 0.85, x2: x, y2: 0.85, text: figureText(y, r), yieldText: true });
    }
  });
  notify(tr('図に NMR 収率を書きました ({n} 本)。文字は動かしたり直したりできます', { n: ok.length }));
}

/** ホーム画面のサンプルのメモに収率を残す */
export async function saveYieldToNotes() {
  const { doc, data } = useEditor.getState();
  const y = doc.yield;
  if (!y) return;
  const { rows } = computeYields(doc, data);
  const ok = rows.filter((r) => r.yields.some((v) => v !== null) && !r.meta.simulated);
  if (!ok.length) return notify(tr('まだ収率が出ていません (内標の量と生成物を入れてください)'), 'error');
  const day = localDay(Date.now());
  let added = 0;
  for (const r of ok) {
    const key = sampleKeyOf({ title: r.meta.title, fileName: r.meta.fileName });
    const memo = useLibrary.getState().notes[key]?.memo ?? '';
    const line = memoLine(y, r, day);
    if (memo.split('\n').includes(line)) continue;
    await saveNote(key, { memo: memo ? `${memo}\n${line}` : line });
    added++;
  }
  notify(added ? tr('ホーム画面のサンプルのメモに残しました ({n} 件)', { n: added }) : tr('同じ収率はもうメモにあります'));
}

/** 推移グラフを NMR 収率 (%) で出す (内標を基準の範囲、生成物を追う範囲にする) */
export function showYieldTrend() {
  const { doc } = useEditor.getState();
  const y = doc.yield;
  if (!y?.standardRange || !y.products.length) return notify(tr('内標の範囲と生成物を入れてください'), 'error');
  const colors = ['#d12b2b', '#1f4fd1', '#1f9e1f', '#d17a00', '#8a2bd1', '#0f8c8c'];
  edit((d) => {
    const own = d.trend.regions.filter((r) => !r.id.startsWith('yield-'));
    d.trend.regions = [
      { id: 'yield-standard', name: y.standard.name, color: '#666666', from: y.standardRange!.from, to: y.standardRange!.to, nH: y.standard.nH },
      ...y.products.map((p, k) => ({ id: `yield-${p.id}`, name: p.name || tr('生成物 {n}', { n: k + 1 }), color: colors[k % colors.length], from: p.from, to: p.to, nH: p.nH })),
      ...own,
    ];
    d.trend.referenceId = 'yield-standard';
    d.trend.normalize = 'yield';
    d.trend.measure = 'area';
    d.trend.yLabel = '';
  });
  setCanvasTab('trend');
}

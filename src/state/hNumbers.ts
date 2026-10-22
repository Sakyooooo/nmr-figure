/**
 * 構造式の H の番号 (本人の希望 2026-10-22): 番号を振る・直す・外す、ピークの上に番号を付ける。
 * H のまとまりは裏 (lib/hNumbers.worker.ts) で OpenChemLib が求める
 */
import { tr } from '../i18n';
import { hashText } from '../lib/cdxml';
import type { HNumbering, HSite } from './types';
import { edit, notify, useEditor } from './store';

interface Reply {
  sites: HSite[];
  labels: Record<string, string>;
}

let worker: Worker | null = null;
let seq = 0;
const waiting = new Map<number, { resolve: (r: Reply) => void; reject: (e: Error) => void }>();

/** H のまとまりと、骨格に沿って振った番号 (start は始める原子) */
async function analyze(cdxml: string, start?: string): Promise<Reply> {
  // テスト (Node) では Worker がないので、その場で求める
  if (typeof Worker === 'undefined') {
    const [OCL, lib] = await Promise.all([import('openchemlib'), import('../lib/protonNumbering')]);
    const a = lib.analyzeHydrogens(cdxml, OCL);
    return { sites: a.sites, labels: lib.autoNumber(a, start) };
  }
  if (!worker) {
    worker = new Worker(new URL('../lib/hNumbers.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (e: MessageEvent<{ id: number; error?: string } & Partial<Reply>>) => {
      const w = waiting.get(e.data.id);
      if (!w) return;
      waiting.delete(e.data.id);
      if (e.data.error || !e.data.sites || !e.data.labels) w.reject(new Error(e.data.error ?? 'no result'));
      else w.resolve({ sites: e.data.sites, labels: e.data.labels });
    });
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    worker!.postMessage({ id, cdxml, start });
  });
}

const imageOf = (imageId: string) => useEditor.getState().doc.figureImages.find((x) => x.id === imageId);

/** 構造式の H に番号を振る (振り直す)。start を選ぶと、その原子から骨格をたどって振り直す */
export async function numberHydrogens(imageId: string, start?: string): Promise<boolean> {
  const image = imageOf(imageId);
  if (!image?.cdxml) {
    notify(tr('H の番号は ChemDraw の構造式だけに振れます'), 'error');
    return false;
  }
  const cdxml = image.cdxml;
  let r: Reply;
  try {
    r = await analyze(cdxml, start);
  } catch (e) {
    notify(tr('H の番号を振れませんでした: {message}', { message: (e as Error).message }), 'error');
    return false;
  }
  // 求めているあいだに構造式が変わったら使わない
  if (imageOf(imageId)?.cdxml !== cdxml) return false;
  if (!r.sites.length) {
    notify(tr('この構造式には H がありません'), 'info');
    return false;
  }
  edit((d) => {
    const im = d.figureImages.find((x) => x.id === imageId);
    if (!im) return;
    // 手でずらした H の位置は振り直しても残す
    const keys = new Set(r.sites.map((x) => x.key));
    const offsets = Object.fromEntries(Object.entries(im.hNumbers?.offsets ?? {}).filter(([k]) => keys.has(k)));
    im.hNumbers = { source: hashText(cdxml), sites: r.sites, labels: r.labels, ...(Object.keys(offsets).length ? { offsets } : {}) };
  });
  return true;
}

/**
 * ChemDraw で直した構造式で、H のまとまりを求め直す。残った H の番号はそのまま、
 * 新しい H には続きの番号。外した番号 (前からあって番号のない H) は外したまま
 */
export async function refreshHNumbers(imageId: string): Promise<void> {
  const image = imageOf(imageId);
  if (!image?.cdxml || !image.hNumbers) return;
  const cdxml = image.cdxml;
  if (image.hNumbers.source === hashText(cdxml)) return;
  let r: Reply;
  try {
    r = await analyze(cdxml);
  } catch {
    return;
  }
  const now = imageOf(imageId);
  if (now?.cdxml !== cdxml || !now.hNumbers) return;
  const labels = mergeLabels(now.hNumbers, r.sites);
  const keys = new Set(r.sites.map((s) => s.key));
  // 構造式の直しと同じ一手 (元に戻すと、前の構造式と前の番号に戻る)
  edit((d) => {
    const im = d.figureImages.find((x) => x.id === imageId);
    if (!im) return;
    const offsets = Object.fromEntries(Object.entries(im.hNumbers?.offsets ?? {}).filter(([k]) => keys.has(k)));
    im.hNumbers = { source: hashText(cdxml), sites: r.sites, labels, ...(Object.keys(offsets).length ? { offsets } : {}) };
    d.hAssigns = d.hAssigns.filter((a) => a.imageId !== imageId || (keys.has(a.key) && labels[a.key] !== undefined));
  }, false);
}

/** 求め直したまとまりに、前の番号を引き継ぐ */
export function mergeLabels(old: HNumbering, sites: HSite[]): Record<string, string> {
  const envLabel = new Map<number, string>();
  for (const s of sites) {
    const l = old.labels[s.key];
    if (l !== undefined && !envLabel.has(s.env)) envLabel.set(s.env, l);
  }
  const before = new Set(old.sites.map((s) => s.key));
  let next = Math.max(0, ...Object.values(old.labels).map((l) => parseInt(l, 10)).filter(Number.isFinite)) + 1;
  const labels: Record<string, string> = {};
  for (const s of sites) {
    let l = envLabel.get(s.env);
    if (l === undefined) {
      if (before.has(s.key)) continue;
      l = String(next++);
      envLabel.set(s.env, l);
    }
    labels[s.key] = l;
  }
  return labels;
}

/** 同じ環境の H (対称で同じ H) の key */
function sameEnv(n: HNumbering, key: string): string[] {
  const site = n.sites.find((s) => s.key === key);
  return site ? n.sites.filter((s) => s.env === site.env).map((s) => s.key) : [];
}

/** H の番号を書き換える (同じ環境の H もいっしょに)。空にすると外す */
export function setHLabel(imageId: string, key: string, label: string) {
  const text = label.trim();
  edit((d) => {
    const n = d.figureImages.find((x) => x.id === imageId)?.hNumbers;
    if (!n) return;
    for (const k of sameEnv(n, key)) {
      if (text) n.labels[k] = text;
      else delete n.labels[k];
    }
    if (!text) d.hAssigns = d.hAssigns.filter((a) => a.imageId !== imageId || n.labels[a.key] !== undefined);
  });
}

/** H の字をずらす (CDXML の座標で pt。0 なら元の位置) */
export function setHOffset(imageId: string, key: string, x: number, y: number, record = true) {
  edit((d) => {
    const n = d.figureImages.find((im) => im.id === imageId)?.hNumbers;
    if (!n) return;
    const r = (v: number) => Math.round(v * 100) / 100;
    n.offsets ??= {};
    if (r(x) || r(y)) n.offsets[key] = { x: r(x), y: r(y) };
    else delete n.offsets[key];
  }, record);
}

/** 構造式の H の番号をすべて消す (ピークの上の番号も) */
export function clearHNumbers(imageId: string) {
  edit((d) => {
    const im = d.figureImages.find((x) => x.id === imageId);
    if (im) delete im.hNumbers;
    d.hAssigns = d.hAssigns.filter((a) => a.imageId !== imageId);
  });
  useEditor.setState({ activeH: null });
}

/** 番号の数字の順 (3 < 10、3a のような番号はその数字のところ) */
export function compareLabels(p: string, q: string) {
  const a = parseFloat(p);
  const b = parseFloat(q);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) return a - b;
  return p.localeCompare(q);
}

/**
 * ピークに、選んだ H の番号を付ける・外す。同じピーク (tol 以内) にもう同じ番号があれば外す
 */
export function toggleHAssign(layerId: string, ppm: number, tol: number) {
  const { activeH, doc } = useEditor.getState();
  if (!activeH) {
    notify(tr('先に構造式の H をクリックして選んでください'), 'error');
    return;
  }
  const n = doc.figureImages.find((x) => x.id === activeH.imageId)?.hNumbers;
  const label = n?.labels[activeH.key];
  if (!n || label === undefined) return;
  edit((d) => {
    const here = d.hAssigns.filter((a) => a.layerId === layerId && Math.abs(a.ppm - ppm) <= tol && a.imageId === activeH.imageId && n.labels[a.key] === label);
    if (here.length) d.hAssigns = d.hAssigns.filter((a) => !here.includes(a));
    else d.hAssigns.push({ id: crypto.randomUUID(), layerId, ppm, imageId: activeH.imageId, key: activeH.key });
  });
}

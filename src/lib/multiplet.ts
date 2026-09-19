import type { SpectrumMeta } from '../state/types';
import { indexRange, noiseLevel, ppmAt } from './spectrum';

type Axis = Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset'>;

export interface Line {
  /** 表示 ppm */
  ppm: number;
  height: number;
}

export interface MultipletResult {
  /** 化学シフト (表示 ppm)。多重線の中心 */
  center: number;
  /** 一番外側の線 (表示 ppm)。m のときの範囲表記に使う */
  hi: number;
  lo: number;
  lines: Line[];
  /** s, d, t, q, quint, sext, sept, dd, dt, td, ddd … / m / br s */
  mult: string;
  /** 結合定数 (Hz)。大きい順、同じ値は1つにまとめる */
  J: number[];
}

const NAMES = ['', 'd', 't', 'q', 'quint', 'sext', 'sept', 'oct', 'non'];

/**
 * 範囲 (表示 ppm) の多重線を一次の解析で読む。
 * Hoye らの方法 (J. Org. Chem. 2002, 67, 4014): 外側の線を強度 1 として各線の強度を整数にし、
 * 左端から順に「まだ説明できていない一番近い線」までの距離を結合定数として木を作る。
 * 説明しきれないとき、線が多すぎるときは m とする。
 */
export function analyzeMultiplet(data: Float32Array, meta: Axis, from: number, to: number, freqMHz: number): MultipletResult {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const lines = findLines(data, meta, lo, hi);
  const step = Math.abs(meta.last - meta.first) / (meta.n - 1);
  if (!lines.length) {
    const mid = (lo + hi) / 2;
    return { center: mid, hi, lo, lines, mult: 'm', J: [] };
  }
  const outer = { hi: lines[0].ppm, lo: lines[lines.length - 1].ppm };
  const centroid = lines.reduce((s, l) => s + l.ppm * l.height, 0) / lines.reduce((s, l) => s + l.height, 0);
  const asM = (): MultipletResult => ({ center: centroid, ...outer, lines, mult: 'm', J: [] });

  if (lines.length === 1) {
    const fwhmHz = fullWidth(data, meta, lines[0]) * step * freqMHz;
    return { center: lines[0].ppm, ...outer, lines, mult: fwhmHz > 6 ? 'br s' : 's', J: [] };
  }
  if (lines.length > 24) return asM();

  // 左 (高 ppm) を 0 とした Hz の位置
  const pos = lines.map((l) => (lines[0].ppm - l.ppm) * freqMHz);
  const tree = jTree(pos, lines.map((l) => l.height));
  if (!tree) return asM();
  const center = lines[0].ppm - tree.center / freqMHz;
  const groups = groupJ(tree.J);
  const mult = groups.map((g) => NAMES[g.count] ?? `${g.count + 1}`).join('');
  return { center, ...outer, lines, mult, J: groups.map((g) => g.value) };
}

/** 範囲内の線 (極大)。小さすぎるものとノイズは除く */
export function findLines(data: Float32Array, meta: Axis, lo: number, hi: number): Line[] {
  const [i0, i1] = indexRange(meta, lo, hi);
  let top = 0;
  for (let i = i0; i <= i1; i++) if (data[i] > top) top = data[i];
  if (top <= 0) return [];
  const floor = Math.max(top * 0.025, noiseLevel(data) * 6);
  const found: Line[] = [];
  for (let i = Math.max(i0, 2); i <= Math.min(i1, data.length - 3); i++) {
    const v = data[i];
    if (v < floor) continue;
    if (!(v > data[i - 1] && v >= data[i + 1] && v >= data[i - 2] && v >= data[i + 2])) continue;
    // 肩 (谷がほとんどない盛り上がり) は線として数えない
    const prev = found[found.length - 1];
    if (prev) {
      const j = Math.round(indexOfPpm(meta, prev.ppm));
      let valley = Infinity;
      for (let k = Math.min(j, i); k <= Math.max(j, i); k++) valley = Math.min(valley, data[k]);
      if (valley > Math.min(prev.height, v) * 0.97) {
        if (v > prev.height) found[found.length - 1] = refine(data, meta, i);
        continue;
      }
    }
    found.push(refine(data, meta, i));
  }
  // 表示の向き (高 ppm → 低 ppm) にそろえる
  return found.sort((a, b) => b.ppm - a.ppm);
}

function indexOfPpm(meta: Axis, ppm: number) {
  return ((ppm - meta.refOffset - meta.first) / (meta.last - meta.first)) * (meta.n - 1);
}

function refine(data: Float32Array, meta: Axis, i: number): Line {
  const a = data[i - 1];
  const b = data[i];
  const c = data[i + 1];
  const denom = a - 2 * b + c;
  const frac = denom === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom));
  return { ppm: ppmAt(meta, i + frac), height: b - 0.25 * (a - c) * frac };
}

/** 半値全幅 (点の数) */
function fullWidth(data: Float32Array, meta: Axis, line: Line) {
  const c = Math.round(indexOfPpm(meta, line.ppm));
  const half = line.height / 2;
  let l = c;
  while (l > 0 && data[l] > half) l--;
  let r = c;
  while (r < data.length - 1 && data[r] > half) r++;
  const left = l + (half - data[l]) / (data[l + 1] - data[l] || 1);
  const right = r - 1 + (data[r - 1] - half) / (data[r - 1] - data[r] || 1);
  return right - left;
}

/**
 * 結合の木。pos は左端 = 0 の Hz (昇順)、height は各線の強度。
 * 成功すれば J (見つかった順) と中心 (Hz) を返す。
 */
export function jTree(pos: number[], height: number[]): { J: number[]; center: number } | null {
  const n = pos.length;
  const width = pos[n - 1] - pos[0];
  const sum = height.reduce((a, b) => a + b, 0);
  // 強度の合計は 2 のべき乗になるはず。隣の線の裾で外側の線が持ち上がるので、
  // 外側 = 1 と決めつけず、各べき乗で整数に丸めて一番よく合うものから試す
  const candidates: { units: number[]; error: number }[] = [];
  for (let total = 2; total <= 512; total *= 2) {
    if (total < n) continue;
    const unit = sum / total;
    const units = height.map((h) => Math.max(1, Math.round(h / unit)));
    if (units.reduce((a, b) => a + b, 0) !== total) continue;
    const error = height.reduce((e, h, i) => e + (h / unit - units[i]) ** 2, 0) / n;
    candidates.push({ units, error });
  }
  candidates.sort((a, b) => a.error - b.error);
  for (const { units } of candidates) {
    const components: number[] = [];
    pos.forEach((p, i) => {
      for (let k = 0; k < units[i]; k++) components.push(p);
    });
    const result = buildTree(components, width);
    if (result) return result;
  }
  return null;
}

function buildTree(components: number[], width: number): { J: number[]; center: number } | null {
  const remaining = components.slice(1);
  let tree = [components[0]];
  const J: number[] = [];
  while (remaining.length) {
    const j = Math.min(...remaining) - components[0];
    if (j <= 0) return null;
    const added = tree.map((x) => x + j);
    for (const x of added) {
      const tol = Math.max(0.6, j * 0.08, width * 0.02);
      let best = -1;
      let bestD = Infinity;
      remaining.forEach((r, k) => {
        const d = Math.abs(r - x);
        if (d < bestD) {
          bestD = d;
          best = k;
        }
      });
      if (best < 0 || bestD > tol) return null;
      remaining.splice(best, 1);
    }
    tree = tree.concat(added);
    J.push(j);
  }
  const center = components.reduce((a, b) => a + b, 0) / components.length;
  return { J, center };
}

/** 同じくらいの J をまとめる (大きい順) */
function groupJ(js: number[]): { value: number; count: number }[] {
  const sorted = [...js].sort((a, b) => b - a);
  const groups: { sum: number; count: number }[] = [];
  for (const j of sorted) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.sum / g.count - j) <= Math.max(0.5, (g.sum / g.count) * 0.08)) {
      g.sum += j;
      g.count++;
    } else groups.push({ sum: j, count: 1 });
  }
  return groups.map((g) => ({ value: g.sum / g.count, count: g.count }));
}

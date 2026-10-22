/**
 * 構造式の H の番号を図に置く (1D・2D の図、「ChemDraw で開く」で共通)。
 *  - 文字のない炭素: 結合のない側へ短い線を出し、先に「H³」。環境の違う H が 2 つあれば少し開いた線 2 本
 *  - 文字のある原子 (OH・NH・OMe など) と、ChemDraw で描いてある H: 文字の右上に番号 (結合のない側が左なら左上)
 * 文字の大きさ・字体・線の太さは構造式 (ChemDraw の書式) に合わせる
 */
import type { FigureImage } from '../state/types';
import { cdxmlAtomSites, drawCdxml, textWidth } from './cdxml';
import { imageRect, PX_PER_PT } from './scene';

/** 上付きの大きさと上げる量 (ChemDraw の上付きと同じ割合) */
export const H_SUP_SIZE = 0.75;
const H_SUP_SHIFT = 0.31;

export interface PlacedH {
  imageId: string;
  /** ここに書いた H のまとまり (文字の原子は環境がいくつかあることがある: Ph など) */
  keys: string[];
  /** C–H の線 (図の座標)。文字の原子は null */
  line: { x1: number; y1: number; x2: number; y2: number } | null;
  /** H の字の中央の基線。文字の原子は null */
  h: { x: number; y: number } | null;
  /** 番号 (上付き) の左端の基線 */
  num: { x: number; y: number; text: string };
  /** H の字の大きさ (図の座標)。番号は H_SUP_SIZE 倍 */
  size: number;
  font: string;
  lineWidth: number;
  color: string;
}

const INK = '#000000';

/** 番号の並び (3 < 10) */
function byLabel(p: string, q: string) {
  const a = parseFloat(p);
  const b = parseFloat(q);
  return Number.isFinite(a) && Number.isFinite(b) && a !== b ? a - b : p.localeCompare(q);
}

const rotate = (v: { x: number; y: number }, deg: number) => {
  const t = (deg * Math.PI) / 180;
  return { x: v.x * Math.cos(t) - v.y * Math.sin(t), y: v.x * Math.sin(t) + v.y * Math.cos(t) };
};

/** 構造式の 1 pt (CDXML の座標) が図の何 px か */
export function hScale(image: FigureImage, figure: { width: number; height: number }): number {
  const drawing = image.cdxml ? drawCdxml(image.cdxml, 1) : null;
  return drawing ? imageRect(image, figure).w / (drawing.box.r - drawing.box.l || 1) : 1;
}

/** 図に置いた構造式の H の番号 */
export function placeHLabels(images: FigureImage[], figure: { width: number; height: number }): PlacedH[] {
  const out: PlacedH[] = [];
  for (const image of images) {
    const n = image.hNumbers;
    if (!image.cdxml || !n) continue;
    const drawing = drawCdxml(image.cdxml, 1);
    if (!drawing) continue;
    const { box } = drawing;
    const r = imageRect(image, figure);
    const k = r.w / (box.r - box.l || 1);
    const X = (x: number) => r.x + (x - box.l) * k;
    const Y = (y: number) => r.y + (y - box.t) * k;
    const size = drawing.labelSize;
    const sup = size * H_SUP_SIZE;
    const atoms = new Map(cdxmlAtomSites(image.cdxml).map((s) => [s.id, s]));
    const offsetOf = (keys: string[]) => n.offsets?.[[...keys].sort()[0]] ?? { x: 0, y: 0 };
    // 原子ごとにまとめる
    const byAtom = new Map<string, string[]>();
    for (const s of n.sites) {
      if (n.labels[s.key] === undefined) continue;
      if (!byAtom.has(s.atomId)) byAtom.set(s.atomId, []);
      byAtom.get(s.atomId)!.push(s.key);
    }
    // 線の太さは構造式の結合と同じ (構造式は大きさを変えても線の太さは変えない: FigureImages)
    const common = { imageId: image.id, size: size * k, font: drawing.labelFont, lineWidth: drawing.lineWidth * PX_PER_PT, color: INK };
    // よける物 (CDXML の座標): 原子の文字・結合・ほかの原子・置いた H
    const boxes: Rect[] = Object.values(drawing.labels);
    const segments: [P, P][] = [];
    for (const a of atoms.values()) for (const id of a.neighbors) if (a.id < id && atoms.has(id)) segments.push([a, atoms.get(id)!]);
    const points = [...atoms.values()].filter((a) => !drawing.labels[a.id]);
    // 文字の原子の番号を先に (位置が決まっている)
    const carbons: [AtomSiteLike, string[]][] = [];
    for (const [atomId, keys] of byAtom) {
      const at = atoms.get(atomId);
      if (!at) continue;
      const label = drawing.labels[atomId];
      if (label || at.labeled) {
        // 文字の右上 (結合のない側が左なら左上) に番号を並べて
        const text = [...new Set(keys.map((key) => n.labels[key]))].sort(byLabel).join(',');
        const box2 = label ?? { l: at.x - size * 0.35, r: at.x + size * 0.35, t: at.y - size * 0.4, b: at.y + size * 0.36 };
        const base = box2.b - size * 0.02 - size * H_SUP_SHIFT;
        const w = textWidth(text, sup);
        const off = offsetOf(keys);
        const nx = (at.dir.x < -0.5 ? box2.l - w - size * 0.05 : box2.r + size * 0.05) + off.x;
        boxes.push({ l: nx, r: nx + w, t: base + off.y - sup * 0.75, b: base + off.y });
        out.push({ ...common, keys, line: null, h: null, num: { x: X(nx), y: Y(base + off.y), text } });
        continue;
      }
      carbons.push([at, keys]);
    }
    // 炭素: 結合のない側へ線を出して H。環境の違う H が 2 つ・3 つなら開いて。
    // ほかの物に近すぎるときは、離れる向きへ少しずつ回す (込み入った錯体で、N の隣の H が金属のまわりの字に重ならないように)
    const wH = textWidth('H', size);
    const reachOf = (at: AtomSiteLike) => at.bondLen * 0.75;
    const frameAt = (at: AtomSiteLike, u: P, text: string) => {
      const hx = at.x + u.x * reachOf(at);
      const hy = at.y + u.y * reachOf(at);
      return { hx, hy, frame: { l: hx - wH / 2, r: hx + wH / 2 + textWidth(text, sup), t: hy - size * 0.42, b: hy + size * 0.42 } };
    };
    const clearance = (at: AtomSiteLike, f: Rect, hx: number, hy: number) => {
      let d = Infinity;
      for (const b of boxes) d = Math.min(d, rectGap(b, f));
      for (const p of points) if (p !== at) d = Math.min(d, pointGap(p, f));
      for (const [a, b] of segments) d = Math.min(d, segmentGap(a, b, f));
      // C–H の線が、ほかの原子の文字を横切らない
      for (const b of boxes) for (let t = 0.35; t < 1; t += 0.2) d = Math.min(d, pointGap({ x: at.x + (hx - at.x) * t, y: at.y + (hy - at.y) * t }, b) + size * 0.2);
      return d;
    };
    // 回すのは ±60° まで (それより回すと環の内側や結合の上に向く)
    const TURNS = [0, 15, -15, 30, -30, 45, -45, 60, -60];
    for (const [at, keys] of carbons) {
      const sorted = [...keys].sort();
      const spread = sorted.length === 1 ? [0] : sorted.length === 2 ? [-32, 32] : [-55, 0, 55];
      let best: { turn: number; d: number } | null = null;
      for (const turn of TURNS) {
        const d = Math.min(
          ...sorted.map((key, i) => {
            const { hx, hy, frame } = frameAt(at, rotate(at.dir, turn + (spread[i] ?? 0)), n.labels[key]);
            return clearance(at, frame, hx, hy);
          }),
        );
        if (!best || d > best.d + 1e-6) best = { turn, d };
        if (d >= size * 0.25) break;
      }
      sorted.forEach((key, i) => {
        const text = n.labels[key];
        const placed = frameAt(at, rotate(at.dir, (best?.turn ?? 0) + (spread[i] ?? 0)), text);
        // 手でずらしたぶん
        const off = offsetOf([key]);
        const hx = placed.hx + off.x;
        const hy = placed.hy + off.y;
        const frame = { l: placed.frame.l + off.x, r: placed.frame.r + off.x, t: placed.frame.t + off.y, b: placed.frame.b + off.y };
        boxes.push(frame);
        // 線は「H³」の枠の手前で止める
        const end = exitFrom(frame, at.x, at.y, hx, hy);
        out.push({
          ...common,
          keys: [key],
          line: { x1: X(at.x), y1: Y(at.y), x2: X(end.x), y2: Y(end.y) },
          h: { x: X(hx), y: Y(hy + size * 0.36) },
          num: { x: X(hx + wH / 2), y: Y(hy + size * 0.36 - size * H_SUP_SHIFT), text },
        });
      });
    }
  }
  return out;
}

type P = { x: number; y: number };
type Rect = { l: number; r: number; t: number; b: number };
type AtomSiteLike = ReturnType<typeof cdxmlAtomSites>[number];

/** 点と枠の間の距離 (中なら 0) */
function pointGap(p: P, f: Rect) {
  const dx = Math.max(f.l - p.x, 0, p.x - f.r);
  const dy = Math.max(f.t - p.y, 0, p.y - f.b);
  return Math.hypot(dx, dy);
}

function rectGap(a: Rect, f: Rect) {
  const dx = Math.max(a.l - f.r, 0, f.l - a.r);
  const dy = Math.max(a.t - f.b, 0, f.t - a.b);
  return Math.hypot(dx, dy);
}

/** 線分と枠の間の距離 (線分の上の点で見る) */
function segmentGap(a: P, b: P, f: Rect) {
  let d = Infinity;
  for (let t = 0; t <= 1.0001; t += 0.125) d = Math.min(d, pointGap({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, f));
  return d;
}

/** (ax, ay) から (hx, hy) へ向かう線が、(hx, hy) を囲む枠に入る点 (少し手前) */
function exitFrom(frame: { l: number; r: number; t: number; b: number }, ax: number, ay: number, hx: number, hy: number) {
  const dx = ax - hx;
  const dy = ay - hy;
  let t = 1;
  if (dx > 0) t = Math.min(t, (frame.r - hx) / dx);
  if (dx < 0) t = Math.min(t, (frame.l - hx) / dx);
  if (dy > 0) t = Math.min(t, (frame.b - hy) / dy);
  if (dy < 0) t = Math.min(t, (frame.t - hy) / dy);
  t = Math.min(1, t * 1.15);
  return { x: hx + dx * t, y: hy + dy * t };
}

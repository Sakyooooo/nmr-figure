/**
 * 2D の等高線。
 * 表示する範囲を画面の細かさに合わせて取り直してから、マーチングスクエア法で線を引く。
 * (点がピクセルより多いときは最大値でまとめる。少ないときは間を補う)
 */
import { colAt, rowAt, type Spectrum2dData } from './fid2d';

export interface ContourGrid {
  v: Float32Array;
  cols: number;
  rows: number;
  /** 格子の中心の ppm (col 0 と col cols-1) */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface View2d {
  xMax: number;
  xMin: number;
  yMax: number;
  yMin: number;
}

/** 表示範囲を cols × rows の格子にする */
export function sampleGrid(s: Spectrum2dData, view: View2d, cols: number, rows: number): ContourGrid {
  cols = Math.max(2, Math.min(cols, 4000));
  rows = Math.max(2, Math.min(rows, 4000));
  const v = new Float32Array(cols * rows);
  // 格子の点が対応するデータの位置 (小数)
  const c0 = colAt(s, view.xMax);
  const c1 = colAt(s, view.xMin);
  const r0 = rowAt(s, view.yMax);
  const r1 = rowAt(s, view.yMin);
  const perColumn = Math.abs(c1 - c0) / cols;
  const perRow = Math.abs(r1 - r0) / rows;
  const value = (col: number, row: number) => {
    const c = Math.min(s.n2 - 1, Math.max(0, col));
    const r = Math.min(s.n1 - 1, Math.max(0, row));
    if (perColumn < 1 && perRow < 1) {
      // 間を補う (拡大したとき)
      const ci = Math.floor(c);
      const ri = Math.floor(r);
      const fc = c - ci;
      const fr = r - ri;
      const ci2 = Math.min(s.n2 - 1, ci + 1);
      const ri2 = Math.min(s.n1 - 1, ri + 1);
      const a = s.data[ri * s.n2 + ci];
      const b = s.data[ri * s.n2 + ci2];
      const d = s.data[ri2 * s.n2 + ci];
      const e = s.data[ri2 * s.n2 + ci2];
      return (a * (1 - fc) + b * fc) * (1 - fr) + (d * (1 - fc) + e * fc) * fr;
    }
    return s.data[Math.round(r) * s.n2 + Math.round(c)];
  };
  for (let y = 0; y < rows; y++) {
    const rowCenter = r0 + ((r1 - r0) * (y + 0.5)) / rows;
    for (let x = 0; x < cols; x++) {
      const colCenter = c0 + ((c1 - c0) * (x + 0.5)) / cols;
      if (perColumn < 1 && perRow < 1) {
        v[y * cols + x] = value(colCenter, rowCenter);
        continue;
      }
      // 縮めるときは、そのますの中の最大値 (小さいピークを消さない)
      let m = 0;
      const ca = Math.max(0, Math.round(colCenter - perColumn / 2));
      const cb = Math.min(s.n2 - 1, Math.round(colCenter + perColumn / 2));
      const ra = Math.max(0, Math.round(rowCenter - perRow / 2));
      const rb = Math.min(s.n1 - 1, Math.round(rowCenter + perRow / 2));
      for (let r = ra; r <= rb; r++) {
        const base = r * s.n2;
        for (let c = ca; c <= cb; c++) {
          const t = s.data[base + c];
          if (t > m) m = t;
        }
      }
      v[y * cols + x] = m;
    }
  }
  const px = (t: number) => view.xMax + (view.xMin - view.xMax) * t;
  const py = (t: number) => view.yMax + (view.yMin - view.yMax) * t;
  return { v, cols, rows, x0: px(0.5 / cols), x1: px((cols - 0.5) / cols), y0: py(0.5 / rows), y1: py((rows - 0.5) / rows) };
}

/** 等高線の高さ。一番下を base として factor 倍ずつ */
export function contourLevels(maxAbs: number, base: number, count: number, factor: number): number[] {
  const out: number[] = [];
  let v = maxAbs * Math.max(1e-6, base);
  for (let i = 0; i < count; i++) {
    out.push(v);
    v *= Math.max(1.01, factor);
    if (v > maxAbs) break;
  }
  return out;
}

/**
 * マーチングスクエア法。格子の各ますで、四隅がしきい値の上下どちらかを見て線分を出す。
 * 線分をつなげずに M/L のまま並べる (SVG では見た目が同じで、計算が速い)
 */
export function contourPath(
  g: ContourGrid,
  level: number,
  toPx: (x: number, y: number) => [number, number],
  limit = 40000,
): { d: string; truncated: boolean } {
  const { v, cols, rows } = g;
  const parts: string[] = [];
  const gx = (col: number) => g.x0 + ((g.x1 - g.x0) * col) / (cols - 1);
  const gy = (row: number) => g.y0 + ((g.y1 - g.y0) * row) / (rows - 1);
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const [ax, ay] = toPx(gx(x1), gy(y1));
    const [bx, by] = toPx(gx(x2), gy(y2));
    parts.push(`M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`);
  };
  const mix = (a: number, b: number) => (level - a) / (b - a || 1e-12);

  for (let r = 0; r < rows - 1; r++) {
    // 雑音ばかりのときは線が数十万本になるので、多すぎたらやめる
    if (parts.length > limit) return { d: '', truncated: true };
    for (let c = 0; c < cols - 1; c++) {
      const tl = v[r * cols + c];
      const tr = v[r * cols + c + 1];
      const bl = v[(r + 1) * cols + c];
      const br = v[(r + 1) * cols + c + 1];
      let code = 0;
      if (tl >= level) code |= 8;
      if (tr >= level) code |= 4;
      if (br >= level) code |= 2;
      if (bl >= level) code |= 1;
      if (code === 0 || code === 15) continue;
      // 各辺との交点 (上・右・下・左)
      const top: [number, number] = [c + mix(tl, tr), r];
      const right: [number, number] = [c + 1, r + mix(tr, br)];
      const bottom: [number, number] = [c + mix(bl, br), r + 1];
      const left: [number, number] = [c, r + mix(tl, bl)];
      switch (code) {
        case 1:
        case 14:
          seg(left[0], left[1], bottom[0], bottom[1]);
          break;
        case 2:
        case 13:
          seg(bottom[0], bottom[1], right[0], right[1]);
          break;
        case 3:
        case 12:
          seg(left[0], left[1], right[0], right[1]);
          break;
        case 4:
        case 11:
          seg(top[0], top[1], right[0], right[1]);
          break;
        case 5:
          seg(left[0], left[1], top[0], top[1]);
          seg(bottom[0], bottom[1], right[0], right[1]);
          break;
        case 6:
        case 9:
          seg(top[0], top[1], bottom[0], bottom[1]);
          break;
        case 7:
        case 8:
          seg(left[0], left[1], top[0], top[1]);
          break;
        case 10:
          seg(left[0], left[1], bottom[0], bottom[1]);
          seg(top[0], top[1], right[0], right[1]);
          break;
      }
    }
  }
  return { d: parts.join(''), truncated: false };
}

/** 上 (F2) と右 (F1) に出す 1D 投影。格子の最大値を使う */
export function projections(g: ContourGrid) {
  const top = new Float32Array(g.cols);
  const right = new Float32Array(g.rows);
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.cols; c++) {
      const t = g.v[r * g.cols + c];
      if (t > top[c]) top[c] = t;
      if (t > right[r]) right[r] = t;
    }
  }
  return { top, right };
}

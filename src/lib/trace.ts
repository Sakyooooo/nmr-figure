import { tr } from '../i18n';
/**
 * 文献の図 (画像) から波形を読み取る。
 * 論文の SI の図は、線が 1 本の折れ線なので、列ごとに「いちばん上のインクの点」を拾えば波形になる。
 * 解像度の壁 (400 MHz で 1 画素 ≈ 2〜4 Hz) があるので、位置や J は SI の文を優先し、
 * ここで読むのは線幅や山の形といった「文からは分からないもの」に使う。
 */

export interface Pixels {
  width: number;
  height: number;
  /** RGBA が 4 バイトずつ並んだもの (canvas の ImageData と同じ) */
  data: Uint8ClampedArray;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Trace {
  /** 枠の左端の ppm (ふつうは大きい方) */
  left: number;
  /** 枠の右端の ppm */
  right: number;
  /** 列ごとの高さ (左から右へ)。ベースラインを 0 にしてある */
  y: Float32Array;
  /** インクが見つからなかった列の数 */
  blank: number;
  /** 引いたベースラインの位置 (枠の下からの画素数)。画像に重ねて描くときに使う */
  base: number;
}

const luminance = (d: Uint8ClampedArray, i: number) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

/** 枠の中の明るさから、線とみなすしきい値を決める */
function inkThreshold(image: Pixels, rect: Rect): number {
  const values: number[] = [];
  const stepX = Math.max(1, Math.floor(rect.w / 200));
  const stepY = Math.max(1, Math.floor(rect.h / 200));
  for (let y = rect.y; y < rect.y + rect.h; y += stepY) {
    for (let x = rect.x; x < rect.x + rect.w; x += stepX) {
      const i = (y * image.width + x) * 4;
      values.push(image.data[i + 3] < 32 ? 255 : luminance(image.data, i));
    }
  }
  values.sort((a, b) => a - b);
  const background = values[Math.floor(values.length * 0.9)] ?? 255;
  const dark = values[Math.floor(values.length * 0.02)] ?? 0;
  // 背景と線の真ん中あたり。ただし背景から 40 は離す
  return Math.min(background - 40, (background + dark) / 2);
}

/** 画像の枠の中を読み取って波形にする */
export function traceImage(image: Pixels, rect: Rect, left: number, right: number): Trace {
  const x0 = Math.max(0, Math.round(rect.x));
  const y0 = Math.max(0, Math.round(rect.y));
  const w = Math.min(image.width - x0, Math.round(rect.w));
  const h = Math.min(image.height - y0, Math.round(rect.h));
  if (w < 8 || h < 8) throw new Error(tr('枠が小さすぎます'));
  const limit = inkThreshold(image, { x: x0, y: y0, w, h });

  const raw = new Float32Array(w);
  let blank = 0;
  for (let c = 0; c < w; c++) {
    let top = -1;
    for (let r = 0; r < h; r++) {
      const i = ((y0 + r) * image.width + (x0 + c)) * 4;
      if (image.data[i + 3] < 32) continue; // 透明は背景
      if (luminance(image.data, i) <= limit) {
        top = r;
        break;
      }
    }
    if (top < 0) blank++;
    raw[c] = top < 0 ? 0 : h - 1 - top;
  }

  // ベースライン = 高さの並びの下の方 (中央値より下) をならしたもの
  const sorted = Array.from(raw).sort((a, b) => a - b);
  const base = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const y = new Float32Array(w);
  for (let c = 0; c < w; c++) y[c] = raw[c] - base;
  return { left, right, y, blank, base };
}

/** ppm → 列の番号 */
function columnAt(trace: Trace, ppm: number) {
  const n = trace.y.length;
  return ((ppm - trace.left) / (trace.right - trace.left)) * (n - 1);
}

/** 1 列ぶんの ppm 幅 */
function ppmPerColumn(trace: Trace) {
  return Math.abs(trace.right - trace.left) / Math.max(1, trace.y.length - 1);
}

/**
 * 文に書かれた δ の位置で、線幅 (半値全幅、Hz) を測る。
 * 山が見つからない・細すぎる・太すぎるときは null (その信号は既定の線幅を使う)。
 */
export function traceWidths(trace: Trace, deltas: number[], freqMHz: number): (number | null)[] {
  const n = trace.y.length;
  const perColumn = ppmPerColumn(trace);
  // 雑音の目安 (小さい方から 70% の値)
  const sorted = Array.from(trace.y).sort((a, b) => a - b);
  const noise = Math.abs(sorted[Math.floor(n * 0.7)] ?? 0) + 1e-6;
  const tolerance = Math.max(2, Math.round(0.03 / perColumn));

  return deltas.map((delta) => {
    const center = Math.round(columnAt(trace, delta));
    if (!Number.isFinite(center) || center < 0 || center >= n) return null;
    let peak = -Infinity;
    let at = center;
    for (let c = Math.max(0, center - tolerance); c <= Math.min(n - 1, center + tolerance); c++) {
      if (trace.y[c] > peak) {
        peak = trace.y[c];
        at = c;
      }
    }
    if (!(peak > noise * 3)) return null;
    const half = peak / 2;
    const walk = (dir: number) => {
      let last = peak;
      for (let i = 1; i <= 400; i++) {
        const v = trace.y[at + dir * i];
        if (v === undefined) return i;
        if (v <= half) return i - 1 + (last === v ? 0.5 : (last - half) / (last - v));
        if (v > last) return i - 1; // 谷を越えて隣の線に入った
        last = v;
      }
      return 400;
    };
    const columns = walk(-1) + walk(1);
    // 3 画素より細い山は、画像の解像度の限界 (線の太さ) しか見ていないので使わない
    if (columns < 3) return null;
    const hz = columns * perColumn * freqMHz;
    if (!(hz > 0.2) || hz > 60) return null;
    return hz;
  });
}

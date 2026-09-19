import type { LayerGeom, Layout } from './layout';
import { indexRange, ppmAt } from './spectrum';

const f1 = (v: number) => (Math.round(v * 10) / 10).toString();

/**
 * スペクトルの線を SVG の path にする。
 * 1px に複数の点が入るときは、その列の最初・最小・最大・最後の4点だけ残す (M4 間引き)。
 * 見た目は変わらず、点数は画面幅の数倍に収まる。プロット領域の外にははみ出さない。
 */
export function tracePath(g: LayerGeom, layout: Layout): string {
  const { meta, data } = g;
  const { plot } = layout;
  const lo = layout.pxToX(plot.x + plot.w);
  const hi = layout.pxToX(plot.x);
  const [i0, i1] = indexRange(meta, lo, hi);
  if (i1 <= i0) return '';
  const top = plot.y;
  const bottom = plot.y + plot.h;
  const left = plot.x;
  const right = plot.x + plot.w;
  const xOf = (i: number) => Math.min(right, Math.max(left, layout.xToPx(ppmAt(meta, i))));
  const yOf = (i: number) => Math.min(bottom, Math.max(top, g.baseY - (data[i] / meta.maxAbs) * g.unit));

  const parts: string[] = [];
  const emit = (i: number) => parts.push(`${parts.length ? 'L' : 'M'}${f1(xOf(i))} ${f1(yOf(i))}`);

  if (i1 - i0 + 1 <= plot.w * 2) {
    for (let i = i0; i <= i1; i++) emit(i);
    return parts.join('');
  }

  let col = Math.floor(xOf(i0));
  let first = i0;
  let last = i0;
  let minI = i0;
  let maxI = i0;
  const flush = () => {
    const idx = [first, minI, maxI, last].sort((a, b) => a - b);
    let prev = -1;
    for (const i of idx) {
      if (i !== prev) emit(i);
      prev = i;
    }
  };
  for (let i = i0 + 1; i <= i1; i++) {
    const c = Math.floor(xOf(i));
    if (c !== col) {
      flush();
      col = c;
      first = last = minI = maxI = i;
      continue;
    }
    last = i;
    if (data[i] < data[minI]) minI = i;
    if (data[i] > data[maxI]) maxI = i;
  }
  flush();
  return parts.join('');
}

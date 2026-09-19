/**
 * ラベルの位置を重ならないように広げる。
 * desired: 希望位置 (昇順でなくてよい)。戻り値は入力と同じ順番の位置。
 * 重なったラベルの塊を希望位置の平均に中心合わせし、[min, max] に収める。
 */
export function spreadLabels(desired: number[], gap: number, min: number, max: number): number[] {
  const order = desired.map((_, i) => i).sort((a, b) => desired[a] - desired[b]);
  type Cluster = { start: number; count: number; sum: number };
  const clusters: Cluster[] = [];
  const place = (c: Cluster) => {
    const width = (c.count - 1) * gap;
    let start = c.sum / c.count - width / 2;
    start = Math.min(Math.max(start, min), max - width);
    c.start = start;
  };
  for (const idx of order) {
    const c: Cluster = { start: desired[idx], count: 1, sum: desired[idx] };
    place(c);
    clusters.push(c);
    // 直前の塊と重なる限り結合する
    while (clusters.length > 1) {
      const b = clusters[clusters.length - 1];
      const a = clusters[clusters.length - 2];
      if (a.start + (a.count - 1) * gap + gap <= b.start + 1e-9) break;
      a.count += b.count;
      a.sum += b.sum;
      clusters.pop();
      place(a);
    }
  }
  const out = new Array<number>(desired.length);
  let k = 0;
  for (const c of clusters) {
    for (let j = 0; j < c.count; j++) out[order[k++]] = c.start + j * gap;
  }
  return out;
}

/** 目盛りのきりのよい間隔 */
export function niceStep(range: number, targetCount: number): number {
  const raw = Math.abs(range) / Math.max(1, targetCount);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / p;
  const nice = f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10;
  return nice * p;
}

export function ticks(lo: number, hi: number, step: number): number[] {
  const out: number[] = [];
  const start = Math.ceil(lo / step - 1e-9);
  const end = Math.floor(hi / step + 1e-9);
  for (let k = start; k <= end; k++) out.push(Number((k * step).toFixed(10)));
  return out;
}

export function decimalsFor(step: number): number {
  return Math.max(1, Math.ceil(-Math.log10(step) - 1e-9));
}

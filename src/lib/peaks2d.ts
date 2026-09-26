/**
 * 2D のクロスピークを拾う (交点の線を自動で引くとき、帰属で 2D を照合に使うとき)。
 *  - 異種核 (HSQC・HMQC・HMBC): 雑音の何倍か (と最大の何割か) を超える局所最大。多重線の細かい山はまとめ、
 *    絶対値の処理で強い山の縦軸の上下に出る弱い副ピーク (サイドローブ) は捨てる
 *  - 同核 (COSY・NOESY): 対角線から離れた局所最大のうち、対角線をはさんで対になっているもの
 */

/** 2D のデータ (fid2d.ts の Spectrum2dData と同じ形の部分) */
export interface Grid2d {
  data: Float32Array;
  n1: number;
  n2: number;
  first1: number;
  last1: number;
  first2: number;
  last2: number;
  noise: number;
}

/** 局所最大 (f1 = 縦軸、f2 = 横軸の ppm) */
export function localMaxima2d(s: Grid2d, threshold: number): { f1: number; f2: number; v: number }[] {
  const out: { f1: number; f2: number; v: number }[] = [];
  const { data, n1, n2 } = s;
  for (let r = 1; r < n1 - 1; r++) {
    for (let c = 1; c < n2 - 1; c++) {
      const v = Math.abs(data[r * n2 + c]);
      if (v < threshold) continue;
      let top = true;
      for (let dr = -1; dr <= 1 && top; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && Math.abs(data[(r + dr) * n2 + c + dc]) > v) top = false;
      if (top) out.push({ f1: s.first1 + ((s.last1 - s.first1) * r) / (s.n1 - 1), f2: s.first2 + ((s.last2 - s.first2) * c) / (s.n2 - 1), v });
    }
  }
  return out;
}

/** 異種核の拾い方: 拾う高さ (雑音の何倍、最大の何割)、まとめる近さ (ppm)、副ピーク (縦軸の上下 lobeC ppm 以内で lobeRatio 倍より弱いもの) */
export interface HeteroPick {
  minSn: number;
  minOfMax: number;
  mergeH: number;
  mergeC: number;
  lobeC: number;
  lobeRatio: number;
}
export const HETERO_PICK: HeteroPick = { minSn: 8, minOfMax: 0.03, mergeH: 0.06, mergeC: 1.0, lobeC: 3, lobeRatio: 0.35 };

/** 異種核のクロスピーク (h = 横軸、c = 縦軸の ppm)。強いものから */
export function pickHetero2d(s: Grid2d, o: HeteroPick = HETERO_PICK): { h: number; c: number; intensity: number }[] {
  let max = 0;
  for (let i = 0; i < s.data.length; i++) max = Math.max(max, Math.abs(s.data[i]));
  const maxima = localMaxima2d(s, Math.max(s.noise * o.minSn, max * o.minOfMax)).sort((a, b) => b.v - a.v);
  const out: { h: number; c: number; intensity: number }[] = [];
  for (const m of maxima) {
    if (out.some((p) => Math.abs(p.h - m.f2) <= o.mergeH && Math.abs(p.c - m.f1) <= o.mergeC)) continue;
    if (out.some((p) => Math.abs(p.h - m.f2) <= o.mergeH && Math.abs(p.c - m.f1) <= o.lobeC && m.v < o.lobeRatio * p.intensity)) continue;
    out.push({ h: m.f2, c: m.f1, intensity: m.v });
  }
  return out;
}

/** 同核の拾い方: 拾う高さ (雑音の何倍)、対角線とみなす近さ、対になっているとみなすずれ、まとめる近さ (ppm) */
export interface HomoPick {
  minSn: number;
  diagonalPpm: number;
  symmetryPpm: number;
  mergePpm: number;
}
export const HOMO_PICK: HomoPick = { minSn: 8, diagonalPpm: 0.08, symmetryPpm: 0.03, mergePpm: 0.05 };

/** 同核のクロスピーク (a > b、どちらも ppm)。offset を足して返す */
export function pickSymmetric2d(s: Grid2d, o: HomoPick = HOMO_PICK, offset = 0): { a: number; b: number; intensity: number }[] {
  const maxima = localMaxima2d(s, s.noise * o.minSn).filter((m) => Math.abs(m.f1 - m.f2) >= o.diagonalPpm);
  // 対角線をはさんで対になっているものだけ (f1, f2) ↔ (f2, f1)
  const paired: { a: number; b: number; intensity: number }[] = [];
  for (const m of maxima) {
    if (m.f1 < m.f2) continue;
    const mate = maxima.find((x) => Math.abs(x.f1 - m.f2) <= o.symmetryPpm && Math.abs(x.f2 - m.f1) <= o.symmetryPpm);
    if (!mate) continue;
    paired.push({ a: (m.f1 + mate.f2) / 2 + offset, b: (m.f2 + mate.f1) / 2 + offset, intensity: Math.min(m.v, mate.v) });
  }
  // 多重線の細かい山をまとめる (近いものは強い方を残す)
  paired.sort((x, y) => y.intensity - x.intensity);
  const out: { a: number; b: number; intensity: number }[] = [];
  for (const p of paired) {
    if (out.some((q) => Math.abs(q.a - p.a) <= o.mergePpm && Math.abs(q.b - p.b) <= o.mergePpm)) continue;
    out.push(p);
  }
  return out;
}

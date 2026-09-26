import { describe, expect, it } from 'vitest';
import { pickHetero2d, pickSymmetric2d, type Grid2d } from './peaks2d';

/** 横 10 → 0 ppm (201 点)、縦 first1 → last1 (n1 点) の空の 2D に山を置く */
function grid(first1: number, last1: number, peaks: [number, number, number][], n1 = 100): Grid2d {
  const n2 = 201;
  const data = new Float32Array(n1 * n2).fill(1);
  for (const [x, y, v] of peaks) {
    const c = Math.round(((10 - x) / 10) * (n2 - 1));
    const r = Math.round(((first1 - y) / (first1 - last1)) * (n1 - 1));
    data[r * n2 + c] += v;
  }
  return { data, n1, n2, first1, last1, first2: 10, last2: 0, noise: 1 };
}

describe('2D のクロスピークを拾う', () => {
  it('異種核: 多重線の細かい山はまとめ、強い山の縦の上下の弱い副ピークは捨てる', () => {
    const s = grid(200, 0, [
      [4.12, 60.4, 100],
      [4.07, 60.4, 90],
      // 60.4 の山の縦 ±2 ppm に出る弱い副ピーク
      [4.12, 62.4, 20],
      [4.12, 58.4, 20],
      [1.26, 14.2, 80],
    ]);
    const peaks = pickHetero2d(s);
    expect(peaks).toHaveLength(2);
    expect(peaks[0].h).toBeCloseTo(4.12, 1);
    expect(peaks[0].c).toBeCloseTo(60.4, 0);
  });

  it('同核: 対角線をはさんで対になったものだけ', () => {
    const s = grid(
      10,
      0,
      [
        [4.12, 1.26, 50],
        [1.26, 4.12, 50],
        // 対になっていない (t1 の雑音)
        [7.0, 2.0, 50],
        // 対角線
        [4.12, 4.12, 200],
      ],
      201,
    );
    const peaks = pickSymmetric2d(s);
    expect(peaks).toHaveLength(1);
    expect(peaks[0].a).toBeCloseTo(4.1, 1);
    expect(peaks[0].b).toBeCloseTo(1.25, 1);
  });
});

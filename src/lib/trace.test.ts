import { describe, expect, it } from 'vitest';
import { traceImage, traceWidths, type Pixels } from './trace';

/** 白地に黒い線でスペクトルを描いた画像を作る (ローレンツ型の山) */
function drawSpectrum(peaks: { ppm: number; height: number; widthPpm: number }[], left = 10, right = 0, width = 800, height = 300): Pixels {
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const value = (ppm: number) => {
    let v = 0;
    for (const p of peaks) {
      const t = (ppm - p.ppm) / (p.widthPpm / 2);
      v += p.height / (1 + t * t);
    }
    return v;
  };
  for (let c = 0; c < width; c++) {
    const ppm = left + ((right - left) * c) / (width - 1);
    const y = Math.max(0, Math.min(1, value(ppm)));
    const row = Math.round((height - 1) * (1 - y * 0.9) - 5);
    for (let r = Math.max(0, row); r < Math.min(height, row + 2); r++) {
      const i = (r * width + c) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
    }
  }
  return { width, height, data };
}

const full = (img: Pixels) => ({ x: 0, y: 0, w: img.width, h: img.height });

describe('文献の図から波形を読む', () => {
  // 画像の 1 画素 = 0.005 ppm (= 2 Hz)。山は 10 画素と 20 画素ぶんの幅
  const peaks = [
    { ppm: 7.5, height: 1, widthPpm: 0.05 },
    { ppm: 2.0, height: 0.4, widthPpm: 0.1 },
  ];
  const image = drawSpectrum(peaks, 10, 0, 2001, 400);

  it('山の位置が合う', () => {
    const trace = traceImage(image, full(image), 10, 0);
    expect(trace.y.length).toBe(2001);
    const top = (lo: number, hi: number) => {
      let best = -1;
      let at = 0;
      for (let c = 0; c < trace.y.length; c++) {
        const ppm = 10 - (10 * c) / (trace.y.length - 1);
        if (ppm < lo || ppm > hi) continue;
        if (trace.y[c] > best) {
          best = trace.y[c];
          at = ppm;
        }
      }
      return at;
    };
    expect(top(7, 8)).toBeCloseTo(7.5, 1);
    expect(top(1.5, 2.5)).toBeCloseTo(2.0, 1);
  });

  it('線幅 (Hz) を測れる', () => {
    const trace = traceImage(image, full(image), 10, 0);
    const widths = traceWidths(trace, [7.5, 2.0], 400);
    // 0.05 ppm × 400 MHz = 20 Hz、0.1 ppm = 40 Hz
    expect(widths[0]).toBeGreaterThan(18);
    expect(widths[0]).toBeLessThan(23);
    expect(widths[1]).toBeGreaterThan(36);
    expect(widths[1]).toBeLessThan(45);
  });

  it('画像の解像度より細い山は null (文の線幅を使う)', () => {
    const sharp = drawSpectrum([{ ppm: 5, height: 1, widthPpm: 0.004 }], 10, 0, 800, 300);
    const trace = traceImage(sharp, full(sharp), 10, 0);
    expect(traceWidths(trace, [5], 400)[0]).toBeNull();
  });

  it('信号がない所は null', () => {
    const trace = traceImage(image, full(image), 10, 0);
    expect(traceWidths(trace, [5.0], 400)[0]).toBeNull();
    expect(traceWidths(trace, [99], 400)[0]).toBeNull();
  });

  it('白紙の画像でも落ちない', () => {
    const blank: Pixels = { width: 100, height: 60, data: new Uint8ClampedArray(100 * 60 * 4).fill(255) };
    const trace = traceImage(blank, full(blank), 10, 0);
    expect(trace.blank).toBe(100);
    expect(traceWidths(trace, [5], 400)[0]).toBeNull();
  });

  it('枠が小さすぎるときは断る', () => {
    expect(() => traceImage(image, { x: 0, y: 0, w: 4, h: 4 }, 10, 0)).toThrow();
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJdf } from './jdf';
import { analyzeMultiplet, jTree } from './multiplet';

const FREQ = 400;
// 0.1 Hz 刻み相当の細かい軸 (4〜2 ppm)
const meta = { first: 4, last: 2, n: 8001, refOffset: 0 };

/** 一次の多重線を作る。J は Hz、線幅 (半値全幅) は 1 Hz のローレンツ関数 */
function multiplet(center: number, js: number[], width = 1) {
  let lines = [{ hz: 0, a: 1 }];
  for (const j of js) lines = lines.flatMap((l) => [{ hz: l.hz - j / 2, a: l.a / 2 }, { hz: l.hz + j / 2, a: l.a / 2 }]);
  const d = new Float32Array(meta.n);
  const g = width / 2;
  for (let i = 0; i < meta.n; i++) {
    const hz = (meta.first + ((meta.last - meta.first) * i) / (meta.n - 1) - center) * FREQ;
    for (const l of lines) d[i] += (l.a * g * g) / ((hz - l.hz) ** 2 + g * g);
  }
  // ほんの少しノイズを足す (決まった値)
  for (let i = 0; i < meta.n; i++) d[i] += (((i * 7919) % 101) / 101 - 0.5) * 1e-4;
  return d;
}

function analyze(js: number[], width = 1) {
  return analyzeMultiplet(multiplet(3, js, width), meta, 3.1, 2.9, FREQ);
}

describe('多重線の解析', () => {
  it.each([
    [[], 's', []],
    [[7.2], 'd', [7.2]],
    [[7, 7], 't', [7]],
    [[7, 7, 7], 'q', [7]],
    [[6.8, 6.8, 6.8, 6.8, 6.8, 6.8], 'sept', [6.8]],
    [[10.4, 2.1], 'dd', [10.4, 2.1]],
    [[12, 6, 6], 'dt', [12, 6]],
    [[7.5, 7.5, 1.8], 'td', [7.5, 1.8]],
    [[11, 8, 3], 'ddd', [11, 8, 3]],
  ])('%j → %s', (js, mult, expected) => {
    const r = analyze(js as number[]);
    expect(r.mult).toBe(mult);
    expect(r.J.length).toBe((expected as number[]).length);
    r.J.forEach((j, k) => expect(j).toBeCloseTo((expected as number[])[k], 0));
    expect(r.center).toBeCloseTo(3, 3);
  });

  it('幅の広い1本線は br s', () => {
    expect(analyze([], 12).mult).toBe('br s');
  });

  it('重なって読めないものは m', () => {
    const d = multiplet(3, [7, 7]);
    const e = multiplet(3.012, [5]);
    for (let i = 0; i < d.length; i++) d[i] += e[i] * 0.7;
    const r = analyzeMultiplet(d, meta, 3.1, 2.9, FREQ);
    expect(r.mult).toBe('m');
    expect(r.hi).toBeGreaterThan(r.lo);
  });

  it('木を作る: 1:2:1 は J が2つ', () => {
    expect(jTree([0, 7, 14], [1, 2, 1])?.J).toEqual([7, 7]);
    expect(jTree([0, 7, 14], [1, 1, 1])).toBeNull();
  });
});

// 実データ: iPr の CH3 (1.33, d) と P(OMe)3 (3.58, d; 3.67, t)
/** 測定データを読む (テストを飛ばすときは呼ばない) */
function load(path: string) {
  const b = readFileSync(path);
  return readJdf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, 'x.jdf');
}

const sample = join(import.meta.dirname, '../../samples/sample-c6d6-1h.jdf');
describe.skipIf(!existsSync(sample))('実データの多重線', () => {
  // describe の中身は skip のときも読まれるので、ファイルが無いときは読まない (CI には測定データを置かない)
  const { meta: m, data } = existsSync(sample) ? load(sample) : ({} as ReturnType<typeof load>);
  it('1.33 は d (J ≈ 6.8 Hz)', () => {
    const r = analyzeMultiplet(data, m, 1.37, 1.29, m.freqMHz);
    expect(r.mult).toBe('d');
    expect(r.J[0]).toBeCloseTo(6.8, 0);
    expect(r.center).toBeCloseTo(1.33, 2);
  });
  it('3.58 は d (J ≈ 10.4 Hz)、3.67 は t', () => {
    expect(analyzeMultiplet(data, m, 3.62, 3.53, m.freqMHz)).toMatchObject({ mult: 'd' });
    expect(analyzeMultiplet(data, m, 3.72, 3.635, m.freqMHz)).toMatchObject({ mult: 't' });
  });
});

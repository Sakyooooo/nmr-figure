import { describe, expect, it } from 'vitest';
import { multipletLines, parseSi, parseSignal } from './siParse';
import { defaultRange, signalLines, simulateFromSi } from './simulate';
import { snapToPeak } from './spectrum';

describe('SI の文を読む', () => {
  it('1H のよくある書き方', () => {
    const si = parseSi('¹H NMR (400 MHz, CDCl₃) δ 7.30 (d, J = 8.0 Hz, 2H), 3.45–3.38 (m, 2H), 1.25 (t, J = 7.1 Hz, 3H).');
    expect(si.nucleus).toBe('1H');
    expect(si.freqMHz).toBe(400);
    expect(si.solvent).toBe('CDCl3');
    expect(si.signals).toHaveLength(3);
    expect(si.signals[0]).toMatchObject({ delta: 7.3, mult: 'd', J: [8], nH: 2 });
    expect(si.signals[1].range).toEqual([3.45, 3.38]);
    expect(si.signals[1].delta).toBeCloseTo(3.415, 3);
    expect(si.signals[2]).toMatchObject({ mult: 't', J: [7.1], nH: 3 });
    expect(si.skipped).toEqual([]);
  });

  it('13C のように値だけ並ぶ書き方', () => {
    const si = parseSi('13C{1H} NMR (101 MHz, C6D6) δ 150.2, 128.3, 25.1.');
    expect(si.nucleus).toBe('13C');
    expect(si.freqMHz).toBe(101);
    expect(si.signals.map((s) => s.delta)).toEqual([150.2, 128.3, 25.1]);
    expect(si.signals[0].nH).toBeNull();
  });

  it('dd や br s、複数の J', () => {
    expect(parseSignal('4.12 (dd, J = 10.4, 2.1 Hz, 1H)')).toMatchObject({ delta: 4.12, mult: 'dd', J: [10.4, 2.1], nH: 1 });
    expect(parseSignal('9.85 (br s, 1H)')).toMatchObject({ mult: 'br s', nH: 1 });
    expect(parseSignal('2.05 (sept, J = 6.8 Hz, 1H)')).toMatchObject({ mult: 'sept', J: [6.8] });
  });

  it('負の ppm (19F など) も読める', () => {
    const si = parseSi('19F NMR (376 MHz, THF-d8) δ -75.3 (s, 6F).');
    expect(si.nucleus).toBe('19F');
    expect(si.signals[0].delta).toBeCloseTo(-75.3, 3);
  });
});

describe('多重度から線を作る', () => {
  it('d は 2本、強度は半分ずつ', () => {
    const lines = multipletLines('d', [8]);
    expect(lines).toHaveLength(2);
    expect(lines[0].offsetHz).toBeCloseTo(-4, 6);
    expect(lines[1].offsetHz).toBeCloseTo(4, 6);
    expect(lines[0].weight).toBeCloseTo(0.5, 6);
  });

  it('t は 1:2:1', () => {
    const lines = multipletLines('t', [7]);
    expect(lines.map((l) => l.weight)).toEqual([0.25, 0.5, 0.25]);
    expect(lines.map((l) => l.offsetHz)).toEqual([-7, 0, 7]);
  });

  it('dd は 4本', () => {
    const lines = multipletLines('dd', [10, 2]);
    expect(lines).toHaveLength(4);
    expect(lines.map((l) => +l.offsetHz.toFixed(1)).sort((a, b) => a - b)).toEqual([-6, -4, 4, 6]);
  });

  it('s は 1本', () => {
    expect(multipletLines('s', [])).toEqual([{ offsetHz: 0, weight: 1 }]);
  });
});

describe('文献のスペクトルを作る', () => {
  const citation = { full: 'Smith et al., J. Am. Chem. Soc. 2024, 146, 1234.', short: 'Smith 2024' };

  it('書いてある ppm にピークが立つ', () => {
    const { meta, data } = simulateFromSi('¹H NMR (400 MHz, CDCl3) δ 7.26 (s, 1H), 2.05 (s, 3H).', citation);
    expect(meta.nucleus).toBe('1H');
    expect(meta.simulated?.citation).toBe(citation.full);
    expect(snapToPeak(data, meta, 7.26, 0.05)!.ppm).toBeCloseTo(7.26, 2);
    expect(snapToPeak(data, meta, 2.05, 0.05)!.ppm).toBeCloseTo(2.05, 2);
  });

  it('H の数が多い信号は面積が大きい', () => {
    const { meta, data } = simulateFromSi('1H NMR (400 MHz, CDCl3) δ 7.00 (s, 1H), 2.00 (s, 3H).', citation);
    const area = (ppm: number) => {
      const at = (p: number) => Math.round(((p - meta.first) / (meta.last - meta.first)) * (meta.n - 1));
      let sum = 0;
      for (let i = at(ppm + 0.3); i <= at(ppm - 0.3); i++) sum += data[i];
      return sum;
    };
    expect(area(2.0) / area(7.0)).toBeCloseTo(3, 1);
  });

  it('二重線は 2本に分かれる (J = 8 Hz なら 0.02 ppm 差)', () => {
    const { meta, data } = simulateFromSi('1H NMR (400 MHz, CDCl3) δ 7.30 (d, J = 8.0 Hz, 2H).', citation);
    expect(snapToPeak(data, meta, 7.29, 0.006)!.ppm).toBeCloseTo(7.29, 2);
    expect(snapToPeak(data, meta, 7.31, 0.006)!.ppm).toBeCloseTo(7.31, 2);
  });

  it('範囲で書かれた多重線は、その範囲に広がる', () => {
    const lines = signalLines({ delta: 7.25, range: [7.3, 7.2], mult: 'm', J: [], nH: 5 }, 400);
    expect(lines.length).toBeGreaterThan(3);
    expect(Math.min(...lines.map((l) => l.ppm))).toBeGreaterThanOrEqual(7.2);
    expect(Math.max(...lines.map((l) => l.ppm))).toBeLessThanOrEqual(7.3);
    expect(lines.reduce((t, l) => t + l.height, 0)).toBeCloseTo(5, 6);
  });

  it('核種ごとに既定の範囲', () => {
    expect(defaultRange('13C')).toEqual({ first: 220, last: -10 });
    expect(defaultRange('1H')).toEqual({ first: 12, last: -1 });
  });

  it('読めない文はエラーにする', () => {
    expect(() => simulateFromSi('これは NMR のデータではありません', citation)).toThrow();
  });
});

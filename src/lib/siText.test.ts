import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emptyDocument, type NmrDocument } from '../state/types';
import { readJdf } from './jdf';
import { defaultSettings } from './settings';
import { buildSiEntry, detectSignals, exclusions, formatSi, richUnicode } from './siText';

describe('SI テキストの書式', () => {
  it('Unicode の上付き・下付き', () => {
    expect(richUnicode('^{1}H NMR (400 MHz, C_{6}D_{6})')).toBe('¹H NMR (400 MHz, C₆D₆)');
    expect(richUnicode('^{i}Pr')).toBe('ⁱPr');
  });

  it('多重度・J・プロトン数・範囲の書き方', () => {
    const entry = {
      layerId: 'l',
      nucleus: '1H',
      header: '^{1}H NMR (400 MHz, CDCl_{3})',
      temperatureK: 298,
      source: 'integrals' as const,
      signals: [
        { integralId: 'a', delta: 7.261, range: [7.3, 7.21] as [number, number], mult: 'm', J: [], nH: 5, assign: '', auto: { mult: 'm', J: [], nH: 5 } },
        { integralId: 'b', delta: 3.6712, range: null, mult: 'dd', J: [10.44, 2.06], nH: 1, assign: 'OCH_{3}', auto: { mult: 'dd', J: [], nH: 1 } },
      ],
    };
    const opts = { hDecimals: 2, xDecimals: 1, jDecimals: 1, includeTemp: false, includeAssign: true };
    const { text, html } = formatSi(entry, opts);
    expect(text).toBe('¹H NMR (400 MHz, CDCl₃) δ 7.30–7.21 (m, 5H), 3.67 (dd, J = 10.4, 2.1 Hz, 1H, OCH₃).');
    expect(html).toContain('<sup>1</sup>H NMR');
    expect(html).toContain('<i>J</i> = 10.4, 2.1 Hz');
    expect(html).toContain('OCH<sub>3</sub>');
    expect(formatSi(entry, { ...opts, includeAssign: false }).text).not.toContain('OCH');
  });

  it('1H 以外の一重線は多重度を書かない', () => {
    const doc = emptyDocument();
    const n = 2001;
    const meta = { id: 's', fileName: 'c.jdf', title: '', nucleus: '13C', axisName: 'Carbon13', solventRaw: 'CHLOROFORM-D', solvent: 'CDCl3' as const, freqMHz: 100.5, temperatureC: 23, scans: 1, experiment: '', date: null, decoupled: '1H', first: 200, last: 0, n, refOffset: 0, maxAbs: 1 };
    const data = new Float32Array(n);
    // 150.0 と 25.0 に炭素、77.16 に CDCl3 (三重線)
    const put = (ppm: number, h: number) => {
      const i = Math.round(((meta.first - ppm) / (meta.first - meta.last)) * (n - 1));
      data[i] += h;
      data[i - 1] += h / 3;
      data[i + 1] += h / 3;
    };
    put(150, 0.5);
    put(25, 0.8);
    for (const d of [-0.3, 0, 0.3]) put(77.16 + d, 1);
    for (let i = 0; i < n; i++) data[i] += (((i * 7919) % 101) / 101 - 0.5) * 1e-3;
    doc.spectra.push(meta);
    doc.layers.push({ id: 'l', spectrumId: 's', visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 });
    const entry = buildSiEntry(doc, { s: data }, 'l', defaultSettings())!;
    expect(entry.source).toBe('peaks');
    expect(formatSi(entry, { ...doc.si, includeTemp: true }).text).toBe('¹³C{¹H} NMR (101 MHz, CDCl₃, 296 K) δ 150.0, 25.0.');
  });
});

// 実データ: 自動で積分して、iPr の CH3 を 12H にしたときの文
/** 測定データを読む (テストを飛ばすときは呼ばない) */
function load(path: string) {
  const b = readFileSync(path);
  return readJdf(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, 'x.jdf');
}

const sample = join(import.meta.dirname, '../../samples/sample-c6d6-1h.jdf');
describe.skipIf(!existsSync(sample))('実データの SI テキスト', () => {
  // describe の中身は skip のときも読まれるので、ファイルが無いときは読まない (CI には測定データを置かない)
  const { meta, data } = existsSync(sample) ? load(sample) : ({} as ReturnType<typeof load>);
  const settings = defaultSettings();

  function docWith(regions: [number, number][]): NmrDocument {
    const doc = emptyDocument();
    doc.spectra.push(meta);
    doc.layers.push({ id: 'l', spectrumId: meta.id, visible: true, color: '#000', label: '', scale: 1, lineWidth: 1 });
    regions.forEach(([a, b], k) => doc.integrals.push({ id: `i${k}`, layerId: 'l', from: a, to: b }));
    return doc;
  }

  it('信号を自動で見つける (溶媒 7.15 は除く)', () => {
    const regions = detectSignals(data, meta, exclusions(docWith([]), meta, 'l', settings));
    const has = (ppm: number) => regions.some(([hi, lo]) => hi >= ppm && lo <= ppm);
    expect(has(1.33)).toBe(true);
    expect(has(3.58)).toBe(true);
    expect(has(3.67)).toBe(true);
    expect(has(7.15)).toBe(false);
  });

  it('多重度と J と H 数', () => {
    const doc = docWith([
      [3.72, 3.635],
      [3.62, 3.53],
      [1.37, 1.29],
    ]);
    doc.layers[0].integralRef = { id: 'i2', value: 12 };
    const entry = buildSiEntry(doc, { [meta.id]: data }, 'l', settings)!;
    expect(formatSi(entry, doc.si).text).toBe('¹H NMR (400 MHz, C₆D₆) δ 3.67 (t, J = 5.2 Hz, 18H), 3.58 (d, J = 10.4 Hz, 9H), 1.33 (d, J = 6.6 Hz, 12H).');
  });

  it('表で直した多重度・J・H 数が優先される', () => {
    const doc = docWith([[3.72, 3.635]]);
    doc.integrals[0].si = { mult: 'vt', J: [5.25], nH: 18, assign: 'OCH_{3}' };
    const entry = buildSiEntry(doc, { [meta.id]: data }, 'l', settings)!;
    expect(formatSi(entry, doc.si).text).toBe('¹H NMR (400 MHz, C₆D₆) δ 3.67 (vt, J = 5.3 Hz, 18H, OCH₃).');
  });
});

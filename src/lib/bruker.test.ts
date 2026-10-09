import { describe, expect, it } from 'vitest';
import { brukerFileName, brukerGroupDelay, f1ModeOf, parseParams, readBruker1d, readBruker2d, type BrukerInput } from './bruker';

/** JCAMP-DX のパラメーターの文 */
function jcamp(p: Record<string, string | number>, eol = '\n') {
  return ['##TITLE= Parameter file, TopSpin 3.6.5', '##JCAMPDX= 5.0', ...Object.entries(p).map(([k, v]) => `##$${k}= ${v}`), '##END='].join(eol) + eol;
}

function int32(values: ArrayLike<number>, little = true) {
  const buf = new ArrayBuffer(values.length * 4);
  const view = new DataView(buf);
  for (let i = 0; i < values.length; i++) view.setInt32(i * 4, Math.round(values[i]), little);
  return buf;
}

const ACQUS = {
  NUC1: '<1H>',
  NUC2: '<off>',
  SOLVENT: '<CDCl3>',
  PULPROG: '<zg30>',
  NS: 16,
  TE: 298.15,
  DATE: 1744266617,
  BF1: 400.13,
  SFO1: 400.132470803,
  SW_h: 8012.82051282051,
  TD: 8192,
  BYTORDA: 0,
  DTYPA: 0,
  DSPFVS: 21,
  GRPDLY: 0,
};

describe('Bruker のパラメーター', () => {
  it('数・文字 (<…>)・配列 (次の行から) を読む', () => {
    const p = parseParams(['##TITLE= Parameter file', '##$NUC1= <1H>', '##$SW_h= 8012.82', '##$P= (0..3)', '1 2.5 0', '13', '##$CPDPRG= (0..1)', '<waltz16> <>', '$$ comment', '##END='].join('\r\n'));
    expect(p.get('NUC1')).toBe('1H');
    expect(p.get('SW_h')).toBe(8012.82);
    expect(p.get('P')).toEqual([1, 2.5, 0, 13]);
    expect(p.get('CPDPRG')).toEqual(['waltz16', '']);
    expect(p.get('TITLE')).toBe('Parameter file');
  });

  it('デジタルフィルターの遅れ: GRPDLY、なければ DECIM と DSPFVS の表', () => {
    expect(brukerGroupDelay(parseParams(jcamp({ GRPDLY: 76, DSPFVS: 21, DECIM: 2496 })))).toBe(76);
    expect(brukerGroupDelay(parseParams(jcamp({ GRPDLY: -1, DSPFVS: 12, DECIM: 24 })))).toBeCloseTo(70.1667, 3);
    expect(brukerGroupDelay(parseParams(jcamp({ GRPDLY: -1, DSPFVS: 0, DECIM: 2496 })))).toBe(0);
  });

  it('ファイル名: 処理した版は データ名/実験番号 (処理番号 1 以外は /pdata/番号)、生データは /fid・/ser', () => {
    expect(brukerFileName({ name: '1-crude', expno: '10', procno: '1' })).toBe('1-crude/10');
    expect(brukerFileName({ name: '1-crude', expno: '10', procno: '2' })).toBe('1-crude/10/pdata/2');
    expect(brukerFileName({ name: '1-crude', expno: '10', procno: null })).toBe('1-crude/10/fid');
    expect(brukerFileName({ name: 'hsqc', expno: '3', procno: null }, 2)).toBe('hsqc/3/ser');
  });

  it('F1 の取り込み方: FnMODE、古いデータは MC2', () => {
    expect(f1ModeOf(parseParams(jcamp({ FnMODE: 6 })), null)).toBe('echo-antiecho');
    expect(f1ModeOf(parseParams(jcamp({ FnMODE: 1 })), null)).toBe('complex');
    expect(f1ModeOf(parseParams(jcamp({ FnMODE: 5 })), null)).toBe('states-tppi');
    expect(f1ModeOf(parseParams(jcamp({ FnMODE: 0 })), parseParams(jcamp({ MC2: 3 })))).toBe('states');
    expect(f1ModeOf(null, parseParams(jcamp({ MC2: 2 })))).toBe('real');
  });
});

describe('TopSpin で処理した 1D (1r)', () => {
  const si = 1024;
  const procs = { SI: si, OFFSET: 12.5, SW_p: 6002.0, SF: 400.13, NC_proc: -3, BYTORDP: 0, DTYPP: 0, INTSCL: 1 };
  const values = Array.from({ length: si }, (_, i) => (i === 300 ? 80000 : i % 7));
  const input: BrukerInput = { path: { name: '1-crude', expno: '10', procno: '1' }, acqus: jcamp(ACQUS), procs: jcamp(procs, '\r\n'), real: int32(values) };

  it('軸 (OFFSET から SW_p/SF の幅)・強度 (× 2^NC_proc)・測定の情報', () => {
    const { meta, data } = readBruker1d(input);
    expect(meta.fileName).toBe('1-crude/10');
    expect(meta.title).toBe('1-crude');
    expect(meta.vendor).toBe('bruker');
    expect(meta.processing).toBeNull();
    expect(meta.n).toBe(si);
    expect(meta.first).toBe(12.5);
    expect(meta.last).toBeCloseTo(12.5 - ((si - 1) * 6002) / 400.13 / si, 9);
    expect(data[300]).toBe(80000 / 8);
    expect(meta.maxAbs).toBe(10000);
    expect(meta.nucleus).toBe('1H');
    expect(meta.solvent).toBe('CDCl3');
    expect(meta.decoupled).toBeNull();
    expect(meta.temperatureC).toBe(25);
    expect(meta.scans).toBe(16);
    expect(meta.date).toBe('2025-04-10');
  });

  it('13C の zgpg30 は ¹H デカップリング', () => {
    const { meta } = readBruker1d({ ...input, acqus: jcamp({ ...ACQUS, NUC1: '<13C>', NUC2: '<1H>', PULPROG: '<zgpg30>' }) });
    expect(meta.nucleus).toBe('13C');
    expect(meta.decoupled).toBe('1H');
  });

  it('ビッグエンディアン (BYTORDP = 1)', () => {
    const { data } = readBruker1d({ ...input, procs: jcamp({ ...procs, BYTORDP: 1 }), real: int32(values, false) });
    expect(data[300]).toBe(10000);
  });
});

describe('生データ (fid) をこのアプリで処理する', () => {
  it('搬送波より高い周波数の山は、高い ppm に出る (TopSpin の 1r と同じ向き)', () => {
    const td = 8192;
    const sw = ACQUS.SW_h;
    const offsetHz = 1000;
    const fid = new Float64Array(td);
    for (let k = 0; k < td / 2; k++) {
      const t = k / sw;
      const a = 1e6 * Math.exp(-t * 3);
      fid[2 * k] = a * Math.cos(2 * Math.PI * offsetHz * t);
      fid[2 * k + 1] = a * Math.sin(2 * Math.PI * offsetHz * t);
    }
    const { meta, data, fid: kept } = readBruker1d({ path: { name: 's', expno: '1', procno: null }, acqus: jcamp(ACQUS), raw: int32(fid) });
    expect(meta.fileName).toBe('s/1/fid');
    expect(meta.processing).not.toBeNull();
    expect(kept).toBeDefined();
    let top = 0;
    for (let i = 1; i < data.length; i++) if (data[i] > data[top]) top = i;
    const ppm = meta.first + ((meta.last - meta.first) * top) / (meta.n - 1);
    const carrier = ((ACQUS.SFO1 - ACQUS.BF1) / ACQUS.BF1) * 1e6;
    expect(ppm).toBeCloseTo(carrier + offsetHz / ACQUS.BF1, 2);
  });
});

describe('TopSpin で処理した 2D (2rr)', () => {
  it('XDIM ずつの小さな行列の並びを、行列に戻す (負の山は絶対値)', () => {
    // 4 × 4 を 2 × 2 の小さな行列 4 つで書く
    const n = 4;
    const want = Array.from({ length: n * n }, (_, i) => i + 1);
    want[5] = -6;
    const blocks: number[] = [];
    for (let b1 = 0; b1 < 2; b1++)
      for (let b2 = 0; b2 < 2; b2++)
        for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) blocks.push(want[(b1 * 2 + r) * n + b2 * 2 + c]);
    const procs = { SI: n, XDIM: 2, OFFSET: 10, SW_p: 4000, SF: 400, NC_proc: 0, BYTORDP: 0, DTYPP: 0, AXNUC: '<1H>' };
    const proc2s = { SI: n, XDIM: 2, OFFSET: 160, SW_p: 16000, SF: 100, NC_proc: 0, AXNUC: '<13C>' };
    const { meta, data, fid } = readBruker2d({
      path: { name: 'h', expno: '3', procno: '1' },
      acqus: jcamp({ ...ACQUS, PULPROG: '<hsqcetgpsi2>' }),
      acqu2s: jcamp({ NUC1: '<13C>', FnMODE: 6 }),
      procs: jcamp(procs),
      proc2s: jcamp(proc2s),
      real: int32(blocks),
    });
    expect(fid).toBeUndefined();
    expect([...data.data]).toEqual(want.map(Math.abs));
    expect(meta.x.nucleus).toBe('1H');
    expect(meta.y.nucleus).toBe('13C');
    expect(meta.fileName).toBe('h/3');
    expect(data.first1).toBe(160);
    expect(data.last1).toBeCloseTo(160 - (3 * 16000) / 100 / 4, 9);
  });
});

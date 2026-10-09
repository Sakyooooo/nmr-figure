/**
 * Bruker (TopSpin) のデータを読む (本人の希望 2026-10-09「Bruker (TopSpin) にも対応」)。
 *
 * 測定は「データ名/実験番号/」のフォルダ (例: 1-crude/10/)
 *   acqus            測定のパラメーター (JCAMP-DX の文字。##$名前= 値)
 *   acqu2s           2D の間接観測 (F1) の軸のパラメーター
 *   fid / ser        生データ (1D / 2D)。DTYPA = 0 は 32 ビット整数、2 は 64 ビット小数。BYTORDA = 1 はビッグエンディアン
 *   pdata/1/         TopSpin で処理した版 (処理番号ごとのフォルダ)
 *     procs, proc2s  処理のパラメーター。SI = 点数、OFFSET = 最初の点の ppm、SW_p = 幅 (Hz)、SF = 0 ppm の周波数 (MHz)、
 *                    NC_proc = 強度の倍率 (2 のべき乗)、INTSCL = 積分の倍率
 *     1r / 2rr       実部のスペクトル (32 ビット整数 × 2^NC_proc)。2rr は XDIM ずつの小さな行列に分けて並んでいる
 *     intrng         積分の範囲 (lib/topspin.ts)、peaklist.xml  ピークの一覧
 * 生データはこのアプリで処理する (Delta の生データと同じ流れ。lib/fid.ts・lib/fid2d.ts)。
 */
import { tr } from '../i18n';
import type { SpectrumMeta, Spectrum2dMeta, Axis2dMeta } from '../state/types';
import type { FidData } from './fid';
import { defaultProcessing2d, transform2d, type F1Mode, type Fid2dData, type Spectrum2dData } from './fid2d';
import { JdfError, processNewFid, type LoadedSpectrum, type ReadOptions } from './jdf';
import type { Loaded2dSpectrum } from './jdf2d';
import { normalizeNucleus } from './nuclei';
import { detectSolvent } from './solvents';
import { topspinAnnotations } from './topspin';

export type ParamValue = number | string | (number | string)[];
export type BrukerParams = Map<string, ParamValue>;

/** JCAMP-DX のパラメーター (acqus・procs など) を読む。名前の先頭の $ は外す */
export function parseParams(text: string): BrukerParams {
  const out: BrukerParams = new Map();
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\$?([^=]+)=\s?(.*)$/.exec(lines[i]);
    if (!m) continue;
    const name = m[1].trim();
    const value = m[2].trim();
    // 配列: ##$P= (0..63) の次の行から、次の ## までに値が並ぶ
    const range = /^\((\d+)\.\.(\d+)\)$/.exec(value);
    if (range) {
      const parts: string[] = [];
      while (i + 1 < lines.length && !lines[i + 1].startsWith('##') && !lines[i + 1].startsWith('$$')) parts.push(lines[++i]);
      const count = Number(range[2]) - Number(range[1]) + 1;
      out.set(name, (parts.join(' ').match(/<[^>]*>|\S+/g) ?? []).slice(0, count).map(parseValue));
      continue;
    }
    if (!out.has(name)) out.set(name, parseValue(value));
  }
  return out;
}

function parseValue(s: string): number | string {
  if (s.startsWith('<') && s.endsWith('>')) return s.slice(1, -1).trim();
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : s;
}

export function num(p: BrukerParams | null | undefined, name: string): number | null {
  const v = p?.get(name);
  return typeof v === 'number' ? v : null;
}

export function str(p: BrukerParams | null | undefined, name: string): string {
  const v = p?.get(name);
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}

/** 数値の並び (32 ビット整数か 64 ビット小数) */
export function readNumbers(buffer: ArrayBuffer, little: boolean, double: boolean): Float64Array {
  const view = new DataView(buffer);
  const size = double ? 8 : 4;
  const out = new Float64Array(Math.floor(buffer.byteLength / size));
  for (let i = 0; i < out.length; i++) out[i] = double ? view.getFloat64(i * size, little) : view.getInt32(i * size, little);
  return out;
}

/**
 * デジタルフィルターの遅れ (点)。TopSpin 2 以降は GRPDLY に入っている。
 * それより前のデータ (DSPFVS 10〜13) は DECIM との表から (nmrglue と同じ表)
 */
export function brukerGroupDelay(acqus: BrukerParams): number {
  if (num(acqus, 'DIGMOD') === 0) return 0;
  const grp = num(acqus, 'GRPDLY');
  if (grp !== null && grp >= 0) return grp;
  const table = DSP_TABLE[num(acqus, 'DSPFVS') ?? -1];
  return table?.[num(acqus, 'DECIM') ?? -1] ?? 0;
}

const DSP_TABLE: Record<number, Record<number, number>> = {
  10: {
    2: 44.75, 3: 33.5, 4: 66.625, 6: 59.083333333333333, 8: 68.5625, 12: 60.375, 16: 69.53125, 24: 61.020833333333333, 32: 70.015625,
    48: 61.34375, 64: 70.2578125, 96: 61.505208333333333, 128: 70.37890625, 192: 61.5859375, 256: 70.439453125, 384: 61.626302083333333,
    512: 70.4697265625, 768: 61.646484375, 1024: 70.48486328125, 1536: 61.656575520833333, 2048: 70.492431640625,
  },
  11: {
    2: 46, 3: 36.5, 4: 48, 6: 50.166666666666667, 8: 53.25, 12: 69.5, 16: 72.25, 24: 70.166666666666667, 32: 72.75, 48: 70.5, 64: 73,
    96: 70.666666666666667, 128: 72.5, 192: 71.333333333333333, 256: 72.25, 384: 71.666666666666667, 512: 72.125, 768: 71.833333333333333,
    1024: 72.0625, 1536: 71.916666666666667, 2048: 72.03125,
  },
  12: {
    2: 46, 3: 36.5, 4: 48, 6: 50.166666666666667, 8: 53.25, 12: 69.5, 16: 71.625, 24: 70.166666666666667, 32: 72.125, 48: 70.5, 64: 72.375,
    96: 70.666666666666667, 128: 72.5, 192: 71.333333333333333, 256: 72.25, 384: 71.666666666666667, 512: 72.125, 768: 71.833333333333333,
    1024: 72.0625, 1536: 71.916666666666667, 2048: 72.03125,
  },
  13: {
    2: 2.75, 3: 2.8333333333333333, 4: 2.875, 6: 2.9166666666666667, 8: 2.9375, 12: 2.9583333333333333, 16: 2.96875, 24: 2.9791666666666667,
    32: 2.984375, 48: 2.9895833333333333, 64: 2.9921875, 96: 2.9947916666666667,
  },
};

/** 測定の場所。名前はデータ名 (フォルダ名)・実験番号・処理番号 */
export interface BrukerPath {
  name: string;
  expno: string;
  /** TopSpin で処理した版の処理番号。生データ (fid / ser) は null */
  procno: string | null;
}

/**
 * 図・一覧で使うファイル名。TopSpin で処理した版は「データ名/実験番号」(処理番号が 1 以外なら /pdata/番号)、生データは「…/fid」(2D は /ser)。
 * TopSpin との同期・記録はこの名前ごと
 */
export function brukerFileName(path: BrukerPath, dimension = 1): string {
  const base = `${path.name}/${path.expno}`;
  if (path.procno === null) return `${base}/${dimension >= 2 ? 'ser' : 'fid'}`;
  return path.procno === '1' ? base : `${base}/pdata/${path.procno}`;
}

/** 読むのに使うファイルの中身 */
export interface BrukerInput {
  path: BrukerPath;
  acqus: string;
  /** 2D の F1 */
  acqu2s?: string | null;
  procs?: string | null;
  proc2s?: string | null;
  /** 1r・2rr (TopSpin で処理した版) */
  real?: ArrayBuffer | null;
  /** fid・ser (生データ) */
  raw?: ArrayBuffer | null;
  intrng?: string | null;
  peaklist?: string | null;
}

/** 一覧・図に出す測定の情報 (データ本体は見ない) */
export function brukerInfo(acqus: BrukerParams, path: BrukerPath) {
  const solventRaw = str(acqus, 'SOLVENT');
  const nuc2 = normalizeNucleus(str(acqus, 'NUC2'));
  const nucleus = normalizeNucleus(str(acqus, 'NUC1'));
  const te = num(acqus, 'TE');
  const date = num(acqus, 'DATE');
  return {
    title: path.name,
    nucleus,
    solventRaw,
    solvent: detectSolvent(solventRaw),
    experiment: str(acqus, 'PULPROG'),
    scans: num(acqus, 'NS'),
    temperatureC: te !== null && te > 0 ? Math.round((te - 273.15) * 10) / 10 : null,
    acquiredAt: date && date > 0 ? date * 1000 : null,
    // 2 つ目のチャンネルが使われていれば、その核種をデカップリングしている (13C の zgpg30、19F の zgfhigqn など)
    decoupled: nuc2 && !/^off$/i.test(nuc2) && nuc2 !== nucleus ? nuc2 : null,
  };
}

/** 1D を読む。TopSpin で処理した版 (1r) はそのまま、生データ (fid) はこのアプリで処理する */
export function readBruker1d(input: BrukerInput, options: ReadOptions = {}): LoadedSpectrum {
  const fileName = brukerFileName(input.path, 1);
  const acqus = parseParams(input.acqus);
  const procs = input.procs ? parseParams(input.procs) : null;
  const info = brukerInfo(acqus, input.path);
  const base = {
    id: crypto.randomUUID(),
    fileName,
    title: info.title,
    nucleus: info.nucleus,
    axisName: info.nucleus,
    solventRaw: info.solventRaw,
    solvent: info.solvent,
    temperatureC: info.temperatureC,
    scans: info.scans,
    experiment: info.experiment,
    date: info.acquiredAt ? new Date(info.acquiredAt).toISOString().slice(0, 10) : null,
    decoupled: info.decoupled,
    acquiredAt: info.acquiredAt,
    vendor: 'bruker' as const,
  };

  if (input.path.procno !== null) {
    if (!procs || !input.real) throw new JdfError(tr('{fileName}: TopSpin で処理したスペクトル (1r) が見つかりません', { fileName }));
    const spec = processedAxis(procs, input.real.byteLength, fileName);
    const values = readNumbers(input.real, num(procs, 'BYTORDP') !== 1, num(procs, 'DTYPP') === 2);
    const scale = 2 ** (num(procs, 'NC_proc') ?? 0);
    const data = new Float32Array(spec.n);
    let maxAbs = 0;
    for (let i = 0; i < spec.n; i++) {
      data[i] = values[i] * scale;
      maxAbs = Math.max(maxAbs, Math.abs(data[i]));
    }
    const meta: SpectrumMeta = { ...base, freqMHz: spec.sf, first: spec.first, last: spec.last, n: spec.n, refOffset: 0, maxAbs: maxAbs || 1, processing: null };
    const ann = topspinAnnotations({ intrng: input.intrng ?? null, peaklist: input.peaklist ?? null, intscl: num(procs, 'INTSCL'), nc: num(procs, 'NC_proc') ?? 0 }, data, meta);
    meta.delta = ann.peaks.length || ann.integrals.length ? ann : null;
    return { meta, data };
  }

  if (!input.raw) throw new JdfError(tr('{fileName}: 生データ (fid) が見つかりません', { fileName }));
  const fid = brukerFid(acqus, procs, input.raw, fileName);
  const { data, first, last, processing, refOffset } = processNewFid(fid, info.nucleus, info.solvent, options);
  let maxAbs = 0;
  for (const v of data) maxAbs = Math.max(maxAbs, Math.abs(v));
  const meta: SpectrumMeta = { ...base, freqMHz: fid.refMHz, first, last, n: data.length, refOffset, maxAbs: maxAbs || 1, processing };
  return { meta, data, fid };
}

/** 処理した版の軸。最初の点が OFFSET、SI 点で SW_p (Hz) の幅 */
function processedAxis(procs: BrukerParams, bytes: number, fileName: string) {
  const si = num(procs, 'SI');
  const offset = num(procs, 'OFFSET');
  const sw = num(procs, 'SW_p');
  const sf = num(procs, 'SF');
  if (!si || offset === null || !sw || !sf) throw new JdfError(tr('{fileName}: 処理のパラメーター (procs の SI・OFFSET・SW_p・SF) が読めませんでした', { fileName }));
  const size = num(procs, 'DTYPP') === 2 ? 8 : 4;
  const n = Math.min(si, Math.floor(bytes / size));
  if (n < 2) throw new JdfError(tr('{fileName}: スペクトルのデータが空です', { fileName }));
  return { n, si, sf, first: offset, last: offset - ((n - 1) * sw) / sf / si, sw };
}

/** 生データ (fid) を、このアプリの FID の形にする */
function brukerFid(acqus: BrukerParams, procs: BrukerParams | null, raw: ArrayBuffer, fileName: string): FidData {
  const td = num(acqus, 'TD') ?? 0;
  const sw = num(acqus, 'SW_h');
  const sfo1 = num(acqus, 'SFO1');
  const bf1 = num(acqus, 'BF1');
  if (!sw || !sfo1 || !bf1) throw new JdfError(tr('{fileName}: 測定のパラメーター (acqus の SW_h・SFO1・BF1) が読めませんでした', { fileName }));
  const values = readNumbers(raw, num(acqus, 'BYTORDA') !== 1, num(acqus, 'DTYPA') === 2);
  const n = Math.floor(Math.min(td > 0 ? td : values.length, values.length) / 2);
  if (n < 16) throw new JdfError(tr('{fileName}: 生データ (fid) が空です', { fileName }));
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  // JEOL と違い、虚部の符号はそのまま (逆にすると搬送波を中心に左右が反転する。TopSpin で処理した 1r と比べて確かめた)
  for (let k = 0; k < n; k++) {
    re[k] = values[2 * k];
    im[k] = values[2 * k + 1];
  }
  // 0 ppm の周波数: TopSpin で処理していれば、その基準合わせ (SR) を入れた SF。なければ BF1
  const refMHz = num(procs, 'SF') ?? bf1;
  return { re, im, sw, refMHz, offsetPpm: ((sfo1 - refMHz) / refMHz) * 1e6, groupDelay: brukerGroupDelay(acqus), acqDelay: 0, clip: 1 };
}

/** 2D を読む。TopSpin で処理した版 (2rr) はそのまま (絶対値)、生データ (ser) はこのアプリで 2次元の FT をする */
export function readBruker2d(input: BrukerInput): Loaded2dSpectrum {
  const fileName = brukerFileName(input.path, 2);
  const acqus = parseParams(input.acqus);
  const acqu2s = input.acqu2s ? parseParams(input.acqu2s) : null;
  const procs = input.procs ? parseParams(input.procs) : null;
  const proc2s = input.proc2s ? parseParams(input.proc2s) : null;
  const info = brukerInfo(acqus, input.path);
  const nucleus2 = info.nucleus;
  const nucleus1 = normalizeNucleus(str(proc2s, 'AXNUC') || str(acqu2s, 'NUC1')) || nucleus2;
  const axis = (nucleus: string, freqMHz: number, first: number, last: number, n: number): Axis2dMeta => ({ nucleus, axisName: nucleus, freqMHz, first, last, n });

  let data: Spectrum2dData;
  let fid: Fid2dData | undefined;
  let freq2: number;
  let freq1: number;
  if (input.path.procno !== null) {
    if (!procs || !proc2s || !input.real) throw new JdfError(tr('{fileName}: TopSpin で処理した 2D (2rr) が見つかりません', { fileName }));
    data = processed2d(procs, proc2s, input.real, fileName);
    freq2 = num(procs, 'SF')!;
    freq1 = num(proc2s, 'SF')!;
  } else {
    if (!input.raw || !acqu2s) throw new JdfError(tr('{fileName}: 2D の生データ (ser・acqu2s) が見つかりません', { fileName }));
    fid = brukerSer(acqus, acqu2s, procs, proc2s, input.raw, fileName);
    data = transform2d(fid, defaultProcessing2d());
    freq2 = fid.x.refMHz;
    freq1 = fid.y.refMHz;
  }
  const meta: Spectrum2dMeta = {
    id: crypto.randomUUID(),
    fileName,
    title: info.title,
    experiment: info.experiment,
    x: axis(nucleus2, freq2, data.first2, data.last2, data.n2),
    y: axis(nucleus1, freq1, data.first1, data.last1, data.n1),
    solvent: info.solvent,
    solventRaw: info.solventRaw,
    temperatureC: info.temperatureC,
    scans: info.scans,
    date: info.acquiredAt ? new Date(info.acquiredAt).toISOString().slice(0, 10) : null,
    acquiredAt: info.acquiredAt,
    maxAbs: data.maxAbs,
    noise: data.noise,
    processing: defaultProcessing2d(),
    vendor: 'bruker',
  };
  if (fid) return { meta, data, fid };
  return { meta, data };
}

/**
 * 2rr を行列にする。TopSpin は XDIM × XDIM の小さな行列ごとに並べて書くので、並べ替える。
 * 位相を合わせたスペクトルは負の山 (編集した HSQC の CH2 など) もあるので、絶対値にする (このアプリの等高線は正の側だけ)
 */
function processed2d(procs: BrukerParams, proc2s: BrukerParams, buffer: ArrayBuffer, fileName: string): Spectrum2dData {
  const n2 = num(procs, 'SI') ?? 0;
  const n1 = num(proc2s, 'SI') ?? 0;
  const off2 = num(procs, 'OFFSET');
  const off1 = num(proc2s, 'OFFSET');
  const sw2 = num(procs, 'SW_p');
  const sw1 = num(proc2s, 'SW_p');
  const sf2 = num(procs, 'SF');
  const sf1 = num(proc2s, 'SF');
  if (!n2 || !n1 || off2 === null || off1 === null || !sw2 || !sw1 || !sf2 || !sf1) {
    throw new JdfError(tr('{fileName}: 2D の処理のパラメーター (procs・proc2s) が読めませんでした', { fileName }));
  }
  const values = readNumbers(buffer, num(procs, 'BYTORDP') !== 1, num(procs, 'DTYPP') === 2);
  if (values.length < n1 * n2) throw new JdfError(tr('{fileName}: 2D のデータ (2rr) が短すぎます', { fileName }));
  const x2 = num(procs, 'XDIM') || n2;
  const x1 = num(proc2s, 'XDIM') || n1;
  const blocks2 = Math.max(1, Math.round(n2 / x2));
  const scale = 2 ** (num(procs, 'NC_proc') ?? 0);
  const out = new Float32Array(n1 * n2);
  let maxAbs = 0;
  let at = 0;
  for (let b1 = 0; b1 * x1 < n1; b1++) {
    for (let b2 = 0; b2 < blocks2; b2++) {
      for (let r = 0; r < x1; r++) {
        for (let c = 0; c < x2; c++, at++) {
          const row = b1 * x1 + r;
          const col = b2 * x2 + c;
          if (row >= n1 || col >= n2) continue;
          const v = Math.abs(values[at] * scale);
          out[row * n2 + col] = v;
          if (v > maxAbs) maxAbs = v;
        }
      }
    }
  }
  const sample: number[] = [];
  for (let i = 0; i < out.length; i += 37) sample.push(out[i]);
  sample.sort((a, b) => a - b);
  return {
    data: out,
    n2,
    n1,
    first2: off2,
    last2: off2 - ((n2 - 1) * sw2) / sf2 / n2,
    first1: off1,
    last1: off1 - ((n1 - 1) * sw1) / sf1 / n1,
    maxAbs: maxAbs || 1,
    noise: sample[Math.floor(sample.length / 2)] || 0,
  };
}

/** F1 の取り込み方 (acqu2s の FnMODE。古いデータは proc2s の MC2) */
export function f1ModeOf(acqu2s: BrukerParams | null, proc2s: BrukerParams | null): F1Mode {
  const fn = num(acqu2s, 'FnMODE');
  // FnMODE: 1 QF, 2 QSEQ, 3 TPPI, 4 States, 5 States-TPPI, 6 Echo-Antiecho (0 は未定 → MC2: 0 QF, 1 QSEQ, 2 TPPI, 3 States, 4 States-TPPI, 5 Echo-Antiecho)
  const mode = fn && fn > 0 ? fn - 1 : (num(proc2s, 'MC2') ?? 0);
  if (mode === 3) return 'states';
  if (mode === 4) return 'states-tppi';
  if (mode === 5) return 'echo-antiecho';
  if (mode === 1 || mode === 2) return 'real';
  return 'complex';
}

/** 2D の生データ (ser) を、このアプリの 2D の FID の形にする */
function brukerSer(acqus: BrukerParams, acqu2s: BrukerParams, procs: BrukerParams | null, proc2s: BrukerParams | null, raw: ArrayBuffer, fileName: string): Fid2dData {
  const td2 = num(acqus, 'TD') ?? 0;
  const td1 = num(acqu2s, 'TD') ?? 0;
  const sw2 = num(acqus, 'SW_h');
  const sfo2 = num(acqus, 'SFO1');
  const sfo1 = num(acqu2s, 'SFO1');
  // F1 の幅は SW (ppm) × SFO1。acqu2s の SW_h は古い値のまま残っていることがある (公開データの COSY で 1.4 倍違った)
  const swPpm1 = num(acqu2s, 'SW');
  const sw1 = swPpm1 && sfo1 ? swPpm1 * sfo1 : num(acqu2s, 'SW_h');
  const bf2 = num(acqus, 'BF1');
  const bf1 = num(acqu2s, 'BF1');
  if (!td2 || !td1 || !sw2 || !sw1 || !sfo2 || !sfo1 || !bf2 || !bf1) {
    throw new JdfError(tr('{fileName}: 2D の測定のパラメーター (acqus・acqu2s) が読めませんでした', { fileName }));
  }
  const values = readNumbers(raw, num(acqus, 'BYTORDA') !== 1, num(acqus, 'DTYPA') === 2);
  // 1 行は 256 点ごと (1024 バイト) に区切って書いてある。行の数はファイルの大きさから
  const rows = Math.min(td1, Math.floor(values.length / td2));
  const stride = rows > 0 ? Math.max(td2, Math.floor(values.length / Math.max(1, rows))) : td2;
  const usedRows = Math.min(td1, Math.floor(values.length / stride));
  if (usedRows < 2) throw new JdfError(tr('{fileName}: 2D の生データ (ser) が短すぎます', { fileName }));
  // デジタルフィルターの遅れの点は捨てる (絶対値なので位相は合わせなくてよいが、窓関数の始まりをそろえる)
  const skip = Math.min(Math.floor(brukerGroupDelay(acqus)), Math.floor(td2 / 4));
  const n2 = Math.floor(td2 / 2) - skip;
  const re: Float32Array[] = [];
  const im: Float32Array[] = [];
  for (let r = 0; r < usedRows; r++) {
    const a = new Float32Array(n2);
    const b = new Float32Array(n2);
    const start = r * stride;
    for (let k = 0; k < n2; k++) {
      a[k] = values[start + 2 * (k + skip)];
      b[k] = values[start + 2 * (k + skip) + 1];
    }
    re.push(a);
    im.push(b);
  }
  const ref2 = num(procs, 'SF') ?? bf2;
  const ref1 = num(proc2s, 'SF') ?? bf1;
  return {
    re,
    im,
    x: { sw: sw2, refMHz: ref2, offsetPpm: ((sfo2 - ref2) / ref2) * 1e6, clip: 1 },
    y: { sw: sw1, refMHz: ref1, offsetPpm: ((sfo1 - ref1) / ref1) * 1e6, clip: 1 },
    f1: f1ModeOf(acqu2s, proc2s),
  };
}

import { parseJEOL } from 'jeolconverter';
import type { SolventKey } from './impurityTypes';
import type { SpectrumMeta } from '../state/types';
import {
  autoPhase,
  defaultLb,
  finish,
  jeolGroupDelay,
  referenceShift,
  tallestPpm,
  transform,
  type FidData,
  type Processing,
} from './fid';
import { readAnnotations } from './jdfAnnotations';
import { normalizeNucleus } from './nuclei';
import { detectSolvent } from './solvents';

export class JdfError extends Error {}

export interface LoadedSpectrum {
  meta: SpectrumMeta;
  data: Float32Array;
  /** FID から処理したときの元データ (位相をやり直すのに使う) */
  fid?: FidData;
  /** 読み込んだ .jdf そのもの (Delta へ書き戻すときに使う) */
  source?: ArrayBuffer;
}

export interface ReadOptions {
  /** 溶媒の基準値 (研究室の値)。FID を処理したあとの基準合わせに使う */
  reference?: (solvent: SolventKey | null, nucleus: string) => number | null;
}

interface JeolDate {
  year: number;
  month: number;
  day: number;
}

/**
 * .jdf (1D) を読む。Delta で処理済みのスペクトルはそのまま、
 * 未処理の FID はこのアプリで FT・位相補正・ベースライン補正・基準合わせをする。
 */
export function readJdf(buffer: ArrayBuffer, fileName: string, options: ReadOptions = {}): LoadedSpectrum {
  let parsed;
  try {
    parsed = parseJEOL(buffer);
  } catch (e) {
    throw new JdfError(`${fileName}: JEOL Delta のファイルとして読めませんでした (${(e as Error).message})`);
  }
  const { headers: h, info } = parsed;
  if (h.fileIdentifier !== 'JEOL.NMR') throw new JdfError(`${fileName}: JEOL Delta のファイルではありません`);
  if (h.dataDimensionNumber !== 1) {
    throw new JdfError(`${fileName}: ${h.dataDimensionNumber}D データはまだ表示できません`);
  }
  const unit = h.dataUnits[0]?.base;
  if (unit !== 'Ppm' && unit !== 'Second') throw new JdfError(`${fileName}: 対応していない軸の単位です (${unit})`);

  const param = (name: string) => parsed.parameters?.paramArray?.find((p: { name: string }) => p.name === name)?.value;
  const isFid = unit === 'Second';
  const axisName: string = (isFid && typeof param('x_domain') === 'string' ? param('x_domain') : h.dataAxisTitles[0]) || info.nucleus?.[0] || '';
  const nucleus = normalizeNucleus(axisName);
  const decoupled = param('irr_decoupling') === 'TRUE' && typeof param('irr_domain') === 'string' ? normalizeNucleus(param('irr_domain')) : null;
  const created: JeolDate | undefined = h.creationTime;
  // Delta の時刻は 1990-01-01 (UTC) からの秒数
  const startTime = param('actual_start_time');
  const acquiredAt = typeof startTime === 'number' && startTime > 0 ? Date.UTC(1990, 0, 1) + startTime * 1000 : null;
  const solvent = detectSolvent(info.solvent);
  const base = {
    id: crypto.randomUUID(),
    fileName,
    title: h.title ?? '',
    nucleus,
    axisName,
    solventRaw: info.solvent ?? '',
    solvent,
    temperatureC: info.temperature?.unit === 'Celsius' ? info.temperature.magnitude : null,
    scans: info.numberOfScans ?? null,
    experiment: info.experiment ?? '',
    date: acquiredAt ? new Date(acquiredAt).toISOString().slice(0, 10) : created ? `${created.year}-${pad(created.month)}-${pad(created.day)}` : null,
    decoupled,
    acquiredAt,
  };

  if (isFid) {
    const sw = Number(param('x_sweep'));
    const freqHz = Number(param('x_freq'));
    const offsetPpm = Number(param('x_offset') ?? 0);
    if (!(sw > 0) || !(freqHz > 0)) throw new JdfError(`${fileName}: FID の測定条件 (x_sweep / x_freq) が読めませんでした`);
    const clipped = Number(param('x_sweep_clipped'));
    // JEOL の FID は虚部の符号が逆 (Delta で処理した結果と比べて確かめた)
    const fid: FidData = {
      re: Float32Array.from(parsed.data.re as ArrayLike<number>),
      im: Float32Array.from(parsed.data.im as ArrayLike<number>, (v) => -v),
      sw,
      refMHz: freqHz / 1e6 / (1 + offsetPpm * 1e-6),
      offsetPpm,
      groupDelay: param('digital_filter') === 'TRUE' ? jeolGroupDelay(String(param('orders') ?? ''), String(param('factors') ?? '')) : 0,
      acqDelay: (Number(param('acq_delay')) || 0) * sw,
      clip: clipped > 0 ? clipped / sw : 1,
    };
    const { data, first, last, processing, refOffset } = processNewFid(fid, nucleus, solvent, options);
    let maxAbs = 0;
    for (const v of data) maxAbs = Math.max(maxAbs, Math.abs(v));
    const meta: SpectrumMeta = {
      ...base,
      freqMHz: fid.refMHz,
      first,
      last,
      n: data.length,
      refOffset,
      maxAbs: maxAbs || 1,
      processing,
    };
    return { meta, data, fid, source: buffer };
  }

  const re: ArrayLike<number> = parsed.data.re;
  // 先頭と末尾はパディング。dataOffsetStart〜Stop の点が dataAxisStart〜Stop に対応する
  const start: number = h.dataOffsetStart[0];
  const stop: number = h.dataOffsetStop[0];
  if (!(stop > start) || stop >= re.length) throw new JdfError(`${fileName}: データ範囲が不正です`);
  const data = new Float32Array(stop - start + 1);
  let maxAbs = 0;
  for (let i = start; i <= stop; i++) {
    const v = re[i];
    data[i - start] = v;
    if (Math.abs(v) > maxAbs) maxAbs = Math.abs(v);
  }
  const delta = readAnnotations(buffer);
  const meta: SpectrumMeta = {
    ...base,
    freqMHz: h.baseFreq[0],
    first: h.dataAxisStart[0],
    last: h.dataAxisStop[0],
    n: data.length,
    refOffset: 0,
    maxAbs: maxAbs || 1,
    processing: null,
    delta: delta.peaks.length || delta.integrals.length ? delta : null,
  };
  return { meta, data, source: buffer };
}

/** FID を初めて開いたときの処理: 自動の位相補正と、溶媒ピークでの基準合わせ */
export function processNewFid(fid: FidData, nucleus: string, solvent: SolventKey | null, options: ReadOptions) {
  const lb = defaultLb(nucleus);
  const spec = transform(fid, lb);
  const pivot = tallestPpm(spec);
  const phase = autoPhase(spec, pivot, nucleus);
  const processing: Processing = { lb, ...phase, pivot, baseline: true };
  const data = finish(spec, processing);
  const expected = options.reference?.(solvent, nucleus) ?? null;
  const shift = expected !== null ? referenceShift(data, spec.first, spec.last, expected, nucleus) : null;
  return { data, first: spec.first, last: spec.last, processing, refOffset: shift ?? 0 };
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

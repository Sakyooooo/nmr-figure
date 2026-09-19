import { parseJEOL } from 'jeolconverter';
import { defaultProcessing2d, transform2d, type Fid2dData, type Spectrum2dData } from './fid2d';
import { JdfError } from './jdf';
import { normalizeNucleus } from './nuclei';
import { detectSolvent } from './solvents';
import type { Axis2dMeta, Spectrum2dMeta } from '../state/types';

export interface Loaded2dSpectrum {
  meta: Spectrum2dMeta;
  data: Spectrum2dData;
  fid: Fid2dData;
}

/**
 * 2D の .jdf (未処理の FID) を読んで、2次元の FT をする。
 * Delta で処理して保存した 2D はこの研究室のデータにはないので、生データだけを扱う。
 */
export function readJdf2d(buffer: ArrayBuffer, fileName: string): Loaded2dSpectrum {
  let parsed;
  try {
    parsed = parseJEOL(buffer);
  } catch (e) {
    throw new JdfError(`${fileName}: JEOL Delta のファイルとして読めませんでした (${(e as Error).message})`);
  }
  const { headers: h, info } = parsed;
  if (h.fileIdentifier !== 'JEOL.NMR') throw new JdfError(`${fileName}: JEOL Delta のファイルではありません`);
  if (h.dataDimensionNumber !== 2) throw new JdfError(`${fileName}: 2D のデータではありません`);
  if (h.dataUnits[0]?.base !== 'Second' || h.dataUnits[1]?.base !== 'Second') {
    throw new JdfError(`${fileName}: Delta で処理して保存した 2D はまだ開けません (生データなら開けます)`);
  }
  const rows = parsed.data?.re as ArrayLike<number>[] | undefined;
  const rowsIm = parsed.data?.im as ArrayLike<number>[] | undefined;
  if (!rows?.length || !rowsIm?.length) throw new JdfError(`${fileName}: 2D のデータが読めませんでした`);

  const param = (name: string) => parsed.parameters?.paramArray?.find((p: { name: string }) => p.name === name)?.value;
  const num = (name: string) => Number(param(name));
  const sw2 = num('x_sweep');
  const sw1 = num('y_sweep');
  const freq2 = num('x_freq');
  const freq1 = num('y_freq');
  if (!(sw2 > 0) || !(sw1 > 0) || !(freq2 > 0) || !(freq1 > 0)) {
    throw new JdfError(`${fileName}: 2D の測定条件 (sweep / freq) が読めませんでした`);
  }
  const off2 = num('x_offset') || 0;
  const off1 = num('y_offset') || 0;
  const clipped = num('x_sweep_clipped');
  const fid: Fid2dData = {
    // 1D と同じく、JEOL の FID は虚部の符号が逆
    re: rows.map((r) => Float32Array.from(r)),
    im: rowsIm.map((r) => Float32Array.from(r, (v) => -v)),
    x: { sw: sw2, refMHz: freq2 / 1e6 / (1 + off2 * 1e-6), offsetPpm: off2, clip: clipped > 0 ? clipped / sw2 : 1 },
    y: { sw: sw1, refMHz: freq1 / 1e6 / (1 + off1 * 1e-6), offsetPpm: off1, clip: 1 },
  };
  const processing = defaultProcessing2d();
  const data = transform2d(fid, processing);

  const startTime = param('actual_start_time');
  const acquiredAt = typeof startTime === 'number' && startTime > 0 ? Date.UTC(1990, 0, 1) + startTime * 1000 : null;
  const axisName2 = String(param('x_domain') ?? h.dataAxisTitles[0] ?? '');
  const axisName1 = String(param('y_domain') ?? h.dataAxisTitles[1] ?? '');
  const axis = (axisName: string, freqHz: number, first: number, last: number, n: number): Axis2dMeta => ({
    nucleus: normalizeNucleus(axisName),
    axisName,
    freqMHz: freqHz / 1e6,
    first,
    last,
    n,
  });
  const meta: Spectrum2dMeta = {
    id: crypto.randomUUID(),
    fileName,
    title: h.title ?? '',
    experiment: info.experiment ?? String(param('experiment') ?? ''),
    x: axis(axisName2, freq2, data.first2, data.last2, data.n2),
    y: axis(axisName1, freq1, data.first1, data.last1, data.n1),
    solvent: detectSolvent(info.solvent),
    solventRaw: info.solvent ?? '',
    temperatureC: info.temperature?.unit === 'Celsius' ? info.temperature.magnitude : null,
    scans: info.numberOfScans ?? null,
    date: acquiredAt ? new Date(acquiredAt).toISOString().slice(0, 10) : null,
    acquiredAt,
    maxAbs: data.maxAbs,
    noise: data.noise,
    processing,
  };
  return { meta, data, fid };
}

/** 図のタイトル。例: ^{1}H-^{1}H COSY (400 MHz, C_{6}D_{6}) */
export function experimentLabel2d(meta: Spectrum2dMeta): string {
  const name = meta.experiment.replace(/\.jxp$/i, '').toUpperCase();
  const known = ['COSY', 'HMBC', 'HSQC', 'HMQC', 'NOESY', 'ROESY', 'TOCSY', 'DEPT', 'INADEQUATE'];
  return known.find((k) => name.includes(k)) ?? name;
}

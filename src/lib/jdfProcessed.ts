/**
 * このアプリで FID から処理したスペクトルを、Delta の「処理済み」の .jdf にする (Delta の -1-2.jdf と同じ形)。
 * 元の FID の .jdf を複製し、ヘッダの軸と測定データだけを差し替える。パラメーター・パルスプログラムなどはそのまま残す。
 *
 * Delta が処理したファイルとの違いは、研究室の生データと処理済みの組 (113 組) から読み解いた:
 * - 軸の単位を秒 → ppm (ヘッダ +33 = 26)。データは 64 bit の複素数 (実部を全部、続けて虚部を全部)
 * - 点の数は 16 の倍数に 0 で埋め、有効な点を data_offset_start〜stop に置く (前に半分、切り上げ)
 * - base_freq = 基準を合わせたあとの観測中心の周波数 = 0 ppm の周波数 × (1 + (x_offset − ずらした ppm) × 10⁻⁶)
 * - zero_point = 基準合わせでずらした量 (Hz) = ずらした ppm × base_freq
 * - 文脈から「これから当てる処理」(UNAPPLIED_PROCESSING_LIST) を外す (Delta の処理済みのファイルにはない)
 * - 強度は一番大きい点を 1 にそろえる (Delta も normalized = TRUE で、最大が 1 前後)
 * 注釈は空。ピーク値・積分は lib/jdfWrite.ts で足す。
 */
import { finish, phaseImag, transform, type FidData, type Processing } from './fid';
import { CONTEXT, HEADER, JdfFormatError, UNIT_PPM, UNIT_SECOND, buildJdf, splitJdf } from './jdfSections';

const POINT_ALIGN = 16;

export function writeProcessedJdf(raw: ArrayBuffer, fid: FidData, processing: Processing, refOffset: number): ArrayBuffer {
  const parts = splitJdf(raw);
  const head = new DataView(parts.header.buffer, parts.header.byteOffset, parts.header.byteLength);
  if (parts.header[HEADER.dimensions] !== 1) throw new JdfFormatError('1D の FID だけを処理済みのファイルにできます');
  if (parts.header[HEADER.unitBase] !== UNIT_SECOND) throw new JdfFormatError('FID (時間の軸) のファイルではありません');

  const spec = transform(fid, processing.lb);
  const real = finish(spec, processing);
  const imag = phaseImag(spec, processing.ph0, processing.ph1, processing.pivot);
  const n = real.length;
  const points = Math.ceil(n / POINT_ALIGN) * POINT_ALIGN;
  const offset = Math.ceil((points - n) / 2);
  let max = 0;
  for (const v of real) max = Math.max(max, Math.abs(v));
  const scale = max > 0 ? 1 / max : 1;

  const data = new Uint8Array(points * 2 * 8);
  const dv = new DataView(data.buffer);
  for (let k = 0; k < n; k++) {
    dv.setFloat64((offset + k) * 8, real[k] * scale, true);
    dv.setFloat64((points + offset + k) * 8, imag[k] * scale, true);
  }
  parts.data = data;

  const baseFreq = fid.refMHz * (1 + (fid.offsetPpm - refOffset) * 1e-6);
  parts.header[14] &= 0x3f; // 64 bit のデータ
  parts.header[HEADER.unitBase] = UNIT_PPM;
  head.setUint32(HEADER.dataPoints, points);
  head.setUint32(HEADER.offsetStart, offset);
  head.setUint32(HEADER.offsetStop, offset + n - 1);
  head.setFloat64(HEADER.axisStart, spec.first + refOffset);
  head.setFloat64(HEADER.axisStop, spec.last + refOffset);
  head.setFloat64(HEADER.baseFreq, baseFreq);
  head.setFloat64(HEADER.zeroPoint, refOffset * baseFreq);

  parts.context = parts.context.filter((r) => r.type !== CONTEXT.unappliedProcessingList);
  parts.annotations = new Uint8Array(0);
  return buildJdf(parts);
}

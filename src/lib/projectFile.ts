import { migrateDocument, type NmrDocument } from '../state/types';
import type { FidData } from './fid';
import { transform2d, type Fid2dData, type Spectrum2dData } from './fid2d';

export const PROJECT_EXT = '.nmrfig';

interface ProjectFileV1 {
  format: 'nmr-figure-editor';
  version: 1;
  savedAt: string;
  doc: NmrDocument;
  /** spectrumId → Float32 (little endian) の base64 */
  data: Record<string, string>;
  /** このアプリで処理した FID (位相をやり直せるように元データも残す) */
  fids?: Record<string, Omit<FidData, 're' | 'im'> & { re: string; im: string }>;
  /** 2D の生データ。開いたときに FT し直す (処理後の行列は大きいので入れない) */
  fids2d?: Record<string, Omit<Fid2dData, 're' | 'im'> & { re: string; im: string; rows: number }>;
}

/** 元の .jdf を移動しても開けるように、スペクトルデータもファイルに含める */
export function serializeProject(
  doc: NmrDocument,
  data: Record<string, Float32Array>,
  fids: Record<string, FidData> = {},
  fids2d: Record<string, Fid2dData> = {},
): string {
  const used: Record<string, string> = {};
  const usedFids: NonNullable<ProjectFileV1['fids']> = {};
  for (const s of doc.spectra) {
    const arr = data[s.id];
    if (arr) used[s.id] = toBase64(arr);
    const fid = fids[s.id];
    if (fid) usedFids[s.id] = { ...fid, re: toBase64(fid.re), im: toBase64(fid.im) };
  }
  const used2d: NonNullable<ProjectFileV1['fids2d']> = {};
  for (const s2 of doc.spectra2d ?? []) {
    const fid = fids2d[s2.id];
    if (fid) used2d[s2.id] = { ...fid, rows: fid.re.length, re: toBase64(flatten(fid.re)), im: toBase64(flatten(fid.im)) };
  }
  const file: ProjectFileV1 = {
    format: 'nmr-figure-editor',
    version: 1,
    savedAt: new Date().toISOString(),
    doc,
    data: used,
    fids: usedFids,
    fids2d: used2d,
  };
  return JSON.stringify(file);
}

export function parseProject(text: string): {
  doc: NmrDocument;
  data: Record<string, Float32Array>;
  fids: Record<string, FidData>;
  fids2d: Record<string, Fid2dData>;
  data2d: Record<string, Spectrum2dData>;
} {
  const file = JSON.parse(text) as ProjectFileV1;
  if (file?.format !== 'nmr-figure-editor') throw new Error('NMR Figure Editor のプロジェクトファイルではありません');
  if (file.version !== 1) throw new Error(`対応していないバージョンです (${file.version})`);
  const data: Record<string, Float32Array> = {};
  for (const [id, b64] of Object.entries(file.data)) data[id] = fromBase64(b64);
  const fids: Record<string, FidData> = {};
  for (const [id, f] of Object.entries(file.fids ?? {})) fids[id] = { ...f, acqDelay: f.acqDelay ?? 0, re: fromBase64(f.re), im: fromBase64(f.im) };
  // 後から増えた設定項目は既定値で埋める
  const doc = migrateDocument(file.doc);
  // 2D は生データから作り直す (行列は保存しない)
  const fids2d: Record<string, Fid2dData> = {};
  const data2d: Record<string, Spectrum2dData> = {};
  for (const [id, f] of Object.entries(file.fids2d ?? {})) {
    const fid: Fid2dData = { ...f, re: split(fromBase64(f.re), f.rows), im: split(fromBase64(f.im), f.rows) };
    fids2d[id] = fid;
    const meta = doc.spectra2d.find((s2) => s2.id === id);
    if (meta) data2d[id] = transform2d(fid, meta.processing);
  }
  return { doc, data, fids, fids2d, data2d };
}

/** 行ごとの配列を 1本につなぐ / 戻す */
function flatten(rows: Float32Array[]): Float32Array {
  const out = new Float32Array(rows.length * (rows[0]?.length ?? 0));
  rows.forEach((r, i) => out.set(r, i * r.length));
  return out;
}

function split(flat: Float32Array, rows: number): Float32Array[] {
  const len = flat.length / rows;
  return Array.from({ length: rows }, (_, i) => flat.slice(i * len, (i + 1) * len));
}

function toBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/**
 * .jdf の区画 (パラメーター・測定データ・文脈 (context)・注釈) を読み、組み直す。
 * JEOL の公開仕様ではないので、研究室の .jdf 234 ファイルと Delta 付属の list_header.exe / convert.exe で確かめた (docs/SPEC.md)。
 *
 * ファイルの並び (どのファイルも同じ):
 *   ヘッダ (1360 バイト、ビッグエンディアン) → パラメーター (1360〜) → 0 埋め → 測定データ (16384〜)
 *   → 文脈 → 注釈 → 64 バイト境界まで 0 埋め (ヘッダの total_size = ファイルの大きさ)
 * パラメーター・文脈・注釈の中身はリトルエンディアン (ヘッダ +8 = 1)。
 *
 * 文脈は [種類 u32][長さ u32][中身] の並びで、各組は 16 バイト境界に揃う。種類の名前は list_header +c で分かる:
 *   1 = EXPERIMENT_SRC (パルスプログラム)、2 = PROCESSING_LIST (当てた処理)、3 = UNAPPLIED_PROCESSING_LIST (これから当てる処理)、
 *   15 = FILE_VIEW、16 = 一覧表 (INTEGRAL LISTING など)、33 = PARAMETER_STORAGE
 * PARAMETER_STORAGE は、16 文字に収まらない文字のパラメーターの全文の置き場 (キーはパラメーター名の大文字)。
 * 中身は [タグ u32][数 u32]… のビッグエンディアンで、0x2b2a = リスト、0x271d = 文字。
 */

export const HEADER = {
  endian: 8,
  dimensions: 12,
  unitBase: 33,
  dataPoints: 176,
  offsetStart: 208,
  offsetStop: 240,
  axisStart: 272,
  axisStop: 336,
  baseFreq: 1064,
  zeroPoint: 1128,
  paramStart: 1212,
  paramLength: 1216,
  listStart: 1220,
  dataStart: 1284,
  dataLength: 1288,
  contextStart: 1296,
  contextLength: 1304,
  annoteStart: 1308,
  annoteLength: 1316,
  totalSize: 1320,
} as const;

/** 軸の単位 (ヘッダ +33): 26 = ppm、28 = 秒 */
export const UNIT_PPM = 26;
export const UNIT_SECOND = 28;

/** 文脈の種類 */
export const CONTEXT = { processingList: 2, unappliedProcessingList: 3, parameterStorage: 33 } as const;

const FILE_ALIGN = 64;
const CONTEXT_ALIGN = 16;
const PARAM_HEAD = 16;

const TAG_LIST = 0x2b2a;
const TAG_STRING = 0x271d;

export class JdfFormatError extends Error {}

export interface ContextRecord {
  type: number;
  data: Uint8Array;
}

/** ファイルを区画に分けたもの。組み直すときは、変えた区画だけ差し替えて build に渡す */
export interface JdfParts {
  /** ヘッダ (パラメーターの始まりまで) */
  header: Uint8Array;
  /** パラメーターの見出しと記録 (ヘッダの param_length の分) */
  params: Uint8Array;
  /** 測定データが始まる位置 (ここまでパラメーターのうしろを 0 で埋める) */
  dataStart: number;
  data: Uint8Array;
  context: ContextRecord[];
  annotations: Uint8Array;
}

export function isJdf(bytes: Uint8Array) {
  return bytes.length > HEADER.totalSize + 8 && new TextDecoder().decode(bytes.subarray(0, 8)) === 'JEOL.NMR';
}

export function splitJdf(source: ArrayBuffer): JdfParts {
  const bytes = new Uint8Array(source);
  if (!isJdf(bytes)) throw new JdfFormatError('JEOL Delta のファイルではありません');
  const v = new DataView(source);
  if (v.getUint8(HEADER.endian) !== 1) throw new JdfFormatError('対応していない並び (ビッグエンディアン) のファイルです');
  const paramStart = v.getUint32(HEADER.paramStart);
  const paramLength = v.getUint32(HEADER.paramLength);
  const dataStart = v.getUint32(HEADER.dataStart);
  const dataLength = Number(v.getBigUint64(HEADER.dataLength));
  const contextStart = Number(v.getBigUint64(HEADER.contextStart));
  const contextLength = v.getUint32(HEADER.contextLength);
  const annoteStart = Number(v.getBigUint64(HEADER.annoteStart));
  const annoteLength = v.getUint32(HEADER.annoteLength);
  // Delta のファイルはこの順に隙間なく並ぶ。違う並びのファイルは組み直さない
  const ordered =
    paramStart + paramLength <= dataStart &&
    dataStart + dataLength === contextStart &&
    contextStart + contextLength === annoteStart &&
    annoteStart + annoteLength <= bytes.length;
  if (!ordered) throw new JdfFormatError('区画の並びがいつもと違うので、書き換えをやめました');
  for (let i = annoteStart + annoteLength; i < bytes.length; i++) {
    if (bytes[i]) throw new JdfFormatError('注釈のうしろに読めない部分があるので、書き換えをやめました');
  }
  return {
    header: bytes.slice(0, paramStart),
    params: bytes.slice(paramStart, paramStart + paramLength),
    dataStart,
    data: bytes.slice(dataStart, contextStart),
    context: parseContext(bytes.subarray(contextStart, annoteStart)),
    annotations: bytes.slice(annoteStart, annoteStart + annoteLength),
  };
}

export function buildJdf(parts: JdfParts): ArrayBuffer {
  const paramStart = parts.header.length;
  const listStart = paramStart + parts.params.length;
  if (listStart > parts.dataStart) throw new JdfFormatError('パラメーターが測定データの場所まではみ出します');
  const context = buildContext(parts.context);
  const contextStart = parts.dataStart + parts.data.length;
  const annoteStart = contextStart + context.length;
  const end = annoteStart + parts.annotations.length;
  const total = Math.ceil(end / FILE_ALIGN) * FILE_ALIGN;
  const out = new Uint8Array(total);
  out.set(parts.header, 0);
  out.set(parts.params, paramStart);
  out.set(parts.data, parts.dataStart);
  out.set(context, contextStart);
  out.set(parts.annotations, annoteStart);
  const v = new DataView(out.buffer);
  v.setUint32(HEADER.paramStart, paramStart);
  v.setUint32(HEADER.paramLength, parts.params.length);
  // ruler lists (8 つ) は使っていない (長さ 0)。場所はパラメーターの直後
  for (let k = 0; k < 8; k++) v.setUint32(HEADER.listStart + 4 * k, listStart);
  v.setUint32(HEADER.dataStart, parts.dataStart);
  v.setBigUint64(HEADER.dataLength, BigInt(parts.data.length));
  v.setBigUint64(HEADER.contextStart, BigInt(contextStart));
  v.setUint32(HEADER.contextLength, context.length);
  v.setBigUint64(HEADER.annoteStart, BigInt(annoteStart));
  v.setUint32(HEADER.annoteLength, parts.annotations.length);
  v.setBigUint64(HEADER.totalSize, BigInt(total));
  return out.buffer;
}

// ---------------------------------------------------------------- 文脈

export function parseContext(bytes: Uint8Array): ContextRecord[] {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: ContextRecord[] = [];
  let p = 0;
  while (p + 8 <= bytes.length) {
    const type = v.getUint32(p, true);
    const length = v.getUint32(p + 4, true);
    if (!type && !length) break;
    if (p + 8 + length > bytes.length) throw new JdfFormatError('文脈 (context) が途中で切れています');
    out.push({ type, data: bytes.slice(p + 8, p + 8 + length) });
    p = align(p + 8 + length, CONTEXT_ALIGN);
  }
  return out;
}

export function buildContext(records: ContextRecord[]): Uint8Array {
  const size = records.reduce((s, r) => align(s + 8 + r.data.length, CONTEXT_ALIGN), 0);
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  let p = 0;
  for (const r of records) {
    v.setUint32(p, r.type, true);
    v.setUint32(p + 4, r.data.length, true);
    out.set(r.data, p + 8);
    p = align(p + 8 + r.data.length, CONTEXT_ALIGN);
  }
  return out;
}

// ---------------------------------------------------------------- PARAMETER_STORAGE

/** PARAMETER_STORAGE の一番外のリストから、キーが prefix で始まる「文字の組」を取り出す */
export function storageStrings(data: Uint8Array, prefix: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const pair of findPairs(data, prefix)) out.set(pair.key, pair.value);
  return out;
}

/** キーが prefix で始まる組を消し、pairs を足した PARAMETER_STORAGE */
export function replaceStoragePairs(data: Uint8Array, prefix: string, pairs: [string, string][]): Uint8Array {
  const base = data.length >= 8 ? data : listHead(0);
  const v = new DataView(base.buffer, base.byteOffset, base.byteLength);
  if (v.getUint32(0) !== TAG_LIST) throw new JdfFormatError('PARAMETER_STORAGE がリストで始まっていません');
  const found = findPairs(base, prefix);
  const kept: Uint8Array[] = [];
  let p = 8;
  for (const f of found) {
    kept.push(base.subarray(p, f.start));
    p = f.end;
  }
  kept.push(base.subarray(p));
  const added = pairs.map(([k, s]) => concat([tagged(TAG_LIST, 2), stringItem(k), stringItem(s)]));
  const out = concat([listHead(v.getUint32(4) - found.length + pairs.length), ...kept, ...added]);
  return out;
}

/** [リスト 2][文字 キー][文字 値] の組を探す。ほかの組の値の形は全部は分からないので、並びを見つけて拾う */
function findPairs(data: Uint8Array, prefix: string) {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const want = new TextEncoder().encode(prefix);
  const out: { key: string; value: string; start: number; end: number }[] = [];
  for (let p = 8; p + 24 <= data.length; p++) {
    if (v.getUint32(p) !== TAG_LIST || v.getUint32(p + 4) !== 2 || v.getUint32(p + 8) !== TAG_STRING) continue;
    const keyLength = v.getUint32(p + 12);
    const keyAt = p + 16;
    if (keyLength < want.length || keyAt + keyLength + 8 > data.length) continue;
    if (!want.every((c, i) => data[keyAt + i] === c)) continue;
    const valueAt = keyAt + keyLength;
    if (v.getUint32(valueAt) !== TAG_STRING) continue;
    const valueLength = v.getUint32(valueAt + 4);
    const end = valueAt + 8 + valueLength;
    if (end > data.length) continue;
    out.push({ key: latin1(data.subarray(keyAt, keyAt + keyLength)), value: latin1(data.subarray(valueAt + 8, end)), start: p, end });
    p = end - 1;
  }
  return out;
}

function listHead(count: number) {
  return tagged(TAG_LIST, count);
}

function tagged(tag: number, n: number) {
  const out = new Uint8Array(8);
  const v = new DataView(out.buffer);
  v.setUint32(0, tag);
  v.setUint32(4, n);
  return out;
}

function stringItem(s: string) {
  const bytes = fromLatin1(s);
  return concat([tagged(TAG_STRING, bytes.length), bytes]);
}

// ---------------------------------------------------------------- パラメーター

/**
 * パラメーターの記録 (64 バイト):
 *   +0 u8 3 / +1 u8 群の中の番号 / +2 u8 群 / +4 i16 倍率 / +6 単位 5 つ / +16 値 (16 バイト) / +32 i32 値の形 (0 = 文字) / +36 名前 (28 文字、空白埋め)
 * 群 0x2b は list_header で DEV_USER_ANALYSIS と出る (解析の結果を置く群)。このアプリの値もここに置く
 */
const PARAM = { index: 1, group: 2, value: 16, valueType: 32, name: 36, nameLength: 28, valueLength: 16 } as const;
const USER_GROUP = 0x2b;

export interface ParamInfo {
  name: string;
  /** 値の形 (0 = 文字、1 = 整数、2 = 実数) */
  valueType: number;
}

export function readParamNames(params: Uint8Array): ParamInfo[] {
  const { size, count } = paramHead(params);
  const out: ParamInfo[] = [];
  for (let i = 0; i < count; i++) {
    const at = PARAM_HEAD + i * size;
    const v = new DataView(params.buffer, params.byteOffset + at, size);
    out.push({ name: latin1(params.subarray(at + PARAM.name, at + PARAM.name + PARAM.nameLength)).trim(), valueType: v.getInt32(PARAM.valueType, true) });
  }
  return out;
}

/** 名前が prefix で始まるパラメーターを消し、文字のパラメーターを足す。足せる数は room まで */
export function replaceStringParams(params: Uint8Array, prefix: string, add: { name: string; value: string }[]): Uint8Array {
  const { size, count } = paramHead(params);
  const kept: Uint8Array[] = [];
  let maxIndex = 0;
  for (let i = 0; i < count; i++) {
    const rec = params.subarray(PARAM_HEAD + i * size, PARAM_HEAD + (i + 1) * size);
    const name = latin1(rec.subarray(PARAM.name, PARAM.name + PARAM.nameLength)).trim();
    if (name.startsWith(prefix)) continue;
    kept.push(rec);
    if (rec[PARAM.group] === USER_GROUP) maxIndex = Math.max(maxIndex, rec[PARAM.index]);
  }
  const added = add.map((p, i) => {
    if (p.name.length > PARAM.nameLength) throw new JdfFormatError(`パラメーターの名前が長すぎます (${p.name})`);
    const rec = new Uint8Array(size);
    rec[0] = 3;
    rec[PARAM.index] = Math.min(255, maxIndex + 1 + i);
    rec[PARAM.group] = USER_GROUP;
    rec.fill(0x20, PARAM.value, PARAM.value + PARAM.valueLength);
    rec.set(fromLatin1(p.value.slice(0, PARAM.valueLength)), PARAM.value);
    new DataView(rec.buffer).setInt32(PARAM.valueType, 0, true);
    rec.fill(0x20, PARAM.name, PARAM.name + PARAM.nameLength);
    rec.set(fromLatin1(p.name), PARAM.name);
    return rec;
  });
  const total = kept.length + added.length;
  const out = concat([params.subarray(0, PARAM_HEAD), ...kept, ...added]);
  const v = new DataView(out.buffer);
  v.setUint32(8, total - 1, true); // 最後の番号
  v.setUint32(12, total * size, true);
  return out;
}

function paramHead(params: Uint8Array) {
  if (params.length < PARAM_HEAD) throw new JdfFormatError('パラメーターの見出しが読めません');
  const v = new DataView(params.buffer, params.byteOffset, params.byteLength);
  const size = v.getUint32(0, true);
  const low = v.getUint32(4, true);
  const high = v.getUint32(8, true);
  const count = high - low + 1;
  if (size !== 64 || low !== 0 || PARAM_HEAD + count * size > params.length) throw new JdfFormatError('パラメーターの形がいつもと違います');
  return { size, count };
}

// ---------------------------------------------------------------- 小道具

function align(n: number, to: number) {
  return Math.ceil(n / to) * to;
}

export function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

function latin1(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
}

function fromLatin1(s: string) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c > 0xff) throw new JdfFormatError('Delta のファイルに書けない文字があります');
    out[i] = c;
  }
  return out;
}

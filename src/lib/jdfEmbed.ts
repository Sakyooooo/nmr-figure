/**
 * 図 (.nmrfig と同じ中身) を .jdf の中に入れる / 取り出す。
 * 保存した図を .jdf 1 種類にして、フォルダでダブルクリックすると Delta が開き、このアプリで開くと図が戻るようにするため。
 *
 * 入れる場所は「文字のパラメーター」: 名前 nmrfig_info / nmrfig_data_001… の記録を足し、
 * 16 文字より長い値の全文を PARAMETER_STORAGE (長い文字の置き場) に置く。Delta 付属の convert.exe で読み書きし直しても
 * 1 文字も変わらずに残ることを確かめた (注釈のうしろや、知らない種類の文脈に置いたものは消えた)。
 * Delta の画面ではパラメーターの一覧に nmrfig_… として見える。
 *
 * 中身: 図の JSON を gzip して base64 にし、64 KB 前後に均等に分けたもの。
 * nmrfig_info = "v1 gzip <分けた数> <文字数> <crc32>"、nmrfig_summary = "<本数>|<核種+核種>" (16 文字まで。ホーム画面の一覧用)
 */
import { tr } from '../i18n';
import { CONTEXT, buildJdf, readParams, replaceStoragePairs, replaceStringParams, splitJdf, storageStrings } from './jdfSections';

const PARAM_PREFIX = 'nmrfig_';
const STORAGE_PREFIX = 'NMRFIG_';
const INFO = 'nmrfig_info';
const SUMMARY = 'nmrfig_summary';
const VERSION = 'v1';
const CHUNK = 65536;
const PARAM_SIZE = 64;
/** パラメーターの記録に収まる文字数 (これより長い値は PARAMETER_STORAGE にも置く) */
const SHORT = 16;

export class EmbedError extends Error {}

export interface FigureSummary {
  /** 重ねた本数 */
  layers: number;
  /** 核種 (1H, 13C …) */
  nuclei: string[];
}

/** 図の JSON を入れた .jdf を作る (前に入れた図は置き換える)。元の buffer は変えない */
export async function embedFigure(source: ArrayBuffer, json: string, summary?: FigureSummary): Promise<ArrayBuffer> {
  const parts = splitJdf(source);
  const text = toBase64(await gzip(new TextEncoder().encode(json)));

  // 足せるパラメーターの数 (パラメーターのうしろから測定データまでの空き)。info と summary の 2 つは別に要る
  const without = replaceStringParams(parts.params, PARAM_PREFIX, []);
  const room = Math.floor((parts.dataStart - parts.header.length - without.length) / PARAM_SIZE) - 2;
  if (room < 1) throw new EmbedError(tr('このファイルには図を入れる空きがありません'));
  // 均等に分ける (最後の 1 つだけ短くならないように。短い値は PARAMETER_STORAGE に置かれない)
  const count = Math.min(room, Math.max(1, Math.ceil(text.length / CHUNK)));
  const size = Math.ceil(text.length / count);
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));

  const info = `${VERSION} gzip ${chunks.length} ${text.length} ${crc32(text).toString(16).padStart(8, '0')}`;
  const params = [
    { name: INFO, value: info },
    ...(summary ? [{ name: SUMMARY, value: summaryText(summary) }] : []),
    ...chunks.map((c, i) => ({ name: dataName(i), value: c })),
  ];
  parts.params = replaceStringParams(parts.params, PARAM_PREFIX, params);

  let storage = parts.context.find((r) => r.type === CONTEXT.parameterStorage);
  if (!storage) {
    storage = { type: CONTEXT.parameterStorage, data: new Uint8Array(0) };
    parts.context.push(storage);
  }
  storage.data = replaceStoragePairs(
    storage.data,
    STORAGE_PREFIX,
    params.filter((p) => p.value.length > SHORT).map((p) => [p.name.toUpperCase(), p.value]),
  );
  return buildJdf(parts);
}

/** 入っている図を取り除いた .jdf */
export function removeFigure(source: ArrayBuffer): ArrayBuffer {
  const parts = splitJdf(source);
  parts.params = replaceStringParams(parts.params, PARAM_PREFIX, []);
  const storage = parts.context.find((r) => r.type === CONTEXT.parameterStorage);
  if (storage) storage.data = replaceStoragePairs(storage.data, STORAGE_PREFIX, []);
  return buildJdf(parts);
}

/** 図が入っているか (パラメーターの名前だけ見る) */
export function hasEmbeddedFigure(source: ArrayBuffer): boolean {
  try {
    return readParams(splitJdf(source).params).some((p) => p.name === INFO);
  } catch {
    return false;
  }
}

/** パラメーターの値 (nmrfig_summary の先頭 16 文字) から、一覧に出す要約を読む */
export function parseSummary(text: string | undefined | null): FigureSummary | null {
  const m = /^(\d+)\|(.*)$/.exec(text ?? '');
  return m ? { layers: Number(m[1]), nuclei: m[2].split('+').filter(Boolean) } : null;
}

/** 入っている図の JSON。入っていなければ null、壊れていればエラー */
export async function readEmbeddedFigure(source: ArrayBuffer): Promise<string | null> {
  let parts;
  try {
    parts = splitJdf(source);
  } catch {
    return null;
  }
  const params = new Map(readParams(parts.params).map((p) => [p.name, p.text]));
  if (!params.has(INFO)) return null;
  const storage = parts.context.find((r) => r.type === CONTEXT.parameterStorage);
  const long = storage ? storageStrings(storage.data, STORAGE_PREFIX) : new Map<string, string>();
  // 長い値は PARAMETER_STORAGE、16 文字以内の値はパラメーターの記録そのもの
  const value = (name: string) => long.get(name.toUpperCase()) ?? params.get(name);
  const info = value(INFO) ?? '';
  const [version, codec, count, length, crc] = info.split(' ');
  if (version !== VERSION || codec !== 'gzip') throw new EmbedError(tr('このアプリより新しい版で入れた図です ({version})', { version }));
  let text = '';
  for (let i = 0; i < Number(count); i++) {
    const chunk = value(dataName(i));
    if (chunk === undefined) throw new EmbedError(tr('図の中身の一部が見つかりません'));
    text += chunk;
  }
  if (text.length !== Number(length) || crc32(text).toString(16).padStart(8, '0') !== crc) {
    throw new EmbedError(tr('図の中身が壊れています'));
  }
  return new TextDecoder().decode(await gunzip(fromBase64(text)));
}

function summaryText(s: FigureSummary) {
  let text = `${s.layers}|${s.nuclei.join('+')}`;
  while (text.length > SHORT && text.includes('+')) text = text.slice(0, text.lastIndexOf('+'));
  return text.slice(0, SHORT);
}

function dataName(i: number) {
  return `${PARAM_PREFIX}data_${String(i + 1).padStart(3, '0')}`;
}

async function gzip(bytes: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function gunzip(bytes: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function fromBase64(text: string) {
  const bin = atob(text);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let crcTable: Uint32Array | null = null;

/** 壊れていないかの確かめ用 (CRC-32) */
function crc32(text: string) {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < text.length; i++) crc = crcTable[(crc ^ text.charCodeAt(i)) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

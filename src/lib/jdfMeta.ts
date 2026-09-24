import type { SolventKey } from './impurityTypes';
import { parseSummary, type FigureSummary } from './jdfEmbed';
import { normalizeNucleus } from './nuclei';
import { detectSolvent } from './solvents';

/** ホーム画面の一覧に出す、1ファイル分の情報。データ本体は読まない */
export interface ExperimentMeta {
  /** 名前・サイズ・更新日時から作る (ファイルが変わったら別物として扱う) */
  key: string;
  fileName: string;
  size: number;
  lastModified: number;
  /** Delta のタイトル (サンプル名) */
  title: string;
  dimension: number;
  /** 次元ごとの核種 ("1H", "13C") */
  nuclei: string[];
  decoupled: string | null;
  freqMHz: number;
  solventRaw: string;
  solvent: SolventKey | null;
  experiment: string;
  scans: number | null;
  temperatureC: number | null;
  /** 測定開始時刻 (ms)。分からなければファイルの更新日時 */
  measuredAt: number;
  /** FT 済みか (未処理の FID は開けない) */
  processed: boolean;
  /** このソフトで保存した図入りの .jdf なら、その本数と核種 (測定ではなく図として並べる) */
  figure?: FigureSummary | null;
}

export function experimentKey(file: { name: string; size: number; lastModified: number }) {
  return `${file.name}|${file.size}|${file.lastModified}`;
}

/** Delta の時刻は 1990-01-01 (UTC) からの秒数 */
const JEOL_EPOCH_MS = Date.UTC(1990, 0, 1);

const HEADER_BYTES = 1360;
/** 軸の単位コード (jeolconverter の表で 26 = Ppm)。FID は Second */
const UNIT_PPM = 26;

type Param = string | number | null;

/**
 * .jdf のヘッダーとパラメーターだけを読む (数十 KB)。
 * レイアウトは jeolconverter と同じ。日付は actual_start_time から求める
 * (ヘッダーの作成日は jeolconverter の読み方だと日がずれるため使わない)。
 */
export async function readJdfMeta(file: File): Promise<ExperimentMeta> {
  const head = new DataView(await file.slice(0, HEADER_BYTES).arrayBuffer());
  const text = (offset: number, length: number) => {
    let s = '';
    for (let i = 0; i < length; i++) {
      const c = head.getUint8(offset + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  if (text(0, 8) !== 'JEOL.NMR') throw new Error(`${file.name}: JEOL Delta のファイルではありません`);
  const little = head.getInt8(8) === 1;
  const dimension = head.getUint8(12);
  const unitBase = head.getInt8(0x21);
  const title = text(0x30, 124);
  const nuclei: string[] = [];
  for (let d = 0; d < Math.max(1, dimension); d++) {
    const axis = text(0x328 + 32 * d, 32);
    if (axis) nuclei.push(normalizeNucleus(axis));
  }
  const freqMHz = head.getFloat64(0x428, false);
  const paramStart = head.getUint32(0x4bc, false);
  const paramLength = head.getUint32(0x4c0, false);

  const params = parseParams(new DataView(await file.slice(paramStart, paramStart + paramLength).arrayBuffer()), little);
  const str = (name: string) => (typeof params.get(name) === 'string' ? (params.get(name) as string) : '');
  const num = (name: string) => (typeof params.get(name) === 'number' ? (params.get(name) as number) : null);

  const start = num('actual_start_time');
  const solventRaw = str('solvent');
  return {
    key: experimentKey(file),
    fileName: file.name,
    size: file.size,
    lastModified: file.lastModified,
    title,
    dimension,
    nuclei,
    decoupled: str('irr_decoupling') === 'TRUE' && str('irr_domain') ? normalizeNucleus(str('irr_domain')) : null,
    freqMHz,
    solventRaw,
    solvent: detectSolvent(solventRaw),
    experiment: str('experiment').replace(/\.jxp$/i, ''),
    scans: num('scans'),
    temperatureC: num('temp_get'),
    measuredAt: start && start > 0 ? JEOL_EPOCH_MS + start * 1000 : file.lastModified,
    processed: unitBase === UNIT_PPM,
    figure: params.has('nmrfig_info') ? (parseSummary(str('nmrfig_summary')) ?? { layers: 1, nuclei }) : null,
  };
}

function parseParams(view: DataView, little: boolean): Map<string, Param> {
  const out = new Map<string, Param>();
  if (view.byteLength < 16) return out;
  const size = view.getUint32(0, little);
  const high = view.getUint32(8, little);
  const recordSize = size || 64;
  // 1件 64 バイト: [4 予約][2 倍率][10 単位][16 値][4 値の型][28 名前]
  for (let k = 0; k <= high; k++) {
    const base = 16 + k * recordSize;
    if (base + 64 > view.byteLength) break;
    const valueAt = base + 16;
    const type = view.getInt32(base + 32, little);
    let value: Param = null;
    if (type === 0) value = chars(view, valueAt, 16);
    else if (type === 1 || type === 4) value = view.getInt32(valueAt, little);
    else if (type === 2) value = view.getFloat64(valueAt, little);
    const name = chars(view, base + 36, 28).toLowerCase();
    if (name && !out.has(name)) out.set(name, value);
  }
  return out;
}

/** 空白を除いて読む (Delta のパラメーター名と文字列は空白で埋められている) */
function chars(view: DataView, offset: number, length: number) {
  let s = '';
  for (let i = 0; i < length; i++) {
    const c = view.getUint8(offset + i);
    if (c !== 32 && c !== 0) s += String.fromCharCode(c);
  }
  return s;
}

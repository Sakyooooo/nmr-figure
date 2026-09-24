/**
 * このアプリのピーク値・積分を、Delta の .jdf に書き戻す。
 * 元のファイルをそのまま複製して、注釈の場所だけ作り直す (測定データには触らない)。
 *
 * 注釈の形は研究室の .jdf 242 ファイルから読み解いた (docs/SPEC.md)。要点:
 * - レコードは ppm の大きい順のスキップリストでつながる。見出し +52 が先頭、レコード +64 が次 (1 始まり、0 = 終わり)。
 *   段は 1 段だけにする (見出し +20 = 1、+54〜+62 と レコード +66〜+74 は 0)。Delta 自身のファイルにも 1 段のものがある
 * - 同じ ppm の注釈は鎖に 2 つ入れない。Delta も、ピークと中心が同じ積分は鎖から外している (積分の鎖には入れる)
 * - 積分どうしは +154 (古い方) / +152 (新しい方) で双方向につなぎ、見出し +222 に一番新しい積分を入れる
 * - 枠はちょうどの数にする (空き枠なし)。このとき見出しの +120 / +122 は 0 (Delta のファイルで一番多い形)
 * - 書いたあと lib/jdfAnnoteCheck.ts の決まりを全部満たすか確かめ、満たさなければ書かない
 *
 * 以前 (2026-09-19) の版は +64 を通し番号だと思い込み、レコードが自分自身を指す鎖を作っていた。
 * Delta が固まったのはこのため (鎖をたどり終わらない)。
 */
import { tr } from '../i18n';
import type { IntegralBaseline } from '../state/types';
import { checkAnnotationLinks, isIntegralType, isPeakType } from './jdfAnnoteCheck';
import { deltaBaseline, integralArea, integralRange, pointStep } from './integrals';

/** ヘッダの場所 (ビッグエンディアン) */
const AXIS_START = 272;
const AXIS_STOP = 336;
const OFFSET_START = 208;
const OFFSET_STOP = 240;
const DATA_START = 1284;
const ANNOTE_START = 1308;
const ANNOTE_LENGTH = 1316;
const TOTAL_SIZE = 1320;

const HEAD = 352;
const RECORD = 336;
/** Delta のファイルは 64 バイト単位に揃っている */
const ALIGN = 64;

/** これより近い ppm は同じ位置とみなす (データ点の間隔よりずっと小さい) */
const SAME_PPM = 1e-9;
/** 注釈が何もないときの空き枠の数 (Delta が空の注釈を書くときと同じ) */
const EMPTY_SLOTS = 4;
/** レコードの中で、ほかのレコードを指す場所 (スキップリストの各段と、積分どうしの鎖) */
const LINK_OFFSETS = [64, 66, 68, 70, 72, 74, 152, 154];

/** "z8 0102" のような書き方をバイト列に戻す (0 の連続を縮めてある) */
function bytesOf(packed: string): Uint8Array {
  const out: number[] = [];
  for (const part of packed.split(' ')) {
    if (part.startsWith('z')) for (let i = 0; i < Number(part.slice(1)); i++) out.push(0);
    else for (let i = 0; i < part.length; i += 2) out.push(parseInt(part.slice(i, i + 2), 16));
  }
  return new Uint8Array(out);
}

/** Delta が書いたピーク値のレコードから、値とつながりを抜いたもの (残りは表示の設定らしいバイト) */
const PEAK_TEMPLATE = 'z82 02 z4 02 z20 30003912 z12 8b220100 z142 0b0b z42 01 z21';
/** Delta が書いた積分のレコードから、値とつながりを抜いたもの */
const INTEGRAL_TEMPLATE = 'z82 42 z4 12 z182 0b0b z42 01 z21';
/**
 * 注釈の見出し (注釈が無いファイル用)。Delta が空の注釈を書いたときの 0 でないバイト。
 * +224 / +232 / +248 は 1.0 (倍率・基準の値)、+256 は点の間隔の半分 (ファイルごとに書き換える)
 */
const HEAD_TEMPLATE: [number, string][] = [
  [0, '5001'],
  [16, '01'],
  [20, '01'],
  [24, '01'],
  [32, '01'],
  [68, '35f69541'],
  [103, '03'],
  [126, '011a'],
  [230, 'f03f'],
  [238, 'f03f'],
  [254, 'f03f'],
  [320, '03'],
];

function emptyHead(step: number) {
  const out = new Uint8Array(HEAD);
  for (const [at, hex] of HEAD_TEMPLATE) out.set(bytesOf(hex), at);
  new DataView(out.buffer).setFloat64(256, step / 2, true);
  return out;
}

export interface WritableAnnotations {
  /** ピーク値の位置 (ファイルの軸の ppm) */
  peaks: { ppm: number }[];
  /** 積分 (古い順)。baseline が無ければ Delta と同じ決め方で作る */
  integrals: { from: number; to: number; baseline?: IntegralBaseline | null }[];
  /** 値の基準: integrals[index] を value として Delta に出す (無ければ最初の積分 = 1) */
  reference?: { index: number; value: number } | null;
}

export class JdfWriteError extends Error {}

interface Entry {
  kind: 'peak' | 'integral';
  ppm: number;
  slot: number;
}

/**
 * 注釈を書き込んだ .jdf を作る。元の buffer は変えない。
 * 注釈はファイルのほぼ末尾にあり、後ろは 0 埋めだけなので、そこを作り直して長さを書き換える。
 * ピーク値・積分のほかに Delta が付けた注釈 (種類 10 / 72 / 74 など) は、中身をそのまま写して残す。
 * それらのつながり (+64〜+74) は、それらどうしだけを指しているので、枠の番号を付け替えるだけでよい
 * (研究室の 114 ファイルで、ピーク値・積分とは互いに指し合っていないことを確かめた)。
 */
export function writeAnnotations(source: ArrayBuffer, ann: WritableAnnotations): ArrayBuffer {
  const { src, start, oldLength } = checkSource(source);
  const head = new DataView(source);

  const spectrum = readSpectrum(head, source);
  const { data, axis } = spectrum;
  const step = pointStep(axis);

  // ピーク: データ点に寄せ、同じ点のものは 1 つにする
  const peakPoints = new Set<number>();
  const peaks: { ppm: number; k: number }[] = [];
  for (const p of ann.peaks) {
    const k = spectrum.indexOf(p.ppm);
    if (k === null || peakPoints.has(k)) continue;
    peakPoints.add(k);
    peaks.push({ ppm: spectrum.ppmOf(k), k });
  }
  // 積分: 両端をデータ点に寄せる (幅が 0 になるものは書かない)
  const integrals: { from: number; to: number; baseline: IntegralBaseline; raw: number }[] = [];
  ann.integrals.forEach((x) => {
    const a = spectrum.indexOf(x.from);
    const b = spectrum.indexOf(x.to);
    if (a === null || b === null || a === b) return;
    const hi = Math.max(spectrum.ppmOf(a), spectrum.ppmOf(b));
    const lo = Math.min(spectrum.ppmOf(a), spectrum.ppmOf(b));
    const baseline = x.baseline ?? deltaBaseline(data, axis, hi, lo);
    const raw = integralArea(data, axis, hi, lo, true, baseline) / step;
    integrals.push({ from: hi, to: lo, baseline, raw });
  });
  // ピーク値・積分のほかの注釈 (Delta で付けた文字など)
  const others = otherRecords(src, start, oldLength);
  const count = peaks.length + integrals.length + others.length;

  // 値のそろえ方 (Delta の画面の値 = 生の値 × 倍率)
  const refIndex = ann.reference && ann.reference.index < integrals.length ? ann.reference.index : 0;
  const refValue = ann.reference && ann.reference.index < integrals.length ? ann.reference.value : 1;
  const refRaw = integrals[refIndex]?.raw ?? 0;
  const scale = integrals.length && refRaw ? refValue / refRaw : oldScale(src, start, oldLength);

  // 何もないときは、Delta が空の注釈を書くときと同じく空き枠を 4 つ置く
  const slots = count || EMPTY_SLOTS;
  const body = HEAD + slots * RECORD;
  const total = Math.ceil((start + body) / ALIGN) * ALIGN;
  const out = new Uint8Array(total);
  out.set(src.subarray(0, Math.min(start, src.length)));
  const view = new DataView(out.buffer);

  // 見出し: 元のファイルのものを使い、つながりと数だけ直す
  out.set(oldLength >= HEAD ? src.subarray(start, start + HEAD) : emptyHead(step), start);
  view.setUint32(start, RECORD, true);
  view.setUint32(start + 8, slots, true);
  view.setUint32(start + 12, (slots + 1) * RECORD, true);
  view.setUint16(start + 20, 1, true); // スキップリストの段の数
  for (let o = 52; o <= 62; o += 2) view.setUint16(start + o, 0, true);
  view.setUint16(start + 120, 0, true); // 空き枠なし
  view.setUint16(start + 122, 0, true);
  view.setUint16(start + 220, 0, true); // 選ばれている注釈なし
  view.setUint16(start + 222, 0, true);
  if (integrals.length) {
    view.setFloat64(start + 224, scale, true);
    view.setFloat64(start + 248, refValue, true);
  }
  const at = (slot: number) => start + HEAD + slot * RECORD;

  if (!count) {
    // 空き枠の鎖: 見出し +120 が最後の枠、各枠の +0 が 1 つ前の枠 (Delta が書いた空の注釈と同じ)
    view.setUint16(start + 120, EMPTY_SLOTS, true);
    view.setUint16(start + 122, 1, true);
    for (let i = 1; i < EMPTY_SLOTS; i++) view.setUint32(at(i), i, true);
    return finish(out, view, body, total);
  }

  // 枠の並び: ピーク、積分 (古い順)、そのほかの注釈 の順
  const entries: Entry[] = [
    ...peaks.map((p, i) => ({ kind: 'peak' as const, ppm: p.ppm, slot: i })),
    ...integrals.map((x, i) => ({ kind: 'integral' as const, ppm: (x.from + x.to) / 2, slot: peaks.length + i })),
  ];

  const peakBytes = bytesOf(PEAK_TEMPLATE);
  peaks.forEach((p, i) => {
    const o = at(i);
    const height = data[p.k];
    const width = peakWidth(data, p.k, height, step);
    // 面積はローレンツ型とみなして 高さ × 半値全幅 × π/2 (データを足すと隣の線を拾ってしまう)。表示用の値
    const area = (height * (width / step) * Math.PI) / 2;
    out.set(peakBytes, o);
    view.setFloat64(o, p.ppm, true);
    view.setFloat64(o + 88, height, true);
    view.setFloat32(o + 96, width, true);
    view.setFloat64(o + 128, area, true);
    view.setFloat64(o + 136, area * scale, true);
    view.setFloat64(o + 316, area * scale, true);
  });

  const integralBytes = bytesOf(INTEGRAL_TEMPLATE);
  integrals.forEach((x, i) => {
    const slot = peaks.length + i;
    const o = at(slot);
    out.set(integralBytes, o);
    view.setFloat64(o, (x.from + x.to) / 2, true);
    view.setFloat32(o + 96, x.from - x.to, true);
    view.setFloat64(o + 128, x.raw, true);
    view.setFloat64(o + 136, x.raw * scale, true);
    view.setFloat64(o + 144, x.baseline.slope, true);
    view.setFloat64(o + 316, x.raw * scale, true);
    view.setFloat64(o + 328, x.baseline.bias, true);
    // 積分どうしの鎖: +152 = 1 つ新しい積分、+154 = 1 つ古い積分
    if (i + 1 < integrals.length) view.setUint16(o + 152, slot + 2, true);
    if (i > 0) view.setUint16(o + 154, slot, true);
  });
  if (integrals.length) view.setUint16(start + 222, peaks.length + integrals.length, true);

  // そのほかの注釈: 中身をそのまま写し、つながりの番号だけ付け替える
  const firstOther = peaks.length + integrals.length;
  const moved = new Map(others.map((r, i) => [r.slot + 1, firstOther + i + 1]));
  // まれに積分を指していることがある (研究室のデータで 3 件)。書き直したあとも同じ点・同じ範囲のものを指すようにする
  const newSlot = new Map<string, number>();
  peaks.forEach((p, i) => newSlot.set(`p${p.k}`, i + 1));
  integrals.forEach((x, i) => newSlot.set(`i${spectrum.indexOf(x.from)}-${spectrum.indexOf(x.to)}`, peaks.length + i + 1));
  for (const r of mainRecords(src, start, oldLength)) {
    const key = r.peak ? `p${spectrum.indexOf(r.ppm)}` : `i${spectrum.indexOf(r.ppm + r.width / 2)}-${spectrum.indexOf(r.ppm - r.width / 2)}`;
    const to = newSlot.get(key);
    if (to) moved.set(r.slot + 1, to);
  }
  others.forEach((r, i) => {
    const o = at(firstOther + i);
    out.set(r.bytes, o);
    for (const off of LINK_OFFSETS) {
      const v = view.getUint16(o + off, true);
      if (v) view.setUint16(o + off, moved.get(v) ?? 0, true);
    }
  });

  // ppm の大きい順の鎖。同じ ppm は 1 つだけ入れ、ピークを優先する (Delta も同じ ppm の積分は鎖から外している)
  if (entries.length) {
    const sorted = entries.slice().sort((a, b) => b.ppm - a.ppm || a.slot - b.slot);
    const chain: Entry[] = [];
    for (const e of sorted) {
      const last = chain[chain.length - 1];
      if (!last || Math.abs(last.ppm - e.ppm) >= SAME_PPM) chain.push(e);
      else if (e.kind === 'peak' && last.kind === 'integral') chain[chain.length - 1] = e;
    }
    view.setUint16(start + 52, chain[0].slot + 1, true);
    chain.forEach((e, i) => view.setUint16(at(e.slot) + 64, i + 1 < chain.length ? chain[i + 1].slot + 1 : 0, true));
  }
  return finish(out, view, body, total);
}

/** 長さと全体の大きさを書き、Delta の決まりを満たすか確かめる */
function finish(out: Uint8Array<ArrayBuffer>, view: DataView, body: number, total: number) {
  view.setUint32(ANNOTE_LENGTH, body, false);
  view.setBigUint64(TOTAL_SIZE, BigInt(total), false);
  const problems = checkAnnotationLinks(out.buffer);
  if (problems.length) throw new JdfWriteError(tr('Delta の形になっていないので書きませんでした ({v0})', { v0: problems[0] }));
  return out.buffer;
}

/** 書き換えてよいファイルか確かめ、注釈の場所を返す */
function checkSource(source: ArrayBuffer) {
  const src = new Uint8Array(source);
  const head = new DataView(source);
  if (src.length < TOTAL_SIZE + 8 || new TextDecoder().decode(src.subarray(0, 8)) !== 'JEOL.NMR') {
    throw new JdfWriteError(tr('JEOL Delta のファイルではありません'));
  }
  if (src[12] !== 1) throw new JdfWriteError(tr('1D のスペクトルにだけ書き戻せます'));
  // 軸の単位 (26 = ppm)。FID (秒) には ppm の注釈を書いても意味がない
  if (src[33] !== 26) throw new JdfWriteError(tr('Delta で処理済みのスペクトル (ppm の軸) にだけ書き戻せます'));
  const start = Number(head.getBigUint64(ANNOTE_START, false));
  const oldLength = head.getUint32(ANNOTE_LENGTH, false);
  if (!start || start > src.length) throw new JdfWriteError(tr('注釈の場所が分かりません'));
  // 注釈のうしろに中身がないことを確かめる (0 埋めだけのはず)
  for (let i = start + oldLength; i < src.length; i++) {
    if (src[i] !== 0) throw new JdfWriteError(tr('注釈のうしろに読めない部分があるので、書き換えをやめました'));
  }
  return { src, start, oldLength };
}

/** ピーク値・積分のほかの注釈のレコード (枠の番号と中身) */
function otherRecords(src: Uint8Array, start: number, length: number) {
  if (length < HEAD + RECORD) return [];
  const slots = Math.floor((length - HEAD) / RECORD);
  const out: { slot: number; bytes: Uint8Array }[] = [];
  for (let i = 0; i < slots; i++) {
    const o = start + HEAD + i * RECORD;
    const type = src[o + 82];
    if (type && !isPeakType(type) && !isIntegralType(type)) out.push({ slot: i, bytes: src.slice(o, o + RECORD) });
  }
  return out;
}

/** 元のファイルのピーク値・積分のレコード (枠の番号と位置) */
function mainRecords(src: Uint8Array, start: number, length: number) {
  if (length < HEAD + RECORD) return [];
  const v = new DataView(src.buffer, src.byteOffset, src.byteLength);
  const slots = Math.floor((length - HEAD) / RECORD);
  const out: { slot: number; peak: boolean; ppm: number; width: number }[] = [];
  for (let i = 0; i < slots; i++) {
    const o = start + HEAD + i * RECORD;
    const type = src[o + 82];
    if (!isPeakType(type) && !isIntegralType(type)) continue;
    out.push({ slot: i, peak: isPeakType(type), ppm: v.getFloat64(o, true), width: Math.abs(v.getFloat32(o + 96, true)) });
  }
  return out;
}

/** ファイルの注釈の場所をそのまま取り出す (記録に残して、あとでそのまま戻すため) */
export function annotationBlock(source: ArrayBuffer): Uint8Array | null {
  const v = new DataView(source);
  if (source.byteLength < TOTAL_SIZE + 8) return null;
  const start = Number(v.getBigUint64(ANNOTE_START, false));
  const length = v.getUint32(ANNOTE_LENGTH, false);
  if (!start || start + length > source.byteLength) return null;
  return new Uint8Array(source.slice(start, start + length));
}

/** 記録しておいた注釈の場所を、今のファイルにそのまま戻す (Delta が書いたものをそのまま戻すので、ほかの注釈も戻る) */
export function withAnnotationBlock(source: ArrayBuffer, block: Uint8Array): ArrayBuffer {
  const { src, start } = checkSource(source);
  const total = Math.ceil((start + block.length) / ALIGN) * ALIGN;
  const out = new Uint8Array(total);
  out.set(src.subarray(0, start));
  out.set(block, start);
  return finish(out, new DataView(out.buffer), block.length, total);
}

/** 元のファイルの積分の倍率 (無ければ 1) */
function oldScale(src: Uint8Array, start: number, length: number) {
  if (length < HEAD) return 1;
  const s = new DataView(src.buffer, src.byteOffset).getFloat64(start + 224, true);
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** 有効点 (dataOffsetStart〜Stop) の強度と、その軸 */
function readSpectrum(head: DataView, buffer: ArrayBuffer) {
  const first = head.getFloat64(AXIS_START, false);
  const last = head.getFloat64(AXIS_STOP, false);
  const offset = head.getUint32(OFFSET_START, false);
  const points = head.getUint32(OFFSET_STOP, false) - offset + 1;
  if (!Number.isFinite(first) || !Number.isFinite(last) || points < 2 || first === last) {
    throw new JdfWriteError(tr('ファイルの軸が読めません'));
  }
  const float32 = head.getUint8(14) >> 6 === 1;
  const little = head.getUint8(8) === 1;
  const size = float32 ? 4 : 8;
  const dataStart = head.getUint32(DATA_START, false);
  if (dataStart + (offset + points) * size > buffer.byteLength) throw new JdfWriteError(tr('測定データが途中で切れています'));
  const v = new DataView(buffer);
  const data = new Float32Array(points);
  for (let k = 0; k < points; k++) {
    const o = dataStart + (offset + k) * size;
    data[k] = float32 ? v.getFloat32(o, little) : v.getFloat64(o, little);
  }
  const axis = { first, last, n: points, refOffset: 0 };
  return {
    data,
    axis,
    /** ppm に一番近いデータ点 (範囲の外は null) */
    indexOf(ppm: number): number | null {
      const k = Math.round(((ppm - first) / (last - first)) * (points - 1));
      return k >= 0 && k < points ? k : null;
    },
    ppmOf: (k: number) => first + ((last - first) * k) / (points - 1),
  };
}

/**
 * ピークの線幅 (半値全幅、ppm)。
 * 半分の高さまで下がるか、谷 (隣の線との境) に着いたら止める。
 */
function peakWidth(data: Float32Array, k: number, height: number, step: number) {
  const half = height / 2;
  const limit = 200;
  const walk = (dir: number) => {
    let last = height;
    for (let i = 1; i <= limit; i++) {
      const v = data[k + dir * i];
      if (v === undefined) return i;
      // 半分の高さを跨いだ所は、点と点の間で按分する
      if (v <= half) return i - 1 + (last === v ? 0.5 : (last - half) / (last - v));
      if (v > last) return i - 1; // 谷を越えて隣の線に入った
      last = v;
    }
    return limit;
  };
  return Math.max(step, (walk(-1) + walk(1)) * step);
}

/** 積分の両端が、そのファイルのデータ点に乗っているか (テスト用) */
export function integralPoints(source: ArrayBuffer, from: number, to: number) {
  const head = new DataView(source);
  const { axis } = readSpectrum(head, source);
  return integralRange(axis, from, to);
}

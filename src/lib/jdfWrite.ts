/**
 * このアプリのピーク値・積分を、Delta の .jdf に書き戻す。
 * 元のファイルをそのまま複製して、注釈の場所だけ作り直す (測定データには触らない)。
 * 形は lib/jdfAnnotations.ts の読み取りと同じ。埋め込んである「型」は Delta が実際に書いた
 * レコードから取ったもので、意味の分からないバイト (色・フォントなど) をそのまま使うためにある。
 */

/** 軸の情報の場所 (ビッグエンディアン) */
const AXIS_START = 272;
const AXIS_STOP = 336;
const OFFSET_START = 208;
const OFFSET_STOP = 240;
const DATA_START = 1284;

const HEAD = 352;
const RECORD = 336;
const ANNOTE_START = 1308;
const ANNOTE_LENGTH = 1316;
const TOTAL_SIZE = 1320;
/** Delta のファイルは 64 バイト単位に揃っている */
const ALIGN = 64;

/** "z8 0102" のような書き方をバイト列に戻す (0 の連続を縮めてある) */
function bytesOf(packed: string): Uint8Array {
  const out: number[] = [];
  for (const part of packed.split(' ')) {
    if (part.startsWith('z')) for (let i = 0; i < Number(part.slice(1)); i++) out.push(0);
    else for (let i = 0; i < part.length; i += 2) out.push(parseInt(part.slice(i, i + 2), 16));
  }
  return new Uint8Array(out);
}

/** Delta が書いたピーク値のレコード (値の所は 0 にしてある) */
const PEAK_TEMPLATE = 'z82 02 z4 02 z8 da23053c z8 30 z1 3912 z12 8b2201 z1 7bc0d35dcd6e3340924071c2be404540 z126 0b0b z42 01 z1 924071c2be404540 z4 115cc4f2651c43bf';
/** Delta が書いた積分のレコード */
const INTEGRAL_TEMPLATE = 'z82 42 z4 12 z56 4119d050624ea23f02 z117 0b0b z42 01 z13 ec821730233c913f';
/** 注釈の見出し (注釈がまだ無いファイルに書くときに使う) */
const HEAD_TEMPLATE = '5001 z14 01 z3 03 z3 01 z7 01 z19 01 z1 03 z1 03 z11 36f69541 z31 03 z16 0d z1 0d z3 011a z94 06 z1 6374dd40a27f0140 z6 f03f z14 224003f7d3bbc6be423f z56 03 z31';

export interface WritableAnnotations {
  peaks: { ppm: number; height: number }[];
  /** value は Delta と同じ出し方の面積 (両端の直線を引いた強度の和。点の間隔は掛けない) */
  integrals: { from: number; to: number; value: number }[];
}

export class JdfWriteError extends Error {}

/**
 * 注釈を書き込んだ .jdf を作る。元の buffer は変えない。
 * 注釈はファイルのほぼ末尾にあり、後ろは 0 埋めだけなので、そこを作り直して長さを書き換える。
 */
export function writeAnnotations(source: ArrayBuffer, ann: WritableAnnotations): ArrayBuffer {
  const src = new Uint8Array(source);
  const head = new DataView(source);
  if (src.length < TOTAL_SIZE + 8) throw new JdfWriteError('JEOL Delta のファイルではありません');
  const start = Number(head.getBigUint64(ANNOTE_START, false));
  const oldLength = head.getUint32(ANNOTE_LENGTH, false);
  if (!start || start > src.length) throw new JdfWriteError('注釈の場所が分かりません');
  // 注釈のうしろに中身がないことを確かめる (0 埋めだけのはず)
  for (let i = start + oldLength; i < src.length; i++) {
    if (src[i] !== 0) throw new JdfWriteError('注釈のうしろに読めない部分があるので、書き換えをやめました');
  }

  // Delta はピークも積分の両端も、必ずデータ点の位置に合わせて書いている。
  // ずれた ppm を書くと Delta が固まるので、同じようにデータ点へ寄せる。
  const snap = pointSnapper(head);
  const axis = readAxis(head);
  const value = spectrumReader(head, source);

  const count = ann.peaks.length + ann.integrals.length;
  // 元のファイルの枠数はできるだけ変えない (Delta も空き枠を 0 で埋めたまま残す)
  const oldSlots = oldLength >= HEAD ? Math.floor((oldLength - HEAD) / RECORD) : 0;
  const slots = Math.max(count, oldSlots);
  const body = HEAD + slots * RECORD;
  const total = Math.ceil((start + body) / ALIGN) * ALIGN;
  const out = new Uint8Array(total);
  out.set(src.subarray(0, Math.min(start, src.length)));
  const view = new DataView(out.buffer);

  // 見出し: 元のファイルのものを使い、分かっている所だけ直す
  // (Delta で積分を 2 つ引いたファイルと、引く前のファイルを見比べて決めた)
  const header = oldLength >= HEAD ? src.subarray(start, start + HEAD) : bytesOf(HEAD_TEMPLATE);
  out.set(header, start);
  const before = new DataView(source);
  view.setUint32(start, RECORD, true);
  view.setUint32(start + 8, slots, true);
  view.setUint32(start + 12, (slots + 1) * RECORD, true);
  // +122 は通し番号の続き (注釈を足すたびに増える)
  const nextId = oldLength >= HEAD ? before.getUint16(start + 122, true) : 1;
  view.setUint16(start + 122, Math.min(0xffff, nextId + count), true);
  // +52 と +222 は積分の数
  view.setUint16(start + 52, ann.integrals.length, true);
  view.setUint16(start + 222, ann.integrals.length, true);

  const peak = bytesOf(PEAK_TEMPLATE);
  const integral = bytesOf(INTEGRAL_TEMPLATE);
  let at = start + HEAD;
  let id = nextId;
  for (const p of ann.peaks) {
    const ppm = snap(p.ppm);
    const k = axis.indexOf(ppm);
    const height = value(k) ?? p.height;
    // Delta はピークの線幅 (+96) と面積 (+128) も書いている。データから出す
    const width = peakWidth(value, k, height, axis.step);
    // 面積はローレンツ型とみなして 高さ × 半値全幅 × π/2 (データを足すと隣の線を拾ってしまう)
    const area = (height * (width / axis.step) * Math.PI) / 2;
    out.set(peak, at);
    view.setFloat64(at, ppm, true);
    view.setUint32(at + 64, id++, true);
    view.setFloat64(at + 88, height, true);
    view.setFloat32(at + 96, width, true);
    view.setFloat64(at + 128, area, true);
    view.setFloat64(at + 136, area, true);
    view.setFloat64(at + 316, area, true);
    view.setFloat64(at + 328, 0, true); // 高さの基準 (Delta はベースラインの値を入れる)
    at += RECORD;
  }
  for (const x of ann.integrals) {
    const from = snap(Math.max(x.from, x.to));
    const to = snap(Math.min(x.from, x.to));
    // Delta は範囲の両端の値から、傾き (+144) と高さ (+328) も書いている
    const a = value(axis.indexOf(from)) ?? 0;
    const b = value(axis.indexOf(to)) ?? 0;
    out.set(integral, at);
    view.setFloat64(at, (from + to) / 2, true);
    view.setUint32(at + 64, id++, true);
    view.setFloat32(at + 96, from - to, true);
    view.setFloat64(at + 128, x.value, true);
    view.setFloat64(at + 136, x.value, true);
    view.setFloat64(at + 144, a - b, true);
    view.setFloat64(at + 316, x.value, true);
    view.setFloat64(at + 328, (a + b) / 2, true);
    at += RECORD;
  }

  view.setUint32(ANNOTE_LENGTH, body, false);
  view.setBigUint64(TOTAL_SIZE, BigInt(total), false);
  return out.buffer;
}

/** ppm を、そのファイルのデータ点の位置に寄せる関数を作る */
function pointSnapper(head: DataView) {
  const first = head.getFloat64(AXIS_START, false);
  const last = head.getFloat64(AXIS_STOP, false);
  const points = head.getUint32(OFFSET_STOP, false) - head.getUint32(OFFSET_START, false) + 1;
  if (!Number.isFinite(first) || !Number.isFinite(last) || points < 2 || first === last) return (ppm: number) => ppm;
  return (ppm: number) => {
    const k = Math.round(((ppm - first) / (last - first)) * (points - 1));
    const clamped = Math.min(points - 1, Math.max(0, k));
    return first + ((last - first) * clamped) / (points - 1);
  };
}

/** 軸 (有効点の範囲) を読む */
function readAxis(head: DataView) {
  const first = head.getFloat64(AXIS_START, false);
  const last = head.getFloat64(AXIS_STOP, false);
  const points = head.getUint32(OFFSET_STOP, false) - head.getUint32(OFFSET_START, false) + 1;
  const step = points > 1 ? Math.abs(last - first) / (points - 1) : 1;
  return {
    points,
    step,
    indexOf: (ppm: number) => Math.min(points - 1, Math.max(0, Math.round(((ppm - first) / (last - first)) * (points - 1)))),
  };
}

/** 有効点 k の強度を返す (範囲の外は null) */
function spectrumReader(head: DataView, buffer: ArrayBuffer): (k: number) => number | null {
  const float32 = (head.getUint8(14) >> 6) === 1;
  const little = head.getUint8(8) === 1;
  const dataStart = head.getUint32(DATA_START, false);
  const offset = head.getUint32(OFFSET_START, false);
  const points = head.getUint32(OFFSET_STOP, false) - offset + 1;
  const size = float32 ? 4 : 8;
  const v = new DataView(buffer);
  return (k: number) => {
    if (k < 0 || k >= points) return null;
    const at = dataStart + (offset + k) * size;
    if (at + size > buffer.byteLength) return null;
    return float32 ? v.getFloat32(at, little) : v.getFloat64(at, little);
  };
}

/**
 * ピークの線幅 (半値全幅、ppm)。
 * 半分の高さまで下がるか、谷 (隣の線との境) に着いたら止める。
 */
function peakWidth(value: (k: number) => number | null, k: number, height: number, step: number) {
  const half = height / 2;
  const limit = 200;
  const walk = (dir: number) => {
    let last = height;
    for (let i = 1; i <= limit; i++) {
      const v = value(k + dir * i);
      if (v === null) return i;
      // 半分の高さを跨いだ所は、点と点の間で按分する
      if (v <= half) return i - 1 + (last === v ? 0.5 : (last - half) / (last - v));
      if (v > last) return i - 1; // 谷を越えて隣の線に入った
      last = v;
    }
    return limit;
  };
  return Math.max(step, (walk(-1) + walk(1)) * step);
}

/**
 * TopSpin の積分・ピーク値を読み書きする (Bruker の処理した版の pdata/処理番号/ にあるファイル)。
 *
 * intrng (積分の範囲)。研究室の TopSpin 3.6 のファイルから読み解いた形:
 *   A 1.0 #regions in PPM
 *   # low field   high field  bias        slope
 *     7.944002789055964  7.606561759335741  -0.0  -0.0  # for region 1
 *   bias・slope はベースライン: 範囲の j 点目 (低磁場の端が 0) から bias + slope × j を引く (1r の整数の単位)。
 *   古い形 (見出しが「P 0」、範囲の 2 列だけ) もある
 * 積分の値 = (範囲の 1r の整数の和 − ベースライン) × procs の INTSCL。範囲の点は、両端をそれぞれ一番近い点にして、高磁場の端の点は足さない
 * (lib/integrals.ts の integralRange)。研究室の積分 901 件で integrals.txt と 0.01% 以内で合った (893 件)。
 * TopSpin で「この積分を 3 にする」と入れると INTSCL が変わる (ほかの積分も同じ倍率)
 *
 * peaklist.xml (ピークの一覧): <Peak1D F1="ppm" intensity="…" type="0"/> が並ぶ。intensity は TopSpin の画面の目盛り
 * (一番高い山がほぼ 15)。このアプリは ppm だけ使う
 *
 * TopSpin への書き戻し (Delta との同期と同じ仕組み。state/deltaSync.ts) では、intrng・peaklist.xml を書き換え、
 * procs は INTSCL の行だけを書き換える (処理のパラメーターには触らない)
 */
import type { DeltaAnnotations, IntegralBaseline, SpectrumMeta } from '../state/types';
import type { BrukerPath } from './bruker';
import { deltaBaseline, integralRange } from './integrals';
import type { WritableAnnotations } from './jdfWrite';

type Axis = Pick<SpectrumMeta, 'first' | 'last' | 'n' | 'refOffset' | 'vendor'>;

/** TopSpin の積分・ピーク値のファイル (無いものは null) */
export interface TopspinFiles {
  intrng: string | null;
  peaklist: string | null;
  /** procs の INTSCL (積分の倍率)。無ければ 1 */
  intscl: number | null;
  /** procs の NC_proc。1r の整数 × 2^NC_proc がこのアプリのデータ */
  nc: number;
}

/** TopSpin の単位のベースライン (1r の整数。j は範囲の低磁場の端からの点の番号) */
interface Region {
  from: number;
  to: number;
  bias: number;
  slope: number;
}

export function parseIntrng(text: string | null): Region[] {
  if (!text) return [];
  const out: Region[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(1)) {
    const body = line.split('#')[0].trim();
    if (!body) continue;
    const v = body.split(/\s+/).map(Number);
    if (v.length < 2 || !Number.isFinite(v[0]) || !Number.isFinite(v[1]) || v[0] === v[1]) continue;
    out.push({ from: Math.max(v[0], v[1]), to: Math.min(v[0], v[1]), bias: Number.isFinite(v[2]) ? v[2] : 0, slope: Number.isFinite(v[3]) ? v[3] : 0 });
  }
  return out;
}

/** peaklist.xml の 1D のピーク (ppm と intensity) */
export function parsePeaklist(xml: string | null): { ppm: number; intensity: number }[] {
  if (!xml) return [];
  const out: { ppm: number; intensity: number }[] = [];
  for (const m of xml.matchAll(/<Peak1D\b([^>]*)\/?>/g)) {
    const attr = (name: string) => new RegExp(`\\b${name}="([^"]*)"`).exec(m[1])?.[1];
    const ppm = Number(attr('F1'));
    if (Number.isFinite(ppm)) out.push({ ppm, intensity: Number(attr('intensity')) || 0 });
  }
  return out;
}

/** 範囲の点 (このアプリの積分と同じ点。両端を含む) について、TopSpin の単位の和 − ベースライン */
function rawSum(data: Float32Array, meta: Axis, r: Region, nc: number) {
  const [i0, i1] = integralRange(meta, r.from, r.to);
  const unit = 2 ** nc;
  let sum = 0;
  for (let i = i0; i <= i1; i++) sum += data[i] / unit - r.bias - r.slope * (i - i0);
  return sum;
}

/** TopSpin のベースライン → このアプリのベースライン (高さ = bias + slope × (ppm − 範囲の中心)、データの単位) */
function toApp(meta: Axis, r: Region, nc: number): IntegralBaseline {
  const [i0, i1] = integralRange(meta, r.from, r.to);
  const unit = 2 ** nc;
  // 点の番号が 1 増えると ppm は s 変わる (符号つき)。高さ = bias + slope × j を ppm の式に直す
  const s = indexStep(meta);
  return { bias: (r.bias + (r.slope * (i1 - i0)) / 2) * unit, slope: (r.slope / s) * unit };
}

/** このアプリのベースライン → TopSpin の bias・slope */
function toTopspin(meta: Axis, from: number, to: number, b: IntegralBaseline, nc: number): { bias: number; slope: number } {
  const [i0, i1] = integralRange(meta, from, to);
  const unit = 2 ** nc;
  const s = indexStep(meta);
  return { bias: (b.bias - (b.slope * s * (i1 - i0)) / 2) / unit, slope: (b.slope * s) / unit };
}

/** 点の番号が 1 増えたときの ppm の変わり (符号つき) */
function indexStep(meta: Axis) {
  return (meta.last - meta.first) / (meta.n - 1);
}

/**
 * TopSpin の積分・ピーク値を、Delta の注釈と同じ形で読む (取り込み・同期に使う)。
 * shown は TopSpin の画面の値。TopSpin で値を入れた積分 (整数に 0.1% 以内で合うもの。一番近いもの) を基準にする
 * (研究室の TopSpin の積分で、値を入れた積分は 201 件とも見つかった)
 */
export function topspinAnnotations(files: TopspinFiles, data: Float32Array, meta: Axis): DeltaAnnotations {
  const intscl = files.intscl && Number.isFinite(files.intscl) ? files.intscl : 1;
  const integrals = parseIntrng(files.intrng).map((r) => {
    const value = rawSum(data, meta, r, files.nc);
    return { from: r.from, to: r.to, value, shown: value * intscl, baseline: toApp(meta, r, files.nc) };
  });
  let reference: number | null = null;
  let best = 0.001;
  for (const x of integrals) {
    const round = Math.round(x.shown);
    if (round < 1 || round > 1000) continue;
    const off = Math.abs(x.shown - round) / round;
    if (off <= best) {
      best = off;
      reference = round;
    }
  }
  // 基準にした積分は、TopSpin の画面と同じちょうどの値にしておく (lib/jdfAnnotations.ts の deltaReference が見つけられるように)
  if (reference !== null) {
    const at = integrals.findIndex((x) => Math.abs(x.shown - reference!) / reference! <= best + 1e-12);
    if (at >= 0) integrals[at].shown = reference;
  }
  const peaks = parsePeaklist(files.peaklist).map((p) => ({ ppm: p.ppm, height: valueAt(data, meta, p.ppm) }));
  peaks.sort((a, b) => b.ppm - a.ppm);
  integrals.sort((a, b) => b.from - a.from);
  return { peaks, integrals, reference, others: 0 };
}

function valueAt(data: Float32Array, meta: Axis, ppm: number) {
  const i = Math.round((ppm - meta.first) / indexStep(meta));
  return data[Math.max(0, Math.min(data.length - 1, i))] ?? 0;
}

/** 書き戻すファイルの中身。null のファイルは書かない (元から無く、書くものも無い) */
export function writeTopspin(files: TopspinFiles, ann: WritableAnnotations, data: Float32Array, meta: Axis, path: BrukerPath, now = new Date()): TopspinFiles {
  const regions = ann.integrals.map((x) => {
    const from = Math.max(x.from, x.to);
    const to = Math.min(x.from, x.to);
    // ベースラインが決まっていない積分は、このアプリ (Delta と同じ決め方) と同じものを TopSpin にも書く
    const b = x.baseline ?? deltaBaseline(data, meta, from, to);
    return { from, to, ...toTopspin(meta, from, to, b, files.nc) };
  });
  let intrng = files.intrng;
  let intscl = files.intscl;
  if (regions.length || files.intrng !== null) {
    const lines = ['A 1.0 #regions in PPM', '# low field   high field  bias        slope'];
    regions.forEach((r, k) => lines.push(`  ${num(r.from)}  ${num(r.to)}  ${num(r.bias)}  ${num(r.slope)}  # for region ${k + 1}`));
    intrng = lines.join('\n') + '\n';
  }
  if (regions.length) {
    // 基準の積分が、このアプリと同じ値で TopSpin に出るように INTSCL を決める (基準が無ければ最初の積分 = 1)
    const index = ann.reference && ann.reference.index < regions.length ? ann.reference.index : 0;
    const value = ann.reference && ann.reference.index < regions.length ? ann.reference.value : 1;
    const raw = rawSum(data, meta, regions[index], files.nc);
    if (raw > 0 && Number.isFinite(value / raw)) intscl = value / raw;
  }
  let peaklist = files.peaklist;
  if (ann.peaks.length || files.peaklist !== null) peaklist = peaklistXml(files, ann.peaks, data, meta, path, now);
  return { ...files, intrng, intscl, peaklist };
}

/** peaklist.xml を作る。見出し (ピークを拾ったときの条件など) は元のファイルのものを残す */
function peaklistXml(files: TopspinFiles, peaks: { ppm: number }[], data: Float32Array, meta: Axis, path: BrukerPath, now: Date) {
  const stamp = localStamp(now);
  const unit = 2 ** files.nc;
  // intensity は TopSpin の画面の目盛り。元のピークがあればその倍率、なければ一番高い山を 15 にする
  const old = parsePeaklist(files.peaklist)
    .map((p) => p.intensity / (valueAt(data, meta, p.ppm) / unit))
    .filter((r) => Number.isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, data[i] / unit);
  const ratio = old.length ? old[Math.floor(old.length / 2)] : max > 0 ? 15 / max : 1;
  const head =
    /<PeakList1DHeader\b[\s\S]*?<\/PeakList1DHeader>/.exec(files.peaklist ?? '')?.[0] ??
    `<PeakList1DHeader creator="NMR Figure Editor" date="${stamp}" expNo="${xmlAttr(path.expno)}" name="${xmlAttr(path.name)}" owner="" procNo="${xmlAttr(path.procno ?? '1')}" source="">\n      <PeakPickDetails></PeakPickDetails>\n    </PeakList1DHeader>`;
  const rows = [...peaks]
    .sort((a, b) => b.ppm - a.ppm)
    .map((p) => `    <Peak1D F1="${p.ppm.toFixed(6)}" intensity="${Number(((valueAt(data, meta, p.ppm) / unit) * ratio).toPrecision(7))}" type="0"/>`);
  return ['<?xml version="1.0" encoding="UTF-8"?>', `<PeakList modified="${stamp}">`, '  <PeakList1D>', `    ${head}`, ...rows, '  </PeakList1D>', '</PeakList>', ''].join('\n');
}

/** procs の INTSCL の行だけを書き換える (ほかの行はそのまま) */
export function withIntscl(procs: string, intscl: number): string {
  const line = `##$INTSCL= ${topspinNumber(intscl)}`;
  if (/^##\$INTSCL=.*$/m.test(procs)) return procs.replace(/^##\$INTSCL=.*?(\r?)$/m, `${line}$1`);
  // 無ければ ##END の前に足す
  const eol = procs.includes('\r\n') ? '\r\n' : '\n';
  return /^##END=/m.test(procs) ? procs.replace(/^##END=/m, `${line}${eol}##END=`) : procs + line + eol;
}

/**
 * procs の数の書き方を TopSpin (Windows) に合わせる: 有効数字 15 桁、整数は「1」、指数は 3 桁 (9.31914454895093e-011)。
 * 書く前の中身に戻したとき、元のファイルと同じ文字になる
 */
function topspinNumber(v: number) {
  return String(Number(v.toPrecision(15))).replace(/e([+-])(\d+)$/, (_, sign: string, d: string) => `e${sign}${d.padStart(3, '0')}`);
}

/** 小数を TopSpin のファイルと同じく、丸めずに書く */
function num(v: number) {
  return Object.is(v, -0) ? '-0.0' : Number.isInteger(v) ? v.toFixed(1) : String(v);
}

function xmlAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** TopSpin の書き方の時刻 (例: 2025-04-10T15:50:43。この PC の時刻) */
function localStamp(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// ---------------------------------------------------------------- 同期で使う「ファイル」

/**
 * Delta との同期 (state/deltaSync.ts) は 1 つのファイルの中身 (バイト列) を読み書きする。
 * TopSpin では、積分・ピーク値・INTSCL をまとめた中身をこの形にして同じ仕組みに載せる (state/bruker.ts の仮のファイル)
 */
export interface TopspinBundle extends TopspinFiles {
  path: BrukerPath;
  /** スペクトルの印 (1r の更新時刻・大きさと、procs の軸)。変わっていたら TopSpin で処理し直した */
  spectrum: string;
}

const MAGIC = 'NMRFIG-TOPSPIN\n';

export function encodeBundle(b: TopspinBundle): ArrayBuffer {
  return new TextEncoder().encode(MAGIC + JSON.stringify(b)).buffer as ArrayBuffer;
}

export function isBundle(bytes: ArrayBuffer) {
  if (bytes.byteLength < MAGIC.length) return false;
  return new TextDecoder().decode(new Uint8Array(bytes, 0, MAGIC.length)) === MAGIC;
}

export function decodeBundle(bytes: ArrayBuffer): TopspinBundle | null {
  if (!isBundle(bytes)) return null;
  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, MAGIC.length))) as TopspinBundle;
  } catch {
    return null;
  }
}

/** 同期の形 (図の軸の ppm。積分は TopSpin に入っている順、基準は TopSpin で値を入れた積分) */
export function bundleAnnotations(b: TopspinFiles, data: Float32Array, meta: Axis): WritableAnnotations {
  const ann = topspinAnnotations(b, data, meta);
  const index = ann.reference !== null ? ann.integrals.findIndex((x) => x.shown === ann.reference) : -1;
  const first = ann.integrals[0];
  return {
    peaks: ann.peaks.map((p) => ({ ppm: p.ppm })),
    integrals: ann.integrals.map((x) => ({ from: x.from, to: x.to, baseline: x.baseline ?? null })),
    reference:
      index >= 0 ? { index, value: ann.reference! } : first && Number.isFinite(first.shown) && first.shown !== 0 ? { index: 0, value: first.shown! } : null,
  };
}

/** 記録に残す「TopSpin が書いた中身」(戻すときはそのまま書く) */
export function bundleBlock(b: TopspinBundle): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ intrng: b.intrng, peaklist: b.peaklist, intscl: b.intscl }));
}

export function withBundleBlock(bytes: ArrayBuffer, block: Uint8Array): ArrayBuffer {
  const b = decodeBundle(bytes);
  if (!b) return bytes;
  try {
    const part = JSON.parse(new TextDecoder().decode(block)) as Pick<TopspinFiles, 'intrng' | 'peaklist' | 'intscl'>;
    return encodeBundle({ ...b, intrng: part.intrng ?? null, peaklist: part.peaklist ?? null, intscl: part.intscl ?? b.intscl });
  } catch {
    return bytes;
  }
}

/** 図の注釈を書いた中身 */
export function writeBundle(bytes: ArrayBuffer, ann: WritableAnnotations, data: Float32Array, meta: Axis): ArrayBuffer {
  const b = decodeBundle(bytes);
  if (!b) throw new Error('TopSpin bundle expected');
  return encodeBundle({ ...b, ...writeTopspin(b, ann, data, meta, b.path) });
}


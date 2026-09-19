/**
 * 論文の SI に書かれている NMR データの文を読み取る。
 * 例: ^1H NMR (400 MHz, CDCl3) δ 7.30 (d, J = 8.0 Hz, 2H), 3.45–3.38 (m, 2H), 1.25 (t, J = 7.1 Hz, 3H).
 * 生データがない文献のスペクトルを、線にして自分の測定と重ねるために使う。
 */
import { normalizeNucleus } from './nuclei';

export interface ParsedSignal {
  /** 中心の ppm */
  delta: number;
  /** m で範囲が書いてあるとき [高, 低] */
  range: [number, number] | null;
  /** s, d, dd, t, q, sept, m, br s … (書いていなければ '') */
  mult: string;
  /** 結合定数 (Hz) */
  J: number[];
  /** 水素の数 (13C などで書いていなければ null) */
  nH: number | null;
}

export interface ParsedSi {
  nucleus: string;
  freqMHz: number | null;
  solvent: string;
  signals: ParsedSignal[];
  /** 読めなかった部分 (画面で知らせる) */
  skipped: string[];
}

/** 上付き文字や全角を、ふつうの文字に直す */
function normalize(text: string) {
  const sup: Record<string, string> = { '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁰': '0' };
  const sub: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
  return text
    .replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/g, (c) => sup[c] ?? c)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => sub[c] ?? c)
    .replace(/[–—−]/g, '-')
    .replace(/[（）]/g, (c) => (c === '（' ? '(' : ')'))
    .replace(/\s+/g, ' ')
    .trim();
}

/** 多重度として認めるもの */
const MULT = /^(br\.?\s*s|broad\s*s|s|d|t|q|quint|quin|sext|sept|hept|non|m|dd|ddd|dddd|dt|ddt|dq|td|tt|tdd|qd|qt|ABq|AB)$/i;

/**
 * SI の 1行を読む。読めた信号と、読めなかった部分を返す。
 * 「δ」のあとを括弧の対応で切り分ける (括弧の中にカンマがあるため)
 */
export function parseSi(text: string): ParsedSi {
  const src = normalize(text);
  const head = /(\d+)\s*H?\s*NMR|NMR/i;
  const nucleusMatch = /(\d+\s*[A-Za-z]{1,2})\s*(?:\{[^}]*\})?\s*NMR/.exec(src);
  const nucleus = nucleusMatch ? normalizeNucleus(nucleusMatch[1].replace(/\s+/g, '')) : '1H';
  const freqMatch = /(\d+(?:\.\d+)?)\s*MHz/i.exec(src);
  const solventMatch = /MHz\s*,\s*([^)]+)\)/i.exec(src);
  const deltaAt = src.search(/δ|delta\s*=?/i);
  const body = deltaAt >= 0 ? src.slice(deltaAt).replace(/^(δ|delta\s*=?)\s*/i, '') : head.test(src) ? '' : src;

  const signals: ParsedSignal[] = [];
  const skipped: string[] = [];
  for (const part of splitSignals(body)) {
    const signal = parseSignal(part);
    if (signal) signals.push(signal);
    else if (part.trim()) skipped.push(part.trim());
  }
  return {
    nucleus,
    freqMHz: freqMatch ? Number(freqMatch[1]) : null,
    solvent: solventMatch ? solventMatch[1].trim() : '',
    signals,
    skipped,
  };
}

/** 括弧の外のカンマで切る */
function splitSignals(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of body.replace(/\.\s*$/, '')) {
    if (c === '(') depth++;
    if (c === ')') depth = Math.max(0, depth - 1);
    if (c === ',' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += c;
  }
  if (current.trim()) out.push(current);
  return out;
}

/** 1つの信号 "7.30 (d, J = 8.0 Hz, 2H)" / "150.2" を読む */
export function parseSignal(part: string): ParsedSignal | null {
  const text = part.trim();
  if (!text) return null;
  const headMatch = /^(-?\d+(?:\.\d+)?)\s*(?:-\s*(-?\d+(?:\.\d+)?))?/.exec(text);
  if (!headMatch) return null;
  const a = Number(headMatch[1]);
  const b = headMatch[2] === undefined ? null : Number(headMatch[2]);
  if (!Number.isFinite(a)) return null;
  const range: [number, number] | null = b !== null && Number.isFinite(b) ? [Math.max(a, b), Math.min(a, b)] : null;
  const delta = range ? (range[0] + range[1]) / 2 : a;

  const inside = /\(([^)]*)\)/.exec(text)?.[1] ?? '';

  // J はまとめて取り出す (「J = 10.4, 2.1 Hz」のようにカンマで続く書き方があるため)
  const J: number[] = [];
  const rest = inside.replace(/J\s*[^=,)]{0,8}=\s*([0-9.,\s]*[0-9])\s*Hz/gi, (_, list: string) => {
    for (const v of list.split(/[,\s]+/)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) J.push(n);
    }
    return '';
  });

  let mult = '';
  let nH: number | null = null;
  for (const field of rest.split(',').map((f) => f.trim())) {
    if (!field) continue;
    const clean = field.replace(/\s+/g, ' ').trim();
    if (MULT.test(clean)) {
      mult = clean.toLowerCase().replace('broad s', 'br s').replace('br. s', 'br s');
      continue;
    }
    const nMatch = /^(\d+(?:\.\d+)?)\s*H$/i.exec(clean);
    if (nMatch) nH = Number(nMatch[1]);
  }
  return { delta, range, mult, J, nH };
}

/** 多重度から、線の数と強度の比を出す (一次の分裂) */
export function multipletLines(mult: string, J: number[]): { offsetHz: number; weight: number }[] {
  const kind = mult.replace(/^br\s*/, '').trim();
  let lines = [{ offsetHz: 0, weight: 1 }];
  const split = (j: number, count: number) => {
    const next: { offsetHz: number; weight: number }[] = [];
    // count 本に分裂 (二項係数)
    const binom = binomial(count - 1);
    for (const line of lines) {
      for (let i = 0; i < count; i++) {
        const shift = (i - (count - 1) / 2) * j;
        next.push({ offsetHz: line.offsetHz + shift, weight: line.weight * binom[i] });
      }
    }
    lines = next;
  };

  const counts: number[] = [];
  for (const c of kind) {
    if (c === 's') counts.push(1);
    else if (c === 'd') counts.push(2);
    else if (c === 't') counts.push(3);
    else if (c === 'q') counts.push(4);
  }
  if (/quint|quin/.test(kind)) counts.push(5);
  if (/sext/.test(kind)) counts.push(6);
  if (/sept|hept/.test(kind)) counts.push(7);
  if (/non/.test(kind)) counts.push(9);

  counts.forEach((count, i) => {
    if (count <= 1) return;
    // J が足りないときは最後の J を使い回す (なければ 7 Hz)
    const j = J[i] ?? J[J.length - 1] ?? 7;
    split(j, count);
  });
  const total = lines.reduce((t, l) => t + l.weight, 0) || 1;
  return lines.map((l) => ({ offsetHz: l.offsetHz, weight: l.weight / total }));
}

function binomial(n: number): number[] {
  const row = [1];
  for (let i = 1; i <= n; i++) row.push((row[i - 1] * (n - i + 1)) / i);
  const total = row.reduce((t, v) => t + v, 0);
  return row.map((v) => v / total);
}

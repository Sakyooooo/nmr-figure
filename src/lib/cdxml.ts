/**
 * ChemDraw の CDXML を読んで、図に置く構造式として SVG で描く。
 * Word に入る最終的な図は ChemDraw 自身が描く (「ChemDraw で開く」) ので、ここは画面で見分けがつかない程度に似せる。
 *  - 座標は CDXML のまま (pt)。拡大縮小しても、線の太さ・くさびの幅・二重線の間隔の書式は変えない (ChemDraw と同じ)
 *  - 原子の文字 (O, NH2 など) は ChemDraw が書いた位置 (p) と揃え方に従う。左向きの文字は並びを逆にする (OH → HO)
 *  - 二重結合の 2 本目は、指定がなければ ChemDraw と同じ決め方 (環の内側・置換基の多い側・末端の C=O は中央)
 */
import { elements, firstElement, parseXml, textOf, type XNode } from './xml';

export interface Rect {
  l: number;
  t: number;
  r: number;
  b: number;
}

interface P {
  x: number;
  y: number;
}

/** 文字が CDXML らしいか (ChemDraw の Copy As > CDXML Text) */
export function looksLikeCdxml(text: string) {
  return /<CDXML[\s>]/.test(text.slice(0, 6000));
}

export function readCdxml(text: string): XNode | null {
  const root = parseXml(text);
  return root && root.name === 'CDXML' ? root : null;
}

const num = (v: string | undefined, d: number) => {
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};
const nums = (v: string | undefined) => (v ?? '').trim().split(/[\s,]+/).filter(Boolean).map(Number);

export interface CdxStyle {
  lineWidth: number;
  boldWidth: number;
  hashSpacing: number;
  marginWidth: number;
  /** 二重線の間隔 (結合の長さに対する %) */
  bondSpacing: number;
  bondSpacingAbs: number | null;
  labelFont: string;
  labelSize: number;
  labelFace: number;
  captionFont: string;
  captionSize: number;
  captionFace: number;
  color: string;
}

export function docStyle(root: XNode): CdxStyle {
  const a = root.attrs;
  const abs = num(a.BondSpacingAbs, NaN);
  return {
    lineWidth: num(a.LineWidth, 1),
    boldWidth: num(a.BoldWidth, 4),
    hashSpacing: num(a.HashSpacing, 2.7),
    marginWidth: num(a.MarginWidth, 2),
    bondSpacing: num(a.BondSpacing, 12),
    bondSpacingAbs: Number.isFinite(abs) && abs > 0 ? abs : null,
    labelFont: a.LabelFont ?? '',
    labelSize: num(a.LabelSize, 10),
    labelFace: num(a.LabelFace, 96),
    captionFont: a.CaptionFont ?? '',
    captionSize: num(a.CaptionSize, 10),
    captionFace: num(a.CaptionFace, 0),
    color: a.color ?? '0',
  };
}

/** 色の表。0 = 黒、1 = 白、表の 1 つ目が 2 */
export function colorTable(root: XNode): string[] {
  const out = ['#000000', '#ffffff'];
  const table = firstElement(root, 'colortable');
  const c255 = (v: string | undefined) => Math.round(Math.min(1, Math.max(0, num(v, 0))) * 255);
  for (const c of table ? elements(table, 'color') : []) {
    out.push('#' + [c.attrs.r, c.attrs.g, c.attrs.b].map((v) => c255(v).toString(16).padStart(2, '0')).join(''));
  }
  return out;
}

export function fontTable(root: XNode): Map<string, string> {
  const out = new Map<string, string>();
  const table = firstElement(root, 'fonttable');
  for (const f of table ? elements(table, 'font') : []) if (f.attrs.id) out.set(f.attrs.id, f.attrs.name || 'Arial');
  return out;
}

/** 文字の幅 (Arial、1000 分率)。ChemDraw の既定の字体。ほかの字体でもおおよその幅として使う */
const ARIAL =
  '278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584'
    .split(',')
    .map(Number);

export function textWidth(text: string, size: number, bold = false) {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    w += c >= 32 && c < 127 ? ARIAL[c - 32] : c > 0x2e80 ? 1000 : 600;
  }
  return (w / 1000) * size * (bold ? 1.06 : 1);
}

/** 上付き・下付きの大きさと位置 (ChemDraw の見た目に合わせた値) */
const SCRIPT_SIZE = 0.75;
const SUB_SHIFT = 0.21;
const SUP_SHIFT = 0.31;
/** 縦に並べた文字 (NH を N の下に H) の行の間隔 */
const LABEL_LINE = 0.834;

interface Seg {
  text: string;
  font: string;
  size: number;
  /** 基線からのずれ (下が +) */
  shift: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: string;
}

interface Ctx {
  style: CdxStyle;
  colors: string[];
  fonts: Map<string, string>;
  /** 線の太さなどを割る値 (拡大縮小しても書式の太さを変えないため) */
  k: number;
  out: string[];
  box: Rect | null;
}

const f2 = (v: number) => (Math.round(v * 1000) / 1000).toString();

function colorOf(ctx: Ctx, idx: string | undefined, fallback?: string) {
  if (idx === undefined) return fallback ?? ctx.colors[Number(ctx.style.color)] ?? '#000000';
  return ctx.colors[Number(idx)] ?? '#000000';
}

function fontOf(ctx: Ctx, id: string | undefined, fallback: string) {
  return ctx.fonts.get(id ?? fallback) ?? ctx.fonts.get(fallback) ?? 'Arial';
}

function grow(ctx: Ctx, x: number, y: number, pad = 0) {
  const b = ctx.box;
  if (!b) ctx.box = { l: x - pad, t: y - pad, r: x + pad, b: y + pad };
  else {
    b.l = Math.min(b.l, x - pad);
    b.t = Math.min(b.t, y - pad);
    b.r = Math.max(b.r, x + pad);
    b.b = Math.max(b.b, y + pad);
  }
}

/** <t> の文字を、書式ごとの区切りに分ける。formula (face 96) は数字を下付き、+ - を上付きにする */
function segmentsOf(ctx: Ctx, t: XNode, def: { font: string; size: number; face: number; color: string }): Seg[] {
  const out: Seg[] = [];
  const runs = elements(t, 's');
  const list = runs.length ? runs : [t];
  for (const s of list) {
    const text = textOf(s);
    if (!text) continue;
    const size = num(s.attrs.size, def.size);
    const face = num(s.attrs.face, def.face);
    const font = s.attrs.font ? fontOf(ctx, s.attrs.font, def.font) : def.font;
    const color = s.attrs.color !== undefined ? colorOf(ctx, s.attrs.color) : def.color;
    const base = { font, bold: !!(face & 1), italic: !!(face & 2), underline: !!(face & 4), color };
    const formula = (face & 96) === 96;
    if (!formula) {
      const sub = !!(face & 32);
      const sup = !!(face & 64);
      out.push({ ...base, text, size: sub || sup ? size * SCRIPT_SIZE : size, shift: sub ? size * SUB_SHIFT : sup ? -size * SUP_SHIFT : 0 });
      continue;
    }
    // 化学式の書き方: 数字は下付き (ただし + - の前の数字は電荷なので上付き)、+ - は上付き
    const re = /(\d+(?=[+\-−]))|([+\-−])|(\d+)|([^\d+\-−]+)/g;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      if (m[1] || m[2]) out.push({ ...base, text: m[0], size: size * SCRIPT_SIZE, shift: -size * SUP_SHIFT });
      else if (m[3]) out.push({ ...base, text: m[0], size: size * SCRIPT_SIZE, shift: size * SUB_SHIFT });
      else out.push({ ...base, text: m[0], size, shift: 0 });
    }
  }
  return out;
}

/** 左向きの文字の並び替えで、ひとまとまりに扱う略号 (大文字が続くもの) */
const ABBREVIATIONS = ['TBDPS', 'TBDMS', 'TIPS', 'TBS', 'TMS', 'TES', 'PMB', 'PMP', 'MOM', 'MEM', 'SEM', 'THP', 'DMB', 'DMTr', 'MMTr', 'Boc', 'Cbz', 'Fmoc', 'Alloc', 'Troc', 'Teoc', 'Piv', 'NHS'];

/** 原子の文字を、元素ごとのまとまり (O, H2, Me, TBS, 電荷) に分ける */
export function labelTokens(segs: Seg[]): Seg[][] {
  // いったん 1 文字ずつにしてから、まとまりを作る
  const chars: Seg[] = [];
  for (const s of segs) for (const ch of s.text) chars.push({ ...s, text: ch });
  const plain = chars.map((c) => c.text).join('');
  const tokens: Seg[][] = [];
  let i = 0;
  while (i < chars.length) {
    let len = 0;
    const abbr = ABBREVIATIONS.find((a) => plain.startsWith(a, i));
    if (abbr) len = abbr.length;
    else {
      const m = /^([a-z]*[A-Z][a-z]*|[+\-−]|\(|\)|[^A-Za-z])/.exec(plain.slice(i));
      len = m ? m[0].length : 1;
    }
    // 後ろに続く数字 (下付き) と、括弧の中身
    let j = i + len;
    if (plain[i] === '(') {
      const close = plain.indexOf(')', i);
      if (close > i) j = close + 1;
    }
    while (j < chars.length && /\d/.test(plain[j])) j++;
    tokens.push(chars.slice(i, j));
    i = j;
  }
  return tokens;
}

function mergeSegs(chars: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (const c of chars) {
    const last = out[out.length - 1];
    if (last && last.font === c.font && last.size === c.size && last.shift === c.shift && last.bold === c.bold && last.italic === c.italic && last.color === c.color && last.underline === c.underline)
      last.text += c.text;
    else out.push({ ...c });
  }
  return out;
}

function segsWidth(segs: Seg[]) {
  return segs.reduce((w, s) => w + textWidth(s.text, s.size, s.bold), 0);
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 1 行の文字を SVG に (基線の左・中央・右を x に合わせる) */
function textSvg(ctx: Ctx, segs: Seg[], x: number, y: number, anchor: 'start' | 'middle' | 'end') {
  if (!segs.length) return;
  const base = segs.find((s) => s.shift === 0) ?? segs[0];
  const parts = segs.map((s) => {
    const attrs: string[] = [];
    if (s.font !== base.font) attrs.push(`font-family="${esc(s.font)}"`);
    if (s.size !== base.size) attrs.push(`font-size="${f2(s.size)}"`);
    if (s.bold) attrs.push('font-weight="bold"');
    if (s.italic) attrs.push('font-style="italic"');
    if (s.underline) attrs.push('text-decoration="underline"');
    if (s.color !== base.color) attrs.push(`fill="${s.color}"`);
    // baseline-shift は Word が読まないことがあるので、dy で上げ下げして次の区切りで戻す
    return { s, attrs };
  });
  let cur = 0;
  const spans = parts
    .map(({ s, attrs }) => {
      const dy = s.shift - cur;
      cur = s.shift;
      if (dy) attrs.push(`dy="${f2(dy)}"`);
      return `<tspan${attrs.length ? ' ' + attrs.join(' ') : ''}>${esc(s.text)}</tspan>`;
    })
    .join('');
  ctx.out.push(
    `<text x="${f2(x)}" y="${f2(y)}" font-family="${esc(base.font)}" font-size="${f2(base.size)}" fill="${base.color}"${base.bold ? ' font-weight="bold"' : ''}${
      base.italic ? ' font-style="italic"' : ''
    }${anchor !== 'start' ? ` text-anchor="${anchor}"` : ''}>${spans}</text>`,
  );
  const w = segsWidth(segs);
  const l = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  const top = Math.min(...segs.map((s) => s.shift - s.size * 0.75));
  const bottom = Math.max(...segs.map((s) => s.shift + s.size * 0.05));
  grow(ctx, l, y + top);
  grow(ctx, l + w, y + bottom);
}

// ---- 原子と結合 ----

interface Label {
  lines: { segs: Seg[]; x: number; y: number; anchor: 'start' | 'middle' | 'end' }[];
  /** 結合を止める枠 (字の形の範囲) */
  clip: Rect;
}

interface Atom {
  id: string;
  x: number;
  y: number;
  label: Label | null;
  bonds: Bond[];
  margin: number;
}

interface Bond {
  id: string;
  a: Atom;
  b: Atom;
  node: XNode;
}

function atomLabel(ctx: Ctx, n: XNode, x: number, y: number): Label | null {
  const t = firstElement(n, 't');
  if (!t || t.attrs.Visible === 'no') return null;
  const st = ctx.style;
  const def = {
    font: fontOf(ctx, n.attrs.LabelFont ?? t.attrs.LabelFont, st.labelFont),
    size: num(t.attrs.LabelSize ?? n.attrs.LabelSize, st.labelSize),
    face: num(t.attrs.LabelFace ?? n.attrs.LabelFace, st.labelFace),
    color: colorOf(ctx, t.attrs.color ?? n.attrs.color),
  };
  const segs = segmentsOf(ctx, t, def);
  if (!segs.length) return null;
  const size = def.size;
  const tokens = labelTokens(segs);
  const align = t.attrs.LabelAlignment ?? 'Auto';
  const just = t.attrs.LabelJustification ?? t.attrs.Justification ?? 'Left';
  const p = nums(t.attrs.p);
  const lines: Label['lines'] = [];
  if (align === 'Above' || align === 'Below') {
    // 縦に並べる。Below は上から N, H、Above は上から H, N (原子が下)
    const rows = align === 'Below' ? tokens : [...tokens].reverse();
    const px = p.length >= 2 ? p[0] : x - textWidth(rows[0].map((c) => c.text).join(''), size) / 2;
    const py0 = p.length >= 2 ? p[1] : align === 'Below' ? y + size * 0.36 : y + size * 0.36 - (rows.length - 1) * size * LABEL_LINE;
    rows.forEach((row, i) => lines.push({ segs: mergeSegs(row), x: px, y: py0 + i * size * LABEL_LINE, anchor: 'start' }));
  } else {
    const right = just === 'Right' || align === 'Right';
    const ordered = right ? [...tokens].reverse() : tokens;
    const segsOut = mergeSegs(ordered.flat());
    const anchor = right ? 'end' : just === 'Center' ? 'middle' : 'start';
    let px: number;
    if (p.length >= 2) px = p[0];
    else {
      const first = textWidth(tokens[0][0]?.text ?? '', size);
      px = right ? x + first / 2 : anchor === 'middle' ? x : x - first / 2;
    }
    const py = p.length >= 2 ? p[1] : y + size * 0.36;
    lines.push({ segs: segsOut, x: px, y: py, anchor });
  }
  // 結合を止める枠: 字の形の範囲。電荷の上付き (N+ の +) は含めない (ChemDraw も N の字で止める)
  let l = Infinity;
  let r = -Infinity;
  let top = Infinity;
  let bottom = -Infinity;
  for (const line of lines) {
    const w = segsWidth(line.segs);
    let x = line.anchor === 'start' ? line.x : line.anchor === 'end' ? line.x - w : line.x - w / 2;
    for (const s of line.segs) {
      const sw = textWidth(s.text, s.size, s.bold);
      if (s.shift >= 0) {
        l = Math.min(l, x);
        r = Math.max(r, x + sw);
      }
      if (s.shift === 0) {
        top = Math.min(top, line.y - s.size * 0.73);
        bottom = Math.max(bottom, line.y + s.size * 0.02);
      }
      x += sw;
    }
  }
  if (!Number.isFinite(top)) {
    top = Math.min(...lines.map((line) => line.y - size * 0.73));
    bottom = Math.max(...lines.map((line) => line.y));
  }
  if (!Number.isFinite(l)) return { lines, clip: { l: x - size * 0.4, t: top, r: x + size * 0.4, b: bottom } };
  return { lines, clip: { l, t: top, r, b: bottom } };
}

/** 線分 p→q が、p を囲む枠から出る位置 (p が枠の外なら p のまま) */
function exitPoint(p: P, q: P, box: Rect): P {
  if (p.x < box.l || p.x > box.r || p.y < box.t || p.y > box.b) return p;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (box.r - p.x) / dx);
  if (dx < 0) t = Math.min(t, (box.l - p.x) / dx);
  if (dy > 0) t = Math.min(t, (box.b - p.y) / dy);
  if (dy < 0) t = Math.min(t, (box.t - p.y) / dy);
  if (!Number.isFinite(t)) return p;
  return t >= 1 ? q : { x: p.x + dx * t, y: p.y + dy * t };
}

function expand(r: Rect, m: number): Rect {
  return { l: r.l - m, t: r.t - m, r: r.r + m, b: r.b + m };
}

/** 両端の文字で線を止める */
function clipSegment(p: P, q: P, a: Atom, b: Atom): [P, P] | null {
  let p2 = p;
  let q2 = q;
  if (a.label) p2 = exitPoint(p, q, expand(a.label.clip, a.margin));
  if (b.label) q2 = exitPoint(q, p2, expand(b.label.clip, b.margin));
  if ((q2.x - p2.x) * (q.x - p.x) + (q2.y - p2.y) * (q.y - p.y) <= 0) return null;
  return [p2, q2];
}

/** 結合を含む一番小さい環 (原子の並び)。なければ null */
function smallestRing(bond: Bond, limit = 10): Atom[] | null {
  const start = bond.a;
  const goal = bond.b;
  const prev = new Map<Atom, Atom | null>([[start, null]]);
  let frontier = [start];
  for (let depth = 0; depth < limit && frontier.length; depth++) {
    const next: Atom[] = [];
    for (const at of frontier) {
      for (const bd of at.bonds) {
        if (bd === bond) continue;
        const other = bd.a === at ? bd.b : bd.a;
        if (prev.has(other)) continue;
        prev.set(other, at);
        if (other === goal) {
          const ring: Atom[] = [];
          for (let c: Atom | null | undefined = other; c; c = prev.get(c)) ring.push(c);
          return ring;
        }
        next.push(other);
      }
    }
    frontier = next;
  }
  return null;
}

function centroid(atoms: Atom[]): P {
  return { x: atoms.reduce((s, a) => s + a.x, 0) / atoms.length, y: atoms.reduce((s, a) => s + a.y, 0) / atoms.length };
}

/** 結合の右側 (B → E に進んで右) の法線 */
function rightNormal(a: P, b: P): P {
  const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: -(b.y - a.y) / L, y: (b.x - a.x) / L };
}

function sideOf(a: P, b: P, c: P) {
  const n = rightNormal(a, b);
  return Math.sign((c.x - a.x) * n.x + (c.y - a.y) * n.y);
}

/** 二重結合の 2 本目の向き: +1 右 / -1 左 / 0 中央 */
function doubleSide(bond: Bond, pos: string | undefined): number {
  if (pos === 'Center') return 0;
  if (pos === 'Right') return 1;
  if (pos === 'Left') return -1;
  const { a, b } = bond;
  const ring = smallestRing(bond);
  if (ring && ring.length <= 8) return sideOf(a, b, centroid(ring)) || 1;
  const others = (x: Atom, y: Atom) => x.bonds.map((bd) => (bd.a === x ? bd.b : bd.a)).filter((o) => o !== y);
  const na = others(a, b);
  const nb = others(b, a);
  // 末端が文字の原子 (C=O など) は中央
  if ((a.label && !na.length) || (b.label && !nb.length)) return 0;
  let score = 0;
  for (const o of [...na, ...nb]) score += sideOf(a, b, o);
  if (score) return Math.sign(score);
  // 置換基が両側に同じだけ (E 体のアルケンなど) は、B → E の左側 (ChemDraw と同じ)。両端とも置換基がなければ中央
  return na.length + nb.length ? -1 : 0;
}

interface Stroke {
  p: P;
  q: P;
  width: number;
  color: string;
  dash?: string;
}

function lineSvg(ctx: Ctx, s: Stroke) {
  ctx.out.push(
    `<line x1="${f2(s.p.x)}" y1="${f2(s.p.y)}" x2="${f2(s.q.x)}" y2="${f2(s.q.y)}" stroke="${s.color}" stroke-width="${f2(s.width)}"${
      s.dash ? ` stroke-dasharray="${s.dash}"` : ''
    }/>`,
  );
  grow(ctx, s.p.x, s.p.y, s.width / 2);
  grow(ctx, s.q.x, s.q.y, s.width / 2);
}

function polygonSvg(ctx: Ctx, pts: P[], fill: string, stroke?: { color: string; width: number }) {
  ctx.out.push(
    `<polygon points="${pts.map((p) => `${f2(p.x)},${f2(p.y)}`).join(' ')}" fill="${fill}"${
      stroke ? ` stroke="${stroke.color}" stroke-width="${f2(stroke.width)}" stroke-linejoin="miter"` : ''
    }/>`,
  );
  for (const p of pts) grow(ctx, p.x, p.y);
}

const lerp = (p: P, q: P, t: number): P => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
const add = (p: P, n: P, k: number): P => ({ x: p.x + n.x * k, y: p.y + n.y * k });

/** 1 本の線 (結合の種類ごとの描き方)。返り値: 鎖につなげられる普通の線なら、その線分 */
function drawLine(ctx: Ctx, bond: Bond, p: P, q: P, display: string, color: string, clipA: boolean, clipB: boolean): Stroke | null {
  const st = bondStyle(ctx, bond.node);
  const seg = clipSegment(p, q, clipA ? bond.a : noLabel, clipB ? bond.b : noLabel);
  if (!seg) return null;
  const [s, e] = seg;
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const n = rightNormal(p, q);
  // くさび: 細い側の幅は線の太さ、太い側は太線の 1.5 倍 (破線のくさびは 1.8 倍)
  const wedge = (narrowAtStart: boolean, full: number) => {
    const at = (pt: P) => {
      const u = ((pt.x - p.x) * (q.x - p.x) + (pt.y - p.y) * (q.y - p.y)) / (len * len);
      const t = narrowAtStart ? u : 1 - u;
      return st.lw + (full - st.lw) * Math.min(1, Math.max(0, t));
    };
    return at;
  };
  switch (display) {
    case 'WedgeBegin':
    case 'WedgeEnd':
    case 'HollowWedgeBegin':
    case 'HollowWedgeEnd': {
      const w = wedge(display.endsWith('Begin'), st.bw * 1.5);
      const ws = w(s);
      const we = w(e);
      const pts = [add(s, n, ws / 2), add(e, n, we / 2), add(e, n, -we / 2), add(s, n, -ws / 2)];
      if (display.startsWith('Hollow')) polygonSvg(ctx, pts, 'none', { color, width: st.lw });
      else polygonSvg(ctx, pts, color);
      return null;
    }
    case 'WedgedHashBegin':
    case 'WedgedHashEnd': {
      // 破線のくさび: 細い側の原子から間隔ごとに、長さは原子からの距離に比例 (太い側は太線の 1.8 倍)。
      // 両端の原子の上には引かない
      const step = st.hs + st.lw * 0.7;
      const narrowStart = display.endsWith('Begin');
      const from = narrowStart ? p : q;
      const u = { x: (narrowStart ? q.x - p.x : p.x - q.x) / len, y: (narrowStart ? q.y - p.y : p.y - q.y) / len };
      // 文字で止めた範囲 (細い側の原子からの距離)
      const d0 = Math.hypot((narrowStart ? s : e).x - from.x, (narrowStart ? s : e).y - from.y);
      const d1 = Math.hypot((narrowStart ? e : s).x - from.x, (narrowStart ? e : s).y - from.y);
      const full = st.bw * 1.8;
      for (let k = 1; k * step < d1 - step * 0.4; k++) {
        const dist = k * step;
        if (dist < d0) continue;
        const c = add(from, u, dist);
        const hw = Math.max(st.lw, (full * dist) / len) / 2;
        lineSvg(ctx, { p: add(c, n, hw), q: add(c, n, -hw), width: st.lw, color });
      }
      return null;
    }
    case 'Hash': {
      const step = st.hs + st.lw * 0.7;
      const segLen = Math.hypot(e.x - s.x, e.y - s.y);
      const count = Math.max(1, Math.round(segLen / step));
      for (let k = 0; k < count; k++) {
        const c = lerp(s, e, (k + 0.5) / count);
        lineSvg(ctx, { p: add(c, n, st.bw / 2), q: add(c, n, -st.bw / 2), width: st.lw, color });
      }
      return null;
    }
    case 'Bold':
      lineSvg(ctx, { p: s, q: e, width: st.bw, color });
      return null;
    case 'Dash':
      lineSvg(ctx, { p: s, q: e, width: st.lw, color, dash: `${f2(st.hs * 0.8)} ${f2(st.hs * 0.8)}` });
      return null;
    case 'Dot':
      lineSvg(ctx, { p: s, q: e, width: st.lw * 1.5, color, dash: `0.01 ${f2(st.hs)}` });
      return null;
    case 'DashDot':
      lineSvg(ctx, { p: s, q: e, width: st.lw, color, dash: `${f2(st.hs)} ${f2(st.hs * 0.6)} 0.01 ${f2(st.hs * 0.6)}` });
      return null;
    case 'Wavy':
    case 'WavyWedgeBegin':
    case 'WavyWedgeEnd': {
      const segLen = Math.hypot(e.x - s.x, e.y - s.y);
      const waves = Math.max(2, Math.round(segLen / (st.hs * 1.2)));
      const amp = st.bw * 0.6;
      const pts: string[] = [];
      for (let i = 0; i <= waves * 8; i++) {
        const t = i / (waves * 8);
        const c = add(lerp(s, e, t), n, Math.sin(t * waves * Math.PI) * amp);
        pts.push(`${f2(c.x)},${f2(c.y)}`);
      }
      ctx.out.push(`<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${f2(st.lw)}"/>`);
      grow(ctx, s.x, s.y, amp);
      grow(ctx, e.x, e.y, amp);
      return null;
    }
    default:
      return { p: s, q: e, width: st.lw, color };
  }
}

const noLabel: Atom = { id: '', x: 0, y: 0, label: null, bonds: [], margin: 0 };

function bondStyle(ctx: Ctx, b: XNode) {
  const k = ctx.k;
  const st = ctx.style;
  return {
    lw: num(b.attrs.LineWidth, st.lineWidth) / k,
    bw: num(b.attrs.BoldWidth, st.boldWidth) / k,
    hs: num(b.attrs.HashSpacing, st.hashSpacing) / k,
    spacing: num(b.attrs.BondSpacing, st.bondSpacing),
    spacingAbs: b.attrs.BondSpacingAbs ? num(b.attrs.BondSpacingAbs, 0) / k : st.bondSpacingAbs !== null ? st.bondSpacingAbs / k : null,
  };
}

/** 環の内側の線を縮める長さ: 隣の結合との角度から (六員環で間隔の 0.58 倍) */
function innerTrim(at: Atom, other: Atom, side: number, a: P, b: P, gap: number) {
  let best: number | null = null;
  for (const bd of at.bonds) {
    const nb = bd.a === at ? bd.b : bd.a;
    if (nb === other) continue;
    if (sideOf(a, b, nb) !== side) continue;
    const v1 = { x: other.x - at.x, y: other.y - at.y };
    const v2 = { x: nb.x - at.x, y: nb.y - at.y };
    const cos = (v1.x * v2.x + v1.y * v2.y) / ((Math.hypot(v1.x, v1.y) || 1) * (Math.hypot(v2.x, v2.y) || 1));
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    const trim = gap / Math.tan(ang / 2);
    if (best === null || trim < best) best = trim;
  }
  if (at.label) return 0;
  return Math.min(gap * 2, Math.max(gap * 0.3, best ?? gap * 0.6));
}

function renderFragment(ctx: Ctx, frag: XNode) {
  const atoms = new Map<string, Atom>();
  const marginDefault = ctx.style.marginWidth / ctx.k;
  for (const n of elements(frag, 'n')) {
    const p = nums(n.attrs.p);
    if (p.length < 2) continue;
    const hidden = n.attrs.NodeType === 'ExternalConnectionPoint' || n.attrs.Visible === 'no';
    const atom: Atom = {
      id: n.attrs.id,
      x: p[0],
      y: p[1],
      label: hidden ? null : atomLabel(ctx, n, p[0], p[1]),
      bonds: [],
      margin: n.attrs.MarginWidth ? num(n.attrs.MarginWidth, 0) / ctx.k : marginDefault,
    };
    atoms.set(atom.id, atom);
    grow(ctx, p[0], p[1]);
  }
  const bonds: Bond[] = [];
  for (const b of elements(frag, 'b')) {
    if (b.attrs.Visible === 'no') continue;
    const a = atoms.get(b.attrs.B);
    const e = atoms.get(b.attrs.E);
    if (!a || !e) continue;
    const bond: Bond = { id: b.attrs.id, a, b: e, node: b };
    a.bonds.push(bond);
    e.bonds.push(bond);
    bonds.push(bond);
  }

  // 芳香環 (すべて 1.5 の環) は円を描く
  const circles = new Set<string>();
  const aromaticRings: Atom[][] = [];
  for (const bond of bonds) {
    if (bond.node.attrs.Order !== '1.5') continue;
    const ring = smallestRing(bond, 8);
    if (!ring) continue;
    const ok = ring.every((at, i) => {
      const nx = ring[(i + 1) % ring.length];
      return at.bonds.some((bd) => (bd.a === nx || bd.b === nx) && bd.node.attrs.Order === '1.5');
    });
    const key = ring.map((r) => r.id).sort().join(',');
    if (ok && !circles.has(key)) {
      circles.add(key);
      aromaticRings.push(ring);
    }
  }
  const inCircleRing = (bond: Bond) => aromaticRings.some((ring) => ring.includes(bond.a) && ring.includes(bond.b));

  const chain: Stroke[] = [];
  for (const bond of bonds) {
    const node = bond.node;
    const color = colorOf(ctx, node.attrs.color);
    const st = bondStyle(ctx, node);
    const order = node.attrs.Order ?? '1';
    const display = node.attrs.Display ?? 'Solid';
    const display2 = node.attrs.Display2 ?? (order === '1.5' ? 'Dash' : 'Solid');
    const p: P = { x: bond.a.x, y: bond.a.y };
    const q: P = { x: bond.b.x, y: bond.b.y };
    const L = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    const gap = st.spacingAbs ?? (st.spacing / 100) * L;
    const n = rightNormal(p, q);
    const main = (pp: P, qq: P, disp: string) => {
      const s = drawLine(ctx, bond, pp, qq, disp, color, true, true);
      if (s) chain.push({ ...s });
    };
    const offset = (side: number, disp: string, trim: boolean) => {
      let pp = add(p, n, gap * side);
      let qq = add(q, n, gap * side);
      if (trim) {
        const ta = innerTrim(bond.a, bond.b, side, p, q, gap);
        const tb = innerTrim(bond.b, bond.a, side, p, q, gap);
        const ux = (q.x - p.x) / L;
        const uy = (q.y - p.y) / L;
        pp = { x: pp.x + ux * ta, y: pp.y + uy * ta };
        qq = { x: qq.x - ux * tb, y: qq.y - uy * tb };
      }
      const s = drawLine(ctx, bond, pp, qq, disp, color, true, true);
      if (s) lineSvg(ctx, s);
    };
    if (order === '2' || (order === '1.5' && !inCircleRing(bond))) {
      const side = doubleSide(bond, node.attrs.DoublePosition);
      if (side === 0) {
        for (const k of [-0.5, 0.5]) {
          const s = drawLine(ctx, bond, add(p, n, gap * k), add(q, n, gap * k), k < 0 ? display : display2, color, true, true);
          if (s) lineSvg(ctx, s);
        }
      } else {
        main(p, q, display);
        offset(side, display2, true);
      }
    } else if (order === '3') {
      main(p, q, display);
      for (const side of [-1, 1]) offset(side, 'Solid', false);
    } else if (order === 'dative') {
      const s = drawLine(ctx, bond, p, q, 'Solid', color, true, true);
      if (s) {
        lineSvg(ctx, s);
        arrowHeadSvg(ctx, s.p, s.q, st.lw, color, 'Full', 1000, 875, 250);
      }
    } else if (order === 'hydrogen') {
      const s = drawLine(ctx, bond, p, q, 'Solid', color, true, true);
      if (s) lineSvg(ctx, { ...s, dash: `${f2(st.hs * 0.5)} ${f2(st.hs * 0.5)}` });
    } else if (order === 'ionic' || order === '0') {
      continue;
    } else {
      main(p, q, display);
    }
  }
  // 線をつなぐのは、文字がなく結合が 2 本の原子だけ
  const joinable = new Set([...atoms.values()].filter((a) => !a.label && a.bonds.length === 2).map((a) => pointKey(a)));
  joinChains(ctx, chain, joinable);

  for (const ring of aromaticRings) {
    const c = centroid(ring);
    const apothem = Math.min(
      ...ring.map((at, i) => {
        const nx = ring[(i + 1) % ring.length];
        return Math.hypot((at.x + nx.x) / 2 - c.x, (at.y + nx.y) / 2 - c.y);
      }),
    );
    const bd = bonds.find((b) => ring.includes(b.a) && ring.includes(b.b));
    const lw = bd ? bondStyle(ctx, bd.node).lw : ctx.style.lineWidth / ctx.k;
    ctx.out.push(`<circle cx="${f2(c.x)}" cy="${f2(c.y)}" r="${f2(apothem * 0.72)}" fill="none" stroke="${colorOf(ctx, bd?.node.attrs.color)}" stroke-width="${f2(lw)}"/>`);
  }

  for (const atom of atoms.values()) {
    if (!atom.label) continue;
    for (const line of atom.label.lines) textSvg(ctx, line.segs, line.x, line.y, line.anchor);
  }
}

const pointKey = (p: P) => `${Math.round(p.x * 100)},${Math.round(p.y * 100)}`;

/**
 * 普通の線どうしを、文字のない原子でつないで折れ線にする (角をとがらせて、ChemDraw と同じつながり方にする)。
 * 3 本以上が集まる原子では切る (120° ずつならすき間はできない)
 */
function joinChains(ctx: Ctx, strokes: Stroke[], joinable: Set<string>) {
  const key = pointKey;
  const byPoint = new Map<string, number[]>();
  strokes.forEach((s, i) => {
    for (const p of [s.p, s.q]) {
      const k = key(p);
      byPoint.set(k, [...(byPoint.get(k) ?? []), i]);
    }
  });
  const used = new Set<number>();
  const same = (a: Stroke, b: Stroke) => a.color === b.color && Math.abs(a.width - b.width) < 1e-6;
  const nextFrom = (p: P, cur: number) => {
    const list = byPoint.get(key(p)) ?? [];
    if (list.length !== 2 || !joinable.has(key(p))) return -1;
    const other = list[0] === cur ? list[1] : list[0];
    return used.has(other) || !same(strokes[other], strokes[cur]) ? -1 : other;
  };
  for (let i = 0; i < strokes.length; i++) {
    if (used.has(i)) continue;
    used.add(i);
    const pts: P[] = [strokes[i].p, strokes[i].q];
    // 後ろへ伸ばす
    for (let cur = i, end = strokes[i].q; ; ) {
      const nx = nextFrom(end, cur);
      if (nx < 0) break;
      used.add(nx);
      const s = strokes[nx];
      end = key(s.p) === key(end) ? s.q : s.p;
      pts.push(end);
      cur = nx;
    }
    // 前へ伸ばす
    for (let cur = i, start = strokes[i].p; ; ) {
      const nx = nextFrom(start, cur);
      if (nx < 0) break;
      used.add(nx);
      const s = strokes[nx];
      start = key(s.p) === key(start) ? s.q : s.p;
      pts.unshift(start);
      cur = nx;
    }
    const closed = pts.length > 3 && key(pts[0]) === key(pts[pts.length - 1]);
    if (closed) pts.pop();
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${f2(p.x)} ${f2(p.y)}`).join(' ') + (closed ? ' Z' : '');
    const s = strokes[i];
    ctx.out.push(`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${f2(s.width)}" stroke-linejoin="miter" stroke-miterlimit="10"/>`);
    for (const p of pts) grow(ctx, p.x, p.y, s.width / 2);
  }
}

// ---- 文字・図形 ----

function renderCaption(ctx: Ctx, t: XNode) {
  const st = ctx.style;
  const def = {
    font: fontOf(ctx, t.attrs.CaptionFont, st.captionFont),
    size: num(t.attrs.CaptionSize, st.captionSize),
    face: num(t.attrs.CaptionFace, st.captionFace),
    color: colorOf(ctx, t.attrs.color ?? t.attrs.CaptionColor),
  };
  const segs = segmentsOf(ctx, t, def);
  if (!segs.length) return;
  const p = nums(t.attrs.p);
  if (p.length < 2) return;
  const just = t.attrs.CaptionJustification ?? t.attrs.Justification ?? 'Left';
  const anchor = just === 'Right' ? 'end' : just === 'Center' ? 'middle' : 'start';
  const size = Math.max(...segs.map((s) => s.size));
  const lh = t.attrs.LineHeight && t.attrs.LineHeight !== 'auto' && t.attrs.LineHeight !== 'variable' ? num(t.attrs.LineHeight, size * 1.15) : size * 1.15;
  // 改行で行に分ける
  const lines: Seg[][] = [[]];
  for (const s of segs) {
    const parts = s.text.split(/\r?\n|\r/);
    parts.forEach((part, i) => {
      if (i) lines.push([]);
      if (part) lines[lines.length - 1].push({ ...s, text: part });
    });
  }
  lines.forEach((line, i) => textSvg(ctx, line, p[0], p[1] + i * lh, anchor));
}

function arrowHeadSvg(ctx: Ctx, tail: P, head: P, lw: number, color: string, kind: string, size: number, center: number, width: number) {
  const L = Math.hypot(head.x - tail.x, head.y - tail.y) || 1;
  const u = { x: (head.x - tail.x) / L, y: (head.y - tail.y) / L };
  const n = { x: -u.y, y: u.x };
  const len = (size / 100) * lw;
  const mid = (center / 100) * lw;
  const hw = (width / 100) * lw;
  const back = add(head, u, -len);
  const notch = add(head, u, -mid);
  const left = add(back, n, -hw);
  const right = add(back, n, hw);
  const pts = kind === 'HalfLeft' ? [head, left, notch] : kind === 'HalfRight' ? [head, right, notch] : [head, left, notch, right];
  polygonSvg(ctx, pts, color);
}

function renderArrow(ctx: Ctx, g: XNode) {
  const head3 = nums(g.attrs.Head3D);
  const tail3 = nums(g.attrs.Tail3D);
  if (head3.length < 2 || tail3.length < 2) return;
  const color = colorOf(ctx, g.attrs.color);
  const lw = num(g.attrs.LineWidth, ctx.style.lineWidth) / ctx.k;
  const head = { x: head3[0], y: head3[1] };
  const tail = { x: tail3[0], y: tail3[1] };
  const size = num(g.attrs.HeadSize, 1000);
  const center = num(g.attrs.ArrowheadCenterSize, 875);
  const width = num(g.attrs.ArrowheadWidth, 250);
  const dash = g.attrs.LineType === 'Dashed' ? `${f2(lw * 4)} ${f2(lw * 3)}` : undefined;
  const bold = g.attrs.LineType === 'Bold' ? num(g.attrs.BoldWidth, ctx.style.boldWidth) / ctx.k : lw;
  const angular = num(g.attrs.AngularSize, 0);
  const center3 = nums(g.attrs.Center3D);
  if (angular && center3.length >= 2) {
    // 曲がった矢印 (円弧)
    const c = { x: center3[0], y: center3[1] };
    const rad = Math.hypot(tail.x - c.x, tail.y - c.y);
    const sweep = angular > 0 ? 1 : 0;
    const large = Math.abs(angular) > 180 ? 1 : 0;
    ctx.out.push(
      `<path d="M${f2(tail.x)} ${f2(tail.y)} A${f2(rad)} ${f2(rad)} 0 ${large} ${sweep} ${f2(head.x)} ${f2(head.y)}" fill="none" stroke="${color}" stroke-width="${f2(bold)}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`,
    );
    grow(ctx, c.x, c.y, rad);
    // 矢じりは円の接線の向き
    const t = { x: -(head.y - c.y), y: head.x - c.x };
    const s = angular > 0 ? 1 : -1;
    const from = add(head, { x: t.x / (Math.hypot(t.x, t.y) || 1), y: t.y / (Math.hypot(t.x, t.y) || 1) }, -s);
    if (g.attrs.ArrowheadHead && g.attrs.ArrowheadHead !== 'None') arrowHeadSvg(ctx, from, head, lw, color, g.attrs.ArrowheadHead, size, center, width);
    return;
  }
  const shaft = num(g.attrs.ArrowShaftSpacing, 0) / ctx.k;
  const L = Math.hypot(head.x - tail.x, head.y - tail.y) || 1;
  const u = { x: (head.x - tail.x) / L, y: (head.y - tail.y) / L };
  const n = { x: -u.y, y: u.x };
  const shafts = shaft ? [-shaft / 2, shaft / 2] : [0];
  const headKind = g.attrs.ArrowheadHead ?? 'None';
  const tailKind = g.attrs.ArrowheadTail ?? 'None';
  const cut = ((num(g.attrs.ArrowheadCenterSize, 875) / 100) * lw) / 2;
  for (const o of shafts) {
    const a = add(tail, n, o);
    const b = add(head, n, o);
    const e = headKind !== 'None' && !shaft ? add(b, u, -cut) : b;
    const s = tailKind !== 'None' && !shaft ? add(a, u, cut) : a;
    lineSvg(ctx, { p: s, q: e, width: bold, color, dash });
  }
  if (shaft) {
    // 平衡の矢印: 上の線の先に右半分、下の線の元に左半分 (向きは逆)
    if (headKind !== 'None') arrowHeadSvg(ctx, add(tail, n, -shaft / 2), add(head, n, -shaft / 2), lw, color, 'HalfLeft', size, center, width);
    if (tailKind !== 'None') arrowHeadSvg(ctx, add(head, n, shaft / 2), add(tail, n, shaft / 2), lw, color, 'HalfLeft', size, center, width);
    return;
  }
  if (headKind !== 'None') arrowHeadSvg(ctx, tail, head, lw, color, headKind, size, center, width);
  if (tailKind !== 'None') arrowHeadSvg(ctx, head, tail, lw, color, tailKind, size, center, width);
}

function renderGraphic(ctx: Ctx, g: XNode) {
  const type = g.attrs.GraphicType;
  const bb = nums(g.attrs.BoundingBox);
  if (bb.length < 4) return;
  const color = colorOf(ctx, g.attrs.color);
  const lw = num(g.attrs.LineWidth, ctx.style.lineWidth) / ctx.k;
  if (type === 'Line') {
    // BoundingBox は「先端 x y、元 x y」
    const head = { x: bb[0], y: bb[1] };
    const tail = { x: bb[2], y: bb[3] };
    const arrow = g.attrs.ArrowType ?? 'NoHead';
    const dash = g.attrs.LineType === 'Dashed' ? `${f2(lw * 4)} ${f2(lw * 3)}` : undefined;
    lineSvg(ctx, { p: tail, q: head, width: lw, color, dash });
    if (arrow === 'FullHead' || arrow === 'Resonance' || arrow === 'RetroSynthetic') arrowHeadSvg(ctx, tail, head, lw, color, 'Full', 1000, 875, 250);
    if (arrow === 'Resonance') arrowHeadSvg(ctx, head, tail, lw, color, 'Full', 1000, 875, 250);
    if (arrow === 'HalfHead' || arrow === 'Equilibrium') arrowHeadSvg(ctx, tail, head, lw, color, 'HalfLeft', 1000, 875, 250);
    return;
  }
  const l = Math.min(bb[0], bb[2]);
  const r = Math.max(bb[0], bb[2]);
  const t = Math.min(bb[1], bb[3]);
  const b = Math.max(bb[1], bb[3]);
  if (type === 'Rectangle') {
    const round = (g.attrs.RectangleType ?? '').includes('RoundEdge') ? Math.min(r - l, b - t) * 0.1 : 0;
    const filled = (g.attrs.RectangleType ?? '').includes('Filled');
    ctx.out.push(
      `<rect x="${f2(l)}" y="${f2(t)}" width="${f2(r - l)}" height="${f2(b - t)}"${round ? ` rx="${f2(round)}"` : ''} fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="${f2(lw)}"/>`,
    );
    grow(ctx, l, t);
    grow(ctx, r, b);
    return;
  }
  if (type === 'Oval') {
    // BoundingBox は「中心 x y、長軸の端 x y」のことがある。3D の軸があればそれを使う
    const c3 = nums(g.attrs.Center3D);
    const maj = nums(g.attrs.MajorAxisEnd3D);
    const min = nums(g.attrs.MinorAxisEnd3D);
    let cx = (l + r) / 2;
    let cy = (t + b) / 2;
    let rx = (r - l) / 2;
    let ry = (b - t) / 2;
    if (c3.length >= 2 && maj.length >= 2 && min.length >= 2) {
      cx = c3[0];
      cy = c3[1];
      rx = Math.hypot(maj[0] - cx, maj[1] - cy);
      ry = Math.hypot(min[0] - cx, min[1] - cy);
    }
    const filled = (g.attrs.OvalType ?? '').includes('Filled');
    ctx.out.push(`<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(rx)}" ry="${f2(ry)}" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="${f2(lw)}"/>`);
    grow(ctx, cx - rx, cy - ry);
    grow(ctx, cx + rx, cy + ry);
    return;
  }
  if (type === 'Symbol') {
    // 電荷など: 枠の中心に描く
    const cx = (l + r) / 2;
    const cy = (t + b) / 2;
    const s = Math.max(1, Math.min(r - l, b - t) / 2);
    const sym = g.attrs.SymbolType ?? '';
    const stroke = `stroke="${color}" stroke-width="${f2(lw)}"`;
    if (sym.startsWith('Circle')) ctx.out.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(s)}" fill="none" ${stroke}/>`);
    if (sym.endsWith('Plus')) ctx.out.push(`<path d="M${f2(cx - s * 0.7)} ${f2(cy)} H${f2(cx + s * 0.7)} M${f2(cx)} ${f2(cy - s * 0.7)} V${f2(cy + s * 0.7)}" ${stroke}/>`);
    if (sym.endsWith('Minus')) ctx.out.push(`<path d="M${f2(cx - s * 0.7)} ${f2(cy)} H${f2(cx + s * 0.7)}" ${stroke}/>`);
    if (sym === 'Radical' || sym === 'RadicalCation' || sym === 'RadicalAnion') ctx.out.push(`<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(s * 0.35)}" fill="${color}"/>`);
    if (sym === 'LonePair') {
      for (const k of [-0.45, 0.45]) ctx.out.push(`<circle cx="${f2(cx + k * s)}" cy="${f2(cy)}" r="${f2(s * 0.3)}" fill="${color}"/>`);
    }
    grow(ctx, l, t);
    grow(ctx, r, b);
  }
}

function renderCurve(ctx: Ctx, g: XNode) {
  const pts = nums(g.attrs.CurvePoints);
  if (pts.length < 8) return;
  const color = colorOf(ctx, g.attrs.color);
  const lw = num(g.attrs.LineWidth, ctx.style.lineWidth) / ctx.k;
  // ChemDraw の曲線: 制御点を 3 つずつ (最初と最後の 1 点は向きを決めるだけ)
  const P = [];
  for (let i = 0; i + 1 < pts.length; i += 2) P.push({ x: pts[i], y: pts[i + 1] });
  let d = `M${f2(P[1].x)} ${f2(P[1].y)}`;
  for (let i = 2; i + 2 < P.length; i += 3) d += ` C${f2(P[i].x)} ${f2(P[i].y)} ${f2(P[i + 1].x)} ${f2(P[i + 1].y)} ${f2(P[i + 2].x)} ${f2(P[i + 2].y)}`;
  const closed = g.attrs.Closed === 'yes';
  const filled = (g.attrs.FillType ?? '').includes('Solid');
  ctx.out.push(`<path d="${d}${closed ? ' Z' : ''}" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="${f2(lw)}"/>`);
  for (const p of P) grow(ctx, p.x, p.y);
  const head = g.attrs.ArrowheadHead;
  if (head && head !== 'None' && P.length >= 4) arrowHeadSvg(ctx, P[P.length - 3], P[P.length - 2], lw, color, head, num(g.attrs.HeadSize, 1000), 875, 250);
  const tail = g.attrs.ArrowheadTail;
  if (tail && tail !== 'None' && P.length >= 4) arrowHeadSvg(ctx, P[2], P[1], lw, color, tail, num(g.attrs.HeadSize, 1000), 875, 250);
}

const IMAGE_TYPES: [string, string][] = [
  ['PNG', 'image/png'],
  ['JPEG', 'image/jpeg'],
  ['GIF', 'image/gif'],
  ['BMP', 'image/bmp'],
];

function hexToBase64(hex: string) {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  let bin = '';
  for (let i = 0; i + 1 < clean.length; i += 2) bin += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  return typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
}

function renderEmbedded(ctx: Ctx, g: XNode) {
  const bb = nums(g.attrs.BoundingBox);
  if (bb.length < 4) return;
  const l = Math.min(bb[0], bb[2]);
  const t = Math.min(bb[1], bb[3]);
  const w = Math.abs(bb[2] - bb[0]);
  const h = Math.abs(bb[3] - bb[1]);
  grow(ctx, l, t);
  grow(ctx, l + w, t + h);
  const found = IMAGE_TYPES.find(([k]) => g.attrs[k]);
  if (found) {
    ctx.out.push(`<image x="${f2(l)}" y="${f2(t)}" width="${f2(w)}" height="${f2(h)}" preserveAspectRatio="none" href="data:${found[1]};base64,${hexToBase64(g.attrs[found[0]])}"/>`);
    return;
  }
  // EMF などはブラウザで描けないので、場所だけ示す
  ctx.out.push(`<rect x="${f2(l)}" y="${f2(t)}" width="${f2(w)}" height="${f2(h)}" fill="#f4f4f4" stroke="#bbbbbb" stroke-width="${f2(0.5 / ctx.k)}"/>`);
}

function renderChildren(ctx: Ctx, node: XNode) {
  const list = elements(node)
    .map((el, i) => ({ el, i, z: num(el.attrs.Z, 0) }))
    .sort((a, b) => a.z - b.z || a.i - b.i);
  for (const { el } of list) {
    if (el.attrs.Visible === 'no' || el.attrs.SupersededBy) continue;
    switch (el.name) {
      case 'fragment':
        renderFragment(ctx, el);
        break;
      case 't':
        renderCaption(ctx, el);
        break;
      case 'graphic':
        renderGraphic(ctx, el);
        break;
      case 'arrow':
        renderArrow(ctx, el);
        break;
      case 'curve':
        renderCurve(ctx, el);
        break;
      case 'embeddedobject':
        renderEmbedded(ctx, el);
        break;
      case 'page':
      case 'group':
      case 'altgroup':
      case 'bracketedgroup':
        renderChildren(ctx, el);
        break;
    }
  }
}

export interface CdxmlDrawing {
  /** SVG の中身 (座標は box の左上を 0,0、scale 倍した pt) */
  inner: string;
  /** 描いた範囲 (CDXML の座標、pt) */
  box: Rect;
}

/** 範囲: ChemDraw が書いた枠があればそれ (ChemDraw に戻すときも同じ枠で位置を合わせる) */
export function cdxmlBox(root: XNode, drawn: Rect | null): Rect | null {
  const bb = nums(root.attrs.BoundingBox);
  if (bb.length === 4 && bb[2] > bb[0] && bb[3] > bb[1]) return { l: bb[0], t: bb[1], r: bb[2], b: bb[3] };
  return drawn;
}

const cache = new Map<string, CdxmlDrawing | null>();

/**
 * CDXML を描く。scale は図の上での倍率 (1 = ChemDraw の大きさ)。
 * 線の太さなどの書式は倍率によらず同じ太さにする
 */
export function drawCdxml(text: string, scale = 1): CdxmlDrawing | null {
  const key = `${scale.toFixed(4)}:${text.length}:${text.slice(0, 64)}:${hashText(text)}`;
  if (cache.has(key)) return cache.get(key)!;
  const root = readCdxml(text);
  let result: CdxmlDrawing | null = null;
  if (root) {
    const ctx: Ctx = { style: docStyle(root), colors: colorTable(root), fonts: fontTable(root), k: scale, out: [], box: null };
    renderChildren(ctx, root);
    const box = cdxmlBox(root, ctx.box);
    if (box && ctx.out.length) {
      result = {
        inner: `<g transform="scale(${f2(scale)}) translate(${f2(-box.l)} ${f2(-box.t)})" stroke-linecap="butt">${ctx.out.join('')}</g>`,
        box,
      };
    }
  }
  if (cache.size > 60) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

/** 1 つの SVG として (倍率 1)。保存・書き出し用 */
export function cdxmlToSvg(text: string): { svg: string; width: number; height: number } | null {
  const d = drawCdxml(text, 1);
  if (!d) return null;
  const w = d.box.r - d.box.l;
  const h = d.box.b - d.box.t;
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f2(w)} ${f2(h)}" width="${f2(w)}pt" height="${f2(h)}pt">${d.inner}</svg>`,
    width: w,
    height: h,
  };
}

function hashText(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ---- 原子の位置 (帰属のマーカーを原子の横に置くため) ----

export interface AtomSite {
  /** CDXML の原子の id */
  id: string;
  x: number;
  y: number;
  /** 原子に文字 (O, NH など) があるか */
  labeled: boolean;
  /** 結合のない側 (単位ベクトル)。マーカーはこちらに置く */
  dir: { x: number; y: number };
}

const siteCache = new Map<string, AtomSite[]>();

/** 構造式の原子 (見えるもの) の位置と、結合のない向き。座標は CDXML のまま (pt) */
export function cdxmlAtomSites(text: string): AtomSite[] {
  const key = `${text.length}:${hashText(text)}`;
  const hit = siteCache.get(key);
  if (hit) return hit;
  const out: AtomSite[] = [];
  const root = readCdxml(text);
  const visit = (node: XNode) => {
    for (const el of elements(node)) {
      if (el.attrs.Visible === 'no' || el.attrs.SupersededBy) continue;
      if (el.name === 'fragment') fragmentSites(el, out);
      else if (el.name === 'page' || el.name === 'group' || el.name === 'altgroup' || el.name === 'bracketedgroup') visit(el);
    }
  };
  if (root) visit(root);
  if (siteCache.size > 60) siteCache.delete(siteCache.keys().next().value!);
  siteCache.set(key, out);
  return out;
}

function fragmentSites(frag: XNode, out: AtomSite[]) {
  const atoms = new Map<string, { x: number; y: number; labeled: boolean; nb: string[] }>();
  for (const n of elements(frag, 'n')) {
    const p = nums(n.attrs.p);
    if (p.length < 2 || n.attrs.NodeType === 'ExternalConnectionPoint' || n.attrs.Visible === 'no') continue;
    const t = firstElement(n, 't');
    atoms.set(n.attrs.id, { x: p[0], y: p[1], labeled: !!t && t.attrs.Visible !== 'no', nb: [] });
  }
  for (const b of elements(frag, 'b')) {
    const a = atoms.get(b.attrs.B);
    const e = atoms.get(b.attrs.E);
    if (!a || !e) continue;
    a.nb.push(b.attrs.E);
    e.nb.push(b.attrs.B);
  }
  const list = [...atoms.values()];
  const cx = list.reduce((s, a) => s + a.x, 0) / (list.length || 1);
  const cy = list.reduce((s, a) => s + a.y, 0) / (list.length || 1);
  for (const [id, a] of atoms) {
    // 結合の向きを足して逆を向く。釣り合っているとき (3 本が 120° など) は構造式の外側
    let dx = 0;
    let dy = 0;
    for (const other of a.nb) {
      const o = atoms.get(other)!;
      const L = Math.hypot(o.x - a.x, o.y - a.y) || 1;
      dx -= (o.x - a.x) / L;
      dy -= (o.y - a.y) / L;
    }
    if (Math.hypot(dx, dy) < 0.3) {
      dx = a.x - cx;
      dy = a.y - cy;
    }
    const L = Math.hypot(dx, dy);
    out.push({ id, x: a.x, y: a.y, labeled: a.labeled, dir: L < 1e-6 ? { x: 0, y: -1 } : { x: dx / L, y: dy / L } });
  }
}

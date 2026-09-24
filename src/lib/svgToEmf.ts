/**
 * 画面に出ている図 (SVG) を EMF に書き写す (ブラウザの中でだけ使う)。
 * 文字の位置・送り幅はブラウザが描いた位置をそのまま使うので、画面と同じ並びになる。
 * 使うもの: path / line / polyline / polygon / rect / circle / ellipse / text (tspan) / image / use、clip-path、opacity
 */
import { EMF_SCALE, EmfWriter, type PathCmd } from './emf';

type Pt = [number, number];

const SKIP = new Set(['defs', 'clipPath', 'mask', 'style', 'title', 'desc', 'metadata', 'marker', 'pattern', 'linearGradient', 'radialGradient', 'symbol', 'script', 'foreignObject']);

/** 図の SVG (文書に入れてあるもの) を EMF にする。width, height は図の大きさ (px) */
export async function svgToEmf(root: SVGSVGElement, width: number, height: number): Promise<Uint8Array> {
  const out = new EmfWriter(width, height);
  const S = EMF_SCALE;
  const rootInv = root.getScreenCTM()!.inverse();
  const ctmOf = (el: Element) => {
    const m = (el as SVGGraphicsElement).getScreenCTM?.();
    return m ? rootInv.multiply(m) : new DOMMatrix();
  };
  const pt = (m: DOMMatrix, x: number, y: number): Pt => {
    const p = new DOMPoint(x, y).matrixTransform(m);
    return [Math.round(p.x * S), Math.round(p.y * S)];
  };
  const scaleOf = (m: DOMMatrix) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;

  async function walk(el: Element, opacity: number) {
    for (const child of Array.from(el.children)) {
      const tag = child.localName;
      if (SKIP.has(tag)) continue;
      const cs = getComputedStyle(child);
      if (cs.display === 'none') continue;
      const op = opacity * num(cs.opacity, 1);
      const clipRef = /url\(["']?#([^"')]+)["']?\)/.exec(child.getAttribute('clip-path') ?? cs.clipPath ?? '');
      const clipEl = clipRef ? root.querySelector(`#${CSS.escape(clipRef[1])}`) : null;
      if (clipEl) out.clip(clipFigures(clipEl, ctmOf(child)));
      await draw(child, cs, op, ctmOf(child));
      if (clipEl) out.restore();
    }
  }

  async function draw(el: Element, cs: CSSStyleDeclaration, op: number, m: DOMMatrix) {
    const tag = el.localName;
    if (tag === 'g' || tag === 'svg' || tag === 'a' || tag === 'switch') return walk(el, op);
    if (tag === 'text') return drawText(el as SVGTextElement, cs, op);
    if (tag === 'image') return drawImage(el as SVGImageElement, m, op);
    if (tag === 'use') {
      const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
      const ref = href.startsWith('#') ? root.querySelector(`#${CSS.escape(href.slice(1))}`) : null;
      if (!ref) return;
      const x = num(el.getAttribute('x'), 0);
      const y = num(el.getAttribute('y'), 0);
      const own = (ref as SVGGraphicsElement).transform?.baseVal.consolidate()?.matrix;
      let mm = m.translate(x, y);
      if (own) mm = mm.multiply(DOMMatrix.fromMatrix(own));
      const figs = shapeFigures(ref, mm);
      if (figs) paintShape(figs, getComputedStyle(ref), op * num(getComputedStyle(ref).opacity, 1), mm, ref.localName);
      return;
    }
    if (cs.visibility === 'hidden') return;
    const figs = shapeFigures(el, m);
    if (figs) paintShape(figs, cs, op, m, tag);
  }

  function paintShape(figs: PathCmd[], cs: CSSStyleDeclaration, op: number, m: DOMMatrix, tag: string) {
    const fill = tag === 'line' ? null : paint(cs.fill, num(cs.fillOpacity, 1) * op);
    const stroke = paint(cs.stroke, num(cs.strokeOpacity, 1) * op);
    const sw = parseFloat(cs.strokeWidth) || 0;
    const hasStroke = !!stroke && sw > 0;
    if (!fill && !hasStroke) return;
    const k = scaleOf(m) * S;
    out.brush(fill);
    if (hasStroke) {
      const dash = cs.strokeDasharray && cs.strokeDasharray !== 'none' ? cs.strokeDasharray.split(/[\s,]+/).map((v) => (parseFloat(v) || 0) * k) : null;
      const cap = cs.strokeLinecap === 'round' ? 'round' : cs.strokeLinecap === 'square' ? 'square' : 'butt';
      const join = cs.strokeLinejoin === 'round' ? 'round' : cs.strokeLinejoin === 'bevel' ? 'bevel' : 'miter';
      out.pen({ color: stroke!, width: sw * k, dash: dash && dash.some((v) => v > 0) ? dash : null, cap, join });
    } else out.pen(null);
    out.path(figs, hasStroke, !!fill, cs.fillRule === 'evenodd');
  }

  function shapeFigures(el: Element, m: DOMMatrix): PathCmd[] | null {
    const a = (name: string) => num(el.getAttribute(name), 0);
    switch (el.localName) {
      case 'path':
        return pathFigures(el.getAttribute('d') ?? '', m);
      case 'line':
        return [
          { t: 'M', p: pt(m, a('x1'), a('y1')) },
          { t: 'L', p: pt(m, a('x2'), a('y2')) },
        ];
      case 'polyline':
      case 'polygon': {
        const v = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
        const figs: PathCmd[] = [];
        for (let i = 0; i + 1 < v.length; i += 2) figs.push({ t: i ? 'L' : 'M', p: pt(m, v[i], v[i + 1]) } as PathCmd);
        if (el.localName === 'polygon' && figs.length) figs.push({ t: 'Z' });
        return figs;
      }
      case 'rect': {
        const x = a('x');
        const y = a('y');
        const w = a('width');
        const h = a('height');
        if (w <= 0 || h <= 0) return null;
        return [{ t: 'M', p: pt(m, x, y) }, { t: 'L', p: pt(m, x + w, y) }, { t: 'L', p: pt(m, x + w, y + h) }, { t: 'L', p: pt(m, x, y + h) }, { t: 'Z' }];
      }
      case 'circle':
        return ellipseFigures(a('cx'), a('cy'), a('r'), a('r'), m);
      case 'ellipse':
        return ellipseFigures(a('cx'), a('cy'), a('rx'), a('ry'), m);
    }
    return null;
  }

  function ellipseFigures(cx: number, cy: number, rx: number, ry: number, m: DOMMatrix): PathCmd[] | null {
    if (rx <= 0 || ry <= 0) return null;
    const k = 0.5522847;
    const P = (x: number, y: number) => pt(m, cx + x, cy + y);
    return [
      { t: 'M', p: P(rx, 0) },
      { t: 'C', p: [P(rx, ry * k), P(rx * k, ry), P(0, ry)] },
      { t: 'C', p: [P(-rx * k, ry), P(-rx, ry * k), P(-rx, 0)] },
      { t: 'C', p: [P(-rx, -ry * k), P(-rx * k, -ry), P(0, -ry)] },
      { t: 'C', p: [P(rx * k, -ry), P(rx, -ry * k), P(rx, 0)] },
      { t: 'Z' },
    ];
  }

  function pathFigures(d: string, m: DOMMatrix): PathCmd[] {
    const figs: PathCmd[] = [];
    for (const c of parsePath(d)) {
      if (c.t === 'Z') figs.push({ t: 'Z' });
      else if (c.t === 'C') figs.push({ t: 'C', p: [pt(m, c.p[0], c.p[1]), pt(m, c.p[2], c.p[3]), pt(m, c.p[4], c.p[5])] });
      else figs.push({ t: c.t, p: pt(m, c.p[0], c.p[1]) });
    }
    return figs;
  }

  function clipFigures(clip: Element, m: DOMMatrix): PathCmd[] {
    const figs: PathCmd[] = [];
    for (const c of Array.from(clip.children)) {
      const own = (c as SVGGraphicsElement).transform?.baseVal.consolidate()?.matrix;
      const f = shapeFigures(c, own ? m.multiply(DOMMatrix.fromMatrix(own)) : m);
      if (f) figs.push(...f);
    }
    return figs;
  }

  function drawText(text: SVGTextElement, cs: CSSStyleDeclaration, op: number) {
    if (cs.visibility === 'hidden') return;
    const n = text.getNumberOfChars();
    if (!n) return;
    const m = ctmOf(text);
    const chars = renderedChars(text);
    if (chars.length !== n) {
      // 空白のまとめ方が合わないときは、文字全体を 1 つの書式で
      const all = (text.textContent ?? '').replace(/\s+/g, ' ').trim();
      chars.length = 0;
      for (let i = 0; i < n; i++) chars.push({ ch: all[i] ?? ' ', owner: text });
    }
    const S2 = S;
    type Run = { start: number; end: number };
    const runs: Run[] = [];
    const posOf = (i: number) => text.getStartPositionOfChar(i).matrixTransform(m);
    const endOf = (i: number) => text.getEndPositionOfChar(i).matrixTransform(m);
    const styleKey = (el: Element) => {
      const c = getComputedStyle(el);
      return [c.fontFamily, c.fontSize, c.fontWeight, c.fontStyle, c.fill, c.textDecorationLine].join('|');
    };
    for (let i = 0; i < n; i++) {
      const last = runs[runs.length - 1];
      if (last && styleKey(chars[i].owner) === styleKey(chars[last.end - 1].owner)) {
        // 前の字の終わりから続いていれば同じ行
        const e = endOf(i - 1);
        const s = posOf(i);
        if (Math.hypot(e.x - s.x, e.y - s.y) < 0.5 && text.getRotationOfChar(i) === text.getRotationOfChar(i - 1)) {
          last.end = i + 1;
          continue;
        }
      }
      runs.push({ start: i, end: i + 1 });
    }
    for (const run of runs) {
      const owner = chars[run.start].owner;
      const c = getComputedStyle(owner);
      const color = paint(c.fill, num(c.fillOpacity, 1) * op);
      if (!color) continue;
      const s = posOf(run.start);
      const e = endOf(run.start);
      const angle = Math.atan2(e.y - s.y, e.x - s.x);
      const dx: number[] = [];
      for (let i = run.start; i < run.end; i++) {
        const a = posOf(i);
        const b = i + 1 < run.end ? posOf(i + 1) : endOf(i);
        dx.push(Math.hypot(b.x - a.x, b.y - a.y) * S2);
      }
      const size = (parseFloat(c.fontSize) || 10) * scaleOf(m);
      let esc = Math.round((-angle * 1800) / Math.PI);
      if (esc < 0) esc += 3600;
      out.text(
        chars
          .slice(run.start, run.end)
          .map((x) => x.ch)
          .join(''),
        Math.round(s.x * S2),
        Math.round(s.y * S2),
        { face: faceOf(c.fontFamily), height: size * S2, bold: (parseInt(c.fontWeight, 10) || 400) >= 600, italic: c.fontStyle === 'italic' || c.fontStyle === 'oblique', underline: c.textDecorationLine.includes('underline'), escapement: esc },
        color,
        dx,
      );
    }
  }

  async function drawImage(el: SVGImageElement, m: DOMMatrix, op: number) {
    const href = el.getAttribute('href') ?? el.getAttribute('xlink:href') ?? '';
    if (!href) return;
    const x = el.x.baseVal.value;
    const y = el.y.baseVal.value;
    const w = el.width.baseVal.value;
    const h = el.height.baseVal.value;
    if (w <= 0 || h <= 0) return;
    const img = new Image();
    img.src = href;
    try {
      await img.decode();
    } catch {
      return;
    }
    const maxSide = 2400;
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const pw = Math.max(1, Math.round(img.naturalWidth * k));
    const ph = Math.max(1, Math.round(img.naturalHeight * k));
    const canvas = document.createElement('canvas');
    canvas.width = pw;
    canvas.height = ph;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, pw, ph);
    g.globalAlpha = op;
    g.drawImage(img, 0, 0, pw, ph);
    const data = g.getImageData(0, 0, pw, ph).data;
    const rgb = new Uint8Array(pw * ph * 3);
    for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
      rgb[j] = data[i];
      rgb[j + 1] = data[i + 1];
      rgb[j + 2] = data[i + 2];
    }
    const [x0, y0] = pt(m, x, y);
    const [x1, y1] = pt(m, x + w, y + h);
    out.image(rgb, pw, ph, Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
  }

  await walk(root, 1);
  return out.finish();
}

function num(v: string | null | undefined, d: number) {
  const n = v == null ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
}

/** 計算済みの色 (rgb(...)) → #rrggbb。透明度は白の上に重ねた色にする */
function paint(v: string, alpha: number): string | null {
  if (!v || v === 'none' || v.startsWith('url')) return null;
  const m = /rgba?\(([^)]+)\)/.exec(v);
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    [r, g, b] = parts;
    if (parts.length > 3) a = parts[3];
  } else if (/^#[0-9a-f]{6}$/i.test(v)) {
    r = parseInt(v.slice(1, 3), 16);
    g = parseInt(v.slice(3, 5), 16);
    b = parseInt(v.slice(5, 7), 16);
  } else return null;
  const t = Math.max(0, Math.min(1, a * alpha));
  if (t <= 0.001) return null;
  const mix = (c: number) => Math.round(255 - (255 - c) * t);
  return '#' + [mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('');
}

function faceOf(family: string) {
  const first = (family.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '');
  if (!first || first === 'serif') return 'Times New Roman';
  if (first === 'sans-serif' || first === 'system-ui') return 'Arial';
  if (first === 'monospace') return 'Courier New';
  return first;
}

/** 描かれる順の文字と、その書式を持つ要素 (空白は SVG と同じくまとめる) */
function renderedChars(text: SVGTextElement): { ch: string; owner: Element }[] {
  const out: { ch: string; owner: Element }[] = [];
  const visit = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const owner = child.parentElement ?? text;
        for (const ch of (child.textContent ?? '').replace(/[\r\n]/g, '').replace(/\t/g, ' ')) {
          if (ch === ' ' && (!out.length || out[out.length - 1].ch === ' ')) continue;
          // サロゲートペアは 2 つ分 (getNumberOfChars は UTF-16 の数)
          out.push({ ch, owner });
          if (ch.length > 1) out.push({ ch: '', owner });
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) visit(child);
    }
  };
  visit(text);
  while (out.length && out[out.length - 1].ch === ' ') out.pop();
  return out;
}

type Cmd = { t: 'M' | 'L'; p: number[] } | { t: 'C'; p: number[] } | { t: 'Z' };

/** SVG の d を、絶対座標の M / L / C / Z にする (H V Q T S A も直す) */
export function parsePath(d: string): Cmd[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Cmd[] = [];
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let lastC: [number, number] | null = null;
  let lastQ: [number, number] | null = null;
  const next = () => parseFloat(tokens[i++]);
  const hasNum = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      out.push({ t: 'Z' });
      x = sx;
      y = sy;
      lastC = lastQ = null;
      continue;
    }
    if (!hasNum()) {
      continue;
    }
    switch (C) {
      case 'M': {
        const nx = next() + (rel ? x : 0);
        const ny = next() + (rel ? y : 0);
        out.push({ t: 'M', p: [nx, ny] });
        x = sx = nx;
        y = sy = ny;
        cmd = rel ? 'l' : 'L';
        lastC = lastQ = null;
        break;
      }
      case 'L': {
        x = next() + (rel ? x : 0);
        y = next() + (rel ? y : 0);
        out.push({ t: 'L', p: [x, y] });
        lastC = lastQ = null;
        break;
      }
      case 'H':
        x = next() + (rel ? x : 0);
        out.push({ t: 'L', p: [x, y] });
        lastC = lastQ = null;
        break;
      case 'V':
        y = next() + (rel ? y : 0);
        out.push({ t: 'L', p: [x, y] });
        lastC = lastQ = null;
        break;
      case 'C': {
        const p = [next(), next(), next(), next(), next(), next()];
        if (rel) for (let k = 0; k < 6; k += 2) (p[k] += x, p[k + 1] += y);
        out.push({ t: 'C', p });
        lastC = [p[2], p[3]];
        lastQ = null;
        x = p[4];
        y = p[5];
        break;
      }
      case 'S': {
        const p = [next(), next(), next(), next()];
        if (rel) for (let k = 0; k < 4; k += 2) (p[k] += x, p[k + 1] += y);
        const c1: [number, number] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y];
        out.push({ t: 'C', p: [c1[0], c1[1], p[0], p[1], p[2], p[3]] });
        lastC = [p[0], p[1]];
        lastQ = null;
        x = p[2];
        y = p[3];
        break;
      }
      case 'Q':
      case 'T': {
        let q: [number, number];
        let ex: number;
        let ey: number;
        if (C === 'Q') {
          q = [next() + (rel ? x : 0), next() + (rel ? y : 0)];
          ex = next() + (rel ? x : 0);
          ey = next() + (rel ? y : 0);
        } else {
          q = lastQ ? [2 * x - lastQ[0], 2 * y - lastQ[1]] : [x, y];
          ex = next() + (rel ? x : 0);
          ey = next() + (rel ? y : 0);
        }
        out.push({ t: 'C', p: [x + (2 / 3) * (q[0] - x), y + (2 / 3) * (q[1] - y), ex + (2 / 3) * (q[0] - ex), ey + (2 / 3) * (q[1] - ey), ex, ey] });
        lastQ = q;
        lastC = null;
        x = ex;
        y = ey;
        break;
      }
      case 'A': {
        const rx = Math.abs(next());
        const ry = Math.abs(next());
        const rot = next();
        const large = next() !== 0;
        const sweep = next() !== 0;
        const ex = next() + (rel ? x : 0);
        const ey = next() + (rel ? y : 0);
        for (const c of arcToBeziers(x, y, rx, ry, rot, large, sweep, ex, ey)) out.push({ t: 'C', p: c });
        x = ex;
        y = ey;
        lastC = lastQ = null;
        break;
      }
      default:
        i++;
    }
  }
  return out;
}

function arcToBeziers(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number): number[][] {
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num2 = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num2 / den));
  if (large === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    return a;
  };
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / segs;
  const k = (4 / 3) * Math.tan(step / 4);
  const out: number[][] = [];
  const P = (t: number) => {
    const ex = Math.cos(t) * rx;
    const ey = Math.sin(t) * ry;
    return [cos * ex - sin * ey + cx, sin * ex + cos * ey + cy];
  };
  const D = (t: number) => {
    const ex = -Math.sin(t) * rx;
    const ey = Math.cos(t) * ry;
    return [cos * ex - sin * ey, sin * ex + cos * ey];
  };
  for (let s = 0; s < segs; s++) {
    const a = t1 + s * step;
    const b = a + step;
    const p0 = P(a);
    const p3 = P(b);
    const d0 = D(a);
    const d3 = D(b);
    out.push([p0[0] + k * d0[0], p0[1] + k * d0[1], p3[0] - k * d3[0], p3[1] - k * d3[1], p3[0], p3[1]]);
  }
  return out;
}

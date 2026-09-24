import { describe, expect, it } from 'vitest';
import { cdxmlToSvg, drawCdxml, looksLikeCdxml } from './cdxml';
import { elements, parseXml, walk, type XNode } from './xml';

/** ChemDraw (ACS Document 1996) と同じ書式の、小さな CDXML */
function doc(body: string) {
  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE CDXML SYSTEM "https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd" >
<CDXML BoundingBox="-20 -20 60 30" LabelFont="3" LabelSize="10" LabelFace="96" CaptionFont="3" CaptionSize="10" HashSpacing="2.50" MarginWidth="1.60" LineWidth="0.60" BoldWidth="2" BondLength="14.40" BondSpacing="18" color="0" bgcolor="1"><colortable>
<color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="1" g="0" b="0"/></colortable><fonttable>
<font id="3" charset="iso-8859-1" name="Arial"/></fonttable><page id="1"><fragment id="2">${body}</fragment></page></CDXML>`;
}
const n = (id: number, x: number, y: number) => `<n id="${id}" p="${x} ${y}"/>`;
const label = (id: number, x: number, y: number, text: string, attrs = '') =>
  `<n id="${id}" p="${x} ${y}" Element="8"><t p="${x - 3.89} ${y + 3.9}" ${attrs}><s font="3" size="10" color="0" face="96">${text}</s></t></n>`;
const b = (id: number, from: number, to: number, attrs = '') => `<b id="${id}" B="${from}" E="${to}" ${attrs}/>`;

function draw(body: string) {
  const d = drawCdxml(doc(body), 1)!;
  const root = parseXml(`<g>${d.inner}</g>`)!;
  const all: XNode[] = [];
  walk(root, (x) => all.push(x));
  return { d, all, lines: all.filter((x) => x.name === 'line').map((x) => ['x1', 'y1', 'x2', 'y2'].map((k) => Number(x.attrs[k]))) };
}

describe('CDXML の描画', () => {
  it('CDXML らしい文字を見分ける', () => {
    expect(looksLikeCdxml(doc(''))).toBe(true);
    expect(looksLikeCdxml('CCO')).toBe(false);
  });

  it('範囲は ChemDraw が書いた枠 (ChemDraw に戻すときも同じ枠で合わせる)', () => {
    const { d } = draw(n(1, 0, 0) + n(2, 14.4, 0) + b(3, 1, 2));
    expect(d.box).toEqual({ l: -20, t: -20, r: 60, b: 30 });
    const svg = cdxmlToSvg(doc(n(1, 0, 0) + n(2, 14.4, 0) + b(3, 1, 2)))!;
    expect(svg.width).toBe(80);
    expect(svg.height).toBe(50);
  });

  it('左向きの文字は並びを逆にして右をそろえる (OH → HO)', () => {
    const { all } = draw(label(1, 0, 0, 'OH', 'LabelJustification="Right" LabelAlignment="Right"') + n(2, 12.47, 7.2) + b(3, 1, 2));
    const text = all.find((x) => x.name === 'text')!;
    expect(text.attrs['text-anchor']).toBe('end');
    expect(elements(text, 'tspan').map((s) => s.children.join('')).join('')).toBe('HO');
  });

  it('化学式の数字は下付き (NH2 の 2)', () => {
    const { all } = draw(label(1, 0, 0, 'NH2') + n(2, -12.47, 7.2) + b(3, 1, 2));
    const two = all.find((x) => x.name === 'tspan' && x.children.join('') === '2')!;
    expect(Number(two.attrs['font-size'])).toBeCloseTo(7.5);
    expect(Number(two.attrs.dy)).toBeCloseTo(2.1);
  });

  it('末端の C=O は中央に 2 本', () => {
    const { lines } = draw(n(1, 0, 0) + n(2, -12.47, 7.2) + n(3, 12.47, 7.2) + label(4, 0, -14.4, 'O') + b(5, 1, 2) + b(6, 1, 3) + b(7, 1, 4, 'Order="2"'));
    const xs = lines.map((l) => l[0]).sort((a, c) => a - c);
    expect(xs[0]).toBeCloseTo(-1.296, 2);
    expect(xs[1]).toBeCloseTo(1.296, 2);
  });

  it('環の二重結合の 2 本目は環の内側で、両端を縮める', () => {
    // 六員環 (中心 0,0)
    const pts = Array.from({ length: 6 }, (_, i) => [14.4 * Math.cos((Math.PI / 3) * i + Math.PI / 6), 14.4 * Math.sin((Math.PI / 3) * i + Math.PI / 6)]);
    const body = pts.map(([x, y], i) => n(i + 1, x, y)).join('') + pts.map((_, i) => b(10 + i, i + 1, ((i + 1) % 6) + 1, i === 0 ? 'Order="2"' : '')).join('');
    const { lines } = draw(body);
    expect(lines).toHaveLength(1);
    const [x1, y1, x2, y2] = lines[0];
    const mid = Math.hypot((x1 + x2) / 2, (y1 + y2) / 2);
    const bondMid = Math.hypot((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    expect(mid).toBeLessThan(bondMid);
    expect(Math.hypot(x2 - x1, y2 - y1)).toBeLessThan(14.4 - 2);
  });

  it('置換基が両側に 1 つずつの二重結合 (E 体) は、B → E の左側', () => {
    const { lines } = draw(n(1, 0, 0) + n(2, 12.47, 7.2) + n(3, 24.94, 0) + n(4, 37.41, 7.2) + b(5, 1, 2) + b(6, 2, 3, 'Order="2"') + b(7, 3, 4));
    expect(lines).toHaveLength(1);
    const [x1, y1, x2, y2] = lines[0];
    // B (12.47, 7.2) → E (24.94, 0) の右の法線
    const dx = 12.47;
    const dy = -7.2;
    const L = Math.hypot(dx, dy);
    const right = { x: -dy / L, y: dx / L };
    const side = ((x1 + x2) / 2 - 18.705) * right.x + ((y1 + y2) / 2 - 3.6) * right.y;
    expect(side).toBeLessThan(0);
  });

  it('破線のくさび: 細い側から間隔ごとに、原子の上には引かず、太い側ほど長い', () => {
    const { lines } = draw(n(1, 0, 0) + n(2, 14.4, 0) + b(3, 1, 2, 'Display="WedgedHashBegin"'));
    expect(lines.length).toBe(4);
    const xs = lines.map((l) => l[0]);
    expect(Math.min(...xs)).toBeGreaterThan(0.5);
    expect(Math.max(...xs)).toBeLessThan(14);
    const lens = lines.map((l) => Math.abs(l[3] - l[1]));
    expect(lens).toEqual([...lens].sort((a, c) => a - c));
  });

  it('すべて 1.5 の環は円で描く', () => {
    const pts = Array.from({ length: 6 }, (_, i) => [14.4 * Math.cos((Math.PI / 3) * i), 14.4 * Math.sin((Math.PI / 3) * i)]);
    const body = pts.map(([x, y], i) => n(i + 1, x, y)).join('') + pts.map((_, i) => b(10 + i, i + 1, ((i + 1) % 6) + 1, 'Order="1.5"')).join('');
    const { all } = draw(body);
    expect(all.filter((x) => x.name === 'circle')).toHaveLength(1);
  });

  it('拡大しても線の太さは ChemDraw の書式のまま', () => {
    const d = drawCdxml(doc(n(1, 0, 0) + n(2, 14.4, 0) + b(3, 1, 2)), 2)!;
    // 全体を 2 倍する代わりに、線の太さを半分で書く
    expect(d.inner).toContain('scale(2)');
    expect(d.inner).toContain('stroke-width="0.3"');
  });
});

import { describe, expect, it } from 'vitest';
import { EmfWriter } from './emf';
import { parsePath } from './svgToEmf';

/** EMF の記録を順に読む */
function records(bytes: Uint8Array) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: { type: number; size: number; off: number }[] = [];
  for (let off = 0; off < bytes.length; ) {
    const type = v.getUint32(off, true);
    const size = v.getUint32(off + 4, true);
    out.push({ type, size, off });
    if (size < 8) break;
    off += size;
  }
  return { v, out };
}

describe('EMF', () => {
  it('見出し・記録の大きさ・数がそろっている', () => {
    const w = new EmfWriter(400, 300);
    w.pen({ color: '#d12b2b', width: 50, dash: null, cap: 'butt', join: 'miter' });
    w.brush(null);
    w.path(
      [
        { t: 'M', p: [0, 0] },
        { t: 'L', p: [1000, 500] },
        { t: 'C', p: [[1200, 600], [1400, 700], [2000, 100]] },
      ],
      true,
      false,
    );
    w.text('δ 7.26', 500, 800, { face: 'Times New Roman', height: 600, bold: false, italic: false, underline: false, escapement: 900 }, '#000000', [300, 150, 300, 150, 300, 300]);
    const bytes = w.finish();
    const { v, out } = records(bytes);
    expect(out[0].type).toBe(1);
    expect(v.getUint32(40, true)).toBe(0x464d4520); // " EMF"
    expect(v.getUint32(48, true)).toBe(bytes.length);
    expect(v.getUint32(52, true)).toBe(out.length);
    expect(out.every((r) => r.size % 4 === 0)).toBe(true);
    expect(out[out.length - 1].type).toBe(14);
    expect(out.reduce((s, r) => s + r.size, 0)).toBe(bytes.length);
    // 枠 (0.01 mm) は図の大きさ (96 dpi)
    expect(v.getInt32(32, true)).toBe(Math.round((400 * 2540) / 96));
    // 文字: 字体の名前と、UTF-16 の文字
    const font = out.find((r) => r.type === 82)!;
    const face = String.fromCharCode(...Array.from({ length: 15 }, (_, i) => v.getUint16(font.off + 12 + 28 + i * 2, true)));
    expect(face).toBe('Times New Roman');
    expect(v.getInt32(font.off + 12 + 8, true)).toBe(900);
    const text = out.find((r) => r.type === 84)!;
    expect(v.getUint32(text.off + 44, true)).toBe(6);
    expect(v.getUint16(text.off + 76, true)).toBe('δ'.charCodeAt(0));
  });

  it('線を作り直すときは前の線を捨てる', () => {
    const w = new EmfWriter(10, 10);
    const pen = { color: '#000000', width: 10, dash: null, cap: 'butt' as const, join: 'miter' as const };
    w.pen(pen);
    w.pen(pen);
    w.pen({ ...pen, color: '#ff0000' });
    const { out } = records(w.finish());
    expect(out.filter((r) => r.type === 95)).toHaveLength(2);
    expect(out.filter((r) => r.type === 40)).toHaveLength(1);
  });
});

describe('SVG の d', () => {
  it('相対・H V・Q・A を M L C に直す', () => {
    const cmds = parsePath('M10 10 h5 v5 l-5 0 z M0 0 q10 0 10 10 A5 5 0 0 1 20 20');
    expect(cmds.slice(0, 5)).toEqual([
      { t: 'M', p: [10, 10] },
      { t: 'L', p: [15, 10] },
      { t: 'L', p: [15, 15] },
      { t: 'L', p: [10, 15] },
      { t: 'Z' },
    ]);
    const q = cmds[6];
    expect(q.t).toBe('C');
    expect(q.t === 'C' && q.p.slice(4)).toEqual([10, 10]);
    const last = cmds[cmds.length - 1];
    expect(last.t === 'C' && last.p.slice(4).map((x) => Math.round(x * 1000) / 1000)).toEqual([20, 20]);
  });
});

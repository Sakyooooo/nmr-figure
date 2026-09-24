import { describe, expect, it } from 'vitest';
import { buildChemDrawDocument } from './chemdrawExport';
import { readCdxml } from './cdxml';
import { walk, type XNode } from './xml';

/** 構造式 1 つ (C-C=O と赤い字の N)。枠は 0 0 40 20 */
function structure(fontName = 'Arial', lineWidth = '0.60') {
  return `<?xml version="1.0" encoding="UTF-8" ?><CDXML BoundingBox="0 0 40 20" LabelFont="3" LabelSize="10" CaptionFont="3" LineWidth="${lineWidth}" BoldWidth="2" BondSpacing="18" HashSpacing="2.50" MarginWidth="1.60"><colortable>
<color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="1" g="0" b="0"/></colortable><fonttable><font id="3" charset="iso-8859-1" name="${fontName}"/></fonttable>
<page id="1"><fragment id="2" BoundingBox="0 0 40 20" Z="1"><n id="3" p="0 10" Z="2"/><n id="4" p="12 4" Z="3"/><n id="5" p="24 10" Z="4" Element="7"><t p="20 14" BoundingBox="20 6 28 14"><s font="3" size="10" color="4" face="96">N</s></t></n>
<b id="6" B="3" E="4" Z="5"/><b id="7" B="4" E="5" Order="2" Z="6"/></fragment></page></CDXML>`;
}

function all(root: XNode) {
  const out: XNode[] = [];
  walk(root, (x) => out.push(x));
  return out;
}

describe('ChemDraw で開く (CDXML を組み立てる)', () => {
  const xml = buildChemDrawDocument({
    width: 300,
    height: 200,
    picture: { emf: new Uint8Array([1, 2, 0xab]) },
    structures: [
      { cdxml: structure(), x: 100, y: 50, w: 80 },
      { cdxml: structure('Helvetica', '1'), x: 10, y: 10, w: 40 },
    ],
    marks: [{ structure: 0, lines: [[{ text: 'c' }, { text: '2', sub: true }], [{ text: 'b', italic: true }]], x: 120, y: 60, size: 9, lineHeight: 11.25, font: 'Times New Roman', color: '#1f5fd1' }],
    shapes: [
      { structure: 0, shape: 'circle', x: 110, y: 55, size: 6, color: '#d12b2b' },
      { structure: 0, shape: 'triangle', x: 130, y: 55, size: 6, color: '#1a8a3a' },
    ],
  });
  const root = readCdxml(xml)!;
  const nodes = all(root);

  it('ChemDraw で読める形 (CDXML) で、id が重ならず、結合は原子を指している', () => {
    expect(root).not.toBeNull();
    // 字体の表の番号は別 (ChemDraw のファイルでも物の id と重なる)
    const ids = nodes.filter((x) => x.name !== 'font').map((x) => x.attrs.id).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    const idSet = new Set(ids);
    for (const b of nodes.filter((x) => x.name === 'b')) {
      expect(idSet.has(b.attrs.B)).toBe(true);
      expect(idSet.has(b.attrs.E)).toBe(true);
    }
  });

  it('後ろにスペクトルの絵 (EMF) を図の大きさで置く', () => {
    const pic = nodes.find((x) => x.name === 'embeddedobject')!;
    expect(pic.attrs.EnhancedMetafile).toBe('0102AB');
    expect(pic.attrs.BoundingBox).toBe('36 36 336 236');
    expect(pic.attrs.Z).toBe('1');
  });

  it('構造式は図の上の位置・大きさへ移す (余白 36 pt)', () => {
    const n3 = nodes.filter((x) => x.name === 'n' && x.attrs.p);
    // 1 つ目: 枠 0..40 を 幅 80 に → 2 倍。(0,10) → (36+100, 36+50+20)
    expect(n3[0].attrs.p).toBe('136 106');
    // 文字の大きさも同じ倍率
    const s = nodes.find((x) => x.name === 's' && x.children.join('') === 'N')!;
    expect(s.attrs.size).toBe('20');
  });

  it('色と字体は書き出す表の番号に付け直す', () => {
    const colors = nodes.filter((x) => x.name === 'color');
    const fonts = nodes.filter((x) => x.name === 'font').map((f) => f.attrs.name);
    expect(fonts).toEqual(expect.arrayContaining(['Arial', 'Helvetica', 'Times New Roman']));
    const red = nodes.find((x) => x.name === 's' && x.children.join('') === 'N')!;
    const c = colors[Number(red.attrs.color) - 2];
    expect([c.attrs.r, c.attrs.g, c.attrs.b]).toEqual(['1', '0', '0']);
  });

  it('文書と書式が違う構造式は、結合ごとに線の太さを書く', () => {
    const bonds = nodes.filter((x) => x.name === 'b');
    expect(bonds.filter((b) => b.attrs.LineWidth === '1')).toHaveLength(2);
    expect(bonds.filter((b) => b.attrs.LineWidth === undefined)).toHaveLength(2);
  });

  it('印は ChemDraw の文字 (化学として読まない) にして、構造式とまとめる', () => {
    const groups = nodes.filter((x) => x.name === 'group');
    expect(groups).toHaveLength(2);
    const t = all(groups[0]).find((x) => x.name === 't' && x.attrs.InterpretChemically === 'no')!;
    expect(t.attrs.p).toBe('156 96');
    const runs = t.children.filter((c): c is XNode => typeof c !== 'string');
    expect(runs.map((r) => [r.children.join(''), r.attrs.face])).toEqual([
      ['c', '0'],
      ['2\n', '32'],
      ['b', '2'],
    ]);
  });

  it('原子のマーカーは塗りつぶした図形にして、構造式とまとめる (丸は楕円、ほかは閉じた曲線)', () => {
    const group = nodes.filter((x) => x.name === 'group')[0];
    const oval = all(group).find((x) => x.name === 'graphic' && x.attrs.GraphicType === 'Oval')!;
    expect(oval.attrs.OvalType).toBe('Filled');
    expect(oval.attrs.Center3D).toBe('146 91 0');
    const curve = all(group).find((x) => x.name === 'curve')!;
    expect(curve.attrs.Closed).toBe('yes');
    expect(curve.attrs.FillType).toBe('Solid');
    // 三角: 向き + 始点 + 3 辺 × 3 点 + 向き
    expect(curve.attrs.CurvePoints.split(' ').length / 2).toBe(1 + 1 + 9 + 1);
  });
});

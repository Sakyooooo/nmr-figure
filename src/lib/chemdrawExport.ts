/**
 * 「ChemDraw で開く」の中身 (CDXML) を組み立てる。
 *  - 構造式以外 (スペクトル・軸・ピーク値など) は、図と同じ見た目の絵 (EMF) として後ろに置く
 *  - ChemDraw の構造式は、ChemDraw のデータのまま同じ位置・大きさで重ねる
 *  - 構造式に固定した印 (帰属の a, b など) は ChemDraw の文字にして、構造式とまとめる (group)
 * これを ChemDraw で開いてコピーし Word に貼ると、Word の上でダブルクリックして ChemDraw で直せる。
 * 座標は pt (図の左上 + 余白)。
 */
import { cdxmlBox, colorTable, docStyle, drawCdxml, fontTable, readCdxml } from './cdxml';
import { elements, serializeXml, type XChild, type XNode } from './xml';

export interface ExportStructure {
  cdxml: string;
  /** 図の上の枠の左上 (pt、図の左上が 0,0) と幅 */
  x: number;
  y: number;
  w: number;
}

export interface ExportMarkSeg {
  text: string;
  bold?: boolean;
  italic?: boolean;
  sub?: boolean;
  sup?: boolean;
}

export interface ExportMark {
  /** どの構造式の印か (structures の番号) */
  structure: number;
  lines: ExportMarkSeg[][];
  /** 1 行目の基線の左端 (pt、図の左上が 0,0) */
  x: number;
  y: number;
  /** 文字の大きさ・行の間隔 (pt) */
  size: number;
  lineHeight: number;
  font: string;
  color: string;
}

export interface ChemDrawExport {
  /** 図の大きさ (pt) */
  width: number;
  height: number;
  /** 構造式以外の部分の絵 */
  picture: { emf?: Uint8Array; png?: Uint8Array } | null;
  structures: ExportStructure[];
  marks: ExportMark[];
}

/** ChemDraw の余白 (ページの端から図までの距離、pt) */
const MARGIN = 36;

/** ほかの物の id を持つ属性 (空白区切りの id の並び) */
const REF_ATTRS = new Set([
  'B',
  'E',
  'Attachments',
  'BasisObjects',
  'BondCircularOrdering',
  'BondOrdering',
  'BracketedObjectIDs',
  'ConnectionOrder',
  'CrossingBonds',
  'CrossingBondss',
  'ExternalBonds',
  'GraphicID',
  'GroupFrame',
  'ReactionStepArrows',
  'ReactionStepObjectsAboveArrow',
  'ReactionStepObjectsBelowArrow',
  'ReactionStepPlusses',
  'ReactionStepProducts',
  'ReactionStepReactants',
  'ReactionStepAtomMap',
  'ReactionStepAtomMapAuto',
  'ReactionStepAtomMapManual',
  'SupersededBy',
  'TextFrame',
  'ComponentReferenceID',
  'InnerAtomID',
  'ChemicalPropertyDisplayID',
  'AltGroupID',
  'BondID',
  'ArrowSource',
  'ArrowTarget',
]);
/** x y の組の並び */
const XY_ATTRS = new Set(['p', 'BoundingBox', 'CurvePoints']);
/** x y z の組の並び */
const XYZ_ATTRS = new Set(['Head3D', 'Tail3D', 'Center3D', 'MajorAxisEnd3D', 'MinorAxisEnd3D', 'CurvePoints3D']);
/** 長さ (拡大縮小に合わせる) */
const LENGTH_ATTRS = new Set(['WordWrapWidth', 'LabelSize', 'CaptionSize', 'LineHeight', 'CaptionLineHeight', 'LabelLineHeight', 'ArrowShaftSpacing']);
const COLOR_ATTRS = new Set(['color', 'bgcolor', 'LabelColor', 'CaptionColor']);
const FONT_ATTRS = new Set(['font', 'LabelFont', 'CaptionFont']);
/** 構造式の書式 (文書で違えば、結合ごとに書く) */
const BOND_STYLE: [keyof ReturnType<typeof docStyle>, string][] = [
  ['lineWidth', 'LineWidth'],
  ['boldWidth', 'BoldWidth'],
  ['hashSpacing', 'HashSpacing'],
  ['marginWidth', 'MarginWidth'],
  ['bondSpacing', 'BondSpacing'],
];
/** ChemDraw の ACS Document 1996 の書式 (構造式がないときの既定) */
const ACS_1996: Record<string, string> = {
  LabelFont: '3',
  LabelSize: '10',
  LabelFace: '96',
  CaptionFont: '3',
  CaptionSize: '10',
  HashSpacing: '2.50',
  MarginWidth: '1.60',
  LineWidth: '0.60',
  BoldWidth: '2',
  BondLength: '14.40',
  BondSpacing: '18',
  ChainAngle: '120',
  LabelJustification: 'Auto',
  CaptionJustification: 'Left',
  color: '0',
  bgcolor: '1',
};

const f2 = (v: number) => (Math.round(v * 100) / 100).toString();

function hex(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
  return s.toUpperCase();
}

class Tables {
  fonts: { name: string; charset: string }[] = [];
  colors: string[] = [];
  font(name: string, charset = 'iso-8859-1') {
    let i = this.fonts.findIndex((f) => f.name === name && f.charset === charset);
    if (i < 0) i = this.fonts.push({ name, charset }) - 1;
    return String(i + 1);
  }
  /** #rrggbb → 色の番号。0 = 黒、1 = 白、表の 1 つ目が 2 (書き出す表は白・黒・足した色の順なので、足した色は 4 から) */
  color(css: string) {
    const c = css.toLowerCase();
    if (c === '#000000') return '0';
    if (c === '#ffffff') return '1';
    let i = this.colors.indexOf(c);
    if (i < 0) i = this.colors.push(c) - 1;
    return String(i + 4);
  }
  xml(): XNode[] {
    const rgb = (c: string) => [1, 3, 5].map((k) => f2(parseInt(c.slice(k, k + 2), 16) / 255));
    return [
      {
        name: 'colortable',
        attrs: {},
        // 表の 1 つ目と 2 つ目は白と黒 (ChemDraw と同じ)
        children: ['#ffffff', '#000000', ...this.colors].map((c) => {
          const [r, g, b] = rgb(c);
          return { name: 'color', attrs: { r, g, b }, children: [] };
        }),
      },
      { name: 'fonttable', attrs: {}, children: this.fonts.map((f, i) => ({ name: 'font', attrs: { id: String(i + 1), charset: f.charset, name: f.name }, children: [] })) },
    ];
  }
}

/** 表の番号: ChemDraw の色の番号は、表の 1 つ目 (白) が 2 */
function remapColor(tables: Tables, colors: string[], idx: string) {
  const n = Number(idx);
  if (!Number.isFinite(n)) return idx;
  // 0 = 黒、1 = 白 はそのまま。表の色は、書き出す表に足して番号を付け直す
  if (n < 2) return idx;
  return tables.color(colors[n] ?? '#000000');
}

/** 構造式 1 つ分を、図の上の位置へ移して番号を付け直す */
function placeStructure(
  st: ExportStructure,
  k: number,
  tables: Tables,
  base: ReturnType<typeof docStyle>,
): { items: XNode[]; schemes: XNode[]; idOffset: number; zBase: number } | null {
  const root = readCdxml(st.cdxml);
  const drawn = drawCdxml(st.cdxml, 1);
  const box = root && cdxmlBox(root, drawn?.box ?? null);
  if (!root || !box) return null;
  const s = st.w / (box.r - box.l);
  const ox = MARGIN + st.x;
  const oy = MARGIN + st.y;
  const X = (x: number) => ox + (x - box.l) * s;
  const Y = (y: number) => oy + (y - box.t) * s;
  const colors = colorTable(root);
  const fontMap = new Map<string, string>();
  const ft = elements(root, 'fonttable')[0];
  for (const f of ft ? elements(ft, 'font') : []) if (f.attrs.id) fontMap.set(f.attrs.id, tables.font(f.attrs.name || 'Arial', f.attrs.charset || 'iso-8859-1'));
  const style = docStyle(root);
  const idOffset = (k + 1) * 1_000_000;
  const zBase = (k + 1) * 100_000;
  const shift = (v: string) =>
    v
      .trim()
      .split(/\s+/)
      .map((t) => (/^\d+$/.test(t) ? String(Number(t) + idOffset) : t))
      .join(' ');

  const convert = (node: XNode): XNode => {
    const attrs: Record<string, string> = {};
    for (const [key, v] of Object.entries(node.attrs)) {
      if (key === 'id' || REF_ATTRS.has(key) || (node.name === 'represent' && key === 'object')) attrs[key] = shift(v);
      else if (key === 'Z') attrs[key] = String(zBase + (Number(v) || 0));
      else if (XY_ATTRS.has(key)) {
        const n = v.trim().split(/[\s,]+/).map(Number);
        attrs[key] = n.every(Number.isFinite) ? n.map((x, i) => f2(i % 2 ? Y(x) : X(x))).join(' ') : v;
      } else if (XYZ_ATTRS.has(key)) {
        const n = v.trim().split(/[\s,]+/).map(Number);
        attrs[key] = n.every(Number.isFinite) ? n.map((x, i) => f2(i % 3 === 0 ? X(x) : i % 3 === 1 ? Y(x) : x)).join(' ') : v;
      } else if (LENGTH_ATTRS.has(key) && /^[\d.]+$/.test(v)) attrs[key] = f2(Number(v) * s);
      else if (key === 'size' && node.name === 's') attrs[key] = f2(Number(v) * s);
      else if (COLOR_ATTRS.has(key)) attrs[key] = remapColor(tables, colors, v);
      else if (FONT_ATTRS.has(key)) attrs[key] = fontMap.get(v) ?? v;
      else attrs[key] = v;
    }
    // 元の文書の書式が書き出す文書と違えば、結合に書いて ChemDraw でも同じ太さにする
    if (node.name === 'b') {
      for (const [prop, attr] of BOND_STYLE) if (attrs[attr] === undefined && style[prop] !== base[prop]) attrs[attr] = String(style[prop]);
    }
    return { name: node.name, attrs, children: node.children.map((c): XChild => (typeof c === 'string' ? c : convert(c))) };
  };

  // ページの中身 (ページがなければ文書の直下) を取り出す
  const pages = elements(root, 'page');
  const sources = pages.length ? pages.flatMap((p) => elements(p)) : elements(root).filter((e) => e.name !== 'colortable' && e.name !== 'fonttable');
  const items: XNode[] = [];
  const schemes: XNode[] = [];
  for (const el of sources) (el.name === 'scheme' ? schemes : items).push(convert(el));
  return { items, schemes, idOffset, zBase };
}

export function buildChemDrawDocument(input: ChemDrawExport): string {
  const tables = new Tables();
  const firstRoot = input.structures.length ? readCdxml(input.structures[0].cdxml) : null;
  const base = firstRoot ? docStyle(firstRoot) : docStyle({ name: 'CDXML', attrs: ACS_1996, children: [] });
  let nextId = 1;
  const id = () => String(nextId++);

  // 文書の書式: 1 つ目の構造式の文書に合わせる (ACS Document 1996 などの設定を引き継ぐ)
  const rootAttrs: Record<string, string> = {};
  const src = firstRoot ? firstRoot.attrs : ACS_1996;
  for (const [key, v] of Object.entries(src)) {
    if (['BoundingBox', 'WindowPosition', 'WindowSize', 'Name', 'MacPrintInfo', 'CreationProgram'].includes(key)) continue;
    rootAttrs[key] = v;
  }
  // 文書の既定の字体・色も、書き出す表の番号にする
  if (firstRoot) {
    const fonts = fontTable(firstRoot);
    const colors = colorTable(firstRoot);
    for (const key of ['LabelFont', 'CaptionFont']) if (rootAttrs[key] && fonts.has(rootAttrs[key])) rootAttrs[key] = tables.font(fonts.get(rootAttrs[key])!);
    for (const key of ['color', 'bgcolor']) if (rootAttrs[key]) rootAttrs[key] = remapColor(tables, colors, rootAttrs[key]);
  } else {
    rootAttrs.LabelFont = rootAttrs.CaptionFont = tables.font('Arial');
  }

  const W = input.width;
  const H = input.height;
  const page: XNode = { name: 'page', attrs: {}, children: [] };
  const pageW = Math.max(540, W + MARGIN * 2);
  const pageH = Math.max(719.75, H + MARGIN * 2);
  Object.assign(page.attrs, {
    id: id(),
    BoundingBox: `0 0 ${f2(pageW)} ${f2(pageH)}`,
    HeaderPosition: '36',
    FooterPosition: '36',
    PrintTrimMarks: 'yes',
    HeightPages: '1',
    WidthPages: '1',
  });

  // 後ろの絵 (スペクトルなど)
  const pic = input.picture;
  if (pic && (pic.emf || pic.png)) {
    const attrs: Record<string, string> = { id: id(), BoundingBox: `${f2(MARGIN)} ${f2(MARGIN)} ${f2(MARGIN + W)} ${f2(MARGIN + H)}`, Z: '1' };
    if (pic.emf) attrs.EnhancedMetafile = hex(pic.emf);
    else if (pic.png) attrs.PNG = hex(pic.png);
    page.children.push({ name: 'embeddedobject', attrs, children: [] });
  }

  const schemes: XNode[] = [];
  input.structures.forEach((st, k) => {
    const placed = placeStructure(st, k, tables, base);
    if (!placed) return;
    const group: XNode = { name: 'group', attrs: { id: id(), Z: String(placed.zBase) }, children: [...placed.items] };
    input.marks
      .filter((m) => m.structure === k)
      .forEach((m, i) => group.children.push(markCaption(m, id(), placed.zBase + 90_000 + i, tables)));
    page.children.push(group);
    schemes.push(...placed.schemes);
  });
  // 構造式に付いていない印 (構造式が読めなかったときなど) も、文字として残す
  input.marks
    .filter((m) => !input.structures[m.structure])
    .forEach((m, i) => page.children.push(markCaption(m, id(), 900_000 + i, tables)));
  page.children.push(...schemes);

  const root: XNode = {
    name: 'CDXML',
    attrs: {
      CreationProgram: 'NMR Figure Editor',
      Name: 'NMR figure',
      BoundingBox: `${f2(MARGIN)} ${f2(MARGIN)} ${f2(MARGIN + W)} ${f2(MARGIN + H)}`,
      ...rootAttrs,
    },
    children: [],
  };
  root.children.push(...tables.xml(), page);
  return `<?xml version="1.0" encoding="UTF-8" ?>\n<!DOCTYPE CDXML SYSTEM "https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd" >\n${serializeXml(root)}\n`;
}

/** 印 → ChemDraw の文字 (化学的な意味は読まない) */
function markCaption(m: ExportMark, idValue: string, z: number, tables: Tables): XNode {
  const nonAscii = m.lines.some((l) => l.some((s) => /[^\x20-\x7e]/.test(s.text)));
  const font = tables.font(m.font, nonAscii ? 'shift_jis' : 'iso-8859-1');
  const color = tables.color(m.color);
  const runs: XNode[] = [];
  m.lines.forEach((line, i) => {
    const segs = line.length ? line : [{ text: '' }];
    segs.forEach((seg, j) => {
      const face = (seg.bold ? 1 : 0) | (seg.italic ? 2 : 0) | (seg.sub ? 32 : 0) | (seg.sup ? 64 : 0);
      const text = seg.text + (j === segs.length - 1 && i < m.lines.length - 1 ? '\n' : '');
      if (!text) return;
      runs.push({ name: 's', attrs: { font, size: f2(m.size), color, face: String(face) }, children: [text] });
    });
  });
  return {
    name: 't',
    attrs: {
      id: idValue,
      p: `${f2(MARGIN + m.x)} ${f2(MARGIN + m.y)}`,
      Z: String(z),
      InterpretChemically: 'no',
      CaptionJustification: 'Left',
      Justification: 'Left',
      LineHeight: f2(m.lineHeight),
    },
    children: runs,
  };
}

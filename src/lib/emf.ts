/**
 * EMF (Windows の拡張メタファイル) を書く。「ChemDraw で開く」で、スペクトルの部分を線のまま ChemDraw に渡すため。
 * ChemDraw は EMF の絵を線のまま Word に渡すので、Word の上でも拡大して粗くならない (PNG だと 1 枚 10 MB ほどになる)。
 *
 * 座標: 図の座標 (96 dpi の px) を SCALE 倍した整数で書き、MM_ANISOTROPIC で 96 dpi の画面に戻す。
 * 参照: [MS-EMF] Enhanced Metafile Format
 */

export const EMF_SCALE = 50;

export interface EmfPen {
  color: string;
  /** 太さ (論理単位) */
  width: number;
  dash: number[] | null;
  cap: 'butt' | 'round' | 'square';
  join: 'miter' | 'round' | 'bevel';
}

export interface EmfFont {
  face: string;
  /** 文字の高さ (論理単位、em の大きさ) */
  height: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** 傾き (1/10 度、左回り) */
  escapement: number;
}

type Pt = [number, number];

/** #rrggbb → COLORREF (0x00BBGGRR) */
export function colorRef(css: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css.trim());
  if (!m) return 0;
  return parseInt(m[1], 16) | (parseInt(m[2], 16) << 8) | (parseInt(m[3], 16) << 16);
}

class Buf {
  bytes: number[] = [];
  u32(v: number) {
    const x = v >>> 0;
    this.bytes.push(x & 255, (x >>> 8) & 255, (x >>> 16) & 255, (x >>> 24) & 255);
  }
  i32(v: number) {
    this.u32(Math.round(v) | 0);
  }
  u16(v: number) {
    this.bytes.push(v & 255, (v >>> 8) & 255);
  }
  u8(v: number) {
    this.bytes.push(v & 255);
  }
  f32(v: number) {
    const b = new Uint8Array(new Float32Array([v]).buffer);
    this.bytes.push(...b);
  }
  pad4() {
    while (this.bytes.length % 4) this.bytes.push(0);
  }
}

const NULL_BRUSH = 0x80000005;
const NULL_PEN = 0x80000008;

export class EmfWriter {
  private records: Uint8Array[] = [];
  private count = 0;
  private penKey = '';
  private brushKey = '';
  private fontKey = '';
  private textColor = -1;
  /** 表に作った物 (1 = 線、2 = 塗り、3 = 字体)。作り直すときに前のものを捨てる */
  private made = new Set<number>();
  private bounds = { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity };

  /** width, height: 図の大きさ (96 dpi の px) */
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    const S = EMF_SCALE;
    this.rec(17, (b) => b.u32(8)); // SETMAPMODE: MM_ANISOTROPIC
    this.rec(9, (b) => (b.i32(Math.round(width * S)), b.i32(Math.round(height * S)))); // SETWINDOWEXTEX
    this.rec(10, (b) => (b.i32(0), b.i32(0))); // SETWINDOWORGEX
    this.rec(11, (b) => (b.i32(Math.round(width)), b.i32(Math.round(height)))); // SETVIEWPORTEXTEX
    this.rec(12, (b) => (b.i32(0), b.i32(0))); // SETVIEWPORTORGEX
    this.rec(18, (b) => b.u32(1)); // SETBKMODE: TRANSPARENT
    this.rec(22, (b) => b.u32(24)); // SETTEXTALIGN: TA_BASELINE | TA_LEFT
    this.rec(19, (b) => b.u32(2)); // SETPOLYFILLMODE: WINDING
  }

  private rec(type: number, fill: (b: Buf) => void) {
    const b = new Buf();
    b.u32(type);
    b.u32(0);
    fill(b);
    b.pad4();
    const out = new Uint8Array(b.bytes);
    new DataView(out.buffer).setUint32(4, out.length, true);
    this.records.push(out);
    this.count++;
  }

  private grow(points: Pt[], pad = 0) {
    for (const [x, y] of points) {
      this.bounds.l = Math.min(this.bounds.l, x - pad);
      this.bounds.t = Math.min(this.bounds.t, y - pad);
      this.bounds.r = Math.max(this.bounds.r, x + pad);
      this.bounds.b = Math.max(this.bounds.b, y + pad);
    }
  }

  /** 線の設定。null なら線なし */
  pen(p: EmfPen | null) {
    const key = p ? JSON.stringify(p) : 'null';
    if (key === this.penKey) return;
    this.penKey = key;
    this.rec(37, (b) => b.u32(NULL_PEN));
    this.drop(1);
    if (!p) return;
    const dash = p.dash?.filter((v) => v > 0) ?? [];
    const cap = p.cap === 'round' ? 0 : p.cap === 'square' ? 0x100 : 0x200;
    const join = p.join === 'round' ? 0 : p.join === 'bevel' ? 0x1000 : 0x2000;
    const style = 0x10000 | (dash.length ? 7 : 0) | cap | join;
    this.made.add(1);
    this.rec(95, (b) => {
      b.u32(1); // ihPen
      b.u32(0);
      b.u32(0);
      b.u32(0);
      b.u32(0);
      b.u32(style);
      b.u32(Math.max(1, Math.round(p.width)));
      b.u32(0); // BS_SOLID
      b.u32(colorRef(p.color));
      b.u32(0);
      b.u32(dash.length);
      for (const d of dash) b.u32(Math.max(1, Math.round(d)));
    });
    this.rec(37, (b) => b.u32(1));
  }

  /** 塗りの色。null なら塗らない */
  brush(color: string | null) {
    const key = color ?? 'null';
    if (key === this.brushKey) return;
    this.brushKey = key;
    this.rec(37, (b) => b.u32(NULL_BRUSH));
    this.drop(2);
    if (!color) return;
    this.made.add(2);
    this.rec(39, (b) => {
      b.u32(2); // ihBrush
      b.u32(0); // BS_SOLID
      b.u32(colorRef(color));
      b.u32(0);
    });
    this.rec(37, (b) => b.u32(2));
  }

  /**
   * 図形を描く。figures は折れ線・ベジエの並び (M = 始点、L = 直線、C = ベジエ 3 点、Z = 閉じる)。
   * 線だけ / 塗りだけ / 両方
   */
  path(figures: PathCmd[], stroke: boolean, fill: boolean, evenOdd = false) {
    if (!figures.length || (!stroke && !fill)) return;
    if (fill) this.rec(19, (b) => b.u32(evenOdd ? 1 : 2));
    this.rec(59, () => {}); // BEGINPATH
    const all: Pt[] = [];
    let pending: Pt[] = [];
    const flushLines = () => {
      if (!pending.length) return;
      const pts = pending;
      pending = [];
      this.rec(6, (b) => {
        // POLYLINETO
        rect(b, pts);
        b.u32(pts.length);
        for (const [x, y] of pts) (b.i32(x), b.i32(y));
      });
    };
    for (const c of figures) {
      if (c.t === 'M') {
        flushLines();
        this.rec(27, (b) => (b.i32(c.p[0]), b.i32(c.p[1]))); // MOVETOEX
        all.push(c.p);
      } else if (c.t === 'L') {
        pending.push(c.p);
        all.push(c.p);
      } else if (c.t === 'C') {
        flushLines();
        const pts = c.p;
        this.rec(5, (b) => {
          // POLYBEZIERTO
          rect(b, pts);
          b.u32(pts.length);
          for (const [x, y] of pts) (b.i32(x), b.i32(y));
        });
        all.push(...pts);
      } else {
        flushLines();
        this.rec(61, () => {}); // CLOSEFIGURE
      }
    }
    flushLines();
    this.rec(60, () => {}); // ENDPATH
    const type = stroke && fill ? 63 : fill ? 62 : 64;
    this.rec(type, (b) => rect(b, all));
    this.grow(all);
  }

  /** 1 行の文字。x, y は基線の左端 (論理単位)、dx は文字ごとの送り幅 */
  text(text: string, x: number, y: number, font: EmfFont, color: string, dx: number[]) {
    if (!text) return;
    const key = JSON.stringify(font);
    if (key !== this.fontKey) {
      this.fontKey = key;
      this.rec(37, (b) => b.u32(0x8000000d)); // SYSTEM_FONT を選んでから前の字体を捨てる
      this.drop(3);
      this.made.add(3);
      this.rec(82, (b) => {
        // EXTCREATEFONTINDIRECTW (LogFontPanose の大きさ 320 バイト)
        b.u32(3);
        const start = b.bytes.length;
        b.i32(-Math.max(1, Math.round(font.height)));
        b.i32(0);
        b.i32(font.escapement);
        b.i32(font.escapement);
        b.i32(font.bold ? 700 : 400);
        b.u8(font.italic ? 1 : 0);
        b.u8(font.underline ? 1 : 0);
        b.u8(0);
        b.u8(1); // DEFAULT_CHARSET
        b.u8(4); // OUT_TT_PRECIS
        b.u8(0);
        b.u8(0);
        b.u8(0);
        const face = font.face.slice(0, 31);
        for (let i = 0; i < 32; i++) b.u16(i < face.length ? face.charCodeAt(i) : 0);
        while (b.bytes.length - start < 320) b.u8(0);
      });
      this.rec(37, (b) => b.u32(3));
    }
    const c = colorRef(color);
    if (c !== this.textColor) {
      this.textColor = c;
      this.rec(24, (b) => b.u32(c));
    }
    const chars = [...text].flatMap((ch) => {
      const code = ch.codePointAt(0)!;
      if (code < 0x10000) return [code];
      const v = code - 0x10000;
      return [0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)];
    });
    const n = chars.length;
    const S = EMF_SCALE;
    this.rec(84, (b) => {
      // EXTTEXTOUTW
      b.i32(0);
      b.i32(0);
      b.i32(-1);
      b.i32(-1); // Bounds (計算しない)
      b.u32(1); // GM_COMPATIBLE
      b.f32(2540 / 96 / S);
      b.f32(2540 / 96 / S);
      b.i32(x);
      b.i32(y);
      b.u32(n);
      const offString = 76;
      const strBytes = Math.ceil((n * 2) / 4) * 4;
      b.u32(offString);
      b.u32(0); // Options
      b.i32(0);
      b.i32(0);
      b.i32(-1);
      b.i32(-1);
      b.u32(offString + strBytes); // offDx
      for (const code of chars) b.u16(code);
      b.pad4();
      // サロゲートの 2 つ目は送り 0
      let k = 0;
      for (const ch of text) {
        const w = Math.max(0, Math.round(dx[k] ?? 0));
        b.i32(w);
        if (ch.codePointAt(0)! >= 0x10000) b.i32(0);
        k++;
      }
    });
    this.grow([[x, y]], font.height);
  }

  /** 画像 (上から下の行順の RGB)。x, y, w, h は論理単位 */
  image(rgb: Uint8Array, pxW: number, pxH: number, x: number, y: number, w: number, h: number) {
    const stride = Math.ceil((pxW * 3) / 4) * 4;
    const bits = new Uint8Array(stride * pxH);
    for (let row = 0; row < pxH; row++) {
      const src = row * pxW * 3;
      const dst = (pxH - 1 - row) * stride; // DIB は下から
      for (let i = 0; i < pxW; i++) {
        bits[dst + i * 3] = rgb[src + i * 3 + 2];
        bits[dst + i * 3 + 1] = rgb[src + i * 3 + 1];
        bits[dst + i * 3 + 2] = rgb[src + i * 3];
      }
    }
    this.rec(81, (b) => {
      // STRETCHDIBITS
      rect(b, [
        [x, y],
        [x + w, y + h],
      ]);
      b.i32(x);
      b.i32(y);
      b.i32(0);
      b.i32(0);
      b.i32(pxW);
      b.i32(pxH);
      b.u32(80); // offBmiSrc
      b.u32(40);
      b.u32(120); // offBitsSrc
      b.u32(bits.length);
      b.u32(0); // DIB_RGB_COLORS
      b.u32(0x00cc0020); // SRCCOPY
      b.i32(w);
      b.i32(h);
      // BITMAPINFOHEADER
      b.u32(40);
      b.i32(pxW);
      b.i32(pxH);
      b.u16(1);
      b.u16(24);
      b.u32(0); // BI_RGB
      b.u32(bits.length);
      b.i32(3780);
      b.i32(3780);
      b.u32(0);
      b.u32(0);
      for (const v of bits) b.u8(v);
    });
    this.grow([
      [x, y],
      [x + w, y + h],
    ]);
  }

  private drop(handle: number) {
    if (!this.made.has(handle)) return;
    this.made.delete(handle);
    this.rec(40, (b) => b.u32(handle)); // DELETEOBJECT
  }

  /** ここから先の描画を、図形の内側に限る。restore() で戻す */
  clip(figures: PathCmd[]) {
    this.rec(33, () => {}); // SAVEDC
    this.rec(59, () => {});
    for (const c of figures) {
      if (c.t === 'M') this.rec(27, (b) => (b.i32(c.p[0]), b.i32(c.p[1])));
      else if (c.t === 'L') this.rec(54, (b) => (b.i32(c.p[0]), b.i32(c.p[1])));
      else if (c.t === 'C') {
        const pts = c.p;
        this.rec(5, (b) => {
          rect(b, pts);
          b.u32(pts.length);
          for (const [x, y] of pts) (b.i32(x), b.i32(y));
        });
      } else this.rec(61, () => {});
    }
    this.rec(60, () => {});
    this.rec(67, (b) => b.u32(1)); // SELECTCLIPPATH: RGN_AND
  }

  restore() {
    this.rec(34, (b) => b.i32(-1)); // RESTOREDC
    // 選んでいた線・塗り・字体は元に戻るので、次に使うときに作り直す
    this.penKey = '';
    this.brushKey = '';
    this.fontKey = '';
    this.textColor = -1;
  }

  /** できあがりのバイト列 */
  finish(): Uint8Array {
    this.rec(14, (b) => (b.u32(0), b.u32(16), b.u32(20))); // EOF
    const S = EMF_SCALE;
    const W = Math.round(this.width);
    const H = Math.round(this.height);
    const header = new Buf();
    const total = 108 + this.records.reduce((s, r) => s + r.length, 0);
    header.u32(1);
    header.u32(108);
    // Bounds (装置単位 = px)
    const bl = Number.isFinite(this.bounds.l) ? Math.floor(this.bounds.l / S) : 0;
    const bt = Number.isFinite(this.bounds.t) ? Math.floor(this.bounds.t / S) : 0;
    const br = Number.isFinite(this.bounds.r) ? Math.ceil(this.bounds.r / S) : W;
    const bb = Number.isFinite(this.bounds.b) ? Math.ceil(this.bounds.b / S) : H;
    header.i32(Math.max(0, bl));
    header.i32(Math.max(0, bt));
    header.i32(Math.min(W, br));
    header.i32(Math.min(H, bb));
    // Frame (0.01 mm)。図全体の大きさにする (ChemDraw はこの枠を置いた場所の大きさに合わせる)
    header.i32(0);
    header.i32(0);
    header.i32(Math.round((W * 2540) / 96));
    header.i32(Math.round((H * 2540) / 96));
    header.u32(0x464d4520);
    header.u32(0x10000);
    header.u32(total);
    header.u32(this.count + 1);
    header.u16(4); // 表の大きさ (0 + 線・塗り・字体)
    header.u16(0);
    header.u32(0);
    header.u32(0);
    header.u32(0);
    // 参照する画面: 96 dpi
    header.i32(1920);
    header.i32(1080);
    header.i32(508);
    header.i32(286);
    header.u32(0);
    header.u32(0);
    header.u32(0);
    header.u32(508000);
    header.u32(285750);
    const out = new Uint8Array(total);
    out.set(header.bytes, 0);
    let off = 108;
    for (const r of this.records) {
      out.set(r, off);
      off += r.length;
    }
    return out;
  }
}

export type PathCmd = { t: 'M'; p: Pt } | { t: 'L'; p: Pt } | { t: 'C'; p: Pt[] } | { t: 'Z' };

function rect(b: Buf, pts: Pt[]) {
  let l = Infinity;
  let t = Infinity;
  let r = -Infinity;
  let bt = -Infinity;
  for (const [x, y] of pts) {
    l = Math.min(l, x);
    t = Math.min(t, y);
    r = Math.max(r, x);
    bt = Math.max(bt, y);
  }
  if (!pts.length) l = t = r = bt = 0;
  b.i32(l);
  b.i32(t);
  b.i32(r);
  b.i32(bt);
}

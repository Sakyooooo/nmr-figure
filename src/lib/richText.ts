export type Segment = { text: string; kind: 'normal' | 'sup' | 'sub' | 'italic' | 'bold' };

const KINDS: Record<string, Segment['kind']> = { '^': 'sup', _: 'sub', '*': 'italic', '**': 'bold' };

/**
 * 簡易リッチテキスト。^{..} を上付き、_{..} を下付き、*{..} を斜体、**{..} を太字にする。
 * 例: "^{1}H NMR (400 MHz, C_{6}D_{6})" / "*{J. Am. Chem. Soc.} **{2024}, *{146}, 1234."
 */
export function parseRich(src: string): Segment[] {
  const out: Segment[] = [];
  const re = /(\*\*|[_^*])\{([^}]*)\}/g;
  let last = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m.index > last) out.push({ text: src.slice(last, m.index), kind: 'normal' });
    if (m[2]) out.push({ text: m[2], kind: KINDS[m[1]] });
    last = re.lastIndex;
  }
  if (last < src.length) out.push({ text: src.slice(last), kind: 'normal' });
  return out;
}

export function plainText(src: string): string {
  return parseRich(src)
    .map((s) => s.text)
    .join('');
}

/** 描画幅の概算 (px)。SVG をレイアウトする前に使うので厳密でなくてよい */
export function estimateWidth(src: string, fontSize: number): number {
  let w = 0;
  for (const seg of parseRich(src)) {
    const scale = seg.kind === 'sup' || seg.kind === 'sub' ? 0.7 : seg.kind === 'bold' ? 1.05 : 1;
    for (const ch of seg.text) w += charWidth(ch) * fontSize * scale;
  }
  return w;
}

function charWidth(ch: string): number {
  if (/[　-鿿＀-￯]/.test(ch)) return 1;
  if (/[il.,:;|'!()[\]\s]/.test(ch)) return 0.3;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[mw]/.test(ch)) return 0.75;
  return 0.5;
}

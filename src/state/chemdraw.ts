/**
 * ChemDraw との連携 (取り込み)。
 *  - ChemDraw で「Edit > Copy As > CDXML Text」でコピーして図の上で貼る、または .cdxml をドロップすると、
 *    ChemDraw の構造式として置く (ChemDraw のデータのまま持つ)
 *  - ChemDraw の構造式を選んだまま貼ると置き換える (ChemDraw で直したものを貼り直す)
 * 書き出し (「ChemDraw で開く」) は chemdrawExport.ts
 */
import { tr } from '../i18n';
import { cdxmlToSvg, drawCdxml } from '../lib/cdxml';
import { downloadBlob } from '../lib/exportFigure';
import { imageRect, PX_PER_PT } from '../lib/scene';
import { addFigureImage, edit, notify, useEditor } from './store';

/** ChemDraw でふつうにコピーしたもの (ブラウザで読める形がない) を貼ったときの案内 */
export function explainChemDrawPaste() {
  notify(tr('ChemDraw の構造式は、ChemDraw で「Edit > Copy As > CDXML Text」を選んでコピーしてから貼ってください'), 'info');
}

/** ChemDraw の構造式 (CDXML) を図に置く。置けたら true */
export function placeCdxml(text: string): boolean {
  const drawn = cdxmlToSvg(text);
  if (!drawn) {
    notify(tr('ChemDraw の構造式を読めませんでした'), 'error');
    return false;
  }
  const { doc, selection } = useEditor.getState();
  const fig = doc.figure;
  const ratio = drawn.height / drawn.width;
  const target = selection?.kind === 'image' ? doc.figureImages.find((x) => x.id === selection.id && x.cdxml) : undefined;
  const old = target?.cdxml ? drawCdxml(target.cdxml, 1) : null;
  const now = drawCdxml(text, 1);
  if (target && old && now) {
    // CDXML の座標が図の同じ位置に来るように置く (直していない原子は動かず、帰属の印もずれない)
    const r = imageRect(target, fig);
    const k = r.w / (old.box.r - old.box.l);
    const nx = r.x + (now.box.l - old.box.l) * k;
    const ny = r.y + (now.box.t - old.box.t) * k;
    const nw = (now.box.r - now.box.l) * k;
    const nh = nw * ratio;
    edit((d) => {
      const im = d.figureImages.find((x) => x.id === target.id);
      if (!im) return;
      // 構造式に固定した印は、図の上の位置を変えずに新しい枠に対する割合に直す
      const toNew = (fx: number, fy: number) => ({ x: (r.x + fx * r.w - nx) / nw, y: (r.y + fy * r.h - ny) / nh });
      for (const a of d.annotations) {
        if (a.imageId !== im.id) continue;
        const p1 = toNew(a.x1, a.y1);
        const p2 = toNew(a.x2, a.y2);
        Object.assign(a, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
      }
      Object.assign(im, { cdxml: text, svg: drawn.svg, source: null, href: null, ratio, x: nx / fig.width, y: ny / fig.height, w: nw / fig.width });
    });
    notify(tr('選んでいた構造式を、貼った ChemDraw の構造式に置き換えました'));
    return true;
  }
  // ChemDraw と同じ大きさで置く (Word に貼ったときに、ChemDraw から貼った構造式と同じ大きさ)
  addFigureImage({ svg: drawn.svg, cdxml: text, ratio, w: Math.min(0.9, (drawn.width * PX_PER_PT) / fig.width) });
  notify(tr('ChemDraw の構造式を置きました。上に置いた文字は構造式と一緒に動きます'));
  return true;
}

/**
 * ChemDraw の構造式を ChemDraw で直す: その構造式だけの .cdxml を保存する (開くと ChemDraw が起動する)。
 * 直したら Copy As > CDXML Text でコピーし、この構造式を選んだまま貼ると置き換わる
 */
export function editInChemDraw(imageId: string) {
  const image = useEditor.getState().doc.figureImages.find((x) => x.id === imageId);
  if (!image?.cdxml) return;
  downloadBlob(new Blob([image.cdxml], { type: 'chemical/x-cdxml' }), 'structure.cdxml');
  notify(tr('保存した structure.cdxml を開くと ChemDraw で直せます。直したら「Edit > Copy As > CDXML Text」でコピーし、この構造式を選んだまま貼ると置き換わります'), 'info');
}

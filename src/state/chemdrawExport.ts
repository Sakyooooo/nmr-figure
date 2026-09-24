/**
 * 「ChemDraw で開く」: 図を ChemDraw のファイル (.cdxml) にして保存する。開くと ChemDraw が起動する。
 * ChemDraw で全体をコピーして Word に貼ると、Word の上でダブルクリックして構造式を ChemDraw で直せる
 * (ブラウザからは ChemDraw の図を直接クリップボードに置けないので、ChemDraw を 1 回通す)。
 *  - スペクトルなど構造式以外は、図と同じ見た目の絵 (EMF、線のまま) にする
 *  - ChemDraw の構造式はデータのまま、構造式に固定した文字 (帰属の印) は ChemDraw の文字にする
 */
import { tr } from '../i18n';
import { buildChemDrawDocument, type ExportMark, type ExportMarkSeg } from '../lib/chemdrawExport';
import { baseName, downloadBlob } from '../lib/exportFigure';
import { parseRich } from '../lib/richText';
import { atomMarkerPos, imageAnchorToPx, imageRect, PX_PER_PT } from '../lib/scene';
import type { ExportShape } from '../lib/chemdrawExport';
import { svgToEmf } from '../lib/svgToEmf';
import { notify, useEditor } from './store';

const PT = 1 / PX_PER_PT;

export async function openInChemDraw(svg: SVGSVGElement) {
  const { doc, projectName } = useEditor.getState();
  const images = doc.figureImages.filter((x) => x.cdxml);
  if (!images.length) {
    notify(tr('図に ChemDraw の構造式がありません。ChemDraw で「Edit > Copy As > CDXML Text」でコピーして図に貼ってから使ってください'), 'error');
    return;
  }
  const fig = doc.figure;
  const ids = new Set(images.map((x) => x.id));
  // 構造式に固定した文字だけ ChemDraw の文字にする (丸・矢印などは絵のまま)
  const marks = doc.annotations.filter((a) => a.imageId && ids.has(a.imageId) && a.kind === 'text');
  const markIds = new Set(marks.map((a) => a.id));

  // 構造式とその文字を除いた図を、見えない所に置いて EMF に書き写す
  const [, , w, h] = (svg.getAttribute('viewBox') ?? `0 0 ${fig.width} ${fig.height}`).split(/\s+/).map(Number);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.querySelectorAll('[data-ui], [data-cdxml]').forEach((el) => el.remove());
  // 原子に付けたマーカー (帰属) は ChemDraw の図形にする
  clone.querySelectorAll('[data-atom-marker]').forEach((el) => {
    if (ids.has(el.getAttribute('data-atom-marker') ?? '')) el.remove();
  });
  clone.querySelectorAll('[data-annotation]').forEach((el) => {
    if (markIds.has(el.getAttribute('data-annotation') ?? '')) el.remove();
  });
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  clone.removeAttribute('class');
  clone.setAttribute('style', 'position:fixed;left:-100000px;top:0;pointer-events:none');
  document.body.append(clone);
  let emf: Uint8Array;
  try {
    emf = await svgToEmf(clone, w, h);
  } catch (e) {
    notify(tr('ChemDraw 用のファイルを作れませんでした: {message}', { message: (e as Error).message }), 'error');
    return;
  } finally {
    clone.remove();
  }

  const layout = { width: w, height: h };
  const structures = images.map((image) => {
    const r = imageRect(image, layout);
    return { cdxml: image.cdxml!, x: r.x * PT, y: r.y * PT, w: r.w * PT };
  });
  const font = (fig.fontFamily.split(',')[0] ?? '').trim().replace(/^["']|["']$/g, '') || 'Arial';
  const exportMarks: ExportMark[] = marks.map((a) => {
    const image = images.find((x) => x.id === a.imageId)!;
    const { p1 } = imageAnchorToPx(a, imageRect(image, layout));
    const lines = a.text.split('\n').map((line) =>
      parseRich(line).map(
        (seg): ExportMarkSeg => ({ text: seg.text, bold: seg.kind === 'bold', italic: seg.kind === 'italic', sub: seg.kind === 'sub', sup: seg.kind === 'sup' }),
      ),
    );
    return {
      structure: images.indexOf(image),
      lines,
      x: p1.px * PT,
      y: p1.py * PT,
      size: a.fontSize * PT,
      lineHeight: a.fontSize * 1.25 * PT,
      font,
      color: a.stroke,
    };
  });
  const shapes: ExportShape[] = [];
  for (const m of doc.markers) {
    const image = m.imageId ? images.find((x) => x.id === m.imageId) : undefined;
    const style = doc.markerStyles.find((s) => s.id === m.styleId);
    const pos = image && style && m.atomId ? atomMarkerPos(image, m.atomId, layout, fig.markerSize) : null;
    if (!image || !style || !pos) continue;
    shapes.push({ structure: images.indexOf(image), shape: style.shape, x: pos.x * PT, y: pos.y * PT, size: fig.markerSize * PT, color: style.color });
  }
  const xml = buildChemDrawDocument({ width: w * PT, height: h * PT, picture: { emf }, structures, marks: exportMarks, shapes });
  const name = `${projectName ? baseName(projectName) : 'figure'}.cdxml`;
  downloadBlob(new Blob([xml], { type: 'chemical/x-cdxml' }), name);
  notify(
    tr('{name} を保存しました。開くと ChemDraw が起動します。ChemDraw で Ctrl+A → Ctrl+C して Word に貼ると、Word の上でダブルクリックして構造式を直せます', { name }),
    'info',
  );
}

import { memo } from 'react';
import { drawCdxml } from '../lib/cdxml';
import { imageRect, PX_PER_PT } from '../lib/scene';
import type { FigureImage } from '../state/types';

/** SVG の中身と viewBox を取り出す (構造式をそのまま図に埋め込むため) */
export function svgParts(svg: string): { inner: string; width: number; height: number } | null {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName !== 'svg') return null;
  const box = (root.getAttribute('viewBox') ?? '').split(/[\s,]+/).map(Number);
  const width = box.length === 4 && box[2] > 0 ? box[2] : Number.parseFloat(root.getAttribute('width') ?? '0');
  const height = box.length === 4 && box[3] > 0 ? box[3] : Number.parseFloat(root.getAttribute('height') ?? '0');
  if (!(width > 0) || !(height > 0)) return null;
  return { inner: root.innerHTML, width, height };
}

/** SVG から 高さ÷幅 を求める */
export function svgRatio(svg: string): number | null {
  const parts = svgParts(svg);
  return parts ? parts.height / parts.width : null;
}

export { imageRect } from '../lib/scene';

/** ChemDraw の構造式を、図の上の枠の大きさで描く。線の太さなどは ChemDraw の書式のまま */
export function cdxmlImageInner(image: FigureImage, rect: { w: number }) {
  if (!image.cdxml) return null;
  const natural = drawCdxml(image.cdxml, 1);
  if (!natural) return null;
  const scale = rect.w / PX_PER_PT / (natural.box.r - natural.box.l);
  return drawCdxml(image.cdxml, scale)?.inner ?? null;
}

/**
 * 図に置いた構造式・画像。
 * SVG は中身をそのまま入れる (Word / PowerPoint で「図形に変換」したときに編集できる)。
 * 貼り付けた画像はそのまま image として置く。
 * ChemDraw の構造式は data-cdxml を付ける (「ChemDraw で開く」では、この部分を ChemDraw のデータで置き換える)
 */
export const FigureImages = memo(function FigureImages({
  images,
  figure,
}: {
  images: FigureImage[];
  figure: { width: number; height: number };
}) {
  return (
    <>
      {images.map((image) => {
        const rect = imageRect(image, figure);
        if (image.cdxml) {
          const inner = cdxmlImageInner(image, rect);
          if (inner)
            return (
              <g
                key={image.id}
                data-image={image.id}
                data-cdxml=""
                transform={`translate(${rect.x.toFixed(2)} ${rect.y.toFixed(2)}) scale(${PX_PER_PT.toFixed(5)})`}
                dangerouslySetInnerHTML={{ __html: inner }}
              />
            );
        }
        if (image.svg) {
          const parts = svgParts(image.svg);
          if (!parts) return null;
          const scale = rect.w / parts.width;
          return (
            <g
              key={image.id}
              data-image={image.id}
              transform={`translate(${rect.x.toFixed(1)} ${rect.y.toFixed(1)}) scale(${scale.toFixed(4)})`}
              dangerouslySetInnerHTML={{ __html: parts.inner }}
            />
          );
        }
        if (!image.href) return null;
        return <image key={image.id} data-image={image.id} href={image.href} x={rect.x} y={rect.y} width={rect.w} height={rect.h} preserveAspectRatio="none" />;
      })}
    </>
  );
});

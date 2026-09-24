import { tr } from '../i18n';
import { memo, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { buildScene2d, fullView2d, type Scene2d } from '../lib/scene2d';
import { setView2d, useEditor } from '../state/store';
import type { FigureImage, FigureStyle } from '../state/types';
import { FigureImages } from './FigureImages';
import { RichSvgText } from './RichText';

const INK = '#000000';

/** 2D (等高線) の図。書き出しにもそのまま使う */
export const Figure2dContent = memo(function Figure2dContent({
  scene,
  figure,
  images = [],
}: {
  scene: Scene2d;
  figure: FigureStyle;
  images?: FigureImage[];
}) {
  const { layout, plot: p } = scene;
  const { plot } = layout;
  const bottom = plot.y + plot.h;
  return (
    <g fontFamily={figure.fontFamily} pointerEvents="none">
      <FigureImages images={images} figure={layout} />
      {figure.showBorder && (
        <rect x={0.5} y={0.5} width={layout.width - 1} height={layout.height - 1} fill="none" stroke={INK} strokeWidth={1} />
      )}
      {layout.topBand && scene.topPath && <path d={scene.topPath} fill="none" stroke={p.color} strokeWidth={0.8} />}
      {layout.rightBand && scene.rightPath && <path d={scene.rightPath} fill="none" stroke={p.color} strokeWidth={0.8} />}

      {scene.diagonal && (
        <line
          x1={scene.diagonal.x1}
          y1={scene.diagonal.y1}
          x2={scene.diagonal.x2}
          y2={scene.diagonal.y2}
          stroke={INK}
          strokeWidth={0.5}
          strokeDasharray="4 3"
          opacity={0.5}
        />
      )}

      <g clipPath="url(#plot2d-clip)">
        {scene.contours.map((c, i) => (
          <path key={c.level} d={c.d} fill="none" stroke={p.color} strokeWidth={p.lineWidth} opacity={i === 0 ? 0.75 : 1} />
        ))}
      </g>

      <rect x={plot.x} y={plot.y} width={plot.w} height={plot.h} fill="none" stroke={INK} strokeWidth={1} />

      {/* 横軸 (F2) */}
      <path d={scene.xTicks.map((t) => `M${t.px.toFixed(1)} ${bottom}v5`).join('')} stroke={INK} strokeWidth={0.8} />
      {scene.xTicks.map((t) => (
        <text key={t.label} x={t.px} y={bottom + 6 + figure.tickFontSize} fontSize={figure.tickFontSize} textAnchor="middle" fill={INK}>
          {t.label}
        </text>
      ))}

      {/* 縦軸 (F1) */}
      <path d={scene.yTicks.map((t) => `M${plot.x} ${t.py.toFixed(1)}h-5`).join('')} stroke={INK} strokeWidth={0.8} />
      {scene.yTicks.map((t) => (
        <text key={t.label} x={plot.x - 8} y={t.py + figure.tickFontSize * 0.36} fontSize={figure.tickFontSize} textAnchor="end" fill={INK}>
          {t.label}
        </text>
      ))}

      {figure.showXCaption && (
        <text x={plot.x} y={layout.captionY} fontSize={9} fill={INK}>
          {scene.caption}
        </text>
      )}
      {figure.showTitle && scene.title && (
        <RichSvgText
          x={plot.x + plot.w / 2}
          y={layout.titleY}
          text={scene.title}
          fontSize={figure.titleFontSize}
          textAnchor="middle"
          fill={INK}
        />
      )}
    </g>
  );
});

type Gesture = { type: 'pan'; x0: number; y0: number; view: Scene2d['plot']['view'] } | { type: 'zoom'; x0: number; y0: number; x1: number; y1: number };

export function Figure2dView({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const doc = useEditor((s) => s.doc);
  const data2d = useEditor((s) => s.data2d);
  const tool = useEditor((s) => s.tool);
  const scene = useMemo(() => buildScene2d(doc, doc.plot2d ? data2d[doc.plot2d.spectrumId] : undefined), [doc, data2d]);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Gesture | null>(null);
  if (!scene) return null;
  const { layout } = scene;
  const view = scene.plot.view;

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const { x, y } = toSvg(e);
    (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    gesture.current = tool === 'zoom' ? { type: 'zoom', x0: x, y0: y, x1: x, y1: y } : { type: 'pan', x0: x, y0: y, view };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const { x, y } = toSvg(e);
    useEditor.setState({ cursor2d: { x: layout.pxToX(x), y: layout.pxToY(y) } });
    const cur = gesture.current;
    if (!cur) return;
    if (cur.type === 'pan') {
      const dx = ((x - cur.x0) / layout.plot.w) * (cur.view.xMax - cur.view.xMin);
      const dy = ((y - cur.y0) / layout.plot.h) * (cur.view.yMax - cur.view.yMin);
      setView2d({ xMax: cur.view.xMax + dx, xMin: cur.view.xMin + dx, yMax: cur.view.yMax + dy, yMin: cur.view.yMin + dy });
    } else {
      cur.x1 = x;
      cur.y1 = y;
      setDraft({ ...cur });
    }
  };

  const onPointerUp = () => {
    const cur = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (cur?.type === 'zoom' && Math.abs(cur.x1 - cur.x0) > 4 && Math.abs(cur.y1 - cur.y0) > 4) {
      setView2d({
        xMax: layout.pxToX(Math.min(cur.x0, cur.x1)),
        xMin: layout.pxToX(Math.max(cur.x0, cur.x1)),
        yMax: layout.pxToY(Math.min(cur.y0, cur.y1)),
        yMin: layout.pxToY(Math.max(cur.y0, cur.y1)),
      });
    }
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    const { x, y } = toSvg(e);
    const factor = Math.pow(1.0015, e.deltaY || e.deltaX);
    const atX = layout.pxToX(x);
    const atY = layout.pxToY(y);
    setView2d({
      xMax: atX + (view.xMax - atX) * factor,
      xMin: atX + (view.xMin - atX) * factor,
      yMax: atY + (view.yMax - atY) * factor,
      yMin: atY + (view.yMin - atY) * factor,
    });
  };

  return (
    <svg
      ref={svgRef}
      className={`figure tool-${tool === 'zoom' ? 'zoom' : 'select'}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => useEditor.setState({ cursor2d: null })}
      onWheel={onWheel}
      onDoubleClick={() => setView2d(fullView2d(scene.meta))}
    >
      <defs>
        <clipPath id="plot2d-clip">
          <rect x={layout.plot.x} y={layout.plot.y} width={layout.plot.w} height={layout.plot.h} />
        </clipPath>
      </defs>
      <rect data-ui="bg" x={0} y={0} width={layout.width} height={layout.height} fill="#ffffff" />
      <Figure2dContent scene={scene} figure={doc.figure} images={doc.figureImages ?? []} />
      {scene.tooDense && (
        <text data-ui="warn" x={layout.plot.x + 8} y={layout.plot.y + 18} fontSize={12} fill="#b42318">
          {tr('等高線が多すぎます。右の「等高線」で下限を上げてください')}
        </text>
      )}
      {draft?.type === 'zoom' && (
        <rect
          data-ui="zoom"
          x={Math.min(draft.x0, draft.x1)}
          y={Math.min(draft.y0, draft.y1)}
          width={Math.abs(draft.x1 - draft.x0)}
          height={Math.abs(draft.y1 - draft.y0)}
          fill="rgba(31,79,209,0.1)"
          stroke="#1f4fd1"
          strokeWidth={1}
        />
      )}
    </svg>
  );
}

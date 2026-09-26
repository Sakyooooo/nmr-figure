import { tr } from '../i18n';
import { memo, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Spectrum2dData } from '../lib/fid2d';
import { annotationBox, dashArray, type PlacedAnnotation } from '../lib/scene';
import { buildScene2d, fullView2d, type Layout2d, type Scene2d } from '../lib/scene2d';
import { addAnnotation, beginGesture, endGesture, select, setView2d, updateAnnotation, useEditor } from '../state/store';
import { annotationDefaults, type Annotation, type AnnotationKind, type FigureImage, type FigureStyle } from '../state/types';
import { AnnotationShape } from './FigureContent';
import { constrain, resizePoints, type Handle } from './FigureView';
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

      {/* 図形・文字と、交点の線 (点から上と右の投影まで) */}
      {scene.annotations.map((pa) => (pa.a.kind === 'cross' ? <CrossLines key={pa.a.id} pa={pa} layout={layout} /> : <AnnotationShape key={pa.a.id} pa={pa} />))}

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

/**
 * 交点の線: クロスピークから上と右の投影 (なければプロットの枠) まで。交わる所に小さい丸。
 * showValues なら線の端に ppm の値 (上に F2、右に F1) を書く
 */
export function CrossLines({ pa, layout }: { pa: PlacedAnnotation; layout: Layout2d }) {
  const { a, p1 } = pa;
  const { plot } = layout;
  if (p1.px < plot.x || p1.px > plot.x + plot.w || p1.py < plot.y || p1.py > plot.y + plot.h) return null;
  const top = layout.topBand ? layout.topBand.y : plot.y;
  const right = layout.rightBand ? layout.rightBand.x + layout.rightBand.w : plot.x + plot.w;
  const common = { stroke: a.stroke, strokeWidth: a.strokeWidth, strokeDasharray: dashArray(a.dash, a.strokeWidth), fill: 'none' };
  const fs = Math.max(7, a.fontSize * 0.6);
  return (
    <g>
      <line x1={p1.px} y1={p1.py} x2={p1.px} y2={top} {...common} />
      <line x1={p1.px} y1={p1.py} x2={right} y2={p1.py} {...common} />
      <circle cx={p1.px} cy={p1.py} r={3} fill="none" stroke={a.stroke} strokeWidth={Math.max(0.8, a.strokeWidth)} />
      {a.showValues && (
        <>
          <text x={p1.px + 2} y={top + fs} fontSize={fs} fill={a.stroke}>
            {a.x1.toFixed(2)}
          </text>
          <text x={right - 2} y={p1.py - 2} fontSize={fs} fill={a.stroke} textAnchor="end">
            {a.y1.toFixed(1)}
          </text>
        </>
      )}
    </g>
  );
}

type Gesture =
  | { type: 'pan'; x0: number; y0: number; view: Scene2d['plot']['view'] }
  | { type: 'zoom'; x0: number; y0: number; x1: number; y1: number }
  | { type: 'create'; kind: AnnotationKind; x0: number; y0: number; x1: number; y1: number }
  | { type: 'move'; id: string; x0: number; y0: number; orig: Annotation; token: number }
  | { type: 'resize'; id: string; handle: Handle; orig: PlacedAnnotation; token: number };

const SHAPES: AnnotationKind[] = ['ellipse', 'rect', 'arrow', 'line'];

/**
 * いちばん近い山 (クリックした所のまわり 横 ±winC・縦 ±winR 点で、絶対値のいちばん大きい所) の ppm。
 * そこが雑音の 6 倍に届かなければ、クリックした所のまま
 */
function snapPeak2d(s: Spectrum2dData, x: number, y: number, winC: number, winR: number): { x: number; y: number } {
  const col = ((x - s.first2) / (s.last2 - s.first2)) * (s.n2 - 1);
  const row = ((y - s.first1) / (s.last1 - s.first1)) * (s.n1 - 1);
  let best = -1;
  let bc = Math.round(col);
  let br = Math.round(row);
  for (let r = Math.max(0, Math.round(row) - winR); r <= Math.min(s.n1 - 1, Math.round(row) + winR); r++) {
    for (let c = Math.max(0, Math.round(col) - winC); c <= Math.min(s.n2 - 1, Math.round(col) + winC); c++) {
      const v = Math.abs(s.data[r * s.n2 + c]);
      if (v > best) {
        best = v;
        bc = c;
        br = r;
      }
    }
  }
  if (best < s.noise * 6) return { x, y };
  return { x: s.first2 + ((s.last2 - s.first2) * bc) / (s.n2 - 1), y: s.first1 + ((s.last1 - s.first1) * br) / (s.n1 - 1) };
}

export function Figure2dView({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const doc = useEditor((s) => s.doc);
  const data2d = useEditor((s) => s.data2d);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const scene = useMemo(() => buildScene2d(doc, doc.plot2d ? data2d[doc.plot2d.spectrumId] : undefined), [doc, data2d]);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Gesture | null>(null);
  if (!scene) return null;
  const { layout } = scene;
  const view = scene.plot.view;
  const data = doc.plot2d ? data2d[doc.plot2d.spectrumId] : undefined;

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };
  const at = (x: number, y: number) => ({ x: layout.pxToX(x), y: layout.pxToY(y) });
  const add = (kind: AnnotationKind, p: { x: number; y: number }, q: { x: number; y: number }, extra: Partial<Annotation> = {}) =>
    addAnnotation({ ...annotationDefaults(kind), layerId: scene.meta.id, space: '2d', x1: p.x, y1: p.y, x2: q.x, y2: q.y, ...extra });

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const { x, y } = toSvg(e);
    const capture = () => (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
    const hit = (e.target as Element).closest('[data-hit]')?.getAttribute('data-hit') ?? null;
    const [hitKind, hitId, hitHandle] = hit?.split(':') ?? [];
    if (tool === 'select' && (hitKind === 'annotation' || hitKind === 'handle')) {
      const pa = scene.annotations.find((p) => p.a.id === hitId);
      if (!pa) return;
      select({ kind: 'annotation', id: pa.a.id });
      const token = beginGesture();
      gesture.current = hitKind === 'handle' ? { type: 'resize', id: pa.a.id, handle: hitHandle as Handle, orig: pa, token } : { type: 'move', id: pa.a.id, x0: x, y0: y, orig: pa.a, token };
      capture();
      return;
    }
    if (tool === 'text') {
      add('text', at(x, y), at(x, y));
      requestAnimationFrame(() => document.getElementById('annotation-text')?.focus());
      return;
    }
    if (tool === 'cross') {
      // クロスピークの山に合わせる (画面で ±14 px のうちいちばん高い点)
      const p = at(x, y);
      const span = (px: number, plotPx: number, viewSpan: number, dataSpan: number, n: number) => Math.max(2, Math.round((px / plotPx) * n * (viewSpan / dataSpan)));
      const q = data
        ? snapPeak2d(
            data,
            p.x,
            p.y,
            span(14, layout.plot.w, view.xMax - view.xMin, Math.abs(data.first2 - data.last2), data.n2),
            span(14, layout.plot.h, view.yMax - view.yMin, Math.abs(data.first1 - data.last1), data.n1),
          )
        : p;
      add('cross', q, q);
      return;
    }
    if (SHAPES.includes(tool as AnnotationKind)) {
      gesture.current = { type: 'create', kind: tool as AnnotationKind, x0: x, y0: y, x1: x, y1: y };
      setDraft(gesture.current);
      capture();
      return;
    }
    select(null);
    capture();
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
    } else if (cur.type === 'move') {
      const dx = layout.pxToX(x) - layout.pxToX(cur.x0);
      const dy = layout.pxToY(y) - layout.pxToY(cur.y0);
      updateAnnotation(cur.id, { x1: cur.orig.x1 + dx, x2: cur.orig.x2 + dx, y1: cur.orig.y1 + dy, y2: cur.orig.y2 + dy }, false);
    } else if (cur.type === 'resize') {
      const next = resizePoints(cur.orig, cur.handle, x, y, e.shiftKey);
      const p = at(next.p1.px, next.p1.py);
      const q = at(next.p2.px, next.p2.py);
      updateAnnotation(cur.id, { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, false);
    } else {
      cur.x1 = x;
      cur.y1 = y;
      if (cur.type === 'create' && e.shiftKey) constrain(cur);
      setDraft({ ...cur });
    }
  };

  const onPointerUp = () => {
    const cur = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (!cur) return;
    if (cur.type === 'zoom' && Math.abs(cur.x1 - cur.x0) > 4 && Math.abs(cur.y1 - cur.y0) > 4) {
      setView2d({
        xMax: layout.pxToX(Math.min(cur.x0, cur.x1)),
        xMin: layout.pxToX(Math.max(cur.x0, cur.x1)),
        yMax: layout.pxToY(Math.min(cur.y0, cur.y1)),
        yMin: layout.pxToY(Math.max(cur.y0, cur.y1)),
      });
    } else if (cur.type === 'create') {
      const tiny = Math.hypot(cur.x1 - cur.x0, cur.y1 - cur.y0) < 4;
      // クリックだけのときは既定の大きさで作る
      const x1 = tiny ? cur.x0 + (cur.kind === 'ellipse' || cur.kind === 'rect' ? 30 : 40) : cur.x1;
      const y1 = tiny ? cur.y0 + (cur.kind === 'ellipse' || cur.kind === 'rect' ? 30 : 0) : cur.y1;
      add(cur.kind, at(cur.x0, cur.y0), at(x1, y1));
    } else if (cur.type === 'move' || cur.type === 'resize') {
      endGesture(cur.token);
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

  const selected = selection?.kind === 'annotation' ? scene.annotations.find((p) => p.a.id === selection.id) : undefined;
  const drawing = SHAPES.includes(tool as AnnotationKind) || tool === 'text' || tool === 'cross';
  return (
    <svg
      ref={svgRef}
      className={`figure tool-${tool === 'zoom' ? 'zoom' : drawing ? 'draw' : 'select'}`}
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
      {/* 選択ツールのときの、図形をつかむ所 */}
      {tool === 'select' && (
        <g data-ui="hit">
          {scene.annotations.map((pa) => {
            if (pa.a.kind === 'cross') return <circle key={pa.a.id} data-hit={`annotation:${pa.a.id}`} cx={pa.p1.px} cy={pa.p1.py} r={7} fill="transparent" className="hit move" />;
            const b = annotationBox(pa);
            return <rect key={pa.a.id} data-hit={`annotation:${pa.a.id}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" stroke="transparent" strokeWidth={10} className="hit move" />;
          })}
        </g>
      )}
      {selected && <Selection2d pa={selected} tool={tool} />}
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
      {draft?.type === 'create' && (
        <g data-ui="draft" opacity={0.7}>
          <AnnotationShape
            pa={{ a: { ...annotationDefaults(draft.kind), id: 'draft', layerId: '', x1: 0, y1: 0, x2: 0, y2: 0 }, p1: { px: draft.x0, py: draft.y0 }, p2: { px: draft.x1, py: draft.y1 } }}
          />
        </g>
      )}
    </svg>
  );
}

/** 選んでいる図形の枠と、大きさを変えるつまみ (交点の線は点だけ) */
function Selection2d({ pa, tool }: { pa: PlacedAnnotation; tool: string }) {
  const { a, p1, p2 } = pa;
  if (a.kind === 'cross') return <circle data-ui="sel" cx={p1.px} cy={p1.py} r={6} className="sel-outline" />;
  const handles: [Handle, number, number][] = [];
  if (a.kind === 'line' || a.kind === 'arrow') handles.push(['p1', p1.px, p1.py], ['p2', p2.px, p2.py]);
  else if (a.kind !== 'text') {
    const b = annotationBox(pa);
    const xs = [b.x, b.x + b.w / 2, b.x + b.w];
    const ys = [b.y, b.y + b.h / 2, b.y + b.h];
    handles.push(['nw', xs[0], ys[0]], ['n', xs[1], ys[0]], ['ne', xs[2], ys[0]], ['e', xs[2], ys[1]], ['se', xs[2], ys[2]], ['s', xs[1], ys[2]], ['sw', xs[0], ys[2]], ['w', xs[0], ys[1]]);
  }
  const b = annotationBox(pa);
  return (
    <g data-ui="sel">
      <rect x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} className="sel-outline" />
      {tool === 'select' && handles.map(([h, x, y]) => <rect key={h} data-hit={`handle:${a.id}:${h}`} x={x - 4} y={y - 4} width={8} height={8} className={`handle handle-${h}`} />)}
    </g>
  );
}

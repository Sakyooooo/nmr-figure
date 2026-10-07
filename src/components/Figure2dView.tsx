import { tr } from '../i18n';
import { memo, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Spectrum2dData } from '../lib/fid2d';
import { annotationBox, dashArray, imageRect, markerBounds, nearestAtomAt, pxToImageAnchor, type PlacedAnnotation } from '../lib/scene';
import { buildScene2d, fullView2d, type Layout2d, type Scene2d } from '../lib/scene2d';
import { drawInChemDraw } from '../state/chemdraw';
import {
  addAnnotation,
  beginGesture,
  edit,
  editAnnotationText,
  endGesture,
  notify,
  openStructureEditor,
  select,
  setMarkerOffset,
  setView2d,
  toggleAtomMarker,
  toggleMarker2d,
  updateAnnotation,
  updateFigureImage,
  useEditor,
} from '../state/store';
import { annotationDefaults, type Annotation, type AnnotationKind, type FigureImage, type FigureStyle } from '../state/types';
import { AnnotationShape, LegendBox, MarkerGlyphs } from './FigureContent';
import { constrain, ImageHits, MarkerHits, MarkerSelection, resizePoints, type Handle } from './FigureView';
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

      {/* マーカー (クロスピーク・構造式の原子) と凡例 */}
      <MarkerGlyphs markers={scene.markers} figure={figure} />
      {scene.legend && <LegendBox legend={scene.legend} figure={figure} />}

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
  | { type: 'move'; id: string; x0: number; y0: number; orig: PlacedAnnotation; at: Anchor2d; token: number }
  | { type: 'resize'; id: string; handle: Handle; orig: PlacedAnnotation; at: Anchor2d; token: number }
  | { type: 'imageMove'; id: string; x0: number; y0: number; ox: number; oy: number; token: number }
  | { type: 'imageResize'; id: string; x0: number; w0: number; token: number }
  | { type: 'markerMove'; id: string; x0: number; y0: number; dx0: number; dy0: number; token: number }
  | { type: 'markerResize'; cx: number; cy: number; d0: number; s0: number; token: number }
  | { type: 'legend'; x0: number; y0: number; lx: number; ly: number; token: number }
  | { type: 'legendResize'; y0: number; h0: number; fs0: number; token: number };

/** 図形の固定先: 等高線の ppm か、構造式の枠 (割合)。構造式の上に置いた帰属の文字などは構造式と一緒に動く (1D の図と同じ) */
type Anchor2d = { kind: 'plot' } | { kind: 'image'; id: string };

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
  /** その場所にある構造式・画像 (後から置いたものが上) */
  const imageAt = (x: number, y: number) => {
    const images = doc.figureImages ?? [];
    for (let i = images.length - 1; i >= 0; i--) {
      const r = imageRect(images[i], layout);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return images[i].id;
    }
    return null;
  };
  const anchorAt = (x: number, y: number): Anchor2d => {
    const id = imageAt(x, y);
    return id ? { kind: 'image', id } : { kind: 'plot' };
  };
  const anchorOf = (a: Annotation): Anchor2d => (a.imageId && doc.figureImages.some((x) => x.id === a.imageId) ? { kind: 'image', id: a.imageId } : { kind: 'plot' });
  const fromPx = (an: Anchor2d, px: number, py: number) => {
    if (an.kind === 'plot') return at(px, py);
    const image = doc.figureImages.find((x) => x.id === an.id);
    return image ? pxToImageAnchor(px, py, imageRect(image, layout)) : at(px, py);
  };
  const anchorFields = (an: Anchor2d): Partial<Annotation> => (an.kind === 'image' ? { imageId: an.id } : { imageId: undefined });
  /** クロスピークの山に合わせた ppm (画面で ±14 px のうちいちばん高い点。交点の線・マーカーで使う) */
  const snapAt = (x: number, y: number) => {
    const p = at(x, y);
    if (!data) return p;
    const span = (px: number, plotPx: number, viewSpan: number, dataSpan: number, n: number) => Math.max(2, Math.round((px / plotPx) * n * (viewSpan / dataSpan)));
    return snapPeak2d(
      data,
      p.x,
      p.y,
      span(14, layout.plot.w, view.xMax - view.xMin, Math.abs(data.first2 - data.last2), data.n2),
      span(14, layout.plot.h, view.yMax - view.yMin, Math.abs(data.first1 - data.last1), data.n1),
    );
  };
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
      const an = anchorOf(pa.a);
      gesture.current =
        hitKind === 'handle' ? { type: 'resize', id: pa.a.id, handle: hitHandle as Handle, orig: pa, at: an, token } : { type: 'move', id: pa.a.id, x0: x, y0: y, orig: pa, at: an, token };
      capture();
      return;
    }
    // 構造式・画像: つかんで動かす、右下の角で大きさを変える (縦横比はそのまま)
    if (tool === 'select' && (hitKind === 'image' || hitKind === 'imageHandle') && hitId) {
      const image = doc.figureImages.find((im) => im.id === hitId);
      if (!image) return;
      select({ kind: 'image', id: hitId });
      gesture.current =
        hitKind === 'imageHandle'
          ? { type: 'imageResize', id: hitId, x0: x, w0: image.w, token: beginGesture() }
          : { type: 'imageMove', id: hitId, x0: x, y0: y, ox: image.x, oy: image.y, token: beginGesture() };
      capture();
      return;
    }
    // マーカー: 少しずらす・大きさ (1D の図と同じ)
    if (tool === 'select' && hitKind === 'marker') {
      const m = doc.markers.find((k) => k.id === hitId);
      if (!m) return;
      select({ kind: 'marker', id: hitId });
      gesture.current = { type: 'markerMove', id: hitId, x0: x, y0: y, dx0: m.dx ?? 0, dy0: m.dy ?? 0, token: beginGesture() };
      capture();
      return;
    }
    if (tool === 'select' && hitKind === 'markerHandle') {
      const m = scene.markers.find((k) => k.id === hitId);
      if (!m) return;
      const c = markerBounds(m.style.shape, m.x, m.y, doc.figure.markerSize);
      gesture.current = { type: 'markerResize', cx: c.cx, cy: c.cy, d0: Math.max(4, Math.hypot(x - c.cx, y - c.cy)), s0: doc.figure.markerSize, token: beginGesture() };
      capture();
      return;
    }
    if (tool === 'select' && (hitKind === 'legend' || hitKind === 'legendHandle') && scene.legend) {
      select({ kind: 'legend', id: 'legend' });
      gesture.current =
        hitKind === 'legendHandle'
          ? { type: 'legendResize', y0: y, h0: scene.legend.h, fs0: doc.figure.legendFontSize, token: beginGesture() }
          : { type: 'legend', x0: x, y0: y, lx: scene.legend.x, ly: scene.legend.y, token: beginGesture() };
      capture();
      return;
    }
    if (tool === 'marker') {
      const styleId = useEditor.getState().activeMarkerStyleId;
      if (!styleId) {
        notify(tr('右の「マーカー・凡例」で付けたい種類を選んでください'), 'error');
        return;
      }
      // ChemDraw の構造式の上なら、いちばん近い原子に付ける (帰属)。端の原子は枠のすぐ端にあるので、枠の少し外まで探す
      const image = [...doc.figureImages].reverse().find((im) => {
        if (!im.cdxml) return false;
        const r = imageRect(im, layout);
        const pad = 12;
        return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad && (imageAt(x, y) === im.id || !!nearestAtomAt(im, x, y, layout));
      });
      if (image) {
        const atom = nearestAtomAt(image, x, y, layout);
        if (atom) toggleAtomMarker(image.id, atom, styleId);
        else notify(tr('原子の近くをクリックしてください'), 'info');
        return;
      }
      // 等高線の上: いちばん近いクロスピークに付ける (同じ種類がもう付いていれば外す)
      const { plot } = layout;
      if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) return;
      const q = snapAt(x, y);
      const tolX = (Math.abs(view.xMax - view.xMin) * 8) / plot.w;
      const tolY = (Math.abs(view.yMax - view.yMin) * 8) / plot.h;
      toggleMarker2d(scene.meta.id, styleId, q.x, q.y, tolX, tolY);
      return;
    }
    if (tool === 'text') {
      // 構造式の上なら構造式に固定する (帰属の文字など)
      const an = anchorAt(x, y);
      const p = fromPx(an, x, y);
      add('text', p, p, anchorFields(an));
      requestAnimationFrame(() => document.getElementById('annotation-text')?.focus());
      return;
    }
    if (tool === 'cross') {
      const q = snapAt(x, y);
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
      const dx = x - cur.x0;
      const dy = y - cur.y0;
      const p = fromPx(cur.at, cur.orig.p1.px + dx, cur.orig.p1.py + dy);
      const q = fromPx(cur.at, cur.orig.p2.px + dx, cur.orig.p2.py + dy);
      updateAnnotation(cur.id, { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, false);
    } else if (cur.type === 'resize') {
      const next = resizePoints(cur.orig, cur.handle, x, y, e.shiftKey);
      const p = fromPx(cur.at, next.p1.px, next.p1.py);
      const q = fromPx(cur.at, next.p2.px, next.p2.py);
      updateAnnotation(cur.id, { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, false);
    } else if (cur.type === 'imageMove') {
      updateFigureImage(cur.id, { x: cur.ox + (x - cur.x0) / layout.width, y: cur.oy + (y - cur.y0) / layout.height }, false);
    } else if (cur.type === 'imageResize') {
      updateFigureImage(cur.id, { w: Math.max(0.03, cur.w0 + (x - cur.x0) / layout.width) }, false);
    } else if (cur.type === 'markerMove') {
      setMarkerOffset(cur.id, cur.dx0 + x - cur.x0, cur.dy0 + y - cur.y0, false);
    } else if (cur.type === 'markerResize') {
      const size = Math.round(Math.min(30, Math.max(3, cur.s0 + 2 * (Math.hypot(x - cur.cx, y - cur.cy) - cur.d0))));
      if (size !== doc.figure.markerSize)
        edit((d) => {
          d.figure.markerSize = size;
        }, false);
    } else if (cur.type === 'legend') {
      const { plot } = layout;
      const lx = cur.lx + x - cur.x0;
      const ly = cur.ly + y - cur.y0;
      edit((d) => {
        d.figure.legendPos = { x: (lx - plot.x) / plot.w, y: (ly - plot.y) / plot.h };
      }, false);
    } else if (cur.type === 'legendResize') {
      const k = Math.max(0.3, (cur.h0 + y - cur.y0) / cur.h0);
      const fs = Math.round(Math.min(40, Math.max(6, cur.fs0 * k)));
      if (fs !== doc.figure.legendFontSize)
        edit((d) => {
          d.figure.legendFontSize = fs;
        }, false);
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
      // 丸・四角は構造式の上なら構造式に固定する。線・矢印は両端が同じ構造式の上のときだけ
      let an = anchorAt(cur.x0, cur.y0);
      if ((cur.kind === 'line' || cur.kind === 'arrow') && an.kind === 'image' && imageAt(x1, y1) !== an.id) an = { kind: 'plot' };
      add(cur.kind, fromPx(an, cur.x0, cur.y0), fromPx(an, x1, y1), anchorFields(an));
    } else if (cur.type === 'move') {
      reanchor(cur.id);
      endGesture(cur.token);
    } else if (
      cur.type === 'resize' ||
      cur.type === 'imageMove' ||
      cur.type === 'imageResize' ||
      cur.type === 'markerMove' ||
      cur.type === 'markerResize' ||
      cur.type === 'legend' ||
      cur.type === 'legendResize'
    ) {
      endGesture(cur.token);
    }
  };

  /** 文字・丸・四角を構造式の上へ動かしたら構造式に、外へ出したら等高線に固定し直す (見た目の位置は変えない。1D の図と同じ) */
  const reanchor = (id: string) => {
    const state = useEditor.getState();
    const now = buildScene2d(state.doc, state.doc.plot2d ? state.data2d[state.doc.plot2d.spectrumId] : undefined)?.annotations.find((p) => p.a.id === id);
    if (!now || now.a.kind === 'line' || now.a.kind === 'arrow' || now.a.kind === 'cross') return;
    const box = annotationBox(now);
    const an = anchorAt(box.x + box.w / 2, box.y + box.h / 2);
    const same = an.kind === 'image' ? now.a.imageId === an.id : !now.a.imageId;
    if (same) return;
    const p = fromPx(an, now.p1.px, now.p1.py);
    const q = fromPx(an, now.p2.px, now.p2.py);
    updateAnnotation(id, { ...anchorFields(an), x1: p.x, y1: p.y, x2: q.x, y2: q.y }, false);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // ポインタを図全体で受けているので、ダブルクリックの対象は図全体になる。場所から探し直す
    const under = document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);
    const value = (under.closest('[data-hit]') ?? (e.target as Element).closest('[data-hit]'))?.getAttribute('data-hit') ?? '';
    if (value.startsWith('image:')) {
      // ChemDraw の構造式は ChemDraw で、アプリで描いた構造式は構造式エディタで直す
      const image = doc.figureImages.find((im) => im.id === value.slice('image:'.length));
      if (image?.cdxml) void drawInChemDraw(image.id);
      else if (image?.source) openStructureEditor(image.id);
      return;
    }
    if (value.startsWith('annotation:')) {
      const a = doc.annotations.find((x) => x.id === value.slice('annotation:'.length));
      if (a?.kind === 'text') editAnnotationText();
      return;
    }
    setView2d(fullView2d(scene.meta));
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
  const selectedImageItem = selection?.kind === 'image' ? doc.figureImages.find((im) => im.id === selection.id) : undefined;
  const selectedImage = selectedImageItem ? imageRect(selectedImageItem, layout) : null;
  const selectedMarker = selection?.kind === 'marker' ? scene.markers.find((m) => m.id === selection.id) : undefined;
  const drawing = SHAPES.includes(tool as AnnotationKind) || tool === 'text' || tool === 'cross' || tool === 'marker';
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
      onDoubleClick={onDoubleClick}
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
      {/* 選択ツールのときの、構造式・画像と図形をつかむ所 (図形が上: 構造式の上の文字を選べるように) */}
      {tool === 'select' && <ImageHits images={doc.figureImages ?? []} figure={layout} />}
      {tool === 'select' && (
        <g data-ui="hit">
          <MarkerHits markers={scene.markers} size={doc.figure.markerSize} />
          {scene.legend && (
            <rect
              data-hit="legend:legend"
              x={scene.legend.x - 3}
              y={scene.legend.y - 3}
              width={scene.legend.w + 6}
              height={scene.legend.h + 6}
              fill="transparent"
              className="hit move"
            />
          )}
          {scene.annotations.map((pa) => {
            if (pa.a.kind === 'cross') return <circle key={pa.a.id} data-hit={`annotation:${pa.a.id}`} cx={pa.p1.px} cy={pa.p1.py} r={7} fill="transparent" className="hit move" />;
            const b = annotationBox(pa);
            return <rect key={pa.a.id} data-hit={`annotation:${pa.a.id}`} x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" stroke="transparent" strokeWidth={10} className="hit move" />;
          })}
        </g>
      )}
      {selected && <Selection2d pa={selected} tool={tool} />}
      {selectedMarker && <MarkerSelection m={selectedMarker} size={doc.figure.markerSize} tool={tool} />}
      {selection?.kind === 'legend' && scene.legend && (
        <g data-ui="sel">
          <rect x={scene.legend.x - 3} y={scene.legend.y - 3} width={scene.legend.w + 6} height={scene.legend.h + 6} className="sel-outline" />
          {tool === 'select' && (
            <rect data-hit="legendHandle:legend" x={scene.legend.x + scene.legend.w - 1} y={scene.legend.y + scene.legend.h - 1} width={8} height={8} className="handle handle-se" />
          )}
        </g>
      )}
      {selectedImage && (
        <rect data-ui="sel" x={selectedImage.x - 2} y={selectedImage.y - 2} width={selectedImage.w + 4} height={selectedImage.h + 4} className="sel-outline" />
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

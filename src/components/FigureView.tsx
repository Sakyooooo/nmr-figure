import { tr } from '../i18n';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { cdxmlAtomSites, drawCdxml } from '../lib/cdxml';
import { layerAt, toData, type Layout, type LayerGeom } from '../lib/layout';
import { nucleusDefaults } from '../lib/nuclei';
import { annotationBox, buildScene, pxToImageAnchor, type PlacedAnnotation, type Scene } from '../lib/scene';
import { snapToPeak } from '../lib/spectrum';
import {
  editAnnotationText,
  addAnnotation,
  addIntegral,
  addRegion,
  beginGesture,
  edit,
  endGesture,
  fitY,
  fullRange,
  notify,
  pointSpacing,
  select,
  setLayerScale,
  setTool,
  setView,
  toggleMarker,
  openStructureEditor,
  togglePeakLabel,
  toggleAtomMarker,
  updateFigureImage,
  updateAnnotation,
  updateIntegral,
  useEditor,
} from '../state/store';
import { drawInChemDraw } from '../state/chemdraw';
import { annotationDefaults, type AnnotationKind, type NmrDocument, type ViewState } from '../state/types';
import { AnnotationShape, FigureContent } from './FigureContent';
import { imageRect } from './FigureImages';

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2';

type Gesture =
  | {
      type: 'drag';
      x0: number;
      y0: number;
      view: ViewState;
      /** 最初に動いた向きで、左右なら移動、上下なら高さの変更に決める */
      axis: 'x' | 'y' | null;
      layerId: string | null;
      scale: number;
      all: boolean;
      token: number | null;
    }
  | { type: 'integral'; g: LayerGeom; x0: number; x1: number }
  | { type: 'integralEdge'; id: string; side: 'from' | 'to'; g: LayerGeom; token: number }
  | { type: 'zoom'; x0: number; x1: number; y0: number; y1: number }
  | { type: 'region'; x0: number; x1: number }
  | { type: 'create'; kind: AnnotationKind; at: Anchor; x0: number; y0: number; x1: number; y1: number }
  | { type: 'move'; id: string; x0: number; y0: number; orig: PlacedAnnotation; at: Anchor; token: number }
  | { type: 'resize'; id: string; handle: Handle; orig: PlacedAnnotation; at: Anchor; token: number }
  | { type: 'legend'; x0: number; y0: number; lx: number; ly: number; token: number }
  /** 凡例の右下の角: 文字の大きさを変える (枠の高さが指の位置に合うように) */
  | { type: 'legendResize'; y0: number; h0: number; fs0: number; token: number }
  | { type: 'imageMove'; id: string; x0: number; y0: number; ox: number; oy: number; token: number }
  | { type: 'imageResize'; id: string; x0: number; w0: number; token: number };

/** 図形の固定先: スペクトル (ppm・強度) か、構造式の枠 (割合)。構造式の上に置いた帰属の印は構造式と一緒に動く */
type Anchor = { kind: 'layer'; g: LayerGeom } | { kind: 'image'; id: string };

const SHAPE_TOOLS: AnnotationKind[] = ['ellipse', 'rect', 'arrow', 'line'];

export function FigureView({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const tool = useEditor((s) => s.tool);
  const selection = useEditor((s) => s.selection);
  const scene = useMemo(() => buildScene(doc, data), [doc, data]);
  const gesture = useRef<Gesture | null>(null);
  const [draft, setDraft] = useState<Gesture | null>(null);
  const { layout } = scene;

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: pt.x, y: pt.y };
  };

  // ホイール: 横方向の拡大縮小。Shift で縦方向
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      const { doc: d } = useEditor.getState();
      if (!d.layers.length) return;
      e.preventDefault();
      const factor = Math.pow(1.0015, e.deltaY || e.deltaX);
      if (e.shiftKey || useEditor.getState().tool === 'height') {
        setView({ yZoom: d.view.yZoom / factor });
        return;
      }
      const lay = buildScene(d, useEditor.getState().data).layout;
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
      const at = lay.pxToX(Math.min(lay.plot.x + lay.plot.w, Math.max(lay.plot.x, p.x)));
      setView({ xMax: at + (d.view.xMax - at) * factor, xMin: at + (d.view.xMin - at) * factor });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [svgRef]);

  const snapWindow = (g: LayerGeom) => {
    const pxWin = (8 * (doc.view.xMax - doc.view.xMin)) / layout.plot.w;
    return Math.max(pxWin, Math.min(nucleusDefaults(g.meta.nucleus).snapPpm, pxWin * 3));
  };

  /** 構造式のクリックした所にいちばん近い原子 (結合の長さの半分より遠ければ null) */
  const nearestAtom = (image: NmrDocument['figureImages'][number], x: number, y: number) => {
    const box = image.cdxml ? drawCdxml(image.cdxml, 1)?.box : null;
    if (!image.cdxml || !box) return null;
    const r = imageRect(image, layout);
    const k = r.w / (box.r - box.l);
    let best: { id: string; d: number } | null = null;
    for (const s of cdxmlAtomSites(image.cdxml)) {
      const d = Math.hypot(r.x + (s.x - box.l) * k - x, r.y + (s.y - box.t) * k - y);
      if (!best || d < best.d) best = { id: s.id, d };
    }
    return best && best.d <= Math.max(8, 7.5 * k) ? best.id : null;
  };

  /** その場所にある構造式・画像 (後から置いたものが上) */
  const imageAt = (x: number, y: number) => {
    for (let i = doc.figureImages.length - 1; i >= 0; i--) {
      const r = imageRect(doc.figureImages[i], layout);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return doc.figureImages[i].id;
    }
    return null;
  };
  /** 図形の固定先。preferImage なら、構造式の上では構造式に固定する */
  const anchorAt = (x: number, y: number, preferImage: boolean): Anchor | null => {
    const id = imageAt(x, y);
    if (id && preferImage) return { kind: 'image', id };
    const g = layerAt(layout, x, y);
    if (g) return { kind: 'layer', g };
    return id ? { kind: 'image', id } : null;
  };
  const anchorOf = (a: { layerId: string; imageId?: string }): Anchor | null => {
    if (a.imageId) return doc.figureImages.some((x) => x.id === a.imageId) ? { kind: 'image', id: a.imageId } : null;
    const g = layout.layers.find((l) => l.layer.id === a.layerId);
    return g ? { kind: 'layer', g } : null;
  };
  const fromPx = (at: Anchor, px: number, py: number) => {
    if (at.kind === 'layer') return toData(at.g, layout, px, py);
    const image = doc.figureImages.find((x) => x.id === at.id);
    return image ? pxToImageAnchor(px, py, imageRect(image, layout)) : { x: 0, y: 0 };
  };
  const anchorFields = (at: Anchor) => (at.kind === 'layer' ? { layerId: at.g.layer.id, imageId: undefined } : { layerId: '', imageId: at.id });

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || !doc.layers.length) return;
    const { x, y } = toSvg(e);
    const hit = (e.target as Element).closest('[data-hit]')?.getAttribute('data-hit') ?? null;
    const [hitKind, hitId, hitHandle] = hit?.split(':') ?? [];
    const g = layerAt(layout, x, y);
    const capture = () => (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);

    if (tool === 'height') {
      select(null);
      const all = !e.shiftKey || !g;
      gesture.current = {
        type: 'drag',
        x0: x,
        y0: y,
        view: doc.view,
        axis: 'y',
        layerId: g?.layer.id ?? null,
        scale: g?.layer.scale ?? 1,
        all,
        token: all ? null : beginGesture(),
      };
      capture();
      return;
    }

    if (tool === 'select') {
      if (hitKind === 'handle' || hitKind === 'annotation') {
        const pa = scene.annotations.find((p) => p.a.id === hitId);
        const at = pa && anchorOf(pa.a);
        if (!pa || !at) return;
        select({ kind: 'annotation', id: pa.a.id });
        const token = beginGesture();
        gesture.current =
          hitKind === 'handle'
            ? { type: 'resize', id: pa.a.id, handle: hitHandle as Handle, orig: pa, at, token }
            : { type: 'move', id: pa.a.id, x0: x, y0: y, orig: pa, at, token };
        capture();
        return;
      }
      if (hitKind === 'marker' || hitKind === 'peakLabel' || hitKind === 'integral') {
        select({ kind: hitKind, id: hitId });
        return;
      }
      if (hitKind === 'ihandle') {
        const x = doc.integrals.find((i) => i.id === hitId);
        const ig = x && layout.layers.find((l) => l.layer.id === x.layerId);
        if (!ig) return;
        gesture.current = { type: 'integralEdge', id: hitId, side: hitHandle as 'from' | 'to', g: ig, token: beginGesture() };
        capture();
        return;
      }
      if ((hitKind === 'image' || hitKind === 'imageHandle') && hitId) {
        const image = doc.figureImages.find((x) => x.id === hitId);
        if (!image) return;
        select({ kind: 'image', id: hitId });
        gesture.current =
          hitKind === 'imageHandle'
            ? { type: 'imageResize', id: hitId, x0: x, w0: image.w, token: beginGesture() }
            : { type: 'imageMove', id: hitId, x0: x, y0: y, ox: image.x, oy: image.y, token: beginGesture() };
        capture();
        return;
      }
      if (hitKind === 'legendHandle' && scene.legend) {
        select({ kind: 'legend', id: 'legend' });
        gesture.current = { type: 'legendResize', y0: y, h0: scene.legend.h, fs0: doc.figure.legendFontSize, token: beginGesture() };
        capture();
        return;
      }
      if (hitKind === 'legend' && scene.legend) {
        select({ kind: 'legend', id: 'legend' });
        gesture.current = { type: 'legend', x0: x, y0: y, lx: scene.legend.x, ly: scene.legend.y, token: beginGesture() };
        capture();
        return;
      }
      select(null);
      gesture.current = {
        type: 'drag',
        x0: x,
        y0: y,
        view: doc.view,
        axis: null,
        layerId: g?.layer.id ?? null,
        scale: g?.layer.scale ?? 1,
        all: e.shiftKey || !g,
        token: null,
      };
      capture();
      return;
    }

    if (tool === 'integral') {
      if (hitKind === 'integral' || hitKind === 'ihandle') {
        const x = doc.integrals.find((i) => i.id === hitId);
        const ig = x && layout.layers.find((l) => l.layer.id === x.layerId);
        if (hitKind === 'ihandle' && ig) {
          gesture.current = { type: 'integralEdge', id: hitId, side: hitHandle as 'from' | 'to', g: ig, token: beginGesture() };
          capture();
        } else {
          select({ kind: 'integral', id: hitId });
        }
        return;
      }
      if (!g) return;
      gesture.current = { type: 'integral', g, x0: x, x1: x };
      setDraft(gesture.current);
      capture();
      return;
    }

    if (tool === 'zoom') {
      gesture.current = { type: 'zoom', x0: x, x1: x, y0: y, y1: y };
      setDraft(gesture.current);
      capture();
      return;
    }
    if (tool === 'region') {
      gesture.current = { type: 'region', x0: x, x1: x };
      setDraft(gesture.current);
      capture();
      return;
    }

    if (SHAPE_TOOLS.includes(tool as AnnotationKind) || tool === 'text') {
      // 構造式の上なら構造式に固定する (帰属の印など)。線・矢印は、両端が同じ構造式の上のときだけ (作り終えたときに決める)
      const at = anchorAt(x, y, tool !== 'line' && tool !== 'arrow');
      if (!at) return;
      if (tool === 'text') {
        const p = fromPx(at, x, y);
        addAnnotation({ ...annotationDefaults('text'), ...anchorFields(at), x1: p.x, y1: p.y, x2: p.x, y2: p.y });
        requestAnimationFrame(() => document.getElementById('annotation-text')?.focus());
        return;
      }
      gesture.current = { type: 'create', kind: tool as AnnotationKind, at, x0: x, y0: y, x1: x, y1: y };
      setDraft(gesture.current);
      capture();
      return;
    }

    // マーカー: ChemDraw の構造式の上なら、いちばん近い原子に付ける (帰属)
    if (tool === 'marker') {
      // 端の原子 (末端の CH3 など) は構造式の枠のすぐ端にあるので、枠の少し外まで原子を探す
      const image = [...doc.figureImages].reverse().find((im) => {
        if (!im.cdxml) return false;
        const r = imageRect(im, layout);
        const pad = 12;
        return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad && (imageAt(x, y) === im.id || !!nearestAtom(im, x, y));
      });
      if (image?.cdxml) {
        const styleId = useEditor.getState().activeMarkerStyleId;
        if (!styleId) {
          notify(tr('右の「マーカー・凡例」で付けたい種類を選んでください'), 'error');
          return;
        }
        const atom = nearestAtom(image, x, y);
        if (atom) toggleAtomMarker(image.id, atom, styleId);
        else notify(tr('原子の近くをクリックしてください'), 'info');
        return;
      }
    }

    if (!g) return;

    const win = snapWindow(g);
    const peak = snapToPeak(g.data, g.meta, layout.pxToX(x), win);
    if (!peak) return;
    const raw = peak.ppm - g.meta.refOffset;

    if (tool === 'peak') {
      if (hitKind === 'peakLabel') {
        edit((d) => {
          d.peakLabels = d.peakLabels.filter((p) => p.id !== hitId);
        });
        return;
      }
      togglePeakLabel(g.layer.id, raw, pointSpacing(g.meta) * 1.5);
    } else if (tool === 'marker') {
      const styleId = useEditor.getState().activeMarkerStyleId;
      if (!styleId) {
        notify(tr('右の「マーカー・凡例」で付けたい種類を選んでください'), 'error');
        return;
      }
      toggleMarker(g.layer.id, styleId, raw, pointSpacing(g.meta) * 1.5);
    } else if (tool === 'reference') {
      useEditor.setState({ pendingReference: { layerId: g.layer.id, ppm: peak.ppm } });
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const { x, y } = toSvg(e);
    const cur = gesture.current;
    if (!cur) {
      if (doc.layers.length && x >= layout.plot.x && x <= layout.plot.x + layout.plot.w) {
        useEditor.setState({ cursorPpm: layout.pxToX(x) });
      }
      return;
    }
    switch (cur.type) {
      case 'drag': {
        if (!cur.axis) {
          if (Math.hypot(x - cur.x0, y - cur.y0) < 4) break;
          cur.axis = Math.abs(x - cur.x0) >= Math.abs(y - cur.y0) ? 'x' : 'y';
          if (cur.axis === 'y') cur.token = cur.all ? null : beginGesture();
        }
        if (cur.axis === 'x') {
          const d = ((x - cur.x0) / layout.plot.w) * (cur.view.xMax - cur.view.xMin);
          setView({ xMax: cur.view.xMax + d, xMin: cur.view.xMin + d });
        } else {
          // 上へドラッグで高く、下へで低く (100 px で約 2.3 倍)
          const factor = Math.exp((cur.y0 - y) / 120);
          if (cur.all || !cur.layerId) setView({ yZoom: cur.view.yZoom * factor });
          else setLayerScale(cur.layerId, cur.scale * factor);
        }
        break;
      }
      case 'integral':
        cur.x1 = x;
        setDraft({ ...cur });
        break;
      case 'integralEdge': {
        const ppm = layout.pxToX(Math.min(layout.plot.x + layout.plot.w, Math.max(layout.plot.x, x))) - cur.g.meta.refOffset;
        updateIntegral(cur.id, { [cur.side]: ppm }, false);
        break;
      }
      case 'zoom':
        cur.x1 = x;
        cur.y1 = y;
        setDraft({ ...cur });
        break;
      case 'region':
        cur.x1 = x;
        setDraft({ ...cur });
        break;
      case 'create':
        cur.x1 = x;
        cur.y1 = y;
        if (e.shiftKey) constrain(cur);
        setDraft({ ...cur });
        break;
      case 'move': {
        const dx = x - cur.x0;
        const dy = y - cur.y0;
        const { p1, p2 } = cur.orig;
        const q1 = fromPx(cur.at, p1.px + dx, p1.py + dy);
        const q2 = fromPx(cur.at, p2.px + dx, p2.py + dy);
        updateAnnotation(cur.id, { x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y }, false);
        break;
      }
      case 'resize': {
        const next = resizePoints(cur.orig, cur.handle, x, y, e.shiftKey);
        const q1 = fromPx(cur.at, next.p1.px, next.p1.py);
        const q2 = fromPx(cur.at, next.p2.px, next.p2.py);
        updateAnnotation(cur.id, { x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y }, false);
        break;
      }
      case 'imageMove': {
        updateFigureImage(cur.id, { x: cur.ox + (x - cur.x0) / layout.width, y: cur.oy + (y - cur.y0) / layout.height }, false);
        break;
      }
      case 'imageResize': {
        // 右下の角をドラッグ。縦横比はそのまま
        updateFigureImage(cur.id, { w: Math.max(0.03, cur.w0 + (x - cur.x0) / layout.width) }, false);
        break;
      }
      case 'legendResize': {
        // 行の高さは文字の大きさに比例するので、枠の高さの伸び縮みの割合で文字を大きくする
        const k = Math.max(0.3, (cur.h0 + y - cur.y0) / cur.h0);
        const fs = Math.round(Math.min(40, Math.max(6, cur.fs0 * k)));
        if (fs !== doc.figure.legendFontSize)
          edit((d) => {
            d.figure.legendFontSize = fs;
          }, false);
        break;
      }
      case 'legend': {
        const { plot } = layout;
        const lx = cur.lx + x - cur.x0;
        const ly = cur.ly + y - cur.y0;
        edit((d) => {
          d.figure.legendPos = { x: (lx - plot.x) / plot.w, y: (ly - plot.y) / plot.h };
        }, false);
        break;
      }
    }
  };

  const onPointerUp = () => {
    const cur = gesture.current;
    gesture.current = null;
    setDraft(null);
    if (!cur) return;
    if (cur.type === 'zoom') {
      if (Math.abs(cur.x1 - cur.x0) > 4) zoomToBox(cur, layout, doc.view.yZoom);
    } else if (cur.type === 'drag') {
      if (cur.token !== null) endGesture(cur.token);
    } else if (cur.type === 'integralEdge') {
      endGesture(cur.token);
    } else if (cur.type === 'integral') {
      if (Math.abs(cur.x1 - cur.x0) > 2) {
        const off = cur.g.meta.refOffset;
        addIntegral(cur.g.layer.id, layout.pxToX(cur.x0) - off, layout.pxToX(cur.x1) - off);
      }
    } else if (cur.type === 'region') {
      if (Math.abs(cur.x1 - cur.x0) > 2) {
        addRegion(layout.pxToX(cur.x0), layout.pxToX(cur.x1));
        setTool('select');
      }
    } else if (cur.type === 'create') {
      const tiny = Math.hypot(cur.x1 - cur.x0, cur.y1 - cur.y0) < 4;
      // クリックだけのときは既定の大きさで作る
      const x1 = tiny ? cur.x0 + (cur.kind === 'ellipse' || cur.kind === 'rect' ? 30 : 40) : cur.x1;
      const y1 = tiny ? cur.y0 + (cur.kind === 'ellipse' || cur.kind === 'rect' ? 30 : 0) : cur.y1;
      let at = cur.at;
      if (cur.kind === 'line' || cur.kind === 'arrow') {
        const id = imageAt(cur.x0, cur.y0);
        if (id && id === imageAt(x1, y1)) at = { kind: 'image', id };
      }
      const p = fromPx(at, cur.x0, cur.y0);
      const q = fromPx(at, x1, y1);
      addAnnotation({ ...annotationDefaults(cur.kind), ...anchorFields(at), x1: p.x, y1: p.y, x2: q.x, y2: q.y });
    } else if (cur.type === 'move') {
      reanchor(cur.id);
      endGesture(cur.token);
    } else if (cur.type === 'resize' || cur.type === 'legend' || cur.type === 'legendResize' || cur.type === 'imageMove' || cur.type === 'imageResize') {
      endGesture(cur.token);
    }
  };

  /** 文字・丸・四角を構造式の上へ動かしたら構造式に、外へ出したらスペクトルに固定し直す (見た目の位置は変えない) */
  const reanchor = (id: string) => {
    const state = useEditor.getState();
    const now = buildScene(state.doc, state.data).annotations.find((p) => p.a.id === id);
    if (!now || now.a.kind === 'line' || now.a.kind === 'arrow') return;
    const box = annotationBox(now);
    const at = anchorAt(box.x + box.w / 2, box.y + box.h / 2, true);
    if (!at) return;
    const same = at.kind === 'image' ? now.a.imageId === at.id : !now.a.imageId && now.a.layerId === at.g.layer.id;
    if (same) return;
    const q1 = fromPx(at, now.p1.px, now.p1.py);
    const q2 = fromPx(at, now.p2.px, now.p2.py);
    updateAnnotation(id, { ...anchorFields(at), x1: q1.x, y1: q1.y, x2: q2.x, y2: q2.y }, false);
  };

  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    // ドラッグのためにポインタを図全体で受けているので、ダブルクリックの対象は図全体になる。場所から探し直す
    const under = document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);
    const hit = under.closest('[data-hit]') ?? (e.target as Element).closest('[data-hit]');
    if (hit) {
      const value = hit.getAttribute('data-hit') ?? '';
      if (value.startsWith('annotation:')) {
        const a = doc.annotations.find((x) => x.id === value.slice('annotation:'.length));
        if (a?.kind === 'text') editAnnotationText();
      }
      // アプリで描いた構造式は、ダブルクリックで描き直せる
      if (value.startsWith('image:')) {
        const image = doc.figureImages.find((x) => x.id === value.slice('image:'.length));
        if (image?.cdxml) void drawInChemDraw(image.id);
        else if (image?.source) openStructureEditor(image.id);
      }
      return;
    }
    if (tool === 'select' || tool === 'zoom') fullRange();
  };

  const selected = selection?.kind === 'annotation' ? scene.annotations.find((p) => p.a.id === selection.id) : undefined;

  return (
    <svg
      ref={svgRef}
      className={`figure tool-${tool}`}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => useEditor.setState({ cursorPpm: null })}
      onDoubleClick={onDoubleClick}
    >
      <rect data-ui="bg" x={0} y={0} width={layout.width} height={layout.height} fill="#ffffff" />
      {(doc.trend.showOnSpectrum || tool === 'region') && <RegionBands scene={scene} doc={doc} />}
      <FigureContent scene={scene} figure={doc.figure} images={doc.figureImages ?? []} />
      {tool === 'select' && <ImageHits images={doc.figureImages ?? []} figure={layout} />}
      {tool === 'select' && <HitLayer scene={scene} />}
      {(tool === 'select' || tool === 'integral') && <IntegralHits scene={scene} />}
      {(tool === 'peak' || tool === 'select') && <PeakLabelHits scene={scene} />}
      <SelectionOverlay scene={scene} selected={selected} doc={doc} />
      {draft && <DraftOverlay draft={draft} scene={scene} />}
    </svg>
  );
}

/**
 * 四角で拡大: 横は四角の範囲。縦は四角の上端が帯の上 (自動のときと同じ 95%) にくるように拡大し、下は基線のまま。
 * 四角が薄い (左右になぞっただけ) か上端が基線より下なら、縦は今までどおり範囲の一番高いピークに合わせる
 */
function zoomToBox(box: { x0: number; x1: number; y0: number; y1: number }, layout: Layout, yZoom: number) {
  const left = Math.min(box.x0, box.x1);
  const right = Math.max(box.x0, box.x1);
  const top = Math.min(box.y0, box.y1);
  const bottom = Math.max(box.y0, box.y1);
  const x = { xMax: layout.pxToX(left), xMin: layout.pxToX(right) };
  const g = layerAt(layout, (left + right) / 2, bottom);
  const above = g ? g.baseY - top : 0;
  if (!g || bottom - top < 6 || above < 4) {
    setView(x);
    fitY();
    return;
  }
  // 帯の高さ (縦倍率 1・倍率 1 のときの 1 の高さ)
  const band = g.unit / (yZoom * g.layer.scale);
  setView({ ...x, yZoom: (yZoom * 0.95 * band) / above });
}

/** [Shift] で描くとき: 丸・四角は正円・正方形、線・矢印は水平・垂直 (2D の図でも使う) */
export function constrain(c: { kind: AnnotationKind; x0: number; y0: number; x1: number; y1: number }) {
  const dx = c.x1 - c.x0;
  const dy = c.y1 - c.y0;
  if (c.kind === 'ellipse' || c.kind === 'rect') {
    const s = Math.max(Math.abs(dx), Math.abs(dy));
    c.x1 = c.x0 + Math.sign(dx || 1) * s;
    c.y1 = c.y0 + Math.sign(dy || 1) * s;
  } else if (Math.abs(dx) > Math.abs(dy)) c.y1 = c.y0;
  else c.x1 = c.x0;
}

export function resizePoints(orig: PlacedAnnotation, handle: Handle, x: number, y: number, keepRatio: boolean) {
  const { p1, p2 } = orig;
  if (handle === 'p1') return { p1: { px: x, py: y }, p2 };
  if (handle === 'p2') return { p1, p2: { px: x, py: y } };
  let left = Math.min(p1.px, p2.px);
  let right = Math.max(p1.px, p2.px);
  let top = Math.min(p1.py, p2.py);
  let bottom = Math.max(p1.py, p2.py);
  if (handle.includes('w')) left = Math.min(x, right - 2);
  if (handle.includes('e')) right = Math.max(x, left + 2);
  if (handle.includes('n')) top = Math.min(y, bottom - 2);
  if (handle.includes('s')) bottom = Math.max(y, top + 2);
  if (keepRatio && handle.length === 2) {
    const s = Math.max(right - left, bottom - top);
    if (handle.includes('w')) left = right - s;
    else right = left + s;
    if (handle.includes('n')) top = bottom - s;
    else bottom = top + s;
  }
  return { p1: { px: left, py: top }, p2: { px: right, py: bottom } };
}

/** 選択ツールのときだけ出す、クリック判定用の透明な図形 */
/** 構造式・画像をつかむ場所 (本体と、右下の角) */
function ImageHits({ images, figure }: { images: NmrDocument['figureImages']; figure: { width: number; height: number } }) {
  return (
    <g data-ui="hit">
      {images.map((image) => {
        const r = imageRect(image, figure);
        return (
          <g key={image.id}>
            <rect data-hit={`image:${image.id}`} x={r.x} y={r.y} width={r.w} height={r.h} fill="transparent" className="hit" />
            <rect
              data-hit={`imageHandle:${image.id}`}
              x={r.x + r.w - 5}
              y={r.y + r.h - 5}
              width={10}
              height={10}
              className="handle handle-se"
            />
          </g>
        );
      })}
    </g>
  );
}

function HitLayer({ scene }: { scene: Scene }) {
  return (
    <g data-ui="hit">
      {scene.annotations.map((pa) => {
        const { a, p1, p2 } = pa;
        const hit = `annotation:${a.id}`;
        if (a.kind === 'line' || a.kind === 'arrow') {
          return <line key={a.id} data-hit={hit} x1={p1.px} y1={p1.py} x2={p2.px} y2={p2.py} stroke="transparent" strokeWidth={12} className="hit" />;
        }
        const b = annotationBox(pa);
        if (a.kind === 'ellipse') {
          return (
            <ellipse
              key={a.id}
              data-hit={hit}
              cx={b.x + b.w / 2}
              cy={b.y + b.h / 2}
              rx={b.w / 2}
              ry={b.h / 2}
              fill="transparent"
              stroke="transparent"
              strokeWidth={10}
              className="hit"
            />
          );
        }
        return (
          <rect key={a.id} data-hit={hit} x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" stroke="transparent" strokeWidth={10} className="hit" />
        );
      })}
      {scene.markers.map((m) => (
        <circle key={m.id} data-hit={`marker:${m.id}`} cx={m.x} cy={m.y} r={7} fill="transparent" className="hit" />
      ))}
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
    </g>
  );
}

/** 積分曲線と値のクリック判定 */
function IntegralHits({ scene }: { scene: Scene }) {
  return (
    <g data-ui="hit">
      {scene.integrals.map((x) => {
        const len = x.text.length * 7 + 4;
        const hit = `integral:${x.id}`;
        return (
          <g key={x.id} data-hit={hit} className="hit pointer">
            {x.curve && <path d={x.curve} fill="none" stroke="transparent" strokeWidth={10} />}
            <rect x={x.tx - 7} y={x.anchor === 'end' ? x.ty : x.ty - len} width={14} height={len} fill="transparent" />
          </g>
        );
      })}
    </g>
  );
}

function PeakLabelHits({ scene }: { scene: Scene }) {
  return (
    <g data-ui="hit">
      {scene.peakLabels.map((p) => {
        const len = p.text.length * 7 + 4;
        const y = p.anchor === 'end' ? p.ty : p.ty - len;
        return <rect key={p.id} data-hit={`peakLabel:${p.id}`} x={p.tx - 7} y={y} width={14} height={len} fill="transparent" className="hit" />;
      })}
    </g>
  );
}

function SelectionOverlay({ scene, selected, doc }: { scene: Scene; selected?: PlacedAnnotation; doc: NmrDocument }) {
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  if (!selection) return null;
  if (selection.kind === 'integral') {
    const x = scene.integrals.find((i) => i.id === selection.id);
    if (!x) return null;
    const len = x.text.length * 7 + 4;
    const handles: ['from' | 'to', number, number][] = [
      ['from', x.start.x, x.start.y],
      ['to', x.end.x, x.end.y],
    ];
    return (
      <g data-ui="sel">
        {x.curve && <path d={x.curve} fill="none" className="sel-curve" />}
        <rect x={x.tx - 7} y={x.anchor === 'end' ? x.ty : x.ty - len} width={14} height={len} className="sel-outline" />
        {(tool === 'select' || tool === 'integral') &&
          handles.map(([side, hx, hy]) => (
            <rect key={side} data-hit={`ihandle:${x.id}:${side}`} x={hx - 3} y={hy - 9} width={6} height={18} className="handle handle-e" />
          ))}
      </g>
    );
  }
  if (selection.kind === 'marker') {
    const m = scene.markers.find((x) => x.id === selection.id);
    return m ? <circle data-ui="sel" cx={m.x} cy={m.y} r={doc.figure.markerSize / 2 + 4} className="sel-outline" /> : null;
  }
  if (selection.kind === 'peakLabel') {
    const p = scene.peakLabels.find((x) => x.id === selection.id);
    if (!p) return null;
    const len = p.text.length * 7 + 4;
    const y = p.anchor === 'end' ? p.ty : p.ty - len;
    return <rect data-ui="sel" x={p.tx - 7} y={y} width={14} height={len} className="sel-outline" />;
  }
  if (selection.kind === 'image') {
    const image = doc.figureImages.find((x) => x.id === selection.id);
    if (!image) return null;
    const r = imageRect(image, scene.layout);
    return <rect data-ui="sel" x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} className="sel-outline" />;
  }
  if (selection.kind === 'legend') {
    const l = scene.legend;
    return l ? (
      <g data-ui="sel">
        <rect x={l.x - 3} y={l.y - 3} width={l.w + 6} height={l.h + 6} className="sel-outline" />
        {/* 右下の角で大きさ (文字とマーカー) を変える */}
        {tool === 'select' && <rect data-hit="legendHandle:legend" x={l.x + l.w - 1} y={l.y + l.h - 1} width={8} height={8} className="handle handle-se" />}
      </g>
    ) : null;
  }
  if (!selected) return null;
  const { a, p1, p2 } = selected;
  const handles: [Handle, number, number][] = [];
  if (a.kind === 'line' || a.kind === 'arrow') {
    handles.push(['p1', p1.px, p1.py], ['p2', p2.px, p2.py]);
  } else if (a.kind !== 'text') {
    const b = annotationBox(selected);
    const xs = [b.x, b.x + b.w / 2, b.x + b.w];
    const ys = [b.y, b.y + b.h / 2, b.y + b.h];
    handles.push(
      ['nw', xs[0], ys[0]],
      ['n', xs[1], ys[0]],
      ['ne', xs[2], ys[0]],
      ['e', xs[2], ys[1]],
      ['se', xs[2], ys[2]],
      ['s', xs[1], ys[2]],
      ['sw', xs[0], ys[2]],
      ['w', xs[0], ys[1]],
    );
  }
  const b = annotationBox(selected);
  return (
    <g data-ui="sel">
      <rect x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} className="sel-outline" />
      {tool === 'select' &&
        handles.map(([h, x, y]) => (
          <rect key={h} data-hit={`handle:${a.id}:${h}`} x={x - 4} y={y - 4} width={8} height={8} className={`handle handle-${h}`} />
        ))}
    </g>
  );
}

/** 推移グラフで追跡している範囲 (画面だけに出す) */
function RegionBands({ scene, doc }: { scene: Scene; doc: NmrDocument }) {
  const { plot, xToPx } = scene.layout;
  return (
    <g data-ui="regions" pointerEvents="none">
      {doc.trend.regions.map((r) => {
        const a = Math.max(plot.x, Math.min(xToPx(r.from), xToPx(r.to)));
        const b = Math.min(plot.x + plot.w, Math.max(xToPx(r.from), xToPx(r.to)));
        if (b <= a) return null;
        return (
          <g key={r.id}>
            <rect x={a} y={plot.y} width={b - a} height={plot.h} fill={r.color} opacity={0.1} />
            <text x={(a + b) / 2} y={plot.y + plot.h - 4} fontSize={11} textAnchor="middle" fill={r.color}>
              {r.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function DraftOverlay({ draft, scene }: { draft: Gesture; scene: Scene }) {
  const { plot } = scene.layout;
  if (draft.type === 'integral') {
    const x = Math.min(draft.x0, draft.x1);
    return <rect data-ui="draft" x={x} y={draft.g.bandTop} width={Math.abs(draft.x1 - draft.x0)} height={draft.g.baseY - draft.g.bandTop} className="integral-band" />;
  }
  if (draft.type === 'zoom') {
    // 上下も自由な四角 (図の枠の中に収める)
    const top = Math.max(plot.y, Math.min(draft.y0, draft.y1));
    const bottom = Math.min(plot.y + plot.h, Math.max(draft.y0, draft.y1));
    return (
      <rect
        data-ui="draft"
        x={Math.min(draft.x0, draft.x1)}
        y={top}
        width={Math.abs(draft.x1 - draft.x0)}
        height={Math.max(0, bottom - top)}
        className="zoom-band"
      />
    );
  }
  if (draft.type === 'region') {
    const x = Math.min(draft.x0, draft.x1);
    return (
      <rect
        data-ui="draft"
        x={x}
        y={plot.y}
        width={Math.abs(draft.x1 - draft.x0)}
        height={plot.h}
        className="region-band"
      />
    );
  }
  if (draft.type !== 'create') return null;
  const pa: PlacedAnnotation = {
    a: { ...annotationDefaults(draft.kind), id: 'draft', layerId: '', x1: 0, y1: 0, x2: 0, y2: 0 },
    p1: { px: draft.x0, py: draft.y0 },
    p2: { px: draft.x1, py: draft.y1 },
  };
  return (
    <g data-ui="draft" opacity={0.7}>
      <AnnotationShape pa={pa} />
    </g>
  );
}


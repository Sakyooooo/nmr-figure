import { beforeEach, describe, expect, it } from 'vitest';
import { markerBounds } from '../lib/scene';
import { edit, loadDocument, nudgeMarker, setMarkerOffset, toggleMarker2d, useEditor } from './store';
import { emptyDocument } from './types';

const markers = () => useEditor.getState().doc.markers;

describe('マーカーの選択の枠', () => {
  it('丸は基準点が真ん中', () => {
    expect(markerBounds('circle', 10, 20, 10)).toEqual({ cx: 10, cy: 20, r: 5 });
  });

  it('三角は形の真ん中が基準点より上 (選択の枠を形に合わせる)', () => {
    const b = markerBounds('triangle', 10, 20, 10);
    expect(b.cx).toBeCloseTo(10);
    // 頂点 -1.1r・底 +0.75r の真ん中 = -0.175r
    expect(b.cy).toBeCloseTo(20 - 0.175 * 5);
    expect(b.r).toBeCloseTo(5);
    expect(markerBounds('invtriangle', 10, 20, 10).cy).toBeCloseTo(20 + 0.175 * 5);
  });
});

describe('マーカーを少しずらす', () => {
  beforeEach(() => {
    loadDocument(emptyDocument(), {}, null, null);
    edit((d) => {
      d.markers.push({ id: 'm1', layerId: 'L', styleId: 's', ppm: 7.2 });
    });
  });

  it('矢印キーで 1 px ずつ (Shift で 5 px)、位置を戻すと消える', () => {
    nudgeMarker('m1', 'ArrowRight', 1);
    nudgeMarker('m1', 'ArrowRight', 1);
    nudgeMarker('m1', 'ArrowUp', 5);
    expect(markers()[0]).toMatchObject({ dx: 2, dy: -5 });
    setMarkerOffset('m1', 0, 0);
    expect(markers()[0].dx).toBeUndefined();
    expect(markers()[0].dy).toBeUndefined();
  });

  it('元に戻すで、ずらす前に戻る', () => {
    nudgeMarker('m1', 'ArrowDown', 1);
    expect(markers()[0].dy).toBe(1);
    useEditor.setState((s) => ({ doc: s.past[s.past.length - 1], past: s.past.slice(0, -1) }));
    expect(markers()[0].dy).toBeUndefined();
  });
});

describe('2D のクロスピークのマーカー', () => {
  beforeEach(() => loadDocument(emptyDocument(), {}, null, null));

  it('付けて、近くをもう一度押すと外れる (違う種類は別に付く)', () => {
    toggleMarker2d('S2', 'red', 7.25, 128.1, 0.05, 0.5);
    expect(markers()).toHaveLength(1);
    expect(markers()[0]).toMatchObject({ space: '2d', layerId: 'S2', ppm: 7.25, ppm1: 128.1, styleId: 'red' });
    toggleMarker2d('S2', 'blue', 7.26, 128.2, 0.05, 0.5);
    expect(markers()).toHaveLength(2);
    toggleMarker2d('S2', 'red', 7.27, 128.3, 0.05, 0.5);
    expect(markers().map((m) => m.styleId)).toEqual(['blue']);
  });
});

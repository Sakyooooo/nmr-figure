import { describe, expect, it } from 'vitest';
import { emptyDocument, type NmrDocument } from '../state/types';
import { shownOnFigure } from './layout';

function doc(): NmrDocument {
  const d = emptyDocument();
  const layer = (id: string) => ({ id, spectrumId: 's' + id, visible: true, color: '#000', label: id, scale: 1, lineWidth: 1 });
  return {
    ...d,
    layers: [layer('a'), layer('b')],
    peakLabels: [
      { id: 'p1', layerId: 'a', ppm: 7.2 },
      { id: 'p2', layerId: 'b', ppm: 3.1 },
    ],
    integrals: [
      { id: 'i1', layerId: 'a', from: 7.4, to: 7.0 },
      { id: 'i2', layerId: 'b', from: 3.3, to: 2.9 },
    ],
  };
}

describe('図に出すピーク値・積分', () => {
  it('何も隠していなければ、そのまま', () => {
    const d = doc();
    expect(shownOnFigure(d)).toBe(d);
  });

  it('スペクトルごとに隠せる (スペクトルは出したまま、データは消さない)', () => {
    const d = doc();
    d.layers[1] = { ...d.layers[1], showPeaks: false };
    d.layers[0] = { ...d.layers[0], showIntegrals: false };
    const shown = shownOnFigure(d);
    expect(shown.peakLabels.map((p) => p.id)).toEqual(['p1']);
    expect(shown.integrals.map((x) => x.id)).toEqual(['i2']);
    expect(shown.layers.every((l) => l.visible)).toBe(true);
    // 元の図のデータは残っている (Delta との同期・SI 用テキストはこちらを使う)
    expect(d.peakLabels).toHaveLength(2);
    expect(d.integrals).toHaveLength(2);
  });

  it('図全体で隠す設定は、今まで通り全部隠す', () => {
    const d = doc();
    d.figure = { ...d.figure, showPeakLabels: false };
    expect(shownOnFigure(d).peakLabels).toEqual([]);
    expect(shownOnFigure(d).integrals).toHaveLength(2);
  });
});

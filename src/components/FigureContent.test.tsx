import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildScene } from '../lib/scene';
import { simulateFromSi } from '../lib/simulate';
import { addAnnotation, addIntegral, addSimulated, autoPeakLabels, edit, loadDocument, useEditor } from '../state/store';
import { annotationDefaults, emptyDocument } from '../state/types';
import { FigureContent } from './FigureContent';

// 画面 (UI) を作り直しても、Word / PowerPoint に貼る図の中身は 1 文字も変えない、を確かめる。
// 図が変わるのが意図どおりのときだけ `npx vitest -u` で保存し直す
const citation = { full: 'Test et al.', short: 'Test' };

function figureMarkup() {
  const { doc, data } = useEditor.getState();
  const scene = buildScene(doc, data);
  return renderToStaticMarkup(<FigureContent scene={scene} figure={doc.figure} images={doc.figureImages ?? []} />);
}

function build() {
  const a = simulateFromSi('¹H NMR (400 MHz, CDCl3) δ 7.26 (s, 1H), 4.12 (q, J = 7.1 Hz, 2H), 2.05 (s, 3H), 1.26 (t, J = 7.1 Hz, 3H).', citation, { n: 4096 });
  const b = simulateFromSi('¹H NMR (400 MHz, CDCl3) δ 7.26 (s, 1H), 3.72 (s, 3H), 2.31 (t, J = 7.5 Hz, 2H), 0.88 (t, J = 7.0 Hz, 3H).', citation, { n: 4096 });
  const l1 = addSimulated(a.meta, a.data);
  const l2 = addSimulated(b.meta, b.data);
  edit((d) => {
    d.layers[0].label = '0 h';
    d.layers[0].color = '#1f9e1f';
    d.layers[1].label = '24 h';
    d.layers[1].color = '#1f4fd1';
  });
  autoPeakLabels(l1, 0.05);
  addIntegral(l1, 4.2, 4.04);
  addIntegral(l1, 2.12, 1.98);
  addIntegral(l1, 1.34, 1.18);
  addAnnotation({ ...annotationDefaults('arrow'), layerId: l2, x1: 3.2, y1: 0.8, x2: 2.6, y2: 0.4 });
  addAnnotation({ ...annotationDefaults('text'), layerId: l2, x1: 5.5, y1: 0.6, x2: 5.5, y2: 0.6, text: '生成物' });
  return { l1, l2 };
}

describe('図の中身が変わらない (UI の作り直しの前後で同じ)', () => {
  beforeEach(() => {
    let n = 0;
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`);
    loadDocument(emptyDocument(), {}, null, null);
  });

  it('重ね書き・ピーク値・積分・矢印・文字', async () => {
    build();
    await expect(figureMarkup()).toMatchFileSnapshot('__snapshots__/figure-stacked.svg');
  });

  it('図の設定を変えたとき (題・字の大きさ)', async () => {
    build();
    edit((d) => {
      d.figure.titleFontSize = 14;
      d.figure.showTitle = !d.figure.showTitle;
    });
    await expect(figureMarkup()).toMatchFileSnapshot('__snapshots__/figure-options.svg');
  });
});

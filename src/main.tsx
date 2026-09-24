import { initChemDrawLink } from './state/chemdraw';
import { resolveLang, setLang, tr, useLang } from './i18n';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { figureSvgString, svgToPng } from './lib/exportFigure';
import { openFiles } from './state/fileOps';
import { restoreWork, startAutoSave } from './state/autosave';
import { startDeltaSync } from './state/deltaSync';
import { openOnboarding } from './components/Onboarding';
import { startFileLaunch } from './state/launch';
import { initLibrary, loadLibraryFiles, useLibrary } from './state/library';
import { addAnnotation, autoDetectSignals, select, updateFigureImage, useEditor } from './state/store';
import { annotationDefaults } from './state/types';
import './styles/tokens.css';
import './styles.css';
import './styles/editor.css';

// 画面の言語 (設定の「言語」。自動ならブラウザの言語)。開発のときは ?lang=en|ja でも決められる (画面の見本を撮るため)
const langParam = import.meta.env.DEV ? new URLSearchParams(location.search).get('lang') : null;
setLang(langParam === 'en' || langParam === 'ja' ? langParam : resolveLang(useEditor.getState().settings.ui.lang));

// 古い版のタブがブラウザの保存領域を使ったままだと、閉じられるまで先に進めない。閉じてもらうまで上に出しておく
window.addEventListener('nmr-db-blocked', () => {
  if (document.getElementById('db-blocked')) return;
  const el = document.createElement('div');
  el.id = 'db-blocked';
  el.className = 'db-blocked';
  el.textContent = tr('ブラウザの保存領域を開けずに待っています。ほかのタブでこのソフト (前の版) が開いていたら、そのタブを閉じる (または再読み込みする) と、ここで続きが読み込まれます。');
  document.body.appendChild(el);
});
window.addEventListener('nmr-db-open', () => document.getElementById('db-blocked')?.remove());
void initLibrary();
void initChemDrawLink();
// 前回の作業を読み込んでから、変更を自動で保存し始める
void restoreWork().finally(() => {
  startAutoSave();
  // Delta との同期は、前回の図を読み込んでから始める (図の中の .jdf を見に行くため)
  startDeltaSync();
  // アプリとして入れたとき、ダブルクリックした .nmrfig を開く (前回の図を読み込んだあとに)
  startFileLaunch();
  // 初めて開いたときは使い方の説明を出す (開発の画面の見本 ?demo=… では、demo=onboarding のときだけ)
  const demo = import.meta.env.DEV ? new URLSearchParams(location.search).get('demo') : null;
  if ((demo === null && !useEditor.getState().settings.ui.onboardingDone) || demo === 'onboarding') openOnboarding();
  if (import.meta.env.DEV) void openDemo();
});

/**
 * 開発用: ?demo=… で決まった画面を開く (画面の見本を撮るため。別の保存領域のブラウザで使う)
 * spectra (既定) = samples/ の 2 本 / empty = 何もない / palette = 操作を探す / narrow などは幅で撮る
 */
async function openDemo() {
  const demo = new URLSearchParams(location.search).get('demo');
  if (demo === null) return;
  const load = async (path: string) => {
    const res = await fetch(path);
    await openFiles([{ file: new File([await res.arrayBuffer()], decodeURIComponent(path.split('/').pop()!)) }]);
  };
  if (demo === '2d') await load('/samples/cosy-2d.jdf');
  else if (demo !== 'empty' && demo !== 'onboarding') {
    await load('/samples/sample-c6d6-1h.jdf');
    await load('/samples/sample-c6d6-1h-b.jdf');
  }
  if (demo === 'trend') useEditor.setState({ canvasTab: 'trend' });
  if (demo === 'home') {
    const names = ['sample-c6d6-1h.jdf', 'sample-c6d6-1h-b.jdf', 'fid-c6d6-1h.jdf', 'fid-c6d6-31p.jdf', 'fid-13c.jdf', 'fid-19f.jdf', 'delta-13c.jdf', 'cosy-2d.jdf'];
    const files = await Promise.all(
      names.map(async (n) => new File([await (await fetch(`/samples/${n}`)).arrayBuffer()], n, { lastModified: Date.now() })),
    );
    await loadLibraryFiles(files, tr('samples (開発用)'));
    const first = useLibrary.getState().experiments[0];
    if (first) useLibrary.setState({ focus: first.key });
  }
  useEditor.setState({ screen: demo === 'home' || demo === 'onboarding' ? 'home' : 'editor' });
  if (demo === 'palette') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  if (demo === 'integral') useEditor.setState({ tool: 'integral' });
  if (demo === 'text') {
    const { activeLayerId } = useEditor.getState();
    if (activeLayerId) addAnnotation({ ...annotationDefaults('text'), layerId: activeLayerId, x1: 6, y1: 0.5, x2: 6, y2: 0.5, text: tr('生成物') });
  }
  if (demo === 'chemdraw') {
    // ChemDraw の構造式を置き、帰属の印を付ける
    const { DEMO_CDXML } = await import('./demoCdxml');
    const { placeCdxml } = await import('./state/chemdraw');
    placeCdxml(DEMO_CDXML);
    const image = useEditor.getState().doc.figureImages[0];
    if (image) {
      updateFigureImage(image.id, { x: 0.56, y: 0.08, w: image.w * 1.4 });
      for (const [text, x, y, color] of [
        ['a', 0.12, 0.45, '#d12b2b'],
        ['b', 0.3, 0.95, '#1f5fd1'],
        ['c', 0.88, 0.5, '#1a8a3a'],
      ] as const)
        addAnnotation({ ...annotationDefaults('text'), layerId: '', imageId: image.id, x1: x, y1: y, x2: x, y2: y, text, stroke: color, fontSize: 12 });
      select({ kind: 'image', id: image.id });
    }
  }
  if (demo === 'selected') {
    const { activeLayerId } = useEditor.getState();
    if (activeLayerId) autoDetectSignals(activeLayerId, 0.03, false);
    const x = useEditor.getState().doc.integrals.find((i) => i.layerId === activeLayerId);
    if (x) select({ kind: 'integral', id: x.id });
  }
  // scripts/ui-shots.mjs はこれを待ってから撮る
  Object.assign(window, { __demoReady: true });
}

/** 言語を切り替えたら、画面ごと描き直す */
function Root() {
  const lang = useLang((s) => s.lang);
  return <App key={lang} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

// 開発用: ブラウザのコンソールから samples/ のファイルを読み込めるようにする
if (import.meta.env.DEV) {
  Object.assign(window, {
    __nmr: {
      store: useEditor,
      library: useLibrary,
      /** samples/ のファイルでホーム画面を試す */
      async libraryFrom(paths: string[]) {
        const files = await Promise.all(
          paths.map(async (p) => {
            const res = await fetch(p);
            return new File([await res.arrayBuffer()], decodeURIComponent(p.split('/').pop()!), { lastModified: Date.now() });
          }),
        );
        await loadLibraryFiles(files, tr('samples (開発用)'));
      },
      async load(path: string) {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        const name = decodeURIComponent(path.split('/').pop()!);
        await openFiles([{ file: new File([await res.arrayBuffer()], name) }]);
        useEditor.setState({ screen: 'editor' });
      },
      /** 今の図を .dev-output/ に PNG と SVG で保存する */
      async snapshot(name = 'figure', scale = 1.5) {
        const svg = document.querySelector<SVGSVGElement>('svg.figure');
        if (!svg) throw new Error(tr('図がありません'));
        const text = figureSvgString(svg);
        await fetch(`/__dev/save?name=${name}.svg`, { method: 'POST', body: text });
        await fetch(`/__dev/save?name=${name}.png`, { method: 'POST', body: await svgToPng(text, scale) });
        return `${name}.png`;
      },
    },
  });
}

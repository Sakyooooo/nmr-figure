import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { figureSvgString, svgToPng } from './lib/exportFigure';
import { openFiles } from './state/fileOps';
import { restoreWork, startAutoSave } from './state/autosave';
import { startDeltaSync } from './state/deltaSync';
import { initLibrary, loadLibraryFiles, useLibrary } from './state/library';
import { autoDetectSignals, select, useEditor } from './state/store';
import './styles/tokens.css';
import './styles.css';
import './styles/editor.css';

// 古い版のタブがブラウザの保存領域を使ったままだと、閉じられるまで先に進めない。閉じてもらうまで上に出しておく
window.addEventListener('nmr-db-blocked', () => {
  if (document.getElementById('db-blocked')) return;
  const el = document.createElement('div');
  el.id = 'db-blocked';
  el.className = 'db-blocked';
  el.textContent = 'ブラウザの保存領域を開けずに待っています。ほかのタブでこのソフト (前の版) が開いていたら、そのタブを閉じる (または再読み込みする) と、ここで続きが読み込まれます。';
  document.body.appendChild(el);
});
window.addEventListener('nmr-db-open', () => document.getElementById('db-blocked')?.remove());
void initLibrary();
// 前回の作業を読み込んでから、変更を自動で保存し始める
void restoreWork().finally(() => {
  startAutoSave();
  // Delta との同期は、前回の図を読み込んでから始める (図の中の .jdf を見に行くため)
  startDeltaSync();
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
  else if (demo !== 'empty') {
    await load('/samples/sample-c6d6-1h.jdf');
    await load('/samples/sample-c6d6-1h-b.jdf');
  }
  if (demo === 'trend') useEditor.setState({ canvasTab: 'trend' });
  if (demo === 'home') {
    const names = ['sample-c6d6-1h.jdf', 'sample-c6d6-1h-b.jdf', 'fid-c6d6-1h.jdf', 'fid-c6d6-31p.jdf', 'fid-13c.jdf', 'fid-19f.jdf', 'delta-13c.jdf', 'cosy-2d.jdf'];
    const files = await Promise.all(
      names.map(async (n) => new File([await (await fetch(`/samples/${n}`)).arrayBuffer()], n, { lastModified: Date.now() })),
    );
    await loadLibraryFiles(files, 'samples (開発用)');
    const first = useLibrary.getState().experiments[0];
    if (first) useLibrary.setState({ focus: first.key });
  }
  useEditor.setState({ screen: demo === 'home' ? 'home' : 'editor' });
  if (demo === 'palette') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
  if (demo === 'integral') useEditor.setState({ tool: 'integral' });
  if (demo === 'selected') {
    const { activeLayerId } = useEditor.getState();
    if (activeLayerId) autoDetectSignals(activeLayerId, 0.03, false);
    const x = useEditor.getState().doc.integrals.find((i) => i.layerId === activeLayerId);
    if (x) select({ kind: 'integral', id: x.id });
  }
  // scripts/ui-shots.mjs はこれを待ってから撮る
  Object.assign(window, { __demoReady: true });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
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
        await loadLibraryFiles(files, 'samples (開発用)');
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
        if (!svg) throw new Error('図がありません');
        const text = figureSvgString(svg);
        await fetch(`/__dev/save?name=${name}.svg`, { method: 'POST', body: text });
        await fetch(`/__dev/save?name=${name}.png`, { method: 'POST', body: await svgToPng(text, scale) });
        return `${name}.png`;
      },
    },
  });
}

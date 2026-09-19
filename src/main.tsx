import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { figureSvgString, svgToPng } from './lib/exportFigure';
import { openFiles } from './state/fileOps';
import { restoreWork, startAutoSave } from './state/autosave';
import { initLibrary, loadLibraryFiles, useLibrary } from './state/library';
import { useEditor } from './state/store';
import './styles.css';

void initLibrary();
// 前回の作業を読み込んでから、変更を自動で保存し始める
void restoreWork().finally(startAutoSave);

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

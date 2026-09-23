import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { ReferenceDialog, SettingsDialog } from './components/Dialogs';
import { DialogHost } from './components/DialogHost';
import { Dock, TOOLS, ToolHint } from './components/Dock';
import { FigureView } from './components/FigureView';
import { Home } from './components/Home';
import { Icon } from './components/Icon';
import { Inspector } from './components/Inspector';
import { Figure2dView } from './components/Figure2dView';
import { StructureEditorHost } from './components/StructureEditorHost';
import { PrintView } from './components/PrintView';
import { SiImportDialog } from './components/SiImportDialog';
import { Spectrum2dPanel } from './components/Plot2dPanel';
import { LayerPanel, ViewPanel } from './components/LayerPanel';
import { TopBar } from './components/TopBar';
import { TrendChart } from './components/TrendChart';
import { IconButton, Kbd } from './components/ui';
import { computeLayout } from './lib/layout';
import { PROJECT_EXT } from './lib/projectFile';
import { copyFigure, openDialog, openFiles, saveProject } from './state/fileOps';
import type { FileHandle } from './state/store';
import {
  closeSiImport,
  copySelection,
  deleteSelection,
  fitY,
  fullRange,
  openSiImport,
  pasteAnnotation,
  redo,
  select,
  setTool,
  setViewZoom,
  togglePanel,
  undo,
  updateAnnotation,
  useEditor,
} from './state/store';

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];

export default function App() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const is2d = useEditor((s) => !!s.doc.plot2d);
  const hasData = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const dirty = useEditor((s) => s.dirty);
  const projectName = useEditor((s) => s.projectName);
  const ui = useEditor((s) => s.settings.ui);
  const tab = useEditor((s) => s.canvasTab);
  const siImport = useEditor((s) => s.siImport);
  const figure = useEditor((s) => s.doc.figure);
  const trend = useEditor((s) => s.doc.trend);
  const screen = useEditor((s) => s.screen);
  const [w, h] = tab === 'trend' ? [trend.width, trend.height] : [figure.width, figure.height];
  const paperWidth = usePaperWidth(scrollRef, w, h, `${ui.leftOpen}${ui.rightOpen}${hasData}${screen}`);

  useKeyboard(svgRef, w, paperWidth, () => setPaletteOpen(true));

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.dirty && s.doc.layers.length) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    document.title = `${dirty && hasData ? '● ' : ''}${projectName ?? '無題'} - NMR Figure Editor`;
  }, [dirty, hasData, projectName]);

  const dropProps = (mode: 'add' | 'new') => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      // ハンドルが取れると、あとで同じファイルに上書き保存できる
      const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
      const files = [...e.dataTransfer.files];
      void Promise.all(
        items.map(async (item, i) => {
          const get = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileHandle | null> }).getAsFileSystemHandle;
          const handle = get ? await get.call(item).catch(() => null) : null;
          const file = handle ? await handle.getFile() : files[i];
          return { file, handle: handle ?? undefined };
        }),
      ).then((dropped) => openFiles(dropped.filter((d) => d.file), mode));
    },
  });

  if (screen === 'home') {
    return (
      <div className="home-root" {...dropProps('new')}>
        <Home />
        <StructureEditorHost />
      {dragging && <div className="drop-overlay">ここにドロップ (.jdf は新しい図で開く、{PROJECT_EXT} は図を開く)</div>}
        <DialogHost />
        <Toast />
      </div>
    );
  }

  const leftShown = ui.leftOpen && hasData;
  const rightShown = ui.rightOpen && hasData;
  return (
    <div className={`editor${leftShown ? ' left-open' : ''}${rightShown ? ' right-open' : ''}`} {...dropProps('add')}>
      <TopBar svgRef={svgRef} onSettings={() => setSettingsOpen(true)} onImportSi={() => openSiImport()} onCommand={() => setPaletteOpen(true)} />
      <main className="stage">
        <div className="canvas-scroll" ref={scrollRef}>
          {hasData ? (
            <div className="paper" style={{ width: paperWidth }}>
              {is2d ? <Figure2dView svgRef={svgRef} /> : tab === 'trend' ? <TrendChart svgRef={svgRef} /> : <FigureView svgRef={svgRef} />}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
        {hasData && (
          <div className="stage-top">
            <ToolHint />
          </div>
        )}
        <aside className="float-panel left" aria-label={is2d ? '2D スペクトル' : 'スペクトル'} hidden={!leftShown}>
          {is2d ? (
            <Spectrum2dPanel />
          ) : (
            <>
              <LayerPanel />
              <ViewPanel />
            </>
          )}
        </aside>
        <aside className="float-panel right" aria-label="右のパネル" hidden={!rightShown}>
          <Inspector />
        </aside>
        {hasData && <ZoomControl zoom={paperWidth / w} />}
        {hasData && (
          <div className="stage-bottom">
            <Dock />
          </div>
        )}
        <Toast />
      </main>
      <StructureEditorHost />
      {dragging && <div className="drop-overlay">ここにドロップ (.jdf は追加、{PROJECT_EXT} は開く)</div>}
      <ReferenceDialog />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {siImport && <SiImportDialog onClose={closeSiImport} spectrumId={siImport.spectrumId} />}
      {paletteOpen && <CommandPalette svgRef={svgRef} onClose={() => setPaletteOpen(false)} onSettings={() => setSettingsOpen(true)} />}
      <PrintView svgRef={svgRef} />
      <DialogHost />
    </div>
  );
}

/** 図の表示幅 (px)。「合わせる」のときは、スクロールせずに全体が見える最大の大きさにする */
function usePaperWidth(ref: RefObject<HTMLDivElement | null>, w: number, h: number, layoutKey: string) {
  const zoom = useEditor((s) => s.viewZoom);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 浮かぶパネル・道具の帯の分は padding で空けてあるので、その内側に収める
    const measure = () => {
      const cs = getComputedStyle(el);
      const px = (v: string) => parseFloat(v) || 0;
      setBox({ w: el.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight), h: el.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
    // パネルの開閉で枠の大きさが変わるので測り直す
  }, [ref, layoutKey]);
  if (zoom !== 'fit') return Math.round(w * zoom);
  return Math.max(240, Math.floor(Math.min(box.w, (box.h * w) / h)));
}

/** 何もないとき: 何がないか → 次にやること (よく使うものにはキー) → 保存の場所 */
function EmptyState() {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon name="nmr-spectrum" size={32} />
      </span>
      <h1>スペクトルがありません</h1>
      <p className="secondary">測定の .jdf をこの画面にドロップするか、下から選んでください</p>
      <div className="empty-actions" role="group" aria-label="始め方">
        <button type="button" className="empty-row" onClick={() => void openDialog('new')}>
          <Icon name="folder-open" />
          <span className="grow">ファイルを開く</span>
          <Kbd>Ctrl+O</Kbd>
        </button>
        <button type="button" className="empty-row" onClick={() => useEditor.setState({ screen: 'home' })}>
          <Icon name="house" />
          <span className="grow">ホームの一覧から選ぶ</span>
        </button>
        <button type="button" className="empty-row" onClick={() => openSiImport()}>
          <Icon name="book-open" />
          <span className="grow">文献値から作図 (SI の文を貼る)</span>
        </button>
      </div>
      <p className="tertiary">
        データはこのパソコンの中だけで処理され、外部には送信されません。
        <br />
        図はこのブラウザに自動で保存されます。ほかのパソコンでは見えないので、残したい図はファイルに保存してください
      </p>
    </div>
  );
}

/** 左下: カーソルの δ・表示倍率・全体表示・縦を自動 */
function ZoomControl({ zoom }: { zoom: number }) {
  const cursor = useEditor((s) => s.cursorPpm);
  const cursor2d = useEditor((s) => s.cursor2d);
  const tab = useEditor((s) => s.canvasTab);
  const is2d = useEditor((s) => !!s.doc.plot2d);
  const viewZoom = useEditor((s) => s.viewZoom);
  const readout = is2d
    ? cursor2d
      ? `F2 ${cursor2d.x.toFixed(2)}, F1 ${cursor2d.y.toFixed(2)}`
      : ''
    : tab === 'spectrum' && cursor !== null
      ? `δ ${cursor.toFixed(3)} ppm`
      : '';
  return (
    <div className="zoom-control bar">
      <span className="readout num">{readout}</span>
      <IconButton icon="minus" size="sm" label="縮小" shortcut="-" onClick={() => setViewZoom(stepZoom(zoom, -1))} />
      <button type="button" className={`zoom-value num${viewZoom === 'fit' ? ' on' : ''}`} onClick={() => setViewZoom('fit')} title="画面に合わせる">
        {Math.round(zoom * 100)}%
      </button>
      <IconButton icon="plus" size="sm" label="拡大" shortcut="+" onClick={() => setViewZoom(stepZoom(zoom, 1))} />
      {tab === 'spectrum' && (
        <>
          <span className="bar-sep" aria-hidden="true" />
          <IconButton icon="expand" size="sm" label="全体を表示" shortcut="0" onClick={fullRange} />
          {!is2d && <IconButton icon="fit-y" size="sm" label="縦を自動 (表示範囲の最大ピークに合わせる)" shortcut="F" onClick={fitY} />}
        </>
      )}
    </div>
  );
}

function stepZoom(current: number, dir: 1 | -1) {
  const next = dir > 0 ? ZOOM_STEPS.find((z) => z > current + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001);
  return next ?? current;
}

/** 知らせ。エラーは閉じるまで残す。それ以外は数秒で消える */
function Toast() {
  const message = useEditor((s) => s.message);
  useEffect(() => {
    if (!message || message.kind === 'error') return;
    const timer = setTimeout(() => useEditor.setState({ message: null }), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  if (!message) return null;
  const error = message.kind === 'error';
  return (
    <div className={`toast${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">
        <Icon name={error ? 'circle-x' : 'circle-check'} />
      </span>
      <span className="grow">{message.text}</span>
      <IconButton icon="x" size="sm" label="閉じる" onClick={() => useEditor.setState({ message: null })} />
    </div>
  );
}

function useKeyboard(svgRef: RefObject<SVGSVGElement | null>, figureWidth: number, paperWidth: number, openPalette: () => void) {
  const paletteRef = useRef(openPalette);
  paletteRef.current = openPalette;
  const zoomRef = useRef(1);
  zoomRef.current = paperWidth / figureWidth;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.closest?.('input, textarea, select, dialog');
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === 's') {
        e.preventDefault();
        saveProject(e.shiftKey);
        return;
      }
      if (ctrl && key === 'k' && useEditor.getState().screen === 'editor') {
        e.preventDefault();
        paletteRef.current();
        return;
      }
      if (ctrl && key === 'o') {
        e.preventDefault();
        void openDialog(useEditor.getState().screen === 'home' ? 'new' : 'add');
        return;
      }
      if (typing) return;
      if (useEditor.getState().screen !== 'editor') return;
      if (!ctrl && (e.key === '[' || e.key === ']')) {
        togglePanel(e.key === '[' ? 'left' : 'right');
        return;
      }
      const { doc, selection, canvasTab } = useEditor.getState();
      if (!doc.layers.length) return;

      if (ctrl && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (ctrl && key === 'y') {
        e.preventDefault();
        redo();
      } else if (ctrl && e.shiftKey && key === 'c') {
        e.preventDefault();
        if (svgRef.current) copyFigure(svgRef.current);
      } else if (!ctrl && (e.key === '+' || e.key === '=' || e.key === ';')) {
        setViewZoom(stepZoom(zoomRef.current, 1));
      } else if (!ctrl && e.key === '-') {
        setViewZoom(stepZoom(zoomRef.current, -1));
      } else if (canvasTab !== 'spectrum') {
        return;
      } else if (ctrl && key === 'c') {
        if (copySelection()) e.preventDefault();
      } else if (ctrl && key === 'v') {
        if (pasteAnnotation()) e.preventDefault();
      } else if (ctrl && key === 'd') {
        e.preventDefault();
        const a = selection?.kind === 'annotation' && doc.annotations.find((x) => x.id === selection.id);
        if (a) pasteAnnotation(a);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === 'Escape') {
        select(null);
        setTool('select');
      } else if (e.key.startsWith('Arrow') && selection?.kind === 'annotation') {
        e.preventDefault();
        nudge(selection.id, e.key, e.shiftKey ? 10 : 1);
      } else if (!ctrl && !e.altKey) {
        if (key === 'f') {
          if (!doc.plot2d) fitY();
        } else if (key === 'home' || key === '0') fullRange();
        else {
          const t = TOOLS.find((x) => x.key.toLowerCase() === key);
          // 2D で使えるのは移動と範囲の拡大だけ
          if (t && (!doc.plot2d || t.id === 'select' || t.id === 'zoom')) setTool(t.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [svgRef]);
}

/** 矢印キーで px 単位に動かす */
function nudge(id: string, key: string, px: number) {
  const { doc, data } = useEditor.getState();
  const a = doc.annotations.find((x) => x.id === id);
  const layout = computeLayout(doc, data);
  const g = a && layout.layers.find((l) => l.layer.id === a.layerId);
  if (!a || !g) return;
  const dx = ((key === 'ArrowLeft' ? 1 : key === 'ArrowRight' ? -1 : 0) * px * (doc.view.xMax - doc.view.xMin)) / layout.plot.w;
  const dy = ((key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0) * px) / g.unit;
  updateAnnotation(id, { x1: a.x1 + dx, x2: a.x2 + dx, y1: a.y1 + dy, y2: a.y2 + dy });
}

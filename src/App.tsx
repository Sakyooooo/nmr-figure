import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { ReferenceDialog, SettingsDialog } from './components/Dialogs';
import { DialogHost } from './components/DialogHost';
import { FigureView } from './components/FigureView';
import { Home } from './components/Home';
import { IntegralPanel } from './components/IntegralPanel';
import { PeakPanel } from './components/PeakPanel';
import { ProcessingPanel } from './components/ProcessingPanel';
import { SiPanel } from './components/SiPanel';
import { ImpurityPanel, MarkerPanel } from './components/ImpurityPanel';
import { Figure2dView } from './components/Figure2dView';
import { StructureEditorHost } from './components/StructureEditorHost';
import { PrintView } from './components/PrintView';
import { SiImportDialog } from './components/SiImportDialog';
import { Plot2dPanel, Spectrum2dPanel } from './components/Plot2dPanel';
import { LayerPanel, ViewPanel } from './components/LayerPanel';
import { FigurePanel, PropertiesPanel } from './components/PropertiesPanel';
import { TemplatePanel } from './components/TemplatePanel';
import { TOOLS, Toolbar } from './components/Toolbar';
import { TrendChart } from './components/TrendChart';
import { TrendPanel } from './components/TrendPanel';
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
  setCanvasTab,
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

  useKeyboard(svgRef, w, paperWidth);

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

  const columns = { '--left': ui.leftOpen ? '250px' : '0px', '--right': ui.rightOpen ? '300px' : '0px' } as CSSProperties;
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

  return (
    <div className="app" style={columns} {...dropProps('add')}>
      <Toolbar svgRef={svgRef} onSettings={() => setSettingsOpen(true)} onImportSi={() => openSiImport()} />
      <aside className={`panel left${ui.leftOpen ? '' : ' closed'}`}>
        {is2d ? (
          <Spectrum2dPanel />
        ) : (
          <>
            <LayerPanel />
            <ViewPanel />
          </>
        )}
      </aside>
      <main className="canvas">
        {hasData && !is2d && (
          <nav className="canvas-tabs" aria-label="表示の切り替え">
            <button className={tab === 'spectrum' ? 'active' : ''} onClick={() => setCanvasTab('spectrum')}>
              スペクトル
            </button>
            <button className={tab === 'trend' ? 'active' : ''} onClick={() => setCanvasTab('trend')}>
              推移グラフ
            </button>
          </nav>
        )}
        <div className="canvas-scroll" ref={scrollRef}>
          {hasData ? (
            <div className="paper" style={{ width: paperWidth }}>
              {is2d ? <Figure2dView svgRef={svgRef} /> : tab === 'trend' ? <TrendChart svgRef={svgRef} /> : <FigureView svgRef={svgRef} />}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
        {hasData && <StatusBar zoom={paperWidth / w} />}
      </main>
      <aside className={`panel right${ui.rightOpen ? '' : ' closed'}`}>
        {is2d ? (
          <>
            <Plot2dPanel />
            <FigurePanel />
            <TemplatePanel />
          </>
        ) : tab === 'trend' ? (
          <TrendPanel />
        ) : (
          <>
            <PropertiesPanel />
            <ProcessingPanel />
            <IntegralPanel />
            <PeakPanel />
            <SiPanel />
            <ImpurityPanel />
            <MarkerPanel />
            <FigurePanel />
            <TemplatePanel />
            <TrendPanel />
          </>
        )}
      </aside>
      <StructureEditorHost />
      {dragging && <div className="drop-overlay">ここにドロップ (.jdf は追加、{PROJECT_EXT} は開く)</div>}
      <ReferenceDialog />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {siImport && <SiImportDialog onClose={closeSiImport} spectrumId={siImport.spectrumId} />}
      <PrintView svgRef={svgRef} />
      <DialogHost />
      <Toast />
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
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
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
  const pad = 24;
  return Math.max(240, Math.floor(Math.min(box.w - pad, ((box.h - pad) * w) / h)));
}

function EmptyState() {
  return (
    <div className="empty">
      <h1>NMR Figure Editor</h1>
      <p>Delta で処理した .jdf をここにドロップしてください。複数のファイルをまとめて重ね書きできます。</p>
      <button className="primary big" onClick={() => void openDialog('new')}>
        ファイルを開く
      </button>
      <p className="hint">データはこのパソコンの中だけで処理され、外部には送信されません。</p>
    </div>
  );
}

function StatusBar({ zoom }: { zoom: number }) {
  const cursor = useEditor((s) => s.cursorPpm);
  const autoSavedAt = useEditor((s) => s.autoSavedAt);
  const projectName = useEditor((s) => s.projectName);
  const dirty = useEditor((s) => s.dirty);
  const cursor2d = useEditor((s) => s.cursor2d);
  const tool = useEditor((s) => s.tool);
  const tab = useEditor((s) => s.canvasTab);
  const is2d = useEditor((s) => !!s.doc.plot2d);
  const viewZoom = useEditor((s) => s.viewZoom);
  const t = TOOLS.find((x) => x.id === tool);
  return (
    <div className="status">
      {is2d && (
        <>
          <span>{tool === 'zoom' ? '範囲を拡大 (ドラッグ)' : 'ドラッグで移動・ホイールで拡大縮小'}</span>
          <span className="cursor">{cursor2d ? `F2 ${cursor2d.x.toFixed(2)} , F1 ${cursor2d.y.toFixed(2)} ppm` : ''}</span>
        </>
      )}
      {!is2d && tab === 'spectrum' && (
        <>
          <span>{t?.label}</span>
          <span className="cursor">{cursor !== null ? `δ ${cursor.toFixed(3)} ppm` : ''}</span>
        </>
      )}
      <span className="saved" title="図はブラウザにも自動で保存されるので、閉じても続きから作業できます">
        {projectName ? `${projectName}${dirty ? ' (未保存の変更あり)' : ' に保存済み'}` : 'ファイル未保存'}
        {autoSavedAt ? ` · 自動保存 ${new Date(autoSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : ''}
      </span>
      <span className="keys">
        {is2d ? 'ダブルクリック: 全体表示 · Z: 範囲を拡大 · V: 移動 · [ ]: パネル' : '背景を左右ドラッグ: 移動 · 上下ドラッグ: 高さ (Shift で全体) · Ctrl+Z: 元に戻す · [ ]: パネル'}
      </span>
      <span className="zoom">
        <button className="mini" onClick={() => setViewZoom(stepZoom(zoom, -1))} title="縮小 (-)">
          −
        </button>
        <button className={`mini${viewZoom === 'fit' ? ' active' : ''}`} onClick={() => setViewZoom('fit')} title="画面に合わせる">
          {Math.round(zoom * 100)}%
        </button>
        <button className="mini" onClick={() => setViewZoom(stepZoom(zoom, 1))} title="拡大 (+)">
          ＋
        </button>
      </span>
    </div>
  );
}

function stepZoom(current: number, dir: 1 | -1) {
  const next = dir > 0 ? ZOOM_STEPS.find((z) => z > current + 0.001) : [...ZOOM_STEPS].reverse().find((z) => z < current - 0.001);
  return next ?? current;
}

function Toast() {
  const message = useEditor((s) => s.message);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => useEditor.setState({ message: null }), message.kind === 'error' ? 7000 : 3500);
    return () => clearTimeout(timer);
  }, [message]);
  if (!message) return null;
  return (
    <div className={`toast ${message.kind}`} role="status" onClick={() => useEditor.setState({ message: null })}>
      {message.text}
    </div>
  );
}

function useKeyboard(svgRef: RefObject<SVGSVGElement | null>, figureWidth: number, paperWidth: number) {
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

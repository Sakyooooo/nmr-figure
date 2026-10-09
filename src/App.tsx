import { tr } from './i18n';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { CommandPalette } from './components/CommandPalette';
import { ReferenceDialog, SettingsDialog } from './components/Dialogs';
import { DialogHost } from './components/DialogHost';
import { Dock, TOOLS, ToolHint, toolUsable } from './components/Dock';
import { FigureView } from './components/FigureView';
import { Home } from './components/Home';
import { Icon } from './components/Icon';
import { Inspector } from './components/Inspector';
import { Figure2dView } from './components/Figure2dView';
import { StructureEditorHost } from './components/StructureEditorHost';
import { PrintView } from './components/PrintView';
import { SelectionBar } from './components/SelectionBar';
import { SiImportDialog } from './components/SiImportDialog';
import { Spectrum2dPanel } from './components/Plot2dPanel';
import { LayerPanel, ViewPanel } from './components/LayerPanel';
import { TopBar } from './components/TopBar';
import { TouchHelp, useFirstTouchHelp } from './components/TouchHelp';
import { Onboarding } from './components/Onboarding';
import { TrendChart } from './components/TrendChart';
import { IconButton, Kbd } from './components/ui';
import { computeLayout } from './lib/layout';
import { layout2d } from './lib/scene2d';
import { PROJECT_EXT } from './lib/projectFile';
import { entryDir, type DirLike } from './state/bruker';
import { copyFigure, openDialog, openFiles, openFolderDialog, saveProject } from './state/fileOps';
import type { FileHandle } from './state/store';
import {
  beginGesture,
  closeSiImport,
  copySelection,
  deleteSelection,
  edit,
  endGesture,
  fitY,
  fullRange,
  nudgeMarker,
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
  const stageRef = useRef<HTMLElement | null>(null);
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
  const [touchHelp, setTouchHelp] = useFirstTouchHelp(hasData && screen === 'editor');
  // 縦に伸ばした 1D の図は、幅に合わせて縦にスクロールする (2D・推移グラフは全体が入る大きさ)
  const { paperWidth, fitWidth } = usePaperWidth(scrollRef, w, h, `${ui.leftOpen}${ui.rightOpen}${hasData}${screen}`, tab !== 'trend' && !is2d);

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
    document.title = `${dirty && hasData ? '● ' : ''}${projectName ?? tr('無題')} - NMR Figure Editor`;
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
      // ハンドルが取れると、あとで同じファイルに上書き保存できる。フォルダ (TopSpin の測定) はフォルダのまま開く
      const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file');
      const files = [...e.dataTransfer.files];
      // webkitGetAsEntry はドロップした直後にしか呼べないので、先に取っておく
      const entries = items.map((item) => (item as DataTransferItem & { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry?.() ?? null);
      const dirs: DirLike[] = [];
      void Promise.all(
        items.map(async (item, i) => {
          const get = (item as DataTransferItem & { getAsFileSystemHandle?: () => Promise<(FileHandle & { kind?: string }) | DirLike | null> }).getAsFileSystemHandle;
          const handle = get ? await get.call(item).catch(() => null) : null;
          if (handle?.kind === 'directory') {
            dirs.push(handle as DirLike);
            return null;
          }
          const entry = entries[i] as { isDirectory?: boolean } | null;
          if (!handle && entry?.isDirectory) {
            dirs.push(entryDir(entry as Parameters<typeof entryDir>[0]));
            return null;
          }
          const fileHandle = handle as FileHandle | null;
          const file = fileHandle ? await fileHandle.getFile() : files[i];
          return { file, handle: fileHandle ?? undefined };
        }),
      ).then((dropped) => openFiles(dropped.filter((d): d is { file: File; handle: FileHandle | undefined } => !!d?.file), mode, dirs));
    },
  });

  if (screen === 'home') {
    return (
      <div className="home-root" {...dropProps('new')}>
        <Home />
        <StructureEditorHost />
      {dragging && <div className="drop-overlay">{tr('ここにドロップ (.jdf・TopSpin の測定のフォルダは新しい図で開く、図入りの .jdf と {ext} は図を開く)', { ext: PROJECT_EXT })}</div>}
        <DialogHost />
        <Onboarding />
        <Toast />
      </div>
    );
  }

  const leftShown = ui.leftOpen && hasData;
  const rightShown = ui.rightOpen && hasData;
  return (
    <div className={`editor${leftShown ? ' left-open' : ''}${rightShown ? ' right-open' : ''}`} {...dropProps('add')}>
      <TopBar svgRef={svgRef} onSettings={() => setSettingsOpen(true)} onImportSi={() => openSiImport()} onCommand={() => setPaletteOpen(true)} />
      <main className="stage" ref={stageRef}>
        <div className="canvas-scroll" ref={scrollRef}>
          {hasData ? (
            <div className="paper" style={{ width: paperWidth }}>
              {is2d ? <Figure2dView svgRef={svgRef} /> : tab === 'trend' ? <TrendChart svgRef={svgRef} /> : <FigureView svgRef={svgRef} />}
              {tab !== 'trend' && <HeightHandle scale={paperWidth / w} paperWidth={paperWidth} fitWidth={fitWidth} scrollRef={scrollRef} />}
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
        {hasData && (
          <div className="stage-bottom">
            <Dock />
          </div>
        )}
        {hasData && <ZoomControl zoom={paperWidth / w} />}
        <aside className="float-panel left" aria-label={is2d ? tr('2D スペクトル') : tr('スペクトル')} hidden={!leftShown}>
          {is2d ? (
            <Spectrum2dPanel />
          ) : (
            <>
              <LayerPanel />
              <ViewPanel />
            </>
          )}
        </aside>
        <aside className="float-panel right" aria-label={tr('右のパネル')} hidden={!rightShown}>
          <Inspector />
        </aside>
        {hasData && <SelectionBar stageRef={stageRef} />}
        <Toast />
      </main>
      <StructureEditorHost />
      {dragging && <div className="drop-overlay">{tr('ここにドロップ (.jdf・TopSpin の測定のフォルダは追加、図入りの .jdf と {ext} は図を開く、ChemDraw の .cdxml は構造式を置く)', { ext: PROJECT_EXT })}</div>}
      <ReferenceDialog />
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      {siImport && <SiImportDialog onClose={closeSiImport} spectrumId={siImport.spectrumId} />}
      {paletteOpen && (
        <CommandPalette svgRef={svgRef} onClose={() => setPaletteOpen(false)} onSettings={() => setSettingsOpen(true)} onTouchHelp={() => setTouchHelp(true)} />
      )}
      {touchHelp && <TouchHelp onClose={() => setTouchHelp(false)} />}
      <PrintView svgRef={svgRef} />
      <DialogHost />
      <Onboarding />
    </div>
  );
}

/**
 * 図の表示幅 (px)。「合わせる」のときは、スクロールせずに全体が見える最大の大きさにする。
 * widthFirst (1D の図) は、縦長で全体を入れると幅が枠の 8 割より狭くなるとき、幅に合わせて縦にスクロールする
 * (本人の希望 2026-10-07「何個も重ねたときなど、縦方向に伸ばせるように」。縮めると字やピークが小さくなる)。
 * fitWidth は、その高さの図を「合わせる」で出したときの幅
 */
function usePaperWidth(ref: RefObject<HTMLDivElement | null>, w: number, h: number, layoutKey: string, widthFirst: boolean) {
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
  const fitWidth = (height: number) => {
    const whole = Math.min(box.w, (box.h * w) / height);
    return Math.max(240, Math.floor(widthFirst && whole < box.w * 0.8 ? box.w : whole));
  };
  return { paperWidth: zoom !== 'fit' ? Math.round(w * zoom) : fitWidth(h), fitWidth };
}

/**
 * 図の下の辺: 上下にドラッグして図の高さを変える (本人の希望 2026-10-07)。重ねたスペクトルの間隔も広がる。
 * ドラッグ中は表示の倍率を変えない (図が縮んで、つかんだ辺が手から離れないように)。離したとき、「合わせる」で同じ大きさに
 * なるなら「合わせる」に戻し、ならなければその倍率のまま (急に縮まない)。画面の下の端まで来たら下へ送る
 */
function HeightHandle({
  scale,
  paperWidth,
  fitWidth,
  scrollRef,
}: {
  scale: number;
  paperWidth: number;
  fitWidth: (height: number) => number;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const height = useEditor((s) => s.doc.figure.height);
  const drag = useRef<{ y0: number; top0: number; h0: number; token: number; fit: boolean } | null>(null);
  const [active, setActive] = useState(false);
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const fit = useEditor.getState().viewZoom === 'fit';
    setViewZoom(scale);
    drag.current = { y0: e.clientY, top0: scrollRef.current?.scrollTop ?? 0, h0: height, token: beginGesture(), fit };
    setActive(true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const el = scrollRef.current;
    // 下の道具の帯 (80 px) の近くまで来たら、画面を下へ送る
    if (el && e.clientY > el.getBoundingClientRect().bottom - 96) el.scrollTop += 12;
    const dy = e.clientY - d.y0 + ((el?.scrollTop ?? 0) - d.top0);
    const next = Math.round(Math.min(4000, Math.max(150, d.h0 + dy / scale)));
    if (next !== useEditor.getState().doc.figure.height)
      edit((doc) => {
        doc.figure.height = next;
      }, false);
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setActive(false);
    endGesture(d.token);
    if (d.fit && Math.abs(fitWidth(useEditor.getState().doc.figure.height) - paperWidth) < 2) setViewZoom('fit');
  };
  return (
    <div
      className={`height-handle${active ? ' active' : ''}`}
      role="separator"
      aria-orientation="horizontal"
      aria-label={tr('図の高さ')}
      title={tr('上下にドラッグで図の高さを変えます')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className="grip" />
      {active && <span className="height-readout num">{tr('高さ {h} px', { h: height })}</span>}
    </div>
  );
}

/** 何もないとき: 何がないか → 次にやること (よく使うものにはキー) → 保存の場所 */
function EmptyState() {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <Icon name="nmr-spectrum" size={32} />
      </span>
      <h1>{tr('スペクトルがありません')}</h1>
      <p className="secondary">{tr('測定の .jdf (Delta) か TopSpin の測定のフォルダをこの画面にドロップするか、下から選んでください')}</p>
      <div className="empty-actions" role="group" aria-label={tr('始め方')}>
        <button type="button" className="empty-row" onClick={() => void openDialog('new')}>
          <Icon name="folder-open" />
          <span className="grow">{tr('ファイルを開く')}</span>
          <Kbd>Ctrl+O</Kbd>
        </button>
        <button type="button" className="empty-row" onClick={() => void openFolderDialog('new')}>
          <Icon name="folder-open" />
          <span className="grow">{tr('TopSpin の測定のフォルダを開く')}</span>
        </button>
        <button type="button" className="empty-row" onClick={() => useEditor.setState({ screen: 'home' })}>
          <Icon name="house" />
          <span className="grow">{tr('ホームの一覧から選ぶ')}</span>
        </button>
        <button type="button" className="empty-row" onClick={() => openSiImport()}>
          <Icon name="book-open" />
          <span className="grow">{tr('文献値から作図 (SI の文を貼る)')}</span>
        </button>
      </div>
      <p className="tertiary">
        {tr('データはこのパソコンの中だけで処理され、外部には送信されません。開発者に送るのは、開いた回数と編集した回数だけです (設定で止められます)。')}
        <br />
        {tr('図はこのブラウザに自動で保存されます。ほかのパソコンでは見えないので、残したい図はファイルに保存してください')}
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
      <span className="readout num">{readout || (is2d ? 'F2 —, F1 —' : 'δ — ppm')}</span>
      <IconButton icon="minus" size="sm" label={tr('縮小')} shortcut="-" onClick={() => setViewZoom(stepZoom(zoom, -1))} />
      <button type="button" className={`zoom-value num${viewZoom === 'fit' ? ' on' : ''}`} onClick={() => setViewZoom('fit')} title={tr('画面に合わせる')}>
        {Math.round(zoom * 100)}%
      </button>
      <IconButton icon="plus" size="sm" label={tr('拡大')} shortcut="+" onClick={() => setViewZoom(stepZoom(zoom, 1))} />
      {tab === 'spectrum' && (
        <>
          <span className="bar-sep" aria-hidden="true" />
          <IconButton icon="expand" size="sm" label={tr('全体を表示')} shortcut="0" onClick={fullRange} />
          {!is2d && <IconButton icon="fit-y" size="sm" label={tr('縦を自動 (表示範囲の最大ピークに合わせる)')} shortcut="F" onClick={fitY} />}
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
  const depth = useEditor((s) => s.past.length);
  if (!message) return null;
  const error = message.kind === 'error';
  // 知らせのあとにほかの変更をしていたら、元に戻すと別の変更が戻るので出さない
  const canUndo = message.undoDepth !== undefined && message.undoDepth === depth;
  return (
    <div className={`toast${error ? ' error' : ''}`} role={error ? 'alert' : 'status'}>
      <span className="toast-icon" aria-hidden="true">
        <Icon name={error ? 'circle-x' : 'circle-check'} />
      </span>
      <span className="grow">{message.text}</span>
      {canUndo && (
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => {
            undo();
            useEditor.setState({ message: null });
          }}
        >
          {tr('元に戻す')}
        </button>
      )}
      <IconButton icon="x" size="sm" label={tr('閉じる')} onClick={() => useEditor.setState({ message: null })} />
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
      // 2D の図はスペクトルの一覧 (layers) が空なので、plot2d も見る (見ていなかったので、2D では元に戻す・削除・矢印キーなどが効かなかった)
      if (!doc.layers.length && !doc.plot2d) return;

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
      } else if (e.key.startsWith('Arrow') && selection?.kind === 'marker') {
        // マーカーは置いた位置から少しずらす (1 px、Shift で 5 px)
        e.preventDefault();
        nudgeMarker(selection.id, e.key, e.shiftKey ? 5 : 1);
      } else if (!ctrl && !e.altKey) {
        if (key === 'f') {
          if (!doc.plot2d) fitY();
        } else if (key === 'home' || key === '0') fullRange();
        else {
          const t = TOOLS.find((x) => x.key.toLowerCase() === key);
          if (t && toolUsable(t.id, !!doc.plot2d)) setTool(t.id);
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
  // 2D の図に置いたもの: x, y とも ppm
  if (a?.space === '2d' && doc.plot2d) {
    const l = layout2d(doc, doc.plot2d);
    const v = doc.plot2d.view;
    const dx = ((key === 'ArrowLeft' ? 1 : key === 'ArrowRight' ? -1 : 0) * px * (v.xMax - v.xMin)) / l.plot.w;
    const dy = ((key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0) * px * (v.yMax - v.yMin)) / l.plot.h;
    updateAnnotation(id, { x1: a.x1 + dx, x2: a.x2 + dx, y1: a.y1 + dy, y2: a.y2 + dy });
    return;
  }
  const layout = computeLayout(doc, data);
  const g = a && layout.layers.find((l) => l.layer.id === a.layerId);
  if (!a || !g) return;
  const dx = ((key === 'ArrowLeft' ? 1 : key === 'ArrowRight' ? -1 : 0) * px * (doc.view.xMax - doc.view.xMin)) / layout.plot.w;
  const dy = ((key === 'ArrowUp' ? 1 : key === 'ArrowDown' ? -1 : 0) * px) / g.unit;
  updateAnnotation(id, { x1: a.x1 + dx, x2: a.x2 + dx, y1: a.y1 + dy, y2: a.y2 + dy });
}

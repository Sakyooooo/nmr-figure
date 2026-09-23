import type { RefObject } from 'react';
import { useSync } from '../state/deltaSync';
import { copyFigure, exportPng, exportSvg, openDialog, saveProject } from '../state/fileOps';
import { printFigure, setCanvasTab, togglePanel, useEditor } from '../state/store';
import { Icon } from './Icon';
import { IconButton, Kbd, MenuButton } from './ui';

const time = (t: number) => new Date(t).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

/**
 * 編集画面の上の帯。置くのは ホーム・パネルの開閉・図の名前 (ファイルの操作)・表示の切り替え・操作を探す・
 * Delta との同期・書き出し・図をコピー・設定 だけ。道具は図の下 (Dock)
 */
export function TopBar({
  svgRef,
  onSettings,
  onImportSi,
  onCommand,
}: {
  svgRef: RefObject<SVGSVGElement | null>;
  onSettings: () => void;
  onImportSi: () => void;
  onCommand: () => void;
}) {
  const ui = useEditor((s) => s.settings.ui);
  const hasData = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const is2d = useEditor((s) => !!s.doc.plot2d);
  const tab = useEditor((s) => s.canvasTab);
  const withSvg = (fn: (svg: SVGSVGElement) => unknown) => () => svgRef.current && fn(svgRef.current);

  return (
    <header className="topbar">
      <IconButton icon="house" label="ホーム (測定の一覧)。編集中の図はそのまま残ります" onClick={() => useEditor.setState({ screen: 'home' })} />
      <IconButton icon="panel-left" label="スペクトルの一覧" shortcut="[" pressed={ui.leftOpen} onClick={() => togglePanel('left')} />
      <span className="topbar-sep" aria-hidden="true" />
      <FileMenu onImportSi={onImportSi} />
      {hasData && !is2d && (
        <div className="segmented" role="tablist" aria-label="表示の切り替え">
          <button type="button" role="tab" aria-selected={tab === 'spectrum'} className={tab === 'spectrum' ? 'on' : ''} onClick={() => setCanvasTab('spectrum')}>
            スペクトル
          </button>
          <button type="button" role="tab" aria-selected={tab === 'trend'} className={tab === 'trend' ? 'on' : ''} onClick={() => setCanvasTab('trend')}>
            推移グラフ
          </button>
        </div>
      )}
      <span className="grow" />
      <button type="button" className="command-search" onClick={onCommand} aria-keyshortcuts="Control+K">
        <Icon name="search" size={16} />
        <span className="grow">操作を探す</span>
        <Kbd>Ctrl+K</Kbd>
      </button>
      <span className="grow" />
      <SyncPill />
      <MenuButton
        label="書き出し"
        className="btn"
        placement="bottom-end"
        disabled={!hasData}
        items={[
          { label: 'SVG で保存', icon: 'download', hint: 'PowerPoint で「図形に変換」すると線や文字を直せます', onSelect: withSvg(exportSvg) },
          { label: 'PNG で保存', icon: 'image', onSelect: withSvg(exportPng) },
          'divider',
          { label: '印刷 (図と測定条件)', icon: 'printer', hint: 'PDF で保存もできます', onSelect: printFigure },
        ]}
      >
        <Icon name="download" size={16} />
        <span>書き出し</span>
        <Icon name="chevron-down" size={16} />
      </MenuButton>
      <button
        type="button"
        className="btn primary"
        onClick={withSvg(copyFigure)}
        disabled={!hasData}
        title="表示中の図をコピー。Word / PowerPoint にはベクターの図として貼られます (Ctrl+Shift+C)"
      >
        <Icon name="copy" size={16} />
        <span>図をコピー</span>
      </button>
      <IconButton icon="settings" label="設定 (研究室の基準値・自作の不純物など)" onClick={onSettings} />
      <IconButton icon="panel-right" label="右のパネル" shortcut="]" pressed={ui.rightOpen} onClick={() => togglePanel('right')} />
    </header>
  );
}

/** 図の名前。押すと 開く・保存・別名で保存・文献値から足す */
function FileMenu({ onImportSi }: { onImportSi: () => void }) {
  const projectName = useEditor((s) => s.projectName);
  const dirty = useEditor((s) => s.dirty);
  const autoSavedAt = useEditor((s) => s.autoSavedAt);
  const hasData = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const name = projectName ?? '無題の図';
  const state = projectName ? (dirty ? '未保存の変更あり' : '保存済み') : 'ファイルに未保存';
  return (
    <MenuButton
      label={`${name} (ファイルの操作)`}
      className="file-menu"
      items={[
        { label: '開く', icon: 'folder-open', shortcut: 'Ctrl+O', hint: '.jdf は今の図に足す、図のファイルは開く', onSelect: () => void openDialog() },
        { label: projectName ? '上書き保存' : '保存', icon: 'save', shortcut: 'Ctrl+S', disabled: !hasData, onSelect: () => saveProject() },
        { label: '名前を付けて保存', icon: 'save', shortcut: 'Ctrl+Shift+S', disabled: !hasData, onSelect: () => saveProject(true) },
        'divider',
        { label: '文献値からスペクトルを作る', icon: 'book-open', hint: '論文の SI の NMR データから比較用のスペクトルを作ります', onSelect: onImportSi },
      ]}
    >
      <span className="file-name">
        {name}
        <Icon name="chevron-down" size={16} />
      </span>
      <span className="file-state">
        {state}
        {autoSavedAt ? ` · 自動保存 ${time(autoSavedAt)}` : ''}
      </span>
    </MenuButton>
  );
}

/** Delta との同期の状態 (同期しているスペクトルがあるときだけ)。押すと右の「記録」 */
function SyncPill() {
  const links = useSync((s) => s.links);
  const list = Object.values(links).filter((v) => v.status !== 'duplicate');
  if (!list.length) return null;
  const bad = list.find((v) => v.status === 'need-permission' || v.status === 'error');
  const busy = list.some((v) => v.status === 'pending' || v.status === 'waiting');
  const last = Math.max(0, ...list.map((v) => v.lastSyncAt ?? 0));
  const text = bad
    ? bad.status === 'need-permission'
      ? 'Delta へは許可が必要'
      : 'Delta: エラー'
    : busy
      ? 'Delta と同期中…'
      : `Delta と同期${last ? ` ${time(last)}` : ''}`;
  return (
    <button
      type="button"
      className={`sync-pill${bad ? ' warn' : ''}`}
      title={bad?.message || '右の「記録」で詳しく見られます'}
      onClick={() => {
        useEditor.setState({ inspectorTab: 'record' });
        if (!useEditor.getState().settings.ui.rightOpen) togglePanel('right');
      }}
    >
      <span className="dot" aria-hidden="true" />
      {text}
    </button>
  );
}

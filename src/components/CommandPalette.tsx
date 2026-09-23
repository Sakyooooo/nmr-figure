import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { copyFigure, exportPng, exportSvg, openDialog, saveProject } from '../state/fileOps';
import {
  autoDetectSignals,
  autoPeakLabels,
  fitY,
  fullRange,
  notify,
  openSiImport,
  openStructureEditor,
  printFigure,
  redo,
  scaleY,
  setCanvasTab,
  setInspectorTab,
  setTool,
  setViewZoom,
  togglePanel,
  undo,
  useEditor,
} from '../state/store';
import { TOOLS } from './Dock';
import { Icon, type IconName } from './Icon';
import { Kbd } from './ui';

type Command = { group: string; label: string; icon: IconName; shortcut?: string; keywords?: string; run: () => void; enabled: boolean };

/** 漢字の名前を、変換する前の読み (ひらがな) でも探せるように */
const READINGS: Record<string, string> = {
  select: 'せんたく いどう',
  zoom: 'かくだい ずーむ',
  height: 'たかさ ぴーく',
  peak: 'ぴーくち らべる',
  integral: 'せきぶん',
  marker: 'まーかー ふじゅんぶつ',
  region: 'すいい はんい',
  reference: 'きじゅん きじゅんあわせ ようばい',
  ellipse: 'だえん まる ずけい',
  rect: 'しかく ずけい',
  arrow: 'やじるし ずけい',
  line: 'せん ずけい',
  text: 'もじ てきすと',
};

/** 名前で操作を探して実行する (Ctrl+K)。あまり使わない操作の置き場も兼ねる */
export function CommandPalette({ svgRef, onClose, onSettings }: { svgRef: RefObject<SVGSVGElement | null>; onClose: () => void; onSettings: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const commands = useCommands(svgRef, onSettings);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    const usable = commands.filter((c) => c.enabled);
    if (!q) return usable;
    return usable.filter((c) => normalize(`${c.label} ${c.group} ${c.keywords ?? ''} ${c.shortcut ?? ''}`).includes(q));
  }, [commands, query]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[index]);
    }
  };

  let lastGroup = '';
  return (
    <div className="palette-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="操作を探す" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="操作を探す (例: 積分、SVG、全体)"
            aria-label="操作を探す"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[index] ? `palette-item-${index}` : undefined}
          />
        </div>
        <div className="palette-list" id="palette-list" role="listbox" ref={listRef}>
          {results.length === 0 && <p className="palette-empty">見つかりませんでした</p>}
          {results.map((c, i) => {
            const head = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <div key={`${c.group}-${c.label}`}>
                {head && <div className="palette-group">{head}</div>}
                <div
                  id={`palette-item-${i}`}
                  role="option"
                  aria-selected={i === index}
                  className={`palette-item${i === index ? ' on' : ''}`}
                  onPointerMove={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  <Icon name={c.icon} />
                  <span className="grow">{c.label}</span>
                  {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="palette-foot">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> 選ぶ
          </span>
          <span>
            <Kbd>Enter</Kbd> 実行
          </span>
          <span>
            <Kbd>Esc</Kbd> 閉じる
          </span>
        </div>
      </div>
    </div>
  );
}

/** ひらがな・カタカナ、全角・半角、大文字・小文字を区別しないで探す */
function normalize(s: string) {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

function useCommands(svgRef: RefObject<SVGSVGElement | null>, onSettings: () => void): Command[] {
  const hasData = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const is2d = useEditor((s) => !!s.doc.plot2d);
  const tab = useEditor((s) => s.canvasTab);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const ui = useEditor((s) => s.settings.ui);
  const withSvg = (fn: (svg: SVGSVGElement) => unknown) => () => svgRef.current && fn(svgRef.current);
  const spectrum = hasData && !is2d && tab === 'spectrum';
  const layer = spectrum && activeLayerId;

  return [
    ...TOOLS.map((t) => ({
      group: '道具',
      label: t.label,
      icon: t.icon,
      shortcut: t.key,
      keywords: `${t.hint} ${READINGS[t.id] ?? ''}`,
      run: () => setTool(t.id),
      enabled: hasData && tab === 'spectrum' && (!is2d || t.id === 'select' || t.id === 'zoom'),
    })),
    { group: '道具', label: '構造式を描いて置く', icon: 'hexagon', keywords: 'ketcher chemdraw', run: () => openStructureEditor(null), enabled: spectrum },

    {
      group: '解析',
      label: '自動で積分 (選んでいるスペクトル)',
      icon: 'nmr-integral',
      keywords: 'せきぶん integral',
      run: () => {
        if (!activeLayerId) return;
        const n = autoDetectSignals(activeLayerId, 0.03, false);
        notify(n ? `${n} 個の信号を積分しました。値を1つ書き換えると基準が決まります` : '新しく積分する信号はありませんでした');
      },
      enabled: !!layer,
    },
    {
      group: '解析',
      label: 'ピーク値を自動で付ける (選んでいるスペクトル)',
      icon: 'nmr-peak',
      keywords: 'ぴーく peak ラベル',
      run: () => {
        if (!activeLayerId) return;
        const n = autoPeakLabels(activeLayerId, 0.05, false);
        notify(n ? `${n} 本のピークにラベルを付けました` : '新しく付けるピークはありませんでした');
      },
      enabled: !!layer,
    },

    { group: '書き出し', label: '図をコピー (Word / PowerPoint に貼る)', icon: 'copy', shortcut: 'Ctrl+Shift+C', run: withSvg(copyFigure), enabled: hasData },
    { group: '書き出し', label: 'SVG で保存', icon: 'download', keywords: 'svg ベクター 図形に変換', run: withSvg(exportSvg), enabled: hasData },
    { group: '書き出し', label: 'PNG で保存', icon: 'image', keywords: 'png 画像', run: withSvg(exportPng), enabled: hasData },
    { group: '書き出し', label: '印刷 (図と測定条件)', icon: 'printer', keywords: 'pdf', run: printFigure, enabled: hasData },

    { group: 'ファイル', label: '開く', icon: 'folder-open', shortcut: 'Ctrl+O', keywords: 'jdf', run: () => void openDialog(), enabled: true },
    { group: 'ファイル', label: '保存', icon: 'save', shortcut: 'Ctrl+S', run: () => saveProject(), enabled: hasData },
    { group: 'ファイル', label: '名前を付けて保存', icon: 'save', shortcut: 'Ctrl+Shift+S', run: () => saveProject(true), enabled: hasData },
    { group: 'ファイル', label: '文献値からスペクトルを作る', icon: 'book-open', keywords: 'si 論文 文献', run: () => openSiImport(), enabled: true },
    { group: 'ファイル', label: 'ホームに戻る (測定の一覧)', icon: 'house', run: () => useEditor.setState({ screen: 'home' }), enabled: true },

    { group: '表示', label: '全体を表示', icon: 'expand', shortcut: '0', run: fullRange, enabled: hasData && tab === 'spectrum' },
    { group: '表示', label: '縦を自動 (表示範囲の最大ピークに合わせる)', icon: 'fit-y', shortcut: 'F', run: fitY, enabled: spectrum },
    { group: '表示', label: 'スペクトルを高くする', icon: 'arrow-up', keywords: '縦 倍率', run: () => scaleY(1.5), enabled: spectrum },
    { group: '表示', label: 'スペクトルを低くする', icon: 'arrow-down', keywords: '縦 倍率', run: () => scaleY(1 / 1.5), enabled: spectrum },
    { group: '表示', label: '画面に合わせる', icon: 'expand', keywords: '表示倍率 ズーム', run: () => setViewZoom('fit'), enabled: hasData },
    { group: '表示', label: tab === 'trend' ? 'スペクトルを見る' : '推移グラフを見る', icon: 'nmr-region', run: () => setCanvasTab(tab === 'trend' ? 'spectrum' : 'trend'), enabled: hasData && !is2d },
    { group: '表示', label: ui.leftOpen ? 'スペクトルの一覧を閉じる' : 'スペクトルの一覧を開く', icon: 'panel-left', shortcut: '[', run: () => togglePanel('left'), enabled: hasData },
    { group: '表示', label: ui.rightOpen ? '右のパネルを閉じる' : '右のパネルを開く', icon: 'panel-right', shortcut: ']', run: () => togglePanel('right'), enabled: hasData },

    ...(['analysis', 'figure', 'record'] as const).map((id) => ({
      group: '右のパネル',
      label: { analysis: '解析 (積分・ピーク値・不純物・SI 用の文)', figure: '図 (図に入れるもの・大きさ・字体・テンプレート)', record: '記録 (Delta との同期・編集記録)' }[id],
      icon: ({ analysis: 'nmr-integral', figure: 'image', record: 'history' } as const)[id],
      run: () => {
        setInspectorTab(id);
        if (!useEditor.getState().settings.ui.rightOpen) togglePanel('right');
      },
      enabled: spectrum,
    })),

    { group: '編集', label: '元に戻す', icon: 'undo', shortcut: 'Ctrl+Z', run: undo, enabled: canUndo },
    { group: '編集', label: 'やり直す', icon: 'redo', shortcut: 'Ctrl+Y', run: redo, enabled: canRedo },
    { group: '設定', label: '設定 (研究室の基準値・自作の不純物・PNG の解像度)', icon: 'settings', run: onSettings, enabled: true },
  ];
}

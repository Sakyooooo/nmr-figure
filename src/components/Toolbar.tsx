import type { ReactNode, RefObject } from 'react';
import { copyFigure, exportPng, exportSvg, openDialog, saveProject } from '../state/fileOps';
import { fitY, fullRange, openStructureEditor, printFigure, redo, scaleY, setTool, togglePanel, undo, useEditor } from '../state/store';
import type { Tool } from '../state/types';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const TOOLS: { id: Tool; label: string; key: string; icon: ReactNode }[] = [
  { id: 'select', label: '選択・移動', key: 'V', icon: <path d="M5 3l11 7-5 1.5L8.5 17z" {...stroke} /> },
  {
    id: 'zoom',
    label: '範囲を拡大 (ドラッグ)',
    key: 'Z',
    icon: (
      <g {...stroke}>
        <circle cx="8.5" cy="8.5" r="5" />
        <path d="M12.5 12.5L17 17M6.5 8.5h4M8.5 6.5v4" />
      </g>
    ),
  },
  {
    id: 'height',
    label: 'ピークの高さ (上下にドラッグ。Shift でそのスペクトルだけ)',
    key: 'H',
    icon: (
      <g {...stroke}>
        <path d="M3 17h14M6.5 16h1l2.5-9 2.5 9h4" />
        <path d="M3.5 3.5v11M1.8 5.2l1.7-1.7 1.7 1.7M1.8 12.8l1.7 1.7 1.7-1.7" />
      </g>
    ),
  },
  { id: 'peak', label: 'ピーク値ラベル (クリックで付け外し)', key: 'P', icon: <path d="M2 17h16M4 16l3 0 2-12 2 12h5M10 2v-1" {...stroke} /> },
  {
    id: 'integral',
    label: '積分 (左右にドラッグ。続けて何本でも引けます)',
    key: 'I',
    icon: (
      <g>
        <path d="M2 17h16M4 16h3l2-9 2 9h6" {...stroke} opacity="0.45" />
        <path d="M3 15c4 0 4-1 6-5s2-6 8-6" {...stroke} />
      </g>
    ),
  },
  {
    id: 'marker',
    label: 'マーカー (右で種類を選んでピークをクリック)',
    key: 'M',
    icon: (
      <g>
        <path d="M2 17h16M4 16h3l3-9 3 9h3" {...stroke} />
        <circle cx="10" cy="3.5" r="2.2" fill="currentColor" />
      </g>
    ),
  },
  { id: 'ellipse', label: '楕円 (Shift で正円)', key: 'O', icon: <ellipse cx="10" cy="10" rx="7.5" ry="5.5" {...stroke} /> },
  { id: 'rect', label: '四角', key: 'R', icon: <rect x="3" y="5" width="14" height="10" {...stroke} /> },
  {
    id: 'arrow',
    label: '矢印 (Shift で水平・垂直)',
    key: 'A',
    icon: (
      <g>
        <path d="M3 17L14 6" {...stroke} />
        <path d="M17 3l-2 7-5-5z" fill="currentColor" />
      </g>
    ),
  },
  { id: 'line', label: '線', key: 'L', icon: <path d="M3 17L17 3" {...stroke} /> },
  { id: 'text', label: 'テキスト', key: 'T', icon: <path d="M4 4h12M10 4v13M7.5 17h5" {...stroke} /> },
  {
    id: 'region',
    label: '推移グラフの範囲 (左右にドラッグ)',
    key: 'G',
    icon: (
      <g>
        <rect x="5" y="3" width="10" height="14" fill="currentColor" opacity="0.18" />
        <path d="M2 17h16M5 3v14M15 3v14M3 16h3l4-10 4 10h3" {...stroke} />
      </g>
    ),
  },
  {
    id: 'reference',
    label: '基準合わせ (溶媒ピークをクリック)',
    key: 'B',
    icon: <path d="M2 17h16M10 2v15M6 6l4-4 4 4" {...stroke} />,
  },
];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
      {children}
    </svg>
  );
}

export function Toolbar({ svgRef, onSettings, onImportSi }: { svgRef: RefObject<SVGSVGElement | null>; onSettings: () => void; onImportSi: () => void }) {
  const tool = useEditor((s) => s.tool);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const hasData = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const withSvg = (fn: (svg: SVGSVGElement) => unknown) => () => svgRef.current && fn(svgRef.current);
  const ui = useEditor((s) => s.settings.ui);
  const onTrend = useEditor((s) => s.canvasTab === 'trend');
  const is2d = useEditor((s) => !!s.doc.plot2d);
  const projectName = useEditor((s) => s.projectName);
  // 2D で使えるのは移動と範囲の拡大だけ
  const toolAvailable = (id: Tool) => !is2d || id === 'select' || id === 'zoom';

  return (
    <header className="toolbar">
      <button className={`icon${ui.leftOpen ? ' active' : ''}`} onClick={() => togglePanel('left')} title="左のパネルを開く/閉じる ([)">
        <Icon>
          <g {...stroke}>
            <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
            <path d="M7.5 3.5v13" />
          </g>
        </Icon>
      </button>
      <div className="group">
        <button onClick={() => useEditor.setState({ screen: 'home' })} title="実験の一覧に戻る (編集中の図はそのまま残ります)">
          ← ホーム
        </button>
        <button onClick={() => void openDialog()} title="開く (Ctrl+O)">
          開く
        </button>
        <button
          onClick={() => saveProject()}
          disabled={!hasData}
          title={projectName ? `${projectName} に上書き保存 (Ctrl+S)` : '保存する場所を選びます。次からは同じファイルに上書きします (Ctrl+S)'}
        >
          {projectName ? '上書き保存' : '保存'}
        </button>
        <button onClick={() => saveProject(true)} disabled={!hasData} title="名前を付けて保存 (Ctrl+Shift+S)">
          別名で保存
        </button>
        <button onClick={onImportSi} title="論文の SI に書かれた NMR データから、比較用のスペクトルを作ります">
          文献から
        </button>
      </div>
      <div className="group">
        <button className="icon" onClick={undo} disabled={!canUndo} title="元に戻す (Ctrl+Z)">
          <Icon>
            <path d="M7 5L3 9l4 4M3 9h9a5 5 0 010 10h-2" {...stroke} />
          </Icon>
        </button>
        <button className="icon" onClick={redo} disabled={!canRedo} title="やり直し (Ctrl+Y)">
          <Icon>
            <path d="M13 5l4 4-4 4M17 9H8a5 5 0 000 10h2" {...stroke} />
          </Icon>
        </button>
      </div>
      <div className="group tools" role="toolbar" aria-label="ツール">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`icon${tool === t.id ? ' active' : ''}`}
            onClick={() => setTool(t.id)}
            disabled={!hasData || onTrend || !toolAvailable(t.id)}
            title={`${t.label} (${t.key})`}
            aria-pressed={tool === t.id}
          >
            <Icon>{t.icon}</Icon>
          </button>
        ))}
      </div>
      <div className="group">
        <button
          className="icon"
          onClick={() => openStructureEditor(null)}
          disabled={!hasData}
          title="構造式を描いて図に置く (ChemDraw からコピーしたものは図の上で Ctrl+V)"
        >
          <Icon>
            <g {...stroke}>
              <path d="M10 2.5l6.5 3.75v7.5L10 17.5 3.5 13.75v-7.5z" />
              <circle cx="10" cy="10" r="3.6" />
            </g>
          </Icon>
        </button>
        <button onClick={fullRange} disabled={!hasData} title="全体を表示 (ダブルクリックでも可)">
          全体表示
        </button>
        <button onClick={fitY} disabled={!hasData || is2d} title="表示範囲の最大ピークに合わせて縦を調整 (F)" hidden={is2d}>
          縦を自動
        </button>
        <button className="icon" onClick={() => scaleY(1.5)} disabled={!hasData} hidden={is2d} title="全部のスペクトルを縦に高くする (小さいピークを見やすく)">
          <Icon>
            <g {...stroke}>
              <path d="M3 17h14M6.5 16h1l2.5-9 2.5 9h4" />
              <path d="M16.5 8.5V2.5M14.8 4.2l1.7-1.7 1.7 1.7" />
            </g>
          </Icon>
        </button>
        <button className="icon" onClick={() => scaleY(1 / 1.5)} disabled={!hasData} hidden={is2d} title="全部のスペクトルを縦に低くする">
          <Icon>
            <g {...stroke}>
              <path d="M3 17h14M6.5 16h1l2.5-9 2.5 9h4" />
              <path d="M16.5 2.5v6M14.8 6.8l1.7 1.7 1.7-1.7" />
            </g>
          </Icon>
        </button>
      </div>
      <div className="group">
        <button className="primary" onClick={withSvg(copyFigure)} disabled={!hasData} title="表示中の図をコピー。Word / PowerPoint にはベクターの図として貼られます (Ctrl+Shift+C)">
          図をコピー
        </button>
        <button onClick={withSvg(exportSvg)} disabled={!hasData} title="SVG で保存。PowerPoint で挿入し、右クリック →「図形に変換」で線や文字を編集できます">
          SVG
        </button>
        <button onClick={withSvg(exportPng)} disabled={!hasData} title="PNG で保存">
          PNG
        </button>
        <button onClick={printFigure} disabled={!hasData} title="図と測定条件を印刷 (PDF で保存もできます)">
          印刷
        </button>
      </div>
      <div className="spacer" />
      <button onClick={onSettings} title="研究室の基準値・自作の不純物など">
        設定
      </button>
      <button className={`icon${ui.rightOpen ? ' active' : ''}`} onClick={() => togglePanel('right')} title="右のパネルを開く/閉じる (])">
        <Icon>
          <g {...stroke}>
            <rect x="2.5" y="3.5" width="15" height="13" rx="1.5" />
            <path d="M12.5 3.5v13" />
          </g>
        </Icon>
      </button>
    </header>
  );
}

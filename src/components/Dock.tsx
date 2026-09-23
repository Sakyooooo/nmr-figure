import { openStructureEditor, redo, setTool, undo, useEditor } from '../state/store';
import type { Tool } from '../state/types';
import { Icon, type IconName } from './Icon';
import { IconButton, MenuButton } from './ui';

/** 道具。hint の [ ] で囲んだ所はキーとして枠付きで出す */
export const TOOLS: { id: Tool; label: string; key: string; icon: IconName; hint: string }[] = [
  { id: 'select', label: '選択・移動', key: 'V', icon: 'pointer', hint: '選択: 選んで動かす · 背景を左右にドラッグで移動、上下で高さ ([Shift] で全体)' },
  { id: 'zoom', label: '範囲を拡大', key: 'Z', icon: 'zoom-in', hint: '拡大: ドラッグした範囲を拡大 · ダブルクリックで全体' },
  { id: 'height', label: 'ピークの高さ', key: 'H', icon: 'nmr-height', hint: '高さ: 上下にドラッグ ([Shift] でそのスペクトルだけ)' },
  { id: 'peak', label: 'ピーク値', key: 'P', icon: 'nmr-peak', hint: 'ピーク値: クリックで付け外し' },
  { id: 'integral', label: '積分', key: 'I', icon: 'nmr-integral', hint: '積分: 左右にドラッグして範囲を選ぶ · 続けて何本でも · [Esc] で終わる' },
  { id: 'marker', label: 'マーカー', key: 'M', icon: 'nmr-marker', hint: 'マーカー: 右のパネルで種類を選び、ピークをクリック' },
  { id: 'region', label: '推移グラフの範囲', key: 'G', icon: 'nmr-region', hint: '推移の範囲: 左右にドラッグ' },
  { id: 'reference', label: '基準合わせ', key: 'B', icon: 'nmr-reference', hint: '基準合わせ: 溶媒のピークをクリック' },
  { id: 'ellipse', label: '楕円', key: 'O', icon: 'ellipse', hint: '楕円: ドラッグで描く · [Shift] で正円' },
  { id: 'rect', label: '四角', key: 'R', icon: 'rect', hint: '四角: ドラッグで描く · [Shift] で正方形' },
  { id: 'arrow', label: '矢印', key: 'A', icon: 'arrow', hint: '矢印: ドラッグで描く · [Shift] で水平・垂直' },
  { id: 'line', label: '線', key: 'L', icon: 'line', hint: '線: ドラッグで描く · [Shift] で水平・垂直' },
  { id: 'text', label: '文字', key: 'T', icon: 'type', hint: '文字: クリックした所に置く' },
];

const VIEW_TOOLS: Tool[] = ['select', 'zoom', 'height'];
const ANALYSIS_TOOLS: Tool[] = ['peak', 'integral', 'marker', 'region', 'reference'];
const SHAPE_TOOLS: Tool[] = ['ellipse', 'rect', 'arrow', 'line'];
const tool = (id: Tool) => TOOLS.find((t) => t.id === id)!;

/** 図の下の中央に浮かぶ道具の帯と、その左の「元に戻す・やり直す」 */
export function Dock() {
  const current = useEditor((s) => s.tool);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const onTrend = useEditor((s) => s.canvasTab === 'trend');
  const is2d = useEditor((s) => !!s.doc.plot2d);
  // 2D で使えるのは移動と範囲の拡大だけ
  const usable = (id: Tool) => !onTrend && (!is2d || id === 'select' || id === 'zoom');
  const toolButton = (id: Tool) => {
    const t = tool(id);
    return <IconButton key={id} icon={t.icon} label={t.label} shortcut={t.key} pressed={current === id} disabled={!usable(id)} onClick={() => setTool(id)} className="tool" />;
  };
  const shape = SHAPE_TOOLS.includes(current) ? tool(current) : tool('ellipse');

  return (
    <div className="dock-row">
      <div className="bar" role="toolbar" aria-label="元に戻す・やり直す">
        <IconButton icon="undo" label="元に戻す" shortcut="Ctrl+Z" onClick={undo} disabled={!canUndo} className="tool" />
        <IconButton icon="redo" label="やり直す" shortcut="Ctrl+Y" onClick={redo} disabled={!canRedo} className="tool" />
      </div>
      <div className="bar" role="toolbar" aria-label="道具">
        {VIEW_TOOLS.map(toolButton)}
        {!is2d && (
          <>
            <span className="bar-sep" aria-hidden="true" />
            {ANALYSIS_TOOLS.map(toolButton)}
            <span className="bar-sep" aria-hidden="true" />
            <MenuButton
              label={`図形 (${SHAPE_TOOLS.map((id) => tool(id).key).join('・')})`}
              className={`ibtn md tool${SHAPE_TOOLS.includes(current) ? ' on' : ''}`}
              placement="top"
              disabled={onTrend}
              items={SHAPE_TOOLS.map((id) => ({ label: tool(id).label, icon: tool(id).icon, shortcut: tool(id).key, onSelect: () => setTool(id) }))}
            >
              <Icon name={shape.icon} />
              <span className="tool-caret" aria-hidden="true" />
            </MenuButton>
            {toolButton('text')}
            <IconButton icon="hexagon" label="構造式を描いて置く" onClick={() => openStructureEditor(null)} disabled={onTrend} className="tool" />
          </>
        )}
      </div>
    </div>
  );
}

/** 選んでいる道具の使い方 (図の上に一行) */
export function ToolHint() {
  const current = useEditor((s) => s.tool);
  const onTrend = useEditor((s) => s.canvasTab === 'trend');
  const is2d = useEditor((s) => !!s.doc.plot2d);
  if (onTrend) return null;
  const text = is2d ? (current === 'zoom' ? '範囲を拡大: ドラッグ · ダブルクリックで全体' : 'ドラッグで移動 · ホイールで拡大縮小') : tool(current)?.hint;
  if (!text) return null;
  return (
    <div className="tool-hint" role="status" aria-live="polite" title={text.replace(/[[\]]/g, '')}>
      {text.split(/(\[[^\]]+\])/).map((part, i) =>
        part.startsWith('[') ? (
          <kbd key={i} className="kbd inverse">
            {part.slice(1, -1)}
          </kbd>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </div>
  );
}

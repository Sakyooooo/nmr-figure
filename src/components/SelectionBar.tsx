import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { integralValues } from '../lib/integrals';
import { deleteSelection, edit, openStructureEditor, pasteAnnotation, reorderAnnotation, setIntegralValue, useEditor } from '../state/store';
import { NumberInput } from './inputs';
import { IconButton } from './ui';

const KIND: Record<string, string> = { ellipse: '楕円', rect: '四角', arrow: '矢印', line: '線', text: '文字' };

/**
 * 選んだもの (積分・ピーク値・図形など) の真上に出る小さな操作の帯。
 * 場所は図の中の選択の印 (data-ui="sel") から毎フレーム測る。ドラッグ中は隠す
 */
export function SelectionBar({ stageRef }: { stageRef: RefObject<HTMLElement | null> }) {
  const selection = useEditor((s) => s.selection);
  const tab = useEditor((s) => s.canvasTab);
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const values = useMemo(() => (selection?.kind === 'integral' ? integralValues(doc, data).values : null), [selection, doc, data]);

  useEffect(() => {
    if (!selection || tab !== 'spectrum') {
      setPos(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      const stage = stageRef.current;
      const mark = stage?.querySelector('svg.figure [data-ui="sel"]');
      if (stage && mark) {
        const s = stage.getBoundingClientRect();
        const r = mark.getBoundingClientRect();
        const w = barRef.current?.offsetWidth ?? 200;
        const x = Math.max(8, Math.min(s.width - w - 8, r.left + r.width / 2 - s.left - w / 2));
        // 上に場所がなければ下に出す
        let y = r.top - s.top - 48;
        if (y < 52) y = r.bottom - s.top + 8;
        setPos((p) => (p && Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5 ? p : { x, y }));
      } else setPos((p) => (p ? null : p));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const down = (e: PointerEvent) => {
      if ((e.target as Element).closest?.('svg.figure')) setDragging(true);
    };
    const up = () => setDragging(false);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [selection, tab, stageRef]);

  if (!selection || tab !== 'spectrum') return null;
  const del = <IconButton icon="trash" size="sm" label="消す" shortcut="Delete" onClick={deleteSelection} />;
  let body = null;
  if (selection.kind === 'integral') {
    const value = values?.get(selection.id);
    body = (
      <>
        <span className="sel-label">積分</span>
        <label className="sel-field" title="値を入れると、この積分を基準にほかがそろいます">
          値
          <NumberInput value={value === undefined ? null : Math.round(value * 100) / 100} step={1} min={0} width={64} onCommit={(v) => v !== null && v > 0 && setIntegralValue(selection.id, v)} />
        </label>
        <span className="bar-sep" aria-hidden="true" />
        {del}
      </>
    );
  } else if (selection.kind === 'peakLabel') {
    const p = doc.peakLabels.find((x) => x.id === selection.id);
    body = (
      <>
        <span className="sel-label num">ピーク値{p ? ` ${p.ppm.toFixed(3)}` : ''}</span>
        {del}
      </>
    );
  } else if (selection.kind === 'marker') {
    body = (
      <>
        <span className="sel-label">マーカー</span>
        {del}
      </>
    );
  } else if (selection.kind === 'image') {
    const image = doc.figureImages.find((x) => x.id === selection.id);
    body = (
      <>
        <span className="sel-label">{image?.svg ? '構造式' : '画像'}</span>
        {image?.source && (
          <button type="button" className="btn ghost sm" onClick={() => openStructureEditor(image.id)}>
            描き直す
          </button>
        )}
        {del}
      </>
    );
  } else if (selection.kind === 'legend') {
    body = (
      <>
        <span className="sel-label">凡例</span>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() =>
            edit((d) => {
              d.figure.legendPos = null;
            })
          }
        >
          右上に戻す
        </button>
      </>
    );
  } else {
    const a = doc.annotations.find((x) => x.id === selection.id);
    if (!a) return null;
    body = (
      <>
        <span className="sel-label">{KIND[a.kind]}</span>
        <IconButton icon="arrow-up" size="sm" label="前面へ" onClick={() => reorderAnnotation(a.id, true)} />
        <IconButton icon="arrow-down" size="sm" label="背面へ" onClick={() => reorderAnnotation(a.id, false)} />
        <IconButton icon="copy" size="sm" label="複製" shortcut="Ctrl+D" onClick={() => pasteAnnotation(a)} />
        <span className="bar-sep" aria-hidden="true" />
        {del}
      </>
    );
  }
  return (
    <div
      ref={barRef}
      className="selection-bar bar"
      role="toolbar"
      aria-label="選んだものの操作"
      style={pos && !dragging ? { left: pos.x, top: pos.y } : { visibility: 'hidden', left: 0, top: 0 }}
    >
      {body}
      <IconButton icon="x" size="sm" label="選ぶのをやめる" shortcut="Esc" onClick={() => useEditor.setState({ selection: null })} />
    </div>
  );
}


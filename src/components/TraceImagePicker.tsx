/**
 * 文献の図 (スクショ) を貼って、スペクトルの枠と左右の ppm を教えてもらい、波形を読み取る。
 * 読み取った波形は「線幅を測る」ためだけに使う (位置や J は SI の文を優先)。
 */
import { tr } from '../i18n';
import { trx } from '../i18n/react';
import { useEffect, useRef, useState } from 'react';
import { traceImage, type Pixels, type Rect, type Trace } from '../lib/trace';
import { NumberInput } from './inputs';

const VIEW_WIDTH = 520;

export function TraceImagePicker({ onTrace }: { onTrace: (trace: Trace | null) => void }) {
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [pixels, setPixels] = useState<Pixels | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [right, setRight] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  const scale = bitmap ? VIEW_WIDTH / bitmap.width : 1;

  const load = async (file: Blob | null) => {
    if (!file) return;
    try {
      const bmp = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(tr('画像を読めません'));
      ctx.drawImage(bmp, 0, 0);
      const data = ctx.getImageData(0, 0, bmp.width, bmp.height);
      setBitmap(bmp);
      setPixels({ width: data.width, height: data.height, data: data.data });
      setRect({ x: 0, y: 0, w: bmp.width, h: bmp.height });
      setError('');
    } catch (e) {
      setError(tr('画像を読めませんでした: {message}', { message: (e as Error).message }));
    }
  };

  // 枠と ppm がそろったら読み取る
  useEffect(() => {
    if (!pixels || !rect || left === null || right === null || left === right) {
      setTrace(null);
      onTrace(null);
      return;
    }
    try {
      const result = traceImage(pixels, rect, left, right);
      setTrace(result);
      onTrace(result);
      setError('');
    } catch (e) {
      setTrace(null);
      onTrace(null);
      setError((e as Error).message);
    }
  }, [pixels, rect, left, right, onTrace]);

  // 画像・枠・読み取った波形を描く
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = VIEW_WIDTH;
    canvas.height = Math.round(bitmap.height * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (rect) {
      ctx.strokeStyle = '#1d7ad1';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(rect.x * scale, rect.y * scale, rect.w * scale, rect.h * scale);
    }
    if (trace && rect) {
      ctx.strokeStyle = '#17a34a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let c = 0; c < trace.y.length; c++) {
        const x = (rect.x + c) * scale;
        const y = (rect.y + rect.h - 1 - (trace.y[c] + trace.base)) * scale;
        if (c === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, [bitmap, rect, trace, scale]);

  const pointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };

  return (
    <div className="trace-picker">
      <p className="hint">
        {tr('SI の図のスクショを貼ると、線の太さや山の形を figure に合わせられます。')}
        {trx('{strong}ので、図が無くても使えます。', { strong: <strong>{tr('位置と J は SI の文を優先する')}</strong> })}
      </p>
      <div
        className="trace-drop"
        tabIndex={0}
        onPaste={(e) => {
          const item = [...e.clipboardData.items].find((x) => x.type.startsWith('image/'));
          if (item) {
            e.preventDefault();
            void load(item.getAsFile());
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void load(e.dataTransfer.files[0] ?? null);
        }}
      >
        {tr('ここをクリックして Ctrl+V で貼り付け、または画像をドロップ')}
        <input type="file" accept="image/*" onChange={(e) => void load(e.target.files?.[0] ?? null)} />
      </div>
      {error && <p className="hint warn">{error}</p>}
      {bitmap && (
        <>
          <canvas
            ref={canvasRef}
            className="trace-canvas"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              dragFrom.current = pointer(e);
            }}
            onPointerMove={(e) => {
              const from = dragFrom.current;
              if (!from) return;
              const to = pointer(e);
              setRect({
                x: Math.max(0, Math.min(from.x, to.x)),
                y: Math.max(0, Math.min(from.y, to.y)),
                w: Math.abs(to.x - from.x),
                h: Math.abs(to.y - from.y),
              });
            }}
            onPointerUp={() => {
              dragFrom.current = null;
            }}
          />
          <p className="hint">{tr('スペクトルの線が入る範囲をドラッグで囲みます (目盛りの数字や文字は入れない方が、きれいに読めます)。')}</p>
          <div className="row wrap">
            <label className="field" title={tr('囲んだ枠の左端の ppm')}>
              {tr('枠の左端')}
              <NumberInput value={left} min={-500} max={500} step={0.1} width={64} allowEmpty onCommit={setLeft} />
              ppm
            </label>
            <label className="field" title={tr('囲んだ枠の右端の ppm')}>
              {tr('右端')}
              <NumberInput value={right} min={-500} max={500} step={0.1} width={64} allowEmpty onCommit={setRight} />
              ppm
            </label>
          </div>
          {trace && (
            <p className="hint">
              {tr('読み取り: {n} 画素 / 1 画素 = {ppm} ppm', { n: trace.y.length, ppm: (Math.abs(trace.left - trace.right) / Math.max(1, trace.y.length - 1)).toFixed(4) })}
              {trace.blank > trace.y.length * 0.2 ? tr('。線が見つからない列が多いので、枠を線に合わせて囲み直してください') : ''}
            </p>
          )}
        </>
      )}
    </div>
  );
}

import { experimentLabel2d } from '../lib/jdf2d';
import { autoTitle2d, fullView2d, squareHeight } from '../lib/scene2d';
import { nucleusRich } from '../lib/nuclei';
import { solventInfo } from '../lib/solvents';
import { edit, setPlot2d, setProcessing2d, setView2d, useEditor } from '../state/store';
import type { Processing2d } from '../lib/fid2d';
import { Check, ColorInput, NumberInput, Section } from './inputs';
import { RichHtml } from './RichText';

/** 左パネル: 開いている 2D の中身 */
export function Spectrum2dPanel() {
  const meta = useEditor((s) => s.doc.spectra2d[0]);
  const plot = useEditor((s) => s.doc.plot2d);
  if (!meta || !plot) return null;
  const solvent = solventInfo(meta.solvent)?.label ?? meta.solventRaw;
  return (
    <>
      <Section title="2D スペクトル">
        <p className="title-2d">
          <RichHtml text={autoTitle2d(meta)} />
        </p>
        <dl className="facts">
          <dt>測定</dt>
          <dd>{experimentLabel2d(meta)}</dd>
          <dt>横軸 (F2)</dt>
          <dd>
            <RichHtml text={nucleusRich(meta.x.nucleus)} /> {meta.x.freqMHz.toFixed(1)} MHz
          </dd>
          <dt>縦軸 (F1)</dt>
          <dd>
            <RichHtml text={nucleusRich(meta.y.nucleus)} /> {meta.y.freqMHz.toFixed(1)} MHz
          </dd>
          <dt>溶媒</dt>
          <dd>{solvent ? <RichHtml text={solvent} /> : '—'}</dd>
          <dt>積算</dt>
          <dd>{meta.scans ?? '—'}</dd>
          <dt>ファイル</dt>
          <dd className="wrap">{meta.fileName}</dd>
        </dl>
      </Section>

      <Section title="表示範囲">
        <div className="grid2">
          <label className="field">
            F2 左
            <NumberInput value={round2(plot.view.xMax)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ xMax: v })} />
          </label>
          <label className="field">
            F2 右
            <NumberInput value={round2(plot.view.xMin)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ xMin: v })} />
          </label>
          <label className="field">
            F1 上
            <NumberInput value={round2(plot.view.yMax)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ yMax: v })} />
          </label>
          <label className="field">
            F1 下
            <NumberInput value={round2(plot.view.yMin)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ yMin: v })} />
          </label>
        </div>
        <div className="row">
          <button onClick={() => setView2d(fullView2d(meta))}>全体表示</button>
          {meta.x.nucleus === meta.y.nucleus && (
            <button
              onClick={() => {
                const lo = Math.min(plot.view.xMin, plot.view.yMin);
                const hi = Math.max(plot.view.xMax, plot.view.yMax);
                setView2d({ xMax: hi, xMin: lo, yMax: hi, yMin: lo });
              }}
              title="縦と横の範囲をそろえます (対角線が 45° になります)"
            >
              縦横をそろえる
            </button>
          )}
        </div>
        <div className="row">
          <button onClick={squareFigure} title="図の高さを変えて、縦横の ppm あたりの長さをそろえます">
            図を正方形にする
          </button>
        </div>
        <p className="hint">ドラッグで移動、ホイールで拡大縮小、ダブルクリックで全体表示。範囲を拡大ツール (Z) で四角く囲むこともできます。</p>
      </Section>
    </>
  );
}

/** 右パネル: 等高線の描き方 */
export function Plot2dPanel() {
  const plot = useEditor((s) => s.doc.plot2d);
  const meta = useEditor((s) => s.doc.spectra2d[0]);
  if (!plot || !meta) return null;
  const p = meta.processing;
  return (
    <>
      <Section title="等高線">
        <div className="row">
          <label className="field" title="一番低い線の高さ。小さくすると弱いピークまで出ますが、雑音も出ます">
            下限
            <NumberInput
              value={round(plot.base * 100)}
              min={0.05}
              max={90}
              step={0.5}
              width={62}
              onCommit={(v) => v !== null && setPlot2d({ base: Math.max(0.0005, v / 100) })}
            />
            %
          </label>
          <button onClick={() => setPlot2d({ base: Math.max(0.0005, plot.base / 1.5) })} title="弱いピークまで出す">
            ↓ 下げる
          </button>
          <button onClick={() => setPlot2d({ base: Math.min(0.9, plot.base * 1.5) })} title="雑音を減らす">
            ↑ 上げる
          </button>
        </div>
        <div className="grid2">
          <label className="field">
            本数
            <NumberInput value={plot.levels} min={1} max={40} width={52} onCommit={(v) => setPlot2d({ levels: v ?? 10 })} />
          </label>
          <label className="field" title="1本ごとに何倍ずつ高くするか">
            倍率
            <NumberInput value={plot.factor} min={1.05} max={4} step={0.1} width={52} onCommit={(v) => setPlot2d({ factor: v ?? 1.5 })} />
          </label>
          <label className="field">
            色
            <ColorInput value={plot.color} onChange={(color) => setPlot2d({ color })} />
          </label>
          <label className="field">
            線幅
            <NumberInput value={plot.lineWidth} min={0.2} max={3} step={0.1} width={52} onCommit={(v) => setPlot2d({ lineWidth: v ?? 0.6 })} />
          </label>
        </div>
        <div className="row wrap">
          <Check checked={plot.showProjections} onChange={(v) => setPlot2d({ showProjections: v })}>
            上と右に投影
          </Check>
          {meta.x.nucleus === meta.y.nucleus && (
            <Check checked={plot.showDiagonal} onChange={(v) => setPlot2d({ showDiagonal: v })}>
              対角線
            </Check>
          )}
        </div>
      </Section>

      <Section title="2D の処理" defaultOpen={false}>
        <p className="hint">COSY・HMBC などは絶対値で表示します (位相補正は要りません)。変えると計算し直します。</p>
        <label className="field block">
          窓関数
          <select value={p.window} onChange={(e) => setProcessing2d({ window: e.target.value as Processing2d['window'] })}>
            <option value="sine">サインベル (標準)</option>
            <option value="sine2">サインベル二乗 (裾を抑える)</option>
            <option value="none">なし</option>
          </select>
        </label>
        <div className="grid2">
          <label className="field" title="横方向 (F2) のゼロ詰め">
            F2 ゼロ詰め
            <select value={p.zf2} onChange={(e) => setProcessing2d({ zf2: Number(e.target.value) })}>
              <option value={1}>×1</option>
              <option value={2}>×2</option>
            </select>
          </label>
          <label className="field" title="縦方向 (F1) のゼロ詰め。増やすと縦に滑らかになります">
            F1 ゼロ詰め
            <select value={p.zf1} onChange={(e) => setProcessing2d({ zf1: Number(e.target.value) })}>
              <option value={1}>×1</option>
              <option value={2}>×2</option>
              <option value={4}>×4</option>
            </select>
          </label>
        </div>
        <p className="hint">
          点の数: F2 {meta.x.n} × F1 {meta.y.n}
        </p>
      </Section>
    </>
  );
}

/** 図の高さを、プロットが正方形になるように直す */
function squareFigure() {
  const doc = useEditor.getState().doc;
  if (!doc.plot2d) return;
  edit((d) => {
    if (d.plot2d) d.figure.height = squareHeight(d as unknown as typeof doc, d.plot2d);
  });
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}

/** 表示範囲は 0.01 ppm まで出せば足りる (欄に収まる) */
function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/**
 * ピーク値 (ピークピックアップ)。
 * 自動でピークを拾ってラベルを付け、ppm と高さの一覧にして持ち出せるようにする。
 */
import { useMemo, useState } from 'react';
import { useSync } from '../state/deltaSync';
import { peakRows, peakTableText, peakValuesText } from '../lib/peaks';
import { autoPeakLabels, clearPeakLabels, deletePeakLabel, edit, importDeltaPeaks, notify, select, setTool, useEditor } from '../state/store';
import type { FigureStyle } from '../state/types';
import { Check, NumberInput, Section } from './inputs';

export function PeakPanel() {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  // Delta と同期しているときは自動で入るので、取り込みのボタンは出さない
  const synced = useSync((s) => !!activeLayerId && !!s.links[activeLayerId] && s.links[activeLayerId].status !== 'duplicate');
  const selection = useEditor((s) => s.selection);
  const [threshold, setThreshold] = useState(5);
  const [visibleOnly, setVisibleOnly] = useState(true);
  const layer = doc.layers.find((l) => l.id === activeLayerId);
  const rows = useMemo(() => (layer ? peakRows(doc, data, layer.id) : []), [doc, data, layer]);
  if (!layer) return null;
  const fromDelta = doc.spectra.find((s) => s.id === layer.spectrumId)?.delta?.peaks ?? [];
  const f = doc.figure;
  const set = (patch: Partial<FigureStyle>) =>
    edit((d) => {
      Object.assign(d.figure, patch);
    });

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify(`${what}をコピーしました`);
    } catch (e) {
      notify(`コピーできませんでした: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Section title={`ピーク値${layer.label ? ` — ${layer.label}` : ''} (${rows.length})`}>
      <p className="hint">「自動で拾う」で高いピークにまとめて付きます。ピーク値ツール (P) でクリックすると 1 本ずつ付け外しできます。</p>
      <div className="row wrap">
        <button
          className="primary"
          onClick={() => {
            const n = autoPeakLabels(layer.id, threshold / 100, !visibleOnly);
            notify(n ? `${n} 本のピークにラベルを付けました` : '新しく付けるピークはありませんでした');
          }}
          title="溶媒や不純物のピークも拾います。いらないものは表の × で消せます"
        >
          自動で拾う
        </button>
        <button onClick={() => setTool('peak')} title="クリックで 1 本ずつ付け外し">
          手で付ける
        </button>
        <button className="danger" disabled={!rows.length} onClick={() => clearPeakLabels(layer.id)}>
          全部消す
        </button>
      </div>
      {fromDelta.length > 0 && !synced && (
        <div className="row wrap">
          <button
            title="この .jdf に入っている、Delta で付けたピーク値をそのまま使います"
            onClick={() => {
              const n = importDeltaPeaks(layer.id);
              notify(n ? `Delta のピーク値を ${n} 本取り込みました` : 'すべて取り込み済みです');
            }}
          >
            Delta のピーク値を取り込む ({fromDelta.length})
          </button>
        </div>
      )}
      <div className="row wrap">
        <label className="field" title="一番高いピークの何 % 以上を拾うか">
          高さ
          <NumberInput value={threshold} min={0.1} max={100} step={1} width={52} onCommit={(v) => setThreshold(v ?? 5)} />
          %以上
        </label>
        <Check checked={visibleOnly} onChange={setVisibleOnly}>
          表示範囲だけ
        </Check>
      </div>
      {rows.length > 0 && (
        <>
          <div className="table-wrap">
            <table className="table compact">
              <thead>
                <tr>
                  <th>δ (ppm)</th>
                  <th title="一番高いピークを 100 とした高さ">高さ (%)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={selection?.kind === 'peakLabel' && selection.id === r.id ? 'selected' : ''}
                    onClick={() => select({ kind: 'peakLabel', id: r.id })}
                  >
                    <td className="nowrap">{r.ppm.toFixed(f.peakLabelDecimals)}</td>
                    <td className="nowrap">{r.relative.toFixed(1)}</td>
                    <td>
                      <button
                        className="mini danger"
                        title="このピーク値を消す"
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePeakLabel(r.id);
                        }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row wrap">
            <button onClick={() => copy(peakTableText(rows, f.peakLabelDecimals), '表')} title="Excel に貼れるタブ区切り">
              表をコピー
            </button>
            <button onClick={() => copy(peakValuesText(rows, f.peakLabelDecimals), '値')} title="7.262, 3.451, … の形">
              値だけコピー
            </button>
          </div>
        </>
      )}
      <details className="sub">
        <summary>ピーク値の見た目</summary>
        <div className="row">
          <label className="field">
            小数
            <NumberInput value={f.peakLabelDecimals} min={0} max={4} width={44} onCommit={(v) => set({ peakLabelDecimals: v ?? 3 })} />
          </label>
          <label className="field">
            位置
            <select value={f.peakLabelPlacement} onChange={(e) => set({ peakLabelPlacement: e.target.value as FigureStyle['peakLabelPlacement'] })}>
              <option value="axis">軸の下</option>
              <option value="top">ピークの上</option>
            </select>
          </label>
        </div>
        <p className="hint">文字の大きさは「図の設定」で変えられます。</p>
      </details>
    </Section>
  );
}

import { tr } from '../i18n';
import { useMemo, useState } from 'react';
import { useSync } from '../state/deltaSync';
import { integralValues, isReference } from '../lib/integrals';
import {
  autoDetectSignals,
  importDeltaIntegrals,
  clearIntegrals,
  deleteSelection,
  edit,
  notify,
  select,
  setIntegralValue,
  setTool,
  updateIntegral,
  useEditor,
} from '../state/store';
import type { FigureStyle, Integral } from '../state/types';
import { Check, ColorInput, NumberInput, Section } from './inputs';

/** 選んでいるスペクトルの積分の一覧と、表示の設定 */
export function IntegralPanel() {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  // Delta と同期しているときは自動で入るので、取り込みのボタンは出さない
  const synced = useSync((s) => !!activeLayerId && !!s.links[activeLayerId] && s.links[activeLayerId].status !== 'duplicate');
  const selection = useEditor((s) => s.selection);
  const [threshold, setThreshold] = useState(3);
  const [visibleOnly, setVisibleOnly] = useState(false);
  const { values } = useMemo(() => integralValues(doc, data), [doc, data]);
  const layer = doc.layers.find((l) => l.id === activeLayerId);
  if (!layer) return null;
  const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
  const mine = doc.integrals.filter((x) => x.layerId === layer.id).sort((a, b) => b.from - a.from);
  const fromDelta = meta?.delta?.integrals ?? [];
  const f = doc.figure;
  const set = (patch: Partial<FigureStyle>) =>
    edit((d) => {
      Object.assign(d.figure, patch);
    });
  const off = meta?.refOffset ?? 0;

  return (
    <Section
      title={tr('積分{v0} ({length})', { v0: layer.label ? ` — ${layer.label}` : '', length: mine.length })}
      help={tr('「自動で積分」で信号をまとめて積分します。積分ツール (I) で左右にドラッグすると手でも引けます。値を書き換えると、その積分を基準にほかがそろいます。')}
    >
      <div className="row wrap">
        <button
          title={tr('溶媒の残存ピークと、不純物マーカーを付けたピークは除きます')}
          onClick={() => {
            const n = autoDetectSignals(layer.id, threshold / 100, visibleOnly);
            notify(n ? tr('{n} 個の信号を積分しました。値を1つ書き換えると基準が決まります', { n }) : tr('新しく積分する信号はありませんでした'), 'info', { undo: n > 0 });
          }}
        >
          {tr('自動で積分')}
        </button>
        <button onClick={() => setTool('integral')}>{tr('手で引く')}</button>
        <button className="danger" disabled={!mine.length} onClick={() => clearIntegrals(layer.id)}>
          {tr('全部消す')}
        </button>
      </div>
      {fromDelta.length > 0 && !synced && (
        <div className="row wrap">
          <button
            title={tr('この .jdf に入っている、Delta で引いた積分の範囲をそのまま使います')}
            onClick={() => {
              const n = importDeltaIntegrals(layer.id);
              notify(n ? tr('Delta の積分を {n} 件取り込みました', { n }) : tr('すべて取り込み済みです'));
            }}
          >
            {tr('Delta の積分を取り込む ({n})', { n: fromDelta.length })}
          </button>
        </div>
      )}
      <div className="row wrap">
        <label className="field" title={tr('一番高いピークの何 % 以上を信号とみなすか')}>
          {tr('高さ')}
          <NumberInput value={threshold} min={0.1} max={100} step={1} width={52} onCommit={(v) => setThreshold(v ?? 3)} />
          {tr('%以上')}
        </label>
        <Check checked={visibleOnly} onChange={setVisibleOnly}>
          {tr('表示範囲だけ')}
        </Check>
      </div>
      {mine.length > 0 && (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>{tr('範囲 (ppm)')}</th>
                <th>{tr('値')}</th>
                <th title={tr('この積分を基準にする')}>{tr('基準')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mine.map((x) => (
                <IntegralRow
                  key={x.id}
                  x={x}
                  offset={off}
                  value={values.get(x.id) ?? 0}
                  decimals={f.integralDecimals}
                  isRef={isReference(doc, x)}
                  selected={selection?.kind === 'integral' && selection.id === x.id}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="sub">
        <summary>{tr('積分の見た目')}</summary>
        <div className="row wrap">
          <span title={tr('範囲の両端を結ぶ直線を引いてから足します (Delta と同じ出し方)')}>
            <Check checked={f.integralBaseline !== false} onChange={(v) => set({ integralBaseline: v })}>
              {tr('両端の直線を引く')}
            </Check>
          </span>
        </div>
        <div className="row wrap">
          <Check checked={f.showIntegralCurves} onChange={(v) => set({ showIntegralCurves: v })}>
            {tr('積分曲線')}
          </Check>
          <label className="field">
            {tr('色')}
            <ColorInput value={f.integralColor} onChange={(integralColor) => set({ integralColor })} />
          </label>
        </div>
        <label className="field block">
          {tr('値の位置')}
          <select value={f.integralPlacement} onChange={(e) => set({ integralPlacement: e.target.value as FigureStyle['integralPlacement'] })}>
            <option value="curve">{tr('曲線の上 (Delta 風)')}</option>
            <option value="axis">{tr('軸の下にかぎ括弧で')}</option>
          </select>
        </label>
        <div className="grid2">
          <label className="field">
            {tr('小数')}
            <NumberInput value={f.integralDecimals} min={0} max={4} width={44} onCommit={(v) => set({ integralDecimals: v ?? 2 })} />
          </label>
          <label className="field">
            {tr('文字')}
            <NumberInput value={f.integralFontSize} min={6} max={40} width={44} onCommit={(v) => set({ integralFontSize: v ?? 12 })} />
          </label>
          <label className="field" title={tr('一番大きい積分曲線の高さ (スペクトルの帯に対する割合)')}>
            {tr('曲線の高さ')}
            <NumberInput value={f.integralHeight} min={0.05} max={3} step={0.05} width={52} onCommit={(v) => set({ integralHeight: v ?? 0.5 })} />
          </label>
        </div>
      </details>
    </Section>
  );
}

function IntegralRow({
  x,
  offset,
  value,
  decimals,
  isRef,
  selected,
}: {
  x: Integral;
  offset: number;
  value: number;
  decimals: number;
  isRef: boolean;
  selected: boolean;
}) {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return (
    <tr className={selected ? 'selected' : ''} onClick={() => select({ kind: 'integral', id: x.id })}>
      <td className="nowrap">
        <NumberInput value={r(x.from + offset)} step={0.01} width={52} onCommit={(v) => v !== null && updateIntegral(x.id, { from: v - offset })} />
        –
        <NumberInput value={r(x.to + offset)} step={0.01} width={52} onCommit={(v) => v !== null && updateIntegral(x.id, { to: v - offset })} />
      </td>
      <td>
        <NumberInput
          value={Number(value.toFixed(decimals))}
          step={1}
          width={56}
          title={tr('値を書き換えると、この積分を基準にしてほかをそろえます')}
          onCommit={(v) => v !== null && v !== 0 && setIntegralValue(x.id, v)}
        />
      </td>
      <td>
        <input
          type="radio"
          checked={isRef}
          title={tr('この積分を基準にする')}
          onChange={() => setIntegralValue(x.id, Number(value.toFixed(decimals)) || 1)}
        />
      </td>
      <td>
        <button
          className="mini danger"
          onClick={(e) => {
            e.stopPropagation();
            select({ kind: 'integral', id: x.id });
            deleteSelection();
          }}
        >
          ×
        </button>
      </td>
    </tr>
  );
}

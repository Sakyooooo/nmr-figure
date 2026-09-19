import { useMemo } from 'react';
import { baseName, downloadBlob } from '../lib/exportFigure';
import { computeTrend, trendCsv } from '../lib/trend';
import { edit, setCanvasTab, setTool, useEditor } from '../state/store';
import type { TrendSettings } from '../state/types';
import { Check, ColorInput, NumberInput, Section, TextInput } from './inputs';
import { RichHtml } from './RichText';

export function TrendPanel() {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const tab = useEditor((s) => s.canvasTab);
  const projectName = useEditor((s) => s.projectName);
  const result = useMemo(() => computeTrend(doc, data), [doc, data]);
  if (!doc.layers.length) return null;
  const t = doc.trend;
  const set = (patch: Partial<TrendSettings>) =>
    edit((d) => {
      Object.assign(d.trend, patch);
    });
  const setRegion = (id: string, patch: Record<string, unknown>) =>
    edit((d) => {
      Object.assign(d.trend.regions.find((r) => r.id === id)!, patch);
    });
  const unit = t.timeUnit;

  return (
    <Section title="推移グラフ" defaultOpen={tab === 'trend'}>
      <p className="hint">範囲ツール (G) でスペクトル上を左右にドラッグすると、追跡する範囲を追加できます。時間は左の各スペクトルで入れるか、名前 (例: 24 h) から読み取ります。</p>
      <div className="row wrap">
        <button
          onClick={() => {
            setCanvasTab('spectrum');
            setTool('region');
          }}
        >
          ＋ 範囲を追加
        </button>
        {tab === 'spectrum' ? (
          <button className="primary" onClick={() => setCanvasTab('trend')}>
            グラフを表示
          </button>
        ) : (
          <button onClick={() => setCanvasTab('spectrum')}>スペクトルに戻る</button>
        )}
      </div>

      {t.regions.length > 0 && (
        <table className="table compact regions">
          <thead>
            <tr>
              <th />
              <th>名前</th>
              <th>ppm</th>
              <th title="プロトン数など。この数で割ってから比べます">nH</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.regions.map((r) => (
              <tr key={r.id}>
                <td>
                  <ColorInput value={r.color} onChange={(color) => setRegion(r.id, { color })} />
                </td>
                <td>
                  <TextInput value={r.name} onCommit={(name) => setRegion(r.id, { name })} width="100%" />
                </td>
                <td className="nowrap">
                  <NumberInput value={round(r.from)} step={0.01} width={54} onCommit={(v) => v !== null && setRegion(r.id, { from: v })} />
                  –
                  <NumberInput value={round(r.to)} step={0.01} width={54} onCommit={(v) => v !== null && setRegion(r.id, { to: v })} />
                </td>
                <td>
                  <NumberInput value={r.nH} min={0.01} step={1} width={40} onCommit={(v) => setRegion(r.id, { nH: v ?? 1 })} />
                </td>
                <td>
                  <button
                    className="mini danger"
                    onClick={() =>
                      edit((d) => {
                        d.trend.regions = d.trend.regions.filter((x) => x.id !== r.id);
                        if (d.trend.referenceId === r.id) d.trend.referenceId = null;
                      })
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="grid2">
        <label className="field">
          測り方
          <select value={t.measure} onChange={(e) => set({ measure: e.target.value as TrendSettings['measure'] })}>
            <option value="area">面積</option>
            <option value="height">高さ</option>
          </select>
        </label>
        <label className="field">
          単位
          <TextInput value={unit} onCommit={(timeUnit) => set({ timeUnit })} width={48} />
        </label>
      </div>
      <label className="field block">
        縦軸の値
        <select value={t.normalize} onChange={(e) => set({ normalize: e.target.value as TrendSettings['normalize'] })}>
          <option value="sum">合計を 100% (転化率・生成比)</option>
          <option value="reference">基準の範囲との比 (内部標準)</option>
          <option value="first">最初の時点を 100%</option>
          <option value="none">そのままの値</option>
        </select>
      </label>
      {(t.normalize === 'reference' || t.normalize === 'sum') && (
        <label className="field block">
          {t.normalize === 'reference' ? '基準の範囲' : '合計から除く範囲 (内部標準など)'}
          <select value={t.referenceId ?? ''} onChange={(e) => set({ referenceId: e.target.value || null })}>
            <option value="">{t.normalize === 'reference' ? '選んでください' : 'なし'}</option>
            {t.regions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {result.notes.map((n) => (
        <p key={n} className="hint warn">
          {n}
        </p>
      ))}

      {t.regions.length > 0 && result.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>時間 ({unit})</th>
                {result.series.map((r) => (
                  <th key={r.id} style={{ color: r.color }}>
                    <RichHtml text={r.name} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.layer.id}>
                  <td title={{ set: '入力した時間', label: '名前から読み取った時間', acquired: '測定時刻から求めた時間', order: '並び順' }[row.timeSource]}>
                    {row.time}
                    {row.timeSource !== 'set' && <span className="muted">*</span>}
                  </td>
                  {result.series.map((r) => {
                    const v = row.values[t.regions.indexOf(r)];
                    return <td key={r.id}>{v === null ? '—' : format(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="sub">
        <summary>グラフの見た目</summary>
        <label className="field block">
          横軸のラベル
          <TextInput value={t.xLabel} onCommit={(xLabel) => set({ xLabel })} placeholder={`Time (${unit})`} />
        </label>
        <label className="field block">
          縦軸のラベル
          <TextInput value={t.yLabel} onCommit={(yLabel) => set({ yLabel })} placeholder={result.yLabel} />
        </label>
        <div className="row">
          <label className="field">
            幅
            <NumberInput value={t.width} min={200} max={3000} step={10} width={60} onCommit={(v) => set({ width: v ?? 560 })} />
          </label>
          <label className="field">
            高さ
            <NumberInput value={t.height} min={150} max={3000} step={10} width={60} onCommit={(v) => set({ height: v ?? 380 })} />
          </label>
        </div>
        <Check checked={t.showOnSpectrum} onChange={(v) => set({ showOnSpectrum: v })}>
          スペクトル上に範囲を表示 (書き出しには出ません)
        </Check>
      </details>

      <div className="row">
        <button
          disabled={!t.regions.length}
          onClick={() => {
            const name = (projectName ? baseName(projectName) : 'trend') + '-trend.csv';
            // Excel で文字化けしないよう BOM を付ける
            downloadBlob(new Blob([new Uint8Array([0xef, 0xbb, 0xbf]), trendCsv(result, t.regions)], { type: 'text/csv' }), name);
          }}
        >
          表を CSV で保存
        </button>
      </div>
    </Section>
  );
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}

function format(v: number) {
  return Math.abs(v) >= 100 ? v.toFixed(1) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3);
}

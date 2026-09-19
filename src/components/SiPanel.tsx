import { useMemo } from 'react';
import { copyRichText } from '../lib/exportFigure';
import { buildSiEntries, formatSi, type SiEntry, type SiSignal } from '../lib/siText';
import { autoDetectSignals, notify, select, setSiOptions, setTool, updateIntegralSi, useEditor } from '../state/store';
import { Check, NumberInput, Section, TextInput } from './inputs';

const MULTS = ['s', 'br s', 'd', 't', 'q', 'quint', 'sext', 'sept', 'dd', 'dt', 'td', 'tt', 'ddd', 'dq', 'qd', 'm'];

/** 論文の Supporting Information に貼る文 (例: ¹H NMR (400 MHz, C₆D₆) δ 1.33 (d, J = 6.8 Hz, 12H)) */
export function SiPanel() {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const settings = useEditor((s) => s.settings);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const entries = useMemo(() => buildSiEntries(doc, data, settings), [doc, data, settings]);
  const formatted = useMemo(() => entries.map((e) => ({ entry: e, ...formatSi(e, doc.si) })), [entries, doc.si]);
  if (!doc.layers.length) return null;
  const active = entries.find((e) => e.layerId === activeLayerId);
  const layer = doc.layers.find((l) => l.id === activeLayerId);
  const o = doc.si;

  const copy = async (rich: boolean) => {
    const html = formatted.map((f) => `<p>${f.html}</p>`).join('');
    const text = formatted.map((f) => f.text).join('\n');
    try {
      if (rich) await copyRichText(html, text);
      else await navigator.clipboard.writeText(text);
      notify(rich ? 'コピーしました。Word に貼ると上付き・下付き・斜体の J が残ります' : 'テキストでコピーしました');
    } catch (e) {
      notify(`コピーできませんでした: ${(e as Error).message}`, 'error');
    }
  };

  return (
    <Section title="SI 用テキスト" defaultOpen={false}>
      <p className="hint">
        ¹H は積分した範囲ごとに、多重度と J を自動で読みます (重なった信号は m)。¹³C などは積分がなければピーク値、それもなければ自動で拾ったピークを並べます。違うところは表で直せます。
      </p>

      {layer && active && (
        <>
          <div className="row wrap">
            {active.nucleus === '1H' && (
              <button
                onClick={() => {
                  const n = autoDetectSignals(layer.id);
                  notify(n ? `${n} 個の信号を積分しました。値を1つ書き換えて基準を決めてください` : '新しく見つかった信号はありません');
                }}
                title="溶媒と、不純物マーカーを付けたピークは除きます"
              >
                信号を自動で積分
              </button>
            )}
            <button onClick={() => setTool('integral')}>積分を手で引く</button>
          </div>
          {active.source === 'integrals' ? (
            <SignalTable entry={active} decimals={active.nucleus === '1H' ? o.hDecimals : o.xDecimals} />
          ) : (
            <p className="hint">
              {active.source === 'none'
                ? active.nucleus === '1H'
                  ? '積分がありません。「信号を自動で積分」を押すか、積分ツールで範囲を引いてください。'
                  : 'ピークが見つかりません。'
                : active.source === 'labels'
                  ? `ピーク値ラベル ${active.signals.length} 個を並べています。`
                  : `自動で拾ったピーク ${active.signals.length} 個を並べています (溶媒・不純物マーカーは除く)。P–P などで分裂している信号は、積分ツールで範囲を引くと d, t などとして1つにまとまります。`}
            </p>
          )}
        </>
      )}

      <details className="sub">
        <summary>書き方</summary>
        <div className="grid2">
          <label className="field" title="¹H の δ の小数桁">
            δ (¹H)
            <NumberInput value={o.hDecimals} min={0} max={4} width={44} onCommit={(v) => setSiOptions({ hDecimals: v ?? 2 })} />
          </label>
          <label className="field" title="¹³C などの δ の小数桁">
            δ (他)
            <NumberInput value={o.xDecimals} min={0} max={4} width={44} onCommit={(v) => setSiOptions({ xDecimals: v ?? 1 })} />
          </label>
          <label className="field">
            J
            <NumberInput value={o.jDecimals} min={0} max={3} width={44} onCommit={(v) => setSiOptions({ jDecimals: v ?? 1 })} />
          </label>
        </div>
        <div className="row wrap">
          <Check checked={o.includeTemp} onChange={(v) => setSiOptions({ includeTemp: v })}>
            温度 (K)
          </Check>
          <Check checked={o.includeAssign} onChange={(v) => setSiOptions({ includeAssign: v })}>
            帰属
          </Check>
        </div>
      </details>

      <div className="si-output" aria-label="SI テキスト">
        {formatted.length ? formatted.map((f) => <p key={f.entry.layerId} dangerouslySetInnerHTML={{ __html: f.html }} />) : <p className="muted">表示中のスペクトルがありません</p>}
      </div>
      <div className="row wrap">
        <button className="primary" disabled={!formatted.length} onClick={() => void copy(true)} title="上付き・下付き・斜体を残したままコピー">
          Word 用にコピー
        </button>
        <button disabled={!formatted.length} onClick={() => void copy(false)} title="¹H, C₆D₆ などは Unicode の文字になります">
          テキストでコピー
        </button>
      </div>
      <p className="hint">表示中のスペクトルすべて (¹H → ¹³C → ¹⁹F → ³¹P の順) をまとめて出します。</p>
    </Section>
  );
}

function SignalTable({ entry, decimals }: { entry: SiEntry; decimals: number }) {
  const selection = useEditor((s) => s.selection);
  return (
    <div className="table-wrap">
      <table className="table compact si-table">
        <thead>
          <tr>
            <th>δ</th>
            <th>多重度</th>
            <th>J (Hz)</th>
            {entry.nucleus === '1H' && <th>nH</th>}
            <th>帰属</th>
          </tr>
        </thead>
        <tbody>
          {entry.signals.map((s) => (
            <SignalRow
              key={s.integralId}
              s={s}
              isH={entry.nucleus === '1H'}
              decimals={decimals}
              selected={selection?.kind === 'integral' && selection.id === s.integralId}
            />
          ))}
        </tbody>
      </table>
      <datalist id="si-mults">
        {MULTS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
    </div>
  );
}

function SignalRow({ s, isH, decimals, selected }: { s: SiSignal; isH: boolean; decimals: number; selected: boolean }) {
  const id = s.integralId!;
  const changed = s.mult !== s.auto.mult;
  return (
    <tr className={selected ? 'selected' : ''} onClick={() => select({ kind: 'integral', id })}>
      <td className="nowrap">{s.range ? `${s.range[0].toFixed(decimals)}–${s.range[1].toFixed(decimals)}` : s.delta.toFixed(decimals)}</td>
      <td>
        <TextInput
          list="si-mults"
          value={s.mult}
          placeholder={s.auto.mult || '—'}
          title={changed ? `自動判定: ${s.auto.mult || 'なし'}` : '自動判定'}
          className={changed ? 'edited' : ''}
          width={52}
          onCommit={(mult) => updateIntegralSi(id, { mult, J: undefined })}
        />
      </td>
      <td>
        <TextInput
          value={s.J.map((j) => j.toFixed(1)).join(', ')}
          placeholder={s.mult === 'm' || s.mult === 's' ? '—' : '7.2, 1.5'}
          width={70}
          onCommit={(v) => {
            const list = v
              .split(/[,、\s]+/)
              .filter(Boolean)
              .map(Number)
              .filter((n) => Number.isFinite(n) && n > 0)
              .sort((a, b) => b - a);
            updateIntegralSi(id, { J: list.length ? list : undefined });
          }}
        />
      </td>
      {isH && (
        <td>
          <NumberInput value={s.nH} allowEmpty min={1} step={1} width={44} placeholder={String(s.auto.nH ?? '')} onCommit={(v) => updateIntegralSi(id, { nH: v })} />
        </td>
      )}
      <td>
        <TextInput value={s.assign} placeholder="OCH_{3}" width={64} onCommit={(assign) => updateIntegralSi(id, { assign })} />
      </td>
    </tr>
  );
}

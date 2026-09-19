import type { SolventKey } from '../lib/impurityTypes';
import { nucleusRich } from '../lib/nuclei';
import { labReference } from '../lib/settings';
import { SOLVENTS } from '../lib/solvents';
import { parseTime } from '../lib/trend';
import { tidyCitation } from '../lib/citation';
import { edit, fitY, fullRange, moveLayer, notify, openSiImport, removeLayer, setTool, setView, useEditor } from '../state/store';
import { Check, ColorInput, NumberInput, Section, TextInput } from './inputs';
import { RichHtml } from './RichText';

export function LayerPanel() {
  const doc = useEditor((s) => s.doc);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const settings = useEditor((s) => s.settings);

  return (
    <Section title={`スペクトル (${doc.layers.length})`}>
      {!doc.layers.length && <p className="hint">.jdf をドロップするか「開く」で読み込みます。複数選べます。</p>}
      <ol className="layers">
        {doc.layers.map((layer, i) => {
          const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
          if (!meta) return null;
          const ref = labReference(settings, meta.solvent, meta.nucleus);
          const setLayer = (patch: Partial<typeof layer>) =>
            edit((d) => {
              Object.assign(d.layers.find((l) => l.id === layer.id)!, patch);
            });
          const setMeta = (patch: Partial<typeof meta>) =>
            edit((d) => {
              Object.assign(d.spectra.find((s) => s.id === meta.id)!, patch);
            });
          return (
            <li
              key={layer.id}
              className={layer.id === activeLayerId ? 'active' : ''}
              onPointerDown={() => useEditor.setState({ activeLayerId: layer.id })}
            >
              <div className="row">
                <ColorInput value={layer.color} onChange={(color) => setLayer({ color })} title="線の色" />
                <input type="checkbox" checked={layer.visible} title="表示" onChange={(e) => setLayer({ visible: e.target.checked })} />
                <span className="file" title={`${meta.fileName}\n${meta.title}`}>
                  {meta.fileName}
                </span>
                <button className="mini" onClick={() => moveLayer(layer.id, -1)} disabled={i === 0} title="上へ">
                  ↑
                </button>
                <button className="mini" onClick={() => moveLayer(layer.id, 1)} disabled={i === doc.layers.length - 1} title="下へ">
                  ↓
                </button>
                <button className="mini danger" onClick={() => removeLayer(layer.id)} title="図から外す">
                  ×
                </button>
              </div>
              <div className="row">
                <label className="field grow">
                  名前
                  <TextInput value={layer.label} onCommit={(label) => setLayer({ label })} placeholder="例: 0 h, SM" />
                </label>
              </div>
              <div className="row">
                <label className="field" title="推移グラフの横軸。空欄なら名前の数値を使います">
                  時間
                  <NumberInput
                    value={layer.time ?? null}
                    allowEmpty
                    step={0.5}
                    width={52}
                    placeholder={String(parseTime(layer.label) ?? (meta.acquiredAt ? '自動' : i))}
                    onCommit={(time) => setLayer({ time })}
                  />
                  <span className="unit">{doc.trend.timeUnit}</span>
                </label>
              </div>
              <div className="row">
                <label className="field">
                  倍率
                  <NumberInput value={layer.scale} step={0.1} min={0.01} width={56} onCommit={(v) => setLayer({ scale: v ?? 1 })} />
                </label>
                <label className="field">
                  線幅
                  <NumberInput value={layer.lineWidth} step={0.25} min={0.25} max={5} width={50} onCommit={(v) => setLayer({ lineWidth: v ?? 1 })} />
                </label>
              </div>
              <div className="row meta">
                <span>
                  <RichHtml text={nucleusRich(meta.nucleus)} /> · {meta.freqMHz.toFixed(1)} MHz
                </span>
                <select
                  value={meta.solvent ?? ''}
                  title={`ファイルの溶媒: ${meta.solventRaw || '(なし)'}`}
                  onChange={(e) => setMeta({ solvent: (e.target.value || null) as SolventKey | null })}
                >
                  <option value="">溶媒不明</option>
                  {SOLVENTS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.key}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row meta">
                <span title="基準合わせで加えた量">
                  補正 {meta.refOffset >= 0 ? '+' : ''}
                  {meta.refOffset.toFixed(3)} ppm
                </span>
                <button
                  className="mini"
                  onClick={() => {
                    useEditor.setState({ activeLayerId: layer.id });
                    setTool('reference');
                  }}
                  title={ref !== null ? `溶媒ピークをクリックして ${ref} ppm に合わせる` : 'ピークをクリックして値を指定'}
                >
                  基準合わせ
                </button>
                {meta.refOffset !== 0 && (
                  <button className="mini" onClick={() => setMeta({ refOffset: 0 })}>
                    戻す
                  </button>
                )}
              </div>
              {meta.simulated && (
                <div className="row meta">
                  <label className="field grow" title="図の下に出る引用元。ここで直せます">
                    引用
                    <TextInput
                      value={meta.simulated.citation}
                      onCommit={(citation) => setMeta({ simulated: { ...meta.simulated!, citation } })}
                    />
                  </label>
                  <button
                    className="mini"
                    title="貼り付けた引用を、図に出す形 (著者 et al. 誌名 年, 巻, 頁.) に整えます"
                    onClick={() => {
                      const tidied = tidyCitation(meta.simulated!.citation);
                      setMeta({ simulated: { ...meta.simulated!, citation: tidied.text } });
                      notify(tidied.formatted ? '引用元を整えました' : '著者・誌名・年を読み取れませんでした', tidied.formatted ? 'info' : 'error');
                    }}
                  >
                    整える
                  </button>
                </div>
              )}
              {meta.simulated && (
                <div className="row meta">
                  <button
                    className="mini"
                    title="SI の文・線幅・文献の図を直して、このスペクトルを作り直します"
                    onClick={() => openSiImport(meta.id)}
                  >
                    文献データを直す
                  </button>
                  <span className="muted" title={meta.simulated.text}>
                    {meta.simulated.fromImage ? '図から線幅を読み取り済み' : `線幅 ${meta.simulated.lineWidthHz} Hz`}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

export function ViewPanel() {
  const view = useEditor((s) => s.doc.view);
  const mode = useEditor((s) => s.doc.figure.mode);
  const n = useEditor((s) => s.doc.layers.length);
  if (!n) return null;
  return (
    <Section title="表示範囲">
      <div className="row">
        <label className="field">
          左端
          <NumberInput value={round(view.xMax)} step={0.5} width={70} onCommit={(v) => v !== null && setView({ xMax: v })} />
        </label>
        <label className="field">
          右端
          <NumberInput value={round(view.xMin)} step={0.5} width={70} onCommit={(v) => v !== null && setView({ xMin: v })} />
        </label>
        <span className="unit">ppm</span>
      </div>
      <div className="row">
        <label className="field">
          縦倍率
          <NumberInput value={round(view.yZoom)} step={0.1} min={0.01} width={70} onCommit={(v) => v !== null && setView({ yZoom: v })} />
        </label>
        <button onClick={fitY}>自動</button>
        <button onClick={fullRange}>全体</button>
      </div>
      {n > 1 && (
        <div className="row">
          <Check
            checked={mode === 'stack'}
            onChange={(v) =>
              edit((d) => {
                d.figure.mode = v ? 'stack' : 'overlay';
              })
            }
          >
            縦に並べる (オフで重ね書き)
          </Check>
        </div>
      )}
      <p className="hint">
        高さツール (H) で図の上を上下にドラッグすると、全部のスペクトルが高くなります (Shift を押しながらでそのスペクトルだけ)。ツールバーの ↑ ↓ ボタンでも変わります。
        ホイールで横に拡大縮小、Shift+ホイールで縦。選択ツールで背景を左右にドラッグすると移動します。
      </p>
    </Section>
  );
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}

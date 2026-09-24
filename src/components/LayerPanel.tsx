import { locale, tr } from '../i18n';
import type { SolventKey } from '../lib/impurityTypes';
import { nucleusRich } from '../lib/nuclei';
import { labReference } from '../lib/settings';
import { SOLVENTS } from '../lib/solvents';
import { parseTime } from '../lib/trend';
import { tidyCitation } from '../lib/citation';
import { openDialog } from '../state/fileOps';
import { edit, fitY, fullRange, moveLayer, notify, openSiImport, removeLayer, scaleY, setTool, setView, useEditor } from '../state/store';
import type { Layer, SpectrumMeta } from '../state/types';
import { Icon } from './Icon';
import { Check, ColorInput, NumberInput, TextInput } from './inputs';
import { RichHtml } from './RichText';
import { IconButton, MenuButton } from './ui';

const clock = (t: number) => new Date(t).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/**
 * 左のパネル: スペクトルの一覧 (色・名前・核種と溶媒・表示の切り替え・その他) と、選んでいるスペクトルの設定。
 * 1 本ごとに入力欄を並べず、選んだものの設定だけを一覧の下に出す
 */
export function LayerPanel() {
  const doc = useEditor((s) => s.doc);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const active = doc.layers.find((l) => l.id === activeLayerId);
  const activeMeta = active && doc.spectra.find((s) => s.id === active.spectrumId);

  return (
    <section className="layer-panel" aria-label={tr('スペクトル')}>
      <div className="panel-head">
        <h2>{tr('スペクトル')}</h2>
        <span className="count">{doc.layers.length}</span>
        <span className="grow" />
        <MenuButton
          label={tr('スペクトルを足す')}
          className="ibtn sm"
          placement="bottom-end"
          items={[
            { label: tr('測定のファイルを開いて足す'), icon: 'folder-open', shortcut: 'Ctrl+O', onSelect: () => void openDialog('add') },
            { label: tr('文献値から作図'), icon: 'book-open', hint: tr('SI の NMR データから比較用のスペクトルを作ります'), onSelect: () => openSiImport() },
          ]}
        >
          <Icon name="plus" size={16} />
        </MenuButton>
      </div>
      <ol className="layer-list">
        {doc.layers.map((layer, i) => {
          const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
          if (!meta) return null;
          return <LayerRow key={layer.id} layer={layer} meta={meta} index={i} count={doc.layers.length} active={layer.id === activeLayerId} />;
        })}
      </ol>
      {active && activeMeta && <LayerDetails layer={active} meta={activeMeta} index={doc.layers.indexOf(active)} />}
    </section>
  );
}

function LayerRow({ layer, meta, index, count, active }: { layer: Layer; meta: SpectrumMeta; index: number; count: number; active: boolean }) {
  const setLayer = (patch: Partial<Layer>) =>
    edit((d) => {
      Object.assign(d.layers.find((l) => l.id === layer.id)!, patch);
    });
  const choose = () => useEditor.setState({ activeLayerId: layer.id });
  const name = layer.label || meta.fileName;
  return (
    <li className={`layer-row${active ? ' on' : ''}${layer.visible ? '' : ' hidden-layer'}`}>
      <ColorInput value={layer.color} onChange={(color) => setLayer({ color })} title={tr('{name} の線の色', { name })} />
      <button type="button" className="layer-name" onClick={choose} aria-current={active ? 'true' : undefined} title={`${meta.fileName}\n${meta.title}`}>
        <span className="name">{name}</span>
        <span className="meta">
          <RichHtml text={nucleusRich(meta.nucleus)} />
          {meta.solvent ? ` · ${meta.solvent}` : ''}
          {meta.acquiredAt ? ` · ${clock(meta.acquiredAt)}` : ''}
          {meta.simulated ? tr(' · 文献値') : ''}
        </span>
      </button>
      <IconButton
        icon={layer.visible ? 'eye' : 'eye-off'}
        size="sm"
        label={layer.visible ? tr('{name} を隠す', { name }) : tr('{name} を表示する', { name })}
        onClick={() => setLayer({ visible: !layer.visible })}
      />
      <MenuButton
        label={tr('{name} の操作', { name })}
        className="ibtn sm"
        placement="bottom-end"
        items={[
          { label: tr('上へ'), icon: 'arrow-up', disabled: index === 0, onSelect: () => moveLayer(layer.id, -1) },
          { label: tr('下へ'), icon: 'arrow-down', disabled: index === count - 1, onSelect: () => moveLayer(layer.id, 1) },
          {
            label: tr('基準合わせ'),
            icon: 'nmr-reference',
            hint: tr('溶媒ピークをクリックして合わせる'),
            onSelect: () => {
              choose();
              setTool('reference');
            },
          },
          'divider',
          { label: tr('図から外す'), icon: 'x', onSelect: () => removeLayer(layer.id) },
        ]}
      >
        <Icon name="more" size={16} />
      </MenuButton>
    </li>
  );
}

/** 選んでいるスペクトルの設定 (名前・時間・倍率・線幅・溶媒・基準の補正・文献の引用) */
function LayerDetails({ layer, meta, index }: { layer: Layer; meta: SpectrumMeta; index: number }) {
  const settings = useEditor((s) => s.settings);
  const timeUnit = useEditor((s) => s.doc.trend.timeUnit);
  const ref = labReference(settings, meta.solvent, meta.nucleus);
  const setLayer = (patch: Partial<Layer>) =>
    edit((d) => {
      Object.assign(d.layers.find((l) => l.id === layer.id)!, patch);
    });
  const setMeta = (patch: Partial<SpectrumMeta>) =>
    edit((d) => {
      Object.assign(d.spectra.find((s) => s.id === meta.id)!, patch);
    });
  return (
    <div className="layer-details" aria-label={tr('選んでいるスペクトルの設定')}>
      <div className="field-grid">
        <label htmlFor="layer-label">{tr('名前')}</label>
        <TextInput id="layer-label" value={layer.label} onCommit={(label) => setLayer({ label })} placeholder={tr('例: 0 h, SM')} />

        <span title={tr('推移グラフの横軸。空欄なら名前の数値を使います')}>{tr('時間')}</span>
        <span className="row">
          <NumberInput
            value={layer.time ?? null}
            allowEmpty
            step={0.5}
            width={72}
            title={tr('時間 ({timeUnit})。空欄なら名前か測定時刻から', { timeUnit })}
            placeholder={String(parseTime(layer.label) ?? (meta.acquiredAt ? tr('自動') : index))}
            onCommit={(time) => setLayer({ time })}
          />
          <span className="muted">{timeUnit}</span>
        </span>

        <span>{tr('倍率')}</span>
        <span className="row">
          <NumberInput value={layer.scale} step={0.1} min={0.01} width={64} title={tr('倍率')} onCommit={(v) => setLayer({ scale: v ?? 1 })} />
          <span className="muted">{tr('線幅')}</span>
          <NumberInput value={layer.lineWidth} step={0.25} min={0.25} max={5} width={56} title={tr('線幅')} onCommit={(v) => setLayer({ lineWidth: v ?? 1 })} />
        </span>

        <span>{tr('溶媒')}</span>
        <select
          value={meta.solvent ?? ''}
          aria-label={tr('溶媒')}
          title={tr('ファイルの溶媒: {v0}', { v0: meta.solventRaw || tr('(なし)') })}
          onChange={(e) => setMeta({ solvent: (e.target.value || null) as SolventKey | null })}
        >
          <option value="">{tr('溶媒不明')}</option>
          {SOLVENTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.key}
            </option>
          ))}
        </select>

        <span title={tr('基準合わせで加えた量')}>{tr('補正')}</span>
        <span className="row">
          <span className="num">
            {meta.refOffset >= 0 ? '+' : ''}
            {meta.refOffset.toFixed(3)} ppm
          </span>
          <button
            type="button"
            className="mini"
            onClick={() => setTool('reference')}
            title={ref !== null ? tr('溶媒ピークをクリックして {ref} ppm に合わせる', { ref }) : tr('ピークをクリックして値を指定')}
          >
            {tr('基準合わせ')}
          </button>
          {meta.refOffset !== 0 && (
            <button type="button" className="mini" onClick={() => setMeta({ refOffset: 0 })}>
              {tr('戻す')}
            </button>
          )}
        </span>
      </div>
      <p className="muted file-line" title={meta.fileName}>
        <RichHtml text={nucleusRich(meta.nucleus)} /> · {meta.freqMHz.toFixed(1)} MHz · {meta.fileName}
      </p>
      {meta.simulated && (
        <div className="stack">
          <label className="field block">
            {tr('引用 (図の下に出る)')}
            <TextInput value={meta.simulated.citation} onCommit={(citation) => setMeta({ simulated: { ...meta.simulated!, citation } })} />
          </label>
          <div className="row wrap">
            <button
              type="button"
              className="mini"
              title={tr('貼り付けた引用を、図に出す形 (著者 et al. 誌名 年, 巻, 頁.) に整えます')}
              onClick={() => {
                const tidied = tidyCitation(meta.simulated!.citation);
                setMeta({ simulated: { ...meta.simulated!, citation: tidied.text } });
                notify(tidied.formatted ? tr('引用元を整えました') : tr('著者・誌名・年を読み取れませんでした'), tidied.formatted ? 'info' : 'error');
              }}
            >
              {tr('引用を整える')}
            </button>
            <button type="button" className="mini" title={tr('SI の文・線幅・文献の図を直して、このスペクトルを作り直します')} onClick={() => openSiImport(meta.id)}>
              {tr('文献データを直す')}
            </button>
            <span className="muted" title={meta.simulated.text}>
              {meta.simulated.fromImage ? tr('図から線幅を読み取り済み') : tr('線幅 {lineWidthHz} Hz', { lineWidthHz: meta.simulated.lineWidthHz })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** 表示範囲 (左端・右端・縦倍率) と並べ方 */
export function ViewPanel() {
  const view = useEditor((s) => s.doc.view);
  const mode = useEditor((s) => s.doc.figure.mode);
  const n = useEditor((s) => s.doc.layers.length);
  if (!n) return null;
  return (
    <section className="view-panel" aria-label={tr('表示範囲')}>
      <div className="panel-head">
        <h2>{tr('表示範囲')}</h2>
      </div>
      <div className="field-grid">
        <span>{tr('範囲')}</span>
        <span className="row">
          <NumberInput value={round2(view.xMax)} step={0.5} width={72} title={tr('左端 (ppm)')} onCommit={(v) => v !== null && setView({ xMax: v })} />
          <span className="muted">–</span>
          <NumberInput value={round2(view.xMin)} step={0.5} width={72} title={tr('右端 (ppm)')} onCommit={(v) => v !== null && setView({ xMin: v })} />
          <span className="muted">ppm</span>
        </span>
        <span>{tr('縦倍率')}</span>
        <span className="row">
          <NumberInput value={round(view.yZoom)} step={0.1} min={0.01} width={64} title={tr('縦倍率')} onCommit={(v) => v !== null && setView({ yZoom: v })} />
          <IconButton icon="arrow-up" size="sm" label={tr('高くする (小さいピークを見やすく)')} onClick={() => scaleY(1.5)} />
          <IconButton icon="arrow-down" size="sm" label={tr('低くする')} onClick={() => scaleY(1 / 1.5)} />
        </span>
      </div>
      <div className="row wrap">
        <button type="button" className="mini" onClick={fitY} title={tr('表示範囲の最大ピークに合わせる (F)')}>
          {tr('縦を自動')}
        </button>
        <button type="button" className="mini" onClick={fullRange} title={tr('全体を表示 (0)')}>
          {tr('全体')}
        </button>
      </div>
      {n > 1 && (
        <Check
          checked={mode === 'stack'}
          onChange={(v) =>
            edit((d) => {
              d.figure.mode = v ? 'stack' : 'overlay';
            })
          }
        >
          {tr('縦に並べる (オフで重ね書き)')}
        </Check>
      )}
      <p className="muted">{tr('ホイールで横に拡大縮小、Shift+ホイールで縦')}</p>
    </section>
  );
}

function round(v: number) {
  return Math.round(v * 1000) / 1000;
}

/** 表示範囲は 0.01 ppm まで出せば足りる (欄に収まる) */
function round2(v: number) {
  return Math.round(v * 100) / 100;
}

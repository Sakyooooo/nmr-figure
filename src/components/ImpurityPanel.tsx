import { useMemo, useState } from 'react';
import { findImpurityCandidates, type ImpurityCandidate } from '../lib/impurities';
import { labReference, toleranceFor } from '../lib/settings';
import { solventInfo } from '../lib/solvents';
import { findPeaks, maxInRange, noiseLevel } from '../lib/spectrum';
import { addMarkerStyle, edit, isImpurityMarked, removeMarkerStyle, setTool, toggleImpurity, useEditor } from '../state/store';
import type { MarkerShape } from '../state/types';
import { Check, ColorInput, NumberInput, Section, TextInput } from './inputs';
import { RichHtml } from './RichText';

const SHOW_LIMIT = 12;

export function ImpurityPanel() {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const settings = useEditor((s) => s.settings);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const [snr, setSnr] = useState(8);
  const [showAll, setShowAll] = useState(false);

  const layer = doc.layers.find((l) => l.id === activeLayerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const arr = meta && data[meta.id];
  const { xMin, xMax } = doc.view;

  const result = useMemo(() => {
    if (!meta || !arr || !meta.solvent) return null;
    const noise = noiseLevel(arr);
    const floor = Math.max(noise * snr, maxInRange(arr, meta, xMin, xMax) * 0.002);
    const peaks = findPeaks(arr, meta, xMin, xMax, floor);
    const ref = labReference(settings, meta.solvent, meta.nucleus);
    const candidates = findImpurityCandidates(peaks, {
      nucleus: meta.nucleus,
      solvent: meta.solvent,
      labReference: ref,
      tolerance: toleranceFor(settings, meta.nucleus),
      custom: settings.customImpurities,
    });
    return { candidates, ref, peakCount: peaks.length };
  }, [meta, arr, xMin, xMax, snr, settings]);

  if (!layer || !meta) return null;
  const solvent = solventInfo(meta.solvent);
  const title = `不純物の候補${layer.label ? ` — ${layer.label}` : ''}`;

  if (!solvent || !result) {
    return (
      <Section title={title}>
        <p className="hint">左の一覧で溶媒を選ぶと、不純物の候補を表示します。</p>
      </Section>
    );
  }
  const { candidates, ref } = result;
  const shown = showAll ? candidates : candidates.slice(0, SHOW_LIMIT);

  return (
    <Section title={title}>
      <p className="hint">
        <RichHtml text={solvent.label} /> · 基準 {ref ?? '—'} ppm · 許容幅 ±{toleranceFor(settings, meta.nucleus)} ppm · 表示範囲のピーク {result.peakCount} 本
      </p>
      <div className="row">
        <label className="field" title="ノイズの何倍以上をピークとみなすか">
          検出感度 S/N
          <NumberInput value={snr} min={2} max={200} step={1} width={52} onCommit={(v) => setSnr(v ?? 8)} />
        </label>
      </div>
      {!candidates.length && <p className="hint">一致する不純物はありませんでした。</p>}
      <ul className="candidates">
        {shown.map((c) => (
          <CandidateRow key={c.compoundId} cand={c} layerId={layer.id} checked={isImpurityMarked(doc, layer.id, c.compoundId)} />
        ))}
      </ul>
      {candidates.length > SHOW_LIMIT && (
        <button className="link" onClick={() => setShowAll(!showAll)}>
          {showAll ? '一致の少ない候補を隠す' : `ほかの候補も表示 (${candidates.length - SHOW_LIMIT})`}
        </button>
      )}
    </Section>
  );
}

function CandidateRow({ cand, layerId, checked }: { cand: ImpurityCandidate; layerId: string; checked: boolean }) {
  const fmt = (e: ImpurityCandidate['signals'][number]['expected']) => (typeof e === 'number' ? e.toFixed(2) : `${e[0].toFixed(2)}–${e[1].toFixed(2)}`);
  const full = cand.matched === cand.signals.length;
  return (
    <li className={full ? '' : 'partial'}>
      <label className="check">
        <input type="checkbox" checked={checked} onChange={(e) => toggleImpurity(layerId, cand, e.target.checked)} />
        <span className="name">
          <RichHtml text={cand.name} />
        </span>
        <span className="score">
          {cand.matched}/{cand.signals.length}
        </span>
      </label>
      <div className="signals">
        {cand.signals.map((s, i) => (
          <span key={i} className={s.observed ? 'hit' : 'miss'} title={s.group}>
            {fmt(s.expected)}
            {s.observed ? ` → ${s.observed.ppm.toFixed(2)}` : ' → なし'}
          </span>
        ))}
      </div>
    </li>
  );
}

const SHAPE_LABEL: Record<MarkerShape, string> = {
  circle: '●',
  square: '■',
  triangle: '▲',
  invtriangle: '▼',
  diamond: '◆',
  star: '★',
};

export function MarkerPanel() {
  const styles = useEditor((s) => s.doc.markerStyles);
  const markers = useEditor((s) => s.doc.markers);
  const showLegend = useEditor((s) => s.doc.figure.showLegend);
  const activeId = useEditor((s) => s.activeMarkerStyleId);
  const hasData = useEditor((s) => s.doc.layers.length > 0);
  if (!hasData) return null;
  const setStyle = (id: string, patch: Record<string, unknown>) =>
    edit((d) => {
      Object.assign(d.markerStyles.find((s) => s.id === id)!, patch);
    });

  return (
    <Section
      title="マーカー・凡例"
      help={
        <>
          色を選んでからピークをクリックすると付け外しできます。名前を入れるとその色が凡例に出ます (空のままなら出ません)。
          名前は H_{'{2}'}O のように書くと下付きになります。
        </>
      }
    >
      <ul className="marker-styles">
        {styles.map((s) => (
          <li key={s.id} className={s.id === activeId ? 'active' : ''}>
            <input
              type="radio"
              name="marker-style"
              checked={s.id === activeId}
              title="この種類でマーカーを付ける"
              onChange={() => {
                useEditor.setState({ activeMarkerStyleId: s.id });
                setTool('marker');
              }}
            />
            <select value={s.shape} onChange={(e) => setStyle(s.id, { shape: e.target.value })} style={{ color: s.color }}>
              {Object.entries(SHAPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <ColorInput value={s.color} onChange={(color) => setStyle(s.id, { color })} />
            <TextInput value={s.name} onCommit={(name) => setStyle(s.id, { name })} width="100%" placeholder="名前 (凡例に出す)" />
            <span className="count" title="付いているマーカーの数">
              {markers.filter((m) => m.styleId === s.id).length}
            </span>
            <button className="mini danger" onClick={() => removeMarkerStyle(s.id)} title="この種類とマーカーを削除">
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="row">
        <button
          onClick={() => {
            addMarkerStyle('生成物');
            setTool('marker');
          }}
        >
          ＋ 種類を追加
        </button>
        <Check
          checked={showLegend}
          onChange={(v) =>
            edit((d) => {
              d.figure.showLegend = v;
            })
          }
        >
          凡例を表示
        </Check>
      </div>
    </Section>
  );
}

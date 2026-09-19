import { useRef } from 'react';
import type { Processing } from '../lib/fid';
import { autoPhaseSpectrum, autoReference, beginGesture, endGesture, notify, setPivot, setProcessing, useEditor } from '../state/store';
import { Check, NumberInput, Section } from './inputs';

/** このアプリで FT した FID の、位相・線幅・ベースラインの調整 */
export function ProcessingPanel() {
  const doc = useEditor((s) => s.doc);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const hasFid = useEditor((s) => s.fids);
  const layer = doc.layers.find((l) => l.id === activeLayerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  if (!meta?.processing) return null;
  const p = meta.processing;
  const id = meta.id;
  const canRedo = !!hasFid[id];
  const set = (patch: Partial<Processing>) => setProcessing(id, patch);

  return (
    <Section title="FID の処理 (位相補正)">
      <p className="hint">
        Delta で処理していない生データ (FID) を、このアプリで FT しました。位相がずれていたら、自動で合わせ直すかスライダーで調整してください。
      </p>
      {!canRedo && <p className="hint warn">元の FID がないため、調整できません (古い形式で保存した図です)。</p>}
      <div className="row wrap">
        <button className="primary" disabled={!canRedo} onClick={() => autoPhaseSpectrum(id)}>
          位相を自動で合わせる
        </button>
        <button
          onClick={() => {
            const ok = autoReference(id);
            notify(ok ? '溶媒ピークで基準を合わせました' : '溶媒ピークが見つかりませんでした。「基準合わせ」ツールで合わせてください', ok ? 'info' : 'error');
          }}
          disabled={!meta.solvent}
          title="研究室の基準値 (設定) に合わせます"
        >
          溶媒で基準合わせ
        </button>
      </div>
      <PhaseSlider label="0次" value={p.ph0} min={-180} max={180} disabled={!canRedo} onChange={(ph0) => set({ ph0 })} />
      <PhaseSlider label="1次" value={p.ph1} min={-180} max={180} disabled={!canRedo} onChange={(ph1) => set({ ph1 })} />
      <p className="hint">
        1次位相の中心: {p.pivot.toFixed(2)} ppm (ここの位相は 0次だけで決まります)。
        <button className="link" disabled={!canRedo} onClick={() => setPivot(id, 'tallest')}>
          一番大きいピークにする
        </button>
      </p>
      <div className="row wrap">
        <label className="field" title="指数関数の窓。大きくするとノイズが減り、線は太くなります">
          線幅 (LB)
          <NumberInput value={p.lb} min={0} max={100} step={0.1} width={56} onCommit={(lb) => set({ lb: lb ?? 0 })} />
          Hz
        </label>
        <Check checked={p.baseline} onChange={(baseline) => set({ baseline })}>
          ベースライン補正
        </Check>
      </div>
    </Section>
  );
}

/** ドラッグ中の変化を1回分の履歴にまとめるスライダー */
function PhaseSlider({ label, value, min, max, disabled, onChange }: { label: string; value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void }) {
  const token = useRef<number | null>(null);
  const end = () => {
    if (token.current !== null) endGesture(token.current);
    token.current = null;
  };
  return (
    <div className="row slider-row">
      <span className="field">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.5}
        value={value}
        disabled={disabled}
        onPointerDown={() => {
          end();
          token.current = beginGesture();
        }}
        onPointerUp={end}
        onBlur={end}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <NumberInput value={Math.round(value * 10) / 10} min={min} max={max} step={1} width={60} onCommit={(v) => v !== null && onChange(v)} />
      <span className="unit">°</span>
    </div>
  );
}

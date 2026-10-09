/**
 * NMR 収率 (内標を入れた crude)。内標・量・生成物の信号から、重ねたスペクトルごとの収率を出す。
 * 内標と量は前に使ったものを最初から選んでおき、何か変えたときに図に入る (state/nmrYield.ts)
 */
import { tr } from '../i18n';
import { useMemo, useState } from 'react';
import { computeYields, expectedPpm, findStandard, percent, standardEquiv, standardMmol, standardsFor, unitLabel, yieldTsv } from '../lib/nmrYield';
import { integralValues } from '../lib/integrals';
import {
  addCustomStandard,
  addProductFromIntegral,
  applyPreset,
  clearPerLayer,
  draftSetup,
  redetectStandard,
  removeCustomStandard,
  removeProduct,
  saveYieldToNotes,
  setAmounts,
  setStandard,
  setStandardRange,
  showYieldTrend,
  updateProduct,
  writeYieldToFigure,
} from '../state/nmrYield';
import { notify, useEditor } from '../state/store';
import type { StandardUnit, YieldSetup } from '../state/types';
import { NumberInput, Section, TextInput } from './inputs';

export function YieldPanel() {
  const doc = useEditor((s) => s.doc);
  const data = useEditor((s) => s.data);
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const settings = useEditor((s) => s.settings.yield);
  // まだ図に入れていなければ、前に使った内標と量 (選んでいるスペクトルで内標の信号を探したもの)
  const draft = useMemo(() => (doc.yield ? null : draftSetup(doc)), [doc, data, activeLayerId, settings]);
  const setup: YieldSetup | null = doc.yield ?? draft;
  const result = useMemo(() => (setup ? computeYields({ ...doc, yield: setup }, data) : null), [doc, data, setup]);
  const layer = doc.layers.find((l) => l.id === activeLayerId) ?? doc.layers[0];
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  if (!layer || !meta || !setup || !result) return null;

  const custom = settings.custom;
  const std = findStandard(setup.standardId, custom);
  const nucleus = meta.nucleus;
  const choices = standardsFor(nucleus, custom);
  const signals = (std?.signals ?? []).map((s, i) => ({ s, i })).filter((x) => x.s.nucleus === nucleus);
  const sig = std?.signals[setup.signal];
  const expected = sig ? expectedPpm(sig, meta.solvent) : null;
  const mmol = standardMmol(setup, setup.standard);
  const equiv = standardEquiv(setup, setup.standard);
  const units: StandardUnit[] = setup.standard.density ? ['mg', 'uL', 'mmol', 'equiv'] : ['mg', 'mmol', 'equiv'];
  const mine = doc.integrals.filter((x) => x.layerId === layer.id).sort((a, b) => b.from - a.from);
  const values = integralValues(doc, data).values;
  const off = meta.refOffset;
  const r3 = (v: number) => Math.round(v * 1000) / 1000;
  const multi = result.rows.length > 1;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(yieldTsv(setup, result));
      notify(tr('収率の表をコピーしました (Excel・ノートに貼れます)'));
    } catch (e) {
      notify(tr('コピーできませんでした: {message}', { message: (e as Error).message }), 'error');
    }
  };

  return (
    <Section
      id="analysis-yield"
      defaultOpen={false}
      title={tr('NMR 収率 (内標)')}
      help={tr(
        '内標を入れた crude の NMR 収率を出します。内標と量は前に使ったものが最初から入っています。生成物の信号を積分ツール (I) で積分してから「積分から足す」で選び、H の数を入れてください。収率 = (生成物の面積 / H の数) ÷ (内標の面積 / H の数) × 内標の当量 × 100。',
      )}
    >
      <label className="field block">
        {tr('内標')}
        <select value={setup.standardId} onChange={(e) => setStandard(e.target.value)}>
          {!std && <option value={setup.standardId}>{setup.standard.name}</option>}
          {choices.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.custom ? tr(' (自分で足したもの)') : ''}
            </option>
          ))}
        </select>
      </label>
      {signals.length > 1 && (
        <label className="field block">
          {tr('使う信号')}
          <select value={setup.signal} onChange={(e) => setStandard(setup.standardId, Number(e.target.value))}>
            {signals.map(({ s, i }) => (
              <option key={i} value={i}>
                {`${expectedPpm(s, meta.solvent).ppm} ppm (${s.n}${nucleus === '19F' ? 'F' : 'H'}, ${s.group})`}
              </option>
            ))}
          </select>
        </label>
      )}
      {settings.recent.length > 0 && (
        <label className="field block" title={tr('前に使った内標と量 (新しい順)')}>
          {tr('履歴')}
          <select
            value=""
            onChange={(e) => {
              const p = settings.recent[Number(e.target.value)];
              if (p) applyPreset(p);
            }}
          >
            <option value="">{tr('前に使った内標と量…')}</option>
            {settings.recent.map((p, i) => (
              <option key={i} value={i}>
                {`${new Date(p.at).toLocaleDateString()} ${findStandard(p.standardId, custom)?.name ?? p.standardId} ${p.amount ?? '—'} ${unitLabel(p.unit)}${p.unit !== 'equiv' && p.substrateMmol ? ` / ${p.substrateMmol} mmol` : ''}`}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="row wrap">
        <span className="nowrap" title={tr('内標の信号の範囲 (ppm)。見つけた範囲を直せます')}>
          {tr('内標の範囲')}{' '}
          <NumberInput
            value={setup.standardRange ? r3(setup.standardRange.from) : null}
            step={0.01}
            width={58}
            onCommit={(v) => v !== null && setStandardRange({ from: v, to: setup.standardRange?.to ?? v - 0.05 })}
          />
          –
          <NumberInput
            value={setup.standardRange ? r3(setup.standardRange.to) : null}
            step={0.01}
            width={58}
            onCommit={(v) => v !== null && setStandardRange({ from: setup.standardRange?.from ?? v + 0.05, to: v })}
          />
        </span>
        <button onClick={redetectStandard} title={tr('選んでいるスペクトルで、内標の信号を探し直します')}>
          {tr('探し直す')}
        </button>
      </div>
      {expected && (
        <p className="hint">
          {expected.exact
            ? tr('目安 {ppm} ppm ({n} {unit})', { ppm: expected.ppm, n: setup.standard.nH, unit: nucleus === '19F' ? 'F' : 'H' })
            : tr('目安 {ppm} ppm ({n} {unit}、CDCl3 の値。この溶媒の値は無いので広めに探しました)', { ppm: expected.ppm, n: setup.standard.nH, unit: nucleus === '19F' ? 'F' : 'H' })}
        </p>
      )}
      {expected && setup.standardRange && Math.abs((setup.standardRange.from + setup.standardRange.to) / 2 - expected.ppm) > (nucleus === '1H' ? 0.05 : 0.5) && (
        <p className="hint warn">
          {tr('範囲の中心 ({center} ppm) が目安から離れています。内標の山か確かめてください (内標が入っていないと、近くのほかの山を拾います)', {
            center: ((setup.standardRange.from + setup.standardRange.to) / 2).toFixed(2),
          })}
        </p>
      )}

      <div className="row wrap">
        <label className="field">
          {tr('内標の量')}
          <NumberInput value={setup.amount} step={0.1} width={64} allowEmpty onCommit={(amount) => setAmounts({ amount })} />
          <select value={setup.unit} onChange={(e) => setAmounts({ unit: e.target.value as StandardUnit })}>
            {units.map((u) => (
              <option key={u} value={u}>
                {unitLabel(u)}
              </option>
            ))}
          </select>
        </label>
        {setup.unit !== 'equiv' && (
          <label className="field" title={tr('基質 (限定試薬) の量。これを 100% とします')}>
            {tr('基質')}
            <NumberInput value={setup.substrateMmol} step={0.01} width={64} allowEmpty onCommit={(substrateMmol) => setAmounts({ substrateMmol })} />
            mmol
          </label>
        )}
      </div>
      {(mmol !== null || equiv !== null) && (
        <p className="hint">
          {[
            setup.unit !== 'mmol' && setup.unit !== 'equiv' && mmol !== null ? tr('内標 {mmol} mmol', { mmol: mmol.toFixed(4) }) : '',
            setup.unit !== 'equiv' && equiv !== null ? tr('基質に対して {equiv} 当量', { equiv: equiv.toFixed(3) }) : '',
            setup.unit === 'mg' || setup.unit === 'uL' ? tr('分子量 {mw}', { mw: setup.standard.mw }) : '',
          ]
            .filter(Boolean)
            .join('、')}
        </p>
      )}

      <div className="yield-head">{tr('生成物の信号')}</div>
      {setup.products.length > 0 && (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>{tr('名前')}</th>
                <th>{tr('範囲 (ppm)')}</th>
                <th title={tr('この信号の H (F) の数')}>{nucleus === '19F' ? 'nF' : 'nH'}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {setup.products.map((p, k) => (
                <tr key={p.id}>
                  <td>
                    <TextInput value={p.name} placeholder={tr('生成物 {n}', { n: k + 1 })} width={64} onCommit={(name) => updateProduct(p.id, { name })} />
                  </td>
                  <td className="nowrap">
                    <NumberInput value={r3(p.from)} step={0.01} width={52} onCommit={(v) => v !== null && updateProduct(p.id, { from: v })} />
                    –
                    <NumberInput value={r3(p.to)} step={0.01} width={52} onCommit={(v) => v !== null && updateProduct(p.id, { to: v })} />
                  </td>
                  <td>
                    <NumberInput value={p.nH} min={1} max={100} width={40} onCommit={(nH) => nH && updateProduct(p.id, { nH })} />
                  </td>
                  <td>
                    <button className="ibtn sm" aria-label={tr('この生成物を外す')} title={tr('この生成物を外す')} onClick={() => removeProduct(p.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {mine.length > 0 ? (
        <label className="field block">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addProductFromIntegral(e.target.value);
            }}
          >
            <option value="">{tr('積分から生成物を足す…')}</option>
            {mine.map((x) => (
              <option key={x.id} value={x.id}>
                {`${(Math.max(x.from, x.to) + off).toFixed(2)}–${(Math.min(x.from, x.to) + off).toFixed(2)} ppm (${(values.get(x.id) ?? 0).toFixed(2)})`}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="hint">{tr('生成物の信号を積分ツール (I) で積分すると、ここで選べます')}</p>
      )}

      {setup.products.length > 0 && result.rows.length > 0 && (
        <div className="table-wrap">
          <table className="table compact">
            <thead>
              <tr>
                <th>{tr('スペクトル')}</th>
                {setup.products.map((p, k) => (
                  <th key={p.id}>{p.name || tr('生成物 {n}', { n: k + 1 })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((r) => (
                <tr key={r.layer.id}>
                  <td title={r.meta.fileName}>
                    {r.layer.label || r.meta.title || r.meta.fileName}
                    {setup.perLayer[r.layer.id] ? ' *' : ''}
                  </td>
                  {r.yields.map((v, k) => (
                    <td key={k} title={r.mmol[k] !== null ? `${r.mmol[k]!.toFixed(4)} mmol` : undefined}>
                      <b>{percent(v)}</b>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {result.notes.map((n) => (
        <p key={n} className="hint warn">
          {n}
        </p>
      ))}
      {multi && <PerLayerAmounts setup={setup} rows={result.rows} />}

      {setup.products.length > 0 && (
        <div className="row wrap">
          <button onClick={() => void copy()} title={tr('タブ区切りでコピーします (Excel・ノートに貼れます)')}>
            {tr('表をコピー')}
          </button>
          <button onClick={writeYieldToFigure} title={tr('スペクトルごとに「NMR yield: 78%」を図に書きます (書き直すと入れ替わります)')}>
            {tr('図に書き込む')}
          </button>
          <button onClick={() => void saveYieldToNotes()} title={tr('ホーム画面のサンプルのメモに、収率と内標の量を 1 行残します')}>
            {tr('ホームのメモに残す')}
          </button>
          <button onClick={showYieldTrend} title={tr('反応の経時変化を、縦軸 = NMR 収率 (%) のグラフにします')}>
            {tr('推移グラフで見る')}
          </button>
        </div>
      )}

      <CustomStandards nucleus={nucleus} />
    </Section>
  );
}

/** 重ねた crude ごとに量が違うとき */
function PerLayerAmounts({ setup, rows }: { setup: YieldSetup; rows: ReturnType<typeof computeYields>['rows'] }) {
  const own = Object.keys(setup.perLayer).length > 0;
  return (
    <details className="sub" open={own}>
      <summary>{tr('スペクトルごとの量 (crude ごとに違うとき)')}</summary>
      <table className="table compact">
        <thead>
          <tr>
            <th>{tr('スペクトル')}</th>
            <th>{tr('内標の量')}</th>
            {setup.unit !== 'equiv' && <th>{tr('基質 (mmol)')}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.layer.id}>
              <td>{r.layer.label || r.meta.title || r.meta.fileName}</td>
              <td className="nowrap">
                <NumberInput value={r.amounts.amount} step={0.1} width={56} allowEmpty onCommit={(amount) => setAmounts({ amount }, r.layer.id)} /> {unitLabel(r.amounts.unit)}
              </td>
              {setup.unit !== 'equiv' && (
                <td>
                  <NumberInput value={r.amounts.substrateMmol} step={0.01} width={56} allowEmpty onCommit={(substrateMmol) => setAmounts({ substrateMmol }, r.layer.id)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {own && (
        <button className="link" onClick={clearPerLayer}>
          {tr('全部同じ量に戻す')}
        </button>
      )}
    </details>
  );
}

/** 一覧にない内標を足す (この PC のブラウザに残る) */
function CustomStandards({ nucleus }: { nucleus: string }) {
  const custom = useEditor((s) => s.settings.yield.custom);
  const [name, setName] = useState('');
  const [mw, setMw] = useState<number | null>(null);
  const [density, setDensity] = useState<number | null>(null);
  const [ppm, setPpm] = useState<number | null>(null);
  const [n, setN] = useState<number | null>(null);
  const add = () => {
    if (!name.trim() || !mw || ppm === null || !n) return notify(tr('名前・分子量・ppm・H の数を入れてください'), 'error');
    const id = addCustomStandard({
      name: name.trim(),
      mw,
      ...(density ? { density } : {}),
      signals: [{ nucleus, n, group: '', shifts: { CDCl3: ppm } }],
    });
    setStandard(id);
    setName('');
    setMw(null);
    setDensity(null);
    setPpm(null);
    setN(null);
  };
  return (
    <details className="sub">
      <summary>{tr('一覧にない内標を足す')}</summary>
      <label className="field block">
        {tr('名前')}
        <TextInput value={name} onCommit={setName} />
      </label>
      <div className="grid2">
        <label className="field">
          {tr('分子量')}
          <NumberInput value={mw} step={0.01} width={64} allowEmpty onCommit={setMw} />
        </label>
        <label className="field" title={tr('液体のとき (μL で入れられるようになります)')}>
          {tr('密度 (g/mL)')}
          <NumberInput value={density} step={0.001} width={56} allowEmpty onCommit={setDensity} />
        </label>
        <label className="field">
          {tr('ppm ({nucleus})', { nucleus })}
          <NumberInput value={ppm} step={0.01} width={64} allowEmpty onCommit={setPpm} />
        </label>
        <label className="field">
          {nucleus === '19F' ? tr('F の数') : tr('H の数')}
          <NumberInput value={n} min={1} max={100} width={44} allowEmpty onCommit={setN} />
        </label>
      </div>
      <button onClick={add}>{tr('足す')}</button>
      {custom.length > 0 && (
        <ul className="yield-custom">
          {custom.map((c) => (
            <li key={c.id}>
              {`${c.name} (${c.signals.map((s) => `${s.nucleus} ${s.shifts.CDCl3} ppm, ${s.n}`).join('; ')}, MW ${c.mw})`}{' '}
              <button className="link" onClick={() => removeCustomStandard(c.id)}>
                {tr('消す')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

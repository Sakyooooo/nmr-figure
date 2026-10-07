import { tr } from '../i18n';
import { useState } from 'react';
import type { ExperimentMeta } from '../lib/jdfMeta';
import { experimentLabel2d } from '../lib/jdf2d';
import { autoTitle2d, fullView2d, squareHeight } from '../lib/scene2d';
import { nucleusRich } from '../lib/nuclei';
import { solventInfo } from '../lib/solvents';
import { autoCrossLines, clearCrossLines, parseValues, valuesFromLibrary } from '../state/cross2d';
import { pickSide1d } from '../state/fileOps';
import { useLibrary } from '../state/library';
import { attachSideFromLibrary, clearSide1d, markCrossPeaksFromSides, sideCandidates } from '../state/side2d';
import { edit, notify, setPlot2d, setProcessing2d, setView2d, useEditor } from '../state/store';
import type { Processing2d } from '../lib/fid2d';
import type { Side2d, Spectrum2dMeta } from '../state/types';
import { Check, ColorInput, NumberInput, Section, TextInput } from './inputs';
import { RichHtml } from './RichText';

/** 左パネル: 開いている 2D の中身 */
export function Spectrum2dPanel() {
  const meta = useEditor((s) => s.doc.spectra2d[0]);
  const plot = useEditor((s) => s.doc.plot2d);
  if (!meta || !plot) return null;
  const solvent = solventInfo(meta.solvent)?.label ?? meta.solventRaw;
  return (
    <>
      <Section title={tr('2D スペクトル')}>
        <p className="title-2d">
          <RichHtml text={autoTitle2d(meta)} />
        </p>
        <dl className="facts">
          <dt>{tr('測定')}</dt>
          <dd>{experimentLabel2d(meta)}</dd>
          <dt>{tr('横軸 (F2)')}</dt>
          <dd>
            <RichHtml text={nucleusRich(meta.x.nucleus)} /> {meta.x.freqMHz.toFixed(1)} MHz
          </dd>
          <dt>{tr('縦軸 (F1)')}</dt>
          <dd>
            <RichHtml text={nucleusRich(meta.y.nucleus)} /> {meta.y.freqMHz.toFixed(1)} MHz
          </dd>
          <dt>{tr('溶媒')}</dt>
          <dd>{solvent ? <RichHtml text={solvent} /> : '—'}</dd>
          <dt>{tr('積算')}</dt>
          <dd>{meta.scans ?? '—'}</dd>
          <dt>{tr('ファイル')}</dt>
          <dd className="wrap">{meta.fileName}</dd>
        </dl>
      </Section>

      <Section title={tr('表示範囲')}>
        <div className="grid2">
          <label className="field">
            {tr('F2 左')}
            <NumberInput value={round2(plot.view.xMax)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ xMax: v })} />
          </label>
          <label className="field">
            {tr('F2 右')}
            <NumberInput value={round2(plot.view.xMin)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ xMin: v })} />
          </label>
          <label className="field">
            {tr('F1 上')}
            <NumberInput value={round2(plot.view.yMax)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ yMax: v })} />
          </label>
          <label className="field">
            {tr('F1 下')}
            <NumberInput value={round2(plot.view.yMin)} step={0.5} width={66} onCommit={(v) => v !== null && setView2d({ yMin: v })} />
          </label>
        </div>
        <div className="row">
          <button onClick={() => setView2d(fullView2d(meta))}>{tr('全体表示')}</button>
          {meta.x.nucleus === meta.y.nucleus && (
            <button
              onClick={() => {
                const lo = Math.min(plot.view.xMin, plot.view.yMin);
                const hi = Math.max(plot.view.xMax, plot.view.yMax);
                setView2d({ xMax: hi, xMin: lo, yMax: hi, yMin: lo });
              }}
              title={tr('縦と横の範囲をそろえます (対角線が 45° になります)')}
            >
              {tr('縦横をそろえる')}
            </button>
          )}
        </div>
        <div className="row">
          <button onClick={squareFigure} title={tr('図の高さを変えて、縦横の ppm あたりの長さをそろえます')}>
            {tr('図を正方形にする')}
          </button>
        </div>
        <p className="hint">{tr('ドラッグで移動、ホイールで拡大縮小、ダブルクリックで全体表示。範囲を拡大ツール (Z) で四角く囲むこともできます。')}</p>
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
      <Section title={tr('等高線')}>
        <div className="row">
          <label className="field" title={tr('一番低い線の高さ。小さくすると弱いピークまで出ますが、雑音も出ます')}>
            {tr('下限')}
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
          <button onClick={() => setPlot2d({ base: Math.max(0.0005, plot.base / 1.5) })} title={tr('弱いピークまで出す')}>
            {tr('↓ 下げる')}
          </button>
          <button onClick={() => setPlot2d({ base: Math.min(0.9, plot.base * 1.5) })} title={tr('雑音を減らす')}>
            {tr('↑ 上げる')}
          </button>
        </div>
        <div className="grid2">
          <label className="field">
            {tr('本数')}
            <NumberInput value={plot.levels} min={1} max={40} width={52} onCommit={(v) => setPlot2d({ levels: v ?? 10 })} />
          </label>
          <label className="field" title={tr('1本ごとに何倍ずつ高くするか')}>
            {tr('倍率')}
            <NumberInput value={plot.factor} min={1.05} max={4} step={0.1} width={52} onCommit={(v) => setPlot2d({ factor: v ?? 1.5 })} />
          </label>
          <label className="field">
            {tr('色')}
            <ColorInput value={plot.color} onChange={(color) => setPlot2d({ color })} />
          </label>
          <label className="field">
            {tr('線幅')}
            <NumberInput value={plot.lineWidth} min={0.2} max={3} step={0.1} width={52} onCommit={(v) => setPlot2d({ lineWidth: v ?? 0.6 })} />
          </label>
        </div>
        {meta.x.nucleus === meta.y.nucleus && (
          <div className="row wrap">
            <Check checked={plot.showDiagonal} onChange={(v) => setPlot2d({ showDiagonal: v })}>
              {tr('対角線')}
            </Check>
          </div>
        )}
      </Section>

      <SidePanel meta={meta} />

      <Section
        title={tr('交点の線')}
        help={tr('クロスピークが、どの横軸・縦軸の値で交わっているかを線で見せます。下の道具の「交点の線」(X) でクロスピークを押すと、いちばん近い山に合わせて上と右の投影まで線を引きます。自動で引くときは、縦軸の値 (¹³C の SI の文でも、数を並べただけでもよい) を入れると、その値に当たるクロスピークだけに線を引きます (空なら拾ったクロスピーク全部)。')}
      >
        <label className="field block">
          {tr('縦軸 ({nucleus}) の値', { nucleus: meta.y.nucleus })}
          <TextInput value={plot.crossValues ?? ''} multiline placeholder={tr('例: 151.8, 137.8, 123.4 (SI の文をそのまま貼ってもよい)')} onCommit={(crossValues) => setPlot2d({ crossValues })} />
        </label>
        <div className="row wrap">
          <button
            onClick={async () => {
              const got = await valuesFromLibrary();
              if (!got) return notify(tr('データフォルダに同じサンプル名の {nucleus} がありません', { nucleus: meta.y.nucleus }), 'error');
              setPlot2d({ crossValues: got.values.join(', ') });
              notify(tr('{file} から {n} 本の値を読みました (溶媒のピークは除きました)', { file: got.fileName, n: got.values.length }), 'info');
            }}
            title={tr('データフォルダの、同じサンプル名の 1D からピークの値を読みます')}
          >
            {tr('同じサンプルの {nucleus} から読む', { nucleus: meta.y.nucleus })}
          </button>
          <button className="primary" onClick={() => autoCrossLines(parseValues(plot.crossValues ?? ''))}>
            {tr('自動で線を引く')}
          </button>
          <button onClick={() => clearCrossLines(false)}>{tr('自動の線を消す')}</button>
        </div>
      </Section>

      <Section title={tr('2D の処理')} defaultOpen={false}>
        <p className="hint">{tr('COSY・HMBC などは絶対値で表示します (位相補正は要りません)。変えると計算し直します。')}</p>
        <label className="field block">
          {tr('窓関数')}
          <select value={p.window} onChange={(e) => setProcessing2d({ window: e.target.value as Processing2d['window'] })}>
            <option value="sine">{tr('サインベル (標準)')}</option>
            <option value="sine2">{tr('サインベル二乗 (裾を抑える)')}</option>
            <option value="none">{tr('なし')}</option>
          </select>
        </label>
        <div className="grid2">
          <label className="field" title={tr('横方向 (F2) のゼロ詰め')}>
            {tr('F2 ゼロ詰め')}
            <select value={p.zf2} onChange={(e) => setProcessing2d({ zf2: Number(e.target.value) })}>
              <option value={1}>×1</option>
              <option value={2}>×2</option>
            </select>
          </label>
          <label className="field" title={tr('縦方向 (F1) のゼロ詰め。増やすと縦に滑らかになります')}>
            {tr('F1 ゼロ詰め')}
            <select value={p.zf1} onChange={(e) => setProcessing2d({ zf1: Number(e.target.value) })}>
              <option value={1}>×1</option>
              <option value={2}>×2</option>
              <option value={4}>×4</option>
            </select>
          </label>
        </div>
        <p className="hint">
          {tr('点の数: F2')}{' '}{meta.x.n} × F1 {meta.y.n}
        </p>
      </Section>
    </>
  );
}

/**
 * 上と右のスペクトル: 2D の投影か、読み込んだ 1D (本人の希望 2026-10-07)。
 * 同じサンプルの、マーカーを付けて保存した版 (帰属した図) を選ぶと、付けたマーカーも上・右に出る
 */
function SidePanel({ meta }: { meta: Spectrum2dMeta }) {
  const show = useEditor((s) => s.doc.plot2d?.showProjections ?? false);
  // 上と右に同じ種類のマーカーがある (¹H と ¹³C の帰属の組がある)
  const paired = useEditor((s) => {
    const styles = (side: Side2d) => new Set(s.doc.markers.filter((m) => m.space === '2d' && m.side === side).map((m) => m.styleId));
    const right = styles('right');
    return [...styles('top')].some((id) => right.has(id));
  });
  const rows: { sides: Side2d[]; nucleus: string; label: string }[] =
    meta.x.nucleus === meta.y.nucleus
      ? [{ sides: ['top', 'right'], nucleus: meta.x.nucleus, label: tr('上と右') }]
      : [
          { sides: ['top'], nucleus: meta.x.nucleus, label: tr('上 (横軸)') },
          { sides: ['right'], nucleus: meta.y.nucleus, label: tr('右 (縦軸)') },
        ];
  return (
    <Section
      title={tr('上と右のスペクトル')}
      help={tr(
        'ふつうは 2D から作った投影を出します。同じサンプルの 1D (¹H・¹³C など) を選ぶと、その 1D を出します。マーカーを付けて保存した版 (帰属した図) を選ぶと、付けたマーカーも上・右に出ます。2D を開いたとき、帰属した版があれば自動で使います。ホーム画面で 2D と一緒に 1D を選んで開いても、上・右に使います。',
      )}
    >
      <Check checked={show} onChange={(v) => setPlot2d({ showProjections: v })}>
        {tr('上と右にスペクトルを出す')}
      </Check>
      {show && rows.map((r) => <SideRow key={r.label} {...r} />)}
      {show && <p className="hint">{tr('マーカーの道具で上・右のスペクトルの山をクリックすると、そこにもマーカーを付けられます (もう一度押すと外れます)。')}</p>}
      {show && paired && (
        <div className="row">
          <button
            onClick={() => {
              const n = markCrossPeaksFromSides();
              notify(
                n ? tr('クロスピーク {n} か所にマーカーを付けました', { n }) : tr('上と右の同じマーカーの組に当たるクロスピークがありませんでした (もう付いている所は飛ばします)'),
                n ? 'info' : 'error',
              );
            }}
            title={tr('上 (横軸) と右 (縦軸) に同じ種類のマーカーが付いている組で、そこにクロスピークがあれば、同じマーカーを付けます')}
          >
            {tr('同じマーカーのクロスピークにも付ける')}
          </button>
        </div>
      )}
    </Section>
  );
}

function SideRow({ sides, nucleus, label }: { sides: Side2d[]; nucleus: string; label: string }) {
  const doc = useEditor((s) => s.doc);
  // ホーム画面の一覧が変わったら選べるものも変わる
  useLibrary((s) => s.experiments);
  useLibrary((s) => s.figures);
  const [busy, setBusy] = useState(false);
  const current = doc.plot2d?.[sides[0]] ?? null;
  const candidates = sideCandidates(doc, nucleus);
  const marks = current ? doc.markers.filter((m) => m.side === sides[0] && m.from1d === current.spectrumId).length : 0;
  const choose = async (value: string) => {
    if (value === '__current') return;
    if (value === '') return clearSide1d(sides);
    if (value === '__file') return pickSide1d(sides);
    const e = candidates.find((c) => c.key === value);
    if (!e) return;
    setBusy(true);
    try {
      await attachSideFromLibrary(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="field block">
      <span>
        {label}: <RichHtml text={nucleusRich(nucleus)} />
      </span>
      <select value={current ? '__current' : ''} disabled={busy} onChange={(e) => void choose(e.target.value)}>
        <option value="">{tr('2D の投影')}</option>
        {current && <option value="__current">{current.from}</option>}
        {candidates.map((c) => (
          <option key={c.key} value={c.key}>
            {candidateLabel(c)}
          </option>
        ))}
        <option value="__file">{tr('ファイルから選ぶ…')}</option>
      </select>
      {current && marks > 0 && <span className="hint">{tr('帰属のマーカー {n} 個', { n: marks })}</span>}
    </label>
  );
}

function candidateLabel(e: ExperimentMeta) {
  return `${e.figure ? tr('編集した版') : tr('測定')} — ${e.fileName}`;
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

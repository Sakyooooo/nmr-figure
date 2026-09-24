/**
 * 印刷。縦の用紙 1 枚に、上に図だけ、下に説明 (図の名前・測定条件の表・印刷した日時) をまとめる (本人の指定 2026-09-24)。
 * 画面には出さず、印刷のときだけ出す (styles.css の @media print。印刷のときはこれ以外をすべて隠す)。
 */
import { locale, tr } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { figureSvgString } from '../lib/exportFigure';
import { titleText } from '../lib/layout';
import { title2d } from '../lib/scene2d';
import { simulatedWord } from '../lib/simulate';
import { solventInfo } from '../lib/solvents';
import { useEditor } from '../state/store';
import { RichHtml } from './RichText';

export function PrintView({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const doc = useEditor((s) => s.doc);
  const projectName = useEditor((s) => s.projectName);
  const printRequest = useEditor((s) => s.printRequest);
  const [svg, setSvg] = useState<string | null>(null);
  // この部品は、ホームから図を開くたび・言語を変えるたびに作り直される。作った時点までの頼みは済んだものとし、
  // そのあと「印刷」を押したときだけ印刷する (前に 1 度でも印刷していると、図を開いただけで印刷の画面が出ていた)
  const handled = useRef(printRequest);

  useEffect(() => {
    if (printRequest === handled.current) return;
    handled.current = printRequest;
    const el = svgRef.current;
    if (!el) return;
    setSvg(figureSvgString(el));
    // 描き終わってから印刷画面を出す
    const timer = setTimeout(() => {
      window.print();
      setTimeout(() => setSvg(null), 500);
    }, 120);
    return () => clearTimeout(timer);
  }, [printRequest, svgRef]);

  if (!svg) return null;
  const title = doc.plot2d ? title2d(doc) : titleText(doc);
  const name = projectName ?? tr('未保存の図');
  const rows = doc.plot2d
    ? doc.spectra2d.map((m) => ({
        name: m.fileName,
        nucleus: `${m.x.nucleus} / ${m.y.nucleus}`,
        freq: `${m.x.freqMHz.toFixed(1)} MHz`,
        solvent: solventInfo(m.solvent)?.label ?? m.solventRaw,
        scans: m.scans,
        date: m.date ?? '',
        note: m.experiment,
      }))
    : doc.layers
        .filter((l) => l.visible)
        .map((l) => {
          const m = doc.spectra.find((s) => s.id === l.spectrumId);
          return m
            ? {
                name: l.label || m.fileName,
                nucleus: m.nucleus + (m.decoupled && m.decoupled !== m.nucleus ? `{${m.decoupled}}` : ''),
                freq: `${m.freqMHz.toFixed(1)} MHz`,
                solvent: solventInfo(m.solvent)?.label ?? m.solventRaw,
                scans: m.scans,
                date: m.date ?? '',
                note: m.simulated ? `${simulatedWord()}: ${m.simulated.citation}` : m.processing ? tr('FID をこのアプリで処理') : '',
              }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => !!r);

  // 印刷のときはアプリ本体を隠すので、印刷用の中身は body の直下に出す
  return createPortal(
    <div className="print-view">
      <div className="print-figure" dangerouslySetInnerHTML={{ __html: svg }} />
      <section className="print-desc">
        <h1>{name}</h1>
        {/* 図の下にタイトルを出していない図だけ、説明に書く (同じ文を 2 回出さない) */}
        {title && !doc.figure.showTitle && (
          <p className="print-title">
            <RichHtml text={title} />
          </p>
        )}
        <table className="print-table">
          <thead>
            <tr>
              <th>{tr('スペクトル')}</th>
              <th>{tr('核種')}</th>
              <th>{tr('周波数')}</th>
              <th>{tr('溶媒')}</th>
              <th>{tr('積算')}</th>
              <th>{tr('測定日')}</th>
              <th>{tr('備考')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.name}</td>
                <td>
                  {/* 質量数を上付きに (2D の「1H / 13C」は両方、デカップリングの {1H} も) */}
                  <RichHtml text={r.nucleus.replace(/(^|\/\s*)(\d+)/g, '$1^{$2}').replace(/\{(\d+)([A-Z])\}/, '{^{$1}$2}')} />
                </td>
                <td>{r.freq}</td>
                <td>{r.solvent ? <RichHtml text={r.solvent} /> : '—'}</td>
                <td>{r.scans ?? '—'}</td>
                <td>{r.date || '—'}</td>
                <td className="print-note">
                  <RichHtml text={r.note} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="print-foot">
          {tr('印刷: {time}', { time: new Date().toLocaleString(locale()) })} · NMR Figure Editor
        </p>
      </section>
    </div>,
    document.body,
  );
}

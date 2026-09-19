/**
 * 印刷。今の図と、測定条件の表を 1枚にまとめる。
 * 画面には出さず、印刷のときだけ出す (styles.css の @media print)。
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { figureSvgString } from '../lib/exportFigure';
import { titleText } from '../lib/layout';
import { title2d } from '../lib/scene2d';
import { solventInfo } from '../lib/solvents';
import { useEditor } from '../state/store';
import { RichHtml } from './RichText';

export function PrintView({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const doc = useEditor((s) => s.doc);
  const projectName = useEditor((s) => s.projectName);
  const printRequest = useEditor((s) => s.printRequest);
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    if (!printRequest) return;
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
                note: m.simulated ? `文献: ${m.simulated.citation}` : m.processing ? 'FID をこのアプリで処理' : '',
              }
            : null;
        })
        .filter((r): r is NonNullable<typeof r> => !!r);

  // 印刷のときはアプリ本体を隠すので、印刷用の中身は body の直下に出す
  return createPortal(
    <div className="print-view">
      <h1>
        <RichHtml text={title || projectName || 'NMR'} />
      </h1>
      <div className="print-figure" dangerouslySetInnerHTML={{ __html: svg }} />
      <table className="print-table">
        <thead>
          <tr>
            <th>スペクトル</th>
            <th>核種</th>
            <th>周波数</th>
            <th>溶媒</th>
            <th>積算</th>
            <th>測定日</th>
            <th>備考</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{r.name}</td>
              <td>
                <RichHtml text={r.nucleus.replace(/^(\d+)/, '^{$1}').replace(/\{(\d+)([A-Z])\}/, '{^{$1}$2}')} />
              </td>
              <td>{r.freq}</td>
              <td>{r.solvent ? <RichHtml text={r.solvent} /> : '—'}</td>
              <td>{r.scans ?? '—'}</td>
              <td>{r.date || '—'}</td>
              <td className="note">
                <RichHtml text={r.note} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="print-foot">
        {projectName ?? '未保存の図'} · {new Date().toLocaleString('ja-JP')}
      </p>
    </div>,
    document.body,
  );
}

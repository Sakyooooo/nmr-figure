/**
 * H の番号 (本人の希望 2026-10-22)。ChemDraw の構造式の H に番号を振り (同じ環境の H は同じ番号)、
 * 道具「H の番号」で H を選んでピークをクリックすると、ピークの上に番号が出る (state/hNumbers.ts)
 */
import { tr } from '../i18n';
import { useEffect, useState } from 'react';
import { clearHNumbers, compareLabels, numberHydrogens, setHLabel } from '../state/hNumbers';
import { setTool, useEditor } from '../state/store';
import type { FigureImage } from '../state/types';
import { Section } from './inputs';

export function HNumberPanel() {
  const images = useEditor((s) => s.doc.figureImages);
  const is2d = useEditor((s) => !!s.doc.plot2d);
  const structures = images.filter((x) => x.cdxml);
  if (is2d || !structures.length) return null;
  const count = structures.reduce((n, im) => n + new Set(Object.values(im.hNumbers?.labels ?? {})).size, 0);
  return (
    <Section
      id="analysis-hnum"
      defaultOpen={false}
      title={count ? tr('H の番号 ({n})', { n: count }) : tr('H の番号')}
      help={tr(
        '構造式の H に番号を振ります (同じ環境の H は同じ番号、同じ炭素でも環境の違う H は別の番号)。道具「H の番号」(N) で構造式の H をクリックして選び、ピークをクリックすると、ピークの上に番号が出ます (もう一度クリックで外す)。',
      )}
    >
      {structures.map((im, i) => (
        <Structure key={im.id} image={im} title={structures.length > 1 ? tr('構造式 {n}', { n: i + 1 }) : null} />
      ))}
    </Section>
  );
}

function Structure({ image, title }: { image: FigureImage; title: string | null }) {
  const assigns = useEditor((s) => s.doc.hAssigns);
  const active = useEditor((s) => s.activeH);
  const [busy, setBusy] = useState(false);
  const n = image.hNumbers;
  const run = async (start?: string) => {
    setBusy(true);
    try {
      await numberHydrogens(image.id, start);
    } finally {
      setBusy(false);
    }
  };
  // 番号ごと: H の数 (同じ環境の H をすべて) と、ピークに付けたか
  const labels = n ? [...new Set(Object.values(n.labels))].sort(compareLabels) : [];
  const hCount = (label: string) => n!.sites.filter((s) => n!.labels[s.key] === label).reduce((sum, s) => sum + s.count, 0);
  const onPeak = (label: string) => assigns.some((a) => a.imageId === image.id && n!.labels[a.key] === label);
  const pick = (label: string) => {
    const site = n!.sites.find((s) => n!.labels[s.key] === label);
    if (!site) return;
    useEditor.setState({ activeH: { imageId: image.id, key: site.key } });
    setTool('hnum');
  };
  const site = active?.imageId === image.id ? n?.sites.find((s) => s.key === active.key) : undefined;
  const current = site ? n!.labels[site.key] : undefined;
  return (
    <>
      {title && <p className="hint">{title}</p>}
      <div className="row wrap">
        {!n ? (
          <button className="primary" disabled={busy} onClick={() => void run()}>
            {busy ? tr('番号を振っています…') : tr('H に番号を振る')}
          </button>
        ) : (
          <>
            <button disabled={busy} onClick={() => void run()} title={tr('骨格に沿って 1 から振り直します (手で直した番号も振り直します)')}>
              {tr('番号を振り直す')}
            </button>
            <button className="danger" onClick={() => clearHNumbers(image.id)} title={tr('構造式の H とピークの上の番号を消します')}>
              {tr('番号を消す')}
            </button>
          </>
        )}
      </div>
      {n && (
        <>
          <div className="chips" role="group" aria-label={tr('H の番号')}>
            {labels.map((label) => (
              <button
                key={label}
                className={`chip${current === label ? ' on' : ''}`}
                onClick={() => pick(label)}
                title={onPeak(label) ? tr('ピークに付けてあります') : tr('選んでピークをクリックすると付きます')}
              >
                H<sup>{label}</sup> <span className="muted">{tr('{n}H', { n: hCount(label) })}</span>
                {onPeak(label) ? ' ✓' : ''}
              </button>
            ))}
          </div>
          {site && current !== undefined ? (
            <div className="row wrap">
              <label className="field">
                {tr('選んだ H の番号')}
                <LabelInput key={site.key} value={current} onCommit={(v) => setHLabel(image.id, site.key, v)} />
              </label>
              <button disabled={busy} onClick={() => void run(site.parent)} title={tr('選んだ H の原子から骨格をたどって、1 から振り直します')}>
                {tr('ここから振り直す')}
              </button>
              <button className="danger" onClick={() => setHLabel(image.id, site.key, '')} title={tr('この番号 (同じ環境の H も) を外します')}>
                {tr('この番号を外す')}
              </button>
            </div>
          ) : (
            <p className="hint">{tr('番号を押すか、道具「H の番号」(N) で構造式の H をクリックして選び、ピークをクリックします。')}</p>
          )}
        </>
      )}
    </>
  );
}

/** 番号の欄。決めたとき (Enter・欄を出たとき) だけ書き換える (打っている途中の空で番号が外れないように) */
function LabelInput({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const commit = () => {
    if (text.trim() && text.trim() !== value) onCommit(text);
    else setText(value);
  };
  return (
    <input
      type="text"
      value={text}
      style={{ width: 56 }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setText(value);
      }}
    />
  );
}

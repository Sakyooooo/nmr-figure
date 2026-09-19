/**
 * 論文の SI に書かれた NMR データから、比較用のスペクトルを作る。
 * 実測ではないので、引用元を必ず入れてもらい、図にも出す。
 */
import { useCallback, useMemo, useState } from 'react';
import { cleanCitation, shortCitation, tidyCitation } from '../lib/citation';
import { parseSi } from '../lib/siParse';
import { defaultLineWidthHz, simulateFromSi } from '../lib/simulate';
import { traceWidths, type Trace } from '../lib/trace';
import { TraceImagePicker } from './TraceImagePicker';
import { addSimulated, notify, updateSimulated, useEditor } from '../state/store';
import { Modal } from './Dialogs';
import { RichHtml } from './RichText';
import { NumberInput } from './inputs';

const SAMPLE = '1H NMR (400 MHz, CDCl3) δ 7.30 (d, J = 8.0 Hz, 2H), 3.45 (q, J = 7.0 Hz, 2H), 1.25 (t, J = 7.0 Hz, 3H).';

export function SiImportDialog({ onClose, spectrumId }: { onClose: () => void; spectrumId?: string | null }) {
  // 作り直しのときは、前に入れた中身を出しておく
  const editing = useEditor((s) => (spectrumId ? s.doc.spectra.find((x) => x.id === spectrumId) : undefined));
  const [text, setText] = useState(editing?.simulated?.text ?? '');
  const [citation, setCitation] = useState(editing?.simulated?.citation ?? '');
  const [before, setBefore] = useState<string | null>(null);
  const [short, setShort] = useState(editing?.simulated?.short ?? '');
  const [lineWidth, setLineWidth] = useState<number | null>(editing?.simulated?.lineWidthHz ?? null);
  const [trace, setTrace] = useState<Trace | null>(null);
  const onTrace = useCallback((t: Trace | null) => setTrace(t), []);

  const parsed = useMemo(() => {
    if (!text.trim()) return null;
    try {
      return parseSi(text);
    } catch {
      return null;
    }
  }, [text]);
  const tidied = useMemo(() => tidyCitation(citation), [citation]);
  // 文献の図から測れた線幅 (信号ごと。測れないところは null → 下の「線幅」を使う)
  const widths = useMemo(
    () => (trace && parsed?.signals.length ? traceWidths(trace, parsed.signals.map((s) => s.delta), parsed.freqMHz ?? 400) : null),
    [trace, parsed],
  );
  const measured = widths?.filter((w) => w !== null).length ?? 0;
  const ready = !!parsed?.signals.length && citation.trim().length > 0;

  /** 雑に貼られた引用を、図に出す形に直す (直す前の文は「元に戻す」で戻せる) */
  const tidy = (value: string) => {
    const result = tidyCitation(value);
    // 戻す先は改行だけ直した文 (1行の入力欄に改行は入らないため)
    const cleaned = cleanCitation(value);
    if (result.text !== cleaned) setBefore(cleaned);
    setCitation(result.text);
  };
  const pasteCitation = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!pasted.trim()) return;
    e.preventDefault();
    const el = e.currentTarget;
    const head = citation.slice(0, el.selectionStart ?? citation.length);
    const tail = citation.slice(el.selectionEnd ?? citation.length);
    tidy(`${head}${pasted}${tail}`);
  };

  const add = () => {
    try {
      const width = lineWidth ?? defaultLineWidthHz(parsed?.nucleus ?? '1H');
      const full = citation.trim();
      const result = simulateFromSi(text, { full, short: short.trim() || shortCitation(full) }, { lineWidthHz: width, widthsHz: widths });
      const fromImage = measured ? `。うち ${measured} 本は図から線幅を読みました` : '';
      if (editing) {
        updateSimulated(editing.id, result.meta, result.data);
        notify(`文献のスペクトルを作り直しました (${result.parsed.signals.length} 信号)${fromImage}`);
      } else {
        addSimulated(result.meta, result.data);
        notify(`文献のスペクトルを作りました (${result.parsed.signals.length} 信号)${fromImage}。引用元は図の下に入ります`);
      }
      onClose();
    } catch (e) {
      notify((e as Error).message, 'error');
    }
  };

  return (
    <Modal title={editing ? '文献のスペクトルを直す' : '文献 (SI) のデータからスペクトルを作る'} onClose={onClose} wide>
      <section>
        <p className="hint">
          論文の SI に書かれている NMR データの文を貼り付けると、書かれた δ・多重度・J・H 数から線を作って、自分の測定と重ねられます。
          実測ではないので、<strong>引用元は図に必ず入ります</strong>。
        </p>
        <label className="field block">
          SI の文
          <textarea
            className="si-input"
            rows={4}
            value={text}
            placeholder={SAMPLE}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
          />
        </label>
        {parsed && (
          <p className="hint">
            {parsed.signals.length ? (
              <>
                読み取り: {parsed.nucleus}
                {parsed.freqMHz ? ` ${parsed.freqMHz} MHz` : ''}
                {parsed.solvent ? ` / ${parsed.solvent}` : ''} / 信号 {parsed.signals.length} 本
                {parsed.skipped.length ? `。読めなかった部分: ${parsed.skipped.join(' | ')}` : ''}
              </>
            ) : (
              <span className="warn">NMR のデータを読み取れません。「δ 7.30 (d, J = 8.0 Hz, 2H), …」の形で貼り付けてください</span>
            )}
          </p>
        )}
        <label className="field block">
          引用元 (図の下に出ます。貼ると自動で整えます。手で直したものはそのまま出ます)
          <input
            type="text"
            value={citation}
            placeholder="Smith, J. et al. J. Am. Chem. Soc. 2024, 146, 1234."
            onChange={(e) => {
              setCitation(e.target.value);
              setBefore(null);
            }}
            onPaste={pasteCitation}
          />
        </label>
        <div className="row wrap">
          <button onClick={() => tidy(citation)} disabled={!citation.trim()} title="貼り付けたときは自動で整えます。手で直したあとに押すと、もう一度整えます">
            形を整える
          </button>
          {before && (
            <button
              className="link"
              onClick={() => {
                setCitation(before);
                setBefore(null);
              }}
            >
              元に戻す
            </button>
          )}
        </div>
        {citation.trim() && (
          <p className={`hint${tidied.formatted ? '' : ' warn'}`}>
            {tidied.formatted ? (
              <>
                図に出る形: <RichHtml text={citation} />
              </>
            ) : (
              '著者・誌名・年を読み取れないので、書いたままの文がそのまま図に出ます'
            )}
          </p>
        )}
        <details className="sub">
          <summary>文献の図 (スクショ) から線の形を合わせる — 任意{measured ? ` / ${measured} 本を読み取り済み` : ''}</summary>
          <TraceImagePicker onTrace={onTrace} />
          {widths && (
            <p className={`hint${measured ? '' : ' warn'}`}>
              図から線幅を読めた信号: {measured} / {widths.length}
              {measured ? '' : ' (図が粗いか、枠や ppm の指定が合っていないようです。読めない信号は下の線幅を使います)'}
            </p>
          )}
        </details>
        <div className="row">
          <label className="field">
            短い引用 (スペクトル名の横)
            <input type="text" value={short} placeholder={shortCitation(citation) || 'Smith 2024'} onChange={(e) => setShort(e.target.value)} />
          </label>
          <label className="field" title="線の太さ (半値全幅)。実測に近づけたいときに変えます">
            線幅
            <NumberInput
              value={lineWidth ?? defaultLineWidthHz(parsed?.nucleus ?? '1H')}
              min={0.1}
              max={50}
              step={0.1}
              width={60}
              onCommit={(v) => setLineWidth(v)}
            />
            Hz
          </label>
        </div>
        <div className="actions">
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" disabled={!ready} onClick={add} title={ready ? '' : 'SI の文と引用元を入れてください'}>
            {editing ? '作り直す' : '図に追加'}
          </button>
        </div>
      </section>
    </Modal>
  );
}

import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ExperimentMeta } from '../lib/jdfMeta';
import { nucleusRich } from '../lib/nuclei';
import { solventInfo } from '../lib/solvents';
import { openDialog, openExperiments, readOptions } from '../state/fileOps';
import {
  NUCLEUS_FILTERS,
  canOpen,
  chosenFile,
  fileVersion,
  groupMeasurements,
  filteredExperiments,
  grantPermission,
  groupList,
  loadExperiment,
  localDay,
  nucleusFilterOf,
  pickFolder,
  sampleKeyOf,
  saveNote,
  scanFolder,
  supportsFolderAccess,
  toggleSelected,
  useLibrary,
  type Measurement,
  type NucleusFilter,
} from '../state/library';
import { setHomeSort, notify, useEditor } from '../state/store';
import type { HomeSort } from '../lib/settings';
import { RichHtml } from './RichText';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const FILTER_LABEL: Record<NucleusFilter, string> = { '1H': '^{1}H', '13C': '^{13}C', '19F': '^{19}F', '31P': '^{31}P', '2D': '2D', other: 'その他' };

export function Home() {
  const lib = useLibrary();
  const hasDoc = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const sort = useEditor((s) => s.settings.ui.homeSort);
  const list = useMemo(() => filteredExperiments(lib), [lib]);
  const groups = useMemo(() => groupList(list, sort), [list, sort]);
  const measurements = useMemo(() => groupMeasurements(lib.experiments), [lib.experiments]);
  const focusedM = measurements.find((m) => m.files.some((f) => f.key === lib.focus)) ?? null;
  const focused = focusedM?.files.find((f) => f.key === lib.focus) ?? null;

  return (
    <div className="home">
      <header className="home-header">
        <h1>NMR Figure Editor</h1>
        <FolderStatus />
        <div className="spacer" />
        <button onClick={() => void openDialog('new')}>ファイルを開く</button>
        {hasDoc && (
          <button className="primary" onClick={() => useEditor.setState({ screen: 'editor' })}>
            編集中の図に戻る →
          </button>
        )}
      </header>

      {lib.experiments.length > 0 && <Filters />}

      <div className="home-body">
        <main className="home-list">
          {lib.status === 'ready' && !lib.experiments.length && <p className="hint pad">このフォルダには .jdf がありません。</p>}
          {lib.experiments.length > 0 && !list.length && <p className="hint pad">条件に合う実験はありません。</p>}
          {groups.map((g) => (
            <section key={g.day ?? 'all'} className="day">
              {g.day && (
                <h2>
                  {formatDay(g.day)} <span className="muted">{g.samples.reduce((n, s) => n + s.items.length, 0)} 測定</span>
                </h2>
              )}
              {g.samples.map((s) => (
                <SampleCard key={s.sampleKey} sampleKey={s.sampleKey} items={s.items} showDay={!g.day} />
              ))}
            </section>
          ))}
          {lib.failed.length > 0 && (
            <details className="failed">
              <summary>読めなかったファイル ({lib.failed.length})</summary>
              <ul>
                {lib.failed.map((f) => (
                  <li key={f.fileName}>
                    {f.fileName}: {f.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </main>
        <aside className="home-detail">{focusedM && focused ? <Detail m={focusedM} e={focused} /> : <Welcome />}</aside>
      </div>

      {lib.selected.length > 0 && <SelectionBar />}
    </div>
  );
}

function FolderStatus() {
  const { status, folderName, progress, temporary, folderPermission } = useLibrary();
  // 拒否が覚えられているときは、押しても許可のダイアログが出ないので選び直してもらう
  const denied = folderPermission === 'denied';
  return (
    <div className="folder">
      {status === 'loading' && <span className="muted">読み込み中…</span>}
      {status === 'no-folder' && (
        <button className="primary" onClick={() => void pickFolder()}>
          データフォルダを選ぶ
        </button>
      )}
      {folderName && status !== 'no-folder' && (
        <>
          <span className="folder-name" title="データフォルダ">
            📁 {folderName}
            {temporary && <span className="muted"> (今回だけ)</span>}
          </span>
          {status === 'need-permission' && (
            <button
              className="primary"
              onClick={() => void grantPermission()}
              title={
                denied
                  ? 'ブラウザがこのフォルダへのアクセスを拒否した状態で覚えています。押すとフォルダを選び直せます'
                  : 'ブラウザにフォルダの読み取りを許可してもらいます'
              }
            >
              {denied ? 'フォルダを選び直す' : 'フォルダを読み込む'}
            </button>
          )}
          {status === 'scanning' && progress && (
            <span className="muted">
              読み込み中 {progress.done}/{progress.total}
            </span>
          )}
          {status === 'ready' && !temporary && (
            <button onClick={() => void scanFolder()} title="新しく測定したファイルを読み込む">
              更新
            </button>
          )}
          <button onClick={() => void pickFolder()}>変更</button>
        </>
      )}
    </div>
  );
}

function Filters() {
  const { query, nuclei, solvent, tag, experiments, notes } = useLibrary();
  const solvents = useMemo(() => [...new Set(experiments.map((e) => e.solvent ?? e.solventRaw).filter(Boolean))].sort(), [experiments]);
  const present = useMemo(() => new Set(experiments.map(nucleusFilterOf)), [experiments]);
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of Object.values(notes)) for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);
  const set = useLibrary.setState;
  return (
    <div className="home-filters">
      <input
        type="search"
        className="search"
        placeholder="サンプル名・ファイル名・メモ・タグで検索"
        value={query}
        onChange={(e) => set({ query: e.target.value })}
      />
      <div className="chips">
        {NUCLEUS_FILTERS.filter((n) => present.has(n)).map((n) => (
          <button
            key={n}
            className={`chip${nuclei.includes(n) ? ' on' : ''}`}
            onClick={() => set({ nuclei: nuclei.includes(n) ? nuclei.filter((x) => x !== n) : [...nuclei, n] })}
          >
            <RichHtml text={FILTER_LABEL[n]} />
          </button>
        ))}
      </div>
      <SortControl />
      <select value={solvent} onChange={(e) => set({ solvent: e.target.value })}>
        <option value="">すべての溶媒</option>
        {solvents.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {tags.length > 0 && (
        <div className="chips">
          {tags.map(([t, n]) => (
            <button key={t} className={`chip tag${tag === t ? ' on' : ''}`} onClick={() => set({ tag: tag === t ? '' : t })}>
              #{t} <span className="muted">{n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SORT_LABEL: Record<HomeSort['key'], [string, string, string]> = {
  // [選択肢の名前, 降順の説明, 昇順の説明]
  date: ['測定日', '新しい順', '古い順'],
  name: ['名前', 'Z → A', 'A → Z'],
  modified: ['編集順 (保存した日時)', '新しい順', '古い順'],
};

function SortControl() {
  const sort = useEditor((s) => s.settings.ui.homeSort);
  const [, descLabel, ascLabel] = SORT_LABEL[sort.key];
  return (
    <div className="sort">
      <label className="field">
        並び
        <select value={sort.key} onChange={(e) => setHomeSort({ key: e.target.value as HomeSort['key'] })}>
          {(Object.keys(SORT_LABEL) as HomeSort['key'][]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k][0]}
            </option>
          ))}
        </select>
      </label>
      <button
        className="chip"
        onClick={() => setHomeSort({ desc: !sort.desc })}
        title={`今は${sort.desc ? descLabel : ascLabel}。押すと${sort.desc ? ascLabel : descLabel}になります`}
      >
        {sort.desc ? '↓' : '↑'} {sort.desc ? descLabel : ascLabel}
      </button>
    </div>
  );
}

function SampleCard({ sampleKey, items, showDay }: { sampleKey: string; items: Measurement[]; showDay?: boolean }) {
  const note = useLibrary((s) => s.notes[sampleKey]);
  const selected = useLibrary((s) => s.selected);
  const focus = useLibrary((s) => s.focus);
  const choice = useLibrary((s) => s.versionChoice);
  const active = items.some((m) => m.files.some((f) => f.key === focus));
  const tap = useDoubleTap();
  // カードの空いている所をダブルタップしたら、選んでいる (なければ最初に開ける) 測定を開く
  const target = items.find((m) => m.files.some((f) => f.key === focus)) ?? items.find((m) => canOpen(m.main)) ?? items[0];
  return (
    <article
      className={`sample${active ? ' active' : ''}`}
      onClick={() => useLibrary.setState({ focus: chosenFile(items[0], choice).key })}
      onPointerUp={(ev) => tap(ev, `card:${sampleKey}`, () => openMeasurement(target, choice))}
    >
      <div className="scheme-thumb">{note?.scheme ? <BlobImage blob={note.scheme} alt="" /> : <span className="muted">スキームなし</span>}</div>
      <div className="sample-body">
        <div className="sample-title" title={sampleKey}>
          {sampleKey}
          {showDay && <span className="muted sample-day">{dayRange(items)}</span>}
          {note?.tags.map((t) => (
            <span key={t} className="tag-badge">
              #{t}
            </span>
          ))}
        </div>
        {note?.memo && <div className="sample-memo">{note.memo}</div>}
        <div className="experiments">
          {items.map((m) => (
            <ExperimentChip
              key={m.id}
              m={m}
              file={chosenFile(m, choice)}
              checked={m.files.some((f) => selected.includes(f.key))}
              focused={m.files.some((f) => f.key === focus)}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

/**
 * マウスのダブルクリックとタッチのダブルタップを同じように扱う。
 * (タッチ操作では dblclick が来ない環境があるため、pointerup の間隔で判定する)
 */
let lastTap: { id: string; t: number; x: number; y: number } | null = null;
function useDoubleTap() {
  return (ev: React.PointerEvent, id: string, action: () => void) => {
    if (ev.button !== 0 || (ev.target as Element).closest('input, button, textarea')) return;
    const now = performance.now();
    const prev = lastTap;
    if (prev && prev.id === id && now - prev.t < 500 && Math.hypot(ev.clientX - prev.x, ev.clientY - prev.y) < 24) {
      lastTap = null;
      ev.stopPropagation();
      action();
      return;
    }
    lastTap = { id, t: now, x: ev.clientX, y: ev.clientY };
  };
}

function openMeasurement(m: Measurement, choice: Record<string, string>) {
  const file = chosenFile(m, choice);
  if (canOpen(file)) {
    void openExperiments([file.key], 'new');
    return;
  }
  notify(`${file.fileName} は開けません`, 'error');
}

function ExperimentChip({ m, file, checked, focused }: { m: Measurement; file: ExperimentMeta; checked: boolean; focused: boolean }) {
  const choice = useLibrary((s) => s.versionChoice);
  const openable = canOpen(file);
  const processed = m.files.filter(canOpen).length;
  const tap = useDoubleTap();
  return (
    <div
      className={`exp${focused ? ' focused' : ''}${checked ? ' checked' : ''}${openable ? '' : ' disabled'}`}
      onClick={(ev) => {
        ev.stopPropagation();
        useLibrary.setState({ focus: file.key });
      }}
      onPointerUp={(ev) => {
        // 後ろのカードにも届くと、ダブルタップの記録が上書きされる
        ev.stopPropagation();
        tap(ev, `exp:${m.id}`, () => openMeasurement(m, choice));
      }}
      title={`${file.fileName}\nダブルクリック (ダブルタップ) で開く`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={!openable}
        aria-label={`${file.fileName} を選ぶ`}
        onClick={(ev) => ev.stopPropagation()}
        onChange={(ev) => {
          for (const f of m.files) if (f.key !== file.key) toggleSelected(f.key, false);
          toggleSelected(file.key, ev.target.checked);
        }}
      />
      <span className="exp-nuc">
        <RichHtml text={experimentLabel(file)} />
      </span>
      <span className="exp-time">{formatTime(file.measuredAt)}</span>
      {file.dimension >= 2 && (
        <span className="badge fid" title="2D の生データです。開くとこのアプリで 2次元の FT をして、等高線で表示します">
          2D
        </span>
      )}
      {file.dimension === 1 && !file.processed && (
        <span className="badge fid" title="Delta で処理していない生データです。開くとこのアプリで FT・位相補正します">
          FID
        </span>
      )}
      {processed > 1 && <span className="badge">{processed} 版</span>}
    </div>
  );
}

export function experimentLabel(e: ExperimentMeta) {
  if (e.dimension >= 2) return `${e.nuclei.map(nucleusRich).join('–')} ${e.experiment}`;
  const dec = e.decoupled && e.decoupled !== e.nuclei[0] ? `{${nucleusRich(e.decoupled)}}` : '';
  return `${nucleusRich(e.nuclei[0] ?? '?')}${dec}`;
}

function Detail({ m, e }: { m: Measurement; e: ExperimentMeta }) {
  const sampleKey = sampleKeyOf(e);
  const note = useLibrary((s) => s.notes[sampleKey]);
  const hasDoc = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const openable = canOpen(e);
  const choose = (key: string) =>
    useLibrary.setState((s) => ({
      focus: key,
      versionChoice: { ...s.versionChoice, [m.id]: key },
      // 別の版を選んだら、開く対象の選択も付け替える
      selected: s.selected.some((k) => m.files.some((f) => f.key === k)) ? [...s.selected.filter((k) => !m.files.some((f) => f.key === k)), key] : s.selected,
    }));
  return (
    <div className="detail">
      <h2 title={sampleKey}>{sampleKey}</h2>
      <SchemeBox sampleKey={sampleKey} scheme={note?.scheme ?? null} schemeSource={note?.schemeSource ?? null} />
      <NoteEditor key={sampleKey} sampleKey={sampleKey} memo={note?.memo ?? ''} tags={note?.tags ?? []} />
      <hr />
      <h3>
        <RichHtml text={experimentLabel(e)} /> <span className="muted">{e.experiment}</span>
      </h3>
      {m.files.length > 1 && (
        <label className="field block">
          ファイル ({m.files.length})
          <select value={e.key} onChange={(ev) => choose(ev.target.value)}>
            {m.files.map((f) => (
              <option key={f.key} value={f.key}>
                {f.dimension >= 2 ? '2D (このアプリで処理)' : f.processed ? `Delta で処理した版 ${fileVersion(f.fileName) || ''}` : '生データ (FID・このアプリで処理)'} — {f.fileName} (保存 {formatStamp(f.lastModified)})
              </option>
            ))}
          </select>
        </label>
      )}
      {e.dimension === 1 && <SpectrumPreview e={e} />}
      {e.dimension >= 2 && <p className="hint">2D の生データです。開くと 2次元の FT (サインベル窓・絶対値) をして、等高線で表示します。</p>}
      {e.dimension === 1 && !e.processed && <p className="hint">生データ (FID) です。開くと自動で FT・位相補正・ベースライン補正・溶媒での基準合わせをします。</p>}
      <dl className="facts">
        <Fact label="測定">{`${formatDay(localDay(e.measuredAt))} ${formatTime(e.measuredAt)}`}</Fact>
        <Fact label="周波数">{`${e.freqMHz.toFixed(1)} MHz`}</Fact>
        <Fact label="溶媒">{solventInfo(e.solvent) ? <RichHtml text={solventInfo(e.solvent)!.label} /> : e.solventRaw || '—'}</Fact>
        <Fact label="積算">{e.scans ?? '—'}</Fact>
        <Fact label="温度">{e.temperatureC !== null ? `${e.temperatureC.toFixed(1)} °C` : '—'}</Fact>
        <Fact label="ファイル">{e.fileName}</Fact>
      </dl>
      <div className="row wrap">
        <button className="primary" disabled={!openable} onClick={() => void openExperiments([e.key], 'new')}>
          この実験を開く
        </button>
        {hasDoc && (
          <button disabled={!openable} onClick={() => void openExperiments([e.key], 'add')}>
            編集中の図に追加
          </button>
        )}
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Welcome() {
  const { status, experiments } = useLibrary();
  return (
    <div className="detail welcome">
      <h2>実験を選んでください</h2>
      <ul className="hint">
        <li>クリックで右に内容を表示、ダブルクリックで開きます。</li>
        <li>チェックを付けて複数まとめて開くと、重ね書き・推移グラフに使えます。</li>
        <li>サンプルを選ぶと、スキーム画像 (ChemDraw などからコピーして貼り付け)・メモ・タグを付けられます。</li>
      </ul>
      {status === 'no-folder' && (
        <p className="hint">
          最初に .jdf が入っているフォルダを選んでください。{supportsFolderAccess() ? '次からは自動で読み込みます。' : 'このブラウザでは毎回選ぶ必要があります (Chrome / Edge なら覚えておけます)。'}
        </p>
      )}
      {experiments.length > 0 && <p className="muted">{experiments.length} 件の実験</p>}
    </div>
  );
}

const SchemeEditor = lazy(() => import('./SchemeEditor'));

function SchemeBox({ sampleKey, scheme, schemeSource }: { sampleKey: string; scheme: Blob | null; schemeSource: string | null }) {
  const [drawing, setDrawing] = useState(false);
  const save = (blob: Blob | null) => void saveNote(sampleKey, { scheme: blob, schemeSource: null });

  // 入力欄以外にフォーカスがあるときの Ctrl+V は、このサンプルのスキームとして貼る
  useEffect(() => {
    const onPaste = (ev: ClipboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target.closest?.('input, textarea')) return;
      const file = [...(ev.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (!file) return;
      ev.preventDefault();
      save(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [sampleKey]);

  const choose = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => input.files?.[0] && save(input.files[0]);
    input.click();
  };

  return (
    <div
      className={`scheme-box${scheme ? '' : ' empty'}`}
      tabIndex={0}
      onDragOver={(ev) => {
        if ([...ev.dataTransfer.items].some((i) => i.type.startsWith('image/'))) {
          ev.preventDefault();
          ev.stopPropagation();
        }
      }}
      onDrop={(ev) => {
        const file = [...ev.dataTransfer.files].find((f) => f.type.startsWith('image/'));
        if (!file) return;
        ev.preventDefault();
        ev.stopPropagation();
        save(file);
      }}
    >
      {scheme ? <BlobImage blob={scheme} alt="スキーム" /> : <span className="muted">「描く」か、画像を貼り付け (Ctrl+V)・ドロップ</span>}
      <div className="scheme-actions">
        <button className="mini primary" onClick={() => setDrawing(true)} title="構造式や反応式をこのアプリで描きます">
          {schemeSource ? '描き直す' : '描く'}
        </button>
        <button className="mini" onClick={choose}>
          画像を選ぶ
        </button>
        {scheme && (
          <button className="mini danger" onClick={() => save(null)}>
            外す
          </button>
        )}
      </div>
      {drawing && (
        <Suspense fallback={<div className="scheme-editor loading">スキームを描く画面を読み込んでいます…</div>}>
          <SchemeEditor
            sampleKey={sampleKey}
            source={schemeSource}
            onClose={() => setDrawing(false)}
            onSave={({ image, source }) => {
              void saveNote(sampleKey, { scheme: image, schemeSource: source });
              setDrawing(false);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

function NoteEditor({ sampleKey, memo, tags }: { sampleKey: string; memo: string; tags: string[] }) {
  const [text, setText] = useState(memo);
  const [tagText, setTagText] = useState(tags.join(', '));
  useEffect(() => setText(memo), [memo]);
  useEffect(() => setTagText(tags.join(', ')), [tags]);
  return (
    <div className="note">
      <label className="field block">
        メモ
        <textarea rows={2} value={text} placeholder="反応名、ノート番号など" onChange={(e) => setText(e.target.value)} onBlur={() => text !== memo && void saveNote(sampleKey, { memo: text })} />
      </label>
      <label className="field block">
        タグ (カンマ区切り)
        <input
          type="text"
          value={tagText}
          placeholder="例: W錯体, 反応追跡"
          onChange={(e) => setTagText(e.target.value)}
          onBlur={() => {
            const next = [...new Set(tagText.split(/[,、]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];
            if (next.join('\n') !== tags.join('\n')) void saveNote(sampleKey, { tags: next });
          }}
        />
      </label>
      <p className="hint">メモ・タグ・スキームは、同じサンプル名の測定すべてに共通です。</p>
    </div>
  );
}

const previewCache = new Map<string, { path: string; ticks: { x: number; label: string }[] }>();
const PW = 320;
const PH = 120;

function SpectrumPreview({ e }: { e: ExperimentMeta }) {
  const [state, setState] = useState<{ key: string; path: string; ticks: { x: number; label: string }[] } | { key: string; error: string } | null>(
    previewCache.has(e.key) ? { key: e.key, ...previewCache.get(e.key)! } : null,
  );
  useEffect(() => {
    let cancelled = false;
    const cached = previewCache.get(e.key);
    if (cached) {
      setState({ key: e.key, ...cached });
      return;
    }
    setState(null);
    loadExperiment(e.key, readOptions())
      .then(({ meta, data }) => {
        const result = previewPath(meta.first, meta.last, data);
        previewCache.set(e.key, result);
        if (!cancelled) setState({ key: e.key, ...result });
      })
      .catch((err: Error) => !cancelled && setState({ key: e.key, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [e.key]);
  if (!state || state.key !== e.key) return <div className="preview loading">読み込み中…</div>;
  if ('error' in state) return <p className="hint warn">{state.error}</p>;
  return (
    <svg className="preview" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label="スペクトルのプレビュー">
      <path d={state.path} fill="none" stroke="#1f9e1f" strokeWidth={0.8} />
      <line x1={0} y1={PH - 14} x2={PW} y2={PH - 14} stroke="#999" strokeWidth={0.5} />
      {state.ticks.map((t) => (
        <text key={t.label} x={t.x} y={PH - 3} fontSize={9} textAnchor="middle" fill="#667085">
          {t.label}
        </text>
      ))}
    </svg>
  );
}

/** 全範囲を 1px ごとの最小・最大で描く */
function previewPath(first: number, last: number, data: Float32Array) {
  const n = data.length;
  let max = 0;
  for (const v of data) if (v > max) max = v;
  const cols = PW;
  const h = PH - 20;
  const y = (v: number) => (PH - 16 - (v / (max || 1)) * h).toFixed(1);
  const parts: string[] = [];
  for (let c = 0; c < cols; c++) {
    const i0 = Math.floor((c / cols) * n);
    const i1 = Math.max(i0 + 1, Math.floor(((c + 1) / cols) * n));
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = i0; i < i1; i++) {
      if (data[i] < lo) lo = data[i];
      if (data[i] > hi) hi = data[i];
    }
    parts.push(`${c ? 'L' : 'M'}${c} ${y(lo)}L${c} ${y(hi)}`);
  }
  const span = first - last;
  const step = span > 100 ? 50 : span > 30 ? 20 : 2;
  const ticks: { x: number; label: string }[] = [];
  for (let v = Math.ceil(last / step) * step; v <= first; v += step) ticks.push({ x: ((first - v) / span) * PW, label: String(v) });
  return { path: parts.join(''), ticks };
}

function SelectionBar() {
  const selected = useLibrary((s) => s.selected);
  const hasDoc = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  return (
    <div className="selection-bar">
      <span>{selected.length} 件を選択中</span>
      <button className="primary" onClick={() => void openExperiments(selected, 'new')}>
        新しい図で開く
      </button>
      {hasDoc && <button onClick={() => void openExperiments(selected, 'add')}>編集中の図に追加</button>}
      <button onClick={() => useLibrary.setState({ selected: [] })}>選択を解除</button>
    </div>
  );
}

const urls = new WeakMap<Blob, string>();
function BlobImage({ blob, alt }: { blob: Blob; alt: string }) {
  let url = urls.get(blob);
  if (!url) {
    url = URL.createObjectURL(blob);
    urls.set(blob, url);
  }
  return <img src={url} alt={alt} draggable={false} />;
}

/** 測定した日。何日かにまたがっていれば「〜」でつなぐ */
function dayRange(items: Measurement[]) {
  const first = localDay(items[0].main.measuredAt);
  const last = localDay(items[items.length - 1].main.measuredAt);
  return first === last ? formatDay(last) : `${formatDay(first)} 〜 ${formatDay(last)}`;
}

function formatDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const w = WEEKDAYS[new Date(y, m - 1, d).getDay()];
  return `${y}年${m}月${d}日 (${w})`;
}

function formatStamp(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(ms)}`;
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

import { currentLang, tr, trk } from '../i18n';
import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { ExperimentMeta } from '../lib/jdfMeta';
import { nucleusRich } from '../lib/nuclei';
import { solventInfo } from '../lib/solvents';
import { openDialog, openExperiments, openSavedFigure, readOptions } from '../state/fileOps';
import {
  NUCLEUS_FILTERS,
  canOpen,
  chosenFile,
  deleteFigure,
  fileVersion,
  filteredExperiments,
  grantPermission,
  groupList,
  groupMeasurements,
  listedFiles,
  loadExperiment,
  localDay,
  nucleusFilterOf,
  pickFolder,
  sampleKeyOf,
  saveNote,
  scanFolder,
  supportsFolderAccess,
  toggleSelected,
  unlistedFigures,
  useLibrary,
  type Measurement,
  type NucleusFilter,
  type SavedFigure,
} from '../state/library';
import { setHomeSort, notify, useEditor } from '../state/store';
import type { HomeSort } from '../lib/settings';
import { Icon } from './Icon';
import { openOnboarding } from './Onboarding';
import { RichHtml } from './RichText';
import { IconButton } from './ui';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const FILTER_LABEL: Record<NucleusFilter, string> = { '1H': '^{1}H', '13C': '^{13}C', '19F': '^{19}F', '31P': '^{31}P', '2D': '2D', other: trk('その他') };

export function Home() {
  const lib = useLibrary();
  const hasDoc = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  const sort = useEditor((s) => s.settings.ui.homeSort);
  const list = useMemo(() => filteredExperiments(lib), [lib]);
  const groups = useMemo(() => groupList(list, sort), [list, sort]);
  const measurements = useMemo(() => groupMeasurements(listedFiles(lib)), [lib]);
  const focusedM = measurements.find((m) => m.files.some((f) => f.key === lib.focus)) ?? null;
  const focused = focusedM?.files.find((f) => f.key === lib.focus) ?? null;

  return (
    <div className="home">
      <header className="home-header">
        <h1>NMR Figure Editor</h1>
        <FolderStatus />
        <div className="spacer" />
        <button className="btn ghost" onClick={openOnboarding} title={tr('初めて開いたときの使い方の説明を、もう一度見る')}>
          <Icon name="book-open" size={16} />
          {tr('使い方')}
        </button>
        <button className="btn" onClick={() => void openDialog('new')}>
          <Icon name="folder-open" size={16} />
          {tr('ファイルを開く')}
        </button>
        {hasDoc && (
          <button className="btn" onClick={() => useEditor.setState({ screen: 'editor' })}>
            {tr('編集中の図に戻る')}
            <Icon name="arrow-right" size={16} />
          </button>
        )}
      </header>

      {lib.experiments.length > 0 && <Filters />}

      <div className="home-body">
        <main className="home-list">
          {lib.status === 'ready' && !lib.experiments.length && <p className="hint pad">{tr('このフォルダには .jdf がありません。')}</p>}
          {lib.experiments.length > 0 && !list.length && <p className="hint pad">{tr('条件に合う実験はありません。')}</p>}
          {groups.map((g) => (
            <section key={g.day ?? 'all'} className="day">
              {g.day && (
                <h2>
                  {formatDay(g.day)} <span className="muted">{tr('{n} 測定', { n: g.samples.reduce((n, s) => n + s.items.length, 0) })}</span>
                </h2>
              )}
              <div className="day-samples">
                {g.samples.map((s) => (
                  <SampleCard key={s.sampleKey} sampleKey={s.sampleKey} items={s.items} showDay={!g.day} />
                ))}
              </div>
            </section>
          ))}
          {lib.failed.length > 0 && (
            <details className="failed">
              <summary>{tr('読めなかったファイル ({n})', { n: lib.failed.length })}</summary>
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
      {status === 'loading' && <span className="muted">{tr('読み込み中…')}</span>}
      {status === 'no-folder' && (
        <button className="btn primary" onClick={() => void pickFolder()}>
          <Icon name="folder-open" size={16} />
          {tr('データフォルダを選ぶ')}
        </button>
      )}
      {folderName && status !== 'no-folder' && (
        <>
          <Icon name="folder-open" size={16} />
          <span className="folder-name" title={tr('データフォルダ')}>
            {folderName}
            {temporary && <span className="muted"> {' '}{tr('(今回だけ)')}</span>}
          </span>
          {status === 'need-permission' && (
            <button
              className="btn primary"
              onClick={() => void grantPermission()}
              title={
                denied
                  ? tr('ブラウザがこのフォルダへのアクセスを拒否した状態で覚えています。押すとフォルダを選び直せます')
                  : tr('ブラウザにフォルダの読み取りを許可してもらいます')
              }
            >
              {denied ? tr('フォルダを選び直す') : tr('フォルダを読み込む')}
            </button>
          )}
          {status === 'scanning' && progress && (
            <span className="muted">
              {tr('読み込み中 {done}/{total}', { done: progress.done, total: progress.total })}
            </span>
          )}
          {status === 'ready' && !temporary && <IconButton icon="refresh" size="sm" label={tr('読み込み直す (新しく測定したファイル)')} onClick={() => void scanFolder()} />}
          <button className="btn ghost sm" onClick={() => void pickFolder()}>
            {tr('フォルダを変更')}
          </button>
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
      <label className="home-search">
        <Icon name="search" size={16} />
        <input
          type="search"
          placeholder={tr('サンプル名・ファイル名・メモ・タグで検索')}
          aria-label={tr('検索')}
          value={query}
          onChange={(e) => set({ query: e.target.value })}
        />
      </label>
      <div className="chips">
        {NUCLEUS_FILTERS.filter((n) => present.has(n)).map((n) => (
          <button
            key={n}
            className={`chip${nuclei.includes(n) ? ' on' : ''}`}
            onClick={() => set({ nuclei: nuclei.includes(n) ? nuclei.filter((x) => x !== n) : [...nuclei, n] })}
          >
            <span>
              <RichHtml text={n === 'other' ? tr(FILTER_LABEL[n]) : FILTER_LABEL[n]} />
            </span>
          </button>
        ))}
      </div>
      <SortControl />
      <select value={solvent} aria-label={tr('溶媒')} onChange={(e) => set({ solvent: e.target.value })}>
        <option value="">{tr('すべての溶媒')}</option>
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
  date: [trk('測定日'), trk('新しい順'), trk('古い順')],
  name: [trk('名前'), trk('Z → A'), trk('A → Z')],
  modified: [trk('編集順 (保存した日時)'), trk('新しい順'), trk('古い順')],
};

function SortControl() {
  const sort = useEditor((s) => s.settings.ui.homeSort);
  const [, descLabel, ascLabel] = SORT_LABEL[sort.key].map((s) => tr(s));
  return (
    <div className="sort">
      <label className="field">
        {tr('並び')}
        <select value={sort.key} onChange={(e) => setHomeSort({ key: e.target.value as HomeSort['key'] })}>
          {(Object.keys(SORT_LABEL) as HomeSort['key'][]).map((k) => (
            <option key={k} value={k}>
              {tr(SORT_LABEL[k][0])}
            </option>
          ))}
        </select>
      </label>
      <button
        className="chip"
        onClick={() => setHomeSort({ desc: !sort.desc })}
        title={tr('今は{v0}。押すと{v1}になります', { v0: sort.desc ? descLabel : ascLabel, v1: sort.desc ? ascLabel : descLabel })}
      >
        <Icon name={sort.desc ? 'arrow-down' : 'arrow-up'} size={16} />
        {sort.desc ? descLabel : ascLabel}
      </button>
    </div>
  );
}

function SampleCard({ sampleKey, items, showDay }: { sampleKey: string; items: Measurement[]; showDay?: boolean }) {
  const note = useLibrary((s) => s.notes[sampleKey]);
  // セレクタで filter すると毎回別の配列になって再描画が止まらないので、取り出してから絞る
  // 保存した図は、ふつうは元の測定の「編集した版」として札にまとまる。元の測定がフォルダにない図だけ、ここに図のまま出す
  const allFigures = useLibrary((s) => s.figures);
  const experiments = useLibrary((s) => s.experiments);
  const figures = useMemo(
    () => unlistedFigures({ experiments, figures: allFigures }).filter((f) => f.sampleKeys.includes(sampleKey)),
    [experiments, allFigures, sampleKey],
  );
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
      {note?.scheme && (
        <div className="scheme-thumb">
          <BlobImage blob={note.scheme} alt="" />
        </div>
      )}
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
          {figures.map((f) => (
            <FigureChip key={f.id} figure={f} />
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
    if (ev.button !== 0 || (ev.target as Element).closest('input, textarea, .exp.figure button')) return;
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
  notify(tr('{fileName} は開けません', { fileName: file.fileName }), 'error');
}

function ExperimentChip({ m, file, checked, focused }: { m: Measurement; file: ExperimentMeta; checked: boolean; focused: boolean }) {
  const choice = useLibrary((s) => s.versionChoice);
  const openable = canOpen(file);
  const processed = m.files.filter(canOpen).length;
  const tap = useDoubleTap();
  const label = `${file.fileName} (${formatTime(file.measuredAt)})`;
  return (
    <div className={`exp${focused ? ' focused' : ''}${checked ? ' checked' : ''}${openable ? '' : ' disabled'}`} onClick={(ev) => ev.stopPropagation()}>
      <input
        type="checkbox"
        checked={checked}
        disabled={!openable}
        aria-label={tr('{label} を選ぶ (まとめて開く)', { label })}
        onChange={(ev) => {
          for (const f of m.files) if (f.key !== file.key) toggleSelected(f.key, false);
          toggleSelected(file.key, ev.target.checked);
        }}
      />
      <button
        type="button"
        className="exp-open"
        aria-pressed={focused}
        aria-label={tr('{label}。Enter で開く', { label })}
        title={tr('{fileName}\nクリックで右に内容、ダブルクリック (ダブルタップ) か Enter で開く', { fileName: file.fileName })}
        onClick={() => useLibrary.setState({ focus: file.key })}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            openMeasurement(m, choice);
          }
        }}
        onPointerUp={(ev) => {
          // 後ろのカードにも届くと、ダブルタップの記録が上書きされる
          ev.stopPropagation();
          tap(ev, `exp:${m.id}`, () => openMeasurement(m, choice));
        }}
      >
        <span className="exp-nuc">
          <RichHtml text={experimentLabel(file)} />
        </span>
        <span className="exp-time">{formatTime(file.measuredAt)}</span>
        {file.figure && (
          <span className="badge" title={tr('このソフトで編集して保存した版です。開くと、ピーク値・積分・重ね書きなども含めた図ごと開きます (ほかの版は右の「ファイル」で選べます)')}>
            {tr('編集')}
          </span>
        )}
        {!file.figure && file.dimension >= 2 && (
          <span className="badge fid" title={tr('2D の生データです。開くとこのアプリで 2次元の FT をして、等高線で表示します')}>
            2D
          </span>
        )}
        {!file.figure && file.dimension === 1 && !file.processed && (
          <span className="badge fid" title={tr('Delta で処理していない生データです。開くとこのアプリで FT・位相補正します')}>
            FID
          </span>
        )}
        {processed > 1 && <span className="badge">{tr('{n} 版', { n: processed })}</span>}
      </button>
    </div>
  );
}

/** 保存した図 (比較) のチップ。クリックで開く */
function FigureChip({ figure }: { figure: SavedFigure }) {
  return (
    <div className="exp figure" onClick={(ev) => ev.stopPropagation()} onPointerUp={(ev) => ev.stopPropagation()}>
      <button
        type="button"
        className="exp-open"
        title={tr('{name}\n{layers} 本を重ねた図 ({formatStamp})', { name: figure.name, layers: figure.layers, formatStamp: formatStamp(figure.savedAt) })}
        aria-label={tr('保存した図 {name} を開く', { name: figure.name })}
        onClick={() => void openSavedFigure(figure.id)}
      >
        <Icon name="file-text" size={16} />
        <span className="exp-nuc">
          {tr('図')}{' '}<RichHtml text={figure.nuclei.map(nucleusRich).join(' + ')} />
        </span>
        <span className="exp-time">{formatTime(figure.savedAt)}</span>
        {figure.layers > 1 && <span className="badge">{tr('{n} 本', { n: figure.layers })}</span>}
      </button>
      <IconButton icon="x" size="sm" label={tr('{name} をホーム画面から消す (測定データは消えません)', { name: figure.name })} onClick={() => void deleteFigure(figure.id)} />
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
  const selecting = useLibrary((s) => s.selected.length > 0);
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
          {tr('ファイル ({n})', { n: m.files.length })}
          <select value={e.key} onChange={(ev) => choose(ev.target.value)}>
            {m.files.map((f) => (
              <option key={f.key} value={f.key}>
                {versionLabel(f)} — {f.fileName} {tr('(保存 {time})', { time: formatStamp(f.lastModified) })}
              </option>
            ))}
          </select>
        </label>
      )}
      {/* ブラウザに残した図は、元の測定のファイルでプレビューする */}
      {e.dimension === 1 && <SpectrumPreview e={e.baseKey ? { ...e, key: e.baseKey } : e} />}
      {e.figure ? (
        <p className="hint">
          
          {e.figure.layers > 1 ? tr('このソフトで編集して保存した版です ({layers} 本を重ねた図)。開くと、ピーク値・積分・図形なども含めた図ごと開きます。', { layers: e.figure.layers }) : tr('このソフトで編集して保存した版です。開くと、ピーク値・積分・図形なども含めた図ごと開きます。')}
          {e.savedFigureId ? '' : tr(' Delta でもこのファイルを開けます (見えるのは一番下のスペクトル)。')}
        </p>
      ) : (
        <>
          {e.dimension >= 2 && <p className="hint">{tr('2D の生データです。開くと 2次元の FT (サインベル窓・絶対値) をして、等高線で表示します。')}</p>}
          {e.dimension === 1 && !e.processed && <p className="hint">{tr('生データ (FID) です。開くと自動で FT・位相補正・ベースライン補正・溶媒での基準合わせをします。')}</p>}
        </>
      )}
      <dl className="facts">
        <Fact label={tr('測定')}>{`${formatDay(localDay(e.measuredAt))} ${formatTime(e.measuredAt)}`}</Fact>
        <Fact label={tr('周波数')}>{`${e.freqMHz.toFixed(1)} MHz`}</Fact>
        <Fact label={tr('溶媒')}>{solventInfo(e.solvent) ? <RichHtml text={solventInfo(e.solvent)!.label} /> : e.solventRaw || '—'}</Fact>
        <Fact label={tr('積算')}>{e.scans ?? '—'}</Fact>
        <Fact label={tr('温度')}>{e.temperatureC !== null ? `${e.temperatureC.toFixed(1)} °C` : '—'}</Fact>
        <Fact label={tr('ファイル')}>{e.fileName}</Fact>
      </dl>
      <div className="row wrap">
        <button className={`btn${selecting ? '' : ' primary'}`} disabled={!openable} onClick={() => void openExperiments([e.key], 'new')}>
          {e.figure ? tr('この図を開く') : tr('この実験を開く')}
        </button>
        {hasDoc && !e.savedFigureId && (
          <button className="btn" disabled={!openable} onClick={() => void openExperiments([e.key], 'add')}>
            {tr('編集中の図に追加')}
          </button>
        )}
        {e.savedFigureId && (
          <button className="btn" onClick={() => void deleteFigure(e.savedFigureId!)} title={tr('ブラウザの中に残した図の控えを消します (保存したファイルと測定データは消えません)')}>
            {tr('この版をホーム画面から消す')}
          </button>
        )}
      </div>
    </div>
  );
}

/** 版の選択肢の名前 */
function versionLabel(f: ExperimentMeta) {
  if (f.figure) return f.figure.layers > 1 ? tr('このソフトで編集した版 ({layers} 本を重ねた図)', { layers: f.figure.layers }) : tr('このソフトで編集した版');
  if (f.dimension >= 2) return tr('2D (このアプリで処理)');
  return f.processed ? tr('Delta で処理した版 {v0}', { v0: fileVersion(f.fileName) || '' }) : tr('生データ (FID・このアプリで処理)');
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
      <h2>{tr('実験を選んでください')}</h2>
      <ul className="hint">
        <li>{tr('クリックで右に内容を表示、ダブルクリックで開きます。')}</li>
        <li>{tr('チェックを付けて複数まとめて開くと、重ね書き・推移グラフに使えます。')}</li>
        <li>{tr('サンプルを選ぶと、スキーム画像 (ChemDraw などからコピーして貼り付け)・メモ・タグを付けられます。')}</li>
      </ul>
      {status === 'no-folder' && (
        <p className="hint">
          {supportsFolderAccess()
            ? tr('最初に .jdf が入っているフォルダを選んでください。次からは自動で読み込みます。')
            : tr('最初に .jdf が入っているフォルダを選んでください。このブラウザでは毎回選ぶ必要があります (Chrome / Edge なら覚えておけます)。')}
        </p>
      )}
      {experiments.length > 0 && <p className="muted">{tr('{n} 件の実験', { n: experiments.length })}</p>}
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
      {scheme ? <BlobImage blob={scheme} alt={tr('スキーム')} /> : <span className="muted">{tr('「描く」か、画像を貼り付け (Ctrl+V)・ドロップ')}</span>}
      <div className="scheme-actions">
        <button className="mini" onClick={() => setDrawing(true)} title={tr('構造式や反応式をこのアプリで描きます')}>
          {schemeSource ? tr('描き直す') : tr('描く')}
        </button>
        <button className="mini" onClick={choose}>
          {tr('画像を選ぶ')}
        </button>
        {scheme && (
          <button className="mini danger" onClick={() => save(null)}>
            {tr('外す')}
          </button>
        )}
      </div>
      {drawing && (
        <Suspense fallback={<div className="scheme-editor loading">{tr('スキームを描く画面を読み込んでいます…')}</div>}>
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
        {tr('メモ')}
        <textarea rows={2} value={text} placeholder={tr('反応名、ノート番号など')} onChange={(e) => setText(e.target.value)} onBlur={() => text !== memo && void saveNote(sampleKey, { memo: text })} />
      </label>
      <label className="field block">
        {tr('タグ (カンマ区切り)')}
        <input
          type="text"
          value={tagText}
          placeholder={tr('例: W錯体, 反応追跡')}
          onChange={(e) => setTagText(e.target.value)}
          onBlur={() => {
            const next = [...new Set(tagText.split(/[,、]/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean))];
            if (next.join('\n') !== tags.join('\n')) void saveNote(sampleKey, { tags: next });
          }}
        />
      </label>
      <p className="hint">{tr('メモ・タグ・スキームは、同じサンプル名の測定すべてに共通です。')}</p>
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
  if (!state || state.key !== e.key) return <div className="preview loading">{tr('読み込み中…')}</div>;
  if ('error' in state) return <p className="hint warn">{state.error}</p>;
  return (
    <svg className="preview" viewBox={`0 0 ${PW} ${PH}`} role="img" aria-label={tr('スペクトルのプレビュー')}>
      <path className="preview-line" d={state.path} fill="none" strokeWidth={0.8} />
      <line className="preview-axis" x1={0} y1={PH - 14} x2={PW} y2={PH - 14} strokeWidth={0.5} />
      {state.ticks.map((t) => (
        <text className="preview-tick" key={t.label} x={t.x} y={PH - 3} fontSize={9} textAnchor="middle">
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
  for (let v = Math.ceil(last / step) * step; v <= first; v += step) {
    const x = ((first - v) / span) * PW;
    // 端に掛かる目盛りは文字が切れるので出さない
    if (x > 12 && x < PW - 12) ticks.push({ x, label: String(v) });
  }
  return { path: parts.join(''), ticks };
}

/** チェックを付けた測定をまとめて開く帯 (下に浮かぶ) */
function SelectionBar() {
  const selected = useLibrary((s) => s.selected);
  const hasDoc = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);
  return (
    <div className="home-select-bar bar" role="region" aria-label={tr('選んだ測定')}>
      <span className="count">{tr('{n} 件を選択中', { n: selected.length })}</span>
      <button className="btn primary" onClick={() => void openExperiments(selected, 'new')}>
        {tr('新しい図で開く')}
      </button>
      {hasDoc && (
        <button className="btn" onClick={() => void openExperiments(selected, 'add')}>
          {tr('編集中の図に追加')}
        </button>
      )}
      <IconButton icon="x" size="sm" label={tr('選択を解除')} onClick={() => useLibrary.setState({ selected: [] })} />
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
  return first === last ? formatDay(last) : tr('{formatDay} 〜 {formatDay2}', { formatDay: formatDay(first), formatDay2: formatDay(last) });
}

function formatDay(day: string) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (currentLang() === 'en') return date.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
  return `${y}年${m}月${d}日 (${WEEKDAYS[date.getDay()]})`;
}

function formatStamp(ms: number) {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()} ${formatTime(ms)}`;
}

function formatTime(ms: number) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

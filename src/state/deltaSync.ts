/**
 * Delta との同期。図に入っている「Delta で処理済みの .jdf」ごとに、ピーク値・積分を自動で行き来させる。
 *
 * - このアプリで変えたら、少し待ってから (DEBOUNCE) 同じ .jdf の注釈を書き換える (上書き)
 * - Delta で保存されたら、次に見に行ったとき (POLL ごと・画面に戻ってきたとき) に読み込んで図に入れる
 * - 両方で変わっていたら、あとから変えた方を使う。使わなかった方も記録 (state/history.ts) に残す
 * - 書く前のファイルは必ず記録に残す (初めて書くときはファイルを丸ごと)。記録からどの時点にも戻せる
 * - Delta で開いたままの画面は外から書き換えられないので、Delta ではファイルを開き直すと反映される
 */
import { create } from 'zustand';
import { dbGet, dbPut } from '../lib/db';
import { annotationKey, applyAnnotations, canSyncDelta, fileAnnotations, layerAnnotations, shownValues, summary } from '../lib/deltaSync';
import { downloadBlob, baseName } from '../lib/exportFigure';
import { readJdf } from '../lib/jdf';
import { annotationBlock, withAnnotationBlock, writeAnnotations, type WritableAnnotations } from '../lib/jdfWrite';
import { invalidateSavedData } from './autosave';
import { ask } from './dialog';
import { addHistory, keepOriginal, originalOf, type HistoryEntry } from './history';
import { folderFileHandle, folderWritePermission, useLibrary } from './library';
import { edit, notify, useEditor, type FileHandle } from './store';
import type { SpectrumMeta } from './types';

export type SyncStatus = 'waiting' | 'synced' | 'pending' | 'need-permission' | 'error' | 'duplicate';

export interface LinkView {
  fileName: string;
  status: SyncStatus;
  message: string;
  /** 最後に合わせた時刻と向き (pull = Delta → このソフト、push = このソフト → Delta) */
  lastSyncAt: number | null;
  direction: 'pull' | 'push' | null;
}

/** 画面に出す同期の様子 (layerId → 様子) */
export const useSync = create<{ links: Record<string, LinkView> }>(() => ({ links: {} }));

interface Link {
  layerId: string;
  spectrumId: string;
  fileName: string;
  handle: FileHandle | null;
  /** 最後に合わせたときのファイルの更新時刻と中身の鍵 */
  mtime: number | null;
  key: string | null;
  /** このアプリで変えたのに、まだ書いていない変更の時刻 */
  localChangedAt: number | null;
  attached: boolean;
  chain: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
}

/** 書き込みを許してもらえなかったとき (アプリの中のブラウザは、許可の確認そのものを出せない) */
const NO_PERMISSION =
  'Delta のファイルへの書き込みが許可されていません。アプリの中のブラウザなど、許可の確認を出せない所では書き込めないので、Chrome か Edge で開いてください (このソフトでの変更は図に残っています)';

/** 変更が止まってから書くまでの待ち時間 */
const DEBOUNCE = 1500;
/** Delta で保存されたかを見に行く間隔 */
const POLL = 4000;

const links = new Map<string, Link>();
/** ドロップ・「開く」で開いた .jdf (データフォルダの外でも同期できるように) */
const extraHandles = new Map<string, FileHandle>();
/** Delta の中身を図に入れている最中 (その変更を「このアプリでの編集」と取り違えないため) */
let applying = false;

export function registerJdfHandle(fileName: string, handle: FileHandle) {
  extraHandles.set(fileName, handle);
}

// ---------------------------------------------------------------- 始める

export function startDeltaSync() {
  useEditor.subscribe((s, prev) => {
    if (s.doc === prev.doc && s.data === prev.data) return;
    reconcile();
    if (!applying) onEdited();
  });
  // フォルダを読み込んだら、待っていたスペクトルを同期し始める
  useLibrary.subscribe((s, prev) => {
    if (s.experiments !== prev.experiments || s.status !== prev.status) retryWaiting();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') pollAll();
  }, POLL);
  // Delta から切り替えて戻ってきたら、すぐ見に行く
  window.addEventListener('focus', pollAll);
  reconcile();
}

/** 図のスペクトルと同期の組をそろえる (足されたら始め、消えたら止める) */
function reconcile() {
  const { doc, data } = useEditor.getState();
  const wanted = new Map<string, { spectrumId: string; fileName: string }>();
  const byFile = new Set<string>();
  const duplicates: string[] = [];
  for (const layer of doc.layers) {
    const meta = doc.spectra.find((s) => s.id === layer.spectrumId);
    if (!canSyncDelta(meta) || !data[meta.id]) continue;
    // 同じファイルを 2 本入れたときは、最初の 1 本だけ同期する
    if (byFile.has(meta.fileName)) {
      duplicates.push(layer.id);
      continue;
    }
    byFile.add(meta.fileName);
    wanted.set(layer.id, { spectrumId: meta.id, fileName: meta.fileName });
  }
  for (const [layerId, link] of links) {
    const w = wanted.get(layerId);
    if (w && w.fileName === link.fileName && w.spectrumId === link.spectrumId) continue;
    clearTimeout(link.timer);
    links.delete(layerId);
  }
  const views: Record<string, LinkView> = {};
  for (const [layerId, w] of wanted) {
    let link = links.get(layerId);
    if (!link) {
      link = { layerId, ...w, handle: null, mtime: null, key: null, localChangedAt: null, attached: false, chain: Promise.resolve() };
      links.set(layerId, link);
      const l = link;
      queue(l, () => attach(l));
    }
    views[layerId] = useSync.getState().links[layerId] ?? blankView(w.fileName);
  }
  const current = useSync.getState().links;
  for (const layerId of duplicates) {
    views[layerId] = current[layerId]?.status === 'duplicate' ? current[layerId] : { ...blankView(''), status: 'duplicate', message: '同じ .jdf がほかのスペクトルで同期しているので、こちらは同期しません' };
  }
  const same = Object.keys(views).length === Object.keys(current).length && Object.keys(views).every((k) => views[k] === current[k]);
  if (!same) useSync.setState({ links: views });
}

function blankView(fileName: string): LinkView {
  return { fileName, status: 'waiting', message: 'Delta のファイルを確かめています…', lastSyncAt: null, direction: null };
}

function show(link: Link, patch: Partial<LinkView>) {
  if (links.get(link.layerId) !== link) return;
  const before = useSync.getState().links[link.layerId] ?? blankView(link.fileName);
  const next = { ...before, ...patch };
  if ((Object.keys(next) as (keyof LinkView)[]).every((k) => next[k] === before[k])) return;
  useSync.setState((s) => ({ links: { ...s.links, [link.layerId]: next } }));
}

/** 1 つの .jdf への読み書きは 1 つずつ順に行う */
function queue(link: Link, fn: () => Promise<void>) {
  link.chain = link.chain.then(fn).catch((e) => {
    show(link, { status: 'error', message: errorText(e) });
  });
  return link.chain;
}

function errorText(e: unknown) {
  const err = e as Error;
  if (err?.name === 'NoModificationAllowedError' || err?.name === 'InvalidStateError') {
    return 'ファイルに書き込めませんでした (Delta など、ほかのソフトが使っている可能性があります)。次に変更したとき、もう一度書きます';
  }
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') return NO_PERMISSION;
  if (err?.name === 'NotFoundError') return 'ファイルが見つかりません (動かしたか、消した可能性があります)';
  return `Delta との同期でエラーが出ました: ${err?.message ?? String(e)}`;
}

// ---------------------------------------------------------------- 今の中身

function appState(link: Link) {
  const s = useEditor.getState();
  const meta = s.doc.spectra.find((x) => x.id === link.spectrumId);
  const data = s.data[link.spectrumId];
  if (!meta || !data) return null;
  const ann = layerAnnotations(s.doc, link.layerId);
  return { ann, key: annotationKey(ann, data, meta), data, meta };
}

type AppState = NonNullable<ReturnType<typeof appState>>;

function fileState(bytes: ArrayBuffer, app: AppState) {
  const ann = fileAnnotations(bytes);
  return { ann, key: annotationKey(ann, app.data, app.meta) };
}

function entryOf(source: HistoryEntry['source'], note: string, ann: WritableAnnotations, key: string, app: AppState, block?: Uint8Array | null) {
  return { source, note, annotations: ann, key, shown: shownValues(ann, app.data, app.meta), block: block ?? null };
}

// ---------------------------------------------------------------- 図ごとに最後に合わせた時点

function recordKey(link: Link) {
  return `${useEditor.getState().doc.id}|${link.fileName}`;
}

interface SyncRecord {
  mtime: number;
  key: string;
  localChangedAt?: number | null;
}

async function saveRecord(link: Link) {
  if (link.mtime === null || link.key === null) return;
  const record: SyncRecord = { mtime: link.mtime, key: link.key, localChangedAt: link.localChangedAt };
  await dbPut('sync', recordKey(link), record).catch(() => undefined);
}

function settle(link: Link, mtime: number, key: string, direction: LinkView['direction']) {
  link.mtime = mtime;
  link.key = key;
  link.localChangedAt = null;
  void saveRecord(link);
  const now = Date.now();
  show(link, { status: 'synced', message: '', lastSyncAt: direction ? now : (useSync.getState().links[link.layerId]?.lastSyncAt ?? now), direction });
}

// ---------------------------------------------------------------- 始めて見るとき

async function attach(link: Link) {
  const handle = folderFileHandle(link.fileName) ?? extraHandles.get(link.fileName) ?? null;
  if (!handle) {
    show(link, { status: 'waiting', message: 'データフォルダにこの .jdf が見つからないので、まだ同期していません (ホーム画面でフォルダを読み込むと始まります)' });
    return;
  }
  link.handle = handle;
  const file = await handle.getFile();
  const bytes = await file.arrayBuffer();
  await reloadIfReprocessed(link, bytes);
  const app = appState(link);
  if (!app) return;
  const fromFile = fileState(bytes, app);
  // 開いただけのときは、前に見たときと同じ中身なら記録を足さない
  await addHistory(link.fileName, entryOf('delta', 'Delta のファイルを開いたときの中身', fromFile.ann, fromFile.key, app, annotationBlock(bytes)), {
    skipIfSeen: true,
  });
  link.attached = true;
  const record = await dbGet<SyncRecord>('sync', recordKey(link));

  if (fromFile.key === app.key) {
    settle(link, file.lastModified, app.key, null);
    return;
  }
  if (record) {
    const fileChanged = file.lastModified !== record.mtime && fromFile.key !== record.key;
    const appChanged = app.key !== record.key;
    // この図を閉じている間に Delta では変わっていない → このアプリの変更を書く
    const appNewer = appChanged && (!fileChanged || (record.localChangedAt ?? 0) > file.lastModified);
    if (appNewer) {
      link.mtime = record.mtime;
      link.key = record.key;
      link.localChangedAt = record.localChangedAt ?? Date.now();
      await push(link);
      return;
    }
  }
  // この機能を使う前に作った図で、図にもピーク値・積分がある: どちらが新しいか分からないので、一度だけ聞く
  if (!record && (app.ann.peaks.length || app.ann.integrals.length)) {
    const choice = await askInTurn(
      'Delta のファイルと中身が違います',
      `${link.fileName}: この図のピーク値・積分 (${summary(app.ann)}) と、Delta のファイルの中身 (${summary(fromFile.ann)}) が違います。どちらに合わせますか？ 選ばなかった方も記録に残るので、あとから戻せます。`,
      [
        { label: 'この図に合わせる (Delta に書き込む)', value: 'app' },
        { label: 'Delta のファイルに合わせる', value: 'file', kind: 'primary' },
      ],
    );
    if (choice === 'app') {
      link.mtime = file.lastModified;
      link.key = fromFile.key;
      link.localChangedAt = Date.now();
      await push(link);
      return;
    }
  }
  await pull(link, file.lastModified, fromFile, app, record ? 'Delta で保存された中身を反映' : 'Delta のピーク値・積分を読み込み');
}

/** 確認は 1 つずつ出す (同時に出すと前のものが閉じてしまう) */
let asking: Promise<unknown> = Promise.resolve();
function askInTurn(...args: Parameters<typeof ask>): Promise<string | null> {
  const next = asking.then(() => ask(...args));
  asking = next.catch(() => null);
  return next;
}

function retryWaiting() {
  for (const link of links.values()) {
    if (!link.attached) queue(link, () => attach(link));
  }
}

// ---------------------------------------------------------------- Delta → このアプリ

async function pull(link: Link, mtime: number, fromFile: { ann: WritableAnnotations; key: string }, app: AppState, message: string) {
  // 置き換えられる図の中身が、まだ Delta に書いていない変更なら記録に残す
  if (link.attached && app.key !== link.key && (app.ann.peaks.length || app.ann.integrals.length)) {
    await addHistory(link.fileName, entryOf('app', 'このソフトでの変更 (Delta の方が新しかったので使わなかったもの)', app.ann, app.key, app));
  }
  applying = true;
  try {
    edit((d) => applyAnnotations(d, link.layerId, fromFile.ann, app.meta));
  } finally {
    applying = false;
  }
  const after = appState(link);
  settle(link, mtime, after?.key ?? fromFile.key, 'pull');
  notify(`${message}: ${link.fileName} (${summary(fromFile.ann)})`);
}

/** Delta で処理し直して (位相など) 保存されていたら、スペクトルも読み直す */
async function reloadIfReprocessed(link: Link, bytes: ArrayBuffer) {
  const s = useEditor.getState();
  const meta = s.doc.spectra.find((x) => x.id === link.spectrumId);
  const data = s.data[link.spectrumId];
  if (!meta || !data) return;
  let loaded;
  try {
    loaded = readJdf(bytes, link.fileName);
  } catch {
    return;
  }
  if (sameSpectrum(meta, data, loaded.meta, loaded.data)) return;
  useEditor.setState((st) => ({ data: { ...st.data, [link.spectrumId]: loaded.data }, sources: { ...st.sources, [link.spectrumId]: bytes } }));
  applying = true;
  try {
    edit((d) => {
      const m = d.spectra.find((x) => x.id === link.spectrumId);
      if (!m) return;
      m.first = loaded.meta.first;
      m.last = loaded.meta.last;
      m.n = loaded.meta.n;
      m.maxAbs = loaded.meta.maxAbs;
      m.delta = loaded.meta.delta ?? null;
    }, false);
  } finally {
    applying = false;
  }
  invalidateSavedData();
  notify(`Delta で処理し直したスペクトルを読み込みました: ${link.fileName}`);
}

function sameSpectrum(meta: SpectrumMeta, data: Float32Array, m2: SpectrumMeta, d2: Float32Array) {
  if (meta.n !== m2.n || meta.first !== m2.first || meta.last !== m2.last || data.length !== d2.length) return false;
  for (let i = 0; i < data.length; i++) if (data[i] !== d2[i]) return false;
  return true;
}

// ---------------------------------------------------------------- このアプリ → Delta

function onEdited() {
  for (const link of links.values()) {
    if (!link.attached) continue;
    const app = appState(link);
    if (!app) continue;
    if (app.key === link.key) {
      // 元に戻して、合わせたときと同じ中身になった
      clearTimeout(link.timer);
      link.localChangedAt = null;
      if (useSync.getState().links[link.layerId]?.status === 'pending') show(link, { status: 'synced', message: '' });
      continue;
    }
    link.localChangedAt = Date.now();
    show(link, { status: 'pending', message: '' });
    clearTimeout(link.timer);
    link.timer = setTimeout(() => queue(link, () => push(link)), DEBOUNCE);
  }
}

async function writable(link: Link, askUser: boolean): Promise<boolean> {
  if (!link.handle) return false;
  let state: PermissionState;
  if (folderFileHandle(link.fileName) === link.handle) state = await folderWritePermission(askUser);
  else {
    try {
      state = (await link.handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
      if (state !== 'granted' && askUser) state = (await link.handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
    } catch {
      state = 'denied';
    }
  }
  return state === 'granted';
}

async function push(link: Link) {
  const app = appState(link);
  if (!app || !link.handle || app.key === link.key) return;
  // 編集した直後ならブラウザが許可の確認を出せる
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive ?? false;
  if (!(await writable(link, activation))) {
    show(link, { status: 'need-permission', message: 'Delta のファイルに書き込むには、データフォルダへの書き込みを許可してください' });
    void saveRecord(link);
    return;
  }
  const file = await link.handle.getFile();
  const bytes = await file.arrayBuffer();
  if (file.lastModified !== link.mtime) {
    // 前に合わせたあと、Delta でも保存されていた
    await reloadIfReprocessed(link, bytes);
    const now = appState(link)!;
    const fromFile = fileState(bytes, now);
    if (fromFile.key !== link.key) {
      await addHistory(link.fileName, entryOf('delta', 'Delta で保存', fromFile.ann, fromFile.key, now, annotationBlock(bytes)));
      if (file.lastModified > (link.localChangedAt ?? 0)) {
        await pull(link, file.lastModified, fromFile, now, 'Delta の方が新しかったので、Delta の中身を反映');
        return;
      }
    }
  }
  const current = appState(link)!;
  const before = fileState(bytes, current);
  await keepOriginal(link.fileName, bytes);
  // 上書きする前の中身 (直前の記録と同じなら足さない)
  await addHistory(link.fileName, entryOf('delta', '書き込む前の Delta のファイル', before.ann, before.key, current, annotationBlock(bytes)));
  const out = writeAnnotations(bytes, current.ann);
  await writeFile(link.handle, out);
  const written = await link.handle.getFile();
  await addHistory(link.fileName, entryOf('app', 'このソフトで編集', current.ann, current.key, current));
  settle(link, written.lastModified, current.key, 'push');
}

async function writeFile(handle: FileHandle, bytes: ArrayBuffer) {
  const w = await handle.createWritable();
  await w.write(new Blob([bytes]));
  await w.close();
}

// ---------------------------------------------------------------- Delta で保存されたかを見る

function pollAll() {
  for (const link of links.values()) {
    if (!link.attached || !link.handle) continue;
    queue(link, () => poll(link));
  }
}

async function poll(link: Link) {
  if (!link.handle) return;
  const file = await link.handle.getFile();
  const status = useSync.getState().links[link.layerId]?.status;
  if (file.lastModified === link.mtime) {
    // 書けなかった変更があれば、もう一度書いてみる
    if (status === 'error' && link.localChangedAt) await push(link);
    return;
  }
  const bytes = await file.arrayBuffer();
  await reloadIfReprocessed(link, bytes);
  const app = appState(link);
  if (!app) return;
  const fromFile = fileState(bytes, app);
  if (fromFile.key === link.key) {
    // Delta で保存されたが、ピーク値・積分は同じ
    link.mtime = file.lastModified;
    void saveRecord(link);
    return;
  }
  await addHistory(link.fileName, entryOf('delta', 'Delta で保存', fromFile.ann, fromFile.key, app, annotationBlock(bytes)));
  if (link.localChangedAt && link.localChangedAt > file.lastModified) {
    await push(link);
    return;
  }
  await pull(link, file.lastModified, fromFile, app, 'Delta で保存された中身を反映');
}

// ---------------------------------------------------------------- 画面から

/** 「書き込みを許可する」を押したとき。許可されたら、待っていた変更を書く */
export async function grantDeltaWrite(layerId: string) {
  const link = links.get(layerId);
  if (!link) return;
  if (!(await writable(link, true))) {
    show(link, { status: 'need-permission', message: NO_PERMISSION });
    notify(NO_PERMISSION, 'error');
    return;
  }
  for (const l of links.values()) if (l.localChangedAt) queue(l, () => push(l));
  if (!link.localChangedAt) show(link, { status: 'synced', message: '' });
}

/** 記録のある時点に戻す (Delta のファイルも図も)。戻す前の中身も記録に残る */
export async function restoreEntry(layerId: string, entry: HistoryEntry) {
  const link = links.get(layerId);
  if (!link?.handle) return notify('この .jdf とはまだ同期していないので戻せません', 'error');
  const time = new Date(entry.at).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ok = await ask('この時点に戻す', `${time} の中身 (${summary(entry.annotations)}) に戻します。Delta の ${link.fileName} も書き換わります。今の中身は記録に残ります。`, [
    { label: '戻す', value: 'ok', kind: 'primary' },
  ]);
  if (ok !== 'ok') return;
  if (!(await writable(link, true))) return notify('書き込みが許可されなかったので、戻せませんでした', 'error');
  await queue(link, async () => {
    const file = await link.handle!.getFile();
    const bytes = await file.arrayBuffer();
    const before = appState(link)!;
    const now = fileState(bytes, before);
    await keepOriginal(link.fileName, bytes);
    await addHistory(link.fileName, entryOf('delta', '戻す前の Delta のファイル', now.ann, now.key, before, annotationBlock(bytes)));
    const out = entry.block ? withAnnotationBlock(bytes, entry.block) : writeAnnotations(bytes, entry.annotations);
    await writeFile(link.handle!, out);
    await applyFile(link, out, `${time} の記録から戻した`);
  });
}

/** このアプリで初めて書き込む前のファイル (スペクトルも注釈も) に戻す */
export async function restoreOriginal(layerId: string) {
  const link = links.get(layerId);
  if (!link?.handle) return;
  const original = await originalOf(link.fileName);
  if (!original) return notify('まだこのソフトから書き込んでいないので、ファイルは元のままです');
  const ok = await ask('最初のファイルに戻す', `${link.fileName} を、このソフトで初めて書き込む前のファイルに戻します (スペクトルも注釈も)。今の中身は記録に残ります。`, [
    { label: '戻す', value: 'ok', kind: 'danger' },
  ]);
  if (ok !== 'ok') return;
  if (!(await writable(link, true))) return notify('書き込みが許可されなかったので、戻せませんでした', 'error');
  await queue(link, async () => {
    const file = await link.handle!.getFile();
    const bytes = await file.arrayBuffer();
    const before = appState(link)!;
    const now = fileState(bytes, before);
    await addHistory(link.fileName, entryOf('delta', '戻す前の Delta のファイル', now.ann, now.key, before, annotationBlock(bytes)));
    await writeFile(link.handle!, original.bytes);
    await applyFile(link, original.bytes, '最初のファイルに戻した');
  });
}

/** 書いたファイルの中身を図に入れて、記録に残す */
async function applyFile(link: Link, bytes: ArrayBuffer, note: string) {
  await reloadIfReprocessed(link, bytes);
  const app = appState(link)!;
  const fromFile = fileState(bytes, app);
  applying = true;
  try {
    edit((d) => applyAnnotations(d, link.layerId, fromFile.ann, app.meta));
  } finally {
    applying = false;
  }
  const after = appState(link)!;
  const written = await link.handle!.getFile();
  await addHistory(link.fileName, entryOf('app', note, fromFile.ann, after.key, after, annotationBlock(bytes)));
  settle(link, written.lastModified, after.key, 'push');
  notify(`${note}: ${link.fileName} (${summary(fromFile.ann)})`);
}

/** 記録のある時点の中身を、別の .jdf として書き出す (元のファイルは変えない) */
export async function exportEntry(layerId: string, entry: HistoryEntry) {
  const link = links.get(layerId);
  if (!link?.handle) return;
  const bytes = await (await link.handle.getFile()).arrayBuffer();
  const out = entry.block ? withAnnotationBlock(bytes, entry.block) : writeAnnotations(bytes, entry.annotations);
  const stamp = new Date(entry.at).toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const name = `${baseName(link.fileName)}-${stamp}.jdf`;
  const picker = (window as Window & { showSaveFilePicker?: (o: object) => Promise<FileHandle> }).showSaveFilePicker;
  try {
    if (picker) {
      const handle = await picker({ suggestedName: name, types: [{ description: 'JEOL Delta', accept: { 'application/octet-stream': ['.jdf'] } }] });
      try {
        await writeFile(handle, out);
        notify(`${handle.name} に書き出しました`);
        return;
      } catch (e) {
        const refused = (e as Error).name === 'NotAllowedError' || (e as Error).name === 'SecurityError';
        if (!refused) throw e;
        // このブラウザではファイルに直接書けない。ダウンロードで出す
      }
    }
    downloadBlob(new Blob([out], { type: 'application/octet-stream' }), name);
    notify(`${name} をダウンロードとして書き出しました`);
  } catch (e) {
    if ((e as Error).name !== 'AbortError') notify(`書き出せませんでした: ${(e as Error).message}`, 'error');
  }
}

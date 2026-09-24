import { tr } from '../i18n';
import { create } from 'zustand';
import { dbDelete, dbEntries, dbGet, dbSet } from '../lib/db';
import { readJdf, type LoadedSpectrum, type ReadOptions } from '../lib/jdf';
import { readJdf2d, type Loaded2dSpectrum } from '../lib/jdf2d';
import { figureBaseOf } from '../lib/figureJdf';
import { experimentKey, readJdfMeta, type ExperimentMeta } from '../lib/jdfMeta';
import { notify, type FileHandle } from './store';
import type { NmrDocument } from './types';
import type { HomeSort } from '../lib/settings';

/** サンプル (Delta のタイトル) ごとのメモ。同じサンプルの測定で共通 */
export interface SampleNote {
  memo: string;
  tags: string[];
  /** 反応スキームや構造式の画像 */
  scheme: Blob | null;
  /** アプリ内で描いたときの元データ (MOL / RXN)。描き直すのに使う */
  schemeSource?: string | null;
  updatedAt: number;
}

/** ホーム画面のカードに並べる、保存した図 (比較) */
export interface SavedFigure {
  id: string;
  /** 表示する名前 (保存したファイル名から作る) */
  name: string;
  /** この図に入っている測定のサンプル。全部のカードに出す */
  sampleKeys: string[];
  /** チップに出す核種 (1H, 19F …) */
  nuclei: string[];
  /** 重ねた本数 */
  layers: number;
  savedAt: number;
  /** プロジェクトの中身 (.nmrfig と同じ JSON) */
  json: string;
  /** 保存先のファイル。開き直したあとも「上書き保存」できるように覚えておく */
  handle?: FileHandle | null;
  /** 保存したファイルの名前 (拡張子つき。古い図は無い = .nmrfig) */
  fileName?: string;
  /** 土台のスペクトルの元の .jdf の名前。ホーム画面で、その測定の「編集した版」として出す (古い図は読み込み時に中身から補う) */
  base?: { fileName: string } | null;
}

export type NucleusFilter = '1H' | '13C' | '19F' | '31P' | '2D' | 'other';
export const NUCLEUS_FILTERS: NucleusFilter[] = ['1H', '13C', '19F', '31P', '2D', 'other'];

interface LibraryState {
  status: 'loading' | 'no-folder' | 'need-permission' | 'scanning' | 'ready';
  folderName: string | null;
  /** フォルダを覚えておけない環境 (ブラウザが対応していない) */
  temporary: boolean;
  /** 覚えているフォルダの読み取り許可。denied はブラウザが拒否を覚えている (選び直しが要る) */
  folderPermission: PermissionState | null;
  /** データフォルダの .jdf (このソフトで保存した図入りの .jdf も。元の測定の版としてまとめて出す) */
  experiments: ExperimentMeta[];
  failed: { fileName: string; message: string }[];
  progress: { done: number; total: number } | null;
  notes: Record<string, SampleNote>;
  /** 保存した図 (新しい順) */
  figures: SavedFigure[];
  query: string;
  nuclei: NucleusFilter[];
  solvent: string;
  tag: string;
  /** 開くために選んだ実験 */
  selected: string[];
  /** 右側に詳しく出している実験 */
  focus: string | null;
  /** 測定ごとに選んだ版 (測定 id → ファイルのキー) */
  versionChoice: Record<string, string>;
}

export const useLibrary = create<LibraryState>(() => ({
  status: 'loading',
  folderName: null,
  temporary: false,
  folderPermission: null,
  experiments: [],
  failed: [],
  progress: null,
  notes: {},
  figures: [],
  query: '',
  nuclei: [],
  solvent: '',
  tag: '',
  selected: [],
  focus: null,
  versionChoice: {},
}));

const set = useLibrary.setState;
const get = useLibrary.getState;

type FileEntry = FileHandle & { kind: 'file' };
type DirHandle = {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileEntry | { kind: 'directory'; name: string }>;
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  /** このフォルダの中のファイルなら、フォルダからの道のり (違えば null) */
  resolve?(h: FileHandle): Promise<string[] | null>;
  getDirectoryHandle?(name: string, o?: { create?: boolean }): Promise<{ getFileHandle(name: string, o?: { create?: boolean }): Promise<FileHandle> }>;
};
type PickerWindow = Window & { showDirectoryPicker?: (o: { id?: string; mode?: 'read'; startIn?: DirHandle }) => Promise<DirHandle> };

const FOLDER_KEY = 'dataFolder';
/** 実験のキー → ファイルの取り出し方 */
const sources = new Map<string, () => Promise<File>>();
/** ファイル名 → フォルダの中のファイル (Delta との同期で書き込むのに使う) */
const handles = new Map<string, FileEntry>();
let folder: DirHandle | null = null;

export function sampleKeyOf(e: Pick<ExperimentMeta, 'title' | 'fileName'>) {
  return e.title || e.fileName.replace(/\.jdf$/i, '');
}

export function nucleusFilterOf(e: ExperimentMeta): NucleusFilter {
  if (e.dimension >= 2) return '2D';
  const n = e.nuclei[0];
  return n === '1H' || n === '13C' || n === '19F' || n === '31P' ? n : 'other';
}

/** 開けるかどうか (1D も 2D も、Delta で処理していない生データはこのアプリで処理する) */
export function canOpen(e: ExperimentMeta) {
  return e.dimension <= 2;
}

export async function initLibrary() {
  const notes = await dbEntries<SampleNote>('notes');
  set({ notes: Object.fromEntries(notes) });
  await loadFigures();
  const saved = await dbGet<DirHandle>('kv', FOLDER_KEY);
  if (!saved) {
    set({ status: 'no-folder' });
    return;
  }
  folder = saved;
  set({ folderName: saved.name });
  const permission = (await saved.queryPermission?.({ mode: 'read' })) ?? 'granted';
  set({ folderPermission: permission });
  if (permission === 'granted') await scanFolder();
  else set({ status: 'need-permission' });
}

export function supportsFolderAccess() {
  return typeof (window as PickerWindow).showDirectoryPicker === 'function';
}

export async function pickFolder() {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) {
    pickFilesFallback();
    return;
  }
  try {
    // 覚えているフォルダがあれば、そこを開いた状態で出す
    const handle = await picker({ id: 'nmr-data', mode: 'read', ...(folder ? { startIn: folder } : {}) });
    folder = handle;
    await dbSet('kv', FOLDER_KEY, handle);
    set({ folderName: handle.name, temporary: false, selected: [], focus: null, folderPermission: 'granted' });
    await scanFolder();
  } catch (e) {
    // 選ぶのをやめたとき (AbortError) は何もしない
    if ((e as Error).name !== 'AbortError') notify(tr('フォルダを開けませんでした: {message}', { message: (e as Error).message }), 'error');
  }
}

/**
 * フォルダの読み取りを許可してもらう (ボタンを押したときに呼ぶ)。
 * ブラウザが「拒否」を覚えていると requestPermission は何も聞かずに拒否を返すので、
 * そのときはフォルダを選び直してもらう (押しても何も起きない状態にしない)。
 */
export async function grantPermission() {
  if (!folder) {
    await pickFolder();
    return;
  }
  let before: PermissionState = 'denied';
  let permission: PermissionState = 'denied';
  try {
    before = (await folder.queryPermission?.({ mode: 'read' })) ?? 'granted';
    permission = before === 'granted' ? before : ((await folder.requestPermission?.({ mode: 'read' })) ?? 'granted');
  } catch {
    permission = 'denied';
  }
  set({ folderPermission: permission });
  if (permission === 'granted') {
    await scanFolder();
    return;
  }
  if (before === 'denied') {
    // 拒否が覚えられていると、何度押してもダイアログは出ない。選び直してもらう
    notify(tr('ブラウザがこのフォルダへのアクセスを拒否した状態で覚えています。フォルダを選び直してください'), 'error');
    await pickFolder();
    return;
  }
  notify(tr('フォルダの読み取りが許可されませんでした。もう一度「フォルダを読み込む」を押すか、「変更」で選び直してください'), 'error');
}

/** フォルダを選べないブラウザ向け。その場限りで一覧を作る */
function pickFilesFallback() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  input.onchange = () => {
    const files = [...(input.files ?? [])].filter((f) => !f.webkitRelativePath.split('/').slice(1, -1).length);
    void loadLibraryFiles(files, input.files?.[0]?.webkitRelativePath.split('/')[0] ?? null);
  };
  input.click();
}

/** ファイルの一覧から、その場限りのライブラリを作る (フォルダを覚えておけないとき・開発時) */
export async function loadLibraryFiles(files: File[], name: string | null) {
  folder = null;
  set({ folderName: name, temporary: true, selected: [], focus: null });
  const jdf = files.filter((f) => /\.jdf$/i.test(f.name));
  await scanEntries(
    jdf.map((file) => ({ name: file.name, getFile: async () => file })),
    false,
  );
}

export async function scanFolder() {
  if (!folder) return;
  set({ status: 'scanning', progress: { done: 0, total: 0 } });
  const entries: { name: string; getFile: () => Promise<File> }[] = [];
  handles.clear();
  try {
    for await (const entry of folder.values()) {
      if (entry.kind === 'file' && /\.jdf$/i.test(entry.name)) {
        entries.push({ name: entry.name, getFile: () => entry.getFile() });
        handles.set(entry.name, entry);
      }
    }
  } catch (e) {
    // 途中で読めなくなったら (許可が切れたなど)、読み込みボタンを出し直す
    set({ status: 'need-permission', progress: null });
    notify(tr('フォルダを読めませんでした: {message}', { message: (e as Error).message }), 'error');
    return;
  }
  await scanEntries(entries, true);
}

/** persist: 覚えているフォルダの読み込みのときだけ、ファイル情報のキャッシュを更新する */
async function scanEntries(entries: { name: string; getFile: () => Promise<File> }[], persist: boolean) {
  set({ status: 'scanning', progress: { done: 0, total: entries.length } });
  const cache = await dbEntries<ExperimentMeta>('meta');
  const seen = new Set<string>();
  const experiments: ExperimentMeta[] = [];
  const failed: LibraryState['failed'] = [];
  sources.clear();
  let done = 0;
  for (const entry of entries) {
    try {
      const file = await entry.getFile();
      const key = experimentKey(file);
      seen.add(key);
      let meta = cache.get(key);
      if (!meta) {
        meta = await readJdfMeta(file);
        if (persist) await dbSet('meta', key, meta);
      }
      experiments.push(meta);
      sources.set(key, entry.getFile);
    } catch (e) {
      failed.push({ fileName: entry.name, message: (e as Error).message });
    }
    done++;
    if (done % 25 === 0) set({ progress: { done, total: entries.length } });
  }
  // 消えたファイルのキャッシュは捨てる
  if (persist) for (const key of cache.keys()) if (!seen.has(key)) await dbDelete('meta', key);
  experiments.sort((a, b) => b.measuredAt - a.measuredAt);
  const alive = new Set(experiments.map((e) => e.key));
  set((s) => ({
    status: 'ready',
    progress: null,
    experiments,
    failed,
    selected: s.selected.filter((k) => alive.has(k)),
    focus: s.focus && alive.has(s.focus) ? s.focus : null,
  }));
}

export async function loadExperiment(key: string, options?: ReadOptions): Promise<LoadedSpectrum> {
  const source = sources.get(key);
  if (!source) throw new Error(tr('ファイルが見つかりません。フォルダを読み直してください'));
  const file = await source();
  return readJdf(await file.arrayBuffer(), file.name, options);
}

/** データフォルダの中のファイル (読み込んだフォルダにあるときだけ) */
export function folderFileHandle(fileName: string): FileHandle | null {
  return handles.get(fileName) ?? null;
}

/** 一覧の図入りの .jdf を開くためのファイル */
export async function figureFileOf(key: string): Promise<{ file: File; handle?: FileHandle }> {
  const source = sources.get(key);
  if (!source) throw new Error(tr('ファイルが見つかりません。フォルダを読み直してください'));
  const file = await source();
  return { file, handle: handles.get(file.name) };
}

/** 保存したファイルがデータフォルダの中なら、一覧を読み直す (保存した図がホーム画面に出るように) */
export async function refreshIfInFolder(handle: FileHandle) {
  if (!folder?.resolve) return;
  try {
    const path = await folder.resolve(handle);
    if (path?.length === 1) await scanFolder();
  } catch {
    // 調べられなければ、次にフォルダを読み込んだときに出る
  }
}

/**
 * データフォルダへの書き込みの許可 (Delta との同期で .jdf に書くため)。
 * ask = true はボタンを押したときなど、ブラウザが確認を出してよいときだけ
 */
export async function folderWritePermission(ask: boolean): Promise<PermissionState> {
  if (!folder) return 'denied';
  try {
    const now = (await folder.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (now === 'granted' || !ask) return now;
    return (await folder.requestPermission?.({ mode: 'readwrite' })) ?? 'granted';
  } catch {
    return 'denied';
  }
}

/** データフォルダ (NMR の保存先) の名前。開いていなければ null */
export function dataFolderName(): string | null {
  return folder?.name ?? null;
}

/** データフォルダの読み取りの許可。ask = true はボタンを押したときなど、ブラウザが確認を出してよいときだけ */
export async function folderReadPermission(ask: boolean): Promise<PermissionState> {
  if (!folder) return 'denied';
  try {
    const now = (await folder.queryPermission?.({ mode: 'read' })) ?? 'granted';
    if (now === 'granted' || !ask) return now;
    return (await folder.requestPermission?.({ mode: 'read' })) ?? 'granted';
  } catch {
    return 'denied';
  }
}

/** データフォルダの中の子フォルダのファイル (ChemDraw 連携の構造式)。なければ null */
export async function folderChildFile(dir: string, name: string): Promise<File | null> {
  if (!folder?.getDirectoryHandle) return null;
  try {
    const sub = await folder.getDirectoryHandle(dir);
    return await (await sub.getFileHandle(name)).getFile();
  } catch {
    return null;
  }
}

type SubDir = {
  values(): AsyncIterable<{ kind: 'file' | 'directory'; name: string }>;
  removeEntry(name: string): Promise<void>;
};

/** データフォルダの中の子フォルダのファイルの名前。フォルダがなければ空 */
export async function folderChildNames(dir: string): Promise<string[]> {
  if (!folder?.getDirectoryHandle) return [];
  try {
    const sub = (await folder.getDirectoryHandle(dir)) as unknown as SubDir;
    const out: string[] = [];
    for await (const e of sub.values()) if (e.kind === 'file') out.push(e.name);
    return out;
  } catch {
    return [];
  }
}

/** データフォルダの中の子フォルダのファイルを消す。消せたら true (書き込みの許可は先に取っておく) */
export async function folderRemoveChildFile(dir: string, name: string): Promise<boolean> {
  if (!folder?.getDirectoryHandle) return false;
  try {
    const sub = (await folder.getDirectoryHandle(dir)) as unknown as SubDir;
    await sub.removeEntry(name);
    return true;
  } catch {
    return false;
  }
}

/** データフォルダの中の子フォルダ (なければ作る) にファイルを書く。書き込みの許可は先に取っておく */
export async function folderWriteChildFile(dir: string, name: string, text: string) {
  if (!folder?.getDirectoryHandle) throw new Error(tr('フォルダが開かれていません'));
  const sub = await folder.getDirectoryHandle(dir, { create: true });
  const handle = await sub.getFileHandle(name, { create: true });
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

/** 2D の実験を読む */
export async function load2dExperiment(key: string): Promise<Loaded2dSpectrum> {
  const source = sources.get(key);
  if (!source) throw new Error(tr('ファイルが見つかりません。フォルダを読み直してください'));
  const file = await source();
  return readJdf2d(await file.arrayBuffer(), file.name);
}

export async function saveNote(sampleKey: string, patch: Partial<SampleNote>) {
  const current = get().notes[sampleKey] ?? { memo: '', tags: [], scheme: null, schemeSource: null, updatedAt: 0 };
  const next: SampleNote = { ...current, ...patch, updatedAt: Date.now() };
  set((s) => ({ notes: { ...s.notes, [sampleKey]: next } }));
  const empty = !next.memo && !next.tags.length && !next.scheme && !next.schemeSource;
  if (empty) await dbDelete('notes', sampleKey);
  else await dbSet('notes', sampleKey, next);
}

/** 保存した図をブラウザから読み直す。土台の .jdf の名前が無い古い図は、中身から補って残し直す */
export async function loadFigures() {
  const list = [...(await dbEntries<SavedFigure>('figures')).values()];
  for (const figure of list) {
    if (figure.base !== undefined) continue;
    figure.base = baseOfJson(figure.json);
    await dbSet('figures', figure.id, figure);
  }
  set({ figures: list.sort((a, b) => b.savedAt - a.savedAt) });
}

/** 図の中身から、土台のスペクトル (Delta で開くと見える 1 本。2D はその 2D) の元の .jdf の名前 */
export function baseOfJson(json: string): SavedFigure['base'] {
  try {
    const doc = (JSON.parse(json) as { doc: NmrDocument }).doc;
    const fileName = doc.plot2d ? doc.spectra2d?.[0]?.fileName : (figureBaseOf(doc)?.meta.fileName ?? doc.spectra.find((s) => !s.simulated)?.fileName);
    return fileName ? { fileName } : null;
  } catch {
    return null;
  }
}

/**
 * ホーム画面に出すファイル。データフォルダの .jdf に、ブラウザの中に残した図を「元の測定の版」として足す
 * (元の測定と同じタイトル・測定時刻・核種にするので、groupMeasurements で同じ測定にまとまる)。
 * 同じ名前の図入りの .jdf がフォルダにあれば、そちらを出す。元の測定がフォルダにない図は出さない (unlistedFigures)
 */
export function listedFiles(s: Pick<LibraryState, 'experiments' | 'figures'>): ExperimentMeta[] {
  if (listedCache?.experiments === s.experiments && listedCache.figures === s.figures) return listedCache.files;
  const inFolder = new Set(s.experiments.filter((e) => e.figure).map((e) => e.fileName));
  const files = [...s.experiments];
  for (const f of s.figures) {
    if (inFolder.has(savedFileName(f))) continue;
    const base = f.base && s.experiments.find((e) => !e.figure && e.fileName === f.base!.fileName);
    if (!base) continue;
    files.push({
      ...base,
      key: `saved:${f.id}`,
      fileName: savedFileName(f),
      size: 0,
      lastModified: f.savedAt,
      processed: true,
      figure: { layers: f.layers, nuclei: f.nuclei },
      savedFigureId: f.id,
      baseKey: base.key,
    });
  }
  listedCache = { experiments: s.experiments, figures: s.figures, files };
  return files;
}
let listedCache: { experiments: ExperimentMeta[]; figures: SavedFigure[]; files: ExperimentMeta[] } | null = null;

/** 版として出せない (元の測定がフォルダにない) 保存した図。サンプルのカードに図のまま出す */
export function unlistedFigures(s: Pick<LibraryState, 'experiments' | 'figures'>): SavedFigure[] {
  const listed = new Set(listedFiles(s).map((e) => e.savedFigureId));
  const inFolder = new Set(s.experiments.filter((e) => e.figure).map((e) => e.fileName));
  return s.figures.filter((f) => !listed.has(f.id) && !inFolder.has(savedFileName(f)));
}

/** 保存した図のファイル名 (拡張子つき) */
export function savedFileName(f: SavedFigure) {
  return f.fileName ?? f.handle?.name ?? `${f.name}.nmrfig`;
}

/** 図を保存する (同じ id なら上書き) */
export async function saveFigure(figure: SavedFigure) {
  await dbSet('figures', figure.id, figure);
  await loadFigures();
}

export async function deleteFigure(id: string) {
  await dbDelete('figures', id);
  await loadFigures();
}

export function toggleSelected(key: string, on?: boolean) {
  set((s) => {
    const has = s.selected.includes(key);
    const want = on ?? !has;
    if (want === has) return s;
    return { selected: want ? [...s.selected, key] : s.selected.filter((k) => k !== key) };
  });
}

export function filteredExperiments(s: LibraryState): ExperimentMeta[] {
  const q = s.query.trim().toLowerCase();
  return listedFiles(s).filter((e) => {
    if (s.nuclei.length && !s.nuclei.includes(nucleusFilterOf(e))) return false;
    if (s.solvent && (e.solvent ?? e.solventRaw) !== s.solvent) return false;
    const note = s.notes[sampleKeyOf(e)];
    if (s.tag && !note?.tags.includes(s.tag)) return false;
    if (!q) return true;
    const hay = [e.title, e.fileName, e.experiment, note?.memo ?? '', ...(note?.tags ?? [])].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}

export interface SampleGroup {
  sampleKey: string;
  /** 測定した順 */
  items: Measurement[];
}

export interface ListGroup {
  /** 見出しの測定日 (名前順・更新順のときは見出しを出さないので null) */
  day: string | null;
  samples: SampleGroup[];
}

/** サンプルの中で一番新しい保存日時 (Delta で処理して保存した日時 = 編集順) */
function lastEdited(items: Measurement[]) {
  return Math.max(...items.flatMap((m) => m.files.map((f) => f.lastModified)));
}

/**
 * 一覧の並び。
 * 測定日順のときは日ごとにまとめ、名前順・更新順のときはサンプルごとに1つにまとめて並べる。
 */
export function groupList(list: ExperimentMeta[], sort: HomeSort): ListGroup[] {
  const dir = sort.desc ? -1 : 1;
  const measurements = groupMeasurements(list);
  const bySample = (ms: Measurement[]) => {
    const map = new Map<string, Measurement[]>();
    for (const m of ms) {
      const key = sampleKeyOf(m.main);
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()].map(([sampleKey, items]) => ({
      sampleKey,
      items: [...items].sort((a, b) => a.main.measuredAt - b.main.measuredAt),
    }));
  };

  if (sort.key === 'date') {
    const days = new Map<string, Measurement[]>();
    for (const m of measurements) {
      const day = localDay(m.main.measuredAt);
      days.set(day, [...(days.get(day) ?? []), m]);
    }
    return [...days.entries()]
      .sort((a, b) => dir * a[0].localeCompare(b[0]))
      .map(([day, ms]) => ({
        day,
        samples: bySample(ms).sort((a, b) => dir * (measuredAtOf(a.items) - measuredAtOf(b.items))),
      }));
  }

  const samples = bySample(measurements);
  samples.sort((a, b) =>
    sort.key === 'name'
      ? dir * a.sampleKey.localeCompare(b.sampleKey, 'ja', { numeric: true })
      : dir * (lastEdited(a.items) - lastEdited(b.items)),
  );
  return [{ day: null, samples }];
}

function measuredAtOf(items: Measurement[]) {
  return Math.max(...items.map((m) => m.main.measuredAt));
}

export function localDay(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 同じ測定の生データ (-1-1)・処理版 (-1-2, -1-3…)・このソフトで編集して保存した版 (図) をまとめたもの */
export interface Measurement {
  id: string;
  /** 編集した版 (新しい順) → 処理版 (新しい版から) → 生データ の順 */
  files: ExperimentMeta[];
  /** 一覧に出す代表。最新の編集した版、なければ最新の処理版、なければ生データ */
  main: ExperimentMeta;
}

/** Delta の保存名の末尾 "-1-3" の 3 (処理して保存した版) */
export function fileVersion(name: string) {
  const m = /-(\d+)-(\d+)\.jdf$/i.exec(name);
  return m ? Number(m[2]) : 0;
}

export function groupMeasurements(list: ExperimentMeta[]): Measurement[] {
  const byId = new Map<string, ExperimentMeta[]>();
  for (const e of list) {
    const id = [sampleKeyOf(e), e.measuredAt, e.dimension, e.nuclei.join('/'), e.experiment].join('|');
    byId.set(id, [...(byId.get(id) ?? []), e]);
  }
  const out: Measurement[] = [];
  for (const [id, files] of byId) {
    // このソフトで編集して保存した版 (図) を一番に、次に Delta で処理した版 (FID はこのアプリで処理するので、処理版がないときだけ)
    files.sort(
      (a, b) =>
        Number(!!b.figure) - Number(!!a.figure) ||
        (a.figure && b.figure ? b.lastModified - a.lastModified : 0) ||
        Number(b.processed) - Number(a.processed) ||
        fileVersion(b.fileName) - fileVersion(a.fileName) ||
        b.lastModified - a.lastModified,
    );
    out.push({ id, files, main: files[0] });
  }
  return out.sort((a, b) => b.main.measuredAt - a.main.measuredAt);
}

/** 開くときに使うファイル (詳細で版を選んでいればそれ) */
export function chosenFile(m: Measurement, choice: Record<string, string>) {
  return m.files.find((f) => f.key === choice[m.id]) ?? m.main;
}

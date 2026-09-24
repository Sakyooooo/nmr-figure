import { annotationKey, applyAnnotations, fileAnnotations, layerAnnotations, summary, syncFileOf } from '../lib/deltaSync';
import { baseName, copyFigureToClipboard, downloadBlob, figureSvgString, svgToPng } from '../lib/exportFigure';
import { buildFigureJdf, figureBaseOf, type FigureBase } from '../lib/figureJdf';
import { JdfError, readJdf, type LoadedSpectrum, type ReadOptions } from '../lib/jdf';
import { readJdf2d } from '../lib/jdf2d';
import { hasEmbeddedFigure, readEmbeddedFigure } from '../lib/jdfEmbed';
import { labReference } from '../lib/settings';
import { PROJECT_EXT, parseProject, serializeProject } from '../lib/projectFile';
import { ask } from './dialog';
import { canOpen, load2dExperiment, loadExperiment, refreshIfInFolder, sampleKeyOf, saveFigure, useLibrary } from './library';
import { jdfHandle, registerJdfHandle } from './deltaSync';
import { addSpectra, addSpectrum2d, edit, loadDocument, markSaved, notify, useEditor, type FileHandle } from './store';
import { emptyDocument, type SpectrumMeta } from './types';

type PickerOptions = {
  suggestedName?: string;
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
  /** このファイルがあるフォルダでダイアログを開く */
  startIn?: FileHandle;
};
type FsWindow = Window & {
  showOpenFilePicker?: (o: PickerOptions) => Promise<FileHandle[]>;
  showSaveFilePicker?: (o: PickerOptions) => Promise<FileHandle>;
};
const fsWindow = window as FsWindow;

const OPEN_TYPES = [
  {
    description: 'NMR データ / プロジェクト',
    accept: { 'application/octet-stream': ['.jdf', PROJECT_EXT] },
  },
];
const PROJECT_TYPES = [{ description: 'NMR Figure プロジェクト', accept: { 'application/json': [PROJECT_EXT] } }];
const JDF_TYPES = [{ description: 'Delta のデータ (図入り)', accept: { 'application/octet-stream': ['.jdf'] } }];
const isJdfName = (name: string | null | undefined) => !!name && /\.jdf$/i.test(name);

/** FID を処理したあとの基準合わせに、研究室の基準値を使う */
export function readOptions(): ReadOptions {
  return { reference: (solvent, nucleus) => labReference(useEditor.getState().settings, solvent, nucleus) };
}

/** 保存していない図があれば、どうするか聞く。続けてよければ true */
async function confirmDiscard(): Promise<boolean> {
  const { dirty, doc } = useEditor.getState();
  if (!dirty || !doc.layers.length) return true;
  const choice = await ask('保存していない図があります', '編集中の図に保存していない変更があります。どうしますか？', [
    { label: '保存しないで続ける', value: 'discard', kind: 'danger' },
    { label: '保存してから続ける', value: 'save', kind: 'primary' },
  ]);
  if (choice === 'discard') return true;
  if (choice === 'save') {
    await saveProject();
    return !useEditor.getState().dirty;
  }
  return false;
}

/**
 * .nmrfig は図ごと開く。.jdf は mode が add なら編集中の図に追加し、new なら新しい図にする
 * (ホーム画面からは new)
 */
export async function openFiles(files: { file: File; handle?: FileHandle }[], mode: 'add' | 'new' = 'add') {
  const spectra: LoadedSpectrum[] = [];
  let cleared = false;
  for (const { file, handle } of files) {
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(PROJECT_EXT)) {
        if (!(await confirmDiscard())) continue;
        const { doc, data, fids, fids2d, data2d } = parseProject(await file.text());
        loadDocument(doc, data, file.name, handle ?? null, fids, { data2d, fids2d });
        notify(`${file.name} を開きました`);
      } else if (name.endsWith('.jdf')) {
        const buffer = await file.arrayBuffer();
        // このソフトで保存した図入りの .jdf は、図ごと開く (図を編集中に足そうとしたときは、どうするか聞く)
        if (hasEmbeddedFigure(buffer)) {
          const editing = mode === 'add' && useEditor.getState().doc.layers.length > 0;
          const choice = editing ? await askFigureOrSpectrum(file.name) : 'figure';
          if (!choice) continue;
          if (choice === 'figure') {
            await openFigureJdf(buffer, file.name, handle ?? null);
            cleared = true;
            continue;
          }
        }
        if (mode === 'new' && !cleared && useEditor.getState().doc.layers.length) {
          if (!(await confirmDiscard())) return;
          loadDocument(emptyDocument(), {}, null, null);
        }
        cleared = true;
        // ドロップ・「開く」で開いた .jdf も、Delta と同期できるようにファイルを覚えておく
        if (handle) registerJdfHandle(file.name, handle);
        if (is2d(buffer)) {
          addSpectrum2d(readJdf2d(buffer, file.name));
          notify(`${file.name} (2D) を開きました`);
          continue;
        }
        spectra.push(readJdf(buffer, file.name, readOptions()));
      } else {
        notify(`${file.name}: .jdf か ${PROJECT_EXT} を選んでください`, 'error');
      }
    } catch (e) {
      notify(e instanceof JdfError ? e.message : `${file.name}: ${(e as Error).message}`, 'error');
    }
  }
  if (spectra.length) {
    addSpectra(spectra);
    notify(`${spectra.map((s) => s.meta.fileName).join(', ')} を読み込みました`);
    useEditor.setState({ screen: 'editor' });
  }
}

/** .jdf のヘッダーだけ見て 2D かどうか調べる (13 バイト目が次元の数) */
function is2d(buffer: ArrayBuffer) {
  return buffer.byteLength > 16 && new DataView(buffer).getUint8(12) >= 2;
}

async function askFigureOrSpectrum(fileName: string): Promise<'figure' | 'spectrum' | null> {
  const choice = await ask('図の入った .jdf です', `${fileName} には、このソフトで保存した図が入っています。どう開きますか？`, [
    { label: 'スペクトルだけ今の図に足す', value: 'spectrum' },
    { label: '図として開く', value: 'figure', kind: 'primary' },
  ]);
  return choice === 'figure' || choice === 'spectrum' ? choice : null;
}

/**
 * 図入りの .jdf を図ごと開く。土台のスペクトルは、このファイルと Delta の同期をする
 * (ファイルの名前を変えたり写したりしていても、開いたファイルが相手になる)
 */
async function openFigureJdf(buffer: ArrayBuffer, fileName: string, handle: FileHandle | null) {
  if (!(await confirmDiscard())) return;
  let project;
  try {
    const json = await readEmbeddedFigure(buffer);
    if (!json) throw new Error('図が見つかりません');
    project = parseProject(json);
  } catch (e) {
    notify(`${fileName}: 図を読めませんでした (${(e as Error).message})。スペクトルだけを開きます`, 'error');
    loadDocument(emptyDocument(), {}, null, null);
    if (handle) registerJdfHandle(fileName, handle);
    addSpectra([readJdf(buffer, fileName, readOptions())]);
    return;
  }
  const { doc, data, fids, fids2d, data2d, jdfBase } = project;
  const base = doc.spectra.find((s) => s.id === jdfBase);
  if (base && !base.processing) base.syncFile = fileName;
  if (handle) registerJdfHandle(fileName, handle);
  loadDocument(doc, data, fileName, handle, fids, { data2d, fids2d });
  if (base) useEditor.setState((s) => ({ sources: { ...s.sources, [base.id]: buffer } }));
  notify(`${fileName} (図) を開きました`);
  // FID から処理した土台は自動では同期しないので、Delta で変えたピーク値・積分があれば、入れるか聞く
  if (base?.processing) await offerDeltaChanges(buffer, fileName, base);
}

async function offerDeltaChanges(buffer: ArrayBuffer, fileName: string, base: SpectrumMeta) {
  const { doc, data } = useEditor.getState();
  const layer = doc.layers.find((l) => l.spectrumId === base.id);
  const values = data[base.id];
  if (!layer || !values) return;
  const fromFile = fileAnnotations(buffer);
  const inFigure = layerAnnotations(doc, layer.id);
  if (annotationKey(fromFile, values, base) === annotationKey(inFigure, values, base)) return;
  const choice = await ask(
    'Delta で変わっています',
    `${fileName} のピーク値・積分 (${summary(fromFile)}) が、保存したときの図 (${summary(inFigure)}) と違います。Delta で変えた中身を図に入れますか？`,
    [
      { label: '図のままにする', value: 'keep' },
      { label: 'Delta の中身を入れる', value: 'file', kind: 'primary' },
    ],
  );
  if (choice === 'file') edit((d) => applyAnnotations(d, layer.id, fromFile, base));
}

/** ホーム画面で選んだ実験を開く。new は新しい図、add は編集中の図に追加 (測定順に並べる) */
export async function openExperiments(keys: string[], mode: 'new' | 'add') {
  const lib = useLibrary.getState();
  const metas = keys
    .map((k) => lib.experiments.find((e) => e.key === k))
    .filter((e): e is NonNullable<typeof e> => !!e && canOpen(e))
    .sort((a, b) => a.measuredAt - b.measuredAt);
  if (!metas.length) {
    notify('選んだ実験は開けません', 'error');
    return;
  }
  // 2D は 1つの図に 1本 (1D と混ぜない)
  const two = metas.find((m) => m.dimension >= 2);
  if (two) {
    if (metas.length > 1) notify(`${two.fileName} (2D) だけを開きます。2D はほかのスペクトルと重ねられません`);
    if (!(await confirmDiscard())) return;
    try {
      addSpectrum2d(await load2dExperiment(two.key));
      useLibrary.setState({ selected: [] });
    } catch (e) {
      notify(e instanceof JdfError ? e.message : `${two.fileName}: ${(e as Error).message}`, 'error');
    }
    return;
  }
  if (mode === 'new') {
    if (!(await confirmDiscard())) return;
    loadDocument(emptyDocument(), {}, null, null);
  }
  const loaded: LoadedSpectrum[] = [];
  for (const m of metas) {
    try {
      loaded.push(await loadExperiment(m.key, readOptions()));
    } catch (e) {
      notify(e instanceof JdfError ? e.message : `${m.fileName}: ${(e as Error).message}`, 'error');
    }
  }
  if (!loaded.length) return;
  addSpectra(loaded);
  useEditor.setState({ screen: 'editor' });
  useLibrary.setState({ selected: [] });
}

export async function openDialog(mode: 'add' | 'new' = 'add') {
  if (fsWindow.showOpenFilePicker) {
    try {
      const handles = await fsWindow.showOpenFilePicker({ multiple: true, types: OPEN_TYPES });
      await openFiles(
        await Promise.all(handles.map(async (h) => ({ file: await h.getFile(), handle: h }))),
        mode,
      );
    } catch (e) {
      if ((e as Error).name !== 'AbortError') notify((e as Error).message, 'error');
    }
    return;
  }
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = `.jdf,${PROJECT_EXT}`;
  input.onchange = () => openFiles([...(input.files ?? [])].map((file) => ({ file })), mode);
  input.click();
}

/**
 * 保存した図を、使った測定のサンプルのカードに残す (ホーム画面から開き直せるように)。
 * 中身はブラウザの中 (IndexedDB) に置く。文献だけの図は、紐づけるサンプルがないので残さない。
 */
async function rememberFigure(json: string, fileName: string, handle: FileHandle | null) {
  const { doc } = useEditor.getState();
  const real = doc.spectra.filter((m) => !m.simulated);
  const sampleKeys = [
    ...new Set([
      ...real.map((m) => sampleKeyOf({ title: m.title, fileName: m.fileName })),
      ...doc.spectra2d.map((m) => sampleKeyOf({ title: m.title, fileName: m.fileName })),
    ]),
  ].filter(Boolean);
  if (!sampleKeys.length) return;
  const nuclei = doc.plot2d
    ? [...new Set(doc.spectra2d.map((m) => `${m.x.nucleus}/${m.y.nucleus}`))]
    : [...new Set(doc.spectra.map((m) => m.nucleus))];
  const figure = {
    id: doc.id,
    name: baseName(fileName),
    sampleKeys,
    nuclei,
    layers: doc.plot2d ? doc.spectra2d.length : doc.layers.length,
    savedAt: Date.now(),
    json,
  };
  // 保存先のファイルも覚えておくと、開き直したあとも「上書き保存」できる。
  // ただしブラウザに置けない形 (関数を持つ偽物など) のときは、図の中身だけ残す
  await saveFigure({ ...figure, handle: storable(handle) });
  if (!useLibrary.getState().figures.some((f) => f.id === figure.id)) {
    notify('図をホーム画面に残せませんでした (ブラウザの保存領域を確認してください)', 'error');
  }
}

/** IndexedDB に置ける値か調べる (置けなければ null) */
function storable<T>(value: T): T | null {
  if (!value) return null;
  try {
    structuredClone(value);
    return value;
  } catch {
    return null;
  }
}

/** ホーム画面のカードから、保存した図を開く */
export async function openSavedFigure(id: string) {
  const figure = useLibrary.getState().figures.find((f) => f.id === id);
  if (!figure) return;
  if (!(await confirmDiscard())) return;
  try {
    const { doc, data, fids, fids2d, data2d } = parseProject(figure.json);
    const handle = figure.handle ?? null;
    // 図入りの .jdf に保存した図は、そのファイルと同期できるように覚えておく
    if (handle && isJdfName(handle.name)) registerJdfHandle(handle.name, handle);
    loadDocument(doc, data, handle?.name ?? `${figure.name}${PROJECT_EXT}`, handle, fids, { data2d, fids2d });
    useEditor.setState({ screen: 'editor' });
    notify(`${figure.name} を開きました`);
  } catch (e) {
    notify(`開けませんでした: ${(e as Error).message}`, 'error');
  }
}

function defaultProjectName() {
  const { doc, projectName } = useEditor.getState();
  if (projectName) return baseName(projectName) + PROJECT_EXT;
  const first = doc.spectra[0]?.fileName ?? doc.spectra2d[0]?.fileName;
  return (first ? baseName(first) : 'figure') + PROJECT_EXT;
}

/**
 * 保存。.jdf にできる図 (1D で、土台にできる .jdf のスペクトルがある) は図入りの .jdf にする。
 * 2D・文献だけの図、土台の .jdf が見つからないときは .nmrfig
 */
export async function saveProject(saveAs = false) {
  const { doc } = useEditor.getState();
  if (!doc.layers.length && !doc.plot2d) return;
  const base = figureBaseOf(doc);
  if (base && (await saveFigureJdf(base, saveAs)) !== 'fallback') return;
  await saveNmrfig(saveAs);
}

/** 図の下書きの .jdf の名前 (前に保存した名前、なければ土台のファイル名 + _図) */
function defaultJdfName(base: FigureBase) {
  const { projectName } = useEditor.getState();
  if (projectName) return baseName(projectName) + '.jdf';
  return `${baseName(base.meta.fileName)}_図.jdf`;
}

/** 土台のスペクトルの .jdf の中身 (読み込んだときのもの、なければデータフォルダ・覚えているファイルから読む) */
async function templateOf(meta: SpectrumMeta): Promise<ArrayBuffer | null> {
  const { sources, fileHandle } = useEditor.getState();
  if (sources[meta.id]) return sources[meta.id];
  const candidates = [jdfHandle(syncFileOf(meta)), jdfHandle(meta.fileName), fileHandle && isJdfName(fileHandle.name) ? fileHandle : null];
  for (const handle of candidates) {
    if (!handle) continue;
    try {
      return await (await handle.getFile()).arrayBuffer();
    } catch {
      // 読めなければ次の候補
    }
  }
  return null;
}

async function saveFigureJdf(base: FigureBase, saveAs: boolean): Promise<'done' | 'fallback'> {
  const template = await templateOf(base.meta);
  if (!template) {
    notify(`土台の ${base.meta.fileName} が見つからないので、.nmrfig で保存します (ホーム画面でデータフォルダを読み込むと .jdf で保存できます)`);
    return 'fallback';
  }
  const { fileHandle } = useEditor.getState();
  if (!saveAs && fileHandle?.name.endsWith(PROJECT_EXT)) notify(`これからは Delta の形式 (.jdf) で保存します。保存する場所を選んでください (${fileHandle.name} はそのまま残ります)`);
  try {
    let handle = saveAs || !fileHandle || !isJdfName(fileHandle.name) ? null : fileHandle;
    if (handle && !(await canWrite(handle))) {
      notify('保存先のファイルに書き込めませんでした。保存する場所をもう一度選んでください', 'error');
      handle = null;
    }
    if (!handle && fsWindow.showSaveFilePicker) {
      const near = jdfHandle(base.meta.fileName);
      handle = await fsWindow.showSaveFilePicker({ suggestedName: defaultJdfName(base), types: JDF_TYPES, ...(near ? { startIn: near } : {}) });
    }
    const name = handle?.name ?? defaultJdfName(base);
    // 土台のスペクトル (Delta で処理したもの) は、保存したあとこのファイルと同期する。図の中身にもそう書いておく
    const syncable = !base.meta.processing;
    const s = useEditor.getState();
    const doc = syncable ? { ...s.doc, spectra: s.doc.spectra.map((m) => (m.id === base.meta.id ? { ...m, syncFile: name } : m)) } : s.doc;
    const json = serializeProject(doc, s.data, s.fids, s.fids2d, { jdfBase: base.meta.id });
    let bytes: ArrayBuffer;
    try {
      bytes = await buildFigureJdf(template, doc, base, json, s.fids[base.meta.id]);
    } catch (e) {
      notify(`.jdf にできなかったので、.nmrfig で保存します (${(e as Error).message})`, 'error');
      return 'fallback';
    }
    if (handle) {
      try {
        const w = await handle.createWritable();
        await w.write(new Blob([bytes]));
        await w.close();
      } catch (e) {
        if (!writeRefused(e)) throw e;
        await downloadJdf(bytes, json, handle.name, 'このブラウザではファイルに直接書き込めないので、ダウンロードとして保存しました (Chrome か Edge で開くと、同じファイルに上書き保存できます)');
        return 'done';
      }
      // 書けてから、同期の相手をこのファイルにする (先に変えると、まだ空のファイルを読みに行ってしまう)
      registerJdfHandle(name, handle);
      useEditor.setState((st) => ({ sources: { ...st.sources, [base.meta.id]: bytes } }));
      if (syncable && base.meta.syncFile !== name) {
        edit((d) => {
          const m = d.spectra.find((x) => x.id === base.meta.id);
          if (m) m.syncFile = name;
        }, false);
      }
      markSaved(name, handle);
      notify(`${name} に保存しました (ダブルクリックすると Delta で開けます)`);
      await rememberFigure(json, name, handle);
      await refreshIfInFolder(handle);
      return 'done';
    }
    await downloadJdf(bytes, json, name, '保存しました (ダウンロードのフォルダ)');
    return 'done';
  } catch (e) {
    if ((e as Error).name !== 'AbortError') notify(`保存できませんでした: ${(e as Error).message}`, 'error');
    return 'done';
  }
}

async function downloadJdf(bytes: ArrayBuffer, json: string, name: string, message: string) {
  downloadBlob(new Blob([bytes], { type: 'application/octet-stream' }), name);
  markSaved(name, null);
  notify(message);
  await rememberFigure(json, name, null);
}

async function saveNmrfig(saveAs: boolean) {
  const { doc, data, fids, fids2d, fileHandle } = useEditor.getState();
  const text = serializeProject(doc, data, fids, fids2d);
  try {
    let handle = saveAs || !fileHandle?.name.endsWith(PROJECT_EXT) ? null : fileHandle;
    // 覚えていた保存先は、書き込みの許可を取り直す (ブラウザを開き直したあとなど)
    if (handle && !(await canWrite(handle))) {
      notify('保存先のファイルに書き込めませんでした。保存する場所をもう一度選んでください', 'error');
      handle = null;
    }
    if (!handle && fsWindow.showSaveFilePicker) {
      handle = await fsWindow.showSaveFilePicker({ suggestedName: defaultProjectName(), types: PROJECT_TYPES });
    }
    if (handle) {
      try {
        const w = await handle.createWritable();
        await w.write(text);
        await w.close();
      } catch (e) {
        if (!writeRefused(e)) throw e;
        // ブラウザがファイルへの書き込みを許していない (アプリの中のブラウザなど、許可の確認を出せない所)。ダウンロードで残す
        await downloadProject(text, handle.name, 'このブラウザではファイルに直接書き込めないので、ダウンロードとして保存しました (Chrome か Edge で開くと、同じファイルに上書き保存できます)');
        return;
      }
      markSaved(handle.name, handle);
      notify(`${handle.name} に上書き保存しました`);
      await rememberFigure(text, handle.name, handle);
      return;
    }
    await downloadProject(text, defaultProjectName(), '保存しました');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') notify(`保存できませんでした: ${(e as Error).message}`, 'error');
  }
}

/** ダウンロードとして保存する (ファイルに直接書けないブラウザ) */
async function downloadProject(text: string, name: string, message: string) {
  downloadBlob(new Blob([text], { type: 'application/json' }), name);
  markSaved(name, null);
  notify(message);
  await rememberFigure(text, name, null);
}

/** ブラウザがファイルへの書き込みを許さなかった (許可がない・許可の確認を出せない) */
export function writeRefused(e: unknown) {
  const name = (e as Error)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError';
}

/** 覚えていた保存先に書き込めるか (必要なら許可を求める) */
async function canWrite(handle: FileHandle) {
  try {
    const state = (await handle.queryPermission?.({ mode: 'readwrite' })) ?? 'granted';
    if (state === 'granted') return true;
    return ((await handle.requestPermission?.({ mode: 'readwrite' })) ?? 'granted') === 'granted';
  } catch {
    return false;
  }
}

function exportName(svg: SVGSVGElement, ext: string) {
  return baseName(defaultProjectName()) + (svg.classList.contains('trend-chart') ? '-trend' : '') + ext;
}

export function exportSvg(svg: SVGSVGElement) {
  downloadBlob(new Blob([figureSvgString(svg)], { type: 'image/svg+xml' }), exportName(svg, '.svg'));
}

export async function exportPng(svg: SVGSVGElement) {
  const blob = await svgToPng(figureSvgString(svg), useEditor.getState().settings.pngScale);
  downloadBlob(blob, exportName(svg, '.png'));
}

export async function copyFigure(svg: SVGSVGElement) {
  try {
    const text = figureSvgString(svg);
    const png = await svgToPng(text, useEditor.getState().settings.pngScale);
    const vector = await copyFigureToClipboard(text, png);
    notify(
      vector
        ? '図をコピーしました (ベクター)。Word / PowerPoint に貼ると拡大しても荒くなりません。PowerPoint で線や文字を編集したいときは「SVG」で保存して挿入し、「図形に変換」してください'
        : '図をコピーしました (PNG)。このブラウザはベクターのコピーに対応していないので、きれいに使うときは「SVG」で保存して挿入してください',
    );
  } catch (e) {
    notify(`コピーできませんでした: ${(e as Error).message}`, 'error');
  }
}

import { baseName, copyFigureToClipboard, downloadBlob, figureSvgString, svgToPng } from '../lib/exportFigure';
import { integralArea, pointStep } from '../lib/integrals';
import { JdfError, readJdf, type LoadedSpectrum, type ReadOptions } from '../lib/jdf';
import { readJdf2d } from '../lib/jdf2d';
import { writeAnnotations } from '../lib/jdfWrite';
import { snapToPeak } from '../lib/spectrum';
import { labReference } from '../lib/settings';
import { PROJECT_EXT, parseProject, serializeProject } from '../lib/projectFile';
import { ask } from './dialog';
import { canOpen, load2dExperiment, loadExperiment, useLibrary } from './library';
import { addSpectra, addSpectrum2d, loadDocument, markSaved, notify, useEditor, type FileHandle } from './store';
import { emptyDocument } from './types';

type PickerOptions = {
  suggestedName?: string;
  multiple?: boolean;
  types?: { description: string; accept: Record<string, string[]> }[];
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
        if (mode === 'new' && !cleared && useEditor.getState().doc.layers.length) {
          if (!(await confirmDiscard())) return;
          loadDocument(emptyDocument(), {}, null, null);
        }
        cleared = true;
        const buffer = await file.arrayBuffer();
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

function defaultProjectName() {
  const { doc, projectName } = useEditor.getState();
  if (projectName) return projectName;
  const first = doc.spectra[0]?.fileName ?? doc.spectra2d[0]?.fileName;
  return (first ? baseName(first) : 'figure') + PROJECT_EXT;
}

export async function saveProject(saveAs = false) {
  const { doc, data, fids, fids2d, fileHandle } = useEditor.getState();
  if (!doc.layers.length && !doc.plot2d) return;
  const text = serializeProject(doc, data, fids, fids2d);
  try {
    let handle = saveAs ? null : fileHandle;
    // 覚えていた保存先は、書き込みの許可を取り直す (ブラウザを開き直したあとなど)
    if (handle && !(await canWrite(handle))) {
      notify('保存先のファイルに書き込めませんでした。保存する場所をもう一度選んでください', 'error');
      handle = null;
    }
    if (!handle && fsWindow.showSaveFilePicker) {
      handle = await fsWindow.showSaveFilePicker({ suggestedName: defaultProjectName(), types: PROJECT_TYPES });
    }
    if (handle) {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      markSaved(handle.name, handle);
      notify(`${handle.name} に上書き保存しました`);
      return;
    } else {
      const name = defaultProjectName();
      downloadBlob(new Blob([text], { type: 'application/json' }), name);
      markSaved(name, null);
    }
    notify('保存しました');
  } catch (e) {
    if ((e as Error).name !== 'AbortError') notify(`保存できませんでした: ${(e as Error).message}`, 'error');
  }
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

/**
 * 今の図のピーク値・積分を、元の .jdf に書き戻したファイルを作る (Delta で開く用)。
 * 元のファイルは変えず、コピーに書く。
 *
 * ※ 2026-09-19: 書いたファイルを Delta が開けないため、画面からは外してある。
 *   形の解析結果 (lib/jdfWrite.ts と docs/SPEC.md) は残してあるので、
 *   Delta 側の仕様が分かったときに再開できる。
 */
export async function exportDeltaJdf(layerId: string) {
  const { doc, data, sources } = useEditor.getState();
  const layer = doc.layers.find((l) => l.id === layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const arr = meta && data[meta.id];
  if (!layer || !meta || !arr) return notify('スペクトルを選んでください', 'error');
  const source = sources[meta.id];
  if (!source) return notify('元の .jdf が手元にありません。.jdf を開き直してから書き出してください', 'error');
  if (meta.processing) {
    return notify('この測定は FID です。Delta で処理済みのファイル (-1-2 など) にだけ書き戻せます', 'error');
  }

  // ピークの高さと積分値は、Delta と同じ出し方でそろえる (積分は点の間隔を掛けない)
  const window = pointStep(meta) * 2;
  const peaks = doc.peakLabels
    .filter((p) => p.layerId === layerId)
    .map((p) => ({ ppm: p.ppm, height: snapToPeak(arr, meta, p.ppm + meta.refOffset, window)?.height ?? 0 }));
  const integrals = doc.integrals
    .filter((x) => x.layerId === layerId)
    .map((x) => ({
      from: x.from,
      to: x.to,
      value: integralArea(arr, meta, x.from, x.to, doc.figure.integralBaseline !== false) / pointStep(meta),
    }));
  if (!peaks.length && !integrals.length) return notify('書き戻すピーク値と積分がありません', 'error');

  try {
    const out = writeAnnotations(source, { peaks, integrals });
    const name = `${baseName(meta.fileName)}-nmrfig.jdf`;
    const blob = new Blob([out], { type: 'application/octet-stream' });
    if (fsWindow.showSaveFilePicker) {
      const handle = await fsWindow.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'JEOL Delta', accept: { 'application/octet-stream': ['.jdf'] } }],
      });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      notify(`${handle.name} に書き出しました (ピーク値 ${peaks.length} 本 / 積分 ${integrals.length} 件)`);
    } else {
      downloadBlob(blob, name);
      notify(`${name} を保存しました (ピーク値 ${peaks.length} 本 / 積分 ${integrals.length} 件)`);
    }
  } catch (e) {
    if ((e as Error).name !== 'AbortError') notify(`書き出せませんでした: ${(e as Error).message}`, 'error');
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

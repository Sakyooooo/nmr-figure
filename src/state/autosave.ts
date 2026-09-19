/**
 * 作業中の図をブラウザ (IndexedDB) に自動で保存する。
 * ファイルに保存していなくても、閉じて開き直せば続きから作業できる。
 * 保存先のファイル (.nmrfig) も覚えるので、次からは「上書き保存」で同じファイルに書ける。
 */
import { dbGet, dbSet } from '../lib/db';
import type { FidData } from '../lib/fid';
import type { Fid2dData, Spectrum2dData } from '../lib/fid2d';
import { loadDocument, useEditor, type FileHandle } from './store';
import { migrateDocument, type NmrDocument } from './types';

/** 図の設定 (小さいので変えるたびに書く) */
interface WorkDoc {
  doc: NmrDocument;
  projectName: string | null;
  handle: FileHandle | null;
  dirty: boolean;
  at: number;
}

/** スペクトルの中身 (大きいので、開いているスペクトルが変わったときだけ書く) */
interface WorkData {
  key: string;
  data: Record<string, Float32Array>;
  fids: Record<string, FidData>;
  data2d: Record<string, Spectrum2dData>;
  fids2d: Record<string, Fid2dData>;
}

const DOC_KEY = 'doc';
const DATA_KEY = 'data';
const DELAY = 1200;

/** 今どのスペクトルを開いているか (中身を書き直すかの判断に使う) */
function dataKey(s: ReturnType<typeof useEditor.getState>) {
  return [...Object.keys(s.data), ...Object.keys(s.fids), ...Object.keys(s.data2d)].sort().join('|');
}

let timer: ReturnType<typeof setTimeout> | undefined;
let lastDataKey: string | null = null;
let restoring = false;

async function flush() {
  const s = useEditor.getState();
  if (restoring) return;
  const key = dataKey(s);
  if (key !== lastDataKey) {
    const payload: WorkData = { key, data: s.data, fids: s.fids, data2d: s.data2d, fids2d: s.fids2d };
    await dbSet('work', DATA_KEY, payload);
    lastDataKey = key;
  }
  const doc: WorkDoc = { doc: s.doc, projectName: s.projectName, handle: s.fileHandle, dirty: s.dirty, at: Date.now() };
  await dbSet('work', DOC_KEY, doc);
  useEditor.setState({ autoSavedAt: doc.at });
}

/** 変更のたびに少し待ってから書く */
export function startAutoSave() {
  useEditor.subscribe((s, prev) => {
    if (s.doc === prev.doc && s.data === prev.data && s.projectName === prev.projectName && s.fileHandle === prev.fileHandle) return;
    clearTimeout(timer);
    timer = setTimeout(() => void flush(), DELAY);
  });
  // 画面を閉じる・隠すときは待たずに書く
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      clearTimeout(timer);
      void flush();
    }
  });
}

/** 前回の続きを読み込む。図があれば true */
export async function restoreWork(): Promise<boolean> {
  const saved = await dbGet<WorkDoc>('work', DOC_KEY);
  if (!saved?.doc || (!saved.doc.layers?.length && !saved.doc.plot2d)) return false;
  const content = await dbGet<WorkData>('work', DATA_KEY);
  restoring = true;
  try {
    loadDocument(migrateDocument(saved.doc), content?.data ?? {}, saved.projectName, saved.handle ?? null, content?.fids ?? {}, {
      data2d: content?.data2d ?? {},
      fids2d: content?.fids2d ?? {},
    });
    // 読み込んだ直後は「前の続き」なので、ホーム画面から始める
    useEditor.setState({ screen: 'home', dirty: saved.dirty, autoSavedAt: saved.at });
    lastDataKey = content?.key ?? null;
  } finally {
    restoring = false;
  }
  return true;
}

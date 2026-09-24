/**
 * ChemDraw との連携。
 *  - 描く: 構造式ボタンで ChemDraw 用のファイル (.cdxml) を保存し、ChemDraw で開いて描く。ChemDraw で Ctrl+S (上書き保存) すると、
 *    アプリがダウンロード フォルダのそのファイルを読んで図に入れる (保存するたびに図も変わる)。図の構造式のダブルクリックも同じ
 *    (ブラウザからは ChemDraw を直接起動できないので、保存したファイルを開いてもらう。Edge の「この種類のファイルを常に開く」で自動で開く)
 *  - 貼る: ChemDraw の「Edit > Copy As > CDXML Text」を図の上で貼る、または .cdxml をドロップ。選んだまま貼ると置き換える
 * 書き出し (「ChemDraw で開く」) は chemdrawExport.ts
 */
import { create } from 'zustand';
import { tr } from '../i18n';
import { cdxmlToSvg, drawCdxml, looksLikeCdxml } from '../lib/cdxml';
import { dbGet, dbSet } from '../lib/db';
import { downloadBlob } from '../lib/exportFigure';
import { imageRect, PX_PER_PT } from '../lib/scene';
import { ask } from './dialog';
import { addFigureImage, edit, notify, openStructureEditor, select, setStructureTool, useEditor } from './store';

/** ChemDraw でふつうにコピーしたもの (ブラウザで読める形がない) を貼ったときの案内 */
export function explainChemDrawPaste() {
  notify(tr('ChemDraw の構造式は、ChemDraw で「Edit > Copy As > CDXML Text」を選んでコピーしてから貼ってください'), 'info');
}

/** ChemDraw の構造式 (CDXML) を図に置く。選んでいる ChemDraw の構造式があれば置き換える。置けたら true */
export function placeCdxml(text: string): boolean {
  const { doc, selection } = useEditor.getState();
  const target = selection?.kind === 'image' ? doc.figureImages.find((x) => x.id === selection.id && x.cdxml) : undefined;
  if (target) {
    if (!replaceCdxml(target.id, text)) return false;
    notify(tr('選んでいた構造式を、貼った ChemDraw の構造式に置き換えました'));
    return true;
  }
  if (!addCdxml(text)) return false;
  notify(tr('ChemDraw の構造式を置きました。上に置いた文字は構造式と一緒に動きます'));
  return true;
}

/** 新しく置く。ChemDraw と同じ大きさ (Word に貼ったときに、ChemDraw から貼った構造式と同じ大きさ)。置いた id */
function addCdxml(text: string): string | null {
  const drawn = cdxmlToSvg(text);
  if (!drawn) {
    notify(tr('ChemDraw の構造式を読めませんでした'), 'error');
    return null;
  }
  const fig = useEditor.getState().doc.figure;
  return addFigureImage({ svg: drawn.svg, cdxml: text, ratio: drawn.height / drawn.width, w: Math.min(0.9, (drawn.width * PX_PER_PT) / fig.width) });
}

/**
 * ChemDraw の構造式を差し替える。CDXML の座標が図の同じ位置に来るように置く
 * (ChemDraw で直しても、直していない原子は動かず、帰属の印もずれない)
 */
function replaceCdxml(imageId: string, text: string): boolean {
  const drawn = cdxmlToSvg(text);
  const { doc } = useEditor.getState();
  const target = doc.figureImages.find((x) => x.id === imageId);
  const now = drawCdxml(text, 1);
  if (!drawn || !now || !target) {
    notify(tr('ChemDraw の構造式を読めませんでした'), 'error');
    return false;
  }
  const fig = doc.figure;
  const ratio = drawn.height / drawn.width;
  const old = target.cdxml ? drawCdxml(target.cdxml, 1) : null;
  const r = imageRect(target, fig);
  // 前が ChemDraw の構造式でなければ (アプリで描いたもの・画像)、左上と ChemDraw の大きさで置き直す
  const k = old ? r.w / (old.box.r - old.box.l) : PX_PER_PT;
  const nx = old ? r.x + (now.box.l - old.box.l) * k : r.x;
  const ny = old ? r.y + (now.box.t - old.box.t) * k : r.y;
  const nw = (now.box.r - now.box.l) * k;
  const nh = nw * ratio;
  edit((d) => {
    const im = d.figureImages.find((x) => x.id === imageId);
    if (!im) return;
    // 構造式に固定した印は、図の上の位置を変えずに新しい枠に対する割合に直す
    const toNew = (fx: number, fy: number) => ({ x: (r.x + fx * r.w - nx) / nw, y: (r.y + fy * r.h - ny) / nh });
    for (const a of d.annotations) {
      if (a.imageId !== im.id) continue;
      const p1 = toNew(a.x1, a.y1);
      const p2 = toNew(a.x2, a.y2);
      Object.assign(a, { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y });
    }
    Object.assign(im, { cdxml: text, svg: drawn.svg, source: null, href: null, ratio, x: nx / fig.width, y: ny / fig.height, w: nw / fig.width });
  });
  return true;
}

// ---- ChemDraw で描く ----

/** 新しく描くときの白紙 (ChemDraw の ACS Document 1996 の書式) */
const EMPTY_CDXML = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE CDXML SYSTEM "https://static.chemistry.revvitycloud.com/cdxml/CDXML.dtd" >
<CDXML CreationProgram="NMR Figure Editor" Name="structure" LabelFont="3" LabelSize="10" LabelFace="96" CaptionFont="3" CaptionSize="10" HashSpacing="2.50" MarginWidth="1.60" LineWidth="0.60" BoldWidth="2" BondLength="14.40" BondSpacing="18" ChainAngle="120" LabelJustification="Auto" CaptionJustification="Left" color="0" bgcolor="1"><colortable>
<color r="1" g="1" b="1"/><color r="0" g="0" b="0"/></colortable><fonttable>
<font id="3" charset="iso-8859-1" name="Arial"/></fonttable><page id="1" BoundingBox="0 0 540 719.75" HeaderPosition="36" FooterPosition="36" PrintTrimMarks="yes" HeightPages="1" WidthPages="1"/></CDXML>
`;

type FileLike = { getFile(): Promise<File> };
type Folder = {
  kind: 'directory';
  name: string;
  getFileHandle(name: string): Promise<FileLike>;
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>;
};
type PickerWindow = Window & { showDirectoryPicker?: (o: { id?: string; mode?: 'read'; startIn?: string | Folder }) => Promise<Folder> };

const FOLDER_KEY = 'chemdrawFolder';
let folder: Folder | null = null;

/** 画面に出す: 覚えているダウンロード フォルダの名前 */
export const useChemDrawLink = create<{ folderName: string | null }>(() => ({ folderName: null }));

interface Watch {
  name: string;
  /** 描いた構造式を置いた先 (まだ保存していない新しい構造式は null) */
  imageId: string | null;
  seen: number;
  /** 最後に読んだ中身 (保存しても中身が同じなら何もしない) */
  text: string;
  started: number;
  found: boolean;
  warned: boolean;
}
const watches: Watch[] = [];
let timer: number | null = null;

export async function initChemDrawLink() {
  const saved = await dbGet<Folder>('kv', FOLDER_KEY).catch(() => undefined);
  if (saved) {
    folder = saved;
    useChemDrawLink.setState({ folderName: saved.name });
  }
}

/** ダウンロード フォルダを選ぶ (選び直す)。選べたら true */
export async function chooseChemDrawFolder(): Promise<boolean> {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) {
    notify(tr('このブラウザではフォルダを読めません。Edge か Chrome で開いてください'), 'error');
    return false;
  }
  try {
    const handle = await picker({ id: 'chemdraw', mode: 'read', startIn: 'downloads' });
    folder = handle;
    await dbSet('kv', FOLDER_KEY, handle);
    useChemDrawLink.setState({ folderName: handle.name });
    return true;
  } catch (e) {
    if ((e as Error).name !== 'AbortError') notify(tr('フォルダを開けませんでした: {message}', { message: (e as Error).message }), 'error');
    return false;
  }
}

/** ChemDraw で保存したファイルを読むためのフォルダ (ダウンロード フォルダ) を用意する */
async function readyFolder(): Promise<Folder | null> {
  if (folder) {
    try {
      const now = (await folder.queryPermission?.({ mode: 'read' })) ?? 'granted';
      if (now === 'granted' || ((await folder.requestPermission?.({ mode: 'read' })) ?? 'granted') === 'granted') return folder;
    } catch {
      // 拒否が覚えられているときは選び直してもらう
    }
  }
  const choice = await ask(
    tr('ChemDraw で描く準備'),
    tr('ChemDraw 用のファイルは「ダウンロード」フォルダに保存されます。ChemDraw で上書き保存した構造式をアプリが読めるように、ダウンロード フォルダを選んでください (初めてのときだけ)。'),
    [
      { label: tr('ダウンロード フォルダを選ぶ'), value: 'pick', kind: 'primary' },
      { label: tr('やめる'), value: 'cancel' },
    ],
  );
  if (choice !== 'pick') return null;
  return (await chooseChemDrawFolder()) ? folder : null;
}

/** 構造式ボタン: 決めてあるソフトで描く。まだなら聞く */
export async function drawStructure() {
  let tool = useEditor.getState().settings.ui.structureTool;
  if (!tool) {
    const choice = await ask(tr('構造式をどちらで描きますか'), tr('あとで設定で変えられます。ChemDraw は、この PC に ChemDraw が入っているときに使えます。'), [
      { label: tr('ChemDraw で描く'), value: 'chemdraw', kind: 'primary' },
      { label: tr('このアプリで描く'), value: 'ketcher' },
    ]);
    if (choice !== 'chemdraw' && choice !== 'ketcher') return;
    tool = choice;
    setStructureTool(tool);
  }
  if (tool === 'chemdraw') await drawInChemDraw(null);
  else openStructureEditor(null);
}

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * ChemDraw で描く / 直す。imageId があればその構造式、なければ白紙。
 * .cdxml をダウンロード フォルダに保存し、ChemDraw で上書き保存されたら図に入れる
 */
export async function drawInChemDraw(imageId: string | null) {
  const image = imageId ? useEditor.getState().doc.figureImages.find((x) => x.id === imageId) : null;
  if (imageId && !image?.cdxml) return;
  const dir = await readyFolder();
  if (!dir) return;
  const text = image?.cdxml ?? EMPTY_CDXML;
  const name = `structure-${stamp()}.cdxml`;
  downloadBlob(new Blob([text], { type: 'chemical/x-cdxml' }), name);
  // 同じ構造式を前にも開いていれば、古い方は見張るのをやめる
  for (let i = watches.length - 1; i >= 0; i--) if (imageId && watches[i].imageId === imageId) watches.splice(i, 1);
  watches.push({ name, imageId, seen: 0, text, started: Date.now(), found: false, warned: false });
  startWatching();
  notify(
    tr('{name} を保存しました。開くと ChemDraw が起動します。描いて Ctrl+S (上書き保存) すると図に入ります (Edge のダウンロードで「この種類のファイルを常に開く」にすると、次からは自動で開きます)', { name }),
    'info',
  );
}

function startWatching() {
  if (timer !== null) return;
  timer = window.setInterval(() => void pollChemDraw(), 1500);
  window.addEventListener('focus', () => void pollChemDraw());
}

let polling = false;

/** ChemDraw で保存されたかを見て、変わっていれば図に入れる */
export async function pollChemDraw() {
  if (polling || !folder || !watches.length) return;
  polling = true;
  try {
    const { doc } = useEditor.getState();
    for (const w of [...watches]) {
      // 置いた構造式を消した・別の図を開いたときは見張るのをやめる
      if (w.imageId && !doc.figureImages.some((x) => x.id === w.imageId)) {
        watches.splice(watches.indexOf(w), 1);
        continue;
      }
      let file: File;
      try {
        file = await (await folder.getFileHandle(w.name)).getFile();
      } catch {
        if (!w.found && !w.warned && Date.now() - w.started > 20_000) {
          w.warned = true;
          notify(
            tr('{folder} に {name} が見つかりません。ダウンロードの保存先のフォルダを、設定の「ChemDraw の保存先」で選び直してください', { folder: folder.name, name: w.name }),
            'error',
          );
        }
        continue;
      }
      w.found = true;
      if (file.lastModified === w.seen) continue;
      w.seen = file.lastModified;
      const text = await file.text();
      if (text === w.text || !looksLikeCdxml(text)) continue;
      // 書きかけ (読めない) なら、次に保存されたときに読む
      if (!drawCdxml(text, 1)) continue;
      w.text = text;
      if (w.imageId) {
        if (replaceCdxml(w.imageId, text)) notify(tr('ChemDraw で保存した構造式に置き換えました'));
      } else {
        const id = addCdxml(text);
        if (id) {
          w.imageId = id;
          select({ kind: 'image', id });
          notify(tr('ChemDraw で描いた構造式を図に置きました。ChemDraw で直して保存すると、図も変わります'));
        }
      }
    }
  } finally {
    polling = false;
  }
}

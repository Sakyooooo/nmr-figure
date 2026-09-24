/**
 * ChemDraw との連携。
 *  - 描く: 構造式ボタン・構造式のダブルクリックで ChemDraw がすぐ開き、描いた内容が保存しなくても図に入る。
 *    ブラウザからは ChemDraw を起動できず、描いている途中の中身も見えないので、この PC に入れた連携 (tools/chemdraw-link) を
 *    nmrfig-chemdraw: のリンクで呼ぶ。連携が構造式を NMR の保存先の「ChemDraw」フォルダに置いて ChemDraw で開き、
 *    描いている間 1 秒ごとにそのファイルへ書く。アプリはそのファイルを見て図を直す
 *  - 貼る: ChemDraw の「Edit > Copy As > CDXML Text」を図の上で貼る、または .cdxml をドロップ。選んだまま貼ると置き換える
 * 書き出し (「ChemDraw で開く」) は chemdrawExport.ts
 */
import { tr } from '../i18n';
import { cdxmlToSvg, drawCdxml, looksLikeCdxml } from '../lib/cdxml';
import { imageRect, PX_PER_PT } from '../lib/scene';
import { ask } from './dialog';
import { dataFolderName, folderChildFile, folderReadPermission, pickFolder } from './library';
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
function addCdxml(text: string, id?: string): string | null {
  const drawn = cdxmlToSvg(text);
  if (!drawn) {
    notify(tr('ChemDraw の構造式を読めませんでした'), 'error');
    return null;
  }
  const fig = useEditor.getState().doc.figure;
  return addFigureImage({ id, svg: drawn.svg, cdxml: text, ratio: drawn.height / drawn.width, w: Math.min(0.9, (drawn.width * PX_PER_PT) / fig.width) });
}

/**
 * ChemDraw の構造式を差し替える。CDXML の座標が図の同じ位置に来るように置く
 * (ChemDraw で直しても、直していない原子は動かず、帰属の印もずれない)
 */
function replaceCdxml(imageId: string, text: string, record = true): boolean {
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
  }, record);
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

/** 連携が構造式を置くフォルダ (NMR の保存先の中) */
export const CHEMDRAW_DIR = 'ChemDraw';
/** 連携の入れ方の案内に出す場所 */
export const LINK_INSTALLER = 'tools\\chemdraw-link\\ChemDraw連携を入れる.bat';

interface Watch {
  name: string;
  /** 構造式の id (新しく描くときは、1 回目に図に置くときにこの id で置く) */
  imageId: string;
  placed: boolean;
  seen: number;
  /** 最後に読んだ中身 (同じなら何もしない) */
  text: string;
  started: number;
  found: boolean;
  warned: boolean;
  /** 最後に「元に戻す」の区切りを作った時刻 (描いている間の細かい変化は 1 つにまとめる) */
  recorded: number;
}
const watches: Watch[] = [];
let timer: number | null = null;

/** 構造式ボタン: 決めてあるソフトで描く。まだなら聞く */
export async function drawStructure() {
  let tool = useEditor.getState().settings.ui.structureTool;
  if (!tool) {
    const choice = await ask(tr('構造式をどちらで描きますか'), tr('あとで設定で変えられます。ChemDraw は、この PC に ChemDraw と連携 (1 回だけ入れる) があるときに使えます。'), [
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

/** 構造式の id → ファイルの名前 (連携は structure-16進 だけを扱う) */
function fileKey(id: string) {
  return 'structure-' + id.replace(/[^0-9a-f]/gi, '').toLowerCase().slice(0, 16);
}

/** CDXML → deflate → base64url (リンクに入れる) */
async function pack(text: string) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** 構造式を読むための NMR の保存先 (開いていなければ選んでもらう) */
async function readyFolder(): Promise<boolean> {
  if (!dataFolderName()) {
    const choice = await ask(tr('NMR の保存先を開いてください'), tr('ChemDraw で描いた構造式は、NMR の保存先の中の「ChemDraw」フォルダを通して図に入ります。NMR の保存先 (ホーム画面で開くフォルダ) を選んでください。'), [
      { label: tr('NMR の保存先を選ぶ'), value: 'pick', kind: 'primary' },
      { label: tr('やめる'), value: 'cancel' },
    ]);
    if (choice !== 'pick') return false;
    await pickFolder();
    if (!dataFolderName()) return false;
  }
  if ((await folderReadPermission(true)) !== 'granted') {
    notify(tr('NMR の保存先の読み取りが許可されませんでした'), 'error');
    return false;
  }
  return true;
}

/**
 * ChemDraw で描く / 直す。imageId があればその構造式、なければ白紙。
 * 連携が ChemDraw で開き、描いている間の中身を NMR の保存先の ChemDraw フォルダに書くので、それを図に入れる
 */
export async function drawInChemDraw(imageId: string | null) {
  const image = imageId ? useEditor.getState().doc.figureImages.find((x) => x.id === imageId) : null;
  if (imageId && !image?.cdxml) return;
  if (!(await readyFolder())) return;
  const id = imageId ?? crypto.randomUUID();
  const name = fileKey(id);
  const text = image?.cdxml ?? EMPTY_CDXML;
  const url = `nmrfig-chemdraw:open?name=${name}&data=${await pack(text)}`;
  // Windows のコマンドの長さ (32,767 文字) に収める
  if (url.length > 30000) {
    notify(tr('この構造式は大きすぎて ChemDraw に渡せません。ChemDraw で直接開いてください'), 'error');
    return;
  }
  const a = document.createElement('a');
  a.href = url;
  a.click();
  // 同じ構造式を前にも開いていれば、古い見張りは除く
  for (let i = watches.length - 1; i >= 0; i--) if (watches[i].name === name) watches.splice(i, 1);
  watches.push({ name, imageId: id, placed: !!imageId, seen: 0, text, started: Date.now(), found: false, warned: false, recorded: 0 });
  startWatching();
  notify(tr('ChemDraw で開いています。描いた内容はそのまま図に入ります'), 'info');
}

function startWatching() {
  if (timer !== null) return;
  timer = window.setInterval(() => void pollChemDraw(), 1000);
  window.addEventListener('focus', () => void pollChemDraw());
}

let polling = false;

/** 連携が書いた構造式を読み、変わっていれば図に入れる */
export async function pollChemDraw() {
  if (polling || !watches.length) return;
  polling = true;
  try {
    const { doc } = useEditor.getState();
    for (const w of [...watches]) {
      // 置いた構造式を消した・別の図を開いたときは見張るのをやめる
      if (w.placed && !doc.figureImages.some((x) => x.id === w.imageId)) {
        watches.splice(watches.indexOf(w), 1);
        continue;
      }
      const file = await folderChildFile(CHEMDRAW_DIR, `${w.name}.cdxml`);
      if (!file) {
        if (!w.found && !w.warned && Date.now() - w.started > 12_000) {
          w.warned = true;
          void ask(
            tr('ChemDraw が開きませんでしたか'),
            tr('ChemDraw 連携がこの PC に入っていないか、連携に選んだ NMR の保存先が、アプリで開いているフォルダ ({folder}) と違います。アプリのフォルダの {installer} をダブルクリックして入れて (入れ直して) ください。', {
              folder: dataFolderName() ?? '',
              installer: LINK_INSTALLER,
            }),
            [{ label: tr('閉じる'), value: 'ok', kind: 'primary' }],
          );
        }
        continue;
      }
      w.found = true;
      if (file.lastModified === w.seen) continue;
      w.seen = file.lastModified;
      const text = await file.text();
      if (text === w.text || !looksLikeCdxml(text)) continue;
      // 書きかけ・白紙なら、次に書かれたときに読む
      if (!drawCdxml(text, 1)) continue;
      w.text = text;
      if (w.placed) {
        // 描いている間の変化は、4 秒ごとにだけ「元に戻す」の区切りを作る
        const record = Date.now() - w.recorded > 4000;
        if (record) w.recorded = Date.now();
        replaceCdxml(w.imageId, text, record);
      } else if (addCdxml(text, w.imageId)) {
        w.placed = true;
        w.recorded = Date.now();
        select({ kind: 'image', id: w.imageId });
        notify(tr('ChemDraw で描いた構造式を図に置きました。ChemDraw で直すと、図も変わります'));
      }
    }
  } finally {
    polling = false;
  }
}

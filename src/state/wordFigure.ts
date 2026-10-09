/**
 * Word に貼る図 (本人の希望 2026-10-01「Word に貼った図からスペクトルを開いて拡大などできるように。別のファイルとして開き、
 * 直したら反映。元のデータは変えない。自分の PC だけ。Ctrl+クリックでもよい」「F9 で新しくなる形」)。
 *  - 作る: 今の図の写し (.nmrfig、データごと) と、その見た目 (.svg) を NMR の保存先の「Word図」フォルダに置き、
 *    写しを開くリンク (アプリの URL ?word=<id>) をコピーする。元の図・データには触らない
 *  - Word: 「挿入 → 画像 → このデバイス」で .svg を「挿入とリンク」で入れ、図に Ctrl+K でリンクを付ける
 *    (ブラウザからは「ファイルにリンクした図」を貼れない。HTML のフィールドの書き方は Word が捨てる。Word で確かめた)
 *  - 図を Ctrl+クリック → アプリが写しを開く → 直して保存すると .nmrfig と .svg を書き直す → Word で F9 で新しくなる
 *    (ファイルにリンクした図は、画像を書き換えて F9 で新しくなる。SVG でも。Word で確かめた)
 *  - 写しは Delta と同期しない (deltaSync)。同期すると元の .jdf に処理の記録を書くことがあるため
 */
import { tr } from '../i18n';
import { figureSvgString } from '../lib/exportFigure';
import { PROJECT_EXT, serializeProject } from '../lib/projectFile';
import { findWordFigureFile, newWordFigureId, WORD_DIR, wordFigureName, wordFigureUrl } from '../lib/wordFigureLink';
import { ask } from './dialog';
import { defaultProjectName, openFiles } from './fileOps';
import { dataFolderName, folderChildFile, folderChildNames, folderReadPermission, folderWriteChildFile, folderWritePermission, pickFolder } from './library';
import { markSaved, notify, useEditor } from './store';

/** NMR の保存先を使えるようにする (開いていなければ選んでもらう。ボタンを押したときなど、許可を聞いてよいときに呼ぶ) */
async function readyFolder(write: boolean): Promise<boolean> {
  if (!dataFolderName()) {
    const choice = await ask(tr('NMR の保存先を開いてください'), tr('Word に貼る図は、NMR の保存先の中の「Word図」フォルダに置きます。NMR の保存先 (ホーム画面で開くフォルダ) を選んでください。'), [
      { label: tr('NMR の保存先を選ぶ'), value: 'pick', kind: 'primary' },
    ]);
    if (choice !== 'pick') return false;
    await pickFolder();
    if (!dataFolderName()) return false;
  }
  if ((await folderReadPermission(true)) !== 'granted') {
    notify(tr('NMR の保存先の読み取りが許可されませんでした'), 'error');
    return false;
  }
  if (write && (await folderWritePermission(true)) !== 'granted') {
    notify(tr('NMR の保存先への書き込みが許可されませんでした'), 'error');
    return false;
  }
  return true;
}

/** リンクの文字をコピーする。クリップボードの書き込みが許されないとき (アプリの中のブラウザなど) は、copy イベントで書く */
async function copyLink(url: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    const onCopy = (e: ClipboardEvent) => {
      e.clipboardData?.setData('text/plain', url);
      e.preventDefault();
    };
    document.addEventListener('copy', onCopy);
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.removeEventListener('copy', onCopy);
    }
  }
}

/** 書き出し: Word に貼る図を作る (今の図の写しと、その見た目) */
export async function makeWordFigure(svg: SVGSVGElement) {
  const st = useEditor.getState();
  if (!st.doc.layers.length && !st.doc.plot2d) return;
  if (st.doc.wordFigure) {
    notify(tr('これは Word に貼った図の写しです。直して保存すると、Word で F9 を押せば新しくなります (もう一度作る必要はありません)'));
    return;
  }
  // 見た目は押したときのもの (このあとフォルダを選ぶ間に画面が変わっても同じ)
  const svgText = figureSvgString(svg);
  // リンクは押した直後にコピーする (フォルダに書くのを待つと、ブラウザがコピーを許す時間を過ぎることがある)
  const id = newWordFigureId();
  const url = wordFigureUrl(id);
  const copying = copyLink(url);
  if (!(await readyFolder(true))) return;
  const name = wordFigureName(st.projectName ?? defaultProjectName(), id);
  const doc = { ...st.doc, id: crypto.randomUUID(), wordFigure: { id, name } };
  try {
    await folderWriteChildFile(WORD_DIR, name + PROJECT_EXT, serializeProject(doc, st.data, st.fids, st.fids2d, { data2d: st.data2d }));
    await folderWriteChildFile(WORD_DIR, name + '.svg', svgText);
  } catch (e) {
    notify(tr('Word に貼る図を作れませんでした: {message}', { message: (e as Error).message }), 'error');
    return;
  }
  const copied = await copying;
  const steps = tr(
    'NMR の保存先「{folder}」の「{dir}」フォルダに、この図の写し「{name}」を作りました。元の図とデータは変わりません。\n\nWord では:\n1. 「挿入」→「画像」→「このデバイス」で「{dir}」の「{name}.svg」を選ぶ\n2. 「挿入」ボタンの横の ▼ から「挿入とリンク」を選ぶ\n3. 入った図を選んで Ctrl+K を押し、「アドレス」に Ctrl+V で貼って OK (リンクはコピーしてあります)\n\nこの図を Ctrl+クリックすると、写しがこのアプリで開きます。直して保存したら、Word で図を選んで F9 を押すと新しくなります。\n\nリンク: {url}',
    { folder: dataFolderName() ?? '', dir: WORD_DIR, name, url },
  );
  for (;;) {
    const choice = await ask(tr('Word に貼る図を作りました'), copied ? steps : steps + '\n\n' + tr('リンクをコピーできなかったので、下のボタンでコピーしてください。'), [
      { label: tr('リンクをもう一度コピー'), value: 'copy' },
      { label: tr('閉じる'), value: 'ok', kind: 'primary' },
    ], { cancel: false });
    if (choice !== 'copy') break;
    if (await copyLink(url)) notify(tr('リンクをコピーしました: {url}', { url }));
  }
}

/** 保存: 写しの .nmrfig と見た目の .svg を書き直す (Word で F9 を押すと新しくなる) */
export async function saveWordFigure() {
  const { doc, data, fids, fids2d, data2d } = useEditor.getState();
  const wf = doc.wordFigure;
  if (!wf) return;
  if (!(await readyFolder(true))) return;
  const svg = document.querySelector<SVGSVGElement>('svg.figure');
  try {
    await folderWriteChildFile(WORD_DIR, wf.name + PROJECT_EXT, serializeProject(doc, data, fids, fids2d, { data2d }));
    if (svg) await folderWriteChildFile(WORD_DIR, wf.name + '.svg', figureSvgString(svg));
  } catch (e) {
    notify(tr('保存できませんでした: {message}', { message: (e as Error).message }), 'error');
    return;
  }
  markSaved(wf.name + PROJECT_EXT, null);
  if (svg) notify(tr('Word に貼った図の写しを保存しました。Word で図を選んで F9 を押すと新しくなります'));
  else notify(tr('写しは保存しましたが、図の見た目は書き直せませんでした。「スペクトル」の表示に戻してから、もう一度保存してください'), 'error');
}

/** 起動したときに ?word=<id> があれば、その写しを開く (Word で図を Ctrl+クリックしたとき) */
export async function openWordFigureFromUrl() {
  const params = new URLSearchParams(location.search);
  const id = params.get('word');
  if (!id) return;
  // 開き直したときにまた開かないように、URL から外す
  params.delete('word');
  history.replaceState(null, '', location.pathname + (params.toString() ? `?${params}` : '') + location.hash);
  if (!/^[0-9a-f]{8}$/.test(id)) return;
  // フォルダの許可はボタンを押したときにしか聞けないので、先に聞く
  const ready = dataFolderName() && (await folderReadPermission(false)) === 'granted';
  if (!ready) {
    const choice = await ask(tr('Word に貼った図を開きます'), tr('Word に貼った図の写しを、NMR の保存先の「{dir}」フォルダから開きます。', { dir: WORD_DIR }), [
      { label: tr('開く'), value: 'open', kind: 'primary' },
    ]);
    if (choice !== 'open' || !(await readyFolder(false))) return;
  }
  const fileName = findWordFigureFile(await folderChildNames(WORD_DIR), id);
  const file = fileName ? await folderChildFile(WORD_DIR, fileName) : null;
  if (!file) {
    notify(tr('Word に貼った図の写しが見つかりません (NMR の保存先の「{dir}」フォルダを確かめてください)', { dir: WORD_DIR }), 'error');
    return;
  }
  await openFiles([{ file }], 'new');
  if (useEditor.getState().doc.wordFigure?.id === id) {
    notify(tr('Word に貼った図の写しを開きました。直して保存すると、Word で F9 を押せば新しくなります (元のデータは変わりません)'));
  }
}

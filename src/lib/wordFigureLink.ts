/** Word に貼る図 (state/wordFigure.ts) の、ファイルの名前とリンク (ブラウザに頼らない部分) */
import { PROJECT_EXT } from './projectFile';

export const WORD_DIR = 'Word図';

/** 写しのファイルの名前 (拡張子なし): 図の名前_id。ファイル名に使えない文字は _ にする */
export function wordFigureName(base: string, id: string): string {
  const safe = base.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_').trim() || 'figure';
  return `${safe}_${id}`;
}

/** 写しの id (16 進 8 字) */
export function newWordFigureId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 写しを開くリンク (今開いているアプリの場所 + ?word=<id>) */
export function wordFigureUrl(id: string, href = location.href): string {
  const url = new URL(href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('word', id);
  return url.toString();
}

/** Word図 フォルダのファイルの名前から、id の写し (.nmrfig) を探す */
export function findWordFigureFile(names: string[], id: string): string | null {
  return names.find((n) => n.endsWith(`_${id}${PROJECT_EXT}`)) ?? null;
}

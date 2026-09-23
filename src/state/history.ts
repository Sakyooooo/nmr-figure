/**
 * Delta との同期の記録。.jdf (ファイル名) ごとに、ピーク値・積分がどう移り変わったかを残す。
 * Delta もこのアプリも同じファイルに上書きするので、前の中身を戻せるのはこの記録だけ。
 * - Delta で保存されたのを見つけたとき・このアプリから書いたとき (同期ごと) に 1 件足す
 * - Delta が書いた中身は、注釈の場所をそのまま (block) 残す。戻すときは Delta が書いたとおりに戻る (文字などの注釈も)
 * - このアプリで初めて書き込む前のファイルは、丸ごと別に残す (originals)
 * 置き場所はブラウザの中 (IndexedDB)。消されないよう、ブラウザに「残してほしい」と頼んでおく (navigator.storage.persist)
 */
import { create } from 'zustand';
import { dbGet, dbPut } from '../lib/db';
import type { WritableAnnotations } from '../lib/jdfWrite';

export interface HistoryEntry {
  id: string;
  at: number;
  /** delta: Delta で保存された中身 / app: このアプリで編集した中身 */
  source: 'delta' | 'app';
  /** 一覧に出す説明 (「Delta で保存」「このソフトで編集」「記録から戻した」など) */
  note: string;
  annotations: WritableAnnotations;
  /** 積分ごとの Delta の画面の値 (一覧に出す) */
  shown: number[];
  /** 中身を比べる鍵 (lib/deltaSync.ts の annotationKey) */
  key: string;
  /** Delta が書いた注釈の場所 (そのまま戻すため) */
  block?: Uint8Array | null;
}

interface FileHistory {
  fileName: string;
  entries: HistoryEntry[];
}

export interface Original {
  fileName: string;
  savedAt: number;
  bytes: ArrayBuffer;
}

/** 1 ファイルに残す記録の上限 (古いものから消す。最初の 1 件は残す) */
const LIMIT = 300;

/** 記録が増えたことを画面に知らせる (ファイル名 → 変わった回数) */
export const useHistory = create<{ version: Record<string, number> }>(() => ({ version: {} }));

let persistAsked = false;

export async function historyOf(fileName: string): Promise<HistoryEntry[]> {
  const h = await dbGet<FileHistory>('history', fileName);
  return h?.entries ?? [];
}

/**
 * 記録を 1 件足す。直前の記録と中身が同じなら足さない。足したら true。
 * skipIfSeen: 同じ出どころ (Delta / このソフト) の直近の記録と同じ中身でも足さない (ファイルを開いただけのときなど)
 */
export async function addHistory(
  fileName: string,
  entry: Omit<HistoryEntry, 'id' | 'at'> & { at?: number },
  options: { skipIfSeen?: boolean } = {},
): Promise<boolean> {
  const entries = await historyOf(fileName);
  const last = entries[entries.length - 1];
  if (last && last.key === entry.key) return false;
  if (options.skipIfSeen) {
    const lastSame = [...entries].reverse().find((e) => e.source === entry.source);
    if (lastSame && lastSame.key === entry.key) return false;
  }
  const next: HistoryEntry = { id: crypto.randomUUID(), at: entry.at ?? Date.now(), ...entry };
  let list = [...entries, next];
  if (list.length > LIMIT) list = [list[0], ...list.slice(list.length - LIMIT + 1)];
  await dbPut('history', fileName, { fileName, entries: list } satisfies FileHistory);
  await askPersist();
  useHistory.setState((s) => ({ version: { ...s.version, [fileName]: (s.version[fileName] ?? 0) + 1 } }));
  return true;
}

/** 初めて書き込む前のファイルを残す (すでにあれば何もしない) */
export async function keepOriginal(fileName: string, bytes: ArrayBuffer) {
  if (await dbGet<Original>('originals', fileName)) return;
  await dbPut('originals', fileName, { fileName, savedAt: Date.now(), bytes: bytes.slice(0) } satisfies Original);
  await askPersist();
  useHistory.setState((s) => ({ version: { ...s.version, [fileName]: (s.version[fileName] ?? 0) + 1 } }));
}

export async function originalOf(fileName: string): Promise<Original | undefined> {
  return dbGet<Original>('originals', fileName);
}

/** ブラウザが容量不足のときに記録を消さないよう頼む (一度だけ) */
async function askPersist() {
  if (persistAsked) return;
  persistAsked = true;
  try {
    await navigator.storage?.persist?.();
  } catch {
    // 頼めなくても記録は残る (容量が足りなくなったときに消される可能性があるだけ)
  }
}

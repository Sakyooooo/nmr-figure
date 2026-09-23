/**
 * ブラウザ内の保存 (IndexedDB)。データフォルダの場所、ファイル情報のキャッシュ、
 * サンプルごとのメモ・タグ・スキーム、作業中の図 (自動保存)、保存した図、
 * Delta との同期の記録 (history: .jdf ごとの注釈の移り変わり / originals: 初めて書き込む前のファイル / sync: 図ごとに最後に合わせた時点) を置く。
 * 使えない環境では何もしない。
 */
const DB_NAME = 'nmr-figure-editor';
const VERSION = 4;
export type StoreName = 'kv' | 'meta' | 'notes' | 'work' | 'figures' | 'history' | 'originals' | 'sync';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const name of ['kv', 'meta', 'notes', 'work', 'figures', 'history', 'originals', 'sync']) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    // 古い版のタブが開いたままだと、閉じられるまで待たされる。画面で知らせる (main.tsx)。
    // そのタブが裏で止まっていると blocked が来ないことがあるので、3 秒たっても開けなければ知らせる
    const slow = setTimeout(() => window.dispatchEvent(new Event('nmr-db-blocked')), 3000);
    req.onsuccess = () => {
      clearTimeout(slow);
      // 新しい版のアプリが別のタブで開いたら、こちらは閉じて道を空ける (閉じないと向こうの更新が止まったままになる)
      req.result.onversionchange = () => {
        req.result.close();
        opening = null;
      };
      window.dispatchEvent(new Event('nmr-db-open'));
      resolve(req.result);
    };
    req.onerror = () => {
      clearTimeout(slow);
      reject(req.error);
    };
    req.onblocked = () => window.dispatchEvent(new Event('nmr-db-blocked'));
  });
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function dbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  try {
    return (await run(store, 'readonly', (s) => s.get(key))) as T | undefined;
  } catch {
    return undefined;
  }
}

export async function dbSet(store: StoreName, key: string, value: unknown): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.put(value, key));
  } catch {
    // 保存できなくても動作は続ける
  }
}

/** 書けなかったときに知らせてほしい所 (Delta との同期の記録など) で使う。失敗すると例外になる */
export async function dbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  await run(store, 'readwrite', (s) => s.put(value, key));
}

export async function dbDelete(store: StoreName, key: string): Promise<void> {
  try {
    await run(store, 'readwrite', (s) => s.delete(key));
  } catch {
    // 同上
  }
}

export async function dbEntries<T>(store: StoreName): Promise<Map<string, T>> {
  try {
    const [keys, values] = await Promise.all([
      run(store, 'readonly', (s) => s.getAllKeys()),
      run(store, 'readonly', (s) => s.getAll()),
    ]);
    return new Map(keys.map((k, i) => [String(k), values[i] as T]));
  } catch {
    return new Map();
  }
}

/**
 * ブラウザ内の保存 (IndexedDB)。データフォルダの場所、ファイル情報のキャッシュ、
 * サンプルごとのメモ・タグ・スキーム、作業中の図 (自動保存) を置く。使えない環境では何もしない。
 */
const DB_NAME = 'nmr-figure-editor';
const VERSION = 2;
export type StoreName = 'kv' | 'meta' | 'notes' | 'work';

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const name of ['kv', 'meta', 'notes', 'work']) {
        if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

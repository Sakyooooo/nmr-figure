/**
 * Bruker (TopSpin) のデータのフォルダを扱う。
 * - フォルダ (データフォルダ・ドロップしたフォルダ) の中から測定 (acqus のあるフォルダ) を探す
 * - 測定を読む (lib/bruker.ts)
 * - TopSpin への書き戻し: 積分・ピーク値・INTSCL をまとめた「仮のファイル」(lib/topspin.ts の bundle) にして、
 *   Delta との同期 (state/deltaSync.ts) と同じ仕組みで読み書きする。書くのは intrng・peaklist.xml と、procs の INTSCL の行だけ
 */
import { tr } from '../i18n';
import { brukerFileName, brukerInfo, num, parseParams, readBruker1d, readBruker2d, str, type BrukerInput, type BrukerPath } from '../lib/bruker';
import type { LoadedSpectrum, ReadOptions } from '../lib/jdf';
import type { Loaded2dSpectrum } from '../lib/jdf2d';
import type { ExperimentMeta } from '../lib/jdfMeta';
import { normalizeNucleus } from '../lib/nuclei';
import { decodeBundle, encodeBundle, withIntscl, type TopspinBundle } from '../lib/topspin';
import type { FileHandle } from './store';

type Writable = { write(data: string | Blob): Promise<void>; close(): Promise<void> };

export interface FileLike {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
  createWritable?(): Promise<Writable>;
}

/** フォルダ (ブラウザの FileSystemDirectoryHandle と同じ形。ドロップしたフォルダなど、読むだけのものもある) */
export interface DirLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileLike | DirLike>;
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirLike>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<FileLike>;
  removeEntry?(name: string): Promise<void>;
  queryPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

/** 測定 1 つの 1 つの版 (TopSpin で処理した版は処理番号ごと、生データは 1 つ) */
export interface BrukerDataset {
  path: BrukerPath;
  dimension: 1 | 2;
  /** 実験番号のフォルダ */
  exp: DirLike;
  /** 処理番号のフォルダ (生データは pdata/1。無ければ null) */
  proc: DirLike | null;
  /** 一覧に出すときの主なファイル (1r・2rr・fid・ser) の大きさと更新時刻 */
  size: number;
  lastModified: number;
  /** 書き込みの許可を聞く相手 (データフォルダ・ドロップしたフォルダ) */
  root: DirLike;
}

/** 探すフォルダの深さ (データフォルダ/データ名/実験番号 のほか、TopSpin の data/ユーザー/nmr/ の下も届くように) */
const MAX_DEPTH = 5;
/** 見るフォルダの数の上限 (大きなフォルダを選んだときに止まらないように) */
const MAX_DIRS = 20000;

/** フォルダの中の Bruker の測定を探す。onDir は見たフォルダの数 (進み具合) */
export async function findDatasets(root: DirLike, onDir?: (count: number) => void): Promise<BrukerDataset[]> {
  const out: BrukerDataset[] = [];
  let seen = 0;
  const walk = async (dir: DirLike, depth: number, parent: string | null) => {
    if (++seen > MAX_DIRS) return;
    if (seen % 50 === 0) onDir?.(seen);
    const files = new Map<string, FileLike>();
    const dirs: DirLike[] = [];
    for await (const e of dir.values()) {
      if (e.kind === 'file') files.set(e.name, e);
      else if (!e.name.startsWith('.')) dirs.push(e);
    }
    if (files.has('acqus')) {
      out.push(...(await experimentDatasets(dir, files, dirs, parent ?? (await nameFromAudit(files)) ?? dir.name, root)));
      return;
    }
    if (depth >= MAX_DEPTH) return;
    for (const sub of dirs) await walk(sub, depth + 1, dir.name);
  };
  await walk(root, 0, null);
  return out;
}

/** 実験番号のフォルダだけを選んだとき: audita.txt に書いてある場所 (…/データ名/実験番号/audita.txt) からデータ名を取る */
async function nameFromAudit(files: Map<string, FileLike>): Promise<string | null> {
  const audit = files.get('audita.txt');
  if (!audit) return null;
  try {
    const head = await (await audit.getFile()).slice(0, 2000).text();
    const m = /\$\$\s*(.+?)[\\/]([^\\/]+)[\\/][^\\/]+[\\/]audita\.txt/.exec(head);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

async function experimentDatasets(exp: DirLike, files: Map<string, FileLike>, dirs: DirLike[], name: string, root: DirLike): Promise<BrukerDataset[]> {
  const out: BrukerDataset[] = [];
  const expno = exp.name;
  const raw = files.get('ser') ?? files.get('fid');
  const dimension: 1 | 2 = files.has('ser') || files.has('acqu2s') ? 2 : 1;
  const pdata = dirs.find((d) => d.name === 'pdata');
  const procs: { dir: DirLike; file: FileLike }[] = [];
  if (pdata) {
    for await (const p of pdata.values()) {
      if (p.kind !== 'directory') continue;
      try {
        const real = await p.getFileHandle(dimension === 2 ? '2rr' : '1r');
        procs.push({ dir: p, file: real });
      } catch {
        // 処理していない (1r・2rr が無い) 処理番号は出さない
      }
    }
  }
  procs.sort((a, b) => Number(a.dir.name) - Number(b.dir.name) || a.dir.name.localeCompare(b.dir.name));
  for (const p of procs) {
    const f = await p.file.getFile();
    out.push({ path: { name, expno, procno: p.dir.name }, dimension, exp, proc: p.dir, size: f.size, lastModified: f.lastModified, root });
  }
  if (raw) {
    const f = await raw.getFile();
    // 測定していない (fid が空) ものは出さない
    if (f.size > 0) out.push({ path: { name, expno, procno: null }, dimension, exp, proc: procs.find((p) => p.dir.name === '1')?.dir ?? procs[0]?.dir ?? null, size: f.size, lastModified: f.lastModified, root });
  }
  return out;
}

export function datasetFileName(ds: BrukerDataset) {
  return brukerFileName(ds.path, ds.dimension);
}

export function datasetKey(ds: BrukerDataset) {
  return `bruker|${datasetFileName(ds)}|${ds.size}|${ds.lastModified}`;
}

async function text(dir: DirLike | null, name: string): Promise<string | null> {
  if (!dir) return null;
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).text();
  } catch {
    return null;
  }
}

async function bytes(dir: DirLike | null, name: string): Promise<ArrayBuffer | null> {
  if (!dir) return null;
  try {
    return await (await (await dir.getFileHandle(name)).getFile()).arrayBuffer();
  } catch {
    return null;
  }
}

/** ホーム画面の一覧に出す情報 (acqus だけ読む) */
export async function datasetMeta(ds: BrukerDataset): Promise<ExperimentMeta> {
  const acqusText = await text(ds.exp, 'acqus');
  if (!acqusText) throw new Error(tr('{fileName}: acqus が読めませんでした', { fileName: datasetFileName(ds) }));
  const acqus = parseParams(acqusText);
  const info = brukerInfo(acqus, ds.path);
  const nuclei = [info.nucleus];
  if (ds.dimension === 2) {
    const acqu2s = parseParams((await text(ds.exp, 'acqu2s')) ?? '');
    nuclei.push(normalizeNucleus(str(acqu2s, 'NUC1')) || info.nucleus);
  }
  return {
    key: datasetKey(ds),
    fileName: datasetFileName(ds),
    size: ds.size,
    lastModified: ds.lastModified,
    title: info.title,
    dimension: ds.dimension,
    nuclei,
    decoupled: info.decoupled,
    freqMHz: num(acqus, 'BF1') ?? 0,
    solventRaw: info.solventRaw,
    solvent: info.solvent,
    experiment: info.experiment,
    scans: info.scans,
    temperatureC: info.temperatureC,
    measuredAt: info.acquiredAt ?? ds.lastModified,
    processed: ds.path.procno !== null,
    figure: null,
    vendor: 'bruker',
    procno: ds.path.procno,
  };
}

/** 測定を読む (1D・2D) */
export async function readDataset(ds: BrukerDataset, options?: ReadOptions): Promise<{ one?: LoadedSpectrum; two?: Loaded2dSpectrum }> {
  const processed = ds.path.procno !== null;
  const acqus = await text(ds.exp, 'acqus');
  if (!acqus) throw new Error(tr('{fileName}: acqus が読めませんでした', { fileName: datasetFileName(ds) }));
  const two = ds.dimension === 2;
  const input: BrukerInput = {
    path: ds.path,
    acqus,
    acqu2s: two ? await text(ds.exp, 'acqu2s') : null,
    procs: await text(ds.proc, 'procs'),
    proc2s: two ? await text(ds.proc, 'proc2s') : null,
    real: processed ? await bytes(ds.proc, two ? '2rr' : '1r') : null,
    raw: processed ? null : await bytes(ds.exp, two ? 'ser' : 'fid'),
    intrng: processed && !two ? await text(ds.proc, 'intrng') : null,
    peaklist: processed && !two ? await text(ds.proc, 'peaklist.xml') : null,
  };
  return two ? { two: readBruker2d(input) } : { one: readBruker1d(input, options) };
}

// ---------------------------------------------------------------- TopSpin への書き戻し (仮のファイル)

/** 同期の相手の仮のファイル。Delta の .jdf と同じく getFile で中身を読み、createWritable で書く */
export type TopspinHandle = FileHandle & {
  kind: 'file';
  topspin: true;
  /** TopSpin で処理し直されていたら、読み直すのに使う */
  readSpectrum(): Promise<LoadedSpectrum>;
};

export function isTopspinHandle(h: unknown): h is TopspinHandle {
  return !!h && (h as TopspinHandle).topspin === true;
}

/** TopSpin で処理した 1D の、同期の相手 */
export function topspinHandle(ds: BrukerDataset): TopspinHandle {
  const proc = ds.proc!;
  const name = datasetFileName(ds);
  const files = async () => {
    const get = async (n: string) => {
      try {
        return await (await proc.getFileHandle(n)).getFile();
      } catch {
        return null;
      }
    };
    return { procs: await get('procs'), intrng: await get('intrng'), peaklist: await get('peaklist.xml'), real: await get('1r') };
  };
  const read = async () => {
    const f = await files();
    if (!f.procs || !f.real) throw Object.assign(new Error(tr('{name}: TopSpin のファイル (procs・1r) が見つかりません', { name })), { name: 'NotFoundError' });
    const procsText = await f.procs.text();
    const procs = parseParams(procsText);
    const bundle: TopspinBundle = {
      path: ds.path,
      intrng: f.intrng ? await f.intrng.text() : null,
      peaklist: f.peaklist ? await f.peaklist.text() : null,
      intscl: num(procs, 'INTSCL'),
      nc: num(procs, 'NC_proc') ?? 0,
      spectrum: [f.real.size, f.real.lastModified, num(procs, 'OFFSET'), num(procs, 'SI'), num(procs, 'NC_proc')].join('|'),
    };
    const mtime = Math.max(...[f.procs, f.intrng, f.peaklist, f.real].map((x) => x?.lastModified ?? 0));
    return { bundle, mtime, procsText };
  };
  const writeText = async (n: string, content: string) => {
    const h = await proc.getFileHandle(n, { create: true });
    if (!h.createWritable) throw Object.assign(new Error(tr('このフォルダには書き込めません')), { name: 'NotAllowedError' });
    const w = await h.createWritable();
    await w.write(content);
    await w.close();
  };
  return {
    kind: 'file',
    topspin: true,
    name,
    async getFile() {
      const { bundle, mtime } = await read();
      return new File([encodeBundle(bundle)], name, { lastModified: mtime });
    },
    async createWritable() {
      const parts: (string | Blob)[] = [];
      return {
        async write(data: string | Blob) {
          parts.push(data);
        },
        async close() {
          const next = decodeBundle(await new Blob(parts).arrayBuffer());
          if (!next) throw new Error('TopSpin bundle expected');
          const now = await read();
          // 変わったファイルだけ書く。元から無く、書くものも無いファイルは作らない
          if (next.intrng !== now.bundle.intrng) {
            if (next.intrng === null) await proc.removeEntry?.('intrng').catch(() => undefined);
            else await writeText('intrng', next.intrng);
          }
          if (next.peaklist !== now.bundle.peaklist) {
            if (next.peaklist === null) await proc.removeEntry?.('peaklist.xml').catch(() => undefined);
            else await writeText('peaklist.xml', next.peaklist);
          }
          if (next.intscl !== null && next.intscl !== now.bundle.intscl) await writeText('procs', withIntscl(now.procsText, next.intscl));
        },
      };
    },
    queryPermission: (o) => ds.root.queryPermission?.(o) ?? Promise.resolve('granted'),
    requestPermission: (o) => ds.root.requestPermission?.(o) ?? Promise.resolve('granted'),
    async readSpectrum() {
      const { one } = await readDataset(ds);
      if (!one) throw new Error(tr('{name}: 1D のスペクトルではありません', { name }));
      return one;
    },
  };
}

// ---------------------------------------------------------------- ドロップしたフォルダ

type Entry = { isFile: boolean; isDirectory: boolean; name: string };
type FsFileEntry = Entry & { file(ok: (f: File) => void, ng: (e: unknown) => void): void };
type FsDirEntry = Entry & { createReader(): { readEntries(ok: (list: Entry[]) => void, ng: (e: unknown) => void): void } };

/**
 * ドロップしたフォルダ (FileSystemEntry。getAsFileSystemHandle の無いブラウザ) を、読むだけのフォルダにする。
 * TopSpin への書き戻しはできない (許可を聞くと拒否になる)
 */
export function entryDir(entry: FsDirEntry): DirLike {
  const list = async (): Promise<Entry[]> => {
    const reader = entry.createReader();
    const all: Entry[] = [];
    // readEntries は 100 件ずつ返す。空になるまで読む
    for (;;) {
      const chunk = await new Promise<Entry[]>((ok, ng) => reader.readEntries(ok, ng));
      if (!chunk.length) return all;
      all.push(...chunk);
    }
  };
  const fileOf = (e: FsFileEntry): FileLike => ({ kind: 'file', name: e.name, getFile: () => new Promise<File>((ok, ng) => e.file(ok, ng)) });
  const find = async (name: string) => {
    const e = (await list()).find((x) => x.name === name);
    if (!e) throw Object.assign(new Error(name), { name: 'NotFoundError' });
    return e;
  };
  return {
    kind: 'directory',
    name: entry.name,
    async *values() {
      for (const e of await list()) yield e.isDirectory ? entryDir(e as FsDirEntry) : fileOf(e as FsFileEntry);
    },
    async getDirectoryHandle(name) {
      const e = await find(name);
      if (!e.isDirectory) throw Object.assign(new Error(name), { name: 'TypeMismatchError' });
      return entryDir(e as FsDirEntry);
    },
    async getFileHandle(name) {
      const e = await find(name);
      if (!e.isFile) throw Object.assign(new Error(name), { name: 'TypeMismatchError' });
      return fileOf(e as FsFileEntry);
    },
    queryPermission: async (o) => (o.mode === 'read' ? 'granted' : 'denied'),
    requestPermission: async (o) => (o.mode === 'read' ? 'granted' : 'denied'),
  };
}

/** フォルダを選ぶ画面 (webkitdirectory) で選んだファイルの一覧を、読むだけのフォルダにする */
export function filesDir(files: File[]): DirLike | null {
  type Node = { dirs: Map<string, Node>; files: Map<string, File>; name: string };
  const top: Node = { dirs: new Map(), files: new Map(), name: '' };
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).split('/');
    let node = top;
    for (const p of parts.slice(0, -1)) {
      if (!node.dirs.has(p)) node.dirs.set(p, { dirs: new Map(), files: new Map(), name: p });
      node = node.dirs.get(p)!;
    }
    node.files.set(parts[parts.length - 1], f);
  }
  const rootNode = top.dirs.size === 1 && !top.files.size ? [...top.dirs.values()][0] : top;
  const wrap = (node: Node): DirLike => ({
    kind: 'directory',
    name: node.name,
    async *values() {
      for (const d of node.dirs.values()) yield wrap(d);
      for (const [name, f] of node.files) yield { kind: 'file', name, getFile: async () => f };
    },
    async getDirectoryHandle(name) {
      const d = node.dirs.get(name);
      if (!d) throw Object.assign(new Error(name), { name: 'NotFoundError' });
      return wrap(d);
    },
    async getFileHandle(name) {
      const f = node.files.get(name);
      if (!f) throw Object.assign(new Error(name), { name: 'NotFoundError' });
      return { kind: 'file', name, getFile: async () => f };
    },
    queryPermission: async (o) => (o.mode === 'read' ? 'granted' : 'denied'),
    requestPermission: async (o) => (o.mode === 'read' ? 'granted' : 'denied'),
  });
  return files.length ? wrap(rootNode) : null;
}

import { describe, expect, it } from 'vitest';
import { decodeBundle, encodeBundle } from '../lib/topspin';
import { datasetFileName, datasetMeta, findDatasets, topspinHandle, type DirLike, type FileLike } from './bruker';

/** メモリの上のフォルダ (書き込みもできる)。値は文字か ArrayBuffer */
type Tree = { [name: string]: Tree | string | ArrayBuffer };

function memDir(name: string, tree: Tree, clock = { t: 1_700_000_000_000 }): DirLike & { tree: Tree } {
  const fileOf = (n: string): FileLike => ({
    kind: 'file',
    name: n,
    getFile: async () => {
      const v = tree[n] as string | ArrayBuffer;
      return new File([v], n, { lastModified: (tree as Record<string, unknown>)[`__mtime:${n}`] as number ?? clock.t });
    },
    createWritable: async () => {
      const parts: (string | Blob)[] = [];
      return {
        write: async (d: string | Blob) => void parts.push(d),
        close: async () => {
          tree[n] = await new Blob(parts).text();
          (tree as Record<string, unknown>)[`__mtime:${n}`] = ++clock.t;
        },
      };
    },
  });
  return {
    kind: 'directory',
    name,
    tree,
    async *values() {
      for (const [n, v] of Object.entries(tree)) {
        if (n.startsWith('__mtime:')) continue;
        yield typeof v === 'string' || v instanceof ArrayBuffer ? fileOf(n) : memDir(n, v, clock);
      }
    },
    async getDirectoryHandle(n) {
      const v = tree[n];
      if (!v || typeof v === 'string' || v instanceof ArrayBuffer) throw Object.assign(new Error(n), { name: 'NotFoundError' });
      return memDir(n, v, clock);
    },
    async getFileHandle(n, o) {
      if (!(n in tree)) {
        if (!o?.create) throw Object.assign(new Error(n), { name: 'NotFoundError' });
        tree[n] = '';
      }
      if (typeof tree[n] !== 'string' && !(tree[n] instanceof ArrayBuffer)) throw Object.assign(new Error(n), { name: 'TypeMismatchError' });
      return fileOf(n);
    },
    async removeEntry(n) {
      delete tree[n];
    },
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  };
}

function jcamp(p: Record<string, string | number>) {
  return Object.entries(p).map(([k, v]) => `##$${k}= ${v}`).join('\n') + '\n##END=\n';
}

const acqus = jcamp({ NUC1: '<1H>', NUC2: '<off>', SOLVENT: '<CDCl3>', PULPROG: '<zg30>', BF1: 400.13, SFO1: 400.1324, SW_h: 8012.8, TD: 64, DATE: 1744266617 });
const procs = jcamp({ SI: 32, OFFSET: 12, SW_p: 4001, SF: 400.13, NC_proc: 0, BYTORDP: 0, DTYPP: 0, INTSCL: 1, LB: 0.3 });
const r1 = new Int32Array(Array.from({ length: 32 }, (_, i) => (i === 10 ? 1000 : 1))).buffer;

function lab(): Tree {
  return {
    'notes.txt': 'x',
    '1-crude': {
      '10': { acqus, fid: new Int32Array(64).buffer, pdata: { '1': { procs, '1r': r1, title: '1-crude' } } },
      // 測定していない (fid が無い) 実験は出さない
      '11': { acqus, pdata: { '1': { procs } } },
    },
    hsqc: {
      '3': {
        acqus: acqus.replace('zg30', 'hsqcetgpsi2'),
        acqu2s: jcamp({ NUC1: '<13C>', FnMODE: 6 }),
        ser: new Int32Array(64).buffer,
        pdata: { '1': { procs, proc2s: procs, '2rr': r1 }, '2': { procs } },
      },
    },
  };
}

describe('フォルダの中の TopSpin の測定', () => {
  it('データ名/実験番号/ を探す。処理した版 (処理番号ごと) と生データ。2D は ser', async () => {
    const found = await findDatasets(memDir('NMR', lab()));
    expect(found.map((d) => [datasetFileName(d), d.dimension, d.path.procno]).sort()).toEqual([
      ['1-crude/10', 1, '1'],
      ['1-crude/10/fid', 1, null],
      ['hsqc/3', 2, '1'],
      ['hsqc/3/ser', 2, null],
    ]);
    const meta = await datasetMeta(found.find((d) => d.path.procno === '1' && d.dimension === 1)!);
    expect(meta).toMatchObject({ fileName: '1-crude/10', title: '1-crude', dimension: 1, nuclei: ['1H'], processed: true, vendor: 'bruker', solvent: 'CDCl3' });
    expect(meta.measuredAt).toBe(1744266617000);
    const two = await datasetMeta(found.find((d) => d.dimension === 2 && d.path.procno === null)!);
    expect(two).toMatchObject({ nuclei: ['1H', '13C'], processed: false, dimension: 2 });
  });

  it('実験番号のフォルダだけを選んだときは、audita.txt の場所からデータ名を取る', async () => {
    const tree = lab()['1-crude'] as Tree;
    const exp = tree['10'] as Tree;
    exp['audita.txt'] = '##TITLE= Audit trail, TopSpin 3.6.5\n$$ D:/NMRData/yamamasu/1-crude/10/audita.txt\n';
    const found = await findDatasets(memDir('10', exp));
    expect(found.map(datasetFileName).sort()).toEqual(['1-crude/10', '1-crude/10/fid']);
  });
});

describe('TopSpin への書き戻し (仮のファイル)', () => {
  it('読む: 積分・ピーク値・INTSCL。書く: intrng・peaklist.xml と procs の INTSCL の行だけ', async () => {
    const root = memDir('NMR', lab());
    const ds = (await findDatasets(root)).find((d) => d.dimension === 1 && d.path.procno === '1')!;
    const handle = topspinHandle(ds);
    const file = await handle.getFile();
    const now = decodeBundle(await file.arrayBuffer())!;
    expect(now).toMatchObject({ intrng: null, peaklist: null, intscl: 1, nc: 0, path: { name: '1-crude', expno: '10', procno: '1' } });

    const w = await handle.createWritable();
    await w.write(new Blob([encodeBundle({ ...now, intrng: 'A 1.0 #regions in PPM\n  9  8  0  0  # for region 1\n', intscl: 0.25, peaklist: '<PeakList/>' })]));
    await w.close();
    const proc = ((root.tree['1-crude'] as Tree)['10'] as Tree).pdata as Tree;
    const p1 = proc['1'] as Tree;
    expect(p1.intrng).toBe('A 1.0 #regions in PPM\n  9  8  0  0  # for region 1\n');
    expect(p1['peaklist.xml']).toBe('<PeakList/>');
    expect(p1.procs).toBe(procs.replace('##$INTSCL= 1', '##$INTSCL= 0.25'));
    // 書いたあとは更新時刻が新しくなる (同期が「このアプリで書いた」と分かる)
    expect((await handle.getFile()).lastModified).toBeGreaterThan(file.lastModified);

    // 元に戻す (初めて書く前の中身): 無かったファイルは消す
    const w2 = await handle.createWritable();
    await w2.write(new Blob([encodeBundle(now)]));
    await w2.close();
    expect('intrng' in p1).toBe(false);
    expect('peaklist.xml' in p1).toBe(false);
    expect(p1.procs).toBe(procs);
  });

  it('1r を読み直せる (TopSpin で処理し直したとき)', async () => {
    const ds = (await findDatasets(memDir('NMR', lab()))).find((d) => d.dimension === 1 && d.path.procno === '1')!;
    const loaded = await topspinHandle(ds).readSpectrum();
    expect(loaded.meta.n).toBe(32);
    expect(loaded.data[10]).toBe(1000);
  });
});

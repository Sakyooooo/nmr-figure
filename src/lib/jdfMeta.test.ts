import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJdf } from './jdf';
import { readJdfMeta } from './jdfMeta';

// 手元に samples/*.jdf があるときだけ、全体を読んだ結果とヘッダーだけ読んだ結果を比べる
const dir = join(import.meta.dirname, '../../samples');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith('sample-') && f.endsWith('.jdf')) : [];

describe.skipIf(!files.length)('ヘッダーだけの読み込み', () => {
  it.each(files)('%s', async (name) => {
    const buf = readFileSync(join(dir, name));
    const file = new File([buf], name, { lastModified: 1_700_000_000_000 });
    const meta = await readJdfMeta(file);
    const full = readJdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), name).meta;
    expect(meta.title).toBe(full.title);
    expect(meta.nuclei[0]).toBe(full.nucleus);
    expect(meta.freqMHz).toBeCloseTo(full.freqMHz, 6);
    expect(meta.solvent).toBe(full.solvent);
    expect(meta.decoupled).toBe(full.decoupled);
    expect(meta.scans).toBe(full.scans);
    expect(meta.dimension).toBe(1);
    expect(meta.processed).toBe(true);
    // 測定は 2026-04-17 15:4x (日本時間)
    expect(new Date(meta.measuredAt).toISOString().slice(0, 16)).toMatch(/^2026-04-17T06:4/);
  });
});

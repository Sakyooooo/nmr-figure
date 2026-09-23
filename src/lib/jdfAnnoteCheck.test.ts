import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkAnnotationLinks } from './jdfAnnoteCheck';

const dir = join(import.meta.dirname, '../../samples');
const files = existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.jdf')) : [];
const buf = (name: string) => {
  const b = readFileSync(join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe.skipIf(!files.length)('注釈のつながりの確かめ', () => {
  it('Delta が書いたファイルはすべて通る', () => {
    for (const name of files) expect(checkAnnotationLinks(buf(name)), name).toEqual([]);
  });

  it('レコードが自分自身を指すと見つける (以前の書き戻しの誤り)', () => {
    const name = files.find((n) => n.includes('integraltest'));
    if (!name) return;
    const b = buf(name);
    const v = new DataView(b);
    const start = Number(v.getBigUint64(1308, false));
    // 先頭のレコードの「次」を自分にする
    const head = v.getUint16(start + 52, true);
    v.setUint16(start + 352 + (head - 1) * 336 + 64, head, true);
    expect(checkAnnotationLinks(b).join()).toContain('輪');
  });
});

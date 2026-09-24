import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { EN } from './en/index';
import { currentLang, setLang, tr } from '.';

const src = join(import.meta.dirname, '..');

/** ソースの tr('…') / trk('…') / trx('…') の鍵 (文字列をそのまま書いたもの) */
function sourceKeys() {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== 'i18n') walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p);
    }
  };
  walk(src);
  const keys = new Map<string, string>();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(/\b(?:tr|trk|trx)\(\s*'((?:\\.|[^'\\])*)'/g)) {
      const key = m[1].replace(/\\n/g, '\n').replace(/\\(.)/g, '$1');
      if (!keys.has(key)) keys.set(key, relative(src, f));
    }
  }
  return keys;
}

/** 差し込む名前 ({n|単数|複数} の n も含む) */
const names = (s: string) => new Set([...s.matchAll(/\{(\w+)(?:\|[^}]*)?\}/g)].map((m) => m[1]));

describe('英語の辞書', () => {
  const keys = sourceKeys();

  it('画面の日本語の文には、すべて英語がある', () => {
    const missing = [...keys].filter(([k]) => EN[k] === undefined).map(([k, f]) => `${f}: ${k}`);
    expect(missing).toEqual([]);
  });

  it('英語の文の差し込む名前が、日本語の文と同じ', () => {
    const wrong = Object.entries(EN)
      .filter(([ja, en]) => {
        const a = names(ja);
        const b = names(en);
        return a.size !== b.size || [...a].some((n) => !b.has(n));
      })
      .map(([ja, en]) => `${ja} → ${en}`);
    expect(wrong).toEqual([]);
  });

  it('使われていない英語が残っていない (画面の文を変えたら辞書も直す)', () => {
    const unused = Object.keys(EN).filter((k) => !keys.has(k));
    expect(unused).toEqual([]);
  });
});

describe('tr', () => {
  afterEach(() => setLang('ja'));

  it('日本語のときは鍵のまま、英語のときは辞書の文。値を差し込み、英語の複数形も選ぶ', () => {
    expect(currentLang()).toBe('ja');
    expect(tr('{n} 測定', { n: 1 })).toBe('1 測定');
    setLang('en');
    expect(tr('{n} 測定', { n: 1 })).toBe('1 measurement');
    expect(tr('{n} 測定', { n: 3 })).toBe('3 measurements');
    expect(tr('辞書にない文')).toBe('辞書にない文');
  });
});

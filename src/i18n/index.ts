/**
 * 画面の言語 (日本語 / 英語)。
 *
 * 書き方: 日本語の文をそのまま鍵にして tr('ファイルを開く') と書く。英語のときは src/i18n/en/ の辞書を引き、
 * 無ければ日本語のまま出す (コードは日本語のまま読める)。差し込む値は tr('{name} を開きました', { name }) のように {名前} で。
 * 鍵は文字列をそのまま書く。i18n.test.ts がソースの tr('…') / trk('…') / trx('…') を全部拾い、辞書に英語があるか確かめる。
 *
 * 読み込んだときに一度だけ作る表 (道具の一覧など) の文字は trk('…') で印だけ付け (日本語のまま)、画面に出す所で tr(変数) と訳す。
 * (読み込んだ時点ではまだ言語が決まっていないため)
 *
 * 言語は設定 (settings.ui.lang) で決める。auto はブラウザの一番目の言語が日本語なら日本語、それ以外は英語。
 * テスト (Node) では setLang を呼ばないので日本語のまま。
 */
import { create } from 'zustand';
import type { LangSetting } from '../lib/settings';
import { EN } from './en/index';

export type Lang = 'ja' | 'en';

let current: Lang = 'ja';

/** 画面を描き直すため (App が購読し、変わったら画面ごと描き直す) */
export const useLang = create<{ lang: Lang }>(() => ({ lang: current }));

export function resolveLang(setting: LangSetting): Lang {
  if (setting === 'ja' || setting === 'en') return setting;
  const first = typeof navigator !== 'undefined' ? (navigator.languages?.[0] ?? navigator.language ?? '') : '';
  return !first || first.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function setLang(lang: Lang) {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  useLang.setState({ lang });
}

export function currentLang(): Lang {
  return current;
}

const missing = new Set<string>();

/** 翻訳する。英語が無い文は日本語のまま */
export function tr(ja: string, vars?: Record<string, string | number>): string {
  let s = ja;
  if (current === 'en') {
    const en = EN[ja];
    if (en !== undefined) s = en;
    else if (import.meta.env?.DEV && !missing.has(ja)) {
      missing.add(ja);
      console.warn(`[i18n] 英語がありません: ${ja}`);
    }
  }
  return vars ? fill(s, vars) : s;
}

/** 読み込んだときに作る表の文字の印 (日本語のまま返す。画面に出す所で tr する) */
export function trk(ja: string): string {
  return ja;
}

/**
 * {名前} に値を入れる。英語の複数形は {n|measurement|measurements} のように書く (n が 1 なら左、それ以外は右)
 */
function fill(s: string, vars: Record<string, string | number>) {
  return s
    .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (m, k: string, one: string, many: string) => (k in vars ? (Number(vars[k]) === 1 ? one : many) : m))
    .replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 日付と時刻の書き方の地域 */
export function locale(): string {
  return current === 'en' ? 'en-US' : 'ja-JP';
}

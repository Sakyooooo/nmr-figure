import type { ThemeSetting } from './settings';

/**
 * 画面の色 (設定の「画面の色」)。system は Windows などの「アプリの色」に合わせる。
 * html に data-theme="light" | "dark" を付け、色は tokens.css のダークモードの変数で変わる。
 * 図 (Word / PowerPoint に貼るもの) と印刷はいつも白い紙のまま
 */
export type Theme = 'light' | 'dark';

const darkQuery = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
let setting: ThemeSetting = 'system';

export function resolveTheme(s: ThemeSetting): Theme {
  if (s === 'light' || s === 'dark') return s;
  return darkQuery?.matches ? 'dark' : 'light';
}

export function currentTheme(): Theme {
  return typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(s: ThemeSetting) {
  setting = s;
  if (typeof document === 'undefined') return;
  const theme = resolveTheme(s);
  document.documentElement.dataset.theme = theme;
  // アプリとして入れたときの題の帯の色 (パネルの色に合わせる)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1A1E23' : '#FFFFFF');
}

// OS の色が変わったら、system のときだけ付け直す
darkQuery?.addEventListener('change', () => {
  if (setting === 'system') applyTheme(setting);
});

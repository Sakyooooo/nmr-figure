// デザイントークン (Figma の変数と同じ値) を CSS 変数にする: npm run tokens
// 元は design/figma-plugin/code.js の定義。Figma の変数名の "/" を "-" にしたものが CSS 変数名。
// src/styles/tokens.css は生成物なので手で直さない (tokens.test.ts が食い違いを見つける)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const TOKENS_CSS = join(here, '..', 'src', 'styles', 'tokens.css');
export const ICONS_TS = join(here, '..', 'src', 'components', 'iconPaths.ts');

export function readDefinitions() {
  const src = readFileSync(join(here, 'figma-plugin', 'code.js'), 'utf8');
  const from = src.indexOf('function hex(');
  const to = src.indexOf('// ------------------------------------------------------------------ 作ったもの');
  if (from < 0 || to < 0) throw new Error('code.js の定義の場所が見つかりません');
  return new Function(`${src.slice(from, to)}\nreturn { PRIMITIVES, SEMANTIC, DATA, SPACING, RADIUS, SIZE, MOTION, TYPE, EFFECTS, FONT_UI };`)();
}

export function readIcons() {
  const src = readFileSync(join(here, 'figma-plugin', 'code.js'), 'utf8');
  const from = src.indexOf('const ICONS = {');
  const to = src.indexOf('\n};', from);
  if (from < 0 || to < 0) throw new Error('code.js の ICONS が見つかりません');
  return new Function(`${src.slice(from, to + 3)}\nreturn ICONS;`)();
}

const ICON_LICENSE_TEXT = [
  'Lucide (https://lucide.dev) — ISC License',
  'Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.',
  'Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.',
  'THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.',
].join('\n');

/** アイコンの形 (Figma の部品と同じ SVG の中身) */
export function buildIconsTs() {
  const icons = readIcons();
  const out = [];
  out.push('// 自動生成: npm run tokens (元: design/figma-plugin/code.js の ICONS)。手で直さない');
  out.push('/*!');
  out.push(' * @license ISC — アイコンの形は Lucide (https://lucide.dev) から。nmr- で始まるものはこのアプリで同じ規則で描いたもの。');
  out.push(' * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).');
  out.push(' * All other copyright (c) for Lucide are held by Lucide Contributors 2022.');
  out.push(' * Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted,');
  out.push(' * provided that the above copyright notice and this permission notice appear in all copies.');
  out.push(' * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED');
  out.push(' * WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR');
  out.push(' * CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT,');
  out.push(' * NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.');
  out.push(' */');
  out.push('export const ICON_PATHS = {');
  for (const [name, inner] of Object.entries(icons)) out.push(`  ${JSON.stringify(name)}: ${JSON.stringify(inner)},`);
  out.push('} as const;');
  out.push('');
  out.push('export type IconName = keyof typeof ICON_PATHS;');
  out.push('');
  out.push('/** アイコンの出どころとライセンス (設定の「使っているもの」に出す。コメントは書き出しで消えるため文字列でも持つ) */');
  out.push(`export const ICON_LICENSE = ${JSON.stringify(ICON_LICENSE_TEXT)};`);
  return out.join('\n') + '\n';
}

const cssName = (name) => '--' + name.toLowerCase().replace(/[/ ]+/g, '-');

function shadowCss(layers) {
  return layers
    .map(([x, y, blur, spread, color, a]) => {
      const n = parseInt(color.slice(1), 16);
      const rgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
      return `${x}px ${y}px ${blur}px ${spread}px ${a === 1 ? color : `rgba(${rgb}, ${a})`}`;
    })
    .join(', ');
}

export function buildTokensCss() {
  const d = readDefinitions();
  const out = [];
  const line = (name, value, note) => out.push(`  ${name}: ${value};${note ? ` /* ${note} */` : ''}`);
  out.push('/* 自動生成: npm run tokens (元: design/figma-plugin/code.js)。手で直さない */');
  out.push(':root {');
  out.push(`  --font-ui: ${d.FONT_UI};`);
  out.push('');
  out.push('  /* Color: 画面 (UI) の色 */');
  for (const [name, prim, , desc] of d.SEMANTIC) line(cssName(name), d.PRIMITIVES[prim], [prim, desc].filter(Boolean).join(' · '));
  out.push('');
  out.push('  /* Data: 図の中身の色 (UI に使わない) */');
  for (const [name, value, desc] of d.DATA) line(cssName(name), value, desc);
  out.push('');
  out.push('  /* Spacing */');
  for (const s of d.SPACING) line(`--spacing-${s}`, `${s}px`);
  out.push('');
  out.push('  /* Radius */');
  for (const [name, v, desc] of d.RADIUS) line(cssName(name), `${v}px`, desc);
  out.push('');
  out.push('  /* Size */');
  for (const [name, v, desc] of d.SIZE) line(cssName(name), `${v}px`, desc);
  out.push('');
  out.push('  /* Motion (動きを減らす設定では 0) */');
  for (const [name, v, desc] of d.MOTION) line(cssName(name), `${v}ms`, desc);
  out.push('');
  out.push('  /* Type: font の一括指定 (太さ 大きさ/行の高さ 字体) */');
  for (const [name, weight, size, lh] of d.TYPE) line(cssName(name), `${weight === 'bold' ? 700 : 400} ${size}px/${lh}px var(--font-ui)`);
  out.push('');
  out.push('  /* Elevation (重なるものだけ) */');
  for (const [name, layers, desc] of d.EFFECTS) line(cssName(name), shadowCss(layers), desc.replace(/\s*\(--[^)]*\)/, ''));
  out.push('}');
  out.push('');
  out.push('@media (prefers-reduced-motion: reduce) {');
  out.push('  :root {');
  for (const [name] of d.MOTION) out.push(`    ${cssName(name)}: 0ms;`);
  out.push('  }');
  out.push('}');
  return out.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(TOKENS_CSS, buildTokensCss());
  writeFileSync(ICONS_TS, buildIconsTs());
  console.log('wrote', TOKENS_CSS, ICONS_TS);
}

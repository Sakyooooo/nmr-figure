// design/app-icon.svg から、アプリとして入れるときのアイコン (public/icon-192.png, icon-512.png) を作る。
// Edge を画面なしで動かして描かせる (追加のパッケージは使わない)。使い方: node scripts/make-icons.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = join(import.meta.dirname, '..');
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
if (!edge) throw new Error('Edge が見つかりません');
const svg = readFileSync(join(root, 'design/app-icon.svg'), 'utf8');
const work = mkdtempSync(join(tmpdir(), 'nmr-icon-'));
mkdirSync(join(root, 'public'), { recursive: true });

for (const size of [192, 512]) {
  const html = join(work, `icon-${size}.html`);
  writeFileSync(html, `<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  const out = join(root, `public/icon-${size}.png`);
  execFileSync(edge, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--user-data-dir=${join(work, 'profile')}`,
    `--window-size=${size},${size}`,
    `--screenshot=${out}`,
    pathToFileURL(html).href,
  ]);
  unlinkSync(html);
  console.log(out);
}

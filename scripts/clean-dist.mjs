// ビルド前に dist/ を消す。
// Node 24 の fs.rmSync({ recursive: true }) は、パスに日本語を含むと Windows で
// ネイティブエラー (0xC0000409) で落ちる。Vite の emptyOutDir も同じ関数を使うので、
// Vite には任せず、ここで1ファイルずつ消す。
import { existsSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function removeTree(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) removeTree(p);
    else unlinkSync(p);
  }
  rmdirSync(dir);
}

const dist = fileURLToPath(new URL('../dist', import.meta.url));
if (existsSync(dist)) removeTree(dist);

/// <reference types="vitest/config" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** 開発時のみ: 画面から POST した画像などを .dev-output/ に保存する (動作確認用) */
function devOutput(): Plugin {
  return {
    name: 'dev-output',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save', (req, res) => {
        const url = new URL(req.url ?? '', 'http://localhost');
        const name = basename(url.searchParams.get('name') ?? 'output.bin');
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          const dir = join(server.config.root, '.dev-output');
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, name), Buffer.concat(chunks));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  // 相対パスで出力し、どこに置いても(GitHub Pages のサブパスでも)動くようにする
  base: './',
  // 構造式エディタ (Ketcher) は Node 向けの書き方をしているので、ブラウザ用に用意する
  define: {
    'process.env': '{}',
    global: 'globalThis',
  },
  resolve: {
    // events は Node の組み込み扱いで外されてしまうので、npm の実装に向ける
    alias: { events: 'events/events.js' },
  },
  plugins: [react(), devOutput()],
  build: {
    // dist/ は scripts/clean-dist.mjs で消す (Node 24 の fs.rmSync が日本語を含むパスで落ちるため)
    emptyOutDir: false,
  },
  test: {
    environment: 'node',
  },
});

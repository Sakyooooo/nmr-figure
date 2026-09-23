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

/**
 * 本番の画面に CSP (Content-Security-Policy) を入れる。「データを外に送らない」を、コードの約束ではなく
 * ブラウザの決まりにする: 通信 (connect-src) は自分のサイトからの読み込みだけ、フォームの送信もさせない。
 * 開発サーバーは HMR のためにインラインのスクリプトと WebSocket を使うので、build のときだけ入れる。
 *   wasm-unsafe-eval: 構造式エディタ (Ketcher) の Indigo (WebAssembly) を動かすため
 *   blob: / data:     貼った画像・書き出す画像・Ketcher の Web Worker のため
 *   style 'unsafe-inline': Ketcher (MUI) が <style> を差し込むため。スタイルからデータは送れない
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' }],
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
    alias: [
      // events は Node の組み込み扱いで外されてしまうので、npm の実装に向ける
      { find: 'events', replacement: 'events/events.js' },
      // Ketcher が使う paper.js の full 版は、読み込んだ時点で文字列からコードを作る (中の acorn)。
      // CSP で止まって画面ごと落ちるので、その部分を含まない core 版にする (描画の機能は同じ)
      { find: /^paper$/, replacement: 'paper/dist/paper-core.js' },
    ],
  },
  plugins: [react(), devOutput(), contentSecurityPolicy()],
  build: {
    // dist/ は scripts/clean-dist.mjs で消す (Node 24 の fs.rmSync が日本語を含むパスで落ちるため)
    emptyOutDir: false,
  },
  test: {
    environment: 'node',
  },
});

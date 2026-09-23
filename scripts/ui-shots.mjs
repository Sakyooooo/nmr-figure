// 開発用: 開発サーバーの画面を決まった大きさで撮る (npm run dev -- --port 5180 を起こしておく)
//   node scripts/ui-shots.mjs [出力先]            既定の一揃いを撮る
// Edge (無ければ Chrome) を使い捨てのプロフィールで、画面を出さずに動かす。普段のブラウザ・本人のデータには触らない。
// ?demo=… で決まった状態を開き (main.tsx の openDemo)、__demoReady を待ってから撮る。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://localhost:5180';
const OUT = resolve(process.argv[2] ?? '.dev-output/shots');
const PORT = 9333;

/** [名前, ?demo, 幅, 高さ, 撮る前にページで動かす式 (任意)] */
const SHOTS = [
  ['editor-1440', 'spectra', 1440, 900],
  ['editor-1280', 'spectra', 1280, 800],
  ['editor-1024', 'spectra', 1024, 768],
  ['editor-800', 'spectra', 800, 900],
  ['empty-1440', 'empty', 1440, 900],
  ['palette-1440', 'palette', 1440, 900],
  ['integral-1440', 'integral', 1440, 900],
  ['selected-1440', 'selected', 1440, 900],
  ['export-menu-1440', 'spectra', 1440, 900, `document.querySelector('.topbar [aria-label="書き出し"]').click()`],
  ['figure-tab-1440', 'spectra', 1440, 900, `document.querySelector('#inspector-tab-figure').click()`],
  ['home-1440', 'home', 1440, 900],
];

const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = browsers.find((p) => existsSync(p));
if (!exe) throw new Error('Edge / Chrome が見つかりません');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(join(tmpdir(), 'nmr-ui-shots-'));
  const proc = spawn(exe, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], {
    stdio: 'ignore',
  });
  try {
    let version;
    for (let i = 0; i < 50 && !version; i++) {
      await sleep(200);
      version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
    }
    if (!version) throw new Error('ブラウザにつながりません');
    const cdp = await connect(version.webSocketDebuggerUrl);
    for (const [name, demo, w, h, before] of SHOTS) {
      // 1 枚ごとに新しい保存領域 (前の図が戻らないように)
      const { browserContextId } = await cdp.send('Target.createBrowserContext');
      const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
      const s = (method, params) => cdp.send(method, params, sessionId);
      await s('Page.enable');
      await s('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
      await s('Page.navigate', { url: `${BASE}/?demo=${demo}` });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) {
        await sleep(200);
        ready = (await s('Runtime.evaluate', { expression: 'window.__demoReady === true', returnByValue: true })).result.value;
      }
      if (!ready) console.warn(`${name}: 準備ができないまま撮ります`);
      await sleep(600);
      if (before) {
        const r = await s('Runtime.evaluate', { expression: before, returnByValue: true });
        if (r.exceptionDetails) console.warn(`${name}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
        await sleep(400);
      }
      const { data } = await s('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(OUT, `${name}.png`), Buffer.from(data, 'base64'));
      console.log(`${name} (${w}×${h})`);
      await cdp.send('Target.closeTarget', { targetId });
      await cdp.send('Target.disposeBrowserContext', { browserContextId });
    }
    cdp.close();
  } finally {
    proc.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  }
}

/** DevTools の接続 (Node の組み込みの WebSocket) */
function connect(url) {
  return new Promise((resolveConn, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.id && waiting.has(msg.id)) {
        const { ok, ng } = waiting.get(msg.id);
        waiting.delete(msg.id);
        if (msg.error) ng(new Error(msg.error.message));
        else ok(msg.result);
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolveConn({
        send(method, params = {}, sessionId) {
          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params, ...(sessionId ? { sessionId } : {}) }));
          return new Promise((ok, ng) => waiting.set(msgId, { ok, ng }));
        },
        close: () => ws.close(),
      });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

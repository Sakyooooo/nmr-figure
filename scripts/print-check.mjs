// 開発用: 印刷の見た目を PDF で確かめる (npm run dev -- --port 5180 を起こしておく)
//   node scripts/print-check.mjs [出力先] [demo]   既定は .dev-output/print-spectra.pdf
// Edge を使い捨てのプロフィールで画面なしで動かし、?demo=… の図で「印刷」を押したときの中身を PDF にする
// (window.print は止めて、印刷用の中身が出たところで Page.printToPDF。用紙の向きと大きさは CSS の @page に従う)
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const BASE = process.env.UI_BASE ?? 'http://localhost:5180';
const DEMO = process.argv[3] ?? 'spectra';
const OUT = resolve(process.argv[2] ?? `.dev-output/print-${DEMO}.pdf`);
const LANG = process.env.UI_LANG ?? 'ja';
const PORT = 9335;
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
if (!exe) throw new Error('Edge が見つかりません');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'nmr-print-'));
const proc = spawn(exe, [`--remote-debugging-port=${PORT}`, '--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
try {
  let version;
  for (let i = 0; i < 50 && !version; i++) {
    await sleep(200);
    version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json()).catch(() => null);
  }
  const cdp = await connect(version.webSocketDebuggerUrl);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  await s('Page.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await s('Page.navigate', { url: `${BASE}/?demo=${DEMO}&lang=${LANG}` });
  let ready = false;
  for (let i = 0; i < 100 && !ready; i++) {
    await sleep(200);
    ready = (await s('Runtime.evaluate', { expression: 'window.__demoReady === true', returnByValue: true })).result.value;
  }
  await sleep(600);
  // 印刷の画面は出さずに、印刷用の中身だけ出す
  await s('Runtime.evaluate', { expression: 'window.print = () => { window.__printed = true }; window.__nmr.store.setState((st) => ({ printRequest: st.printRequest + 1 }))' });
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    if ((await s('Runtime.evaluate', { expression: 'window.__printed === true', returnByValue: true })).result.value) break;
  }
  if (process.env.PRINT_DEBUG) {
    // 印刷の見た目で、body の直下と、そのうち見えている要素の大きさ・背景を出す
    await s('Emulation.setEmulatedMedia', { media: 'print' });
    const r = await s('Runtime.evaluate', {
      returnByValue: true,
      expression: `[...document.querySelectorAll('body *')].filter((e) => { const b = e.getBoundingClientRect(); const cs = getComputedStyle(e); return b.height > 300 && cs.display !== 'none' && cs.backgroundColor !== 'rgba(0, 0, 0, 0)'; }).map((e) => e.tagName + '.' + e.className + ' ' + JSON.stringify(e.getBoundingClientRect()) + ' ' + getComputedStyle(e).backgroundColor).concat([...document.body.children].map((e) => 'BODY> ' + e.tagName + '#' + e.id + '.' + e.className + ' ' + getComputedStyle(e).display))`,
    });
    console.log(r.result.value.join('\n'));
    const bg = await s('Runtime.evaluate', {
      returnByValue: true,
      expression: `['html', 'body', '.print-view'].map((q) => { const e = document.querySelector(q); const cs = getComputedStyle(e); return q + ' bg=' + cs.backgroundColor + ' h=' + e.getBoundingClientRect().height + ' minH=' + cs.minHeight; }).join('\\n')`,
    });
    console.log(bg.result.value);
    const rules = await s('Runtime.evaluate', {
      returnByValue: true,
      expression: `(() => { const out = []; const walk = (list, href) => { for (const r of list) { if (r.cssRules && !r.selectorText) walk(r.cssRules, href); else if (r.selectorText && /(^|,)\\s*(html|:root)/.test(r.selectorText) && (r.style.background || r.style.backgroundColor)) out.push(href + ' | ' + r.selectorText + ' | ' + (r.style.background || r.style.backgroundColor)); } }; for (const ss of document.styleSheets) { try { walk(ss.cssRules, ss.href || (ss.ownerNode && ss.ownerNode.getAttribute('data-vite-dev-id')) || 'inline'); } catch {} } return out.join('\\n'); })()`,
    });
    console.log(rules.result.value);
    await s('Emulation.setEmulatedMedia', { media: '' });
  }
  const { data } = await s('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, Buffer.from(data, 'base64'));
  console.log(OUT);
  cdp.close();
} finally {
  proc.kill();
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

// 開発用: ChemDraw が描いた画像と、アプリの描画 (src/lib/cdxml.ts) を重ねて見比べるページを作る
//   node scripts/cdxml-compare.mjs <CDXML と PNG のフォルダ>   → .dev-output/cdxml-compare/index.html
// フォルダには、ChemDraw で保存した k1.cdxml と k1.png (600 dpi) のような組を置く (研究データは使わない)
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';

const src = resolve(process.argv[2] ?? '.');
const out = resolve('.dev-output/cdxml-compare');
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { drawCdxml, readCdxml, cdxmlBox } = await server.ssrLoadModule('/src/lib/cdxml.ts');
  const items = [];
  for (const f of readdirSync(src).filter((n) => /\.cdxml$/i.test(n) && !/\.back\./.test(n)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const text = readFileSync(join(src, f), 'utf8');
    const d = drawCdxml(text, 1);
    if (!d) continue;
    const png = f.replace(/\.cdxml$/i, '.png');
    try {
      copyFileSync(join(src, png), join(out, png));
    } catch {
      continue;
    }
    const box = cdxmlBox(readCdxml(text), d.box);
    items.push({ name: f, png, w: box.r - box.l, h: box.b - box.t, inner: d.inner });
  }
  writeFileSync(
    join(out, 'index.html'),
    `<!doctype html><meta charset="utf-8"><title>CDXML compare</title>
<style>body{font:13px sans-serif;margin:16px;background:#fff} .row{display:flex;gap:16px;align-items:flex-start;margin:0 0 24px} canvas,img,svg{border:1px solid #ddd} h3{margin:4px 0}</style>
<p>左: ChemDraw / 中: アプリ / 右: 重ね (黒 = ChemDraw、赤 = アプリ)</p>
<div id="list"></div>
<script>
const items = ${JSON.stringify(items)};
const Z = 6; // 1 pt あたりの画素
for (const it of items) {
  const row = document.createElement('div'); row.className = 'row';
  row.innerHTML = '<div><h3>' + it.name + '</h3><canvas class="ref"></canvas></div><div><h3>app</h3><canvas class="app"></canvas></div><div><h3>overlay</h3><canvas class="ov"></canvas></div>';
  document.getElementById('list').append(row);
  const img = new Image(); img.src = it.png;
  img.onload = async () => {
    // ChemDraw の画像 (600 dpi) は、CDXML の枠のまわりに同じ幅の余白を付けたもの
    const s = 600 / 72;
    const l = (img.width - it.w * s) / 2, t = (img.height - it.h * s) / 2;
    const W = Math.ceil(it.w * Z) + 40, H = Math.ceil(it.h * Z) + 40;
    const draw = (cv, fn) => { cv.width = W; cv.height = H; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); fn(g); };
    const ref = (g, tint) => { g.save(); g.translate(20, 20); g.scale(Z / s, Z / s); g.drawImage(img, -l + (0), -t + (0)); g.restore(); };
    const svgText = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><g transform="translate(20 20) scale(' + Z + ')">' + it.inner + '</g></svg>';
    const svgImg = new Image(); svgImg.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText); await svgImg.decode();
    draw(row.querySelector('.ref'), (g) => ref(g));
    draw(row.querySelector('.app'), (g) => g.drawImage(svgImg, 0, 0));
    draw(row.querySelector('.ov'), (g) => {
      ref(g);
      const c1 = document.createElement('canvas'); c1.width = W; c1.height = H; const g1 = c1.getContext('2d');
      g1.drawImage(svgImg, 0, 0); g1.globalCompositeOperation = 'source-in'; g1.fillStyle = 'rgba(230,0,0,0.55)'; g1.fillRect(0, 0, W, H);
      g.drawImage(c1, 0, 0);
    });
  };
}
</script>`,
  );
  console.log(join(out, 'index.html'), items.length);
} finally {
  await server.close();
}

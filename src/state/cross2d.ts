/**
 * 2D の交点の線 (本人の希望 2026-09-26「HMBC や HMQC は交差点が重要なので、どこで交わっているかが分かるように線を。
 * CNMR データを入れたら自動で線引き」)。
 * クロスピークを拾い、縦軸 (F1) の値の一覧 (¹³C の SI の文・数の並び、同じサンプルの ¹³C のスペクトルから読んだもの) があれば、
 * その値に当たるクロスピークだけに、値に合わせて線を引く
 */
import { tr } from '../i18n';
import { parseSi } from '../lib/siParse';
import { labReference } from '../lib/settings';
import { pickHetero2d, pickSymmetric2d } from '../lib/peaks2d';
import { loadExperiment, useLibrary } from './library';
import { edit, notify, useEditor } from './store';
import { annotationDefaults } from './types';

/** 値の一覧を読む: SI の文 (δ 151.8 (o-CH), 137.8, …) でも、数を並べただけでもよい */
export function parseValues(text: string): number[] {
  const si = parseSi(text);
  const fromSi = si.signals.map((s) => s.delta);
  if (fromSi.length) return fromSi;
  return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

/** F1 の値の許し幅 (¹³C は 2D の縦の細かさが 0.5 ppm ほどなので 1 ppm、¹H は 0.03 ppm) */
const tolFor = (nucleus: string) => (nucleus === '1H' ? 0.03 : 1.0);

/**
 * 表示中の範囲のクロスピークに交点の線を引く (前に自動で引いた線は消す)。
 * values があれば、その値に当たるクロスピークだけ (縦の位置は値に合わせる)
 */
export function autoCrossLines(values: number[]): void {
  const { doc, data2d } = useEditor.getState();
  const plot = doc.plot2d;
  const meta = plot && doc.spectra2d.find((s) => s.id === plot.spectrumId);
  const data = plot && data2d[plot.spectrumId];
  if (!plot || !meta || !data) return;
  const homo = meta.x.nucleus === meta.y.nucleus;
  // 同核 (COSY など) は対角線の外の、対になったピーク。異種核 (HSQC・HMBC) は ¹H–¹³C のピーク
  const picked = homo
    ? pickSymmetric2d(data).flatMap((p) => [
        { h: p.a, c: p.b },
        { h: p.b, c: p.a },
      ])
    : pickHetero2d(data).map((p) => ({ h: p.h, c: p.c }));
  const v = plot.view;
  const inView = picked.filter((p) => p.h <= v.xMax && p.h >= v.xMin && p.c <= v.yMax && p.c >= v.yMin);
  const tol = tolFor(meta.y.nucleus);
  const points: { x: number; y: number }[] = [];
  for (const p of inView) {
    let y = p.c;
    if (values.length) {
      const near = values.reduce((best, x) => (Math.abs(x - p.c) < Math.abs(best - p.c) ? x : best), values[0]);
      if (Math.abs(near - p.c) > tol) continue;
      y = near;
    }
    // 同じ所 (多重線の細かい山) は 1 本
    if (points.some((q) => Math.abs(q.x - p.h) < 0.03 && Math.abs(q.y - y) < tol / 2)) continue;
    points.push({ x: p.h, y });
  }
  const limit = 80;
  edit((d) => {
    d.annotations = d.annotations.filter((a) => !(a.auto && a.space === '2d' && a.layerId === meta.id));
    for (const p of points.slice(0, limit))
      d.annotations.push({
        ...annotationDefaults('cross'),
        id: crypto.randomUUID(),
        layerId: meta.id,
        space: '2d',
        x1: p.x,
        y1: p.y,
        x2: p.x,
        y2: p.y,
        showValues: true,
        auto: true,
      });
  });
  notify(
    points.length
      ? tr('交点の線を {n} 本引きました{more}', { n: Math.min(limit, points.length), more: points.length > limit ? tr(' (多いので {limit} 本まで)', { limit }) : '' })
      : values.length
        ? tr('値に当たるクロスピークがありませんでした (表示範囲と値を確かめてください)')
        : tr('クロスピークが見つかりませんでした'),
    points.length ? 'info' : 'error',
  );
}

/** 自動で引いた交点の線 (all なら手で引いたものも) を消す */
export function clearCrossLines(all: boolean) {
  const { doc } = useEditor.getState();
  const id = doc.plot2d?.spectrumId;
  edit((d) => {
    d.annotations = d.annotations.filter((a) => !(a.space === '2d' && a.layerId === id && a.kind === 'cross' && (all || a.auto)));
  });
}

/**
 * 同じサンプル名の 1D (縦軸の核種) をデータフォルダから読み、ピークの値を並べる (溶媒のピークは除く)。
 * なければ null
 */
export async function valuesFromLibrary(): Promise<{ values: number[]; fileName: string } | null> {
  const { doc, settings } = useEditor.getState();
  const meta = doc.plot2d && doc.spectra2d.find((s) => s.id === doc.plot2d!.spectrumId);
  if (!meta) return null;
  const nucleus = meta.y.nucleus;
  const list = useLibrary
    .getState()
    .experiments.filter((e) => e.dimension === 1 && !e.figure && e.nuclei[0] === nucleus && e.title === meta.title)
    .sort((a, b) => b.measuredAt - a.measuredAt);
  if (!list.length) return null;
  const { meta: m, data } = await loadExperiment(list[0].key);
  const n = data.length;
  const sorted = Float32Array.from(data, Math.abs).sort();
  const noise = sorted[Math.floor(n / 2)] || 1e-9;
  const ref = labReference(settings, m.solvent, nucleus);
  const values: number[] = [];
  const minGap = nucleus === '1H' ? 0.02 : 0.2;
  for (let i = 2; i < n - 2; i++) {
    const v = data[i];
    if (v < noise * 12 || v < data[i - 1] || v < data[i + 1] || v < data[i - 2] || v < data[i + 2]) continue;
    const ppm = m.first + ((m.last - m.first) * i) / (n - 1) + m.refOffset;
    if (ref !== null && Math.abs(ppm - ref) < (nucleus === '1H' ? 0.05 : 1.5)) continue;
    if (values.length && Math.abs(values[values.length - 1] - ppm) < minGap) continue;
    values.push(+ppm.toFixed(nucleus === '1H' ? 2 : 1));
  }
  return { values, fileName: list[0].fileName };
}

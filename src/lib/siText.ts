import { RESIDUAL_13C, RESIDUAL_1H } from '../data/fulmer2010';
import type { NmrDocument, SiOptions, SpectrumMeta } from '../state/types';
import { integralValues } from './integrals';
import { analyzeMultiplet } from './multiplet';
import { nucleusRich } from './nuclei';
import { parseRich } from './richText';
import { labReference, type Settings } from './settings';
import { solventInfo, tableResidual } from './solvents';
import { findPeaks, noiseLevel } from './spectrum';

export interface SiSignal {
  integralId: string | null;
  /** 表示 ppm */
  delta: number;
  /** m のときの範囲 [高, 低] */
  range: [number, number] | null;
  /** 書かないときは '' (1H 以外の一重線など) */
  mult: string;
  J: number[];
  nH: number | null;
  assign: string;
  /** 自動判定の結果 (表で上書きしたときの比較用) */
  auto: { mult: string; J: number[]; nH: number | null };
}

export interface SiEntry {
  layerId: string;
  nucleus: string;
  /** リッチテキスト (^{..} / _{..})。温度は含めない (formatSi で入れる) */
  header: string;
  temperatureK: number | null;
  signals: SiSignal[];
  /** 信号をどこから取ったか */
  source: 'integrals' | 'labels' | 'peaks' | 'none';
}

type Exclusion = { ppm: number; tol: number };

/** 溶媒の残存ピークと、不純物マーカーを付けたピーク (自動で拾わない) */
export function exclusions(doc: NmrDocument, meta: SpectrumMeta, layerId: string, settings: Settings): Exclusion[] {
  const out: Exclusion[] = [];
  const table = meta.nucleus === '1H' ? RESIDUAL_1H : meta.nucleus === '13C' ? RESIDUAL_13C : null;
  const wide = meta.nucleus === '1H' ? 0.03 : 0.8;
  if (table && meta.solvent) {
    const ref = labReference(settings, meta.solvent, meta.nucleus);
    const base = tableResidual(meta.solvent, meta.nucleus);
    const corr = ref !== null && base !== null ? ref - base : 0;
    for (const v of table[meta.solvent] ?? []) out.push({ ppm: v + corr, tol: wide });
  }
  for (const m of doc.markers) {
    if (m.layerId === layerId) out.push({ ppm: m.ppm + meta.refOffset, tol: meta.nucleus === '1H' ? 0.02 : 0.3 });
  }
  return out;
}

const isExcluded = (ppm: number, ex: Exclusion[]) => ex.some((e) => Math.abs(e.ppm - ppm) <= e.tol);

/**
 * 1H の信号の範囲を自動で見つける (表示 ppm の [高, 低])。
 * ピークを拾い、20 Hz 以内に続くものを1つの信号としてまとめる。溶媒・不純物は除く。
 */
export function detectSignals(
  data: Float32Array,
  meta: SpectrumMeta,
  ex: Exclusion[],
  opts: { range?: [number, number]; minFraction?: number } = {},
): [number, number][] {
  const full = [Math.min(meta.first, meta.last) + meta.refOffset, Math.max(meta.first, meta.last) + meta.refOffset];
  const [lo, hi] = opts.range ? [Math.min(...opts.range), Math.max(...opts.range)] : full;
  const peaks = findPeaks(data, meta, lo, hi, noiseLevel(data) * 10).filter((p) => !isExcluded(p.ppm, ex));
  if (!peaks.length) return [];
  const top = Math.max(...peaks.map((p) => p.height));
  const strong = peaks.filter((p) => p.height >= top * (opts.minFraction ?? 0.03)).sort((a, b) => b.ppm - a.ppm);
  const gap = 20 / meta.freqMHz;
  const pad = 8 / meta.freqMHz;
  const regions: [number, number][] = [];
  for (const p of strong) {
    const last = regions[regions.length - 1];
    if (last && last[1] - p.ppm <= gap) last[1] = p.ppm;
    else regions.push([p.ppm, p.ppm]);
  }
  return regions.map(([a, b]) => [a + pad, b - pad]);
}

export function buildSiEntry(doc: NmrDocument, dataMap: Record<string, Float32Array>, layerId: string, settings: Settings): SiEntry | null {
  const layer = doc.layers.find((l) => l.id === layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  const data = meta && dataMap[meta.id];
  if (!layer || !meta || !data) return null;
  const isH = meta.nucleus === '1H';
  const header = siHeader(meta);
  const temperatureK = meta.temperatureC !== null ? Math.round(meta.temperatureC + 273.15) : null;
  const base = { layerId, nucleus: meta.nucleus, header, temperatureK };
  const off = meta.refOffset;

  const integrals = doc.integrals.filter((x) => x.layerId === layerId);
  if (integrals.length) {
    const { values } = integralValues(doc, dataMap);
    const signals = integrals.map((x): SiSignal => {
      const r = analyzeMultiplet(data, meta, x.from + off, x.to + off, meta.freqMHz);
      const autoMult = !isH && r.mult === 's' ? '' : r.mult;
      const autoH = isH ? Math.max(1, Math.round(values.get(x.id) ?? 0)) : null;
      const o = x.si ?? {};
      const mult = o.mult?.trim() || autoMult;
      const J = o.J?.length ? o.J : mult === autoMult ? r.J : [];
      return {
        integralId: x.id,
        delta: r.center,
        range: mult === 'm' ? [r.hi, r.lo] : null,
        mult,
        J,
        nH: o.nH ?? autoH,
        assign: o.assign ?? '',
        auto: { mult: autoMult, J: r.J, nH: autoH },
      };
    });
    return { ...base, signals: sortDesc(signals), source: 'integrals' };
  }

  const simple = (ppm: number): SiSignal => ({
    integralId: null,
    delta: ppm,
    range: null,
    mult: '',
    J: [],
    nH: null,
    assign: '',
    auto: { mult: '', J: [], nH: null },
  });
  const labels = doc.peakLabels.filter((p) => p.layerId === layerId);
  if (labels.length) {
    return { ...base, signals: sortDesc(labels.map((p) => simple(p.ppm + off))), source: 'labels' };
  }
  // 1H は多重線をまとめる必要があるので、積分なしでは自動で並べない
  if (isH) return { ...base, signals: [], source: 'none' };

  const ex = exclusions(doc, meta, layerId, settings);
  const lo = Math.min(meta.first, meta.last) + off;
  const hi = Math.max(meta.first, meta.last) + off;
  const peaks = findPeaks(data, meta, lo, hi, noiseLevel(data) * 8).filter((p) => !isExcluded(p.ppm, ex));
  const top = Math.max(0, ...peaks.map((p) => p.height));
  const kept = peaks.filter((p) => p.height >= top * 0.02);
  return { ...base, signals: sortDesc(kept.map((p) => simple(p.ppm))), source: kept.length ? 'peaks' : 'none' };
}

export function buildSiEntries(doc: NmrDocument, dataMap: Record<string, Float32Array>, settings: Settings): SiEntry[] {
  const order = ['1H', '13C', '19F', '31P'];
  const rank = (n: string) => (order.includes(n) ? order.indexOf(n) : order.length);
  return doc.layers
    .filter((l) => l.visible)
    .map((l) => buildSiEntry(doc, dataMap, l.id, settings))
    .filter((e): e is SiEntry => !!e)
    .sort((a, b) => rank(a.nucleus) - rank(b.nucleus));
}

function sortDesc(list: SiSignal[]) {
  return list.sort((a, b) => b.delta - a.delta);
}

function siHeader(meta: SpectrumMeta) {
  const dec = meta.decoupled && meta.decoupled !== meta.nucleus ? `{${nucleusRich(meta.decoupled)}}` : '';
  const parts = [`${Math.round(meta.freqMHz)} MHz`];
  const solvent = solventInfo(meta.solvent)?.label ?? meta.solventRaw;
  if (solvent) parts.push(solvent);
  return `${nucleusRich(meta.nucleus)}${dec} NMR (${parts.join(', ')})`;
}

/** 1つの SI の文。html は Word に貼る用 (上付き・下付き・斜体の J)、text は Unicode の上付き・下付き */
export function formatSi(entry: SiEntry, opts: SiOptions): { html: string; text: string } {
  const dec = entry.nucleus === '1H' ? opts.hDecimals : opts.xDecimals;
  const f = (v: number) => v.toFixed(dec);
  const header = opts.includeTemp && entry.temperatureK !== null ? entry.header.replace(/\)$/, `, ${entry.temperatureK} K)`) : entry.header;
  const html: string[] = [richHtml(header), ' <i>δ</i> '];
  const text: string[] = [richUnicode(header), ' δ '];
  entry.signals.forEach((s, k) => {
    if (k) {
      html.push(', ');
      text.push(', ');
    }
    const d = s.range ? `${f(s.range[0])}–${f(s.range[1])}` : f(s.delta);
    html.push(d);
    text.push(d);
    const partsH: string[] = [];
    const partsT: string[] = [];
    if (s.mult) {
      partsH.push(escapeHtml(s.mult));
      partsT.push(s.mult);
      if (s.J.length) {
        const js = s.J.map((j) => j.toFixed(opts.jDecimals)).join(', ');
        partsH.push(`<i>J</i> = ${js} Hz`);
        partsT.push(`J = ${js} Hz`);
      }
    }
    if (entry.nucleus === '1H' && s.nH !== null) {
      partsH.push(`${s.nH}H`);
      partsT.push(`${s.nH}H`);
    }
    if (opts.includeAssign && s.assign.trim()) {
      partsH.push(richHtml(s.assign.trim()));
      partsT.push(richUnicode(s.assign.trim()));
    }
    if (partsH.length) {
      html.push(` (${partsH.join(', ')})`);
      text.push(` (${partsT.join(', ')})`);
    }
  });
  html.push('.');
  text.push('.');
  return { html: html.join(''), text: text.join('') };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

const TAGS: Record<string, string> = { sup: 'sup', sub: 'sub', italic: 'i', bold: 'b' };

function richHtml(src: string) {
  return parseRich(src)
    .map((s) => {
      const tag = TAGS[s.kind];
      return tag ? `<${tag}>${escapeHtml(s.text)}</${tag}>` : escapeHtml(s.text);
    })
    .join('');
}

const SUP: Record<string, string> = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', i: 'ⁱ', n: 'ⁿ', t: 'ᵗ' };
const SUB: Record<string, string> = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋' };

/** Unicode の上付き・下付き文字で書く (対応する文字がないものはそのまま) */
export function richUnicode(src: string) {
  return parseRich(src)
    .map((s) => (s.kind === 'sup' || s.kind === 'sub' ? [...s.text].map((c) => (s.kind === 'sup' ? SUP : SUB)[c] ?? c).join('') : s.text))
    .join('');
}

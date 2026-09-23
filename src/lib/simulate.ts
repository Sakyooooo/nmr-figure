/**
 * 論文の SI に書かれた値から、比較用のスペクトルを作る。
 * 実測ではないので、必ず引用元を図に出す (types.ts の Simulated)。
 */
import type { SpectrumMeta } from '../state/types';
import { detectSolvent } from './solvents';
import { multipletLines, parseSi, type ParsedSignal } from './siParse';

export interface SimulateOptions {
  /** 線幅 (Hz)。半値全幅 */
  lineWidthHz: number;
  /** 信号ごとの線幅 (Hz)。文献の図から測ったもの。null の信号は上の lineWidthHz を使う */
  widthsHz: (number | null)[] | null;
  /** 周波数 (MHz)。SI に書いてあればその値 */
  freqMHz: number;
  /** 作る範囲 (ppm) */
  first: number;
  last: number;
  /** 点の数 */
  n: number;
}

export function defaultRange(nucleus: string): { first: number; last: number } {
  if (nucleus === '13C') return { first: 220, last: -10 };
  if (nucleus === '19F') return { first: 50, last: -250 };
  if (nucleus === '31P') return { first: 250, last: -150 };
  return { first: 12, last: -1 };
}

export function defaultLineWidthHz(nucleus: string) {
  return nucleus === '1H' ? 1.2 : 3;
}

/** 1本の信号の線 (ppm と高さ) */
export function signalLines(signal: ParsedSignal, freqMHz: number): { ppm: number; height: number }[] {
  const area = signal.nH ?? 1;
  if (signal.range) {
    // 範囲だけ書いてある多重線は、その幅に均した山にする
    const [hi, lo] = signal.range;
    const count = Math.max(4, Math.round(((hi - lo) * freqMHz) / 2));
    return Array.from({ length: count }, (_, i) => ({
      ppm: lo + ((hi - lo) * (i + 0.5)) / count,
      height: area / count,
    }));
  }
  const lines = multipletLines(signal.mult || 's', signal.J);
  return lines.map((l) => ({ ppm: signal.delta + l.offsetHz / freqMHz, height: area * l.weight }));
}

/**
 * 文献の値から作ったスペクトルに付ける言葉。「文献 (著者 年)」だと論文に載っている実測スペクトルに見えるので、
 * 書かれた値から作図したものだと分かる言い方にする (図の下の引用の行は消せない)
 */
export const SIMULATED_WORD = '文献値から作図';

/** 文献のスペクトルの名前 (初期値)。例: 文献値から作図 (Smith 2024) */
export function simulatedLabel(short: string | undefined) {
  return short ? `${SIMULATED_WORD} (${short})` : SIMULATED_WORD;
}

/** 名前が自動で付けたもの (前の言い方も含む) か。自分で付け替えた名前は作り直しても変えない */
export function isAutoSimulatedLabel(label: string) {
  return !label || label === SIMULATED_WORD || label.startsWith(`${SIMULATED_WORD} (`) || label.startsWith('文献 (');
}

/** SI の文から、比較用のスペクトルを作る */
export function simulateFromSi(text: string, citation: { full: string; short: string }, override?: Partial<SimulateOptions>) {
  const parsed = parseSi(text);
  if (!parsed.signals.length) throw new Error('NMR のデータを読み取れませんでした。δ から始まる部分を貼り付けてください');
  const nucleus = parsed.nucleus;
  const freqMHz = override?.freqMHz ?? parsed.freqMHz ?? 400;
  const range = defaultRange(nucleus);
  const first = override?.first ?? range.first;
  const last = override?.last ?? range.last;
  const n = override?.n ?? 32768;
  const lineWidthHz = override?.lineWidthHz ?? defaultLineWidthHz(nucleus);

  const data = new Float32Array(n);
  const step = (last - first) / (n - 1);
  const widths = override?.widthsHz ?? null;
  parsed.signals.forEach((signal, index) => {
    // 文献の図から測れた信号は、その線幅を使う (測れなければ既定の線幅)
    const halfPpm = (widths?.[index] ?? lineWidthHz) / 2 / freqMHz;
    for (const line of signalLines(signal, freqMHz)) {
      // ローレンツ関数。裾は半値幅の 60 倍までで打ち切る
      const center = (line.ppm - first) / step;
      const width = halfPpm / Math.abs(step);
      const from = Math.max(0, Math.floor(center - width * 60));
      const to = Math.min(n - 1, Math.ceil(center + width * 60));
      // 高さは面積を保つ (幅が広い線は低くなる)
      const peak = line.height / (Math.PI * halfPpm);
      for (let i = from; i <= to; i++) {
        const t = (i - center) / width;
        data[i] += peak / (1 + t * t);
      }
    }
  });
  let maxAbs = 0;
  for (const v of data) maxAbs = Math.max(maxAbs, Math.abs(v));

  const meta: SpectrumMeta = {
    id: crypto.randomUUID(),
    fileName: `${citation.short || '文献'}.si`,
    title: citation.short,
    nucleus,
    axisName: nucleus,
    solventRaw: parsed.solvent,
    solvent: detectSolvent(parsed.solvent),
    freqMHz,
    temperatureC: null,
    scans: null,
    experiment: '文献データ',
    date: null,
    decoupled: null,
    acquiredAt: null,
    processing: null,
    first,
    last,
    n,
    refOffset: 0,
    maxAbs: maxAbs || 1,
    simulated: {
      citation: citation.full,
      short: citation.short,
      text: text.trim(),
      lineWidthHz,
      fromImage: override?.widthsHz?.some((w) => w !== null) || undefined,
    },
  };
  return { meta, data, parsed };
}

import { tr } from '../i18n';
import { IMPURITIES_13C, IMPURITIES_1H, RESIDUAL_13C, RESIDUAL_1H } from '../data/fulmer2010';
import type { CustomImpurity, ImpurityCompound, Shift, SolventKey } from './impurityTypes';
import { solventInfo, tableResidual } from './solvents';
import type { Peak } from './spectrum';

export interface SignalMatch {
  group: string;
  /** 補正後の期待値 */
  expected: Shift;
  observed: Peak | null;
}

export interface ImpurityCandidate {
  compoundId: string;
  name: string;
  signals: SignalMatch[];
  matched: number;
  /** 一致した信号の、期待値からのずれの平均 (ppm) */
  deviation: number;
  source: 'table' | 'custom' | 'residual';
}

export interface MatchOptions {
  nucleus: string;
  solvent: SolventKey;
  /** 研究室の基準値 (例: C6D6 の 1H = 7.15)。表の値との差を補正に使う */
  labReference: number | null;
  tolerance: number;
  custom: CustomImpurity[];
}

function tableFor(nucleus: string): ImpurityCompound[] {
  return nucleus === '1H' ? IMPURITIES_1H : nucleus === '13C' ? IMPURITIES_13C : [];
}

function residualFor(nucleus: string, solvent: SolventKey): number[] {
  const table = nucleus === '1H' ? RESIDUAL_1H : nucleus === '13C' ? RESIDUAL_13C : undefined;
  return table?.[solvent] ?? [];
}

/** 表の値に加える補正量 = 研究室の基準値 − 表の残存ピーク値 */
export function referenceCorrection(opts: Pick<MatchOptions, 'nucleus' | 'solvent' | 'labReference'>): number {
  const table = tableResidual(opts.solvent, opts.nucleus);
  if (table === null || opts.labReference === null) return 0;
  return opts.labReference - table;
}

function shiftBy(s: Shift, d: number): Shift {
  return typeof s === 'number' ? s + d : [s[0] + d, s[1] + d];
}

/** 期待値からの距離。範囲 [lo, hi] の場合は範囲内なら 0 */
function distance(ppm: number, expected: Shift): number {
  const [lo, hi] = typeof expected === 'number' ? [expected, expected] : expected;
  return ppm < lo ? lo - ppm : ppm > hi ? ppm - hi : 0;
}

/** 期待値に最も近い、許容幅内のピーク */
function nearest(peaks: Peak[], expected: Shift, tol: number): Peak | null {
  let best: Peak | null = null;
  let bestD = Infinity;
  for (const p of peaks) {
    const d = distance(p.ppm, expected);
    if (d <= tol && (d < bestD || (d === bestD && best && p.height > best.height))) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/**
 * 検出したピークと不純物表を照合して候補を返す。確定はせず、選ぶのはユーザー。
 * 1つでも信号が一致した化合物を候補にし、一致した信号の割合が高い順に並べる。
 */
export function findImpurityCandidates(peaks: Peak[], opts: MatchOptions): ImpurityCandidate[] {
  const corr = referenceCorrection(opts);
  const protio = solventInfo(opts.solvent)?.protioId;
  const out: ImpurityCandidate[] = [];

  const residual = residualFor(opts.nucleus, opts.solvent);
  if (residual.length) {
    const signals = residual.map((v) => {
      const expected = v + corr;
      return { group: '', expected, observed: nearest(peaks, expected, opts.tolerance) };
    });
    const matched = signals.filter((s) => s.observed).length;
    if (matched) {
      out.push({
        compoundId: 'solvent-residual',
        name: solventInfo(opts.solvent)?.residualName ?? tr('溶媒'),
        signals,
        matched,
        deviation: meanDeviation(signals),
        source: 'residual',
      });
    }
  }

  const compounds: { c: ImpurityCompound; source: 'table' | 'custom' }[] = [
    ...tableFor(opts.nucleus)
      .filter((c) => c.id !== protio)
      .map((c) => ({ c, source: 'table' as const })),
    ...opts.custom
      .filter((c) => c.nucleus === opts.nucleus && (c.solvent === 'any' || c.solvent === opts.solvent))
      .map((c) => ({
        c: {
          id: c.id,
          name: c.name,
          signals: c.shifts.map((v) => ({ group: '', shifts: { [opts.solvent]: v } })),
        },
        source: 'custom' as const,
      })),
  ];

  for (const { c, source } of compounds) {
    const signals: SignalMatch[] = [];
    for (const sig of c.signals) {
      const raw = sig.shifts[opts.solvent];
      if (raw === undefined) continue;
      // ユーザー登録の値は自分の基準で測ったものなので補正しない
      const expected = source === 'custom' ? raw : shiftBy(raw, corr);
      const tol = sig.broad ? opts.tolerance * 5 : opts.tolerance;
      signals.push({ group: sig.group, expected, observed: nearest(peaks, expected, tol) });
    }
    const matched = signals.filter((s) => s.observed).length;
    if (matched) out.push({ compoundId: c.id, name: c.name, signals, matched, deviation: meanDeviation(signals), source });
  }

  // 溶媒 → すべての信号が一致 → ずれが小さい → 一致した信号が多い の順
  const score = (c: ImpurityCandidate) => c.matched / c.signals.length;
  const rank = (c: ImpurityCandidate) => (c.source === 'residual' ? 0 : 1);
  return out.sort(
    (a, b) => rank(a) - rank(b) || score(b) - score(a) || a.deviation - b.deviation || b.matched - a.matched,
  );
}

function meanDeviation(signals: SignalMatch[]): number {
  const hits = signals.filter((s) => s.observed);
  return hits.reduce((sum, s) => sum + distance(s.observed!.ppm, s.expected), 0) / (hits.length || 1);
}

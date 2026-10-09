/**
 * NMR 収率 (qNMR) に使う内標 (本人の希望 2026-10-09「全部データとして持っておいて選択できるように」)。
 * ppm は内標の信号を探すときの目安。溶媒ごとの値がない溶媒では CDCl3 の値の近くを広めに探し、見つけた範囲は画面で直せる。
 * Fulmer の表にある化合物 (CH2Cl2・1,4-ジオキサン・ニトロメタン・ヘキサメチルベンゼン・HMDSO・1,2-ジクロロエタン) は表の値を使う。
 * 19F の ppm は CFCl3 = 0。density (g/mL) は液体だけ (μL で入れたときに使う)
 */
import { IMPURITIES_1H } from './fulmer2010';
import type { SolventKey } from '../lib/impurityTypes';

export interface StandardSignal {
  nucleus: string;
  /** 信号の H (F) の数 */
  n: number;
  /** 何の信号か (例: ArH, OCH3) */
  group: string;
  /** 溶媒ごとの ppm。無い溶媒は CDCl3 の値を目安にする */
  shifts: Partial<Record<SolventKey, number>>;
}

export interface InternalStandard {
  id: string;
  /** 一覧・図・メモに出す名前 */
  name: string;
  /** 分子量 (g/mol) */
  mw: number;
  /** 密度 (g/mL)。液体のときだけ */
  density?: number;
  signals: StandardSignal[];
  /** 自分で足したもの */
  custom?: boolean;
}

/** Fulmer の表の 1 つの信号の値 (範囲で書かれたものは真ん中) */
function fulmer(id: string, n: number, group: string): StandardSignal {
  const c = IMPURITIES_1H.find((x) => x.id === id);
  const shifts: Partial<Record<SolventKey, number>> = {};
  for (const [k, v] of Object.entries(c?.signals[0]?.shifts ?? {})) shifts[k as SolventKey] = Array.isArray(v) ? (v[0] + v[1]) / 2 : v;
  return { nucleus: '1H', n, group, shifts };
}

const h = (n: number, group: string, cdcl3: number, more: Partial<Record<SolventKey, number>> = {}): StandardSignal => ({
  nucleus: '1H',
  n,
  group,
  shifts: { CDCl3: cdcl3, ...more },
});
const f = (n: number, group: string, cdcl3: number): StandardSignal => ({ nucleus: '19F', n, group, shifts: { CDCl3: cdcl3 } });

export const INTERNAL_STANDARDS: InternalStandard[] = [
  // 1H
  { id: 'tmb', name: '1,3,5-Trimethoxybenzene', mw: 168.19, signals: [h(3, 'ArH', 6.09), h(9, 'OCH3', 3.77)] },
  { id: 'mesitylene', name: 'Mesitylene', mw: 120.19, density: 0.864, signals: [h(3, 'ArH', 6.78), h(9, 'CH3', 2.26)] },
  { id: 'tce', name: '1,1,2,2-Tetrachloroethane', mw: 167.85, density: 1.586, signals: [h(2, 'CHCl2', 5.96)] },
  { id: 'ch2br2', name: 'Dibromomethane (CH2Br2)', mw: 173.83, density: 2.477, signals: [h(2, 'CH2', 4.94)] },
  { id: 'ch2cl2', name: 'Dichloromethane (CH2Cl2)', mw: 84.93, density: 1.325, signals: [fulmer('dichloromethane', 2, 'CH2')] },
  { id: 'dioxane', name: '1,4-Dioxane', mw: 88.11, density: 1.034, signals: [fulmer('dioxane', 8, 'CH2')] },
  { id: 'nitromethane', name: 'Nitromethane', mw: 61.04, density: 1.127, signals: [fulmer('nitromethane', 3, 'CH3')] },
  { id: 'dce', name: '1,2-Dichloroethane', mw: 98.96, density: 1.256, signals: [fulmer('dce', 4, 'CH2')] },
  { id: 'hexamethylbenzene', name: 'Hexamethylbenzene', mw: 162.28, signals: [fulmer('hexamethylbenzene', 18, 'CH3')] },
  { id: 'hmdso', name: 'Hexamethyldisiloxane (HMDSO)', mw: 162.38, density: 0.764, signals: [fulmer('hmdso', 18, 'CH3')] },
  { id: 'dmt', name: 'Dimethyl terephthalate', mw: 194.18, signals: [h(4, 'ArH', 8.1), h(6, 'OCH3', 3.94)] },
  { id: 'dinitrobenzene', name: '1,4-Dinitrobenzene', mw: 168.11, signals: [h(4, 'ArH', 8.42)] },
  { id: 'durene', name: '1,2,4,5-Tetramethylbenzene (durene)', mw: 134.22, signals: [h(2, 'ArH', 6.9), h(12, 'CH3', 2.21)] },
  { id: 'trioxane', name: '1,3,5-Trioxane', mw: 90.08, signals: [h(6, 'OCH2O', 5.15)] },
  { id: 'ferrocene', name: 'Ferrocene', mw: 186.04, signals: [h(10, 'CpH', 4.16)] },
  { id: 'triphenylmethane', name: 'Triphenylmethane', mw: 244.34, signals: [h(1, 'CH', 5.56)] },
  { id: 'tbu3benzene', name: '1,3,5-Tri-tert-butylbenzene', mw: 246.44, signals: [h(27, 'C(CH3)3', 1.33)] },
  { id: 'dimethyl-fumarate', name: 'Dimethyl fumarate', mw: 144.13, signals: [h(2, 'CH=CH', 6.86), h(6, 'OCH3', 3.81)] },
  { id: 'pyrazine', name: 'Pyrazine', mw: 80.09, signals: [h(4, 'ArH', 8.59)] },
  { id: 'dimethyl-sulfone', name: 'Dimethyl sulfone', mw: 94.13, signals: [h(6, 'CH3', 3.0, { 'DMSO-d6': 2.99 })] },
  { id: 'maleic-acid', name: 'Maleic acid', mw: 116.07, signals: [h(2, 'CH=CH', 6.3, { 'DMSO-d6': 6.26 })] },
  // 19F
  { id: 'phcf3', name: 'α,α,α-Trifluorotoluene (PhCF3)', mw: 146.11, density: 1.19, signals: [f(3, 'CF3', -63.7)] },
  { id: 'c6f6', name: 'Hexafluorobenzene (C6F6)', mw: 186.06, density: 1.612, signals: [f(6, 'ArF', -164.9)] },
  { id: 'fluorobenzene', name: 'Fluorobenzene', mw: 96.1, density: 1.024, signals: [f(1, 'ArF', -113.1)] },
  { id: 'difluorobenzene', name: '1,4-Difluorobenzene', mw: 114.09, density: 1.17, signals: [f(2, 'ArF', -120.0)] },
  { id: 'bis-cf3-benzene', name: '1,3-Bis(trifluoromethyl)benzene', mw: 214.11, density: 1.378, signals: [f(6, 'CF3', -63.3)] },
  { id: 'phocf3', name: '(Trifluoromethoxy)benzene (PhOCF3)', mw: 162.11, density: 1.226, signals: [f(3, 'OCF3', -58.0)] },
];

import { RESIDUAL_13C, RESIDUAL_1H } from '../data/fulmer2010';
import type { SolventKey } from './impurityTypes';

export interface SolventInfo {
  key: SolventKey;
  /** 図に出す表記 (リッチテキスト) */
  label: string;
  /** 残存ピークの化合物名 (リッチテキスト) */
  residualName: string;
  /** 不純物表のうち、この溶媒のプロトン体にあたる化合物。候補から除外する */
  protioId?: string;
}

export const SOLVENTS: SolventInfo[] = [
  { key: 'CDCl3', label: 'CDCl_{3}', residualName: 'CHCl_{3}', protioId: 'chloroform' },
  { key: 'C6D6', label: 'C_{6}D_{6}', residualName: 'C_{6}D_{5}H', protioId: 'benzene' },
  { key: 'CD2Cl2', label: 'CD_{2}Cl_{2}', residualName: 'CDHCl_{2}', protioId: 'dichloromethane' },
  { key: 'THF-d8', label: 'THF-d_{8}', residualName: 'THF-d_{7}', protioId: 'thf' },
  { key: 'toluene-d8', label: 'toluene-d_{8}', residualName: 'toluene-d_{7}', protioId: 'toluene' },
  { key: 'C6D5Cl', label: 'C_{6}D_{5}Cl', residualName: 'C_{6}D_{4}HCl' },
  { key: 'acetone-d6', label: 'acetone-d_{6}', residualName: 'acetone-d_{5}', protioId: 'acetone' },
  { key: 'DMSO-d6', label: 'DMSO-d_{6}', residualName: 'DMSO-d_{5}' },
  { key: 'CD3CN', label: 'CD_{3}CN', residualName: 'CD_{2}HCN', protioId: 'acetonitrile' },
  { key: 'TFE-d3', label: 'TFE-d_{3}', residualName: 'TFE-d_{2}' },
  { key: 'CD3OD', label: 'CD_{3}OD', residualName: 'CD_{2}HOD', protioId: 'methanol' },
  { key: 'D2O', label: 'D_{2}O', residualName: 'HDO', protioId: 'water' },
];

export function solventInfo(key: SolventKey | null | undefined): SolventInfo | undefined {
  return SOLVENTS.find((s) => s.key === key);
}

// 順番に意味がある: CHLOROBENZENE を BENZENE や CHLOROFORM より先に判定する
const PATTERNS: [RegExp, SolventKey][] = [
  [/CHLOROBENZENE|C6D5CL/, 'C6D5Cl'],
  [/CHLOROFORM|CDCL3/, 'CDCl3'],
  [/DICHLOROMETHANE|METHYLENECHLORIDE|CD2CL2/, 'CD2Cl2'],
  [/BENZENE|C6D6/, 'C6D6'],
  [/TOLUENE/, 'toluene-d8'],
  [/TETRAHYDROFURAN|THF/, 'THF-d8'],
  [/ACETONITRILE|CD3CN/, 'CD3CN'],
  [/ACETONE/, 'acetone-d6'],
  [/DMSO|DIMETHYLSULF|DIMETHYLSULPH/, 'DMSO-d6'],
  [/TRIFLUOROETHANOL|TFE/, 'TFE-d3'],
  [/METHANOL|CD3OD/, 'CD3OD'],
  [/D2O|DEUTERIUMOXIDE|WATER/, 'D2O'],
];

/** Delta の solvent パラメータ (例: "BENZENE-D6") から溶媒を判定する */
export function detectSolvent(raw: string | null | undefined): SolventKey | null {
  if (!raw) return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const [re, key] of PATTERNS) if (re.test(s)) return key;
  return null;
}

/** Fulmer の表に載っている残存ピークの値 (基準信号) */
export function tableResidual(solvent: SolventKey, nucleus: string): number | null {
  const table = nucleus === '1H' ? RESIDUAL_1H : nucleus === '13C' ? RESIDUAL_13C : null;
  return table?.[solvent]?.[0] ?? null;
}

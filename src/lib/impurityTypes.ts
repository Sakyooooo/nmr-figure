export type SolventKey =
  | 'THF-d8'
  | 'CD2Cl2'
  | 'CDCl3'
  | 'toluene-d8'
  | 'C6D6'
  | 'C6D5Cl'
  | 'acetone-d6'
  | 'DMSO-d6'
  | 'CD3CN'
  | 'TFE-d3'
  | 'CD3OD'
  | 'D2O';

/** 単一の値、または表で範囲として与えられた [下限, 上限] */
export type Shift = number | [number, number];

export interface ImpuritySignal {
  group: string;
  mult?: string;
  /** 濃度・温度で大きく動く信号 (水, OH, NH)。照合の許容幅を広げる */
  broad?: boolean;
  shifts: Partial<Record<SolventKey, Shift>>;
}

export interface ImpurityCompound {
  id: string;
  /** 表示名。^{..} で上付き、_{..} で下付き */
  name: string;
  signals: ImpuritySignal[];
}

/** ユーザーが登録する不純物 (19F/31P や研究室固有のもの) */
export interface CustomImpurity {
  id: string;
  name: string;
  nucleus: string;
  solvent: SolventKey | 'any';
  shifts: number[];
}

import { tr } from '../i18n';
import type { FigureStyle } from '../state/types';
import type { CustomImpurity, SolventKey } from './impurityTypes';
import { nucleusDefaults } from './nuclei';
import { tableResidual } from './solvents';

/** ブラウザに保存する、図とは別の設定 (研究室の慣例など) */
export interface Settings {
  /** 溶媒ごと・核種ごとの基準値。未設定なら Fulmer の表の値 */
  references: Partial<Record<SolventKey, Record<string, number>>>;
  /** 照合の許容幅 (ppm)。未設定なら核種の既定値 */
  tolerances: Record<string, number>;
  customImpurities: CustomImpurity[];
  pngScale: number;
  templates: StyleTemplate[];
  /** 新しい図を作ったときに自動で当てるテンプレート */
  defaultTemplateId: string | null;
  /** 画面まわりの好み */
  ui: {
    leftOpen: boolean;
    rightOpen: boolean;
    homeSort: HomeSort;
    /** 画面の言語。auto はブラウザの言語に合わせる (日本語以外は英語) */
    lang: LangSetting;
    /** 初めて開いたときの使い方の説明を見終わった (閉じた) */
    onboardingDone: boolean;
    /** 構造式を描くソフト。null はまだ決めていない (初めて構造式ボタンを押したときに聞く) */
    structureTool: StructureTool | null;
  };
}

export type LangSetting = 'auto' | 'ja' | 'en';
/** chemdraw = ChemDraw で描いて保存すると図に入る / ketcher = このアプリの中で描く */
export type StructureTool = 'chemdraw' | 'ketcher';

/** ホーム画面の並び順 */
export interface HomeSort {
  key: 'date' | 'name' | 'modified';
  /** 降順 (新しい順・Z→A) */
  desc: boolean;
}

/** 図の見た目の保存。タイトルと凡例の位置は図ごとに違うので含めない */
export interface StyleTemplate {
  id: string;
  name: string;
  figure: Partial<FigureStyle>;
  layerColors: string[];
  lineWidth: number;
  /** 表示範囲。同じ核種のスペクトルにだけ当てる */
  range: { nucleus: string; xMax: number; xMin: number } | null;
}

export const TEMPLATE_EXCLUDED_KEYS: (keyof FigureStyle)[] = ['title', 'legendPos'];

export function templateFigure(f: FigureStyle): Partial<FigureStyle> {
  const out: Partial<FigureStyle> = { ...f };
  for (const k of TEMPLATE_EXCLUDED_KEYS) delete out[k];
  return out;
}

const TEMPLATE_FILE = 'nmr-figure-editor-templates';

export function templatesToJson(list: StyleTemplate[]): string {
  return JSON.stringify({ format: TEMPLATE_FILE, version: 1, templates: list }, null, 2);
}

export function templatesFromJson(text: string): StyleTemplate[] {
  const file = JSON.parse(text);
  if (file?.format !== TEMPLATE_FILE || !Array.isArray(file.templates)) throw new Error(tr('テンプレートのファイルではありません'));
  return (file.templates as StyleTemplate[]).filter((t) => t && typeof t.name === 'string' && t.figure);
}

const KEY = 'nmr-figure-editor.settings.v1';

export function defaultSettings(): Settings {
  return {
    references: { C6D6: { '1H': 7.15 } },
    tolerances: {},
    customImpurities: [],
    pngScale: 4,
    templates: [],
    defaultTemplateId: null,
    ui: { leftOpen: true, rightOpen: true, homeSort: { key: 'date', desc: true }, lang: 'auto', onboardingDone: false, structureTool: null },
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Settings>;
      const base = defaultSettings();
      // ui は後から項目が増えるので、既定値と混ぜる
      return { ...base, ...saved, ui: { ...base.ui, ...saved.ui } };
    }
  } catch {
    // プライベートモードなどで読めないときは既定値
  }
  return defaultSettings();
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // 保存できなくても動作は続ける
  }
}

export function labReference(s: Settings, solvent: SolventKey | null, nucleus: string): number | null {
  if (!solvent) return null;
  return s.references[solvent]?.[nucleus] ?? tableResidual(solvent, nucleus);
}

export function toleranceFor(s: Settings, nucleus: string): number {
  return s.tolerances[nucleus] ?? nucleusDefaults(nucleus).tolerance;
}

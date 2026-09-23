import type { Processing2d } from '../lib/fid2d';
import type { Processing } from '../lib/fid';
import type { SolventKey } from '../lib/impurityTypes';

export interface SpectrumMeta {
  id: string;
  fileName: string;
  title: string;
  /** "1H", "13C" など */
  nucleus: string;
  /** Delta の軸名 ("Proton", "Carbon13") */
  axisName: string;
  solventRaw: string;
  solvent: SolventKey | null;
  freqMHz: number;
  temperatureC: number | null;
  scans: number | null;
  experiment: string;
  date: string | null;
  /** デカップリングした核種 ("1H" など)。タイトルの {1H} に使う */
  decoupled?: string | null;
  /** 測定開始時刻 (ms) */
  acquiredAt?: number | null;
  /** FID をこのアプリで処理したときの設定 (Delta で処理済みのデータは null) */
  processing?: Processing | null;
  /** 読み込んだ時点での data[0] と data[n-1] の ppm */
  first: number;
  last: number;
  n: number;
  /** 基準合わせで加える ppm */
  refOffset: number;
  /** 強度の正規化に使う全体の最大値 */
  maxAbs: number;
  /** 論文の SI から作ったスペクトル (実測ではない)。引用元は図に必ず出す */
  simulated?: Simulated | null;
  /** .jdf に入っていた Delta のピーク値・積分 (取り込みに使う) */
  delta?: DeltaAnnotations | null;
}

/** Delta が .jdf に残した注釈 (lib/jdfAnnotations.ts で読む) */
export interface DeltaAnnotations {
  peaks: { ppm: number; height: number }[];
  /** value = Delta の生の積分値、shown = Delta の画面に出ていた値 (基準でそろえたあと) */
  integrals: { from: number; to: number; value: number; shown?: number; baseline?: IntegralBaseline }[];
  /** 積分の基準: Delta で「この積分を value にする」と入れた値 (無ければ null) */
  reference?: number | null;
  /** ピーク値・積分のほかに付いていた注釈の数 (このアプリでは扱わない) */
  others?: number;
}

export interface Simulated {
  /** 図の下に出す引用 (例: Smith et al., J. Am. Chem. Soc. 2024, 146, 1234. DOI: …) */
  citation: string;
  /** スペクトル名の横に出す短い引用 (例: Smith 2024) */
  short: string;
  /** 元にした SI の文 */
  text: string;
  lineWidthHz: number;
  /** 文献の図 (画像) から線幅を読み取ったか */
  fromImage?: boolean;
}

export interface Layer {
  id: string;
  spectrumId: string;
  visible: boolean;
  color: string;
  /** 重ね書きのときにスペクトル横に出す名前 (例: "0 h", "SM") */
  label: string;
  scale: number;
  lineWidth: number;
  /** 推移グラフの横軸の値。未設定なら名前の数値 (例: "24 h" → 24) を使う */
  time?: number | null;
  /** 積分値の基準。この積分をこの値にして、ほかの積分をそろえる */
  integralRef?: { id: string; value: number } | null;
}

/** 積分範囲。ppm は基準合わせ前の値 (from > to) */
export interface Integral {
  id: string;
  layerId: string;
  from: number;
  to: number;
  /** SI テキストで自動判定を上書きする値 */
  si?: SiOverride;
  /** Delta から取り込んだ積分のベースライン (Delta で手で直したものもそのまま使う)。範囲を変えたら消す */
  baseline?: IntegralBaseline | null;
}

/** 積分のベースライン (Delta と同じ持ち方)。高さ = bias + slope × (ppm − 範囲の中心) */
export interface IntegralBaseline {
  bias: number;
  /** 1 ppm あたりの傾き */
  slope: number;
}

export interface SiOverride {
  /** 多重度 (s, d, dd, m など)。空なら自動 */
  mult?: string;
  /** 結合定数 (Hz)。空なら自動 */
  J?: number[];
  /** プロトン数。null なら積分値から */
  nH?: number | null;
  /** 帰属 (例: OCH3) */
  assign?: string;
}

/** SI テキストの書き方 */
export interface SiOptions {
  /** 1H の δ の小数桁 */
  hDecimals: number;
  /** 1H 以外の δ の小数桁 */
  xDecimals: number;
  jDecimals: number;
  /** 測定温度を入れる */
  includeTemp: boolean;
  /** 帰属を入れる */
  includeAssign: boolean;
}

export type MarkerShape = 'circle' | 'square' | 'triangle' | 'invtriangle' | 'diamond' | 'star';

/** 凡例の1項目。不純物照合から作るものと、ユーザーが作るもの (生成物など) がある */
export interface MarkerStyle {
  id: string;
  name: string;
  color: string;
  shape: MarkerShape;
  compoundId?: string;
}

/** ppm はすべて基準合わせ前の値。表示位置は ppm + refOffset */
export interface Marker {
  id: string;
  layerId: string;
  styleId: string;
  ppm: number;
}

export interface PeakLabel {
  id: string;
  layerId: string;
  ppm: number;
}

export type AnnotationKind = 'ellipse' | 'rect' | 'arrow' | 'line' | 'text';
export type Dash = 'solid' | 'dashed' | 'dotted';

/**
 * パワポ風の図形。座標はスペクトルに固定する:
 * x = 基準合わせ前の ppm、y = そのスペクトルの正規化強度 (最大ピーク = 1)。
 * 拡大・並べ替え・基準合わせをしてもピークからずれない。
 */
export interface Annotation {
  id: string;
  kind: AnnotationKind;
  layerId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  dash: Dash;
  fill: string | null;
  text: string;
  fontSize: number;
}

export interface FigureStyle {
  width: number;
  height: number;
  fontFamily: string;
  mode: 'stack' | 'overlay';
  /** プロットの囲み */
  showFrame: boolean;
  /** 図全体の外枠 */
  showBorder: boolean;
  showYAxis: boolean;
  showXCaption: boolean;
  showTitle: boolean;
  showLegend: boolean;
  showLayerLabels: boolean;
  titleAuto: boolean;
  title: string;
  tickFontSize: number;
  peakLabelFontSize: number;
  titleFontSize: number;
  legendFontSize: number;
  layerLabelFontSize: number;
  peakLabelDecimals: number;
  peakLabelPlacement: 'axis' | 'top';
  markerSize: number;
  showIntegralCurves: boolean;
  /** curve: 積分曲線の上 (Delta と同じ) / axis: 軸の下にかぎ括弧と値 */
  integralPlacement: 'curve' | 'axis';
  integralDecimals: number;
  /** 積分のとき、範囲の両端を結ぶ直線を引く (Delta と同じ出し方) */
  integralBaseline: boolean;
  integralFontSize: number;
  /** 一番大きい積分曲線の高さ (スペクトルの帯に対する割合) */
  integralHeight: number;
  integralColor: string;
  /** 凡例の左上位置 (プロット領域に対する割合)。null なら右上に自動配置 */
  legendPos: { x: number; y: number } | null;
}

export interface ViewState {
  /** 左端 (大きい ppm) */
  xMax: number;
  /** 右端 (小さい ppm) */
  xMin: number;
  yZoom: number;
}

/** 推移グラフで追跡する範囲。ppm は表示上の値 (基準合わせ後) */
export interface TrackedRegion {
  id: string;
  name: string;
  color: string;
  from: number;
  to: number;
  /** プロトン数など。値をこの数で割ってから比べる */
  nH: number;
}

export type TrendMeasure = 'area' | 'height';
/** none: そのまま / first: 最初の時点を100% / reference: 基準の範囲との比 / sum: 合計を100% */
export type TrendNormalize = 'none' | 'first' | 'reference' | 'sum';

export interface TrendSettings {
  regions: TrackedRegion[];
  measure: TrendMeasure;
  normalize: TrendNormalize;
  referenceId: string | null;
  timeUnit: string;
  /** 空なら自動 */
  xLabel: string;
  yLabel: string;
  width: number;
  height: number;
  showOnSpectrum: boolean;
}

/** 2D の軸 1本ぶん */
export interface Axis2dMeta {
  nucleus: string;
  /** Delta の軸の名前 (Proton など) */
  axisName: string;
  freqMHz: number;
  /** 表示の向き (大きい ppm → 小さい ppm) の両端 */
  first: number;
  last: number;
  n: number;
}

export interface Spectrum2dMeta {
  id: string;
  fileName: string;
  title: string;
  /** cosy.jxp などの測定名 */
  experiment: string;
  /** 横軸 (直接観測) */
  x: Axis2dMeta;
  /** 縦軸 (間接観測) */
  y: Axis2dMeta;
  solvent: SolventKey | null;
  solventRaw: string;
  temperatureC: number | null;
  scans: number | null;
  date: string | null;
  acquiredAt: number | null;
  maxAbs: number;
  /** 雑音の目安。等高線の下限の初期値に使う */
  noise: number;
  processing: Processing2d;
}

/** 2D の等高線の描き方と表示範囲 */
export interface Plot2d {
  spectrumId: string;
  /** 一番低い等高線 (最大値に対する割合) */
  base: number;
  /** 等高線の本数 */
  levels: number;
  /** 1本ごとの倍率 */
  factor: number;
  color: string;
  lineWidth: number;
  /** 対角線 (同じ核種のとき) */
  showDiagonal: boolean;
  /** 上と右の 1D 投影 */
  showProjections: boolean;
  view: { xMax: number; xMin: number; yMax: number; yMin: number };
}

export function defaultPlot2d(meta: Spectrum2dMeta): Plot2d {
  const { id: spectrumId, x, y } = meta;
  return {
    spectrumId,
    // 雑音の 6 倍あたりから引く (弱い交差ピークは出して、雑音は出さない)
    base: Math.min(0.9, Math.max(0.003, (meta.noise * 6) / meta.maxAbs)),
    levels: 10,
    factor: 1.5,
    color: '#1f4fd1',
    lineWidth: 0.6,
    showDiagonal: x.nucleus === y.nucleus,
    showProjections: true,
    view: { xMax: x.first, xMin: x.last, yMax: y.first, yMin: y.last },
  };
}

/**
 * 図に置く構造式・画像。位置は図の左上からの割合で持つ (拡大縮小しても図の中で動かない)。
 * 構造式は SVG のまま埋め込むので、Word / PowerPoint で「図形に変換」すると編集できる。
 */
export interface FigureImage {
  id: string;
  /** SVG の中身 (ベクター)。貼り付けた画像のときは null */
  svg: string | null;
  /** 画像のときのデータ URL */
  href: string | null;
  /** 描き直すための元データ (MOL / RXN)。アプリで描いたものだけ */
  source: string | null;
  /** 図の左上を 0,0 とした割合 */
  x: number;
  y: number;
  /** 幅 (図の幅に対する割合) */
  w: number;
  /** 高さ ÷ 幅 */
  ratio: number;
}

export interface NmrDocument {
  version: 1;
  /** この図の id。ホーム画面に保存した図を上書きするのに使う */
  id: string;
  spectra: SpectrumMeta[];
  /** 図に置いた構造式・画像 */
  figureImages: FigureImage[];
  /** 2D のスペクトル (今は 1つの図に 1本) */
  spectra2d: Spectrum2dMeta[];
  /** 2D の図を出すときの設定。null なら 1D の図 */
  plot2d: Plot2d | null;
  /** 上から順 (図の上にあるものが先頭) */
  layers: Layer[];
  markerStyles: MarkerStyle[];
  markers: Marker[];
  peakLabels: PeakLabel[];
  annotations: Annotation[];
  integrals: Integral[];
  si: SiOptions;
  figure: FigureStyle;
  view: ViewState;
  trend: TrendSettings;
}

export type Tool =
  | 'select'
  | 'zoom'
  | 'height'
  | 'ellipse'
  | 'rect'
  | 'arrow'
  | 'line'
  | 'text'
  | 'peak'
  | 'integral'
  | 'marker'
  | 'reference'
  | 'region';

export type Selection = { kind: 'annotation' | 'marker' | 'peakLabel' | 'integral' | 'legend' | 'image'; id: string } | null;

export const LAYER_COLORS = ['#1f9e1f', '#1f4fd1', '#d12b2b', '#8a2bd1', '#d17a00', '#0f8c8c'];

export function defaultFigure(): FigureStyle {
  return {
    width: 940,
    height: 400,
    fontFamily: '"Times New Roman", Times, serif',
    mode: 'stack',
    showFrame: true,
    showBorder: true,
    showYAxis: true,
    showXCaption: true,
    showTitle: true,
    showLegend: true,
    showLayerLabels: true,
    titleAuto: true,
    title: '',
    tickFontSize: 11,
    peakLabelFontSize: 13,
    titleFontSize: 15,
    legendFontSize: 13,
    layerLabelFontSize: 13,
    peakLabelDecimals: 3,
    peakLabelPlacement: 'axis',
    markerSize: 8,
    showIntegralCurves: true,
    integralPlacement: 'curve',
    integralDecimals: 2,
    integralBaseline: true,
    integralFontSize: 12,
    integralHeight: 0.5,
    integralColor: '#000000',
    legendPos: null,
  };
}

export function defaultSi(): SiOptions {
  return { hDecimals: 2, xDecimals: 1, jDecimals: 1, includeTemp: false, includeAssign: true };
}

export function defaultTrend(): TrendSettings {
  return {
    regions: [],
    measure: 'area',
    normalize: 'sum',
    referenceId: null,
    timeUnit: 'h',
    xLabel: '',
    yLabel: '',
    width: 560,
    height: 380,
    showOnSpectrum: true,
  };
}

/** 最初から並べておくマーカー (色だけ。名前を入れると凡例に出る) */
export const DEFAULT_MARKER_COLORS = ['#c0392b', '#2e86c1', '#117a65', '#7d3c98', '#d68910', '#0b2a4a'];

export function defaultMarkerStyles(): MarkerStyle[] {
  return DEFAULT_MARKER_COLORS.map((color) => ({ id: crypto.randomUUID(), name: '', color, shape: 'circle' as MarkerShape }));
}

export function emptyDocument(): NmrDocument {
  return {
    version: 1,
    id: crypto.randomUUID(),
    spectra: [],
    figureImages: [],
    spectra2d: [],
    plot2d: null,
    layers: [],
    markerStyles: defaultMarkerStyles(),
    markers: [],
    peakLabels: [],
    annotations: [],
    integrals: [],
    si: defaultSi(),
    figure: defaultFigure(),
    view: { xMax: 10, xMin: -1, yZoom: 1 },
    trend: defaultTrend(),
  };
}

/** 前に保存した図を今の形にそろえる (あとから増えた項目を埋める) */
export function migrateDocument(doc: NmrDocument): NmrDocument {
  const base = emptyDocument();
  return {
    ...base,
    ...doc,
    id: doc.id || base.id,
    figureImages: doc.figureImages ?? [],
    spectra2d: doc.spectra2d ?? [],
    plot2d: doc.plot2d ?? null,
    integrals: doc.integrals ?? [],
    markerStyles: doc.markerStyles?.length ? doc.markerStyles : base.markerStyles,
    si: { ...base.si, ...doc.si },
    figure: { ...base.figure, ...doc.figure },
    trend: { ...base.trend, ...doc.trend },
  };
}

export function annotationDefaults(kind: AnnotationKind): Omit<Annotation, 'id' | 'layerId' | 'x1' | 'y1' | 'x2' | 'y2'> {
  return {
    kind,
    stroke: kind === 'text' ? '#000000' : '#d12b2b',
    strokeWidth: kind === 'text' ? 1 : 1.5,
    dash: 'solid',
    fill: null,
    text: kind === 'text' ? 'テキスト' : '',
    fontSize: 14,
  };
}

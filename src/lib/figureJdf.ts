/**
 * 図を .jdf として保存する (本人の希望 2026-09-24: 保存したものも Delta の形式にして、ダブルクリックで Delta が開くように)。
 *
 * 図入りの .jdf = 土台のスペクトルの .jdf (Delta で開くと見える 1 本) + ピーク値・積分 + 図の中身 (lib/jdfEmbed.ts)。
 * - 土台は図の一番下に描いているスペクトル (図の下のタイトルと同じ決め方)。文献から作ったものは飛ばす
 * - Delta で処理したスペクトルは、その .jdf を複製して注釈と図を入れ直す
 * - このアプリで FID から処理したスペクトルは、Delta の処理済みの形 (lib/jdfProcessed.ts) にしてから入れる
 * - 重ねたほかのスペクトルは図の中身にだけ入る (Delta では土台の 1 本だけが見える)
 * 2D と、文献のスペクトルだけの図は .jdf にできない (.nmrfig で保存する)
 */
import type { NmrDocument, SpectrumMeta } from '../state/types';
import { layerAnnotations } from './deltaSync';
import type { FidData } from './fid';
import { embedFigure, type FigureSummary } from './jdfEmbed';
import { writeProcessedJdf } from './jdfProcessed';
import { HEADER, JdfFormatError, UNIT_PPM } from './jdfSections';
import { writeAnnotations } from './jdfWrite';

export interface FigureBase {
  layerId: string;
  meta: SpectrumMeta;
}

/** 図を .jdf にするときの土台 (Delta で開くと見えるスペクトル)。.jdf にできない図は null */
export function figureBaseOf(doc: NmrDocument): FigureBase | null {
  if (doc.plot2d) return null;
  const usable = (spectrumId: string) => {
    const meta = doc.spectra.find((s) => s.id === spectrumId);
    return meta && !meta.simulated && /\.jdf$/i.test(meta.fileName) ? meta : null;
  };
  // 一番下 (layers の最後) から上へ。見えているものを先に
  const order = [...doc.layers].reverse();
  for (const layer of [...order.filter((l) => l.visible), ...order.filter((l) => !l.visible)]) {
    const meta = usable(layer.spectrumId);
    if (meta) return { layerId: layer.id, meta };
  }
  return null;
}

/** ホーム画面の一覧に出す要約 (本数と核種) */
export function figureSummaryOf(doc: NmrDocument): FigureSummary {
  const nuclei = [...new Set(doc.layers.map((l) => doc.spectra.find((s) => s.id === l.spectrumId)?.nucleus).filter((n): n is string => !!n))];
  return { layers: doc.layers.length, nuclei };
}

/**
 * 図入りの .jdf を作る。
 * template: 土台のスペクトルの .jdf (Delta で処理したもの・FID・前に保存した図入りの .jdf のどれか)
 * fid: 土台を FID からこのアプリで処理したときの FID
 */
export async function buildFigureJdf(template: ArrayBuffer, doc: NmrDocument, base: FigureBase, json: string, fid?: FidData): Promise<ArrayBuffer> {
  let bytes = template;
  if (base.meta.processing) {
    if (!fid) throw new JdfFormatError('FID の元データがないので、処理済みのファイルを作れません');
    bytes = writeProcessedJdf(template, fid, base.meta.processing, base.meta.refOffset);
  } else if (new Uint8Array(template)[HEADER.unitBase] !== UNIT_PPM) {
    throw new JdfFormatError('土台のファイルが処理済みのスペクトルではありません');
  }
  bytes = writeAnnotations(bytes, layerAnnotations(doc, base.layerId));
  return embedFigure(bytes, json, figureSummaryOf(doc));
}

/**
 * .jdf に入っている Delta の注釈 (ピーク値・積分) を読む。
 *
 * JEOL の公開仕様ではないので、実データ (研究室の 242 ファイル) から読み解いた形。
 * ヘッダの annoteStart / annoteLength (ビッグエンディアン) が注釈の場所を指していて、中身は
 *   352 バイトの見出し + 336 バイト固定長のレコード × 件数
 * レコードは (以下はリトルエンディアン)
 *   0   float64  ppm (ファイルの軸そのままの値。積分は範囲の中心)
 *   82  uint8    種類 (1〜3 = ピーク値 / 64〜67 = 積分。最下位ビットは「選ばれている」印)
 *   88  float64  ピークの高さ
 *   96  float32  積分の幅 (ppm)。範囲は ppm ± 幅/2
 *   128 float64  積分の生の値 = 範囲の強度の和 − 点数 × ベースラインの高さ (+328)
 *   136 float64  Delta の画面に出る値 (= 生の値 × 見出しの +224)
 *   144 float64  ベースラインの傾き (1 ppm あたり)
 *   328 float64  ベースラインの高さ (範囲の中心で)
 * 見出しの +224 は積分の倍率、+248 は「この積分をこの値にする」と入れた値。
 * レコードどうしのつながり (+64 など) は lib/jdfAnnoteCheck.ts と lib/jdfWrite.ts を参照。
 */
import type { DeltaAnnotations } from '../state/types';
import { isIntegralType, isPeakType } from './jdfAnnoteCheck';

export type { DeltaAnnotations };

const HEAD = 352;
const RECORD = 336;
/** 注釈の位置と長さ (ヘッダ内の場所) */
const ANNOTE_START = 1308;
const ANNOTE_LENGTH = 1316;

export function readAnnotations(buffer: ArrayBuffer): DeltaAnnotations {
  const empty: DeltaAnnotations = { peaks: [], integrals: [], reference: null, others: 0 };
  const v = new DataView(buffer);
  if (buffer.byteLength < ANNOTE_LENGTH + 4) return empty;
  // 64bit だが、実データでは 4GB を超えないので下位 32bit で足りる
  const start = Number(v.getBigUint64(ANNOTE_START, false));
  const length = v.getUint32(ANNOTE_LENGTH, false);
  if (!length || start + length > buffer.byteLength || length < HEAD + RECORD) return empty;
  if (v.getUint32(start, true) !== RECORD) return empty; // 見出しの先頭はレコードの大きさ

  const count = Math.min(v.getUint32(start + 8, true), Math.floor((length - HEAD) / RECORD));
  const result: DeltaAnnotations = { peaks: [], integrals: [], reference: null, others: 0 };
  for (let i = 0; i < count; i++) {
    const at = start + HEAD + i * RECORD;
    const kind = v.getUint8(at + 82);
    const ppm = v.getFloat64(at, true);
    if (!kind) continue;
    if (!Number.isFinite(ppm)) continue;
    if (isPeakType(kind)) {
      const height = v.getFloat64(at + 88, true);
      if (Number.isFinite(height)) result.peaks.push({ ppm, height });
    } else if (isIntegralType(kind)) {
      const value = v.getFloat64(at + 128, true);
      const shown = v.getFloat64(at + 136, true);
      const width = Math.abs(v.getFloat32(at + 96, true));
      const bias = v.getFloat64(at + 328, true);
      const slope = v.getFloat64(at + 144, true);
      if (Number.isFinite(value) && Number.isFinite(width) && width > 0) {
        result.integrals.push({
          from: ppm + width / 2,
          to: ppm - width / 2,
          value,
          shown: Number.isFinite(shown) ? shown : value,
          baseline: Number.isFinite(bias) && Number.isFinite(slope) ? { bias, slope } : undefined,
        });
      }
    } else {
      result.others = (result.others ?? 0) + 1;
    }
  }
  const reference = v.getFloat64(start + 248, true);
  if (result.integrals.length && Number.isFinite(reference) && reference > 0) result.reference = reference;
  result.peaks.sort((a, b) => b.ppm - a.ppm);
  result.integrals.sort((a, b) => b.from - a.from);
  return result;
}

/**
 * Delta の積分の値のそろえ方を、このアプリの「基準の積分」に置き換える。
 * Delta の画面の値は どの積分も 生の値 × 同じ倍率 なので、どれか 1 つを「画面の値」で基準にすれば全部そろう。
 * 基準の値 (+248) と画面の値が合う積分があればそれを、なければ最初の積分を選ぶ。
 */
export function deltaReference(ann: Pick<DeltaAnnotations, 'integrals' | 'reference'>): { index: number; value: number } | null {
  const list = ann.integrals;
  if (!list.length) return null;
  const target = ann.reference ?? null;
  const found =
    target === null ? -1 : list.findIndex((x) => x.shown !== undefined && Math.abs(x.shown - target) <= Math.abs(target) * 1e-3);
  // 見つかったときは入力された値 (4 や 9 など) をそのまま使う
  const value = found >= 0 ? target! : (list[0].shown ?? list[0].value);
  return Number.isFinite(value) && value !== 0 ? { index: Math.max(0, found), value } : null;
}

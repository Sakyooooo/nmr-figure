/**
 * .jdf に入っている Delta の注釈 (ピーク値・積分) を読む。
 *
 * JEOL の公開仕様ではないので、実データ (研究室の 227 ファイル) から読み解いた形。
 * ヘッダの annoteStart / annoteLength (ビッグエンディアン) が注釈の場所を指していて、中身は
 *   352 バイトの見出し + 336 バイト固定長のレコード × 件数
 * レコードは (以下はリトルエンディアン)
 *   0   float64  ppm (ファイルの軸そのままの値)
 *   64  uint32   Delta 内の番号
 *   82  uint8    種類 (2, 3 = ピーク値 / 66 = 積分)
 *   88  float64  ピークの高さ (積分のときは 0)
 *   96  float32  積分の幅 (ppm)。範囲は ppm ± 幅/2
 *   128 float64  値 (ピークは高さ由来の値、積分は Delta に出る積分値)
 *
 * 範囲の形は、Delta で 1〜2 ppm と 7〜8 ppm に積分を引いて保存したファイルで確かめた
 * (中心 1.4984 / 幅 0.99653、中心 7.4999 / 幅 0.99996)。
 */

export interface DeltaPeak {
  /** ファイルの軸の ppm (このアプリの基準合わせを足す前) */
  ppm: number;
  height: number;
}

export interface DeltaIntegral {
  /** 範囲 (ppm の大きい方) */
  from: number;
  /** 範囲 (ppm の小さい方) */
  to: number;
  /** Delta の画面に出ていた積分値 (両端を結ぶ直線を引いた面積) */
  value: number;
}

export interface DeltaAnnotations {
  peaks: DeltaPeak[];
  integrals: DeltaIntegral[];
}

const HEAD = 352;
const RECORD = 336;
/** 注釈の位置と長さ (ヘッダ内の場所) */
const ANNOTE_START = 1308;
const ANNOTE_LENGTH = 1316;

const TYPE_PEAK = [2, 3];
const TYPE_INTEGRAL = 66;

export function readAnnotations(buffer: ArrayBuffer): DeltaAnnotations {
  const empty: DeltaAnnotations = { peaks: [], integrals: [] };
  const v = new DataView(buffer);
  if (buffer.byteLength < ANNOTE_LENGTH + 4) return empty;
  // 64bit だが、実データでは 4GB を超えないので下位 32bit で足りる
  const start = Number(v.getBigUint64(ANNOTE_START, false));
  const length = v.getUint32(ANNOTE_LENGTH, false);
  if (!length || start + length > buffer.byteLength || length < HEAD + RECORD) return empty;
  if (v.getUint32(start, true) !== RECORD) return empty; // 見出しの先頭はレコードの大きさ

  const count = Math.min(v.getUint32(start + 8, true), Math.floor((length - HEAD) / RECORD));
  const peaks: DeltaPeak[] = [];
  const integrals: DeltaIntegral[] = [];
  for (let i = 0; i < count; i++) {
    const at = start + HEAD + i * RECORD;
    const kind = v.getUint8(at + 82);
    const ppm = v.getFloat64(at, true);
    if (!Number.isFinite(ppm)) continue;
    if (TYPE_PEAK.includes(kind)) {
      const height = v.getFloat64(at + 88, true);
      if (Number.isFinite(height)) peaks.push({ ppm, height });
    } else if (kind === TYPE_INTEGRAL) {
      const value = v.getFloat64(at + 128, true);
      const width = Math.abs(v.getFloat32(at + 96, true));
      if (Number.isFinite(value) && Number.isFinite(width) && width > 0) {
        integrals.push({ from: ppm + width / 2, to: ppm - width / 2, value });
      }
    }
  }
  peaks.sort((a, b) => b.ppm - a.ppm);
  integrals.sort((a, b) => b.from - a.from);
  return { peaks, integrals };
}

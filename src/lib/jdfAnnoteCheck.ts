import { tr } from '../i18n';
/**
 * .jdf の注釈 (Delta のピーク値・積分) のつながりが、Delta 自身が書いたファイルと同じ決まりに沿っているか確かめる。
 * 書き戻したファイルを Delta が開けるかの目安にする (研究室の 113 ファイルは全部これを満たす)。
 *
 * 分かっている決まり (レコード番号は 1 始まり、0 = なし):
 *   見出し +52      ppm の大きい順につないだ鎖 (スキップリスト) の先頭。レコード +64 が次のレコード。
 *                   同じ ppm は鎖に 2 つ入らない (ピークと中心が同じ積分は鎖から外れる)
 *   見出し +20      スキップリストの段の数。段 L の先頭が +52+2L、次が レコード +64+2L
 *   見出し +222     いちばん新しい積分。積分どうしは +154 (古い方) / +152 (新しい方) で双方向につながる
 *   見出し +220     選ばれている注釈 (0 か、種類の最下位ビットが立ったもの)
 *   見出し +120     空き枠の鎖の先頭。空き枠の +0 (uint32) が次の空き枠
 */

const HEAD = 352;
const RECORD = 336;
const ANNOTE_START = 1308;
const ANNOTE_LENGTH = 1316;

export const isPeakType = (t: number) => t >= 1 && t <= 3;
export const isIntegralType = (t: number) => t >= 64 && t <= 67;

export function checkAnnotationLinks(buffer: ArrayBuffer): string[] {
  const v = new DataView(buffer);
  const problems: string[] = [];
  const start = Number(v.getBigUint64(ANNOTE_START, false));
  const length = v.getUint32(ANNOTE_LENGTH, false);
  if (!length) return problems;
  if (start + length > buffer.byteLength) return [tr('注釈がファイルの外にはみ出している')];
  if (v.getUint32(start, true) !== RECORD) return [tr('注釈の見出しが読めない')];
  const slots = v.getUint32(start + 8, true);
  if (HEAD + slots * RECORD !== length) problems.push(tr('枠数 {slots} と長さ {length} が合わない', { slots, length }));
  if (v.getUint32(start + 12, true) !== (slots + 1) * RECORD) problems.push(tr('+12 が (枠数+1)×336 でない'));
  const H = (o: number) => v.getUint16(start + o, true);
  const at = (i: number) => start + HEAD + i * RECORD;
  const type = (i: number) => v.getUint8(at(i) + 82);
  const ppm = (i: number) => v.getFloat64(at(i), true);
  const link = (i: number, o: number) => v.getUint16(at(i) + o, true);
  const inRange = (p: number) => p >= 0 && p <= slots;

  // ppm の鎖
  const onChain = new Set<number>();
  let prev = Infinity;
  for (let p = H(52), n = 0; p; n++) {
    if (!inRange(p) || n > slots) {
      problems.push(tr('+64 の鎖が輪になっているか、範囲の外を指している'));
      break;
    }
    const i = p - 1;
    if (onChain.has(i)) {
      problems.push(tr('+64 の鎖が輪になっている'));
      break;
    }
    onChain.add(i);
    if (!type(i)) problems.push(tr('+64 の鎖が空き枠 {p} を通る', { p }));
    if (ppm(i) > prev) problems.push(tr('+64 の鎖が ppm の大きい順になっていない'));
    prev = ppm(i);
    p = link(i, 64);
  }
  const heads = [52, 54, 56, 58, 60, 62].filter((o) => H(o)).length;
  if (heads && H(20) !== heads) problems.push(tr('+20 ({H}) が先頭の数 ({heads}) と合わない', { H: H(20), heads }));

  // 積分の鎖
  const integrals = new Set<number>();
  for (let p = H(222), n = 0; p; n++) {
    if (!inRange(p) || n > slots) {
      problems.push(tr('積分の鎖が範囲の外を指している'));
      break;
    }
    const i = p - 1;
    if (integrals.has(i)) {
      problems.push(tr('積分の鎖が輪になっている'));
      break;
    }
    if (!n && link(i, 152)) problems.push(tr('いちばん新しい積分に、さらに新しい方がつながっている'));
    integrals.add(i);
    const older = link(i, 154);
    if (older && inRange(older) && link(older - 1, 152) !== p) problems.push(tr('積分の鎖の行きと帰りが合わない'));
    p = older;
  }

  for (let i = 0; i < slots; i++) {
    const t = type(i);
    // 鎖に入っていないのは、鎖の中に同じ ppm がある積分だけ (Delta もそうしている)
    const twin = () => [...onChain].some((j) => Math.abs(ppm(j) - ppm(i)) < 1e-9);
    if (isPeakType(t) && !onChain.has(i)) problems.push(tr('ピーク {v0} が +64 の鎖に入っていない', { v0: i + 1 }));
    if (isIntegralType(t) && !onChain.has(i) && !twin()) problems.push(tr('積分 {v0} が +64 の鎖に入っていない', { v0: i + 1 }));
    if (isIntegralType(t) && !integrals.has(i)) problems.push(tr('積分 {v0} が積分の鎖に入っていない', { v0: i + 1 }));
    if (!isIntegralType(t) && integrals.has(i)) problems.push(tr('積分でないレコード {v0} が積分の鎖に入っている', { v0: i + 1 }));
    for (const o of [64, 66, 152, 154]) if (!inRange(link(i, o))) problems.push(tr('レコード {v0} の +{o} が範囲の外', { v0: i + 1, o }));
  }

  const selected = H(220);
  if (selected && (!inRange(selected) || !(type(selected - 1) & 1))) problems.push(tr('+220 が選べない注釈を指している'));

  // 空き枠の鎖
  const free = new Set<number>();
  for (let i = 0; i < slots; i++) if (!type(i)) free.add(i);
  if (free.size) {
    const seen = new Set<number>();
    for (let p = H(120), n = 0; p && n <= slots; n++) {
      if (!inRange(p) || type(p - 1) || seen.has(p - 1)) {
        problems.push(tr('空き枠の鎖が使用中の枠か範囲の外を指している'));
        break;
      }
      seen.add(p - 1);
      p = v.getUint32(at(p - 1), true);
    }
    if (seen.size !== free.size) problems.push(tr('空き枠 {size} のうち、鎖でたどれるのは {size2}', { size: free.size, size2: seen.size }));
  }
  return problems;
}

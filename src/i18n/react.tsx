import { Fragment, type ReactNode } from 'react';
import { tr } from '.';

/**
 * 文の途中に部品 (キーの表示・リンクなど) が入るときの翻訳。
 * trx('{key} で開く', { key: <Kbd>Enter</Kbd> }) のように、{名前} の所に部品を差し込む。
 * 文字や数の値はふつうの tr と同じに差し込む (英語の複数形 {n|…|…} もここで選ぶ)
 */
export function trx(ja: string, parts: Record<string, ReactNode>): ReactNode {
  const values: Record<string, string | number> = {};
  const nodes: Record<string, ReactNode> = {};
  for (const [k, v] of Object.entries(parts)) {
    if (typeof v === 'string' || typeof v === 'number') values[k] = v;
    else nodes[k] = v;
  }
  const text = tr(ja, values);
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(/\{(\w+)\}/g)) {
    if (!(m[1] in nodes)) continue;
    out.push(text.slice(last, m.index));
    out.push(<Fragment key={`${m[1]}-${m.index}`}>{nodes[m[1]]}</Fragment>);
    last = m.index! + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

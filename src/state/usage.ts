import { useEditor } from './store';

/**
 * 使われた回数を数える (本人の希望 2026-10-01「開発者としてどれだけ利用されたか分かるように」「開いた回数、編集した回数のみでいい」)。
 * GoatCounter (無料の集計サービス) に「開いた」「編集した」の名前だけを送る。ファイル名・試料名・スペクトル・構造式・
 * 画面の大きさ・どのページから来たかは送らない。Cookie も使わない (同じ人かどうかは GoatCounter が IP とブラウザの種類から 1 日ごとに見分ける)。
 *  - 開いた: アプリを開く (読み込む) たびに 1 回
 *  - 編集した: 図を開いて (新しく作って) 最初に直したときに 1 回。保存してからまた直し始めたら、もう 1 回。
 *    直すたびに送ると 1 枚の図で何百回にもなるので、「変更なし → 変更あり」になったときだけ数える。前回の作業を戻しただけ (doc は変わらない) は数えない
 * 公開版 (sakyooooo.github.io) だけで数える (開発サーバー・手元の試験では送らない)。設定の「使われた回数を送る」を外すと送らない。
 * 通信先は CSP (vite.config.ts) でこの 1 つだけ許す
 */
export const USAGE_ORIGIN = 'https://nmr-figure.goatcounter.com';
const PUBLIC_HOST = 'sakyooooo.github.io';

export type UsageEvent = 'open' | 'edit';

/** GoatCounter の数える URL。開いた = ページを見た回数 (人数もわかる)、編集した = イベント */
export function usageUrl(event: UsageEvent, rnd = Math.random().toString(36).slice(2, 10)): string {
  const q = new URLSearchParams(event === 'open' ? { p: '/', t: 'open' } : { p: 'edit', t: 'edit', e: 'true' });
  // 同じ URL がキャッシュされて数え漏れないように
  q.set('rnd', rnd);
  return `${USAGE_ORIGIN}/count?${q.toString()}`;
}

/** 送ってよいか: 公開版で、設定で止めていないとき */
export function usageAllowed(host = location.hostname, prod = import.meta.env.PROD): boolean {
  return prod && host === PUBLIC_HOST && useEditor.getState().settings.sendUsage !== false;
}

function send(event: UsageEvent) {
  if (!usageAllowed()) return;
  // 答えは使わない (届かなくても何もしない)。Cookie は付けない
  void fetch(usageUrl(event), { mode: 'no-cors', credentials: 'omit', cache: 'no-store', keepalive: true }).catch(() => undefined);
}

/** 開いたことを数え、図を直し始めたら数える。前回の作業を戻してから呼ぶ。返り値は数えるのをやめる関数 (試験用) */
export function startUsageCount(count: (event: UsageEvent) => void = send): () => void {
  count('open');
  return useEditor.subscribe((s, prev) => {
    if (s.dirty && !prev.dirty && s.doc !== prev.doc) count('edit');
  });
}

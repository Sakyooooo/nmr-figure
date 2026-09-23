/**
 * まだ公開していない機能の出し入れ。
 * Delta への書き戻し: 2026-09-23 に注釈の形 (スキップリスト) を解き直した。
 * 書いたファイルを実機の Delta で開けることを確かめるまでは、開発中の画面 (npm run dev) にだけ出す。
 */
export const DELTA_EXPORT: boolean = import.meta.env.DEV || import.meta.env.VITE_DELTA_EXPORT === '1';

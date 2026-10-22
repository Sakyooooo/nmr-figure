/**
 * H のまとまりを裏で求める (OpenChemLib は大きな分子で数秒かかるので、画面を止めない)。
 * 受け取る: { id, cdxml, start? } → 返す: { id, sites, labels } か { id, error }
 */
import * as OCL from 'openchemlib';
import { analyzeHydrogens, autoNumber } from './protonNumbering';

const post = (msg: unknown) => (self as unknown as { postMessage(m: unknown): void }).postMessage(msg);

self.addEventListener('message', (e: MessageEvent<{ id: number; cdxml: string; start?: string }>) => {
  const { id, cdxml, start } = e.data;
  try {
    const a = analyzeHydrogens(cdxml, OCL);
    post({ id, sites: a.sites, labels: autoNumber(a, start) });
  } catch (err) {
    post({ id, error: (err as Error).message || String(err) });
  }
});

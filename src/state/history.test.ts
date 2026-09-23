import { describe, expect, it } from 'vitest';
import { pruneHistory, type HistoryEntry } from './history';

const entry = (id: string, manual = false): HistoryEntry => ({
  id,
  at: 0,
  source: 'app',
  note: '',
  annotations: { peaks: [], integrals: [], reference: null },
  shown: [],
  key: id,
  manual,
});

describe('記録の整理', () => {
  it('自動の控えが多すぎたら古いものから消す。最初の 1 件と、自分で付けた記録は残す', () => {
    const list = [entry('a0'), entry('m1', true), ...Array.from({ length: 8 }, (_, i) => entry(`a${i + 1}`)), entry('m2', true)];
    const kept = pruneHistory(list, 4);
    expect(kept.map((e) => e.id)).toEqual(['a0', 'm1', 'a6', 'a7', 'a8', 'm2']);
  });

  it('上限までなら何も消さない', () => {
    const list = [entry('a0'), entry('m1', true), entry('a1')];
    expect(pruneHistory(list, 4)).toBe(list);
  });
});

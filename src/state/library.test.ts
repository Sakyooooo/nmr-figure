import { describe, expect, it } from 'vitest';
import type { ExperimentMeta } from '../lib/jdfMeta';
import { groupList } from './library';

/** 2026-09-01 10:00 を基準にした測定データ */
const day = (d: number, h: number) => Date.UTC(2026, 8, d, h - 9);

function meta(patch: Partial<ExperimentMeta> & { title: string; measuredAt: number }): ExperimentMeta {
  return {
    key: `${patch.title}-${patch.measuredAt}-${patch.fileName ?? ''}`,
    fileName: `${patch.title}_Proton-1-2.jdf`,
    nuclei: ['1H'],
    dimension: 1,
    solvent: 'C6D6',
    solventRaw: 'BENZENE-D6',
    experiment: 'proton.jxp',
    freqMHz: 400,
    scans: 8,
    decoupled: null,
    temperatureC: 26,
    processed: true,
    lastModified: patch.measuredAt,
    size: 1000,
    ...patch,
  } as ExperimentMeta;
}

const list: ExperimentMeta[] = [
  meta({ title: 'B-sample', measuredAt: day(1, 10) }),
  meta({ title: 'A-sample', measuredAt: day(1, 15) }),
  // 別の日の、あとから Delta で処理して保存したもの
  meta({ title: 'C-sample', measuredAt: day(3, 9), lastModified: day(9, 20) }),
];

describe('一覧の並び替え', () => {
  it('測定日: 新しい日から。日の中は新しい測定から', () => {
    const groups = groupList(list, { key: 'date', desc: true });
    expect(groups.map((g) => g.day)).toEqual(['2026-09-03', '2026-09-01']);
    expect(groups[1].samples.map((s) => s.sampleKey)).toEqual(['A-sample', 'B-sample']);
  });

  it('測定日の昇順: 古い日から', () => {
    const groups = groupList(list, { key: 'date', desc: false });
    expect(groups.map((g) => g.day)).toEqual(['2026-09-01', '2026-09-03']);
    expect(groups[0].samples.map((s) => s.sampleKey)).toEqual(['B-sample', 'A-sample']);
  });

  it('名前: 日でまとめず、1つの並びにする', () => {
    const asc = groupList(list, { key: 'name', desc: false });
    expect(asc).toHaveLength(1);
    expect(asc[0].day).toBeNull();
    expect(asc[0].samples.map((s) => s.sampleKey)).toEqual(['A-sample', 'B-sample', 'C-sample']);
    const desc = groupList(list, { key: 'name', desc: true });
    expect(desc[0].samples.map((s) => s.sampleKey)).toEqual(['C-sample', 'B-sample', 'A-sample']);
  });

  it('編集順: 保存した日時が新しいものから (測定は古くても上に来る)', () => {
    const groups = groupList(list, { key: 'modified', desc: true });
    expect(groups[0].samples.map((s) => s.sampleKey)).toEqual(['C-sample', 'A-sample', 'B-sample']);
  });
});

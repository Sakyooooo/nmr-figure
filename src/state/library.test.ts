import { describe, expect, it } from 'vitest';
import type { ExperimentMeta } from '../lib/jdfMeta';
import { baseOfJson, groupList, groupMeasurements, listedFiles, unlistedFigures } from './library';

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

describe('このソフトで編集して保存した版 (図)', () => {
  const fid = meta({ title: 'S', measuredAt: day(5, 10), fileName: 'S_19F-1-1.jdf', nuclei: ['19F'], processed: false });
  // データフォルダの図入りの .jdf (パラメーターは元の FID の .jdf を写したものなので、タイトル・測定時刻・核種が同じ)
  const figureFile = meta({ title: 'S', measuredAt: day(5, 10), fileName: 'S_19F-1-1_図.jdf', nuclei: ['19F'], figure: { layers: 1, nuclei: ['19F'] }, lastModified: day(5, 12) });
  const saved = (id: string, fileName: string, base: string | null, savedAt = day(5, 11)) => ({
    id,
    name: fileName.replace(/\.[^.]+$/, ''),
    fileName,
    base: base ? { fileName: base } : null,
    sampleKeys: ['S'],
    nuclei: ['19F'],
    layers: 2,
    savedAt,
    json: '{}',
  });

  it('図入りの .jdf は元の測定の版にまとまり、一番に出る (札は 1 つで「2 版」)', () => {
    const [m] = groupMeasurements([fid, figureFile]);
    expect(m.files.map((f) => f.fileName)).toEqual(['S_19F-1-1_図.jdf', 'S_19F-1-1.jdf']);
    expect(m.main.figure).toBeTruthy();
  });

  it('ブラウザに残した図も、土台の .jdf の測定の版になる。同じ名前の図入りの .jdf がフォルダにあればそちらだけ', () => {
    const figures = [saved('a', '比較.nmrfig', 'S_19F-1-1.jdf'), saved('b', 'S_19F-1-1_図.jdf', 'S_19F-1-1.jdf'), saved('c', '別.nmrfig', 'ない.jdf')];
    const files = listedFiles({ experiments: [fid, figureFile], figures });
    const [m] = groupMeasurements(files);
    expect(m.files.map((f) => f.fileName)).toEqual(['S_19F-1-1_図.jdf', '比較.nmrfig', 'S_19F-1-1.jdf']);
    const version = m.files.find((f) => f.savedFigureId === 'a')!;
    expect(version.baseKey).toBe(fid.key);
    expect(version.figure).toEqual({ layers: 2, nuclei: ['19F'] });
    // 元の測定がフォルダにない図だけ、カードに図のまま出す
    expect(unlistedFigures({ experiments: [fid, figureFile], figures }).map((f) => f.id)).toEqual(['c']);
  });

  it('図の中身から土台の .jdf の名前を読む (古い図の補い)', () => {
    const doc = {
      plot2d: null,
      spectra: [
        { id: 's1', fileName: 'top.jdf', simulated: null },
        { id: 's2', fileName: 'bottom.jdf', simulated: null },
      ],
      layers: [
        { id: 'l1', spectrumId: 's1', visible: true },
        { id: 'l2', spectrumId: 's2', visible: true },
      ],
    };
    expect(baseOfJson(JSON.stringify({ doc }))).toEqual({ fileName: 'bottom.jdf' });
    expect(baseOfJson('壊れた')).toBe(null);
  });
});

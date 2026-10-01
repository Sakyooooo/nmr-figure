import { describe, expect, it } from 'vitest';
import { findWordFigureFile, newWordFigureId, wordFigureName, wordFigureUrl } from '../lib/wordFigureLink';

describe('Word に貼る図', () => {
  it('写しの名前は「図の名前_id」で、ファイル名に使えない文字は _ にする', () => {
    expect(wordFigureName('35-wo+diyne_Proton-1-4_図.jdf', 'ab12cd34')).toBe('35-wo+diyne_Proton-1-4_図_ab12cd34');
    expect(wordFigureName('a/b:c?.nmrfig', '00ff00ff')).toBe('a_b_c__00ff00ff');
    expect(wordFigureName('', '00ff00ff')).toBe('figure_00ff00ff');
  });

  it('id は 16 進 8 字', () => {
    expect(newWordFigureId()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('リンクは今のアプリの場所に ?word=<id> を付けたもの (前の ?・# は外す)', () => {
    expect(wordFigureUrl('ab12cd34', 'https://sakyooooo.github.io/nmr-figure/?demo=1#x')).toBe('https://sakyooooo.github.io/nmr-figure/?word=ab12cd34');
    expect(wordFigureUrl('ab12cd34', 'http://localhost:5180/')).toBe('http://localhost:5180/?word=ab12cd34');
  });

  it('Word図 フォルダから id の写し (.nmrfig) を探す (同じ名前の .svg や、ほかの id は選ばない)', () => {
    const names = ['A_ab12cd34.svg', 'A_ab12cd34.nmrfig', 'B_00000000.nmrfig'];
    expect(findWordFigureFile(names, 'ab12cd34')).toBe('A_ab12cd34.nmrfig');
    expect(findWordFigureFile(names, 'ffffffff')).toBeNull();
  });
});

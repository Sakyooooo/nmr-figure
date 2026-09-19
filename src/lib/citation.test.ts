import { describe, expect, it } from 'vitest';
import { formatAuthors, shortCitation, tidyCitation } from './citation';

const FORM = 'Tsurugi, H. et al. *{J. Am. Chem. Soc.} **{2024}, *{146}, 1234.';

describe('引用を整える', () => {
  it('論文サイトからそのまま貼った形 (表題つき・号つき)', () => {
    const t = tidyCitation('Tsurugi, H.; Mashima, K. Salt-Free Reduction of Transition Metal Complexes. J. Am. Chem. Soc. 2024, 146 (3), 1234–1240.');
    expect(t.formatted).toBe(true);
    expect(t.text).toBe(FORM);
    expect(t.parts).toMatchObject({ authors: 'Tsurugi, H. et al.', journal: 'J. Am. Chem. Soc.', year: '2024', volume: '146' });
  });

  it('PDF から貼った形 (文献番号・改行・行末ハイフン・DOI の URL)', () => {
    const t = tidyCitation(`(12) Tsurugi, H.; Mashima, K. Salt-Free Reduc-
tion of Transition Metal Complexes. Journal of the
American Chemical Society 2024, 146, 1234.
https://doi.org/10.1021/jacs.4c01234`);
    // DOI は図に出さない (読み取りはしている)
    expect(t.text).toBe('Tsurugi, H. et al. *{J. Am. Chem. Soc.} **{2024}, *{146}, 1234.');
    expect(t.parts.doi).toBe('10.1021/jacs.4c01234');
  });

  it('Wiley 式 (頭文字が先・論文番号)', () => {
    const t = tidyCitation('H. Tsurugi, K. Mashima, Angew. Chem. Int. Ed. 2024, 63, e202400123.');
    expect(t.text).toBe('Tsurugi, H. et al. *{Angew. Chem., Int. Ed.} **{2024}, *{63}, e202400123.');
  });

  it('PubMed 式 (点なしの略号・セミコロン・doi:)', () => {
    const t = tidyCitation('Smith JA, Jones B, Brown C. Total synthesis of xyz. J Am Chem Soc. 2024;146(3):1234-1240. doi:10.1021/jacs.4c01234');
    expect(t.text).toBe('Smith, J. A. et al. *{J. Am. Chem. Soc.} **{2024}, *{146}, 1234.');
  });

  it('表にない誌名でも、著者と分けられる', () => {
    const t = tidyCitation('Smith, J.; Jones, B. Org. Biomol. Chem. 2024, 22, 100-110.');
    expect(t.parts.journal).toBe('Org. Biomol. Chem.');
    expect(t.parts.authors).toBe('Smith, J. et al.');
  });

  it('表にない誌名でも、語をまとめて拾う', () => {
    const t = tidyCitation('Harris, R. K. et al. Pure Appl. Chem. 2001, 73, 1795.');
    expect(t.text).toBe('Harris, R. K. et al. *{Pure Appl. Chem.} **{2001}, *{73}, 1795.');
  });

  it('頁が論文番号でも読める', () => {
    const t = tidyCitation('A. Author, B. Author, C. Author, Science 2022, 375, eabc1234.');
    expect(t.text).toBe('Author, A. et al. *{Science} **{2022}, *{375}, eabc1234.');
  });

  it('整えた文をもう一度整えても変わらない', () => {
    const once = tidyCitation('Tsurugi, H.; Mashima, K. J. Am. Chem. Soc. 2024, 146 (3), 1234-1240. https://doi.org/10.1021/jacs.4c01234');
    const twice = tidyCitation(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.changed).toBe(false);
  });

  it('頁は最初の頁だけにして、点で閉じる', () => {
    const t = tidyCitation('Tsurugi, H.; Mashima, K. Chem. Sci. 2023, 14, 1234-1240.');
    expect(t.parts.pages).toBe('1234');
    expect(t.text.endsWith('*{14}, 1234.')).toBe(true);
  });


  it('論文サイトの Cite をまるごと貼った形 (表題・綴りのままの著者・責任著者の印・(年) 巻 (号): 頁)', () => {
    const t = tidyCitation(
      'C-H Activation and Proton Transfer Initiate Alkene Metathesis Activity of the Tungsten(IV)-Oxo Complex ' +
        "Ka Wing Chan; Erwin Lam; Vincenza D'Anna; Florian Allouche; Carine Michel; Olga V. Safonova; Philippe Sautet; " +
        'Christophe Copéret * Author & Article Information Journal American Chemical Society (2018) 140 (36): 11395-11401.',
    );
    // 号 (36) ではなく巻 (140) を取る
    expect(t.text).toBe('Chan, K. W. et al. *{J. Am. Chem. Soc.} **{2018}, *{140}, 11395.');
  });

  it('綴りのままの著者 (of the が抜けた誌名・責任著者の印)', () => {
    const t = tidyCitation(
      "Ka Wing Chan; Erwin Lam; Christophe Copéret * Journal American Chemical Society 2018, 140, 11395-11401.",
    );
    expect(t.text).toBe('Chan, K. W. et al. *{J. Am. Chem. Soc.} **{2018}, *{140}, 11395.');
  });

  it('正式名の of / the が抜けていても誌名を引ける', () => {
    expect(tidyCitation('Smith, J. Journal American Chemical Society 2020, 142, 1.').parts.journal).toBe('J. Am. Chem. Soc.');
    expect(tidyCitation('Smith, J. Journal of the American Chemical Society 2020, 142, 1.').parts.journal).toBe('J. Am. Chem. Soc.');
  });

  it('DOI だけ貼っても形になる', () => {
    expect(tidyCitation('https://doi.org/10.1021/jacs.4c01234').text).toBe('DOI: 10.1021/jacs.4c01234');
    expect(tidyCitation('10.1021/jacs.4c01234').text).toBe('DOI: 10.1021/jacs.4c01234');
  });

  it('著者が 1人なら et al. を付けない', () => {
    const t = tidyCitation('Tsurugi, H. Nature 2024, 630, 100.');
    expect(t.text).toBe('Tsurugi, H. *{Nature} **{2024}, *{630}, 100.');
  });

  it('余分な空白と改行だけの乱れも直す', () => {
    const t = tidyCitation('  Smith,  J.;  Jones,  B.\n  Chem. Sci.  2023,  14,\n 55.  ');
    expect(t.text).toBe('Smith, J. et al. *{Chem. Sci.} **{2023}, *{14}, 55.');
  });

  it('読み取れない文は、消さずにそのまま残す', () => {
    const t = tidyCitation('有機合成化学協会誌 2024, 82, 123.');
    expect(t.formatted).toBe(false);
    expect(t.text).toBe('有機合成化学協会誌 2024, 82, 123.');
  });

  it('空のときは空', () => {
    expect(tidyCitation('   ').text).toBe('');
  });

  it('短い形は「著者 年」', () => {
    expect(shortCitation('Tsurugi, H.; Mashima, K. J. Am. Chem. Soc. 2024, 146, 1234.')).toBe('Tsurugi 2024');
    expect(shortCitation('H. Tsurugi, K. Mashima, Angew. Chem. Int. Ed. 2024, 63, e202400123.')).toBe('Tsurugi 2024');
  });
});

describe('著者の形', () => {
  it('いろいろな書き方から「姓, 頭文字」を作る', () => {
    expect(formatAuthors('Tsurugi, H.; Mashima, K.')).toBe('Tsurugi, H. et al.');
    expect(formatAuthors('Tsurugi, H.')).toBe('Tsurugi, H.');
    expect(formatAuthors('H. Tsurugi, K. Mashima')).toBe('Tsurugi, H. et al.');
    expect(formatAuthors('Smith JA, Jones B')).toBe('Smith, J. A. et al.');
    expect(formatAuthors('Tsurugi et al.')).toBe('Tsurugi et al.');
    expect(formatAuthors('J.-P. Dupont, K. Mashima')).toBe('Dupont, J.-P. et al.');
    expect(formatAuthors('')).toBe('');
  });
});

/**
 * 引用元の文を、図に出す形に整える。
 * 論文のサイトや PDF から貼ると形がばらばらなので、ACS の書き方
 * 「Tsurugi, H. et al. *{J. Am. Chem. Soc.} **{2024}, *{146}, 1234.」に直す
 * (誌名と巻は斜体、年は太字、頁は最初の頁だけ。DOI は図に出さない)。
 * 読み取れないときは、改行や余分な空白だけ直して、貼った文をそのまま使う (勝手に消さない)。
 */

import { plainText } from './richText';

export interface CitationParts {
  /** 「Tsurugi, H. et al.」 */
  authors: string;
  /** 「J. Am. Chem. Soc.」 */
  journal: string;
  year: string;
  volume: string;
  /** 最初の頁 または 論文番号 (e202400123 など) */
  pages: string;
  doi: string;
  /** DOI がないときの URL */
  url: string;
}

export interface TidyCitation {
  /** 図に出す文 */
  text: string;
  parts: CitationParts;
  /** 貼った文から変わったか */
  changed: boolean;
  /** 形を作り直せたか (false なら空白と改行を直しただけ) */
  formatted: boolean;
}

const EMPTY: CitationParts = { authors: '', journal: '', year: '', volume: '', pages: '', doi: '', url: '' };

/** 誌名。正式名 → 図に出す略号 (略号そのものも下で鍵に足す) */
const JOURNAL_NAMES: Record<string, string> = {
  'journal of the american chemical society': 'J. Am. Chem. Soc.',
  jacs: 'J. Am. Chem. Soc.',
  'jacs au': 'JACS Au',
  'angewandte chemie international edition': 'Angew. Chem., Int. Ed.',
  'angewandte chemie international edition in english': 'Angew. Chem., Int. Ed.',
  'angew chem int ed engl': 'Angew. Chem., Int. Ed.',
  'angewandte chemie': 'Angew. Chem.',
  'chemical science': 'Chem. Sci.',
  'chemical communications': 'Chem. Commun.',
  'chemistry a european journal': 'Chem. Eur. J.',
  'chemistry an asian journal': 'Chem. Asian J.',
  'nature chemistry': 'Nat. Chem.',
  'nature catalysis': 'Nat. Catal.',
  'nature communications': 'Nat. Commun.',
  'nature synthesis': 'Nat. Synth.',
  'nature reviews chemistry': 'Nat. Rev. Chem.',
  nature: 'Nature',
  science: 'Science',
  'science advances': 'Sci. Adv.',
  'organic letters': 'Org. Lett.',
  'the journal of organic chemistry': 'J. Org. Chem.',
  'inorganic chemistry': 'Inorg. Chem.',
  'inorganic chemistry frontiers': 'Inorg. Chem. Front.',
  'organic chemistry frontiers': 'Org. Chem. Front.',
  'dalton transactions': 'Dalton Trans.',
  'chemical reviews': 'Chem. Rev.',
  'chemical society reviews': 'Chem. Soc. Rev.',
  'accounts of chemical research': 'Acc. Chem. Res.',
  'acs catalysis': 'ACS Catal.',
  'acs central science': 'ACS Cent. Sci.',
  'acs omega': 'ACS Omega',
  'rsc advances': 'RSC Adv.',
  'journal of catalysis': 'J. Catal.',
  'european journal of inorganic chemistry': 'Eur. J. Inorg. Chem.',
  'european journal of organic chemistry': 'Eur. J. Org. Chem.',
  'tetrahedron letters': 'Tetrahedron Lett.',
  tetrahedron: 'Tetrahedron',
  organometallics: 'Organometallics',
  synthesis: 'Synthesis',
  synlett: 'Synlett',
  macromolecules: 'Macromolecules',
  langmuir: 'Langmuir',
  biochemistry: 'Biochemistry',
  polyhedron: 'Polyhedron',
  molecules: 'Molecules',
  joule: 'Joule',
  matter: 'Matter',
  chem: 'Chem',
  'advanced materials': 'Adv. Mater.',
  'advanced synthesis and catalysis': 'Adv. Synth. Catal.',
  'green chemistry': 'Green Chem.',
  'journal of organometallic chemistry': 'J. Organomet. Chem.',
  'coordination chemistry reviews': 'Coord. Chem. Rev.',
  'journal of magnetic resonance': 'J. Magn. Reson.',
  'magnetic resonance in chemistry': 'Magn. Reson. Chem.',
  'journal of fluorine chemistry': 'J. Fluorine Chem.',
  'organic process research and development': 'Org. Process Res. Dev.',
  'beilstein journal of organic chemistry': 'Beilstein J. Org. Chem.',
  'chemistry letters': 'Chem. Lett.',
  'bulletin of the chemical society of japan': 'Bull. Chem. Soc. Jpn.',
  'proceedings of the national academy of sciences': 'Proc. Natl. Acad. Sci. U. S. A.',
  'proceedings of the national academy of sciences of the united states of america': 'Proc. Natl. Acad. Sci. U. S. A.',
  pnas: 'Proc. Natl. Acad. Sci. U. S. A.',
  'the journal of physical chemistry a': 'J. Phys. Chem. A',
  'the journal of physical chemistry b': 'J. Phys. Chem. B',
  'the journal of physical chemistry c': 'J. Phys. Chem. C',
  'the journal of chemical physics': 'J. Chem. Phys.',
  'journal of the chemical society dalton transactions': 'J. Chem. Soc., Dalton Trans.',
  'helvetica chimica acta': 'Helv. Chim. Acta',
  'inorganica chimica acta': 'Inorg. Chim. Acta',
  chirality: 'Chirality',
  heterocycles: 'Heterocycles',
  nanoscale: 'Nanoscale',
  analyst: 'Analyst',
  polymer: 'Polymer',
  catalysts: 'Catalysts',
  inorganics: 'Inorganics',
  crystengcomm: 'CrystEngComm',
  chemcatchem: 'ChemCatChem',
  chemsuschem: 'ChemSusChem',
  chempluschem: 'ChemPlusChem',
  chemistryopen: 'ChemistryOpen',
};

/** 誌名の引き方 (「J. Am. Chem. Soc.」「J Am Chem Soc」どちらでも引ける) */
const JOURNALS = new Map<string, string>();
for (const [full, short] of Object.entries(JOURNAL_NAMES)) {
  JOURNALS.set(journalKey(full), short);
  JOURNALS.set(journalKey(short), short);
}

/** 略号の語。点を落として貼られたときに戻す */
const ABBREV_WORDS = new Set(
  ('j am chem soc int ed org lett inorg commun eur nat phys rev sci catal mater polym biol med res acc adv synth chim acta ann bull ' +
    'proc natl acad angew jpn technol anal appl theor comput struct cryst magn reson electrochem photochem spectrosc organomet coord ' +
    'front process dev trans engl'
  ).split(' '),
);

/** 誌名によく出る、略さない語 (表にない誌名をうしろから拾うときに使う。姓と紛れる語は入れない) */
const JOURNAL_WORDS = new Set(
  ('chemistry chemical chem journal letters reviews review research advanced communications materials catalysis synthesis synlett ' +
    'organometallics tetrahedron polyhedron macromolecules biochemistry molecules american national academy sciences science nature ' +
    'european international edition asian frontiers transactions accounts bulletin helvetica chimica acta monatshefte zeitschrift ' +
    'omega pure applied physical organic inorganic analytical biological medicinal record reports topics annual computational ' +
    'theoretical structural crystal energy environmental surface technology engineering'
  ).split(' '),
);

/** 表を引くための鍵 (小文字にして、点とカンマを落とす) */
function journalKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,:;'"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    // 「of」「the」は落とす (論文サイトからの貼り付けで抜けていることがある)
    .split(' ')
    .filter((w) => w !== 'of' && w !== 'the')
    .join(' ');
}

/** 記号と空白を、ふつうの形に直す */
export function cleanCitation(raw: string): string {
  return raw
    .replace(/\r/g, '\n')
    .replace(/([a-zA-Z])-\s*\n\s*([a-z])/g, '$1$2') // PDF の行末で切れた語をつなぐ
    .replace(/\s*\n\s*/g, ' ')
    .replace(/[   ]/g, ' ')
    .replace(/[“”„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[‐-―−]/g, '-')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/\s+/g, ' ')
    .replace(/^[[(]?\s*\d{1,3}\s*[\]).]\s+/, '') // 先頭の文献番号 (12) / [12] / 12.
    .trim();
}

/** 年・巻・頁。書き方がいくつかあるので、順に当てる */
function findNumbers(text: string): { year: string; volume: string; pages: string; at: number } | null {
  // 2024, 146, 1234-1240 / 2024;146(3):1234-40 / 2024, 63, e202400123
  const acs = /\b((?:19|20)\d{2})\s*[,;]\s*(\d{1,4})\s*(?:\([^)]{1,15}\))?(?:\s*[,:;]\s*([A-Za-z]{0,5}\d[\w-]*))?/.exec(text);
  if (acs) return { year: acs[1], volume: acs[2], pages: acs[3] ?? '', at: acs.index };
  // (2024) 630, 100-105 / (2018) 140 (36): 11395-11401 ← 論文サイトの「Cite」の形。(36) は号なので飛ばす
  const paren = /\(\s*((?:19|20)\d{2})\s*\)\s*,?\s*(\d{1,4})\s*(?:\(\s*\d{1,4}\s*\))?\s*[,:]\s*([A-Za-z]{0,5}\d[\w-]*)/.exec(text);
  if (paren) return { year: paren[1], volume: paren[2], pages: paren[3], at: paren.index };
  // vol. 146, no. 3, pp. 1234-1240, 2024
  const ieee = /vol\.?\s*(\d{1,4})\b[\s\S]{0,30}?pp?\.?\s*([\w-]+)/i.exec(text);
  if (ieee) {
    const year = /\b((?:19|20)\d{2})\b/.exec(text);
    if (year) return { year: year[1], volume: ieee[1], pages: ieee[2], at: Math.min(ieee.index, year.index) };
  }
  // 巻や頁がない (年だけ書いてある)
  const years = [...text.matchAll(/\b((?:19|20)\d{2})\b(?!\s*-\s*\d)/g)];
  const last = years[years.length - 1];
  if (last) return { year: last[1], volume: '', pages: '', at: last.index };
  return null;
}

/** 誌名らしい語か (「Soc.」「ACS」「A」など) */
function looksJournalWord(token: string): boolean {
  const word = token.replace(/[,;:]+$/, '');
  if (/^[A-Z][A-Za-z&'-]{0,5}\.$/.test(word)) return true;
  if (/^[A-Z]{2,5}\.?$/.test(word)) return true;
  if (/^[A-Z]$/.test(word) || word === '&') return true;
  const bare = word.replace(/\.$/, '').toLowerCase();
  return JOURNAL_WORDS.has(bare) || ABBREV_WORDS.has(bare);
}

/** 年より前の部分を、著者と誌名に分ける (あいだに表題があれば落ちる) */
function findJournal(pre: string): { journal: string; authors: string } {
  const tokens = [...pre.matchAll(/\S+/g)].map((m) => ({ text: m[0], at: m.index }));
  // まず表を引く (うしろから長く取る)
  for (let n = Math.min(12, tokens.length); n >= 1; n--) {
    const slice = tokens.slice(tokens.length - n);
    const name = JOURNALS.get(journalKey(slice.map((t) => t.text).join(' ')));
    if (!name) continue;
    // 手前にも略号が続いていれば、誌名の途中で引いてしまっている (「Org. Biomol. Chem.」の Chem. など)
    const before = tokens[tokens.length - n - 1]?.text.replace(/[,;:]+$/, '');
    if (before && looksJournalWord(before) && !/^[A-Z]\.$/.test(before)) continue;
    return { journal: name, authors: pre.slice(0, slice[0].at).trim() };
  }
  // 表になければ、うしろから誌名らしい語を拾う
  let start = tokens.length;
  while (start > 0 && looksJournalWord(tokens[start - 1].text)) start--;
  // 拾いすぎて著者の頭文字 (「…Jones, B.」の B.) まで入ったら、そこは著者に返す
  while (start > 0 && start < tokens.length - 1 && /^[A-Z]\.$/.test(tokens[start].text.replace(/[,;:]+$/, '')) && /[,;]$/.test(tokens[start - 1].text)) start++;
  const slice = tokens.slice(start);
  // 1語だけのときは、著者の一部を誌名と見まちがえている見込みが高いのでやめる
  if (slice.length >= 2) return { journal: tidyJournal(slice.map((t) => t.text).join(' ')), authors: pre.slice(0, slice[0].at).trim() };
  return { journal: '', authors: pre };
}

/** 点を落として書かれた略号に、点を戻す (J Am Chem Soc → J. Am. Chem. Soc.) */
function tidyJournal(text: string): string {
  return text
    .replace(/\s*,\s*$/, '')
    .split(' ')
    .map((word) => {
      const bare = word.replace(/[.,;:]+$/, '');
      if (ABBREV_WORDS.has(bare.toLowerCase()) && !word.includes('.')) return `${bare}.${word.slice(bare.length)}`;
      return word;
    })
    .join(' ')
    .trim();
}

const NAME = "[A-Z][A-Za-z\\u00c0-\\u024f'-]*";
const INITIALS = '(?:[A-Z]\\.\\s*-?\\s*)+';

/** 名前の頭文字を「J. A.」の形にする */
function initialsText(raw: string): string {
  const groups =
    raw
      .replace(/[^A-Za-z-]/g, '')
      .toUpperCase()
      .match(/[A-Z](?:-[A-Z])*/g) ?? [];
  return groups
    .map((g) =>
      g
        .split('-')
        .map((c) => `${c}.`)
        .join('-'),
    )
    .join(' ');
}

/** 著者を「Tsurugi, H. et al.」の形にする。読めなければ '' */
export function formatAuthors(region: string): string {
  // 責任著者の印 (*, †, ‡ など) は外す
  const text = region
    .replace(/[*†‡§¶]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  const many = /\bet\s*al/i.test(text) || text.includes(';');
  // 「;」で区切ってあれば、最初の 1人だけ見る
  const head = text.includes(';') ? text.slice(0, text.indexOf(';')).trim() : text;
  const patterns: { re: RegExp; surname: number; initials: number }[] = [
    { re: new RegExp(`^(${NAME}(?:\\s+${NAME})?)\\s*,\\s*(${INITIALS})`), surname: 1, initials: 2 }, // Tsurugi, H.
    { re: new RegExp(`^(${INITIALS})(${NAME})`), surname: 2, initials: 1 }, // H. Tsurugi
    { re: new RegExp(`^(${NAME})\\s+([A-Z]{1,3})(?=[,;.]|\\s|$)`), surname: 1, initials: 2 }, // Tsurugi H
    { re: new RegExp(`^(${NAME})\\s*,?\\s*(?=et\\s*al)`, 'i'), surname: 1, initials: 0 }, // Tsurugi et al.
    { re: new RegExp(`^(${NAME})\\s+(${NAME})\\s*(?=,|;|&|and\\s|et\\s*al)`), surname: 2, initials: 1 }, // Hayato Tsurugi
  ];
  // 「;」区切りなら、最初の区切りの終わりが著者名。表題が前に付いていても取れる
  if (text.includes(';')) {
    const spelled = spelledName(head, many, true);
    if (spelled) return spelled;
  }
  for (const { re, surname, initials } of patterns) {
    const m = re.exec(head);
    if (!m) continue;
    const rest = head.slice(m[0].length) || text.slice(head.length);
    const more = many || /^[\s.,;&]*(et\s*al|and\b)/i.test(rest) || /^\s*[;&]/.test(rest) || /^\s*,\s*(and\s+)?[A-Z]/.test(rest);
    const name = m[surname].trim();
    const heads = initials ? initialsText(m[initials]) : '';
    return `${heads ? `${name}, ${heads}` : name}${more ? ' et al.' : ''}`;
  }

  return spelledName(head, many, text.includes(';') || head.split(' ').length <= 4);
}

/**
 * 読み取った中身から、図に出す 1行を作る。
 * ACS の書き方に合わせて、誌名と巻は斜体 *{..}、年は太字 **{..}、頁は最初の頁だけ書いて「.」で閉じる。
 * DOI と URL は図には出さない (読み取った中身としては parts に残る)。
 */
export function formatCitation(p: CitationParts): string {
  const head = [p.authors, p.journal && `*{${p.journal}}`].filter(Boolean).join(' ');
  const numbers = [p.year && `**{${p.year}}`, p.volume && `*{${p.volume}}`, p.pages].filter(Boolean).join(', ');
  const text = [head, numbers].filter(Boolean).join(' ');
  return text ? `${text}.` : '';
}

/** 貼られた引用を整える。読み取れないときは、貼った文をそのまま残す */
export function tidyCitation(raw: string): TidyCitation {
  // 書式 (*{..} など) を付けたままの文。読み取れなかったときはこれをそのまま出す
  const cleaned = cleanCitation(raw);
  // 読み取りは書式を外した文で行う (整えた文をもう一度整えても変わらないように)
  const plain = cleanCitation(plainText(raw));
  if (!plain) return { text: '', parts: { ...EMPTY }, changed: raw.trim() !== '', formatted: false };

  let rest = plain;
  const doiMatch = /\b(10\.\d{4,9}\/[^\s"'<>]+)/.exec(rest);
  const doi = doiMatch ? doiMatch[1].replace(/[.,;:)\]]+$/, '') : '';
  if (doiMatch) {
    // 「https://doi.org/」「doi:」ごと外す
    const head = rest.slice(0, doiMatch.index).replace(/(?:https?:\/\/)?(?:dx\.)?(?:www\.)?doi\.org\/$|\bdoi\s*:?\s*$/i, '');
    rest = `${head} ${rest.slice(doiMatch.index + doi.length)}`.replace(/\s+/g, ' ').trim();
  }
  const urlMatch = /https?:\/\/[^\s<>"']+/.exec(rest);
  const url = !doi && urlMatch ? urlMatch[0].replace(/[.,;]+$/, '') : '';
  if (urlMatch) rest = rest.replace(urlMatch[0], ' ').replace(/\s+/g, ' ').trim();

  const numbers = findNumbers(rest);
  const pre = (numbers ? rest.slice(0, numbers.at) : rest).replace(/[\s,;:(\[]+$/, '').trim();
  const { journal, authors } = findJournal(pre);
  const parts: CitationParts = {
    authors: formatAuthors(authors),
    journal,
    year: numbers?.year ?? '',
    volume: numbers?.volume ?? '',
    // 最初の頁だけ書く (ACS の書き方)
    pages: (numbers?.pages ?? '').split(/[-–—]/)[0],
    doi,
    url,
  };
  if (parts.journal && parts.year) {
    const text = formatCitation(parts);
    return { text, parts, changed: text !== raw.trim(), formatted: true };
  }
  if (doi && !parts.journal && !parts.year) {
    // 誌名も年も読めず DOI だけのときは、手がかりを消さずに残す
    const text = rest ? `${rest} DOI: ${doi}` : `DOI: ${doi}`;
    return { text, parts, changed: text !== raw.trim(), formatted: false };
  }
  return { text: cleaned, parts, changed: cleaned !== raw.trim(), formatted: false };
}

/** スペクトル名の横に出す短い形 (「Tsurugi 2024」) */
export function shortCitation(raw: string): string {
  const { parts } = tidyCitation(raw);
  const surname = parts.authors ? parts.authors.split(/[,\s]/)[0] : (/^([A-Za-zÀ-ɏ'-]+)/.exec(cleanCitation(raw))?.[1] ?? '');
  const year = parts.year || /\b(?:19|20)\d{2}\b/.exec(raw)?.[0] || '';
  return [surname, year].filter(Boolean).join(' ') || cleanCitation(raw).slice(0, 20);
}

/**
 * 「Ka Wing Chan」のように綴りのまま並ぶ名前を「Chan, K. W.」にする。
 * 論文サイトの「Cite」は表題が前に付くので、うしろから名前らしい語を最大 3 語だけ取る。
 */
function spelledName(head: string, many: boolean, allow: boolean): string {
  if (!allow) return '';
  const words = head.split(' ');
  const spelled = new RegExp(`^${NAME}$`);
  const name: string[] = [];
  for (let i = words.length - 1; i >= 0 && name.length < 3; i--) {
    if (!spelled.test(words[i])) break;
    name.unshift(words[i]);
  }
  if (name.length < 2) return '';
  const family = name[name.length - 1];
  const heads = initialsText(name.slice(0, -1).map((w) => w[0]).join(''));
  return `${family}, ${heads}${many ? ' et al.' : ''}`;
}

// NMR図編集ソフト — デザインシステムを Figma に組み立てるプラグイン (開発用。Figma デスクトップで実行)
// 何度実行してもよい: 前に作ったページ・変数・スタイル (下の名前のもの) を消してから作り直す。
// 対応表: Figma の変数名の "/" を "-" にしたものが CSS 変数名 (例: color/text/secondary → --color-text-secondary)
// docs/design/01-audit-and-direction.md の 7 章が元の定義。

const RUN = { done: [], errors: [] };
async function step(name, fn) {
  try {
    const r = await fn();
    RUN.done.push(name);
    return r;
  } catch (e) {
    RUN.errors.push(`${name}: ${e && e.message ? e.message : String(e)}`);
    return null;
  }
}

// ------------------------------------------------------------------ 値
function hex(h) {
  const s = h.replace('#', '');
  return { r: parseInt(s.slice(0, 2), 16) / 255, g: parseInt(s.slice(2, 4), 16) / 255, b: parseInt(s.slice(4, 6), 16) / 255 };
}
function rgba(h, a) {
  const c = hex(h);
  return { r: c.r, g: c.g, b: c.b, a };
}

const PRIMITIVES = {
  'gray/0': '#FFFFFF',
  'gray/25': '#FAFBFC',
  'gray/50': '#F4F5F7',
  'gray/100': '#ECEEF1',
  'gray/150': '#E2E5E9',
  'gray/200': '#D3D8DE',
  'gray/300': '#B4BBC4',
  'gray/400': '#858D99',
  'gray/500': '#646C78',
  'gray/600': '#4F5661',
  'gray/700': '#3B414B',
  'gray/800': '#282D34',
  'gray/900': '#1A1E23',
  'blue/50': '#EDF3FD',
  'blue/100': '#DCE8FB',
  'blue/200': '#BAD0F6',
  'blue/600': '#1A6FD6',
  'blue/700': '#1559B0',
  'blue/800': '#114890',
  'green/50': '#E8F5EC',
  'green/700': '#1B7340',
  'amber/50': '#FFF3DC',
  'amber/700': '#8A5100',
  'red/50': '#FDECEA',
  'red/600': '#C4271C',
  'red/700': '#B42318',
  'purple/50': '#F2EDFB',
  'purple/700': '#5B3AA6',
  // ダークモードだけで使う色 (SEMANTIC_DARK)
  'gray/350': '#9098A3',
  'gray/850': '#22262C',
  'gray/925': '#16191D',
  'gray/950': '#111317',
  'blue/300': '#7EB2F7',
  'blue/400': '#4D95F0',
  'blue/900': '#22406A',
  'blue/950': '#1A2F4D',
  'green/300': '#5FC98A',
  'green/950': '#16291E',
  'amber/300': '#F2B45A',
  'amber/950': '#2E2512',
  'red/300': '#F1877D',
  'red/950': '#3A1C1A',
  'purple/300': '#B69CF2',
  'purple/950': '#251E3B',
};

const BG = ['FRAME_FILL', 'SHAPE_FILL'];
const TX = ['TEXT_FILL'];
const ST = ['STROKE_COLOR'];
const BG_ST = ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR'];
const ANY_COLOR = ['FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR'];

// [名前, 元の色, 使い道, 説明]
const SEMANTIC = [
  ['color/bg/canvas', 'gray/100', BG, 'キャンバス (図の後ろ) とホームの背景'],
  ['color/bg/surface', 'gray/0', BG, 'パネル・ツールバー・ステータスバー'],
  ['color/bg/raised', 'gray/0', BG, 'メニュー・ダイアログ・通知 (影と組み合わせる)'],
  ['color/bg/subtle', 'gray/50', BG, '表の見出し・ツールのまとまり・無効な入力欄'],
  ['color/bg/hover', 'gray/100', BG, 'ホバーした行・ボタン'],
  ['color/bg/selected', 'blue/50', BG, '選択中の行・ツール・チップ'],
  ['color/bg/inverse', 'gray/800', BG, 'ツールチップ'],
  ['color/text/primary', 'gray/900', TX, '本文。どの背景でも 14:1 以上'],
  ['color/text/secondary', 'gray/600', TX, '補足・ラベル。どの背景でも 6:1 以上'],
  ['color/text/tertiary', 'gray/500', TX, '単位・件数・プレースホルダー。どの背景でも 4.5:1 以上'],
  ['color/text/disabled', 'gray/300', TX, '無効な文字だけ (コントラストの例外)'],
  ['color/text/on-accent', 'gray/0', TX, '主色の上の文字'],
  ['color/text/accent', 'blue/700', TX, '選択中の文字・リンク (薄い青の上でも 6:1)'],
  ['color/text/inverse', 'gray/0', TX, '暗い背景の上の文字'],
  ['color/border/subtle', 'gray/150', ST, '区切り線 (飾り)'],
  ['color/border/default', 'gray/200', ST, 'パネル・紙の縁'],
  ['color/border/control', 'gray/400', ST, '入力欄・チェックの境界。3:1 以上'],
  ['color/border/focus', 'blue/600', ST, 'フォーカスの輪'],
  ['color/accent/default', 'blue/600', BG_ST, '一番の操作 (1 画面に 1 つ)・選択の印'],
  ['color/accent/hover', 'blue/700', BG_ST, '主色のホバー'],
  ['color/accent/pressed', 'blue/800', BG_ST, '主色を押しているとき'],
  ['color/accent/subtle', 'blue/100', BG, '選択中のホバー'],
  ['color/danger/default', 'red/600', BG_ST, '取り消せない操作の確認ボタン'],
  ['color/danger/text', 'red/700', TX, '削除などの文字'],
  ['color/status/success/fg', 'green/700', ANY_COLOR, '成功・同期中'],
  ['color/status/success/bg', 'green/50', BG, ''],
  ['color/status/warning/fg', 'amber/700', ANY_COLOR, '注意・許可が必要'],
  ['color/status/warning/bg', 'amber/50', BG, ''],
  ['color/status/error/fg', 'red/700', ANY_COLOR, 'エラー'],
  ['color/status/error/bg', 'red/50', BG, ''],
  ['color/status/info/fg', 'blue/700', ANY_COLOR, 'お知らせ'],
  ['color/status/info/bg', 'blue/50', BG, ''],
  ['color/status/literature/fg', 'purple/700', ANY_COLOR, '文献値から作図したスペクトルの印'],
  ['color/status/literature/bg', 'purple/50', BG, ''],
  ['color/icon/default', 'gray/600', ANY_COLOR, 'アイコン'],
  ['color/icon/subtle', 'gray/500', ANY_COLOR, '目立たせないアイコン (開閉の矢印など)'],
];

// ダークモードの元の色 (Figma では Color の 2 つ目のモード Dark。アプリは設定の「画面の色」)。
// 本文はどの背景でも 11:1 以上、補足 5:1 以上、単位など 4.5:1 以上、入力欄の境界 3:1 以上。
// 主色 (ボタン) はライトと同じ (白い文字で 4.9:1)。図の中身 (Data) と紙は変えない
const SEMANTIC_DARK = {
  'color/bg/canvas': 'gray/950',
  'color/bg/surface': 'gray/900',
  'color/bg/raised': 'gray/850',
  'color/bg/subtle': 'gray/925',
  'color/bg/hover': 'gray/800',
  'color/bg/selected': 'blue/950',
  'color/bg/inverse': 'gray/150',
  'color/text/primary': 'gray/100',
  'color/text/secondary': 'gray/300',
  'color/text/tertiary': 'gray/350',
  'color/text/disabled': 'gray/600',
  'color/text/on-accent': 'gray/0',
  'color/text/accent': 'blue/300',
  'color/text/inverse': 'gray/900',
  'color/border/subtle': 'gray/800',
  'color/border/default': 'gray/700',
  'color/border/control': 'gray/400',
  'color/border/focus': 'blue/400',
  'color/accent/default': 'blue/600',
  'color/accent/hover': 'blue/700',
  'color/accent/pressed': 'blue/800',
  'color/accent/subtle': 'blue/900',
  'color/danger/default': 'red/600',
  'color/danger/text': 'red/300',
  'color/status/success/fg': 'green/300',
  'color/status/success/bg': 'green/950',
  'color/status/warning/fg': 'amber/300',
  'color/status/warning/bg': 'amber/950',
  'color/status/error/fg': 'red/300',
  'color/status/error/bg': 'red/950',
  'color/status/info/fg': 'blue/300',
  'color/status/info/bg': 'blue/950',
  'color/status/literature/fg': 'purple/300',
  'color/status/literature/bg': 'purple/950',
  'color/icon/default': 'gray/300',
  'color/icon/subtle': 'gray/350',
};

// 図 (中身) の色。UI には使わない。値はアプリの今の既定のまま (Word / PowerPoint との互換を確かめてあるため)
const DATA = [
  ['data/paper', '#FFFFFF', '図の紙 (ダークモードでも白のまま。Word / PowerPoint に貼る図と同じ見た目)'],
  ['data/spectrum/1', '#1F9E1F', 'スペクトル 1 本目 (Delta と同じ緑)'],
  ['data/spectrum/2', '#1F4FD1', ''],
  ['data/spectrum/3', '#D12B2B', ''],
  ['data/spectrum/4', '#8A2BD1', ''],
  ['data/spectrum/5', '#D17A00', ''],
  ['data/spectrum/6', '#0F8C8C', ''],
  ['data/literature', '#8A2BD1', '文献値から作図したスペクトル'],
  ['data/ink', '#000000', '軸・目盛り・ピーク値・積分'],
  ['data/marker/1', '#C0392B', 'マーカー (6 色)'],
  ['data/marker/2', '#2E86C1', ''],
  ['data/marker/3', '#117A65', ''],
  ['data/marker/4', '#7D3C98', ''],
  ['data/marker/5', '#D68910', ''],
  ['data/marker/6', '#0B2A4A', ''],
];

const SPACING = [2, 4, 8, 12, 16, 24, 32, 48];
// 画面の字体: 前の版と同じ (英数字は Segoe UI、日本語は Yu Gothic UI)。本人の指定 (2026-09-23)
const FONT_UI = "'Segoe UI', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
// 文字 (13px 未満は使わない。太さは regular / bold の 2 つ)。本文は前の版と同じ 13px。[名前, 太さ, 大きさ, 行の高さ, 説明]
const TYPE = [
  ['Type/Title', 'bold', 16, 24, 'ホームの見出し・ダイアログの題 (--type-title)'],
  ['Type/Heading', 'bold', 13, 20, '区画の見出し (--type-heading)'],
  ['Type/Body', 'regular', 13, 20, '本文・ボタン・入力。基準 (--type-body)'],
  ['Type/Body Strong', 'bold', 13, 20, '本文の強調 (--type-body-strong)'],
  ['Type/Label', 'regular', 13, 18, 'ラベル・表・補足。下限の大きさ。本文とは色 (secondary / tertiary) で分ける (--type-label)'],
  ['Type/Label Strong', 'bold', 13, 18, 'ラベルの強調 (--type-label-strong)'],
  ['Type/Numeric', 'regular', 13, 18, 'ppm・積分値の数字。コードでは font-variant-numeric: tabular-nums (--type-numeric)'],
];
// 影。[名前, [[x, y, ぼかし, 広がり, 色, 濃さ], …], 説明]
const EFFECTS = [
  ['Elevation/1', [[0, 1, 2, 0, '#101828', 0.06], [0, 4, 12, 0, '#101828', 0.1]], 'メニュー・ツールチップ・通知・浮かぶパネル (--elevation-1)'],
  ['Elevation/2', [[0, 2, 6, 0, '#101828', 0.08], [0, 12, 32, 0, '#101828', 0.18]], 'ダイアログ (--elevation-2)'],
  ['Focus/Ring', [[0, 0, 0, 2, '#FFFFFF', 1], [0, 0, 0, 4, '#1A6FD6', 1]], 'フォーカスの輪: 2px の隙間 + 2px の主色 (コードでは outline 2px + offset 2px)'],
];
// ダークモードの影 (暗い背景では濃くしないと見えない)。Figma のスタイルにはモードがないのでコードだけ
const EFFECTS_DARK = [
  ['Elevation/1', [[0, 1, 2, 0, '#000000', 0.3], [0, 4, 12, 0, '#000000', 0.45]]],
  ['Elevation/2', [[0, 2, 6, 0, '#000000', 0.35], [0, 12, 32, 0, '#000000', 0.6]]],
  ['Focus/Ring', [[0, 0, 0, 2, '#1A1E23', 1], [0, 0, 0, 4, '#4D95F0', 1]]],
];
const RADIUS = [
  ['radius/sm', 4, '入力欄・チップ・バッジ'],
  ['radius/md', 6, 'ボタン・メニュー'],
  ['radius/lg', 10, 'ダイアログ'],
  ['radius/full', 999, 'トグルのつまみ・丸いチップだけ'],
];
const SIZE = [
  ['size/control/sm', 28, '小さい操作部品 (パネルの中)'],
  ['size/control/md', 32, '標準の操作部品'],
  ['size/control/lg', 40, 'タッチ用 (最小の押せる大きさ)'],
  ['size/icon/sm', 16, ''],
  ['size/icon/md', 20, ''],
  ['size/toolbar', 44, 'ツールバーの高さ'],
  ['size/statusbar', 28, 'ステータスバーの高さ'],
  ['size/panel/left', 260, '左パネル (スペクトルの一覧)'],
  ['size/panel/right', 320, '右パネル (インスペクター)'],
];
const MOTION = [
  ['motion/duration/fast', 120, 'ホバー・押す'],
  ['motion/duration/normal', 200, '開閉・パネル・通知'],
];

// ------------------------------------------------------------------ 作ったもの
const V = {};
const STYLE = {};
const EFFECT = {};
const ICON = {};
const SET = {};
const KEY = {};
let UI;
let FIG;

function cssName(n) {
  return '--' + n.replace(/\//g, '-');
}

function paint(token) {
  const v = V[token];
  if (!v) throw new Error(`変数がありません: ${token}`);
  return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', v);
}
function fill(n, token) {
  n.fills = token ? [paint(token)] : [];
}
function stroke(n, token, w = 1) {
  n.strokes = [paint(token)];
  n.strokeWeight = w;
  n.strokeAlign = 'INSIDE';
}
function strokeSides(n, token, sides) {
  n.strokes = [paint(token)];
  n.strokeAlign = 'INSIDE';
  n.strokeTopWeight = sides.top || 0;
  n.strokeRightWeight = sides.right || 0;
  n.strokeBottomWeight = sides.bottom || 0;
  n.strokeLeftWeight = sides.left || 0;
}
function num(n, field, t) {
  if (typeof t === 'number') n[field] = t;
  else {
    if (!V[t]) throw new Error(`変数がありません: ${t}`);
    n.setBoundVariable(field, V[t]);
  }
}
function pad(n, p) {
  const [t, r, b, l] = p.length === 2 ? [p[0], p[1], p[0], p[1]] : p;
  num(n, 'paddingTop', t);
  num(n, 'paddingRight', r);
  num(n, 'paddingBottom', b);
  num(n, 'paddingLeft', l);
}
function radius(n, t) {
  for (const f of ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius']) num(n, f, t);
}

/** auto layout の枠 */
function box(dir, name, o = {}) {
  const f = figma.createFrame();
  f.name = name;
  f.layoutMode = dir;
  f.primaryAxisSizingMode = 'AUTO';
  f.counterAxisSizingMode = 'AUTO';
  f.fills = [];
  f.clipsContent = false;
  if (o.gap !== undefined) num(f, 'itemSpacing', o.gap);
  if (o.pad) pad(f, o.pad);
  if (o.fill) fill(f, o.fill);
  if (o.stroke) stroke(f, o.stroke, o.sw || 1);
  if (o.radius !== undefined) radius(f, o.radius);
  if (o.align) f.counterAxisAlignItems = o.align;
  if (o.justify) f.primaryAxisAlignItems = o.justify;
  return f;
}
/** 大きさを決める (決めない方は中身に合わせる) */
function size(f, w, h) {
  f.resize(Math.max(1, w !== undefined ? w : f.width || 1), Math.max(1, h !== undefined ? h : f.height || 1));
  const horiz = f.layoutMode === 'HORIZONTAL';
  if (f.layoutMode === 'NONE') return;
  f.primaryAxisSizingMode = (horiz ? w !== undefined : h !== undefined) ? 'FIXED' : 'AUTO';
  f.counterAxisSizingMode = (horiz ? h !== undefined : w !== undefined) ? 'FIXED' : 'AUTO';
}
function add(parent, child, o = {}) {
  parent.appendChild(child);
  if (o.fillW) child.layoutSizingHorizontal = 'FILL';
  if (o.fillH) child.layoutSizingVertical = 'FILL';
  return child;
}
function spacer(parent, dir = 'H') {
  const s = figma.createFrame();
  s.name = 'Spacer';
  s.fills = [];
  s.resize(1, 1);
  parent.appendChild(s);
  if (dir === 'H') s.layoutSizingHorizontal = 'FILL';
  else s.layoutSizingVertical = 'FILL';
  return s;
}
function divider(parent, dir = 'V', len = 20) {
  const r = figma.createRectangle();
  r.name = 'Divider';
  r.resize(dir === 'V' ? 1 : len, dir === 'V' ? len : 1);
  fill(r, 'color/border/default');
  parent.appendChild(r);
  return r;
}

async function txt(str, style, color, o = {}) {
  const t = figma.createText();
  t.fontName = UI.regular;
  t.characters = str;
  await t.setTextStyleIdAsync(STYLE[style].id);
  if (color) t.fills = [paint(color)];
  if (o.name) t.name = o.name;
  if (o.width) {
    t.textAutoResize = 'HEIGHT';
    t.resize(o.width, t.height);
  }
  if (o.align) t.textAlignHorizontal = o.align;
  return t;
}
async function figText(str, sizePx, o = {}) {
  const t = figma.createText();
  t.fontName = o.bold ? FIG.bold : FIG.regular;
  t.characters = str;
  t.fontSize = sizePx;
  t.fills = [paint('data/ink')];
  if (o.name) t.name = o.name;
  return t;
}

function recolor(node, token) {
  const vecs = node.findAll((n) => 'strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0);
  for (const v of vecs) v.strokes = [paint(token)];
}

function variant(setName, props) {
  const set = SET[setName];
  if (!set) throw new Error(`部品がありません: ${setName}`);
  const name = Object.entries(props)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const c = set.children.find((n) => n.name === name);
  if (!c) throw new Error(`${setName} に ${name} がありません`);
  return c.createInstance();
}
function setText(inst, setName, prop, value) {
  const k = KEY[`${setName}.${prop}`];
  if (!k) throw new Error(`プロパティがありません: ${setName}.${prop}`);
  inst.setProperties({ [k]: value });
}
function setIcon(inst, setName, icon) {
  const k = KEY[`${setName}.Icon`];
  if (!k || !ICON[icon]) throw new Error(`アイコンを差し替えられません: ${setName} ${icon}`);
  inst.setProperties({ [k]: ICON[icon].id });
}
function setBool(inst, setName, prop, value) {
  const k = KEY[`${setName}.${prop}`];
  if (!k) throw new Error(`プロパティがありません: ${setName}.${prop}`);
  inst.setProperties({ [k]: value });
}
/** 差し替えたアイコンの線の色を、部品の中の色に合わせ直す (差し替えると元の色の上書きが消えるため) */
function iconTone(inst, token) {
  const i = inst.findOne((n) => n.type === 'INSTANCE');
  if (i) recolor(i, token);
}
function hideChild(inst, name) {
  const n = inst.findOne((x) => x.name === name);
  if (n) n.visible = false;
}
async function btn(label, style = 'Secondary', sz = 'Md', icon = null) {
  const b = variant('Button', { Style: style, Size: sz, State: 'Default' });
  setText(b, 'Button', 'Label', label);
  if (icon) {
    setBool(b, 'Button', 'Show icon', true);
    setIcon(b, 'Button', icon);
    iconTone(b, BTN[style].text);
  }
  b.name = `Button: ${label}`;
  return b;
}
function iconBtn(icon, style = 'Ghost', sz = 'Md', state = 'Default', name) {
  const b = variant('IconButton', { Style: style, Size: sz, State: state });
  setIcon(b, 'IconButton', icon);
  iconTone(b, state === 'Disabled' ? 'color/text/disabled' : style === 'Selected' ? 'color/text/accent' : 'color/icon/default');
  b.name = name || `IconButton: ${icon}`;
  return b;
}

function cartesian(axes) {
  let out = [{}];
  for (const [k, vals] of Object.entries(axes)) {
    const next = [];
    for (const o of out) for (const v of vals) next.push(Object.assign({}, o, { [k]: v }));
    out = next;
  }
  return out;
}

/** 部品 (バリアント) を作ってまとめる */
async function variantSet(name, axes, build, o = {}) {
  const comps = [];
  for (const combo of cartesian(axes)) {
    const c = figma.createComponent();
    c.name = Object.entries(combo)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    c.fills = [];
    await build(c, combo);
    comps.push(c);
  }
  const set = figma.combineAsVariants(comps, figma.currentPage);
  set.name = name;
  set.layoutMode = 'HORIZONTAL';
  set.layoutWrap = 'WRAP';
  set.itemSpacing = 16;
  set.counterAxisSpacing = 16;
  set.paddingTop = set.paddingBottom = set.paddingLeft = set.paddingRight = 24;
  set.resize(o.width || 1100, 100);
  set.primaryAxisSizingMode = 'FIXED';
  set.counterAxisSizingMode = 'AUTO';
  set.counterAxisAlignItems = 'CENTER';
  if (o.description) set.description = o.description;
  SET[name] = set;
  return set;
}
function propOn(setName, prop, type, def, apply) {
  const set = SET[setName];
  const key = set.addComponentProperty(prop, type, def);
  KEY[`${setName}.${prop}`] = key;
  for (const c of set.children) apply(c, key);
  return key;
}

// ------------------------------------------------------------------ アイコン (Lucide、ISC ライセンス) と NMR 固有のもの
const ICONS = {
  house:
    '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  'folder-open':
    '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5A5.5 5.5 0 0 0 9.5 20H13"/>',
  pointer:
    '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
  'zoom-in': '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  printer:
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  'panel-left': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  'panel-right': '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  minus: '<path d="M5 12h14"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  refresh:
    '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'circle-check': '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  'circle-x': '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  expand:
    '<path d="m21 21-6-6m6 6v-4.8m0 4.8h-4.8"/><path d="M3 16.2V21m0 0h4.8M3 21l6-6"/><path d="M21 7.8V3m0 0h-4.8M21 3l-6 6"/><path d="M3 7.8V3m0 0h4.8M3 3l6 6"/>',
  'fit-y': '<path d="M12 2v20"/><path d="m8 18 4 4 4-4"/><path d="m8 6 4-4 4 4"/>',
  ellipse: '<circle cx="12" cy="12" r="9"/>',
  rect: '<rect width="18" height="14" x="3" y="5" rx="1"/>',
  arrow: '<path d="M7 17 17 7"/><path d="M8 7h9v9"/>',
  line: '<path d="M5 19 19 5"/>',
  type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
  hexagon:
    '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
  'file-text':
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  'arrow-up': '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  'arrow-down': '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  'eye-off':
    '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  'book-open':
    '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  // NMR 固有 (Lucide と同じ規則: 24 の格子・線 2・丸い端)
  'nmr-peak': '<path d="M3 21h18"/><path d="M5 20h4.5L12 7l2.5 13H19"/><path d="M12 2v2"/>',
  'nmr-integral': '<path d="M3 21h18"/><path d="M4 18c5 0 5.5-1 7.5-5.5S14 5 20 5"/>',
  'nmr-height': '<path d="M2 21h14"/><path d="M4 20h3l2-10 2 10h3"/><path d="M19 4v14"/><path d="m16.5 6.5 2.5-2.5 2.5 2.5"/><path d="m16.5 15.5 2.5 2.5 2.5-2.5"/>',
  'nmr-reference': '<path d="M3 21h18"/><path d="M12 21V4"/><path d="m8 8 4-4 4 4"/>',
  'nmr-region': '<path d="M2 21h20"/><path d="M6 4v14"/><path d="M18 4v14"/><path d="M8 19h2l2-8 2 8h2"/>',
  'nmr-marker': '<path d="M3 21h18"/><path d="M5 20h4l3-9 3 9h4"/><circle cx="12" cy="5" r="2"/>',
  'nmr-spectrum': '<path d="M2 21h20"/><path d="M3 20h3l2-6 2 6h2l3-15 3 15h5"/>',
};

function svgOf(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

// ------------------------------------------------------------------ 1. 掃除と準備
// 無料 (Starter) プランは 1 ファイル 3 ページまで。ページは新しく作らず、前に作ったページ・空のページを使い回す
const PAGES = ['Foundations', 'Components', 'Screens'];
const OLD_PAGES = ['Cover', 'Patterns', '__building']; // 前の版が作ったページ
async function preparePages() {
  const all = figma.root.children.slice();
  for (const p of all) await p.loadAsync();
  const blank = (p) => p.children.length === 0;
  const ours = all.filter((p) => PAGES.includes(p.name) || OLD_PAGES.includes(p.name) || blank(p));
  const pages = {};
  const used = () => Object.values(pages);
  for (const name of PAGES) {
    const p = ours.find((x) => x.name === name && !used().includes(x));
    if (p) pages[name] = p;
  }
  for (const name of PAGES) {
    if (pages[name]) continue;
    const p = ours.find((x) => !used().includes(x));
    if (p) {
      p.name = name;
      pages[name] = p;
      continue;
    }
    try {
      pages[name] = figma.createPage();
      pages[name].name = name;
    } catch (e) {
      throw new Error(`ページが足りません (無料プランは 3 ページまで)。このファイルの中身のあるページを別のファイルに移すか消してから、もう一度実行してください (${e.message})`);
    }
  }
  await figma.setCurrentPageAsync(pages.Foundations);
  for (const p of used()) for (const c of p.children.slice()) c.remove();
  for (const p of ours) if (!used().includes(p) && OLD_PAGES.includes(p.name)) p.remove();
  PAGES.forEach((name, i) => figma.root.insertChild(i, pages[name]));
  return pages;
}

async function prepare() {
  const pages = await preparePages();
  for (const c of await figma.variables.getLocalVariableCollectionsAsync()) {
    if (['Primitives', 'Color', 'Data', 'Spacing', 'Radius', 'Size', 'Motion'].includes(c.name)) c.remove();
  }
  for (const s of await figma.getLocalTextStylesAsync()) if (s.name.startsWith('Type/')) s.remove();
  for (const s of await figma.getLocalEffectStylesAsync()) if (s.name.startsWith('Elevation/') || s.name.startsWith('Focus/')) s.remove();

  const fonts = await figma.listAvailableFontsAsync();
  const has = (family, style) => fonts.some((f) => f.fontName.family === family && f.fontName.style === style);
  const pick = (cands) => {
    for (const [family, r, b] of cands) {
      if (has(family, r) && has(family, b)) return { family, regular: { family, style: r }, bold: { family, style: b } };
    }
    return { family: 'Inter', regular: { family: 'Inter', style: 'Regular' }, bold: { family: 'Inter', style: 'Bold' } };
  };
  // UI: アプリと同じ Yu Gothic UI (Windows の字体。Figma のデスクトップ版で使える)。無ければ Noto Sans JP
  UI = pick([
    ['Yu Gothic UI', 'Regular', 'Bold'],
    ['Noto Sans JP', 'Regular', 'Bold'],
  ]);
  // 図: Times New Roman と同じ幅の Tinos (図の設定の既定に合わせる)
  FIG = pick([
    ['Tinos', 'Regular', 'Bold'],
    ['Noto Serif', 'Regular', 'Bold'],
  ]);
  for (const f of [UI.regular, UI.bold, FIG.regular, FIG.bold, { family: 'Inter', style: 'Regular' }]) await figma.loadFontAsync(f);
  return pages;
}

// ------------------------------------------------------------------ 2. 変数・スタイル
async function foundationsTokens() {
  const col = (name, mode) => {
    const c = figma.variables.createVariableCollection(name);
    c.renameMode(c.modes[0].modeId, mode);
    return { c, m: c.modes[0].modeId };
  };
  const make = (k, name, type, value, scopes, code, desc) => {
    const v = figma.variables.createVariable(name, k.c, type);
    v.setValueForMode(k.m, value);
    v.scopes = scopes;
    if (code) v.setVariableCodeSyntax('WEB', `var(${cssName(name)})`);
    if (desc) v.description = desc;
    V[name] = v;
    return v;
  };

  const prim = col('Primitives', 'Value');
  for (const [n, h] of Object.entries(PRIMITIVES)) make(prim, n, 'COLOR', rgba(h, 1), [], false, '直接は使わない。Color の意味の変数から参照する');

  const color = col('Color', 'Light');
  for (const [n, p, scopes, desc] of SEMANTIC) make(color, n, 'COLOR', figma.variables.createVariableAlias(V[p]), scopes, true, desc);
  // ダークモード。Figma の Starter はコレクションにモードを 1 つしか持てないので、足せなければ Light だけにする (値は SEMANTIC_DARK)
  let dark = null;
  try {
    dark = color.c.addMode('Dark');
  } catch (e) {
    RUN.done.push('Color の Dark モードは Figma のプランの上限で足せませんでした (値は code.js の SEMANTIC_DARK)');
  }
  if (dark) for (const [n] of SEMANTIC) V[n].setValueForMode(dark, figma.variables.createVariableAlias(V[SEMANTIC_DARK[n]]));

  const data = col('Data', 'Value');
  for (const [n, h, desc] of DATA) make(data, n, 'COLOR', rgba(h, 1), ['SHAPE_FILL', 'STROKE_COLOR', 'TEXT_FILL'], true, desc || '図の色 (UI には使わない)');

  const sp = col('Spacing', 'Value');
  for (const s of SPACING) make(sp, `spacing/${s}`, 'FLOAT', s, ['GAP'], true, '');
  const rd = col('Radius', 'Value');
  for (const [n, v, desc] of RADIUS) make(rd, n, 'FLOAT', v, ['CORNER_RADIUS'], true, desc);
  const sz = col('Size', 'Value');
  for (const [n, v, desc] of SIZE) make(sz, n, 'FLOAT', v, ['WIDTH_HEIGHT'], true, desc);
  const mo = col('Motion', 'Value');
  for (const [n, v, desc] of MOTION) make(mo, n, 'FLOAT', v, [], true, `${desc}。prefers-reduced-motion では 0`);

  // 文字 (13px 未満は使わない。太さは N / B の 2 つ)
  for (const [n, weight, fs, lh, desc] of TYPE) {
    const font = weight === 'bold' ? UI.bold : UI.regular;
    const s = figma.createTextStyle();
    s.name = n;
    s.fontName = font;
    s.fontSize = fs;
    s.lineHeight = { unit: 'PIXELS', value: lh };
    s.description = desc;
    STYLE[n] = s;
  }

  const shadow = (x, y, blur, spread, color, a) => ({
    type: 'DROP_SHADOW',
    color: rgba(color, a),
    offset: { x, y },
    radius: blur,
    spread,
    visible: true,
    blendMode: 'NORMAL',
    showShadowBehindNode: false,
  });
  const e = (name, effects, desc) => {
    const s = figma.createEffectStyle();
    s.name = name;
    s.effects = effects;
    s.description = desc;
    EFFECT[name] = s;
  };
  for (const [name, layers, desc] of EFFECTS) e(name, layers.map((l) => shadow(...l)), desc);
}

// ------------------------------------------------------------------ 3. アイコンと部品
async function buildIcons(page) {
  const holder = box('HORIZONTAL', 'Icons', { gap: 'spacing/16', pad: ['spacing/24', 'spacing/24'] });
  holder.layoutWrap = 'WRAP';
  size(holder, 1100, undefined);
  holder.counterAxisSpacing = 16;
  page.appendChild(holder);
  for (const [name, inner] of Object.entries(ICONS)) {
    const f = figma.createNodeFromSvg(svgOf(inner));
    const c = figma.createComponent();
    c.name = `Icon/${name}`;
    c.resize(24, 24);
    c.fills = [];
    c.clipsContent = false;
    for (const ch of [...f.children]) c.appendChild(ch);
    f.remove();
    c.rescale(20 / 24);
    for (const v of c.findAll((n) => 'strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0)) {
      v.strokes = [paint('color/icon/default')];
      v.strokeWeight = 1.75;
    }
    c.description = name.startsWith('nmr-') ? 'NMR 固有 (Lucide と同じ規則で描いたもの)' : `Lucide: ${name}`;
    holder.appendChild(c);
    ICON[name] = c;
  }
  return holder;
}

const BTN = {
  Primary: { fill: 'color/accent/default', hover: 'color/accent/hover', text: 'color/text/on-accent' },
  Secondary: { fill: 'color/bg/surface', hover: 'color/bg/hover', text: 'color/text/primary', stroke: 'color/border/control' },
  Ghost: { fill: null, hover: 'color/bg/hover', text: 'color/text/primary' },
  Danger: { fill: 'color/bg/surface', hover: 'color/status/error/bg', text: 'color/danger/text', stroke: 'color/border/control' },
};

async function buildButton() {
  await variantSet(
    'Button',
    { Style: ['Primary', 'Secondary', 'Ghost', 'Danger'], Size: ['Md', 'Sm'], State: ['Default', 'Hover', 'Disabled'] },
    async (c, { Style, Size, State }) => {
      const s = BTN[Style];
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      c.primaryAxisAlignItems = 'CENTER';
      num(c, 'itemSpacing', Size === 'Md' ? 'spacing/8' : 'spacing/4');
      pad(c, [0, Size === 'Md' ? 'spacing/16' : 'spacing/12']);
      radius(c, 'radius/md');
      let tc = s.text;
      if (State === 'Disabled') {
        fill(c, Style === 'Ghost' ? null : 'color/bg/subtle');
        if (s.stroke) stroke(c, 'color/border/default');
        tc = 'color/text/disabled';
      } else {
        fill(c, State === 'Hover' ? s.hover : s.fill);
        if (s.stroke) stroke(c, s.stroke);
      }
      const icon = ICON.plus.createInstance();
      icon.name = 'Icon';
      if (Size === 'Sm') icon.rescale(0.8);
      recolor(icon, tc);
      icon.visible = false;
      c.appendChild(icon);
      c.appendChild(await txt('ボタン', Size === 'Md' ? 'Type/Body' : 'Type/Label', tc, { name: 'Label' }));
      c.resize(80, Size === 'Md' ? 32 : 28);
      c.primaryAxisSizingMode = 'AUTO';
      c.counterAxisSizingMode = 'FIXED';
      c.setBoundVariable('height', V[Size === 'Md' ? 'size/control/md' : 'size/control/sm']);
    },
    { description: 'ボタン。Primary は 1 画面に 1 つ (その画面で一番やること)。Danger は削除など。Sm はパネルの中で使う' },
  );
  propOn('Button', 'Label', 'TEXT', 'ボタン', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Label').componentPropertyReferences = { characters: k };
  });
  const showKey = SET.Button.addComponentProperty('Show icon', 'BOOLEAN', false);
  KEY['Button.Show icon'] = showKey;
  const iconKey = SET.Button.addComponentProperty('Icon', 'INSTANCE_SWAP', ICON.plus.id);
  KEY['Button.Icon'] = iconKey;
  for (const c of SET.Button.children) {
    c.findOne((n) => n.type === 'INSTANCE' && n.name === 'Icon').componentPropertyReferences = { visible: showKey, mainComponent: iconKey };
  }
}

async function buildIconButton() {
  await variantSet(
    'IconButton',
    { Style: ['Ghost', 'Selected'], Size: ['Lg', 'Md', 'Sm'], State: ['Default', 'Hover', 'Disabled'] },
    async (c, { Style, Size, State }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      c.primaryAxisAlignItems = 'CENTER';
      radius(c, 'radius/md');
      let ic = Style === 'Selected' ? 'color/text/accent' : 'color/icon/default';
      if (State === 'Disabled') {
        fill(c, null);
        ic = 'color/text/disabled';
      } else if (Style === 'Selected') fill(c, State === 'Hover' ? 'color/accent/subtle' : 'color/bg/selected');
      else fill(c, State === 'Hover' ? 'color/bg/hover' : null);
      const icon = ICON.pointer.createInstance();
      icon.name = 'Icon';
      if (Size === 'Sm') icon.rescale(0.8);
      recolor(icon, ic);
      c.appendChild(icon);
      const s = { Lg: 40, Md: 32, Sm: 28 }[Size];
      const token = { Lg: 'size/control/lg', Md: 'size/control/md', Sm: 'size/control/sm' }[Size];
      c.resize(s, s);
      c.primaryAxisSizingMode = 'FIXED';
      c.counterAxisSizingMode = 'FIXED';
      c.setBoundVariable('width', V[token]);
      c.setBoundVariable('height', V[token]);
    },
    { width: 1100, description: 'アイコンだけのボタン。必ずツールチップ (名前とショートカット) と aria-label を付ける。Selected は道具の選択・パネルの開閉の状態。Lg は図の下の道具の帯 (タッチでも押せる 40px)' },
  );
  propOn('IconButton', 'Icon', 'INSTANCE_SWAP', ICON.pointer.id, (c, k) => {
    c.findOne((n) => n.type === 'INSTANCE' && n.name === 'Icon').componentPropertyReferences = { mainComponent: k };
  });
}

async function buildInput() {
  await variantSet(
    'Input',
    { State: ['Default', 'Focus', 'Error', 'Disabled'] },
    async (c, { State }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      num(c, 'itemSpacing', 'spacing/4');
      pad(c, [0, 'spacing/8']);
      radius(c, 'radius/sm');
      fill(c, State === 'Disabled' ? 'color/bg/subtle' : 'color/bg/surface');
      stroke(c, State === 'Focus' ? 'color/border/focus' : State === 'Error' ? 'color/status/error/fg' : State === 'Disabled' ? 'color/border/default' : 'color/border/control');
      c.resize(120, 32);
      c.primaryAxisSizingMode = 'FIXED';
      c.counterAxisSizingMode = 'FIXED';
      c.setBoundVariable('height', V['size/control/md']);
      const v = await txt('7.60', 'Type/Numeric', State === 'Disabled' ? 'color/text/disabled' : 'color/text/primary', { name: 'Value' });
      add(c, v, { fillW: true });
      c.appendChild(await txt('ppm', 'Type/Label', 'color/text/tertiary', { name: 'Unit' }));
      if (State === 'Focus') await c.setEffectStyleIdAsync(EFFECT['Focus/Ring'].id);
    },
    { width: 700, description: '数値と文字の入力欄。単位 (ppm・Hz・%) は右に。Error のときは下に理由を書く' },
  );
  propOn('Input', 'Value', 'TEXT', '7.60', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Value').componentPropertyReferences = { characters: k };
  });
  propOn('Input', 'Unit', 'TEXT', 'ppm', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Unit').componentPropertyReferences = { characters: k };
  });
}

async function buildSelect() {
  await variantSet(
    'Select',
    { State: ['Default', 'Disabled'] },
    async (c, { State }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      num(c, 'itemSpacing', 'spacing/4');
      pad(c, [0, 'spacing/8', 0, 'spacing/12']);
      radius(c, 'radius/sm');
      fill(c, State === 'Disabled' ? 'color/bg/subtle' : 'color/bg/surface');
      stroke(c, State === 'Disabled' ? 'color/border/default' : 'color/border/control');
      c.resize(180, 32);
      c.primaryAxisSizingMode = 'FIXED';
      c.counterAxisSizingMode = 'FIXED';
      c.setBoundVariable('height', V['size/control/md']);
      add(c, await txt('測定日', 'Type/Body', State === 'Disabled' ? 'color/text/disabled' : 'color/text/primary', { name: 'Value' }), { fillW: true });
      const i = ICON['chevron-down'].createInstance();
      i.name = 'Chevron';
      i.rescale(0.8);
      recolor(i, 'color/icon/subtle');
      c.appendChild(i);
    },
    { width: 500, description: '選択肢から選ぶ欄' },
  );
  propOn('Select', 'Value', 'TEXT', '測定日', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Value').componentPropertyReferences = { characters: k };
  });
}

async function buildCheckbox() {
  await variantSet(
    'Checkbox',
    { Checked: ['True', 'False'], State: ['Default', 'Disabled'] },
    async (c, { Checked, State }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      num(c, 'itemSpacing', 'spacing/8');
      const b = box('HORIZONTAL', 'Box', { align: 'CENTER', justify: 'CENTER', radius: 'radius/sm' });
      size(b, 16, 16);
      if (Checked === 'True') {
        fill(b, State === 'Disabled' ? 'color/border/default' : 'color/accent/default');
        const k = ICON.check.createInstance();
        k.rescale(0.7);
        recolor(k, 'color/text/on-accent');
        b.appendChild(k);
      } else {
        fill(b, State === 'Disabled' ? 'color/bg/subtle' : 'color/bg/surface');
        stroke(b, State === 'Disabled' ? 'color/border/default' : 'color/border/control');
      }
      c.appendChild(b);
      c.appendChild(await txt('両端の直線を引く', 'Type/Body', State === 'Disabled' ? 'color/text/disabled' : 'color/text/primary', { name: 'Label' }));
    },
    { width: 800, description: 'チェック。押せる範囲はラベルまで含める (28px 以上の高さ)' },
  );
  propOn('Checkbox', 'Label', 'TEXT', '両端の直線を引く', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Label').componentPropertyReferences = { characters: k };
  });
}

async function buildTab() {
  await variantSet(
    'Tab',
    { Selected: ['True', 'False'] },
    async (c, { Selected }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      c.primaryAxisSizingMode = 'AUTO';
      c.counterAxisSizingMode = 'AUTO';
      pad(c, ['spacing/8', 'spacing/12']);
      // 下線は内側の線 (選択で高さが変わらない)
      if (Selected === 'True') strokeSides(c, 'color/accent/default', { bottom: 2 });
      c.appendChild(await txt('解析', Selected === 'True' ? 'Type/Body Strong' : 'Type/Body', Selected === 'True' ? 'color/text/primary' : 'color/text/secondary', { name: 'Label' }));
    },
    { width: 400, description: 'タブ (インスペクターの 解析 / 図 / データ、キャンバスの スペクトル / 推移グラフ)。選択中は太字と下線の 2 つで示す' },
  );
  propOn('Tab', 'Label', 'TEXT', '解析', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Label').componentPropertyReferences = { characters: k };
  });
}

const TONES = {
  Neutral: ['color/bg/subtle', 'color/text/secondary'],
  Info: ['color/status/info/bg', 'color/status/info/fg'],
  Success: ['color/status/success/bg', 'color/status/success/fg'],
  Warning: ['color/status/warning/bg', 'color/status/warning/fg'],
  Error: ['color/status/error/bg', 'color/status/error/fg'],
  Literature: ['color/status/literature/bg', 'color/status/literature/fg'],
};

async function buildBadge() {
  await variantSet(
    'Badge',
    { Tone: Object.keys(TONES) },
    async (c, { Tone }) => {
      const [bg, fg] = TONES[Tone];
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      c.primaryAxisSizingMode = 'AUTO';
      c.counterAxisSizingMode = 'AUTO';
      pad(c, ['spacing/2', 'spacing/8']);
      radius(c, 'radius/sm');
      fill(c, bg);
      c.appendChild(await txt(Tone === 'Literature' ? '文献値' : Tone === 'Neutral' ? 'FID' : '同期中', 'Type/Label', fg, { name: 'Label' }));
    },
    { width: 700, description: '状態だけに使う印 (同期中・許可が必要・FID・文献値)。絞り込みには Chip を使う' },
  );
  propOn('Badge', 'Label', 'TEXT', '同期中', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Label').componentPropertyReferences = { characters: k };
  });
}

async function buildChip() {
  await variantSet(
    'Chip',
    { Selected: ['True', 'False'] },
    async (c, { Selected }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      pad(c, [0, 'spacing/12']);
      radius(c, 'radius/full');
      fill(c, Selected === 'True' ? 'color/bg/selected' : 'color/bg/surface');
      stroke(c, Selected === 'True' ? 'color/accent/default' : 'color/border/control');
      c.appendChild(await txt('¹H', 'Type/Label', Selected === 'True' ? 'color/text/accent' : 'color/text/primary', { name: 'Label' }));
      c.resize(40, 28);
      c.primaryAxisSizingMode = 'AUTO';
      c.counterAxisSizingMode = 'FIXED';
      c.setBoundVariable('height', V['size/control/sm']);
    },
    { width: 400, description: '絞り込み専用 (核種・タグ)。状態の表示には Badge を使う' },
  );
  propOn('Chip', 'Label', 'TEXT', '¹H', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Label').componentPropertyReferences = { characters: k };
  });
}

async function buildSectionHeader() {
  await variantSet(
    'SectionHeader',
    { Expanded: ['True', 'False'] },
    async (c, { Expanded }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      num(c, 'itemSpacing', 'spacing/8');
      pad(c, [0, 'spacing/8', 0, 'spacing/12']);
      fill(c, 'color/bg/surface');
      strokeSides(c, 'color/border/subtle', { top: 1 });
      const ch = ICON[Expanded === 'True' ? 'chevron-down' : 'chevron-right'].createInstance();
      ch.name = 'Chevron';
      ch.rescale(0.8);
      recolor(ch, 'color/icon/subtle');
      c.appendChild(ch);
      c.appendChild(await txt('積分', 'Type/Heading', 'color/text/primary', { name: 'Title' }));
      c.appendChild(await txt('5', 'Type/Label', 'color/text/tertiary', { name: 'Count' }));
      spacer(c);
      const a = iconBtn('more', 'Ghost', 'Sm', 'Default', 'Action');
      c.appendChild(a);
      c.resize(320, 40);
      c.primaryAxisSizingMode = 'FIXED';
      c.counterAxisSizingMode = 'FIXED';
    },
    { width: 800, description: 'インスペクターの区画の見出し。押すと開閉。件数と、右端に区画の操作 (…) を置ける' },
  );
  propOn('SectionHeader', 'Title', 'TEXT', '積分', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Title').componentPropertyReferences = { characters: k };
  });
  propOn('SectionHeader', 'Count', 'TEXT', '5', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Count').componentPropertyReferences = { characters: k };
  });
  propOn('SectionHeader', 'Show action', 'BOOLEAN', true, (c, k) => {
    c.findOne((n) => n.type === 'INSTANCE' && n.name === 'Action').componentPropertyReferences = { visible: k };
  });
}

async function buildListRow() {
  await variantSet(
    'ListRow',
    { Selected: ['True', 'False'] },
    async (c, { Selected }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      num(c, 'itemSpacing', 'spacing/8');
      pad(c, ['spacing/8', 'spacing/4', 'spacing/8', 'spacing/12']);
      fill(c, Selected === 'True' ? 'color/bg/selected' : 'color/bg/surface');
      const sw = figma.createEllipse();
      sw.name = 'Swatch';
      sw.resize(12, 12);
      fill(sw, 'data/spectrum/1');
      c.appendChild(sw);
      const col = box('VERTICAL', 'Text');
      col.appendChild(await txt('0 h', 'Type/Body', Selected === 'True' ? 'color/text/accent' : 'color/text/primary', { name: 'Name' }));
      col.appendChild(await txt('¹H · 399.8 MHz · C6D6', 'Type/Label', 'color/text/tertiary', { name: 'Meta' }));
      add(c, col, { fillW: true });
      c.appendChild(iconBtn('eye', 'Ghost', 'Sm', 'Default', 'Visibility'));
      c.appendChild(iconBtn('more', 'Ghost', 'Sm', 'Default', 'More'));
      c.resize(260, 52);
      c.primaryAxisSizingMode = 'FIXED';
      c.counterAxisSizingMode = 'AUTO';
    },
    { width: 700, description: 'スペクトルの一覧の 1 行 (色・名前・核種など・表示の切り替え・その他)。選んだものの設定はインスペクターに出す (行の中に入力欄を並べない)' },
  );
  propOn('ListRow', 'Name', 'TEXT', '0 h', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Name').componentPropertyReferences = { characters: k };
  });
  propOn('ListRow', 'Meta', 'TEXT', '¹H · 399.8 MHz · C6D6', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Meta').componentPropertyReferences = { characters: k };
  });
}

async function buildBanner() {
  const icons = { Info: 'info', Success: 'circle-check', Warning: 'alert', Error: 'circle-x' };
  await variantSet(
    'Banner',
    { Tone: ['Info', 'Success', 'Warning', 'Error'] },
    async (c, { Tone }) => {
      const [bg, fg] = TONES[Tone];
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'MIN';
      num(c, 'itemSpacing', 'spacing/8');
      pad(c, ['spacing/12', 'spacing/12']);
      radius(c, 'radius/md');
      fill(c, bg);
      c.resize(400, 60);
      c.primaryAxisSizingMode = 'FIXED';
      c.counterAxisSizingMode = 'AUTO';
      const i = ICON[icons[Tone]].createInstance();
      i.name = 'Icon';
      recolor(i, fg);
      c.appendChild(i);
      const col = box('VERTICAL', 'Text', { gap: 'spacing/2' });
      add(c, col, { fillW: true });
      col.appendChild(await txt('書き込みの許可が必要です', 'Type/Body Strong', 'color/text/primary', { name: 'Title' }));
      const m = await txt('Delta のファイルに書き込むには、データフォルダへの書き込みを許可してください。', 'Type/Label', 'color/text/secondary', { name: 'Message', width: 200 });
      add(col, m, { fillW: true });
    },
    { width: 900, description: '解決するまで消えない知らせ (同期のエラー・許可が必要など)。一時的な知らせは Toast' },
  );
  propOn('Banner', 'Title', 'TEXT', '書き込みの許可が必要です', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Title').componentPropertyReferences = { characters: k };
  });
  propOn('Banner', 'Message', 'TEXT', 'Delta のファイルに書き込むには、データフォルダへの書き込みを許可してください。', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Message').componentPropertyReferences = { characters: k };
  });
}

async function buildSingles(page, x, y) {
  // Toast
  const t = figma.createComponent();
  t.name = 'Toast';
  t.layoutMode = 'HORIZONTAL';
  t.counterAxisAlignItems = 'CENTER';
  num(t, 'itemSpacing', 'spacing/8');
  pad(t, ['spacing/8', 'spacing/8', 'spacing/8', 'spacing/12']);
  radius(t, 'radius/md');
  fill(t, 'color/bg/raised');
  stroke(t, 'color/border/subtle');
  await t.setEffectStyleIdAsync(EFFECT['Elevation/1'].id);
  const ti = ICON['circle-check'].createInstance();
  recolor(ti, 'color/status/success/fg');
  t.appendChild(ti);
  t.appendChild(await txt('ピーク値を 7 本付けました', 'Type/Body', 'color/text/primary', { name: 'Message' }));
  t.appendChild(await btn('元に戻す', 'Ghost', 'Sm'));
  t.appendChild(iconBtn('x', 'Ghost', 'Sm', 'Default', 'Close'));
  t.description = '一時的な知らせ (数秒で消える)。取り消せる操作には「元に戻す」を付ける。エラーには使わない (Banner)';
  t.x = x;
  t.y = y;
  page.appendChild(t);

  // Tooltip
  const tp = figma.createComponent();
  tp.name = 'Tooltip';
  tp.layoutMode = 'HORIZONTAL';
  tp.counterAxisAlignItems = 'CENTER';
  num(tp, 'itemSpacing', 'spacing/8');
  pad(tp, ['spacing/4', 'spacing/8']);
  radius(tp, 'radius/sm');
  fill(tp, 'color/bg/inverse');
  tp.appendChild(await txt('積分', 'Type/Label', 'color/text/inverse', { name: 'Label' }));
  tp.appendChild(await txt('I', 'Type/Label Strong', 'color/text/inverse', { name: 'Shortcut' }));
  tp.description = '名前とショートカット。ホバーとフォーカスで出す (title 属性は使わない)';
  tp.x = x + 440;
  tp.y = y;
  page.appendChild(tp);

  // Menu item
  await variantSet(
    'MenuItem',
    { State: ['Default', 'Hover'] },
    async (c, { State }) => {
      c.layoutMode = 'HORIZONTAL';
      c.counterAxisAlignItems = 'CENTER';
      num(c, 'itemSpacing', 'spacing/8');
      pad(c, [0, 'spacing/12']);
      radius(c, 'radius/sm');
      fill(c, State === 'Hover' ? 'color/bg/hover' : null);
      const i = ICON.download.createInstance();
      i.name = 'Icon';
      i.rescale(0.8);
      recolor(i, 'color/icon/default');
      c.appendChild(i);
      add(c, await txt('SVG で保存', 'Type/Body', 'color/text/primary', { name: 'Label' }), { fillW: true });
      c.appendChild(await txt('Ctrl+E', 'Type/Label', 'color/text/tertiary', { name: 'Shortcut' }));
      c.resize(240, 32);
      c.primaryAxisSizingMode = 'FIXED';
      c.counterAxisSizingMode = 'FIXED';
    },
    { width: 600, description: 'メニューの 1 行 (書き出し・ファイル・図形の選択など)' },
  );
  propOn('MenuItem', 'Label', 'TEXT', 'SVG で保存', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Label').componentPropertyReferences = { characters: k };
  });
  propOn('MenuItem', 'Shortcut', 'TEXT', 'Ctrl+E', (c, k) => {
    c.findOne((n) => n.type === 'TEXT' && n.name === 'Shortcut').componentPropertyReferences = { characters: k };
  });
  propOn('MenuItem', 'Icon', 'INSTANCE_SWAP', ICON.download.id, (c, k) => {
    c.findOne((n) => n.type === 'INSTANCE' && n.name === 'Icon').componentPropertyReferences = { mainComponent: k };
  });
}

// ------------------------------------------------------------------ 4. 図の見本 (キャンバスに置く)
function lor(x, x0, w, h) {
  const d = (x - x0) / w;
  return h / (1 + d * d);
}
function tracePath(width, height, peaks, from = 12, to = -0.5) {
  const parts = [];
  for (let i = 0; i <= width * 2; i++) {
    const px = i / 2;
    const ppm = from + ((to - from) * px) / width;
    let y = 0;
    for (const [p0, w, h] of peaks) y += lor(ppm, p0, w, h);
    parts.push(`${i ? 'L' : 'M'}${px.toFixed(1)} ${(height - Math.min(1, y) * height).toFixed(1)}`);
  }
  return parts.join(' ');
}
async function figure(w, h, count = 3) {
  const paper = figma.createFrame();
  paper.name = 'Figure (図の中身: Data の色・図のフォント)';
  paper.resize(w, h);
  fill(paper, 'color/bg/surface');
  stroke(paper, 'color/border/default');
  paper.clipsContent = true;
  const plotX = 48;
  const plotW = w - 96;
  const traces = [
    [
      [7.15, 0.012, 0.35],
      [7.05, 0.01, 0.2],
      [4.5, 0.02, 0.18],
      [3.67, 0.012, 0.6],
      [3.59, 0.012, 0.45],
      [1.33, 0.01, 0.55],
      [1.32, 0.01, 0.5],
    ],
    [
      [7.15, 0.012, 0.35],
      [6.95, 0.012, 0.25],
      [3.67, 0.012, 0.45],
      [3.41, 0.012, 0.4],
      [3.27, 0.012, 0.7],
      [1.33, 0.01, 0.35],
    ],
    [
      [7.15, 0.012, 0.35],
      [7.76, 0.012, 0.18],
      [7.93, 0.012, 0.2],
      [3.27, 0.012, 0.8],
      [1.45, 0.012, 0.3],
    ],
  ];
  const bandH = Math.floor((h - 110) / count - 14);
  for (let k = 0; k < count; k++) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${plotW}" height="${bandH}" viewBox="0 0 ${plotW} ${bandH}"><path d="${tracePath(plotW, bandH, traces[k])}" fill="none" stroke="#000000" stroke-width="1"/></svg>`;
    const node = figma.createNodeFromSvg(svg);
    node.name = `Spectrum ${k + 1}`;
    for (const v of node.findAll((n) => 'strokes' in n && Array.isArray(n.strokes) && n.strokes.length > 0)) {
      v.strokes = [paint(`data/spectrum/${k + 1}`)];
      v.strokeWeight = 1;
    }
    node.fills = [];
    node.x = plotX;
    node.y = 40 + k * (bandH + 14);
    paper.appendChild(node);
    const label = await figText(['0 h', '6 h', '24 h'][k], 12);
    label.x = plotX + plotW - 40;
    label.y = node.y + 8;
    paper.appendChild(label);
  }
  // 軸
  const axisY = 40 + count * (bandH + 14) + 4;
  const axis = figma.createRectangle();
  axis.name = 'Axis';
  axis.resize(plotW, 1);
  fill(axis, 'data/ink');
  axis.x = plotX;
  axis.y = axisY;
  paper.appendChild(axis);
  const every = plotW < 500 ? 2 : 1;
  for (let p = 12; p >= 0; p -= every) {
    const x = plotX + ((12 - p) / 12.5) * plotW;
    const tick = figma.createRectangle();
    tick.resize(1, 5);
    fill(tick, 'data/ink');
    tick.x = x;
    tick.y = axisY;
    paper.appendChild(tick);
    const t = await figText(`${p}.0`, 11);
    t.x = x - 8;
    t.y = axisY + 8;
    paper.appendChild(t);
  }
  const title = await figText('¹H NMR (400 MHz, C6D6)', 13);
  title.x = w / 2 - 70;
  title.y = axisY + 30;
  paper.appendChild(title);
  // 積分の値 (曲線の上)
  for (const [ppm, v] of [
    [3.67, '4.05'],
    [1.33, '6.04'],
  ]) {
    const x = plotX + ((12 - ppm) / 12.5) * plotW;
    const t = await figText(v, 11);
    t.x = x - 14;
    t.y = 24;
    paper.appendChild(t);
  }
  return paper;
}

// ------------------------------------------------------------------ 5. ページ
async function coverPage(page) {
  const root = box('VERTICAL', 'Cover', { gap: 'spacing/24', pad: ['spacing/48', 'spacing/48'], fill: 'color/bg/surface' });
  size(root, 1200, undefined);
  root.x = 0;
  root.y = 0;
  page.appendChild(root);
  root.appendChild(await txt('NMR図編集ソフト — デザインシステム', 'Type/Title', 'color/text/primary'));
  add(
    root,
    await txt(
      'Delta の測定から、週報・論文の NMR の図を作る道具のための決まり。Figma の変数名の "/" を "-" にしたものが CSS 変数名 (例: color/text/secondary → --color-text-secondary)。図の中身 (スペクトルの色・図のフォント) は Data のコレクションで、UI の決まりとは分ける。',
      'Type/Body',
      'color/text/secondary',
      { width: 1100 },
    ),
    { fillW: true },
  );
  root.appendChild(await txt('原則', 'Type/Heading', 'color/text/primary'));
  const P = [
    ['図が主役', '画面の中心は図。UI は灰色の濃淡で静かにし、色はスペクトルと「選択・一番の操作」にだけ使う'],
    ['作業の順に並べる', '開く → 整える → 解析 (ピーク値・積分) → 仕上げ → 書き出す。パネルとツールバーはこの順'],
    ['密度は高く、字は読める', 'UI の文字は 13px (前の版と同じ。これより小さくしない)。字体は Segoe UI + Yu Gothic UI。コントラストは WCAG AA を必ず満たす'],
    ['同じ役割は同じ見た目', 'トークンと部品だけで作る。新しい色・角丸・影・ボタンの種類は理由を書いて決まりを広げてから'],
    ['いま必要なものだけ見せる', '選択に応じて中身が変わるインスペクター。説明文は常に出さず、必要なときに開ける'],
    ['状態はいつも見える、データは失わない', '保存・Delta 同期・処理中はステータスバーの決まった場所。解決が要るエラーは消えない'],
    ['キーボードでもタッチでも', 'すべての操作にフォーカスとキー操作。押せる大きさは 28px (マウス) / 40px (タッチ) 以上'],
    ['Delta の作法を尊重する', '図の見た目・用語・積分の値は Delta と同じ'],
  ];
  const list = box('VERTICAL', 'Principles', { gap: 'spacing/12' });
  add(root, list, { fillW: true });
  for (let i = 0; i < P.length; i++) {
    const row = box('HORIZONTAL', `Principle ${i + 1}`, { gap: 'spacing/16' });
    add(list, row, { fillW: true });
    const n = await txt(`${i + 1}`, 'Type/Heading', 'color/text/accent');
    n.resize(24, n.height);
    row.appendChild(n);
    const col = box('VERTICAL', 'Text', { gap: 'spacing/2' });
    add(row, col, { fillW: true });
    col.appendChild(await txt(P[i][0], 'Type/Body Strong', 'color/text/primary'));
    add(col, await txt(P[i][1], 'Type/Body', 'color/text/secondary', { width: 900 }), { fillW: true });
  }
  root.appendChild(await txt('ページ', 'Type/Heading', 'color/text/primary'));
  add(
    root,
    await txt(
      'Foundations: この表紙と、色・文字・余白・角丸・影 / Components: 部品と、その組み合わせ (空・読み込み中・エラー・表・メニュー) / Screens: 編集画面・ホーム',
      'Type/Body',
      'color/text/secondary',
      { width: 1100 },
    ),
    { fillW: true },
  );
  return root;
}

async function swatch(parent, name, desc, sub) {
  const row = box('HORIZONTAL', name, { gap: 'spacing/12', align: 'CENTER' });
  add(parent, row, { fillW: true });
  const r = figma.createRectangle();
  r.resize(40, 40);
  radius(r, 'radius/sm');
  fill(r, name);
  stroke(r, 'color/border/subtle');
  row.appendChild(r);
  const col = box('VERTICAL', 'Text');
  add(row, col, { fillW: true });
  col.appendChild(await txt(name, 'Type/Label Strong', 'color/text/primary'));
  add(col, await txt(`${cssName(name)}${sub ? ' · ' + sub : ''}${desc ? ' — ' + desc : ''}`, 'Type/Label', 'color/text/secondary', { width: 300 }), { fillW: true });
}

async function foundationsPage(page) {
  const root = box('HORIZONTAL', 'Foundations', { gap: 'spacing/48', pad: ['spacing/48', 'spacing/48'], fill: 'color/bg/surface' });
  root.counterAxisAlignItems = 'MIN';
  page.appendChild(root);
  // 色
  const colors = box('VERTICAL', 'Color', { gap: 'spacing/8' });
  size(colors, 560, undefined);
  root.appendChild(colors);
  colors.appendChild(await txt('Color (UI)', 'Type/Title', 'color/text/primary'));
  for (const [n, p, , d] of SEMANTIC) await swatch(colors, n, d, p);
  const data = box('VERTICAL', 'Data', { gap: 'spacing/8' });
  size(data, 460, undefined);
  root.appendChild(data);
  data.appendChild(await txt('Data (図の中身。UI に使わない)', 'Type/Title', 'color/text/primary'));
  for (const [n, h, d] of DATA) await swatch(data, n, d, h);
  // 文字・余白・角丸・影
  const other = box('VERTICAL', 'Type & Space', { gap: 'spacing/24' });
  size(other, 620, undefined);
  root.appendChild(other);
  other.appendChild(await txt('Typography', 'Type/Title', 'color/text/primary'));
  for (const s of Object.values(STYLE)) {
    const row = box('VERTICAL', s.name, { gap: 'spacing/2' });
    add(other, row, { fillW: true });
    row.appendChild(await txt('図の見た目を整える 7.262 ppm', s.name, 'color/text/primary'));
    add(row, await txt(`${s.name} · ${s.fontSize}/${s.lineHeight.value} · ${s.fontName.family} ${s.fontName.style} — ${s.description}`, 'Type/Label', 'color/text/tertiary', { width: 560 }), { fillW: true });
  }
  other.appendChild(await txt('Spacing', 'Type/Title', 'color/text/primary'));
  for (const sp of SPACING) {
    const row = box('HORIZONTAL', `spacing/${sp}`, { gap: 'spacing/12', align: 'CENTER' });
    add(other, row, { fillW: true });
    const bar = figma.createRectangle();
    bar.resize(sp, 16);
    bar.setBoundVariable('width', V[`spacing/${sp}`]);
    fill(bar, 'color/accent/default');
    row.appendChild(bar);
    row.appendChild(await txt(`spacing/${sp} · ${sp}px · --spacing-${sp}`, 'Type/Label', 'color/text/secondary'));
  }
  other.appendChild(await txt('Radius', 'Type/Title', 'color/text/primary'));
  const rrow = box('HORIZONTAL', 'Radius', { gap: 'spacing/24' });
  other.appendChild(rrow);
  for (const [n, v, d] of RADIUS) {
    const col = box('VERTICAL', n, { gap: 'spacing/4' });
    rrow.appendChild(col);
    const r = figma.createRectangle();
    r.resize(64, 40);
    radius(r, n);
    fill(r, 'color/bg/selected');
    stroke(r, 'color/accent/default');
    col.appendChild(r);
    col.appendChild(await txt(`${n} ${v === 999 ? '(両端を丸く)' : v + 'px'}`, 'Type/Label', 'color/text/secondary'));
  }
  other.appendChild(await txt('Elevation', 'Type/Title', 'color/text/primary'));
  const erow = box('HORIZONTAL', 'Elevation', { gap: 'spacing/32', pad: ['spacing/16', 'spacing/16'], fill: 'color/bg/canvas', radius: 'radius/md' });
  other.appendChild(erow);
  for (const [n, label] of [
    [null, 'Elevation/0 (影なし)'],
    ['Elevation/1', 'Elevation/1'],
    ['Elevation/2', 'Elevation/2'],
  ]) {
    const card = box('VERTICAL', label, { pad: ['spacing/16', 'spacing/16'], fill: 'color/bg/surface', radius: 'radius/md' });
    if (!n) stroke(card, 'color/border/default');
    size(card, 150, 72);
    if (n) await card.setEffectStyleIdAsync(EFFECT[n].id);
    card.appendChild(await txt(label, 'Type/Label', 'color/text/secondary'));
    erow.appendChild(card);
  }
  add(other, await txt('影は重なるもの (メニュー・通知・ダイアログ) だけ。パネル・カードは背景の差と区切り線で分ける。', 'Type/Label', 'color/text/secondary', { width: 560 }), { fillW: true });
  return root;
}

async function patternsPage(page) {
  const root = box('HORIZONTAL', 'Patterns', { gap: 'spacing/48', pad: ['spacing/48', 'spacing/48'], fill: 'color/bg/canvas' });
  root.counterAxisAlignItems = 'MIN';
  page.appendChild(root);
  const panel = (name, w) => {
    const f = box('VERTICAL', name, { gap: 'spacing/16', pad: ['spacing/24', 'spacing/24'], fill: 'color/bg/surface', radius: 'radius/md' });
    size(f, w, undefined);
    root.appendChild(f);
    return f;
  };
  // 空状態
  const empty = panel('EmptyState', 360);
  empty.counterAxisAlignItems = 'CENTER';
  empty.appendChild(await txt('EmptyState', 'Type/Label', 'color/text/tertiary'));
  const ei = ICON['nmr-spectrum'].createInstance();
  ei.rescale(2);
  recolor(ei, 'color/icon/subtle');
  empty.appendChild(ei);
  empty.appendChild(await txt('スペクトルがありません', 'Type/Heading', 'color/text/primary'));
  empty.appendChild(await txt('.jdf をここにドロップするか、開いてください', 'Type/Body', 'color/text/secondary', { align: 'CENTER' }));
  empty.appendChild(await btn('ファイルを開く', 'Primary', 'Md', 'folder-open'));
  // 読み込み中
  const loading = panel('LoadingState', 360);
  loading.appendChild(await txt('LoadingState', 'Type/Label', 'color/text/tertiary'));
  loading.appendChild(await txt('FID を処理しています…', 'Type/Body', 'color/text/primary'));
  const track = box('HORIZONTAL', 'Progress', { fill: 'color/bg/hover', radius: 'radius/full' });
  add(loading, track, { fillW: true });
  size(track, 312, 4);
  const bar = figma.createRectangle();
  bar.resize(190, 4);
  radius(bar, 'radius/full');
  fill(bar, 'color/accent/default');
  track.appendChild(bar);
  loading.appendChild(await txt('位相の自動補正 · 2/3', 'Type/Label', 'color/text/tertiary'));
  // バナー (エラー)
  const errs = panel('Errors & feedback', 448);
  errs.appendChild(await txt('Banner (消えない) / Toast (消える)', 'Type/Label', 'color/text/tertiary'));
  for (const tone of ['Warning', 'Error']) errs.appendChild(variant('Banner', { Tone: tone }));
  const toast = SET.__toast;
  if (toast) errs.appendChild(toast.createInstance());
  // 表
  const table = panel('DataTable', 360);
  table.appendChild(await txt('DataTable (積分)', 'Type/Label', 'color/text/tertiary'));
  const head = box('HORIZONTAL', 'Head', { pad: ['spacing/4', 'spacing/8'], fill: 'color/bg/subtle' });
  add(table, head, { fillW: true });
  add(head, await txt('範囲 (ppm)', 'Type/Label', 'color/text/secondary'), { fillW: true });
  head.appendChild(await txt('値', 'Type/Label', 'color/text/secondary'));
  const rows = [
    ['7.320 – 7.250', '2.00', false],
    ['4.120 – 4.050', '2.02', false],
    ['3.690 – 3.640', '4.05', true],
    ['2.310 – 2.270', '3.01', false],
    ['1.350 – 1.300', '6.04', false],
  ];
  for (const [r, v, sel] of rows) {
    const row = box('HORIZONTAL', `Row ${r}`, { pad: ['spacing/8', 'spacing/8'], fill: sel ? 'color/bg/selected' : 'color/bg/surface' });
    strokeSides(row, 'color/border/subtle', { bottom: 1 });
    add(table, row, { fillW: true });
    add(row, await txt(r, 'Type/Numeric', 'color/text/primary'), { fillW: true });
    row.appendChild(await txt(v, 'Type/Numeric', sel ? 'color/text/accent' : 'color/text/primary', { align: 'RIGHT' }));
  }
  // メニュー
  const menuWrap = panel('Menu', 280);
  menuWrap.appendChild(await txt('Menu (書き出し)', 'Type/Label', 'color/text/tertiary'));
  const menu = box('VERTICAL', 'Menu', { pad: ['spacing/4', 'spacing/4'], fill: 'color/bg/raised', radius: 'radius/md', stroke: 'color/border/subtle' });
  await menu.setEffectStyleIdAsync(EFFECT['Elevation/1'].id);
  menuWrap.appendChild(menu);
  const items = [
    ['copy', '図をコピー', 'Ctrl+Shift+C', 'Hover'],
    ['download', 'SVG で保存', '', 'Default'],
    ['download', 'PNG で保存', '', 'Default'],
    ['printer', '印刷', 'Ctrl+P', 'Default'],
  ];
  for (const [icon, label, sc, st] of items) {
    const it = variant('MenuItem', { State: st });
    setText(it, 'MenuItem', 'Label', label);
    if (sc) setText(it, 'MenuItem', 'Shortcut', sc);
    else hideChild(it, 'Shortcut');
    setIcon(it, 'MenuItem', icon);
    iconTone(it, 'color/icon/default');
    menu.appendChild(it);
  }
  return root;
}

// ---- 編集画面
async function editorScreen(page, x) {
  // 案 B「図を最大に」: 図が画面いっぱい。一覧と右のパネルは図の上に浮かぶ。道具は図の下の中央 (アプリの App.tsx と同じ置き方)
  const W = 1440;
  const H = 900;
  const root = figma.createFrame();
  root.name = 'Screen/Editor 1D — 1440 (案 B)';
  root.resize(W, H);
  fill(root, 'color/bg/canvas');
  root.clipsContent = true;
  root.x = x;
  root.y = 0;
  page.appendChild(root);
  const floating = async (node) => node.setEffectStyleIdAsync(EFFECT['Elevation/1'].id);
  const kbd = async (label) => {
    const k = box('HORIZONTAL', `Kbd ${label}`, { pad: [0, 'spacing/4'], stroke: 'color/border/default', radius: 'radius/sm', fill: 'color/bg/surface', align: 'CENTER' });
    k.appendChild(await txt(label, 'Type/Label', 'color/text/tertiary'));
    return k;
  };

  // 上の帯: ホーム・一覧の開閉 | 図の名前 (ファイルの操作)・表示の切り替え | 操作を探す | Delta の状態・書き出し・図をコピー・設定・右のパネル
  const tb = box('HORIZONTAL', 'Top bar', { gap: 'spacing/4', pad: [0, 'spacing/8'], fill: 'color/bg/surface', align: 'CENTER' });
  strokeSides(tb, 'color/border/subtle', { bottom: 1 });
  root.appendChild(tb);
  size(tb, W, 44);
  tb.setBoundVariable('height', V['size/toolbar']);
  tb.appendChild(iconBtn('house', 'Ghost', 'Md', 'Default', 'Home'));
  tb.appendChild(iconBtn('panel-left', 'Selected', 'Md', 'Default', 'Toggle spectra ([)'));
  divider(tb);
  const doc = box('VERTICAL', 'File menu (開く・保存・別名で保存・文献値から)', { pad: [0, 'spacing/8'] });
  const dn = box('HORIZONTAL', 'Name', { gap: 'spacing/4', align: 'CENTER' });
  dn.appendChild(await txt('反応追跡_サンプル A', 'Type/Body Strong', 'color/text/primary'));
  const chev = ICON['chevron-down'].createInstance();
  chev.rescale(0.8);
  recolor(chev, 'color/icon/subtle');
  dn.appendChild(chev);
  doc.appendChild(dn);
  doc.appendChild(await txt('保存済み · 自動保存 11:42', 'Type/Label', 'color/text/tertiary'));
  tb.appendChild(doc);
  const seg = box('HORIZONTAL', 'View switch', { gap: 'spacing/2', pad: ['spacing/2', 'spacing/2'], fill: 'color/bg/subtle', radius: 'radius/md' });
  for (const [l, on] of [
    ['スペクトル', true],
    ['推移グラフ', false],
  ]) {
    const b = box('HORIZONTAL', l, { pad: [0, 'spacing/12'], radius: 'radius/sm', align: 'CENTER', fill: on ? 'color/bg/surface' : null });
    size(b, undefined, 28);
    if (on) stroke(b, 'color/border/default');
    b.appendChild(await txt(l, on ? 'Type/Label Strong' : 'Type/Label', on ? 'color/text/primary' : 'color/text/secondary'));
    seg.appendChild(b);
  }
  tb.appendChild(seg);
  spacer(tb);
  const search = box('HORIZONTAL', 'Command search (Ctrl+K)', { gap: 'spacing/8', pad: [0, 'spacing/8', 0, 'spacing/12'], fill: 'color/bg/subtle', stroke: 'color/border/default', radius: 'radius/md', align: 'CENTER' });
  size(search, 280, 32);
  const si = ICON.search.createInstance();
  si.rescale(0.8);
  recolor(si, 'color/icon/subtle');
  search.appendChild(si);
  add(search, await txt('操作を探す', 'Type/Body', 'color/text/tertiary'), { fillW: true });
  search.appendChild(await kbd('Ctrl+K'));
  tb.appendChild(search);
  spacer(tb);
  const sync = box('HORIZONTAL', 'Sync status', { gap: 'spacing/8', pad: [0, 'spacing/12'], fill: 'color/status/success/bg', radius: 'radius/full', align: 'CENTER' });
  size(sync, undefined, 28);
  const dot = figma.createEllipse();
  dot.resize(8, 8);
  fill(dot, 'color/status/success/fg');
  sync.appendChild(dot);
  sync.appendChild(await txt('Delta と同期 11:42', 'Type/Label', 'color/status/success/fg'));
  tb.appendChild(sync);
  tb.appendChild(await btn('書き出し', 'Secondary', 'Md', 'download'));
  tb.appendChild(await btn('図をコピー', 'Primary', 'Md', 'copy'));
  tb.appendChild(iconBtn('settings', 'Ghost', 'Md', 'Default', 'Settings'));
  tb.appendChild(iconBtn('panel-right', 'Selected', 'Md', 'Default', 'Toggle right panel (])'));

  // 図 (紙): 左右のパネルのあいだの真ん中
  const paper = await figure(760, 540);
  paper.x = 314;
  paper.y = 150;
  root.appendChild(paper);

  // 選んだ積分の真上の操作の帯
  const selBar = box('HORIZONTAL', 'Selection bar (積分)', { gap: 'spacing/2', pad: ['spacing/2', 'spacing/4'], fill: 'color/bg/surface', stroke: 'color/border/subtle', radius: 'radius/md', align: 'CENTER' });
  selBar.appendChild(await txt('積分', 'Type/Label Strong', 'color/text/secondary'));
  const sv = variant('Input', { State: 'Default' });
  setText(sv, 'Input', 'Value', '4.05');
  setText(sv, 'Input', 'Unit', 'H');
  sv.resize(96, sv.height);
  selBar.appendChild(sv);
  divider(selBar, 'V', 20);
  selBar.appendChild(iconBtn('trash', 'Ghost', 'Sm', 'Default', 'Delete'));
  selBar.appendChild(iconBtn('x', 'Ghost', 'Sm', 'Default', 'Deselect (Esc)'));
  root.appendChild(selBar);
  await floating(selBar);
  selBar.x = paper.x + 300;
  selBar.y = paper.y + 70;

  // 使い方の一行 (道具を選ぶと出る)
  const hint = box('HORIZONTAL', 'Tool hint', { gap: 'spacing/8', pad: [0, 'spacing/16'], fill: 'color/bg/inverse', radius: 'radius/full', align: 'CENTER' });
  size(hint, undefined, 32);
  hint.appendChild(await txt('積分: 左右にドラッグして範囲を選ぶ · 続けて何本でも ·', 'Type/Label', 'color/text/inverse'));
  const hk = box('HORIZONTAL', 'Kbd Esc', { pad: [0, 'spacing/4'], stroke: 'color/text/tertiary', radius: 'radius/sm', align: 'CENTER' });
  hk.appendChild(await txt('Esc', 'Type/Label', 'color/text/inverse'));
  hint.appendChild(hk);
  hint.appendChild(await txt('で終わる', 'Type/Label', 'color/text/inverse'));
  root.appendChild(hint);
  hint.x = Math.round(694 - hint.width / 2);
  hint.y = 56;

  // 左: スペクトルの一覧 (浮かぶパネル)
  const left = box('VERTICAL', 'Spectra panel', { fill: 'color/bg/surface', stroke: 'color/border/subtle', radius: 'radius/lg' });
  size(left, 260, undefined);
  root.appendChild(left);
  left.x = 12;
  left.y = 56;
  await floating(left);
  const lh = box('HORIZONTAL', 'Header', { gap: 'spacing/8', pad: [0, 'spacing/4', 0, 'spacing/12'], align: 'CENTER' });
  add(left, lh, { fillW: true });
  size(lh, undefined, 44);
  lh.appendChild(await txt('スペクトル', 'Type/Heading', 'color/text/primary'));
  lh.appendChild(await txt('3', 'Type/Label', 'color/text/tertiary'));
  spacer(lh);
  lh.appendChild(iconBtn('plus', 'Ghost', 'Sm', 'Default', 'Add (ファイル / 文献値から作図)'));
  const names = [
    ['0 h', '¹H · C6D6 · 15:42', true],
    ['6 h', '¹H · C6D6 · 21:40', false],
    ['24 h', '¹H · C6D6 · 15:38', false],
  ];
  for (let i = 0; i < names.length; i++) {
    const r = variant('ListRow', { Selected: names[i][2] ? 'True' : 'False' });
    setText(r, 'ListRow', 'Name', names[i][0]);
    setText(r, 'ListRow', 'Meta', names[i][1]);
    const sw = r.findOne((n) => n.name === 'Swatch');
    if (sw) sw.fills = [paint(`data/spectrum/${i + 1}`)];
    add(left, r, { fillW: true });
  }
  const det = box('VERTICAL', 'Selected spectrum', { gap: 'spacing/8', pad: ['spacing/12', 'spacing/12'] });
  strokeSides(det, 'color/border/subtle', { top: 1 });
  add(left, det, { fillW: true });
  for (const [label, value, unit] of [
    ['名前', '0 h', ''],
    ['時間', '0', 'h'],
    ['倍率', '1', ''],
    ['溶媒', 'C6D6', ''],
  ]) {
    const row = box('HORIZONTAL', `Field: ${label}`, { gap: 'spacing/8', align: 'CENTER' });
    add(det, row, { fillW: true });
    const l = await txt(label, 'Type/Label', 'color/text/secondary');
    l.resize(40, l.height);
    row.appendChild(l);
    const inp = label === '溶媒' ? variant('Select', { State: 'Default' }) : variant('Input', { State: 'Default' });
    if (label === '溶媒') setText(inp, 'Select', 'Value', value);
    else {
      setText(inp, 'Input', 'Value', value);
      if (unit) setText(inp, 'Input', 'Unit', unit);
      else hideChild(inp, 'Unit');
    }
    add(row, inp, { fillW: true });
  }

  // 右: インスペクター (解析 / 図 / 記録)
  const right = box('VERTICAL', 'Inspector', { fill: 'color/bg/surface', stroke: 'color/border/subtle', radius: 'radius/lg' });
  right.clipsContent = true;
  size(right, 320, 832);
  root.appendChild(right);
  right.x = W - 12 - 320;
  right.y = 56;
  await floating(right);
  const rt = box('HORIZONTAL', 'Tabs', { gap: 'spacing/4', pad: [0, 'spacing/8'] });
  strokeSides(rt, 'color/border/subtle', { bottom: 1 });
  add(right, rt, { fillW: true });
  for (const [l, s] of [
    ['解析', 'True'],
    ['図', 'False'],
    ['記録', 'False'],
  ]) {
    const t = variant('Tab', { Selected: s });
    setText(t, 'Tab', 'Label', l);
    rt.appendChild(t);
  }
  const sel = box('VERTICAL', 'Selected integral', { gap: 'spacing/12', pad: ['spacing/16', 'spacing/12'], fill: 'color/bg/subtle' });
  strokeSides(sel, 'color/border/subtle', { bottom: 1 });
  add(right, sel, { fillW: true });
  sel.appendChild(await txt('選択中の積分', 'Type/Heading', 'color/text/primary'));
  const rr = box('HORIZONTAL', 'Range', { gap: 'spacing/8', align: 'CENTER' });
  add(sel, rr, { fillW: true });
  for (const v of ['3.690', '3.640']) {
    const inp = variant('Input', { State: v === '3.690' ? 'Focus' : 'Default' });
    setText(inp, 'Input', 'Value', v);
    add(rr, inp, { fillW: true });
  }
  sel.appendChild(await btn('削除', 'Danger', 'Sm'));
  const ih = variant('SectionHeader', { Expanded: 'True' });
  setText(ih, 'SectionHeader', 'Title', '積分');
  setText(ih, 'SectionHeader', 'Count', '5');
  add(right, ih, { fillW: true });
  const ib = box('VERTICAL', 'Integrals', { gap: 'spacing/8', pad: ['spacing/4', 'spacing/12', 'spacing/16', 'spacing/12'] });
  add(right, ib, { fillW: true });
  const actions = box('HORIZONTAL', 'Actions', { gap: 'spacing/8' });
  ib.appendChild(actions);
  actions.appendChild(await btn('自動で積分', 'Secondary', 'Sm'));
  actions.appendChild(await btn('手で引く', 'Secondary', 'Sm'));
  actions.appendChild(await btn('全部消す', 'Danger', 'Sm'));
  const table = box('VERTICAL', 'Table');
  add(ib, table, { fillW: true });
  for (const [r, v, s] of [
    ['7.320 – 7.250', '2.00', false],
    ['4.120 – 4.050', '2.02', false],
    ['3.690 – 3.640', '4.05', true],
    ['2.310 – 2.270', '3.01', false],
    ['1.350 – 1.300', '6.04', false],
  ]) {
    const row = box('HORIZONTAL', `Row ${r}`, { pad: ['spacing/4', 'spacing/8'], fill: s ? 'color/bg/selected' : 'color/bg/surface' });
    strokeSides(row, 'color/border/subtle', { bottom: 1 });
    add(table, row, { fillW: true });
    add(row, await txt(r, 'Type/Numeric', 'color/text/primary'), { fillW: true });
    row.appendChild(await txt(v, 'Type/Numeric', s ? 'color/text/accent' : 'color/text/primary'));
  }
  for (const [t, c] of [
    ['ピーク値', '7'],
    ['不純物の候補', ''],
    ['マーカー・凡例', ''],
    ['SI 用テキスト', ''],
  ]) {
    const h = variant('SectionHeader', { Expanded: 'False' });
    setText(h, 'SectionHeader', 'Title', t);
    if (c) setText(h, 'SectionHeader', 'Count', c);
    else hideChild(h, 'Count');
    add(right, h, { fillW: true });
  }

  // 左下: カーソルの δ・倍率・全体表示・縦を自動
  const zoom = box('HORIZONTAL', 'Zoom control', { gap: 'spacing/2', pad: ['spacing/4', 'spacing/4', 'spacing/4', 'spacing/8'], fill: 'color/bg/surface', stroke: 'color/border/subtle', radius: 'radius/lg', align: 'CENTER' });
  const ro = await txt('δ 7.262 ppm', 'Type/Numeric', 'color/text/tertiary');
  ro.resize(100, ro.height);
  zoom.appendChild(ro);
  zoom.appendChild(iconBtn('minus', 'Ghost', 'Sm', 'Default', 'Zoom out (-)'));
  zoom.appendChild(await txt('86%', 'Type/Label', 'color/text/secondary'));
  zoom.appendChild(iconBtn('plus', 'Ghost', 'Sm', 'Default', 'Zoom in (+)'));
  zoom.appendChild(iconBtn('expand', 'Ghost', 'Sm', 'Default', 'Show all (0)'));
  zoom.appendChild(iconBtn('fit-y', 'Ghost', 'Sm', 'Default', 'Fit height (F)'));
  root.appendChild(zoom);
  zoom.x = 12;
  zoom.y = H - 16 - zoom.height;

  // 下の中央: 元に戻す・やり直す | 道具 (見る | 解析 | 描く)
  const dock = box('HORIZONTAL', 'Dock', { gap: 'spacing/8', align: 'CENTER' });
  const quick = box('HORIZONTAL', 'Undo / Redo', { gap: 'spacing/2', pad: ['spacing/4', 'spacing/4'], fill: 'color/bg/surface', stroke: 'color/border/subtle', radius: 'radius/lg', align: 'CENTER' });
  quick.appendChild(iconBtn('undo', 'Ghost', 'Lg', 'Default', 'Undo (Ctrl+Z)'));
  quick.appendChild(iconBtn('redo', 'Ghost', 'Lg', 'Disabled', 'Redo (Ctrl+Y)'));
  dock.appendChild(quick);
  const tools = box('HORIZONTAL', 'Tools', { gap: 'spacing/2', pad: ['spacing/4', 'spacing/4'], fill: 'color/bg/surface', stroke: 'color/border/subtle', radius: 'radius/lg', align: 'CENTER' });
  const tool = (icon, on, name) => tools.appendChild(iconBtn(icon, on ? 'Selected' : 'Ghost', 'Lg', 'Default', name));
  tool('pointer', false, 'Select (V)');
  tool('zoom-in', false, 'Zoom (Z)');
  tool('nmr-height', false, 'Height (H)');
  divider(tools, 'V', 24);
  tool('nmr-peak', false, 'Peak (P)');
  tool('nmr-integral', true, 'Integral (I)');
  tool('nmr-marker', false, 'Marker (M)');
  tool('nmr-region', false, 'Trend range (G)');
  tool('nmr-reference', false, 'Reference (B)');
  divider(tools, 'V', 24);
  tool('ellipse', false, 'Shapes (O R A L)');
  tool('type', false, 'Text (T)');
  tool('hexagon', false, 'Structure');
  dock.appendChild(tools);
  root.appendChild(dock);
  await floating(quick);
  await floating(tools);
  dock.x = Math.round(694 - dock.width / 2);
  dock.y = H - 16 - dock.height;
  return root;
}

// ---- ホーム
async function homeScreen(page, x) {
  const W = 1440;
  const H = 900;
  const root = box('VERTICAL', 'Screen/Home — 1440', { fill: 'color/bg/surface' });
  size(root, W, H);
  root.clipsContent = true;
  root.x = x;
  root.y = 0;
  page.appendChild(root);

  const hd = box('HORIZONTAL', 'Header', { gap: 'spacing/12', pad: [0, 'spacing/24'], align: 'CENTER' });
  strokeSides(hd, 'color/border/subtle', { bottom: 1 });
  add(root, hd, { fillW: true });
  size(hd, W, 56);
  hd.appendChild(await txt('NMR Figure Editor', 'Type/Title', 'color/text/primary'));
  divider(hd);
  const folder = box('HORIZONTAL', 'Folder', { gap: 'spacing/8', align: 'CENTER' });
  const fi = ICON['folder-open'].createInstance();
  fi.rescale(0.8);
  recolor(fi, 'color/icon/subtle');
  folder.appendChild(fi);
  folder.appendChild(await txt('NMR データ', 'Type/Body', 'color/text/secondary'));
  hd.appendChild(folder);
  hd.appendChild(iconBtn('refresh', 'Ghost', 'Sm', 'Default', 'Rescan'));
  hd.appendChild(await btn('フォルダを変更', 'Ghost', 'Sm'));
  spacer(hd);
  hd.appendChild(await btn('ファイルを開く', 'Secondary', 'Md', 'folder-open'));
  hd.appendChild(await btn('編集中の図に戻る', 'Secondary', 'Md', 'arrow-right'));

  const fb = box('HORIZONTAL', 'Filters', { gap: 'spacing/8', pad: ['spacing/12', 'spacing/24'], align: 'CENTER' });
  strokeSides(fb, 'color/border/subtle', { bottom: 1 });
  add(root, fb, { fillW: true });
  const search = box('HORIZONTAL', 'Search', { gap: 'spacing/8', pad: [0, 'spacing/12'], fill: 'color/bg/surface', stroke: 'color/border/control', radius: 'radius/sm', align: 'CENTER' });
  size(search, 320, 32);
  const si = ICON.search.createInstance();
  si.rescale(0.8);
  recolor(si, 'color/icon/subtle');
  search.appendChild(si);
  search.appendChild(await txt('サンプル名・ファイル名・メモ・タグで検索', 'Type/Body', 'color/text/tertiary'));
  fb.appendChild(search);
  for (const [l, s] of [
    ['¹H', 'True'],
    ['¹³C', 'False'],
    ['¹⁹F', 'False'],
    ['³¹P', 'False'],
    ['2D', 'False'],
  ]) {
    const c = variant('Chip', { Selected: s });
    setText(c, 'Chip', 'Label', l);
    fb.appendChild(c);
  }
  spacer(fb);
  const s1 = variant('Select', { State: 'Default' });
  setText(s1, 'Select', 'Value', '測定日 · 新しい順');
  fb.appendChild(s1);
  const s2 = variant('Select', { State: 'Default' });
  setText(s2, 'Select', 'Value', 'すべての溶媒');
  fb.appendChild(s2);

  const body = box('HORIZONTAL', 'Body');
  add(root, body, { fillW: true, fillH: true });
  const list = box('VERTICAL', 'List', { gap: 'spacing/8', pad: ['spacing/16', 'spacing/24'], fill: 'color/bg/canvas' });
  add(body, list, { fillW: true, fillH: true });
  const dh = box('HORIZONTAL', 'Date', { gap: 'spacing/8', pad: ['spacing/8', 0], align: 'CENTER' });
  dh.appendChild(await txt('2026年4月17日（金）', 'Type/Heading', 'color/text/primary'));
  dh.appendChild(await txt('3 サンプル', 'Type/Label', 'color/text/tertiary'));
  add(list, dh, { fillW: true });
  const group = box('VERTICAL', 'Samples', { fill: 'color/bg/surface', radius: 'radius/md', stroke: 'color/border/default' });
  add(list, group, { fillW: true });
  const sample = async (name, meas, figs, selected, thumb) => {
    const row = box('HORIZONTAL', `Sample: ${name}`, { gap: 'spacing/16', pad: ['spacing/12', 'spacing/16'], fill: selected ? 'color/bg/selected' : 'color/bg/surface', align: 'CENTER' });
    strokeSides(row, 'color/border/subtle', { bottom: 1 });
    add(group, row, { fillW: true });
    if (thumb) {
      const th = box('HORIZONTAL', 'Scheme', { align: 'CENTER', justify: 'CENTER', fill: 'color/bg/subtle', radius: 'radius/sm' });
      size(th, 56, 40);
      const hx = ICON.hexagon.createInstance();
      recolor(hx, 'color/icon/default');
      th.appendChild(hx);
      row.appendChild(th);
    }
    const col = box('VERTICAL', 'Text', { gap: 'spacing/8' });
    add(row, col, { fillW: true });
    col.appendChild(await txt(name, 'Type/Body Strong', selected ? 'color/text/accent' : 'color/text/primary'));
    const items = box('HORIZONTAL', 'Measurements', { gap: 'spacing/8', align: 'CENTER' });
    col.appendChild(items);
    for (const [nuc, time, badge] of meas) {
      const m = box('HORIZONTAL', `Measurement ${nuc} ${time}`, { gap: 'spacing/8', pad: [0, 'spacing/8'], stroke: 'color/border/default', radius: 'radius/sm', fill: 'color/bg/surface', align: 'CENTER' });
      size(m, undefined, 28);
      m.appendChild(await txt(nuc, 'Type/Label Strong', 'color/text/primary'));
      m.appendChild(await txt(time, 'Type/Numeric', 'color/text/tertiary'));
      if (badge) {
        const bd = variant('Badge', { Tone: badge[0] });
        setText(bd, 'Badge', 'Label', badge[1]);
        m.appendChild(bd);
      }
      items.appendChild(m);
    }
    for (const f of figs) {
      const m = box('HORIZONTAL', `Figure ${f}`, { gap: 'spacing/4', pad: [0, 'spacing/8'], radius: 'radius/sm', fill: 'color/bg/subtle', align: 'CENTER' });
      size(m, undefined, 28);
      const fi2 = ICON['file-text'].createInstance();
      fi2.rescale(0.8);
      recolor(fi2, 'color/icon/default');
      m.appendChild(fi2);
      m.appendChild(await txt(f, 'Type/Label', 'color/text/primary'));
      items.appendChild(m);
    }
  };
  await sample('Compound 1 (錯体)', [['¹H', '15:42', ['Neutral', '2 版']], ['³¹P', '15:55', null]], ['図 · ¹H · 2 本'], true, true);
  await sample('Compound 2_thf-d8', [['¹H', '10:12', null], ['¹³C', '10:40', null], ['¹⁹F', '11:02', ['Neutral', 'FID']]], [], false, false);
  await sample('diphenylacetylene_CDCl3', [['¹H', '09:05', null]], [], false, false);

  // 詳細
  const det = box('VERTICAL', 'Detail', { gap: 'spacing/16', pad: ['spacing/24', 'spacing/24'], fill: 'color/bg/surface' });
  strokeSides(det, 'color/border/subtle', { left: 1 });
  body.appendChild(det);
  size(det, 420, undefined);
  det.layoutSizingVertical = 'FILL';
  add(det, await txt('Compound 1 (錯体)', 'Type/Heading', 'color/text/primary', { width: 372 }), { fillW: true });
  const prev = await figure(372, 220, 1);
  prev.name = 'Preview';
  det.appendChild(prev);
  const dl = box('VERTICAL', 'Conditions', { gap: 'spacing/4' });
  add(det, dl, { fillW: true });
  for (const [k, v] of [
    ['核種', '¹H (399.8 MHz)'],
    ['溶媒', 'C6D6'],
    ['測定', '2026-04-17 15:42 · 積算 16'],
    ['ファイル', 'sample_Proton-1.jdf (Delta で処理済み)'],
  ]) {
    const r = box('HORIZONTAL', k, { gap: 'spacing/12' });
    add(dl, r, { fillW: true });
    const kt = await txt(k, 'Type/Label', 'color/text/tertiary');
    kt.resize(64, kt.height);
    r.appendChild(kt);
    add(r, await txt(v, 'Type/Label', 'color/text/primary'), { fillW: true });
  }
  const acts = box('HORIZONTAL', 'Actions', { gap: 'spacing/8' });
  add(det, acts, { fillW: true });
  add(acts, await btn('新しい図で開く', 'Primary', 'Md'), { fillW: true });
  acts.appendChild(await btn('編集中の図に追加', 'Secondary', 'Md'));
  return root;
}

// ------------------------------------------------------------------ 実行
function finish(text) {
  figma.notify(text);
  figma.ui.postMessage({ type: 'done', text });
}

async function main() {
  RUN.done = [];
  RUN.errors = [];
  const pages = await step('掃除と準備', prepare);
  if (!pages) {
    finish(`準備で止まりました: ${RUN.errors.join(' / ')}`);
    return;
  }
  await step('変数・文字・影のスタイル', foundationsTokens);

  // Components のページ: 部品 → パターン
  await figma.setCurrentPageAsync(pages.Components);
  let y = 0;
  const place = async (title, fn) => {
    await step(title, async () => {
      const label = await txt(title, 'Type/Title', 'color/text/primary');
      label.x = 0;
      label.y = y;
      figma.currentPage.appendChild(label);
      y += 40;
      const node = await fn();
      if (node) {
        node.x = 0;
        node.y = y;
        y += node.height + 80;
      }
    });
  };
  await place('Icons (Lucide + NMR)', () => buildIcons(figma.currentPage));
  await place('Button', async () => (await buildButton(), SET.Button));
  await place('IconButton', async () => (await buildIconButton(), SET.IconButton));
  await place('Input', async () => (await buildInput(), SET.Input));
  await place('Select', async () => (await buildSelect(), SET.Select));
  await place('Checkbox', async () => (await buildCheckbox(), SET.Checkbox));
  await place('Tab', async () => (await buildTab(), SET.Tab));
  await place('Badge', async () => (await buildBadge(), SET.Badge));
  await place('Chip', async () => (await buildChip(), SET.Chip));
  await place('SectionHeader', async () => (await buildSectionHeader(), SET.SectionHeader));
  await place('ListRow', async () => (await buildListRow(), SET.ListRow));
  await place('Banner', async () => (await buildBanner(), SET.Banner));
  await place('Toast / Tooltip / MenuItem', async () => {
    await buildSingles(figma.currentPage, 0, y);
    const toast = figma.currentPage.findOne((n) => n.type === 'COMPONENT' && n.name === 'Toast');
    SET.__toast = toast;
    const mi = SET.MenuItem;
    mi.x = 0;
    mi.y = y + 80;
    y += 80;
    return mi;
  });
  y += 80;
  await place('Patterns (空・読み込み中・エラー・表・メニュー)', () => patternsPage(figma.currentPage));

  await figma.setCurrentPageAsync(pages.Screens);
  await step('編集画面', () => editorScreen(pages.Screens, 0));
  await step('ホーム', () => homeScreen(pages.Screens, 1540));

  // Foundations のページ: 表紙 (原則) と組み立ての記録 → 色・文字・余白
  await figma.setCurrentPageAsync(pages.Foundations);
  const cover = await step('表紙', () => coverPage(pages.Foundations));
  await step('Foundations', async () => {
    const f = await foundationsPage(pages.Foundations);
    f.x = 0;
    f.y = (cover ? cover.height : 0) + 120;
  });
  // 組み立ての記録 (Claude が読み返すため)
  await step('記録', async () => {
    const log = box('VERTICAL', 'Build log', { gap: 'spacing/4', pad: ['spacing/16', 'spacing/16'], fill: RUN.errors.length ? 'color/status/error/bg' : 'color/status/success/bg', radius: 'radius/md' });
    size(log, 800, undefined);
    log.x = (cover ? cover.width : 1200) + 80;
    log.y = 0;
    figma.currentPage.appendChild(log);
    log.appendChild(await txt(`組み立ての記録: ${RUN.done.length} 件できた / エラー ${RUN.errors.length} 件 · フォント ${UI.family} / ${FIG.family}`, 'Type/Body Strong', 'color/text/primary'));
    for (const e of RUN.errors) add(log, await txt(e, 'Type/Label', 'color/status/error/fg', { width: 760 }), { fillW: true });
  });
  finish(RUN.errors.length ? `できました (エラー ${RUN.errors.length} 件。Foundations のページの右上の記録を見てください)` : 'できました');
}

// ------------------------------------------------------------------ 確認用の画像 (3 ページを 1 枚にして保存する。Figma の接続を使わずに Claude が見るため)
async function exportPreview() {
  const pages = [];
  for (const name of PAGES) {
    const page = figma.root.children.find((p) => p.name === name);
    if (!page) continue;
    await page.loadAsync();
    figma.ui.postMessage({ type: 'status', text: `${name} を画像にしています…` });
    const items = [];
    for (const n of page.children) {
      if (!n.visible) continue;
      const b = n.absoluteRenderBounds || n.absoluteBoundingBox;
      if (!b || b.width < 1 || b.height < 1) continue;
      const bytes = await n.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 1 } });
      items.push({ x: b.x, y: b.y, w: b.width, h: b.height, bytes });
    }
    pages.push({ name, items });
  }
  figma.ui.postMessage({ type: 'pages', pages });
}
function stopped(what, e) {
  finish(`${what}: ${e && e.message ? e.message : e}`);
}

const PANEL = `<!doctype html><meta charset="utf-8">
<style>
  body { font: 13px/1.5 system-ui, sans-serif; margin: 12px; color: #1a1e23; }
  button, a.btn { display: block; width: 100%; box-sizing: border-box; margin: 0 0 8px; padding: 7px 12px; border-radius: 6px;
    border: 1px solid #858d99; background: #fff; font: inherit; text-align: center; text-decoration: none; color: inherit; cursor: pointer; }
  button.primary, a.btn { background: #1a6fd6; border-color: #1a6fd6; color: #fff; }
  button:disabled { opacity: 0.5; cursor: default; }
  p { margin: 4px 0 0; color: #4f5661; }
</style>
<button class="primary" id="build">組み立てる (前に作ったものは作り直し)</button>
<button id="shot">確認用の画像を保存</button>
<a class="btn" id="save" hidden>画像を保存</a>
<p id="msg"></p>
<script>
  const msg = document.getElementById('msg');
  const send = (m) => parent.postMessage({ pluginMessage: m }, '*');
  const busy = (on) => document.querySelectorAll('button').forEach((b) => (b.disabled = on));
  document.getElementById('build').onclick = () => { busy(true); msg.textContent = '組み立てています… (1 分ほど)'; send({ type: 'build' }); };
  document.getElementById('shot').onclick = () => { busy(true); msg.textContent = '画像にしています…'; send({ type: 'export' }); };
  document.getElementById('save').onclick = () => { msg.textContent = '保存できたら、このパネルを閉じてください'; };
  onmessage = async (e) => {
    const m = e.data.pluginMessage;
    if (!m) return;
    if (m.type === 'status') msg.textContent = m.text;
    if (m.type === 'done') { busy(false); msg.textContent = m.text + '。続けて「確認用の画像を保存」を押せます'; }
    if (m.type !== 'pages') return;
    msg.textContent = '1 枚につなげています…';
    const PAD = 40, HEAD = 64;
    const laid = [];
    let W = 0, H = 0;
    for (const p of m.pages) {
      if (!p.items.length) continue;
      const minX = Math.min(...p.items.map((i) => i.x)), minY = Math.min(...p.items.map((i) => i.y));
      const maxX = Math.max(...p.items.map((i) => i.x + i.w)), maxY = Math.max(...p.items.map((i) => i.y + i.h));
      laid.push({ p, minX, minY, top: H });
      W = Math.max(W, maxX - minX + PAD * 2);
      H += HEAD + maxY - minY + PAD * 2;
    }
    const s = Math.min(1, 32000 / W, 32000 / H, Math.sqrt(2e8 / (W * H)));
    const c = document.createElement('canvas');
    c.width = Math.ceil(W * s);
    c.height = Math.ceil(H * s);
    const g = c.getContext('2d');
    g.scale(s, s);
    g.fillStyle = '#e5e5e5';
    g.fillRect(0, 0, W, H);
    for (const L of laid) {
      g.fillStyle = '#1a1e23';
      g.fillRect(0, L.top, W, HEAD);
      g.fillStyle = '#ffffff';
      g.font = 'bold 32px sans-serif';
      g.fillText(L.p.name, PAD, L.top + 44);
      for (const i of L.p.items) {
        const bmp = await createImageBitmap(new Blob([i.bytes], { type: 'image/png' }));
        g.drawImage(bmp, PAD + i.x - L.minX, L.top + HEAD + PAD + i.y - L.minY, i.w, i.h);
      }
    }
    c.toBlob((b) => {
      const a = document.getElementById('save');
      a.href = URL.createObjectURL(b);
      a.download = 'nmr-design-review.png';
      a.hidden = false;
      busy(false);
      msg.textContent = 'できました (' + c.width + ' × ' + c.height + ')。「画像を保存」を押して、ダウンロードのフォルダに保存してください';
    }, 'image/png');
  };
</script>`;

figma.showUI(PANEL, { width: 320, height: 230, title: 'NMR Design System' });
figma.ui.onmessage = (m) => {
  if (m.type === 'build') main().catch((e) => stopped('止まりました', e));
  if (m.type === 'export') exportPreview().catch((e) => stopped('画像にできませんでした', e));
};

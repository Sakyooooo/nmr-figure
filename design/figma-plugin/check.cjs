// code.js を Figma の模擬 API で空回しする (Figma で実行する前の確認用): node design/figma-plugin/check.cjs - fresh|leftover
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let idSeq = 1;
const nodes = new Map();
const loaded = new Set();
const fontKey = (f) => `${f.family}|${f.style}`;
const warn = [];
function fail(msg) {
  throw new Error('[mock] ' + msg);
}

const NUM_FIELDS = new Set([
  'width', 'height', 'itemSpacing', 'counterAxisSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom',
  'topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius', 'strokeWeight', 'opacity', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight',
]);
const SCOPES = new Set(['ALL_SCOPES', 'TEXT_CONTENT', 'CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'ALL_FILLS', 'FRAME_FILL', 'SHAPE_FILL', 'TEXT_FILL', 'STROKE_COLOR', 'STROKE_FLOAT', 'EFFECT_FLOAT', 'EFFECT_COLOR', 'OPACITY', 'FONT_FAMILY', 'FONT_STYLE', 'FONT_WEIGHT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT']);

function checkPaints(p, what) {
  if (!Array.isArray(p)) fail(`${what} must be an array`);
  for (const x of p) {
    if (x.type !== 'SOLID') fail(`${what}: unexpected paint type ${x.type}`);
    const c = x.color;
    if (!c || [c.r, c.g, c.b].some((v) => typeof v !== 'number' || v < 0 || v > 1)) fail(`${what}: bad color ${JSON.stringify(c)}`);
    if ('a' in c) fail(`${what}: paint color must not have "a"`);
  }
}

class BaseNode {
  constructor(type) {
    this.id = `${idSeq}:${idSeq++}`;
    this.type = type;
    this.name = type;
    this.parent = null;
    this.removed = false;
    nodes.set(this.id, this);
  }
  remove() {
    if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
    this.removed = true;
  }
}

class SceneNode extends BaseNode {
  constructor(type) {
    super(type);
    this.x = 0;
    this.y = 0;
    this.width = 100;
    this.height = 100;
    this.visible = true;
    this._fills = [];
    this._strokes = [];
    this.strokeWeight = 1;
    this.effects = [];
    this.bound = {};
    this._cpr = {};
    this._lsh = 'FIXED';
    this._lsv = 'FIXED';
    this.opacity = 1;
    this.description = '';
  }
  get fills() {
    return this._fills;
  }
  set fills(p) {
    checkPaints(p, `${this.type} ${this.name}.fills`);
    this._fills = p;
  }
  get strokes() {
    return this._strokes;
  }
  set strokes(p) {
    checkPaints(p, `${this.type} ${this.name}.strokes`);
    this._strokes = p;
  }
  resize(w, h) {
    if (!(w >= 0.01 && h >= 0.01)) fail(`resize(${w}, ${h}) on ${this.name}`);
    this.width = w;
    this.height = h;
  }
  rescale(s) {
    if (!(s > 0)) fail('rescale');
    this.width *= s;
    this.height *= s;
    for (const c of this.children || []) c.rescale(s);
  }
  setBoundVariable(field, v) {
    if (!NUM_FIELDS.has(field)) fail(`setBoundVariable: field ${field} not bindable`);
    if (!v || v.__variable !== true) fail(`setBoundVariable(${field}): not a variable`);
    if (v.resolvedType !== 'FLOAT') fail(`setBoundVariable(${field}) with ${v.resolvedType} variable ${v.name}`);
    if (['itemSpacing', 'counterAxisSpacing', 'paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'].includes(field) && !this.layoutMode) fail(`bind ${field} on non-frame ${this.type}`);
    this.bound[field] = v.name;
  }
  get layoutSizingHorizontal() {
    return this._lsh;
  }
  set layoutSizingHorizontal(v) {
    this._setSizing('H', v);
  }
  get layoutSizingVertical() {
    return this._lsv;
  }
  set layoutSizingVertical(v) {
    this._setSizing('V', v);
  }
  _setSizing(axis, v) {
    if (!['FIXED', 'HUG', 'FILL'].includes(v)) fail(`layoutSizing ${v}`);
    if (v === 'FILL' && !(this.parent && this.parent.layoutMode && this.parent.layoutMode !== 'NONE')) fail(`FILL on ${this.name} whose parent ${this.parent && this.parent.name} is not auto-layout`);
    if (v === 'HUG' && !(this.type === 'TEXT' || (this.layoutMode && this.layoutMode !== 'NONE'))) fail(`HUG on ${this.name}`);
    if (axis === 'H') this._lsh = v;
    else this._lsv = v;
  }
  get componentPropertyReferences() {
    return this._cpr;
  }
  set componentPropertyReferences(r) {
    // find owning component and its set
    let p = this.parent;
    while (p && p.type !== 'COMPONENT') p = p.parent;
    if (!p) fail(`componentPropertyReferences on ${this.name} outside a component`);
    const defs = p.parent && p.parent.type === 'COMPONENT_SET' ? p.parent._defs : p._defs;
    for (const [k, key] of Object.entries(r)) {
      if (!['characters', 'visible', 'mainComponent'].includes(k)) fail(`cpr field ${k}`);
      const d = defs[key];
      if (!d) fail(`cpr ${k} -> unknown key ${key}`);
      if (k === 'characters' && (this.type !== 'TEXT' || d.type !== 'TEXT')) fail(`cpr characters mismatch on ${this.name}`);
      if (k === 'visible' && d.type !== 'BOOLEAN') fail('cpr visible mismatch');
      if (k === 'mainComponent' && (this.type !== 'INSTANCE' || d.type !== 'INSTANCE_SWAP')) fail('cpr mainComponent mismatch');
    }
    this._cpr = Object.assign({}, this._cpr, r);
  }
  async setEffectStyleIdAsync(id) {
    if (!styles.has(id) || styles.get(id).type !== 'EFFECT') fail('setEffectStyleIdAsync bad id');
    this.effectStyleId = id;
  }
  get absoluteRenderBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }
  async exportAsync(o) {
    if (!o || o.format !== 'PNG') fail('exportAsync format');
    return new Uint8Array([137, 80, 78, 71]);
  }
}

class ParentMixin extends SceneNode {
  constructor(type) {
    super(type);
    this.children = [];
  }
  appendChild(n) {
    if (!n || !(n instanceof SceneNode)) fail(`appendChild non-node into ${this.name}`);
    if (n.removed) fail(`appendChild removed node ${n.name}`);
    if (this.type === 'INSTANCE' || isInsideInstance(this)) fail(`appendChild into instance ${this.name}`);
    if (n.parent) n.parent.children.splice(n.parent.children.indexOf(n), 1);
    n.parent = this;
    this.children.push(n);
    // leaving auto layout resets FILL
    return n;
  }
  insertChild(i, n) {
    this.appendChild(n);
  }
  findAll(fn) {
    const out = [];
    const walk = (x) => {
      for (const c of x.children || []) {
        if (!fn || fn(c)) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  findOne(fn) {
    return this.findAll(fn)[0] || null;
  }
}
function isInsideInstance(n) {
  let p = n.parent;
  while (p) {
    if (p.type === 'INSTANCE') return true;
    p = p.parent;
  }
  return false;
}

class FrameNode extends ParentMixin {
  constructor(type = 'FRAME') {
    super(type);
    this._layoutMode = 'NONE';
    this.primaryAxisSizingMode = 'AUTO';
    this.counterAxisSizingMode = 'AUTO';
    this.itemSpacing = 0;
    this.counterAxisSpacing = 0;
    this._wrap = 'NO_WRAP';
    this.paddingTop = this.paddingBottom = this.paddingLeft = this.paddingRight = 0;
    this._fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
    this.clipsContent = true;
  }
  get layoutMode() {
    return this._layoutMode;
  }
  set layoutMode(v) {
    if (!['NONE', 'HORIZONTAL', 'VERTICAL', 'GRID'].includes(v)) fail(`layoutMode ${v}`);
    this._layoutMode = v;
  }
  get layoutWrap() {
    return this._wrap;
  }
  set layoutWrap(v) {
    if (v === 'WRAP' && this._layoutMode !== 'HORIZONTAL') fail(`WRAP on ${this.layoutMode} ${this.name}`);
    this._wrap = v;
  }
  set counterAxisAlignItems(v) {
    if (!['MIN', 'MAX', 'CENTER', 'BASELINE'].includes(v)) fail(`counterAxisAlignItems ${v}`);
    this._caa = v;
  }
  get counterAxisAlignItems() {
    return this._caa;
  }
  set primaryAxisAlignItems(v) {
    if (!['MIN', 'MAX', 'CENTER', 'SPACE_BETWEEN'].includes(v)) fail(`primaryAxisAlignItems ${v}`);
    this._paa = v;
  }
  get primaryAxisAlignItems() {
    return this._paa;
  }
  set strokeAlign(v) {
    if (!['INSIDE', 'OUTSIDE', 'CENTER'].includes(v)) fail('strokeAlign');
  }
}

class ComponentNode extends FrameNode {
  constructor() {
    super('COMPONENT');
    this._defs = {};
    this._fills = [{ type: 'SOLID', color: { r: 1, g: 1, b: 1 } }];
  }
  createInstance() {
    if (this.removed) fail('createInstance of removed component');
    return cloneAsInstance(this);
  }
  addComponentProperty(name, type, def) {
    if (this.parent && this.parent.type === 'COMPONENT_SET') fail('addComponentProperty on a variant (use the set)');
    return addProp(this, name, type, def);
  }
}
let propSeq = 1;
function addProp(owner, name, type, def) {
  if (!['TEXT', 'BOOLEAN', 'INSTANCE_SWAP', 'VARIANT'].includes(type)) fail(`prop type ${type}`);
  if (type === 'TEXT' && typeof def !== 'string') fail('TEXT default');
  if (type === 'TEXT' && def === '') warn.push(`empty TEXT default for ${owner.name}.${name}`);
  if (type === 'BOOLEAN' && typeof def !== 'boolean') fail('BOOLEAN default');
  if (type === 'INSTANCE_SWAP') {
    const n = nodes.get(def);
    if (!n || n.type !== 'COMPONENT') fail(`INSTANCE_SWAP default ${def} is not a component id`);
  }
  const key = `${name}#${propSeq++}:0`;
  owner._defs[key] = { type, defaultValue: def };
  return key;
}
class ComponentSetNode extends FrameNode {
  constructor() {
    super('COMPONENT_SET');
    this._defs = {};
    this._fills = [];
  }
  addComponentProperty(name, type, def) {
    return addProp(this, name, type, def);
  }
}

class InstanceNode extends ParentMixin {
  constructor(main) {
    super('INSTANCE');
    this.mainComponent = main;
    this.layoutMode = main.layoutMode;
  }
  setProperties(props) {
    const main = this.mainComponent;
    const defs = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent._defs : main._defs;
    for (const [k, v] of Object.entries(props)) {
      const d = defs[k];
      if (!d) fail(`setProperties: unknown key ${k} on instance of ${main.parent ? main.parent.name : main.name}`);
      if (d.type === 'TEXT' && typeof v !== 'string') fail('setProperties TEXT');
      if (d.type === 'TEXT' && v === '') warn.push(`setProperties empty TEXT ${k}`);
      if (d.type === 'BOOLEAN' && typeof v !== 'boolean') fail('setProperties BOOLEAN');
      if (d.type === 'INSTANCE_SWAP') {
        const n = nodes.get(v);
        if (!n || n.type !== 'COMPONENT') fail(`setProperties INSTANCE_SWAP ${v}`);
        // swap the referencing nested instance
        const target = this.findOne((x) => x.type === 'INSTANCE' && x._cpr.mainComponent === k);
        if (!target) fail(`no nested instance references ${k}`);
        const fresh = cloneAsInstance(n);
        target.children = fresh.children;
        for (const c of target.children) c.parent = target;
        target.mainComponent = n;
        target.name = target.name; // keep override name
      }
      if (d.type === 'TEXT') {
        const t = this.findOne((x) => x.type === 'TEXT' && x._cpr.characters === k);
        if (!t) fail(`no text references ${k}`);
        t._chars = v;
      }
      if (d.type === 'BOOLEAN') {
        const t = this.findOne((x) => x._cpr.visible === k);
        if (!t) fail(`no layer references ${k}`);
        t.visible = v;
      }
    }
  }
}
function cloneAsInstance(src, isRoot = true) {
  let n;
  if (isRoot || src.type === 'INSTANCE') {
    n = new InstanceNode(src.type === 'INSTANCE' ? src.mainComponent : src);
  } else if (src.type === 'TEXT') n = new TextNode(true);
  else if (src instanceof FrameNode) n = new FrameNode(src.type === 'COMPONENT' ? 'FRAME' : src.type);
  else n = new ShapeNode(src.type);
  n.name = src.name;
  n.width = src.width;
  n.height = src.height;
  n.visible = src.visible;
  n._fills = src._fills;
  n._strokes = src._strokes;
  n._cpr = Object.assign({}, src._cpr);
  if (src.type === 'TEXT') {
    n._chars = src._chars;
    n._font = src._font;
  }
  if (src instanceof FrameNode) n._layoutMode = src._layoutMode;
  if (src.layoutMode) n.layoutMode = src.layoutMode;
  if (src.children) {
    n.children = src.children.map((c) => {
      const k = cloneAsInstance(c, false);
      k.parent = n;
      return k;
    });
  }
  return n;
}

class ShapeNode extends SceneNode {
  constructor(type) {
    super(type);
    this._fills = [{ type: 'SOLID', color: { r: 0.8, g: 0.8, b: 0.8 } }];
  }
  set strokeAlign(v) {}
}

class TextNode extends SceneNode {
  constructor(skipCheck) {
    super('TEXT');
    this._chars = '';
    this._font = { family: 'Inter', style: 'Regular' };
    this.textAutoResize = 'WIDTH_AND_HEIGHT';
    this.height = 18;
    this.fontSize = 12;
  }
  get fontName() {
    return this._font;
  }
  set fontName(f) {
    if (!loaded.has(fontKey(f))) fail(`fontName set to unloaded font ${fontKey(f)}`);
    this._font = f;
  }
  get characters() {
    return this._chars;
  }
  set characters(s) {
    if (typeof s !== 'string') fail('characters must be string');
    if (!loaded.has(fontKey(this._font))) fail(`characters with unloaded font ${fontKey(this._font)}`);
    if (isInsideInstance(this)) {
      /* override ok */
    }
    this._chars = s;
  }
  set textAlignHorizontal(v) {
    if (!['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED'].includes(v)) fail(`textAlignHorizontal ${v}`);
  }
  async setTextStyleIdAsync(id) {
    const s = styles.get(id);
    if (!s || s.type !== 'TEXT') fail('setTextStyleIdAsync bad id');
    if (!loaded.has(fontKey(s.fontName))) fail(`text style font not loaded ${fontKey(s.fontName)}`);
    this._font = s.fontName;
    this.textStyleId = id;
  }
}

// styles
const styles = new Map();
let styleSeq = 1;
function makeStyle(type) {
  const s = {
    id: `S:${styleSeq++}`,
    type,
    name: '',
    description: '',
    remove() {
      styles.delete(this.id);
    },
  };
  if (type === 'TEXT') {
    let fn;
    Object.defineProperty(s, 'fontName', {
      get: () => fn,
      set: (f) => {
        if (!loaded.has(fontKey(f))) fail(`TextStyle font not loaded ${fontKey(f)}`);
        fn = f;
      },
    });
    s.fontSize = 12;
    s.lineHeight = { unit: 'AUTO' };
  }
  if (type === 'EFFECT') {
    let ef = [];
    Object.defineProperty(s, 'effects', {
      get: () => ef,
      set: (v) => {
        for (const e of v) {
          if (e.type !== 'DROP_SHADOW') fail('effect type');
          for (const k of ['color', 'offset', 'radius', 'visible', 'blendMode']) if (!(k in e)) fail(`effect missing ${k}`);
          if (!('a' in e.color)) fail('shadow color needs a');
        }
        ef = v;
      },
    });
  }
  styles.set(s.id, s);
  return s;
}

// variables
const collections = [];
const variables = new Map();
let varSeq = 1;
const variablesApi = {
  createVariableCollection(name) {
    const modeId = `M:${varSeq++}`;
    const c = {
      id: `VC:${varSeq++}`,
      name,
      modes: [{ modeId, name: 'Mode 1' }],
      renameMode(id, n) {
        const m = this.modes.find((x) => x.modeId === id);
        if (!m) fail('renameMode');
        m.name = n;
      },
      remove() {
        collections.splice(collections.indexOf(this), 1);
      },
    };
    collections.push(c);
    return c;
  },
  createVariable(name, collection, type) {
    if (!collection || !collection.modes) fail('createVariable needs collection object');
    if (!['COLOR', 'FLOAT', 'STRING', 'BOOLEAN'].includes(type)) fail('var type');
    for (const v of variables.values()) if (v.collection === collection && v.name === name) fail(`duplicate variable ${name}`);
    const v = {
      __variable: true,
      id: `V:${varSeq++}`,
      name,
      collection,
      resolvedType: type,
      values: {},
      codeSyntax: {},
      description: '',
      _scopes: ['ALL_SCOPES'],
      get scopes() {
        return this._scopes;
      },
      set scopes(s) {
        for (const x of s) if (!SCOPES.has(x)) fail(`scope ${x}`);
        if (type === 'COLOR' && s.some((x) => ['GAP', 'CORNER_RADIUS', 'WIDTH_HEIGHT'].includes(x))) fail(`bad scope for color ${name}`);
        if (type === 'FLOAT' && s.some((x) => x.endsWith('_FILL') || x === 'STROKE_COLOR')) fail(`bad scope for float ${name}`);
        this._scopes = s;
      },
      setValueForMode(modeId, value) {
        if (!collection.modes.find((m) => m.modeId === modeId)) fail('setValueForMode: wrong mode');
        if (value && value.type === 'VARIABLE_ALIAS') {
          const t = variables.get(value.id);
          if (!t || t.resolvedType !== type) fail(`alias type mismatch ${name}`);
        } else if (type === 'COLOR') {
          if (!value || [value.r, value.g, value.b, value.a].some((x) => typeof x !== 'number' || x < 0 || x > 1)) fail(`bad COLOR ${name}`);
        } else if (type === 'FLOAT' && typeof value !== 'number') fail(`bad FLOAT ${name}`);
        this.values[modeId] = value;
      },
      setVariableCodeSyntax(platform, s) {
        if (!['WEB', 'ANDROID', 'iOS'].includes(platform)) fail('platform');
        this.codeSyntax[platform] = s;
      },
    };
    variables.set(v.id, v);
    return v;
  },
  createVariableAlias(v) {
    if (!v || !v.__variable) fail('createVariableAlias');
    return { type: 'VARIABLE_ALIAS', id: v.id };
  },
  setBoundVariableForPaint(paint, field, v) {
    if (field !== 'color') fail('paint field');
    if (!v || !v.__variable || v.resolvedType !== 'COLOR') fail(`setBoundVariableForPaint with ${v && v.name}`);
    return Object.assign({}, paint, { boundVariables: { color: { type: 'VARIABLE_ALIAS', id: v.id } } });
  },
  async getLocalVariableCollectionsAsync() {
    return collections.slice();
  },
};

class PageNode extends BaseNode {
  constructor() {
    super('PAGE');
    this.children = [];
    this._loaded = false;
  }
  async loadAsync() {
    this._loaded = true;
  }
  appendChild(n) {
    return ParentMixin.prototype.appendChild.call(this, n);
  }
  findAll(fn) {
    return ParentMixin.prototype.findAll.call(this, fn);
  }
  findOne(fn) {
    return ParentMixin.prototype.findOne.call(this, fn);
  }
  get layoutMode() {
    return undefined;
  }
  remove() {
    if (figma.currentPage === this) fail('cannot remove current page');
    if (root.children.length <= 1) fail('cannot remove last page');
    root.children.splice(root.children.indexOf(this), 1);
    this.removed = true;
  }
}
// make PageNode pass SceneNode check for appendChild parent logic
Object.defineProperty(PageNode.prototype, 'type', { writable: true });

// 無料 (Starter) プランと同じく 1 ファイル 3 ページまで
const PAGE_LIMIT = 3;
const root = {
  children: [],
  insertChild(i, p) {
    const at = this.children.indexOf(p);
    if (at < 0) fail('insertChild: page not in document');
    this.children.splice(at, 1);
    this.children.splice(i, 0, p);
  },
};
function addPage(name) {
  if (root.children.length >= PAGE_LIMIT) fail(`in createPage: The Starter plan only comes with ${PAGE_LIMIT} pages`);
  const p = new PageNode();
  p.name = name;
  root.children.push(p);
  return p;
}
// 始めの状態: fresh = 新しいファイル / leftover = 前の版が途中で止まった状態 (3 ページ・変数とスタイルが残っている)
const SCENARIO = process.argv[3] || 'fresh';
const p1 = addPage(SCENARIO === 'leftover' ? '__building' : 'Page 1');

let closed = null;
let uiShown = null;
const posted = [];
const figma = {
  root,
  currentPage: p1,
  variables: variablesApi,
  async setCurrentPageAsync(p) {
    this.currentPage = p;
  },
  createPage() {
    return addPage('Page');
  },
  createFrame() {
    const f = new FrameNode();
    figma.currentPage.appendChild(f);
    return f;
  },
  createComponent() {
    const c = new ComponentNode();
    figma.currentPage.appendChild(c);
    return c;
  },
  createRectangle() {
    const r = new ShapeNode('RECTANGLE');
    figma.currentPage.appendChild(r);
    return r;
  },
  createEllipse() {
    const r = new ShapeNode('ELLIPSE');
    figma.currentPage.appendChild(r);
    return r;
  },
  createText() {
    const t = new TextNode();
    figma.currentPage.appendChild(t);
    return t;
  },
  createNodeFromSvg(svg) {
    if (!/^<svg[\s\S]*<\/svg>$/.test(svg)) fail('svg');
    const f = new FrameNode();
    figma.currentPage.appendChild(f);
    const els = svg.match(/<(path|circle|rect|line|polyline|ellipse)\b/g) || [];
    if (!els.length) fail('svg without shapes');
    for (const e of els) {
      const v = new ShapeNode('VECTOR');
      v._fills = [];
      v._strokes = [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }];
      f.appendChild(v);
    }
    return f;
  },
  combineAsVariants(comps, parent) {
    if (!comps.length) fail('combineAsVariants empty');
    const par = comps[0].parent;
    for (const c of comps) {
      if (c.type !== 'COMPONENT') fail('combineAsVariants non-component');
      if (c.parent !== par) fail('combineAsVariants different parents');
      if (!/^([^=,]+=[^=,]+)(, [^=,]+=[^=,]+)*$/.test(c.name)) fail(`variant name ${c.name}`);
    }
    const names = new Set(comps.map((c) => c.name));
    if (names.size !== comps.length) fail('duplicate variant names');
    const s = new ComponentSetNode();
    parent.appendChild(s);
    for (const c of comps) s.appendChild(c);
    return s;
  },
  createTextStyle() {
    return makeStyle('TEXT');
  },
  createEffectStyle() {
    return makeStyle('EFFECT');
  },
  async getLocalTextStylesAsync() {
    return [...styles.values()].filter((s) => s.type === 'TEXT');
  },
  async getLocalEffectStylesAsync() {
    return [...styles.values()].filter((s) => s.type === 'EFFECT');
  },
  async listAvailableFontsAsync() {
    return ['Yu Gothic UI|Regular', 'Yu Gothic UI|Bold', 'BIZ UDPGothic|Regular', 'BIZ UDPGothic|Bold', 'Tinos|Regular', 'Tinos|Bold', 'Inter|Regular', 'Inter|Bold'].map((k) => {
      const [family, style] = k.split('|');
      return { fontName: { family, style } };
    });
  },
  async loadFontAsync(f) {
    loaded.add(fontKey(f));
  },
  closePlugin(msg) {
    closed = msg;
  },
  showUI(html, o) {
    if (typeof html !== 'string' || !o) fail('showUI');
    uiShown = html;
  },
  ui: {
    onmessage: null,
    postMessage(m) {
      posted.push(m);
    },
  },
  notify(t) {
    if (typeof t !== 'string') fail('notify');
  },
};

const code = fs.readFileSync(process.argv[2] && process.argv[2] !== '-' ? process.argv[2] : path.join(__dirname, 'code.js'), 'utf8');

async function runOnce(label) {
  closed = null;
  warn.length = 0;
  const ctx = vm.createContext({ figma, console, Math, Object, Array, JSON, Promise, String, Number, Error, parseInt, Set, Map });
  vm.runInContext(code, ctx);
  if (!uiShown || typeof figma.ui.onmessage !== 'function') fail('パネルが出ない');
  posted.length = 0;
  figma.ui.onmessage({ type: 'build' });
  for (let i = 0; i < 500 && closed === null && !posted.some((m) => m.type === 'done'); i++) await new Promise((r) => setTimeout(r, 20));
  const done = posted.find((m) => m.type === 'done');
  if (done) closed = done.text;
  const run = vm.runInContext('RUN', ctx);
  console.log(`--- ${label}`);
  console.log('closePlugin:', closed);
  console.log('done:', run.done.length, '| errors:', run.errors.length, '| warnings:', warn.length);
  for (const e of run.errors) console.log('  ERR', e);
  for (const w of warn.slice(0, 20)) console.log('  WARN', w);
  console.log('pages:', root.children.map((p) => `${p.name}(${p.children.length})`).join(', '));
  const live = [...variables.values()].filter((v) => collections.includes(v.collection));
  console.log('collections:', collections.map((c) => c.name).join(', '), '| variables:', live.length, '| styles:', styles.size);
  const all = root.children.flatMap((p) => p.findAll());
  const comps = all.filter((n) => n.type === 'COMPONENT_SET' || (n.type === 'COMPONENT' && n.parent.type !== 'COMPONENT_SET'));
  console.log('component sets / components:', comps.length);
  let raw = 0;
  for (const n of all) for (const q of [...(n._fills || []), ...(n._strokes || [])]) if (!q.boundVariables && !['FRAME', 'COMPONENT', 'INSTANCE'].includes(n.type)) raw++;
  console.log('paints without variables (non-frame):', raw);
  return run.errors.length === 0 && closed === 'できました';
}

(async function () {
  if (SCENARIO === 'leftover') {
    // 前の版: __building を作って Page 1 を消し、変数とスタイルを作り、Cover・Foundations を作ったところで止まった
    for (const name of ['Primitives', 'Color', 'Data', 'Spacing']) {
      const c = figma.variables.createVariableCollection(name);
      figma.variables.createVariable('color/bg/canvas', c, 'COLOR');
    }
    await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
    const st = figma.createTextStyle();
    st.name = 'Type/Body';
    st.fontName = { family: 'Inter', style: 'Regular' };
    figma.createEffectStyle().name = 'Elevation/1';
    loaded.clear();
    const cover = addPage('Cover');
    cover.appendChild(new FrameNode());
    addPage('Foundations');
    figma.currentPage = root.children[0];
    console.log('start:', root.children.map((p) => `${p.name}(${p.children.length})`).join(', '), '| collections:', collections.length, '| styles:', styles.size);
  }
  const a = await runOnce(`${SCENARIO}: 1 回目`);
  const b = await runOnce(`${SCENARIO}: 2 回目 (作り直し)`);
  // 確認用の画像
  closed = null;
  posted.length = 0;
  const ctx = vm.createContext({ figma, console, Math, Object, Array, JSON, Promise, String, Number, Error, parseInt, Set, Map, Uint8Array });
  vm.runInContext(code, ctx);
  figma.ui.onmessage({ type: 'export' });
  for (let i = 0; i < 200 && !posted.some((m) => m.type === 'pages') && closed === null; i++) await new Promise((r) => setTimeout(r, 20));
  const pg = posted.find((m) => m.type === 'pages');
  console.log('--- 確認用の画像:', closed ? `止まった: ${closed}` : pg.pages.map((p) => `${p.name} ${p.items.length} 個`).join(', '));
  const c = !closed && pg && pg.pages.length === 3 && pg.pages.every((p) => p.items.length > 0);
  process.exitCode = a && b && c ? 0 : 1;
})();

/**
 * 小さな XML の読み書き (ChemDraw の CDXML 用)。
 * DOMParser はテスト (Node) で使えないので自前で持つ。要素・属性・文字だけを扱い、
 * 宣言 (<?xml ?>)・DOCTYPE・コメントは読み飛ばす。
 */
export interface XNode {
  name: string;
  attrs: Record<string, string>;
  children: XChild[];
}
export type XChild = XNode | string;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? m;
  });
}

function encode(s: string, attr: boolean) {
  const t = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return attr ? t.replace(/"/g, '&quot;').replace(/\n/g, '&#10;') : t;
}

/** 読めなければ null */
export function parseXml(text: string): XNode | null {
  const src = text.replace(/^﻿/, '');
  let i = 0;
  const stack: XNode[] = [];
  let root: XNode | null = null;
  const attrRe = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    const textEnd = lt < 0 ? src.length : lt;
    if (textEnd > i && stack.length) {
      const raw = src.slice(i, textEnd);
      if (raw.trim() || stack[stack.length - 1].name === 's') stack[stack.length - 1].children.push(decode(raw));
    }
    if (lt < 0) break;
    if (src.startsWith('<?', lt)) {
      const end = src.indexOf('?>', lt);
      if (end < 0) return null;
      i = end + 2;
    } else if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt);
      if (end < 0) return null;
      i = end + 3;
    } else if (src.startsWith('<![CDATA[', lt)) {
      const end = src.indexOf(']]>', lt);
      if (end < 0) return null;
      if (stack.length) stack[stack.length - 1].children.push(src.slice(lt + 9, end));
      i = end + 3;
    } else if (src.startsWith('<!', lt)) {
      // DOCTYPE (中の [ ] は CDXML では使わない)
      const end = src.indexOf('>', lt);
      if (end < 0) return null;
      i = end + 1;
    } else if (src[lt + 1] === '/') {
      const end = src.indexOf('>', lt);
      if (end < 0) return null;
      const name = src.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.name !== name) return null;
      if (!stack.length) root = open;
      i = end + 1;
    } else {
      // 属性の値に > が入ることがあるので、引用符の外の > を探す
      let j = lt + 1;
      let quote = '';
      while (j < src.length) {
        const c = src[j];
        if (quote) {
          if (c === quote) quote = '';
        } else if (c === '"' || c === "'") quote = c;
        else if (c === '>') break;
        j++;
      }
      if (j >= src.length) return null;
      const body = src.slice(lt + 1, j);
      const selfClose = body.endsWith('/');
      const inner = selfClose ? body.slice(0, -1) : body;
      const nameMatch = /^[^\s/>]+/.exec(inner);
      if (!nameMatch) return null;
      const node: XNode = { name: nameMatch[0], attrs: {}, children: [] };
      attrRe.lastIndex = nameMatch[0].length;
      for (let m = attrRe.exec(inner); m; m = attrRe.exec(inner)) node.attrs[m[1]] = decode(m[3] ?? m[4] ?? '');
      if (stack.length) stack[stack.length - 1].children.push(node);
      if (selfClose) {
        if (!stack.length) root = node;
      } else stack.push(node);
      i = j + 1;
    }
  }
  return stack.length ? null : root;
}

export function serializeXml(node: XNode): string {
  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${encode(v, true)}"`)
    .join('');
  if (!node.children.length) return `<${node.name}${attrs}/>`;
  const inner = node.children.map((c) => (typeof c === 'string' ? encode(c, false) : serializeXml(c))).join('');
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
}

export function elements(node: XNode, name?: string): XNode[] {
  return node.children.filter((c): c is XNode => typeof c !== 'string' && (!name || c.name === name));
}

export function firstElement(node: XNode, name: string): XNode | undefined {
  return elements(node, name)[0];
}

export function textOf(node: XNode): string {
  return node.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
}

/** 子孫をすべてたどる (自分も含む) */
export function walk(node: XNode, fn: (n: XNode, parent: XNode | null) => void, parent: XNode | null = null) {
  fn(node, parent);
  for (const c of node.children) if (typeof c !== 'string') walk(c, fn, node);
}

export function cloneNode(node: XNode): XNode {
  return { name: node.name, attrs: { ...node.attrs }, children: node.children.map((c) => (typeof c === 'string' ? c : cloneNode(c))) };
}

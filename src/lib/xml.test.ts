import { describe, expect, it } from 'vitest';
import { elements, parseXml, serializeXml, textOf } from './xml';

describe('xml', () => {
  it('宣言・DOCTYPE を読み飛ばし、属性と文字を読む', () => {
    const root = parseXml('<?xml version="1.0" ?>\n<!DOCTYPE CDXML SYSTEM "x.dtd" >\n<CDXML a="1 &amp; 2"><page><t p="1 2"><s face="96">NH2</s></t></page></CDXML>');
    expect(root?.name).toBe('CDXML');
    expect(root?.attrs.a).toBe('1 & 2');
    const t = elements(elements(root!, 'page')[0], 't')[0];
    expect(t.attrs.p).toBe('1 2');
    expect(textOf(t)).toBe('NH2');
  });

  it('属性の中の > と、s の中の空白・改行を保つ', () => {
    const root = parseXml(`<a v="x > y"><s> a\nb </s></a>`)!;
    expect(root.attrs.v).toBe('x > y');
    expect(textOf(elements(root, 's')[0])).toBe(' a\nb ');
  });

  it('書いて読み直すと同じ', () => {
    const src = parseXml('<CDXML x="&quot;q&quot;"><page id="1"><t><s>a &lt; b</s></t><n p="0 0"/></page></CDXML>')!;
    const again = parseXml(serializeXml(src))!;
    expect(again).toEqual(src);
  });

  it('閉じていない XML は null', () => {
    expect(parseXml('<a><b></a>')).toBeNull();
    expect(parseXml('<a>')).toBeNull();
  });
});

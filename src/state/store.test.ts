import { beforeEach, describe, expect, it } from 'vitest';
import { beginGesture, edit, endGesture, loadDocument, redo, undo, useEditor } from './store';
import { emptyDocument } from './types';

const width = () => useEditor.getState().doc.figure.width;
const setWidth = (w: number, record = true) =>
  edit((d) => {
    d.figure.width = w;
  }, record);

describe('元に戻す / やり直し', () => {
  beforeEach(() => loadDocument(emptyDocument(), {}, null, null));

  it('1回の変更を戻して、やり直せる', () => {
    setWidth(500);
    undo();
    expect(width()).toBe(940);
    redo();
    expect(width()).toBe(500);
  });

  it('ドラッグ中の変更は1回分にまとまる', () => {
    const t = beginGesture();
    setWidth(600, false);
    setWidth(700, false);
    endGesture(t);
    expect(useEditor.getState().past).toHaveLength(1);
    undo();
    expect(width()).toBe(940);
  });

  it('入力中に別のドラッグが始まっても、両方の変更を戻せる', () => {
    const typing = beginGesture();
    setWidth(600);
    const drag = beginGesture();
    setWidth(700, false);
    endGesture(typing); // 入力欄のフォーカスが外れる (古いトークンなので無視される)
    endGesture(drag);
    expect(useEditor.getState().past).toHaveLength(2);
    undo();
    expect(width()).toBe(600);
    undo();
    expect(width()).toBe(940);
  });

  it('変更がなければ履歴に積まない', () => {
    const t = beginGesture();
    endGesture(t);
    expect(useEditor.getState().past).toHaveLength(0);
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { edit, loadDocument, markSaved, updateSettings, useEditor } from './store';
import { emptyDocument } from './types';
import { startUsageCount, usageAllowed, usageUrl, type UsageEvent } from './usage';

const setWidth = (w: number) =>
  edit((d) => {
    d.figure.width = w;
  });

describe('使われた回数', () => {
  it('送るのは「開いた」「編集した」の名前だけ', () => {
    expect(usageUrl('open', 'x')).toBe('https://nmr-figure.goatcounter.com/count?p=%2F&t=open&rnd=x');
    expect(usageUrl('edit', 'x')).toBe('https://nmr-figure.goatcounter.com/count?p=edit&t=edit&e=true&rnd=x');
  });

  it('公開版だけで送り、設定で止められる', () => {
    expect(usageAllowed('sakyooooo.github.io', true)).toBe(true);
    expect(usageAllowed('localhost', true)).toBe(false);
    expect(usageAllowed('sakyooooo.github.io', false)).toBe(false);
    updateSettings((s) => {
      s.sendUsage = false;
    });
    expect(usageAllowed('sakyooooo.github.io', true)).toBe(false);
    updateSettings((s) => {
      s.sendUsage = true;
    });
  });

  describe('編集した回数', () => {
    let events: UsageEvent[];
    let stop: () => void;
    beforeEach(() => {
      loadDocument(emptyDocument(), {}, null, null);
      events = [];
      stop = startUsageCount((e) => events.push(e));
    });
    afterEach(() => stop());

    it('開いたら 1 回、図を直し始めたら 1 回 (直し続けても増えない)', () => {
      expect(events).toEqual(['open']);
      setWidth(500);
      setWidth(600);
      setWidth(700);
      expect(events).toEqual(['open', 'edit']);
    });

    it('保存してからまた直し始めたら、もう 1 回', () => {
      setWidth(500);
      markSaved('a.jdf', null);
      setWidth(600);
      expect(events).toEqual(['open', 'edit', 'edit']);
    });

    it('別の図を開いて直したら、もう 1 回', () => {
      setWidth(500);
      loadDocument(emptyDocument(), {}, null, null);
      setWidth(600);
      expect(events).toEqual(['open', 'edit', 'edit']);
    });

    it('前回の作業を戻しただけ (変更ありの印だけ戻す) は数えない', () => {
      useEditor.setState({ dirty: true });
      expect(events).toEqual(['open']);
    });
  });
});

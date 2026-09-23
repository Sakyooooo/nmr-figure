import { useEffect, useState } from 'react';
import { Icon, type IconName } from './Icon';
import { IconButton } from './ui';

const SEEN_KEY = 'nmr-touch-help-seen';

/** タッチの画面で初めて図を開いたときに一度だけ出す (出したかはこのブラウザに覚える) */
export function useFirstTouchHelp(hasData: boolean): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!hasData || !window.matchMedia?.('(pointer: coarse)').matches) return;
    try {
      if (localStorage.getItem(SEEN_KEY)) return;
    } catch {
      return;
    }
    setOpen(true);
  }, [hasData]);
  const set = (v: boolean) => {
    setOpen(v);
    if (!v) {
      try {
        localStorage.setItem(SEEN_KEY, '1');
      } catch {
        // 覚えられなくても、次に開いたときにもう一度出るだけ
      }
    }
  };
  return [open, set];
}

const ROWS: { icon: IconName; what: string; how: string }[] = [
  { icon: 'pointer', what: '1 本指でなぞる', how: '選んだ道具で操作 (積分の範囲・図形・拡大する範囲など)' },
  { icon: 'arrow-right', what: '背景を左右になぞる', how: '選択の道具のとき、表示する範囲を動かす (上下になぞると高さ)' },
  { icon: 'zoom-in', what: '拡大する', how: '拡大の道具で四角く囲む (縦は四角の上端まで)。全体に戻すのは左下のボタン' },
  { icon: 'more', what: '選んだものの操作', how: '選んだものの真上に出る帯 (値を変える・消す など)' },
  { icon: 'undo', what: '元に戻す', how: '下の道具の左のボタン' },
];

/** タッチでの操作の説明 (下から出るパネル) */
export function TouchHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="touch-help-title">
        <span className="sheet-handle" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="touch-help-title">タッチでの操作</h2>
          <IconButton icon="x" label="閉じる" onClick={onClose} />
        </div>
        <ul className="sheet-rows">
          {ROWS.map((r) => (
            <li key={r.what}>
              <span className="sheet-icon" aria-hidden="true">
                <Icon name={r.icon} />
              </span>
              <span>
                <b>{r.what}</b> · {r.how}
              </span>
            </li>
          ))}
        </ul>
        <div className="sheet-foot">
          <span className="muted">「操作を探す」の「タッチでの操作」からいつでも見られます</span>
          <button type="button" className="btn primary" onClick={onClose} autoFocus>
            わかった
          </button>
        </div>
      </section>
    </div>
  );
}

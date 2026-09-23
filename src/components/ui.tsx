import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

/** キーの表示 (枠付き) */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

/** アイコンだけのボタン。名前 (label) は読み上げとツールチップに使う */
export function IconButton({
  icon,
  label,
  shortcut,
  onClick,
  pressed,
  disabled,
  size = 'md',
  className = '',
}: {
  icon: IconName;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  pressed?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`ibtn ${size}${pressed ? ' on' : ''} ${className}`}
      aria-label={shortcut ? `${label} (${shortcut})` : label}
      aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={icon} size={size === 'sm' ? 16 : 20} />
    </button>
  );
}

export type MenuItem = { label: string; icon?: IconName; shortcut?: string; onSelect: () => void; disabled?: boolean; hint?: string } | 'divider';

/** 押すと下 (または上) に出るメニュー。矢印キーで選び、Enter で実行、Esc で閉じる */
export function MenuButton({
  children,
  items,
  label,
  className = 'btn',
  placement = 'bottom-start',
  disabled,
}: {
  children: ReactNode;
  items: MenuItem[];
  label: string;
  className?: string;
  placement?: 'bottom-start' | 'bottom-end' | 'top';
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', onDown);
    menuRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const close = (focusButton = true) => {
    setOpen(false);
    if (focusButton) buttonRef.current?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Tab') close(false);
  };

  return (
    <div className="menu-root" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`${className}${open ? ' on' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        {children}
      </button>
      {open && (
        <div className={`menu ${placement}`} role="menu" id={id} ref={menuRef} onKeyDown={onKeyDown}>
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={i} className="menu-divider" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className="menu-item"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.icon && <Icon name={item.icon} size={16} />}
                <span className="menu-label">
                  {item.label}
                  {item.hint && <span className="menu-hint">{item.hint}</span>}
                </span>
                {item.shortcut && <span className="menu-shortcut">{item.shortcut}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

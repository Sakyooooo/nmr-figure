import { useEffect, useRef, useState, type ReactNode } from 'react';
import { beginGesture, endGesture, isGestureOpen } from '../state/store';

/** 確定 (Enter / フォーカスが外れる) したときだけ反映する数値入力。1文字ごとに履歴を積まない */
export function NumberInput({
  value,
  onCommit,
  step = 1,
  min,
  max,
  digits,
  width = 64,
  title,
  placeholder,
  allowEmpty = false,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  step?: number;
  min?: number;
  max?: number;
  digits?: number;
  width?: number;
  title?: string;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const format = (v: number | null) => (v === null ? '' : digits === undefined ? String(v) : v.toFixed(digits));
  const [text, setText] = useState(format(value));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(format(value));
  }, [value, digits]);
  // state ではなく入力欄の値を読む (入力直後にフォーカスが外れても取りこぼさない)
  const commit = (raw: string) => {
    if (raw.trim() === '' && allowEmpty) {
      if (value !== null) onCommit(null);
      return;
    }
    let v = raw.trim() === '' ? NaN : Number(raw);
    if (!Number.isFinite(v)) {
      setText(format(value));
      return;
    }
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    setText(format(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      type="number"
      className="num"
      style={{ width }}
      value={text}
      step={step}
      min={min}
      max={max}
      title={title}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        focused.current = false;
        commit(e.currentTarget.value);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit(e.currentTarget.value);
        if (e.key === 'Escape') setText(format(value));
      }}
    />
  );
}

export function TextInput({
  value,
  onCommit,
  placeholder,
  multiline = false,
  id,
  width,
  list,
  title,
  className,
}: {
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  id?: string;
  width?: number | string;
  /** 候補 (datalist の id) */
  list?: string;
  title?: string;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  // 入力中に消えた (図形が削除されたなど) ときも、編集のまとまりを閉じる
  useEffect(() => endGestureOnce, []);
  const props = {
    id,
    value: text,
    placeholder,
    title,
    className,
    style: width !== undefined ? { width } : undefined,
    onFocus: () => (focused.current = true),
    onChange: (e: { target: { value: string } }) => {
      setText(e.target.value);
      // テキストは入力しながら図に反映したいので、1回の編集として履歴にまとめる
      beginGestureOnce();
      onCommit(e.target.value);
    },
    onBlur: () => {
      focused.current = false;
      endGestureOnce();
    },
  };
  return multiline ? <textarea rows={3} {...props} /> : <input type="text" list={list} {...props} />;
}

let openToken: number | null = null;
function beginGestureOnce() {
  if (openToken !== null && isGestureOpen(openToken)) return;
  openToken = beginGesture();
}
function endGestureOnce() {
  if (openToken === null) return;
  endGesture(openToken);
  openToken = null;
}

/** カラーピッカーはドラッグ中に何度も変化するので、閉じるまでを1回の編集にする */
export function ColorInput({ value, onChange, title }: { value: string; onChange: (v: string) => void; title?: string }) {
  useEffect(() => endGestureOnce, []);
  return (
    <input
      type="color"
      className="color"
      value={value}
      title={title}
      onChange={(e) => {
        beginGestureOnce();
        onChange(e.target.value);
      }}
      onBlur={endGestureOnce}
    />
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export function Section({ title, children, defaultOpen = true, extra }: { title: string; children: ReactNode; defaultOpen?: boolean; extra?: ReactNode }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {extra}
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

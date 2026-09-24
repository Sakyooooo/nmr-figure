import { create } from 'zustand';

/**
 * アプリ内の確認ダイアログ。ブラウザの confirm() は埋め込みのブラウザなどで
 * 表示されずに false が返ることがあるので使わない。
 */
export interface DialogAction {
  label: string;
  value: string;
  kind?: 'primary' | 'danger';
}

interface DialogState {
  /** cancel = false なら「キャンセル」を出さない (知らせるだけのとき) */
  current: { title: string; message: string; actions: DialogAction[]; cancel: boolean; resolve: (v: string | null) => void } | null;
}

export const useDialog = create<DialogState>(() => ({ current: null }));

export function ask(title: string, message: string, actions: DialogAction[], options: { cancel?: boolean } = {}): Promise<string | null> {
  return new Promise((resolve) => {
    useDialog.getState().current?.resolve(null);
    useDialog.setState({ current: { title, message, actions, cancel: options.cancel !== false, resolve } });
  });
}

export function answer(value: string | null) {
  const cur = useDialog.getState().current;
  useDialog.setState({ current: null });
  cur?.resolve(value);
}

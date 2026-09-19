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
  current: { title: string; message: string; actions: DialogAction[]; resolve: (v: string | null) => void } | null;
}

export const useDialog = create<DialogState>(() => ({ current: null }));

export function ask(title: string, message: string, actions: DialogAction[]): Promise<string | null> {
  return new Promise((resolve) => {
    useDialog.getState().current?.resolve(null);
    useDialog.setState({ current: { title, message, actions, resolve } });
  });
}

export function answer(value: string | null) {
  const cur = useDialog.getState().current;
  useDialog.setState({ current: null });
  cur?.resolve(value);
}

import { tr } from '../i18n';
import { useEffect, useRef } from 'react';
import { answer, useDialog } from '../state/dialog';

export function DialogHost() {
  const current = useDialog((s) => s.current);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (current && !ref.current?.open) ref.current?.showModal();
  }, [current]);
  if (!current) return null;
  return (
    <dialog ref={ref} className="modal" onCancel={() => answer(null)}>
      <header>
        <h2>{current.title}</h2>
      </header>
      <div className="dialog-body">
        <p>{current.message}</p>
        <div className="actions">
          {current.cancel && <button onClick={() => answer(null)}>{tr('キャンセル')}</button>}
          {current.actions.map((a) => (
            <button key={a.value} className={a.kind ?? ''} onClick={() => answer(a.value)}>
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}

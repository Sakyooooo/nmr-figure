/**
 * 反応スキーム・構造式を描く画面 (Ketcher)。
 * 重いので、描くボタンを押したときだけ読み込む (App からは lazy で呼ぶ)。
 * 計算もブラウザの中だけで行う (Indigo の WebAssembly)。
 */
import { useRef, useState } from 'react';
import { Editor } from 'ketcher-react';
import { StandaloneStructServiceProvider } from 'ketcher-standalone';
import type { Ketcher } from 'ketcher-core';
import 'ketcher-react/dist/index.css';

const structServiceProvider = new StandaloneStructServiceProvider();

export interface SchemeResult {
  /** 図に出す画像 (SVG) */
  image: Blob;
  /** 描き直せるように残す元データ (MOL / RXN) */
  source: string;
}

export default function SchemeEditor({
  sampleKey,
  source,
  onSave,
  onClose,
}: {
  sampleKey: string;
  source: string | null;
  onSave: (result: SchemeResult) => void;
  onClose: () => void;
}) {
  const ketcher = useRef<Ketcher | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    const k = ketcher.current;
    if (!k) return;
    setBusy(true);
    setError(null);
    try {
      // 反応 (→ がある) なら RXN、なければ MOL で残す
      const text = await k.getRxn().catch(() => k.getMolfile());
      // 背景は指定しない (Indigo は #ffffff 形式を受け付けない)。図では白地の上に置かれる
      const image = await k.generateImage(text, { outputFormat: 'svg' });
      onSave({ image, source: text });
    } catch (e) {
      setError(`保存できませんでした: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="scheme-editor" role="dialog" aria-label="スキームを描く">
      <header>
        <strong>スキームを描く</strong>
        <span className="muted">{sampleKey}</span>
        <span className="spacer" />
        {error && <span className="warn">{error}</span>}
        <button className="primary" onClick={() => void save()} disabled={busy}>
          {busy ? '保存中…' : 'この内容で保存'}
        </button>
        <button onClick={onClose} disabled={busy}>
          閉じる
        </button>
      </header>
      <div className="scheme-editor-body">
        <Editor
          staticResourcesUrl=""
          structServiceProvider={structServiceProvider}
          errorHandler={(message: string) => setError(String(message))}
          onInit={(instance: Ketcher) => {
            ketcher.current = instance;
            // 開発時はコンソールから触れるようにしておく
            if (import.meta.env.DEV) (window as unknown as { __ketcher?: Ketcher }).__ketcher = instance;
            if (source) void instance.setMolecule(source);
          }}
        />
      </div>
    </div>
  );
}

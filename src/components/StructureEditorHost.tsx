/**
 * 図に置く構造式の編集。ツールバーのボタンや、置いた構造式のダブルクリックで開く。
 * 保存すると SVG のまま図に入るので、Word / PowerPoint で「図形に変換」すると編集できる。
 */
import { lazy, Suspense, useEffect } from 'react';
import { addFigureImage, closeStructureEditor, notify, updateFigureImage, useEditor } from '../state/store';
import { svgRatio } from './FigureImages';

const SchemeEditor = lazy(() => import('./SchemeEditor'));

/** ChemDraw などからコピーした文字が構造式かどうか (SMILES や MOL) */
export function looksLikeStructure(text: string) {
  const t = text.trim();
  if (!t || t.length > 20000) return false;
  if (/V2000|V3000|\$RXN/.test(t)) return true;
  // SMILES: 1行で、構造式に使う文字だけ
  return !t.includes('\n') && t.length <= 200 && /^[A-Za-z0-9@+\-[\]()=#$%/\\.*:]+$/.test(t) && /[CcNnOoSsPpFI]/.test(t);
}

export function StructureEditorHost() {
  const editing = useEditor((s) => s.structureEditor);
  const screen = useEditor((s) => s.screen);
  const hasData = useEditor((s) => s.doc.layers.length > 0 || !!s.doc.plot2d);

  // 図の上で Ctrl+V: 画像はそのまま置き、構造式の文字はエディタで開く
  useEffect(() => {
    if (screen !== 'editor') return;
    const onPaste = async (ev: ClipboardEvent) => {
      const target = ev.target as HTMLElement;
      if (target.closest?.('input, textarea, .scheme-editor')) return;
      if (!hasData) return;
      const file = [...(ev.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) {
        ev.preventDefault();
        await placePastedImage(file);
        return;
      }
      const text = ev.clipboardData?.getData('text/plain') ?? '';
      if (looksLikeStructure(text)) {
        ev.preventDefault();
        useEditor.setState({ structureEditor: { imageId: null, source: text } });
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [screen, hasData]);

  if (!editing) return null;
  return (
    <Suspense fallback={<div className="scheme-editor loading">構造式を描く画面を読み込んでいます…</div>}>
      <SchemeEditor
        sampleKey="図に置く構造式"
        source={editing.source}
        onClose={closeStructureEditor}
        onSave={async ({ image, source }) => {
          const svg = await image.text();
          const ratio = svgRatio(svg) ?? 0.7;
          if (editing.imageId) updateFigureImage(editing.imageId, { svg, source, ratio });
          else addFigureImage({ svg, source, ratio });
          closeStructureEditor();
          notify('構造式を図に置きました。ドラッグで移動、右下の角で大きさを変えられます');
        }}
      />
    </Suspense>
  );
}

/** 貼り付けた画像を図に置く (ChemDraw からのコピーなど) */
async function placePastedImage(file: File) {
  const href = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const size = await new Promise<{ w: number; h: number }>((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 4, h: 3 });
    img.src = href;
  });
  if (file.type === 'image/svg+xml') {
    const svg = await file.text();
    addFigureImage({ svg, ratio: svgRatio(svg) ?? size.h / size.w });
    notify('構造式を図に置きました (ベクター)');
    return;
  }
  addFigureImage({ href, ratio: size.h / (size.w || 1) });
  notify('画像を図に置きました。Word で編集できる形にするには、ツールバーの構造式ボタンから描き直してください');
}

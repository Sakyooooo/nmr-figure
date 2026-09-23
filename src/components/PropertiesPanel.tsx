import {
  deleteSelection,
  edit,
  openStructureEditor,
  pasteAnnotation,
  reorderAnnotation,
  updateAnnotation,
  updateFigureImage,
  useEditor,
} from '../state/store';
import type { Annotation, Dash, FigureStyle } from '../state/types';
import { titleText } from '../lib/layout';
import { Check, ColorInput, NumberInput, Section, TextInput } from './inputs';
import { RichHtml } from './RichText';

export function PropertiesPanel() {
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  if (!selection) return null;

  if (selection.kind === 'integral') {
    return (
      <Section title="選択中の積分">
        <p className="hint">両端の四角をドラッグすると範囲を変えられます。値は下の「積分」で書き換えられます。</p>
        <button className="danger" onClick={deleteSelection}>
          削除 (Delete)
        </button>
      </Section>
    );
  }
  if (selection.kind === 'marker' || selection.kind === 'peakLabel') {
    const marker = selection.kind === 'marker' ? doc.markers.find((m) => m.id === selection.id) : undefined;
    const style = marker && doc.markerStyles.find((s) => s.id === marker.styleId);
    return (
      <Section title={selection.kind === 'marker' ? '選択中のマーカー' : '選択中のピーク値'}>
        {style && (
          <p>
            <RichHtml text={style.name} />
          </p>
        )}
        <button className="danger" onClick={deleteSelection}>
          削除 (Delete)
        </button>
      </Section>
    );
  }
  if (selection.kind === 'image') {
    const image = doc.figureImages.find((x) => x.id === selection.id);
    if (!image) return null;
    return (
      <Section title={image.svg ? '選択中の構造式' : '選択中の画像'}>
        <p className="hint">ドラッグで移動、右下の角で大きさを変えられます。</p>
        <div className="row">
          <label className="field">
            大きさ
            <NumberInput
              value={Math.round(image.w * 100)}
              min={3}
              max={100}
              step={1}
              width={56}
              onCommit={(v) => v !== null && updateFigureImage(image.id, { w: v / 100 })}
            />
            % (図の幅に対して)
          </label>
        </div>
        <div className="row wrap">
          {image.source && <button onClick={() => openStructureEditor(image.id)}>描き直す</button>}
          <button className="danger" onClick={deleteSelection}>
            削除 (Delete)
          </button>
        </div>
        {image.svg ? (
          <p className="hint">ベクターで入っているので、Word / PowerPoint に貼って「図形に変換」すると編集できます。</p>
        ) : (
          <p className="hint warn">貼り付けた画像です。Word では編集できません。編集したいときは、構造式ボタンから描き直してください。</p>
        )}
      </Section>
    );
  }
  if (selection.kind === 'legend') {
    return (
      <Section title="凡例">
        <p className="hint">ドラッグで移動できます。</p>
        <button
          onClick={() =>
            edit((d) => {
              d.figure.legendPos = null;
            })
          }
        >
          右上に戻す
        </button>
      </Section>
    );
  }

  const a = doc.annotations.find((x) => x.id === selection.id);
  if (!a) return null;
  return <AnnotationProps a={a} />;
}

const KIND_LABEL: Record<Annotation['kind'], string> = {
  ellipse: '楕円',
  rect: '四角',
  arrow: '矢印',
  line: '線',
  text: 'テキスト',
};

function AnnotationProps({ a }: { a: Annotation }) {
  const set = (patch: Partial<Annotation>) => updateAnnotation(a.id, patch);
  const isText = a.kind === 'text';
  return (
    <Section title={`図形: ${KIND_LABEL[a.kind]}`}>
      {isText && (
        <>
          <label className="field block">
            文字 (^{'{..}'} 上付き / _{'{..}'} 下付き)
            <TextInput id="annotation-text" value={a.text} multiline onCommit={(text) => set({ text })} />
          </label>
          <div className="row">
            <label className="field">
              サイズ
              <NumberInput value={a.fontSize} min={6} max={72} width={52} onCommit={(v) => set({ fontSize: v ?? 14 })} />
            </label>
            <label className="field">
              色
              <ColorInput value={a.stroke} onChange={(stroke) => set({ stroke })} />
            </label>
          </div>
        </>
      )}
      {!isText && (
        <>
          <div className="row">
            <label className="field">
              線の色
              <ColorInput value={a.stroke} onChange={(stroke) => set({ stroke })} />
            </label>
            <label className="field">
              太さ
              <NumberInput value={a.strokeWidth} min={0.25} max={12} step={0.25} width={52} onCommit={(v) => set({ strokeWidth: v ?? 1 })} />
            </label>
          </div>
          <div className="row">
            <label className="field">
              線種
              <select value={a.dash} onChange={(e) => set({ dash: e.target.value as Dash })}>
                <option value="solid">実線</option>
                <option value="dashed">破線</option>
                <option value="dotted">点線</option>
              </select>
            </label>
            {(a.kind === 'ellipse' || a.kind === 'rect') && (
              <>
                <Check checked={a.fill !== null} onChange={(v) => set({ fill: v ? '#ffe9a8' : null })}>
                  塗り
                </Check>
                {a.fill !== null && <ColorInput value={a.fill} onChange={(fill) => set({ fill })} />}
              </>
            )}
          </div>
        </>
      )}
      <div className="row wrap">
        <button onClick={() => reorderAnnotation(a.id, true)}>前面へ</button>
        <button onClick={() => reorderAnnotation(a.id, false)}>背面へ</button>
        <button onClick={() => pasteAnnotation(a)} title="Ctrl+D">
          複製
        </button>
        <button className="danger" onClick={deleteSelection} title="Delete">
          削除
        </button>
      </div>
      <p className="hint">図形はスペクトルに固定されるので、拡大や並べ替えをしてもピークからずれません。矢印キーで少しずつ動かせます。</p>
    </Section>
  );
}

export function FigurePanel() {
  const doc = useEditor((s) => s.doc);
  const f = doc.figure;
  const hasData = doc.layers.length > 0 || !!doc.plot2d;
  const is2d = !!doc.plot2d;
  const title = titleText(doc);
  const nuclei = new Set(doc.layers.filter((l) => l.visible).map((l) => doc.spectra.find((s) => s.id === l.spectrumId)?.nucleus));
  const mixed = nuclei.size > 1;
  if (!hasData) return null;
  const set = (patch: Partial<FigureStyle>) =>
    edit((d) => {
      Object.assign(d.figure, patch);
    });

  return (
    <>
      <Section title="図に入れるもの">
        <div className="row wrap">
          <Check checked={f.showTitle} onChange={(v) => set({ showTitle: v })}>
            下のタイトル
          </Check>
          <Check checked={f.showXCaption} onChange={(v) => set({ showXCaption: v })}>
            軸の説明
          </Check>
          <Check checked={f.showBorder} onChange={(v) => set({ showBorder: v })}>
            外枠 (図全体)
          </Check>
          {!is2d && (
            <>
              <Check checked={f.showFrame} onChange={(v) => set({ showFrame: v })}>
                枠
              </Check>
              <Check checked={f.showYAxis} onChange={(v) => set({ showYAxis: v })}>
                縦軸
              </Check>
              <Check checked={f.showLayerLabels} onChange={(v) => set({ showLayerLabels: v })}>
                スペクトル名
              </Check>
              <span title="図から外しても消えません (Delta と同期しているピーク値・積分はそのまま)">
                <Check checked={f.showPeakLabels !== false} onChange={(v) => set({ showPeakLabels: v })}>
                  ピーク値
                </Check>
              </span>
              <span title="図から外しても消えません (Delta と同期しているピーク値・積分はそのまま)">
                <Check checked={f.showIntegrals !== false} onChange={(v) => set({ showIntegrals: v })}>
                  積分
                </Check>
              </span>
            </>
          )}
        </div>
        {f.showTitle && (
          <>
            <div className="row">
              <Check checked={f.titleAuto} onChange={(v) => set({ titleAuto: v })}>
                自動 (核種・周波数・溶媒)
              </Check>
            </div>
            {f.titleAuto ? (
              <p className="hint">
                {title ? (
                  <>
                    いま入るのは <RichHtml text={title} />
                    {mixed && ' (核種が違うスペクトルが混ざっています。一番下のスペクトルから作ります)'}
                  </>
                ) : (
                  'スペクトルがないので、いまは何も入りません'
                )}
              </p>
            ) : (
              <label className="field block">
                <TextInput value={f.title} onCommit={(t) => set({ title: t })} placeholder="^{1}H NMR (400 MHz, CDCl_{3})" />
              </label>
            )}
          </>
        )}
      </Section>

      <Section title="図の設定" defaultOpen={false}>
        <div className="row">
          <label className="field">
            幅
            <NumberInput value={f.width} min={300} max={4000} step={10} width={64} onCommit={(v) => set({ width: v ?? 940 })} />
          </label>
          <label className="field">
            高さ
            <NumberInput value={f.height} min={150} max={4000} step={10} width={64} onCommit={(v) => set({ height: v ?? 400 })} />
          </label>
          <span className="unit">px</span>
        </div>
        <div className="grid2">
          <label className="field">
            目盛り
            <NumberInput value={f.tickFontSize} min={6} max={40} width={48} onCommit={(v) => set({ tickFontSize: v ?? 11 })} />
          </label>
          <label className="field">
            ピーク値
            <NumberInput value={f.peakLabelFontSize} min={6} max={40} width={48} onCommit={(v) => set({ peakLabelFontSize: v ?? 13 })} />
          </label>
          <label className="field">
            タイトル
            <NumberInput value={f.titleFontSize} min={6} max={48} width={48} onCommit={(v) => set({ titleFontSize: v ?? 15 })} />
          </label>
          <label className="field">
            凡例
            <NumberInput value={f.legendFontSize} min={6} max={40} width={48} onCommit={(v) => set({ legendFontSize: v ?? 13 })} />
          </label>
          <label className="field">
            名前
            <NumberInput value={f.layerLabelFontSize} min={6} max={40} width={48} onCommit={(v) => set({ layerLabelFontSize: v ?? 13 })} />
          </label>
          <label className="field">
            マーカー
            <NumberInput value={f.markerSize} min={3} max={30} width={48} onCommit={(v) => set({ markerSize: v ?? 8 })} />
          </label>
        </div>
        <label className="field block">
          フォント
          <select value={f.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            <option value={'"Times New Roman", Times, serif'}>Times New Roman (Delta 風)</option>
            <option value={'Arial, Helvetica, sans-serif'}>Arial</option>
            <option value={'"Yu Gothic", "Meiryo", sans-serif'}>游ゴシック</option>
          </select>
        </label>
      </Section>
    </>
  );
}

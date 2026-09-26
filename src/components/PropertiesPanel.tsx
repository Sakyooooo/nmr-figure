import { tr, trk } from '../i18n';
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
import { drawInChemDraw } from '../state/chemdraw';
import type { Annotation, Dash, FigureStyle } from '../state/types';
import { titleText } from '../lib/layout';
import { Check, ColorInput, NumberInput, Section, TextInput } from './inputs';
import { RichHtml } from './RichText';

/** 選んだものの設定。only で、右のパネルのどのタブに出すものかを絞る (解析: 積分・ピーク値・マーカー / 図: それ以外) */
export function PropertiesPanel({ only }: { only?: 'analysis' | 'figure' }) {
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  if (!selection) return null;
  const analysis = selection.kind === 'integral' || selection.kind === 'marker' || selection.kind === 'peakLabel';
  if ((only === 'analysis' && !analysis) || (only === 'figure' && analysis)) return null;

  if (selection.kind === 'integral') {
    return (
      <Section title={tr('選択中の積分')}>
        <p className="hint">{tr('両端の四角をドラッグすると範囲を変えられます。値は下の「積分」で書き換えられます。')}</p>
        <button className="danger" onClick={deleteSelection}>
          {tr('削除 (Delete)')}
        </button>
      </Section>
    );
  }
  if (selection.kind === 'marker' || selection.kind === 'peakLabel') {
    const marker = selection.kind === 'marker' ? doc.markers.find((m) => m.id === selection.id) : undefined;
    const style = marker && doc.markerStyles.find((s) => s.id === marker.styleId);
    return (
      <Section title={selection.kind === 'marker' ? tr('選択中のマーカー') : tr('選択中のピーク値')}>
        {style && (
          <p>
            <RichHtml text={style.name} />
          </p>
        )}
        <button className="danger" onClick={deleteSelection}>
          {tr('削除 (Delete)')}
        </button>
      </Section>
    );
  }
  if (selection.kind === 'image') {
    const image = doc.figureImages.find((x) => x.id === selection.id);
    if (!image) return null;
    return (
      <Section title={image.cdxml ? tr('選択中の構造式 (ChemDraw)') : image.svg ? tr('選択中の構造式') : tr('選択中の画像')}>
        <p className="hint">{tr('ドラッグで移動、右下の角で大きさを変えられます。')}</p>
        <div className="row">
          <label className="field">
            {tr('大きさ')}
            <NumberInput
              value={Math.round(image.w * 100)}
              min={3}
              max={100}
              step={1}
              width={56}
              onCommit={(v) => v !== null && updateFigureImage(image.id, { w: v / 100 })}
            />
            {tr('% (図の幅に対して)')}
          </label>
        </div>
        <div className="row wrap">
          {image.cdxml && <button onClick={() => void drawInChemDraw(image.id)}>{tr('ChemDraw で直す')}</button>}
          {!image.cdxml && image.source && <button onClick={() => openStructureEditor(image.id)}>{tr('描き直す')}</button>}
          <button className="danger" onClick={deleteSelection}>
            {tr('削除 (Delete)')}
          </button>
        </div>
        {image.cdxml ? (
          <p className="hint">
            {tr('「ChemDraw で直す」(またはダブルクリック) で ChemDraw が開きます。上書き保存すると図も変わります。上に置いた文字は構造式と一緒に動きます。「書き出し > ChemDraw で開く」から Word に貼ると、Word の上でも ChemDraw で直せます。')}
          </p>
        ) : image.svg ? (
          <p className="hint">{tr('ベクターで入っているので、Word / PowerPoint に貼って「図形に変換」すると編集できます。')}</p>
        ) : (
          <p className="hint warn">{tr('貼り付けた画像です。Word では編集できません。編集したいときは、構造式ボタンから描き直してください。')}</p>
        )}
      </Section>
    );
  }
  if (selection.kind === 'legend') {
    return (
      <Section title={tr('凡例')}>
        <p className="hint">{tr('ドラッグで移動、右下の角をドラッグで大きさ (文字とマーカー) を変えられます。')}</p>
        <label className="field">
          {tr('大きさ')}
          <NumberInput
            value={doc.figure.legendFontSize}
            min={6}
            max={40}
            width={48}
            onCommit={(v) =>
              edit((d) => {
                d.figure.legendFontSize = v ?? 13;
              })
            }
          />
        </label>
        <button
          onClick={() =>
            edit((d) => {
              d.figure.legendPos = null;
            })
          }
        >
          {tr('右上に戻す')}
        </button>
      </Section>
    );
  }

  const a = doc.annotations.find((x) => x.id === selection.id);
  if (!a) return null;
  return <AnnotationProps a={a} />;
}

const KIND_LABEL: Record<Annotation['kind'], string> = {
  ellipse: trk('楕円'),
  rect: trk('四角'),
  arrow: trk('矢印'),
  line: trk('線'),
  text: trk('テキスト'),
  cross: trk('交点の線'),
};

function AnnotationProps({ a }: { a: Annotation }) {
  const set = (patch: Partial<Annotation>) => updateAnnotation(a.id, patch);
  const isText = a.kind === 'text';
  return (
    <Section title={tr('図形: {v0}', { v0: tr(KIND_LABEL[a.kind]) })}>
      {isText && (
        <>
          <label className="field block">
            {tr('文字 (^{a} 上付き / _{a} 下付き)', { a: '{..}' })}
            <TextInput id="annotation-text" value={a.text} multiline onCommit={(text) => set({ text })} />
          </label>
          <div className="row">
            <label className="field">
              {tr('サイズ')}
              <NumberInput value={a.fontSize} min={6} max={72} width={52} onCommit={(v) => set({ fontSize: v ?? 14 })} />
            </label>
            <label className="field">
              {tr('色')}
              <ColorInput value={a.stroke} onChange={(stroke) => set({ stroke })} />
            </label>
          </div>
        </>
      )}
      {!isText && (
        <>
          <div className="row">
            <label className="field">
              {tr('線の色')}
              <ColorInput value={a.stroke} onChange={(stroke) => set({ stroke })} />
            </label>
            <label className="field">
              {tr('太さ')}
              <NumberInput value={a.strokeWidth} min={0.25} max={12} step={0.25} width={52} onCommit={(v) => set({ strokeWidth: v ?? 1 })} />
            </label>
          </div>
          <div className="row">
            <label className="field">
              {tr('線種')}
              <select value={a.dash} onChange={(e) => set({ dash: e.target.value as Dash })}>
                <option value="solid">{tr('実線')}</option>
                <option value="dashed">{tr('破線')}</option>
                <option value="dotted">{tr('点線')}</option>
              </select>
            </label>
            {a.kind === 'cross' && (
              <Check checked={!!a.showValues} onChange={(v) => set({ showValues: v })}>
                {tr('ppm の値を書く')}
              </Check>
            )}
            {(a.kind === 'ellipse' || a.kind === 'rect') && (
              <>
                <Check checked={a.fill !== null} onChange={(v) => set({ fill: v ? '#ffe9a8' : null })}>
                  {tr('塗り')}
                </Check>
                {a.fill !== null && <ColorInput value={a.fill} onChange={(fill) => set({ fill })} />}
              </>
            )}
          </div>
        </>
      )}
      <div className="row wrap">
        <button onClick={() => reorderAnnotation(a.id, true)}>{tr('前面へ')}</button>
        <button onClick={() => reorderAnnotation(a.id, false)}>{tr('背面へ')}</button>
        <button onClick={() => pasteAnnotation(a)} title="Ctrl+D">
          {tr('複製')}
        </button>
        <button className="danger" onClick={deleteSelection} title="Delete">
          {tr('削除')}
        </button>
      </div>
      <p className="hint">{tr('図形はスペクトルに固定されるので、拡大や並べ替えをしてもピークからずれません。矢印キーで少しずつ動かせます。')}</p>
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
      <Section title={tr('図に入れるもの')}>
        <div className="row wrap">
          <Check checked={f.showTitle} onChange={(v) => set({ showTitle: v })}>
            {tr('下のタイトル')}
          </Check>
          <Check checked={f.showXCaption} onChange={(v) => set({ showXCaption: v })}>
            {tr('軸の説明')}
          </Check>
          <Check checked={f.showBorder} onChange={(v) => set({ showBorder: v })}>
            {tr('外枠 (図全体)')}
          </Check>
          {!is2d && (
            <>
              <Check checked={f.showFrame} onChange={(v) => set({ showFrame: v })}>
                {tr('枠')}
              </Check>
              <Check checked={f.showYAxis} onChange={(v) => set({ showYAxis: v })}>
                {tr('縦軸')}
              </Check>
              <Check checked={f.showLayerLabels} onChange={(v) => set({ showLayerLabels: v })}>
                {tr('スペクトル名')}
              </Check>
              <span title={tr('図から外しても消えません (Delta と同期しているピーク値・積分はそのまま)')}>
                <Check checked={f.showPeakLabels !== false} onChange={(v) => set({ showPeakLabels: v })}>
                  {tr('ピーク値')}
                </Check>
              </span>
              <span title={tr('図から外しても消えません (Delta と同期しているピーク値・積分はそのまま)')}>
                <Check checked={f.showIntegrals !== false} onChange={(v) => set({ showIntegrals: v })}>
                  {tr('積分')}
                </Check>
              </span>
            </>
          )}
        </div>
        {f.showTitle && (
          <>
            <div className="row">
              <Check checked={f.titleAuto} onChange={(v) => set({ titleAuto: v })}>
                {tr('自動 (核種・周波数・溶媒)')}
              </Check>
            </div>
            {f.titleAuto ? (
              <p className="hint">
                {title ? (
                  <>
                    {tr('いま入るのは')}{' '}<RichHtml text={title} />
                    {mixed && tr(' (核種が違うスペクトルが混ざっています。一番下のスペクトルから作ります)')}
                  </>
                ) : (
                  tr('スペクトルがないので、いまは何も入りません')
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

      <Section title={tr('図の設定')} defaultOpen={false}>
        <div className="row">
          <label className="field">
            {tr('幅')}
            <NumberInput value={f.width} min={300} max={4000} step={10} width={64} onCommit={(v) => set({ width: v ?? 940 })} />
          </label>
          <label className="field">
            {tr('高さ')}
            <NumberInput value={f.height} min={150} max={4000} step={10} width={64} onCommit={(v) => set({ height: v ?? 400 })} />
          </label>
          <span className="unit">px</span>
        </div>
        <div className="grid2">
          <label className="field">
            {tr('目盛り')}
            <NumberInput value={f.tickFontSize} min={6} max={40} width={48} onCommit={(v) => set({ tickFontSize: v ?? 11 })} />
          </label>
          <label className="field">
            {tr('ピーク値')}
            <NumberInput value={f.peakLabelFontSize} min={6} max={40} width={48} onCommit={(v) => set({ peakLabelFontSize: v ?? 13 })} />
          </label>
          <label className="field">
            {tr('タイトル')}
            <NumberInput value={f.titleFontSize} min={6} max={48} width={48} onCommit={(v) => set({ titleFontSize: v ?? 15 })} />
          </label>
          <label className="field">
            {tr('凡例')}
            <NumberInput value={f.legendFontSize} min={6} max={40} width={48} onCommit={(v) => set({ legendFontSize: v ?? 13 })} />
          </label>
          <label className="field">
            {tr('名前')}
            <NumberInput value={f.layerLabelFontSize} min={6} max={40} width={48} onCommit={(v) => set({ layerLabelFontSize: v ?? 13 })} />
          </label>
          <label className="field">
            {tr('マーカー')}
            <NumberInput value={f.markerSize} min={3} max={30} width={48} onCommit={(v) => set({ markerSize: v ?? 8 })} />
          </label>
        </div>
        <label className="field block">
          {tr('フォント')}
          <select value={f.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })}>
            <option value={'"Times New Roman", Times, serif'}>{tr('Times New Roman (Delta 風)')}</option>
            <option value={'Arial, Helvetica, sans-serif'}>Arial</option>
            <option value={'"Yu Gothic", "Meiryo", sans-serif'}>{tr('游ゴシック')}</option>
          </select>
        </label>
      </Section>
    </>
  );
}

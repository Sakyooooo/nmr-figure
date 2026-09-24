import { tr } from '../i18n';
import { useState } from 'react';
import { downloadBlob } from '../lib/exportFigure';
import { templatesFromJson, templatesToJson } from '../lib/settings';
import { ask } from '../state/dialog';
import { applyTemplate, notify, saveTemplate, updateSettings, useEditor } from '../state/store';
import { Check, Section } from './inputs';

export function TemplatePanel() {
  const templates = useEditor((s) => s.settings.templates);
  const defaultId = useEditor((s) => s.settings.defaultTemplateId);
  const hasData = useEditor((s) => s.doc.layers.length > 0);
  const [selectedId, setSelectedId] = useState<string>('');
  const [name, setName] = useState('');
  const [withRange, setWithRange] = useState(true);
  if (!hasData) return null;
  const selected = templates.find((t) => t.id === selectedId);

  const importFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const list = templatesFromJson(await file.text());
        updateSettings((s) => {
          for (const t of list) {
            const i = s.templates.findIndex((x) => x.name === t.name);
            const item = { ...t, id: i >= 0 ? s.templates[i].id : crypto.randomUUID() };
            if (i >= 0) s.templates[i] = item;
            else s.templates.push(item);
          }
        });
        notify(tr('{length} 件のテンプレートを読み込みました', { length: list.length }));
      } catch (e) {
        notify(tr('読み込めませんでした: {message}', { message: (e as Error).message }), 'error');
      }
    };
    input.click();
  };

  return (
    <Section
      title={tr('スタイルのテンプレート')}
      defaultOpen={false}
      help={tr('文字の大きさ・フォント・線の色・表示の設定などをまとめて保存します。★の付いた既定のテンプレートは、新しく .jdf を開いたときに自動で当たります。')}
    >
      <div className="row">
        <select className="grow" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
          <option value="">{tr('テンプレートを選ぶ ({n})', { n: templates.length })}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.id === defaultId ? '★ ' : ''}
              {t.name}
              {t.range ? tr(' ({nucleus} {fmt}〜{fmt2})', { nucleus: t.range.nucleus, fmt: fmt(t.range.xMax), fmt2: fmt(t.range.xMin) }) : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="row wrap">
        <button
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            applyTemplate(selected);
            notify(tr('「{name}」を当てました', { name: selected.name }));
          }}
        >
          {tr('当てる')}
        </button>
        <button
          disabled={!selected}
          onClick={() =>
            updateSettings((s) => {
              s.defaultTemplateId = s.defaultTemplateId === selectedId ? null : selectedId;
            })
          }
        >
          {selected && selected.id === defaultId ? tr('既定を外す') : tr('既定にする')}
        </button>
        <button
          className="danger"
          disabled={!selected}
          onClick={async () => {
            if (!selected) return;
            const ok = await ask(tr('テンプレートの削除'), tr('「{name}」を削除しますか？', { name: selected.name }), [{ label: tr('削除'), value: 'delete', kind: 'danger' }]);
            if (ok !== 'delete') return;
            updateSettings((s) => {
              s.templates = s.templates.filter((t) => t.id !== selectedId);
              if (s.defaultTemplateId === selectedId) s.defaultTemplateId = null;
            });
            setSelectedId('');
          }}
        >
          {tr('削除')}
        </button>
      </div>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const n = name.trim() || selected?.name;
          if (!n) return;
          const result = saveTemplate(n, withRange);
          notify(result === 'updated' ? tr('「{n}」を上書きしました', { n }) : tr('「{n}」を保存しました', { n }));
          setName('');
        }}
      >
        <div className="row">
          <input type="text" className="grow" placeholder={selected ? tr('{name} (上書き)', { name: selected.name }) : tr('例: 1H 反応追跡')} value={name} onChange={(e) => setName(e.target.value)} />
          <button type="submit">{tr('今の見た目を保存')}</button>
        </div>
        <Check checked={withRange} onChange={setWithRange}>
          {tr('表示範囲も保存する (同じ核種のときだけ当たります)')}
        </Check>
      </form>

      <div className="row wrap">
        <button disabled={!templates.length} onClick={() => downloadBlob(new Blob([templatesToJson(templates)], { type: 'application/json' }), 'nmr-templates.json')}>
          {tr('ファイルに書き出す')}
        </button>
        <button onClick={importFile}>{tr('ファイルから読み込む')}</button>
      </div>
      <p className="hint">{tr('研究室で共有するときは、書き出したファイルを渡して読み込んでもらってください。')}</p>
    </Section>
  );
}

function fmt(v: number) {
  return Number(v.toFixed(2));
}

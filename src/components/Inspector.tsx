import { setInspectorTab, useEditor, type InspectorTab } from '../state/store';
import { ImpurityPanel, MarkerPanel } from './ImpurityPanel';
import { IntegralPanel } from './IntegralPanel';
import { PeakPanel } from './PeakPanel';
import { Plot2dPanel } from './Plot2dPanel';
import { ProcessingPanel } from './ProcessingPanel';
import { FigurePanel, PropertiesPanel } from './PropertiesPanel';
import { SiPanel } from './SiPanel';
import { SyncPanel } from './SyncPanel';
import { TemplatePanel } from './TemplatePanel';
import { TrendPanel } from './TrendPanel';

const TABS: { id: InspectorTab; label: string }[] = [
  { id: 'analysis', label: '解析' },
  { id: 'figure', label: '図' },
  { id: 'record', label: '記録' },
];

/**
 * 右のパネル。解析 (積分・ピーク値・不純物…) / 図 (図に入れるもの・大きさ・テンプレート) / 記録 (Delta との同期・編集記録)。
 * 選んだものの設定は、そのタブの一番上に出る (選ぶとタブも切り替わる)
 */
export function Inspector() {
  const tab = useEditor((s) => s.inspectorTab);
  const canvasTab = useEditor((s) => s.canvasTab);
  const is2d = useEditor((s) => !!s.doc.plot2d);

  if (is2d) {
    return (
      <div className="inspector-body">
        <Plot2dPanel />
        <FigurePanel />
        <TemplatePanel />
      </div>
    );
  }
  if (canvasTab === 'trend') {
    return (
      <div className="inspector-body">
        <TrendPanel />
      </div>
    );
  }
  return (
    <>
      <div className="tabs" role="tablist" aria-label="右のパネル">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`inspector-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="inspector-panel"
            className={`tab${tab === t.id ? ' on' : ''}`}
            onClick={() => setInspectorTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="inspector-body" role="tabpanel" id="inspector-panel" aria-labelledby={`inspector-tab-${tab}`}>
        {tab === 'analysis' && (
          <>
            <PropertiesPanel only="analysis" />
            <ProcessingPanel />
            <IntegralPanel />
            <PeakPanel />
            <ImpurityPanel />
            <MarkerPanel />
            <SiPanel />
            <TrendPanel />
          </>
        )}
        {tab === 'figure' && (
          <>
            <PropertiesPanel only="figure" />
            <FigurePanel />
            <TemplatePanel />
          </>
        )}
        {tab === 'record' && <SyncPanel />}
      </div>
    </>
  );
}

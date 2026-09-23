/**
 * Delta との同期の様子と、記録 (どの時点の中身にも戻せる)。選んでいるスペクトルのぶんを出す。
 */
import { useEffect, useState } from 'react';
import { summary } from '../lib/deltaSync';
import { exportEntry, grantDeltaWrite, restoreEntry, restoreOriginal, useSync, type LinkView } from '../state/deltaSync';
import { historyOf, originalOf, useHistory, type HistoryEntry } from '../state/history';
import { useEditor } from '../state/store';
import { Section } from './inputs';

export function SyncPanel() {
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const view = useSync((s) => (activeLayerId ? s.links[activeLayerId] : undefined));
  const fileName = view?.fileName ?? '';
  const version = useHistory((s) => (fileName ? (s.version[fileName] ?? 0) : 0));
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hasOriginal, setHasOriginal] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!fileName) {
      setEntries([]);
      setHasOriginal(false);
      return;
    }
    void historyOf(fileName).then((list) => alive && setEntries([...list].reverse()));
    void originalOf(fileName).then((o) => alive && setHasOriginal(!!o));
    return () => {
      alive = false;
    };
  }, [fileName, version]);

  if (!activeLayerId || !view) return null;
  const layerId = activeLayerId;

  return (
    <Section title="Delta との同期・記録" extra={<StatusBadge view={view} />}>
      <SyncStatus view={view} layerId={layerId} />
      {view.status !== 'duplicate' && (
        <>
          <p className="hint">
            このソフトでピーク値・積分を変えると、{view.fileName} にそのまま書き込みます。Delta で保存した中身は、自動でこちらに入ります。
            Delta で開いたままのときは、Delta でファイルを開き直すと反映されます。
          </p>
          {entries.length > 0 && (
            <div className="history">
              <div className="history-head">記録 ({entries.length})</div>
              <ul>
                {entries.map((e) => (
                  <li key={e.id} className={open === e.id ? 'open' : ''}>
                    <button className="history-row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      <span className={`badge from-${e.source}`}>{e.source === 'delta' ? 'Delta' : 'このソフト'}</span>
                      <span className="history-time">{timeText(e.at)}</span>
                      <span className="history-note">{e.note}</span>
                      <span className="muted">{summary(e.annotations)}</span>
                    </button>
                    {open === e.id && <EntryDetail entry={e} layerId={layerId} />}
                  </li>
                ))}
              </ul>
              {hasOriginal && (
                <div className="row">
                  <button className="link" onClick={() => void restoreOriginal(layerId)} title="このソフトで初めて書き込む前のファイル (スペクトルも注釈も) に戻します">
                    このソフトで書き込む前のファイルに戻す
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function StatusBadge({ view }: { view: LinkView }) {
  const label: Record<LinkView['status'], string> = {
    waiting: '待機中',
    synced: '同期中',
    pending: '書き込み待ち',
    'need-permission': '許可が必要',
    error: 'エラー',
    duplicate: '同期しない',
  };
  return <span className={`badge sync-${view.status}`}>{label[view.status]}</span>;
}

function SyncStatus({ view, layerId }: { view: LinkView; layerId: string }) {
  if (view.status === 'need-permission') {
    return (
      <div className="sync-alert">
        <p className="hint warn">{view.message}</p>
        <button className="primary" onClick={() => void grantDeltaWrite(layerId)}>
          書き込みを許可する
        </button>
      </div>
    );
  }
  if (view.status === 'synced' || view.status === 'pending') {
    const when = view.lastSyncAt ? timeText(view.lastSyncAt) : '';
    const dir = view.direction === 'pull' ? 'Delta → このソフト' : view.direction === 'push' ? 'このソフト → Delta' : '同じ中身';
    return (
      <p className="hint">
        {view.status === 'pending' ? '変更を Delta に書き込みます…' : `${view.fileName} と同じ中身です${when ? ` (最後に合わせた: ${when}、${dir})` : ''}`}
      </p>
    );
  }
  return <p className={`hint${view.status === 'error' ? ' warn' : ''}`}>{view.message}</p>;
}

function EntryDetail({ entry, layerId }: { entry: HistoryEntry; layerId: string }) {
  const { annotations: a, shown } = entry;
  return (
    <div className="history-detail">
      {a.integrals.length > 0 && (
        <table className="table compact">
          <thead>
            <tr>
              <th>積分 (ppm)</th>
              <th>値</th>
            </tr>
          </thead>
          <tbody>
            {a.integrals.map((x, i) => (
              <tr key={i}>
                <td className="nowrap">
                  {Math.max(x.from, x.to).toFixed(3)} – {Math.min(x.from, x.to).toFixed(3)}
                </td>
                <td>{shown[i] !== undefined ? shown[i].toFixed(2) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {a.peaks.length > 0 && (
        <p className="hint">
          ピーク値: {a.peaks
            .map((p) => p.ppm)
            .sort((x, y) => y - x)
            .map((p) => p.toFixed(3))
            .join(', ')}
        </p>
      )}
      {!a.integrals.length && !a.peaks.length && <p className="hint">ピーク値・積分なし</p>}
      <div className="row wrap">
        <button onClick={() => void restoreEntry(layerId, entry)} title="図と Delta のファイルを、この時点の中身にします (今の中身は記録に残ります)">
          この時点に戻す
        </button>
        <button onClick={() => void exportEntry(layerId, entry)} title="この時点の中身で、別の .jdf を作ります (元のファイルは変えません)">
          別の .jdf に書き出す
        </button>
      </div>
    </div>
  );
}

function timeText(ms: number) {
  return new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

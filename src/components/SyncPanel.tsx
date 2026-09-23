/**
 * 編集記録と、Delta との同期の様子。選んでいるスペクトルのぶんを出す。
 * - 「記録を付ける」: 好きなときに今の中身を残す (メモは任意)。一覧の中心はこれ
 * - 自動の控え: 同期のたびに残るもの (上書きされた中身を戻すため)。ふだんは畳んでおく
 */
import { useEffect, useState } from 'react';
import { summary } from '../lib/deltaSync';
import { exportEntry, grantDeltaWrite, recordNow, restoreEntry, restoreOriginal, useSync, type LinkView } from '../state/deltaSync';
import { deleteRecord, historyOf, originalOf, updateMemo, useHistory, type HistoryEntry } from '../state/history';
import { useEditor } from '../state/store';
import { Section, TextInput } from './inputs';

export function SyncPanel() {
  const activeLayerId = useEditor((s) => s.activeLayerId);
  const view = useSync((s) => (activeLayerId ? s.links[activeLayerId] : undefined));
  // 記録を付けられるスペクトル (文献から作ったもの以外の 1D)。文字列で取り出す (オブジェクトを返すと描き直しが止まらない)
  const layerFile = useEditor((s) => {
    const layer = s.doc.layers.find((l) => l.id === s.activeLayerId);
    const meta = layer && s.doc.spectra.find((x) => x.id === layer.spectrumId);
    return meta && !meta.simulated ? meta.fileName : '';
  });
  const synced = !!view && view.status !== 'duplicate';
  // .jdf のファイルに届いている (書き出し・最初のファイルに戻すが使える)
  const hasFile = synced && view.status !== 'waiting';
  const fileName = synced ? view.fileName : layerFile;
  const version = useHistory((s) => (fileName ? (s.version[fileName] ?? 0) : 0));
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [hasOriginal, setHasOriginal] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [memo, setMemo] = useState('');

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

  if (!activeLayerId || !fileName) return null;
  const layerId = activeLayerId;
  const records = entries.filter((e) => e.manual);
  const autos = entries.filter((e) => !e.manual);
  const record = () => {
    void recordNow(layerId, memo);
    setMemo('');
  };

  return (
    <Section title={synced ? 'Delta との同期・記録' : '編集記録'} extra={synced ? <StatusBadge view={view} /> : undefined}>
      {synced && <SyncStatus view={view} layerId={layerId} />}

      <div className="record-form">
        <input
          type="text"
          value={memo}
          placeholder="メモ (任意)"
          onChange={(e) => setMemo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) record();
          }}
        />
        <button className="primary" onClick={record} title="今のピーク値・積分を記録に残します。あとからこの時点に戻せます">
          記録を付ける
        </button>
      </div>

      {records.length > 0 ? (
        <div className="history">
          <div className="history-head">記録 ({records.length})</div>
          <ul>
            {records.map((e) => (
              <li key={e.id} className={open === e.id ? 'open' : ''}>
                <button className="history-row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <span className="history-time">{timeText(e.at)}</span>
                  <span className={`history-note${e.memo ? '' : ' muted'}`}>{e.memo || '(メモなし)'}</span>
                  <span className="muted">{summary(e.annotations)}</span>
                </button>
                {open === e.id && <EntryDetail entry={e} fileName={fileName} layerId={layerId} hasFile={hasFile} />}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="hint">「記録を付ける」を押すと、今のピーク値・積分が残り、あとからこの時点に戻せます。</p>
      )}

      {synced && (
        <p className="hint">
          ピーク値・積分を変えると {view.fileName} にそのまま書き込み、Delta で保存した中身は自動でこちらに入ります。
          Delta で開いたままのときは、Delta でファイルを開き直すと反映されます。
        </p>
      )}

      {(autos.length > 0 || hasOriginal) && (
        <details className="sub">
          <summary>
            自動の控え ({autos.length}) — 同期のたびに残る中身。上書きされたものを戻すとき用
          </summary>
          {autos.length > 0 && (
            <div className="history">
              <ul>
                {autos.map((e) => (
                  <li key={e.id} className={open === e.id ? 'open' : ''}>
                    <button className="history-row" onClick={() => setOpen(open === e.id ? null : e.id)}>
                      <span className={`badge from-${e.source}`}>{e.source === 'delta' ? 'Delta' : 'このソフト'}</span>
                      <span className="history-time">{timeText(e.at)}</span>
                      <span className="history-note">{e.note}</span>
                      <span className="muted">{summary(e.annotations)}</span>
                    </button>
                    {open === e.id && <EntryDetail entry={e} fileName={fileName} layerId={layerId} hasFile={hasFile} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {hasOriginal && hasFile && (
            <div className="row">
              <button className="link" onClick={() => void restoreOriginal(layerId)} title="このソフトで初めて書き込む前のファイル (スペクトルも注釈も) に戻します">
                このソフトで書き込む前のファイルに戻す
              </button>
            </div>
          )}
        </details>
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

function EntryDetail({ entry, fileName, layerId, hasFile }: { entry: HistoryEntry; fileName: string; layerId: string; hasFile: boolean }) {
  const { annotations: a, shown } = entry;
  return (
    <div className="history-detail">
      {entry.manual && (
        <label className="field block">
          メモ
          <TextInput value={entry.memo ?? ''} placeholder="(メモなし)" onCommit={(v) => void updateMemo(fileName, entry.id, v.trim())} />
        </label>
      )}
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
        <button
          onClick={() => void restoreEntry(layerId, entry)}
          title={hasFile ? '図と Delta のファイルを、この時点の中身にします (今の中身は自動の控えに残ります)' : '図のピーク値・積分を、この時点の中身にします'}
        >
          この時点に戻す
        </button>
        {hasFile && (
          <button onClick={() => void exportEntry(layerId, entry)} title="この時点の中身で、別の .jdf を作ります (元のファイルは変えません)">
            別の .jdf に書き出す
          </button>
        )}
        {entry.manual && (
          <button className="danger" onClick={() => void deleteRecord(fileName, entry.id)} title="この記録を消します (図や Delta のファイルは変わりません)">
            記録を消す
          </button>
        )}
      </div>
    </div>
  );
}

function timeText(ms: number) {
  return new Date(ms).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

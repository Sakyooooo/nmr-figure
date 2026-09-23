import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { SolventKey } from '../lib/impurityTypes';
import { nucleusDefaults, nucleusRich } from '../lib/nuclei';
import { labReference } from '../lib/settings';
import { SOLVENTS, tableResidual } from '../lib/solvents';
import { setReferenceOffset, updateSettings, useEditor } from '../state/store';
import { NumberInput } from './inputs';
import { RichHtml } from './RichText';
import { ICON_LICENSE } from './iconPaths';

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? ' wide' : ''}`} onClose={onClose} onCancel={onClose}>
      <header>
        <h2>{title}</h2>
        <button className="mini" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function ReferenceDialog() {
  const pending = useEditor((s) => s.pendingReference);
  const doc = useEditor((s) => s.doc);
  const settings = useEditor((s) => s.settings);
  if (!pending) return null;
  const layer = doc.layers.find((l) => l.id === pending.layerId);
  const meta = layer && doc.spectra.find((s) => s.id === layer.spectrumId);
  if (!meta) return null;
  const suggested = labReference(settings, meta.solvent, meta.nucleus);
  return <ReferenceForm key={pending.ppm} observed={pending.ppm} suggested={suggested} solvent={meta.solvent} layerId={pending.layerId} />;
}

function ReferenceForm({ observed, suggested, solvent, layerId }: { observed: number; suggested: number | null; solvent: SolventKey | null; layerId: string }) {
  const [value, setValue] = useState(String(suggested ?? observed.toFixed(3)));
  const close = () => useEditor.setState({ pendingReference: null });
  const target = Number(value);
  return (
    <Modal title="基準合わせ" onClose={close}>
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (Number.isFinite(target)) setReferenceOffset(layerId, observed, target);
        }}
      >
        <p>
          クリックしたピーク: <b>{observed.toFixed(4)} ppm</b>
        </p>
        <label className="field block">
          このピークを何 ppm にしますか
          <input type="number" step="0.001" value={value} autoFocus onChange={(e) => setValue(e.target.value)} />
        </label>
        {suggested !== null && solvent && (
          <p className="hint">
            {solvent} の基準値 {suggested} ppm を入れています (設定で変更できます)。
          </p>
        )}
        <div className="actions">
          <button type="button" onClick={close}>
            キャンセル
          </button>
          <button type="submit" className="primary" disabled={!Number.isFinite(target)}>
            合わせる ({Number.isFinite(target) ? `${target - observed >= 0 ? '+' : ''}${(target - observed).toFixed(4)}` : '—'} ppm)
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useEditor((s) => s.settings);
  const [newName, setNewName] = useState('');
  return (
    <Modal title="設定" onClose={onClose} wide>
      <section>
        <h3>研究室の基準値 (溶媒ピーク)</h3>
        <p className="hint">空欄なら Fulmer et al. (2010) の値を使います。不純物の照合も、この値との差だけずらして行います。</p>
        <table className="table">
          <thead>
            <tr>
              <th>溶媒</th>
              <th>
                <RichHtml text="^{1}H" />
              </th>
              <th>
                <RichHtml text="^{13}C" />
              </th>
            </tr>
          </thead>
          <tbody>
            {SOLVENTS.map((s) => (
              <tr key={s.key}>
                <td>
                  <RichHtml text={s.label} />
                </td>
                {['1H', '13C'].map((nuc) => (
                  <td key={nuc}>
                    <NumberInput
                      value={settings.references[s.key]?.[nuc] ?? null}
                      placeholder={String(tableResidual(s.key, nuc) ?? '')}
                      allowEmpty
                      step={0.01}
                      width={80}
                      onCommit={(v) =>
                        updateSettings((d) => {
                          const row = (d.references[s.key] ??= {});
                          if (v === null) delete row[nuc];
                          else row[nuc] = v;
                        })
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h3>照合の許容幅 (ppm)</h3>
        <div className="row">
          {['1H', '13C', '19F', '31P'].map((nuc) => (
            <label key={nuc} className="field">
              <RichHtml text={nucleusRich(nuc)} />
              <NumberInput
                value={settings.tolerances[nuc] ?? nucleusDefaults(nuc).tolerance}
                step={0.01}
                min={0.001}
                width={64}
                onCommit={(v) =>
                  updateSettings((d) => {
                    if (v === null) delete d.tolerances[nuc];
                    else d.tolerances[nuc] = v;
                  })
                }
              />
            </label>
          ))}
        </div>
        <p className="hint">水・OH・NH はこの5倍の幅で探します (濃度や温度で動くため)。</p>
      </section>

      <section>
        <h3>自作の不純物</h3>
        <p className="hint">
          <RichHtml text="^{19}F・^{31}P" /> や研究室でよく見る化合物を登録できます。値は研究室の基準で測ったものをそのまま入れてください。
        </p>
        <table className="table">
          <thead>
            <tr>
              <th>名前</th>
              <th>核種</th>
              <th>溶媒</th>
              <th>δ (カンマ区切り)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {settings.customImpurities.map((c, i) => (
              <tr key={c.id}>
                <td>
                  <input
                    type="text"
                    value={c.name}
                    onChange={(e) =>
                      updateSettings((d) => {
                        d.customImpurities[i].name = e.target.value;
                      })
                    }
                  />
                </td>
                <td>
                  <select
                    value={c.nucleus}
                    onChange={(e) =>
                      updateSettings((d) => {
                        d.customImpurities[i].nucleus = e.target.value;
                      })
                    }
                  >
                    {['1H', '13C', '19F', '31P', '11B', '29Si'].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    value={c.solvent}
                    onChange={(e) =>
                      updateSettings((d) => {
                        d.customImpurities[i].solvent = e.target.value as SolventKey | 'any';
                      })
                    }
                  >
                    <option value="any">すべて</option>
                    {SOLVENTS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.key}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <ShiftListInput
                    value={c.shifts}
                    onCommit={(shifts) =>
                      updateSettings((d) => {
                        d.customImpurities[i].shifts = shifts;
                      })
                    }
                  />
                </td>
                <td>
                  <button
                    className="mini danger"
                    onClick={() =>
                      updateSettings((d) => {
                        d.customImpurities.splice(i, 1);
                      })
                    }
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            updateSettings((d) => {
              d.customImpurities.push({ id: crypto.randomUUID(), name: newName.trim(), nucleus: '31P', solvent: 'any', shifts: [] });
            });
            setNewName('');
          }}
        >
          <input type="text" placeholder="例: P(OMe)_{3}" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit">追加</button>
        </form>
      </section>

      <section>
        <h3>書き出し</h3>
        <label className="field">
          PNG の解像度
          <NumberInput
            value={settings.pngScale}
            min={1}
            max={8}
            step={0.5}
            width={52}
            onCommit={(v) =>
              updateSettings((d) => {
                d.pngScale = v ?? 3;
              })
            }
          />
          倍
        </label>
      </section>
      <p className="hint">設定はこのブラウザに保存されます (図のファイルには含まれません)。</p>
      <details className="sub">
        <summary>使っているもの (ライセンス)</summary>
        <p className="hint" style={{ whiteSpace: 'pre-wrap' }}>
          アイコン: {ICON_LICENSE}
          {'\n'}構造式エディタ: Ketcher (EPAM Systems、Apache License 2.0)
        </p>
      </details>
    </Modal>
  );
}

function ShiftListInput({ value, onCommit }: { value: number[]; onCommit: (v: number[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  return (
    <input
      type="text"
      value={text}
      placeholder="140.2, 2.1"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const list = text
          .split(/[,\s、]+/)
          .filter((t) => t !== '')
          .map(Number)
          .filter((v) => Number.isFinite(v));
        onCommit(list);
        setText(list.join(', '));
      }}
    />
  );
}

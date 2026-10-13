import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { addClock, categoryColor, formatMinutes, newSession, uid } from '../constants';
import { db } from '../db';
import { DiagramSVG } from '../diagram/DiagramSVG';
import { exportSessionPdf } from '../export/pdf';
import { go, replace } from '../router';
import type { Drill, Session, SessionItem } from '../types';
import { SaveBadge, useAutosave } from '../useAutosave';

export function SessionEditorView({ id }: { id: string }) {
  const [session, setSession] = useState<Session>();
  const [baseline, setBaseline] = useState<Session>();
  const [missing, setMissing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [exporting, setExporting] = useState(false);
  const stored = useRef(id !== 'new');
  const drills = useLiveQuery(() => db.drills.orderBy('title').toArray(), []);
  const byId = useMemo(() => new Map((drills ?? []).map((d) => [d.id, d])), [drills]);

  useEffect(() => {
    let alive = true;
    if (id === 'new') {
      const s = newSession();
      setSession(s);
      setBaseline(s);
      return;
    }
    db.sessions.get(id).then((s) => {
      if (!alive) return;
      if (!s) return setMissing(true);
      setSession(s);
      setBaseline(s);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const autosave = useAutosave(session, baseline, async (s) => {
    await db.sessions.put({ ...s, updatedAt: Date.now() });
    if (!stored.current) {
      stored.current = true;
      replace(`/session/${s.id}`);
    }
  });

  if (missing) {
    return (
      <div className="page narrow">
        <p>That session no longer exists.</p>
        <a href="#/sessions">Back to sessions</a>
      </div>
    );
  }
  if (!session || !drills) return <div className="page">Loading…</div>;

  const patch = (p: Partial<Session>) => setSession((s) => (s ? { ...s, ...p } : s));
  const setItems = (items: SessionItem[]) => patch({ items });
  const updateItem = (itemId: string, p: Partial<SessionItem>) =>
    setItems(session.items.map((it) => (it.id === itemId ? { ...it, ...p } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= session.items.length) return;
    const items = [...session.items];
    [items[i], items[j]] = [items[j], items[i]];
    setItems(items);
  };

  const total = session.items.reduce((t, it) => t + (it.duration || 0), 0);
  const over = session.plannedDuration > 0 ? total - session.plannedDuration : 0;

  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportSessionPdf(session, byId);
    } catch (e) {
      alert(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete session "${session.title || 'Untitled session'}"?`)) return;
    autosave.cancel();
    await db.sessions.delete(session.id);
    go('/sessions');
  };

  let elapsed = 0;

  return (
    <div className="page session-editor">
      <div className="page-head">
        <a className="back" href="#/sessions">
          ← Sessions
        </a>
        <input
          className="title-input"
          placeholder="Session name, e.g. Tuesday U12 – Playing out from the back"
          value={session.title}
          autoFocus={id === 'new'}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <SaveBadge state={autosave.state} />
        <div className="spacer" />
        <button className="btn ghost danger" onClick={remove} disabled={!stored.current}>
          Delete
        </button>
        <button className="btn primary" onClick={exportPdf} disabled={exporting || !session.items.length}>
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      <div className="session-grid">
        <section>
          <div className="session-summary">
            <div>
              <div className="k">Total</div>
              <div className="v">{formatMinutes(total)}</div>
            </div>
            <div>
              <div className="k">Planned</div>
              <div className="v">{session.plannedDuration ? formatMinutes(session.plannedDuration) : '—'}</div>
            </div>
            {over !== 0 && (
              <div className={over > 0 ? 'warn' : 'ok'}>
                {over > 0 ? `${over} min over` : `${-over} min spare`}
              </div>
            )}
          </div>
          {total > 0 && (
            <div className="timeline">
              {session.items.map((it) => {
                const d = byId.get(it.drillId);
                return (
                  <div
                    key={it.id}
                    title={`${d?.title ?? '(deleted)'} · ${it.duration} min`}
                    style={{ flex: it.duration || 0.0001, background: categoryColor(d?.category ?? '') }}
                  >
                    <span>{d?.title}</span>
                  </div>
                );
              })}
            </div>
          )}

          <ol className="items">
            {session.items.map((it, i) => {
              const d = byId.get(it.drillId);
              const start = elapsed;
              elapsed += it.duration || 0;
              return (
                <li key={it.id} className="item">
                  <div className="item-time">
                    {session.startTime ? addClock(session.startTime, start) : `${start}'`}
                  </div>
                  <div className="item-thumb" onClick={() => d && go(`/drill/${d.id}`)} title="Open drill">
                    {d?.diagrams[0] && <DiagramSVG diagram={d.diagrams[0]} />}
                  </div>
                  <div className="item-main">
                    <div className="item-title">
                      {d ? d.title || 'Untitled drill' : <em className="muted">(deleted drill)</em>}
                      {d && (
                        <span className="cat" style={{ background: categoryColor(d.category) }}>
                          {d.category}
                        </span>
                      )}
                    </div>
                    <input
                      className="item-notes"
                      placeholder="Notes for this session (optional)"
                      value={it.notes}
                      onChange={(e) => updateItem(it.id, { notes: e.target.value })}
                    />
                  </div>
                  <label className="item-dur">
                    <input
                      type="number"
                      min={0}
                      value={it.duration}
                      onChange={(e) => updateItem(it.id, { duration: Math.max(0, Number(e.target.value)) })}
                    />
                    min
                  </label>
                  <div className="item-actions">
                    <button className="btn ghost xs" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                      ↑
                    </button>
                    <button
                      className="btn ghost xs"
                      onClick={() => move(i, 1)}
                      disabled={i === session.items.length - 1}
                      aria-label="Move down"
                    >
                      ↓
                    </button>
                    <button
                      className="btn ghost xs danger"
                      onClick={() => setItems(session.items.filter((x) => x.id !== it.id))}
                      aria-label="Remove from session"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <button className="btn add-drill" onClick={() => setPicker(true)}>
            + Add drill from library
          </button>
        </section>

        <aside className="details">
          <div className="grid2">
            <label className="field">
              <span>Date</span>
              <input type="date" value={session.date} onChange={(e) => patch({ date: e.target.value })} />
            </label>
            <label className="field">
              <span>Start time</span>
              <input type="time" value={session.startTime} onChange={(e) => patch({ startTime: e.target.value })} />
            </label>
            <label className="field">
              <span>Team / group</span>
              <input placeholder="e.g. U12 Blues" value={session.team} onChange={(e) => patch({ team: e.target.value })} />
            </label>
            <label className="field">
              <span>Planned length (min)</span>
              <input
                type="number"
                min={0}
                value={session.plannedDuration}
                onChange={(e) => patch({ plannedDuration: Math.max(0, Number(e.target.value)) })}
              />
            </label>
          </div>
          <label className="field">
            <span>Session objective</span>
            <textarea rows={3} value={session.objective} onChange={(e) => patch({ objective: e.target.value })} />
          </label>
          <label className="field">
            <span>Notes</span>
            <textarea
              rows={5}
              placeholder="Equipment, players unavailable, reminders…"
              value={session.notes}
              onChange={(e) => patch({ notes: e.target.value })}
            />
          </label>
        </aside>
      </div>

      {picker && (
        <DrillPicker
          drills={drills}
          onClose={() => setPicker(false)}
          onPick={(d) =>
            setSession((s) =>
              s ? { ...s, items: [...s.items, { id: uid(), drillId: d.id, duration: d.duration || 10, notes: '' }] } : s,
            )
          }
        />
      )}
    </div>
  );
}

function DrillPicker({ drills, onPick, onClose }: { drills: Drill[]; onPick: (d: Drill) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const needle = q.trim().toLowerCase();
  const shown = drills.filter(
    (d) => !needle || [d.title, d.category, d.tags.join(' ')].some((f) => f.toLowerCase().includes(needle)),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Add drills">
        <div className="modal-head">
          <h3>Add drills</h3>
          <input autoFocus className="search" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="btn primary sm" onClick={onClose}>
            Done
          </button>
        </div>
        {drills.length === 0 ? (
          <p className="muted">
            Your library is empty. <a href="#/drill/new">Create a drill</a> first.
          </p>
        ) : (
          <div className="picker-list">
            {shown.map((d) => (
              <button
                key={d.id}
                className="picker-item"
                onClick={() => {
                  onPick(d);
                  setAdded((a) => [...a, d.id]);
                }}
              >
                <div className="picker-thumb">{d.diagrams[0] && <DiagramSVG diagram={d.diagrams[0]} />}</div>
                <div className="picker-text">
                  <div className="card-title">{d.title || 'Untitled drill'}</div>
                  <div className="muted small">
                    {d.category} · {d.duration} min
                  </div>
                </div>
                {added.includes(d.id) && (
                  <span className="added">Added{added.filter((x) => x === d.id).length > 1 ? ` ×${added.filter((x) => x === d.id).length}` : ''}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { categoryColor, formatMinutes } from '../constants';
import { db } from '../db';
import { go } from '../router';

export function SessionsView() {
  const sessions = useLiveQuery(() => db.sessions.orderBy('date').reverse().toArray(), []);
  const drills = useLiveQuery(() => db.drills.toArray(), []);
  if (!sessions || !drills) return <div className="page">Loading…</div>;
  const byId = new Map(drills.map((d) => [d.id, d]));

  return (
    <div className="page">
      <div className="page-title">
        <h1>Sessions</h1>
        <span className="muted">{sessions.length} sessions</span>
        <div className="spacer" />
        <button className="btn primary" onClick={() => go('/session/new')}>
          + New session
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="empty">
          <p>A session puts drills from your library into a timed plan, such as warm-up, main part and game, and exports it as one PDF.</p>
          <button className="btn primary" onClick={() => go('/session/new')}>
            Plan a session
          </button>
        </div>
      ) : (
        <div className="session-list">
          {sessions.map((s) => {
            const total = s.items.reduce((t, i) => t + (i.duration || 0), 0);
            return (
              <div key={s.id} className="session-row" onClick={() => go(`/session/${s.id}`)}>
                <div className="session-date">
                  {s.date ? new Date(`${s.date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </div>
                <div className="session-main">
                  <div className="card-title">{s.title || 'Untitled session'}</div>
                  <div className="muted small">
                    {[s.team, `${s.items.length} drills`, formatMinutes(total)].filter(Boolean).join(' · ')}
                  </div>
                  <div className="timeline mini">
                    {s.items.map((it) => (
                      <div
                        key={it.id}
                        style={{ flex: it.duration || 0.0001, background: categoryColor(byId.get(it.drillId)?.category ?? '') }}
                      />
                    ))}
                  </div>
                </div>
                <button
                  className="btn ghost xs danger"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm(`Delete session "${s.title || 'Untitled session'}"?`)) await db.sessions.delete(s.id);
                  }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

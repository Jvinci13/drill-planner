import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { CATEGORIES, categoryColor, cloneDrill } from '../constants';
import { db } from '../db';
import { DiagramSVG } from '../diagram/DiagramSVG';
import { exportDrillsPdf } from '../export/pdf';
import { go } from '../router';
import { sampleDrills } from '../samples';
import type { Drill } from '../types';

export function LibraryView() {
  const drills = useLiveQuery(() => db.drills.orderBy('updatedAt').reverse().toArray(), []);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [tag, setTag] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    drills?.forEach((d) => d.tags.forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [drills]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (drills ?? []).filter(
      (d) =>
        (!cat || d.category === cat) &&
        (!tag || d.tags.includes(tag)) &&
        (!needle ||
          [d.title, d.objective, d.instructions, d.tags.join(' '), d.category].some((f) => f.toLowerCase().includes(needle))),
    );
  }, [drills, q, cat, tag]);

  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const exportPicked = async () => {
    const list = (drills ?? []).filter((d) => picked.has(d.id));
    setBusy(true);
    try {
      await exportDrillsPdf(list);
    } catch (e) {
      alert(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  if (!drills) return <div className="page">Loading…</div>;

  if (!drills.length) {
    return (
      <div className="page empty">
        <h1>Your drill library is empty</h1>
        <p>Design a drill on the pitch, add coaching points, then export it as a PDF to share.</p>
        <div className="row center">
          <button className="btn primary" onClick={() => go('/drill/new')}>
            Create a drill
          </button>
          <button className="btn ghost" onClick={() => db.drills.bulkPut(sampleDrills())}>
            Load 3 example drills
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-title">
        <h1>Drill library</h1>
        <span className="muted">{drills.length} drills</span>
        <div className="spacer" />
        {picked.size > 0 && (
          <>
            <button className="btn ghost" onClick={() => setPicked(new Set())}>
              Clear selection
            </button>
            <button className="btn" onClick={exportPicked} disabled={busy}>
              {busy ? 'Exporting…' : `Export ${picked.size} as PDF`}
            </button>
          </>
        )}
        <button className="btn primary" onClick={() => go('/drill/new')}>
          + New drill
        </button>
      </div>

      <div className="filters">
        <input className="search" placeholder="Search drills…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {allTags.length > 0 && (
          <div className="chips">
            {allTags.slice(0, 14).map((t) => (
              <button key={t} className={`chip${tag === t ? ' on' : ''}`} onClick={() => setTag(tag === t ? '' : t)}>
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <p className="muted">No drills match these filters.</p>
      ) : (
        <div className="cards">
          {shown.map((d) => (
            <DrillCard key={d.id} drill={d} picked={picked.has(d.id)} onToggle={() => toggle(d.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DrillCard({ drill, picked, onToggle }: { drill: Drill; picked: boolean; onToggle: () => void }) {
  const duplicate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await db.drills.put(cloneDrill(drill));
  };
  const remove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${drill.title || 'Untitled drill'}"? This cannot be undone.`)) await db.drills.delete(drill.id);
  };
  return (
    <div className={`card${picked ? ' picked' : ''}`} onClick={() => go(`/drill/${drill.id}`)}>
      <div className="thumb">
        {drill.diagrams[0] && <DiagramSVG diagram={drill.diagrams[0]} />}
        <label className="pick" onClick={(e) => e.stopPropagation()} title="Select for export">
          <input type="checkbox" checked={picked} onChange={onToggle} />
        </label>
      </div>
      <div className="card-body">
        <div className="card-title">{drill.title || 'Untitled drill'}</div>
        <div className="card-meta">
          <span className="cat" style={{ background: categoryColor(drill.category) }}>
            {drill.category}
          </span>
          {drill.duration > 0 && <span>{drill.duration} min</span>}
          {drill.players && <span>{drill.players}</span>}
        </div>
        <div className="card-actions">
          <button className="btn ghost xs" onClick={duplicate}>
            Duplicate
          </button>
          <button className="btn ghost xs danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

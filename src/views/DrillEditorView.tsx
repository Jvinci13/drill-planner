import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORIES, cloneDrill, newDrill, uid } from '../constants';
import { db } from '../db';
import { DiagramEditor } from '../diagram/DiagramEditor';
import { exportDrillsPdf } from '../export/pdf';
import { go, replace } from '../router';
import type { Diagram, Drill } from '../types';
import { SaveBadge, useAutosave } from '../useAutosave';

export function DrillEditorView({ id }: { id: string }) {
  const [drill, setDrill] = useState<Drill>();
  const [baseline, setBaseline] = useState<Drill>();
  const [missing, setMissing] = useState(false);
  const [active, setActive] = useState(0);
  const [tagsText, setTagsText] = useState('');
  const [exporting, setExporting] = useState(false);
  const stored = useRef(id !== 'new');

  useEffect(() => {
    let alive = true;
    if (id === 'new') {
      const d = newDrill();
      setDrill(d);
      setBaseline(d);
      return;
    }
    db.drills.get(id).then((d) => {
      if (!alive) return;
      if (!d) return setMissing(true);
      setDrill(d);
      setBaseline(d);
      setTagsText(d.tags.join(', '));
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const autosave = useAutosave(drill, baseline, async (d) => {
    await db.drills.put({ ...d, updatedAt: Date.now() });
    if (!stored.current) {
      stored.current = true;
      replace(`/drill/${d.id}`);
    }
  });

  const patch = useCallback((p: Partial<Drill>) => setDrill((d) => (d ? { ...d, ...p } : d)), []);

  const diagram = drill?.diagrams[Math.min(active, (drill?.diagrams.length ?? 1) - 1)];

  const setDiagram = useCallback(
    (next: Diagram) =>
      setDrill((d) => (d ? { ...d, diagrams: d.diagrams.map((g) => (g.id === next.id ? next : g)) } : d)),
    [],
  );

  if (missing) {
    return (
      <div className="page narrow">
        <p>That drill no longer exists.</p>
        <a href="#/">Back to the library</a>
      </div>
    );
  }
  if (!drill || !diagram) return <div className="page">Loading…</div>;

  const addDiagram = () => {
    const copy: Diagram = {
      ...structuredClone(diagram),
      id: uid(),
      caption: `Progression ${drill.diagrams.length}`,
    };
    patch({ diagrams: [...drill.diagrams, copy] });
    setActive(drill.diagrams.length);
  };

  const removeDiagram = () => {
    if (drill.diagrams.length < 2) return;
    if ((diagram.elements.length || diagram.arrows.length) && !confirm('Delete this diagram?')) return;
    patch({ diagrams: drill.diagrams.filter((g) => g.id !== diagram.id) });
    setActive(Math.max(0, active - 1));
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      await exportDrillsPdf([drill]);
    } catch (e) {
      alert(`PDF export failed: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  };

  const duplicate = async () => {
    const copy = cloneDrill(drill);
    await db.drills.put(copy);
    go(`/drill/${copy.id}`);
  };

  const remove = async () => {
    if (!confirm(`Delete "${drill.title || 'Untitled drill'}"? This cannot be undone.`)) return;
    autosave.cancel(); // a pending save would otherwise recreate it
    await db.drills.delete(drill.id);
    go('/');
  };

  const p = diagram.pitch;
  const areaHint = p.type === 'grid' ? `${p.width} x ${p.height} m` : p.type === 'full' ? 'Full pitch' : p.type === 'half' ? 'Half pitch' : 'Final third';

  return (
    <div className="drill-editor">
      <div className="page-head">
        <a className="back" href="#/">
          ← Library
        </a>
        <input
          className="title-input"
          placeholder="Drill name"
          value={drill.title}
          autoFocus={id === 'new'}
          onChange={(e) => patch({ title: e.target.value })}
        />
        <SaveBadge state={autosave.state} />
        <div className="spacer" />
        <button className="btn ghost" onClick={duplicate} disabled={!stored.current}>
          Duplicate
        </button>
        <button className="btn ghost danger" onClick={remove} disabled={!stored.current}>
          Delete
        </button>
        <button className="btn primary" onClick={exportPdf} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export PDF'}
        </button>
      </div>

      <div className="drill-body">
        <section className="diagram-panel">
          <div className="tabs">
            {drill.diagrams.map((g, i) => (
              <button key={g.id} className={`tab${g.id === diagram.id ? ' on' : ''}`} onClick={() => setActive(i)}>
                {i + 1}. {g.caption || 'Diagram'}
              </button>
            ))}
            <button className="tab add" onClick={addDiagram} title="Add another diagram (copies this one)">
              + Diagram
            </button>
          </div>
          <div className="caption-row">
            <input
              placeholder="Diagram caption, e.g. Setup, Progression 1"
              value={diagram.caption}
              onChange={(e) => setDiagram({ ...diagram, caption: e.target.value })}
            />
            {drill.diagrams.length > 1 && (
              <button className="btn ghost xs danger" onClick={removeDiagram}>
                Remove diagram
              </button>
            )}
          </div>
          <DiagramEditor key={diagram.id} value={diagram} onChange={setDiagram} />
        </section>

        <aside className="details">
          <div className="grid2">
            <label className="field">
              <span>Category</span>
              <select value={drill.category} onChange={(e) => patch({ category: e.target.value })}>
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Duration (min)</span>
              <input
                type="number"
                min={0}
                value={drill.duration}
                onChange={(e) => patch({ duration: Math.max(0, Number(e.target.value)) })}
              />
            </label>
            <label className="field">
              <span>Players</span>
              <input placeholder="e.g. 8v8 + 2 GK" value={drill.players} onChange={(e) => patch({ players: e.target.value })} />
            </label>
            <label className="field">
              <span>Age group</span>
              <input placeholder="e.g. U12" value={drill.ageGroup} onChange={(e) => patch({ ageGroup: e.target.value })} />
            </label>
          </div>
          <label className="field">
            <span>Area</span>
            <input placeholder={areaHint} value={drill.area} onChange={(e) => patch({ area: e.target.value })} />
          </label>
          <label className="field">
            <span>Tags</span>
            <input
              placeholder="comma separated, e.g. pressing, 1v1"
              value={tagsText}
              onChange={(e) => {
                setTagsText(e.target.value);
                patch({
                  tags: e.target.value
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                });
              }}
            />
          </label>
          <TextArea label="Objective" rows={2} value={drill.objective} onChange={(v) => patch({ objective: v })}
            placeholder="What should players get better at?" />
          <TextArea label="Organisation" value={drill.setup} onChange={(v) => patch({ setup: v })}
            placeholder="Area, equipment, how players are set up" />
          <TextArea label="How it works" rows={4} value={drill.instructions} onChange={(v) => patch({ instructions: v })}
            placeholder="Rules, sequence, scoring" />
          <TextArea label="Coaching points" hint="one per line" rows={4} value={drill.coachingPoints}
            onChange={(v) => patch({ coachingPoints: v })} placeholder={'Open body shape\nCheck shoulder before receiving'} />
          <TextArea label="Progressions" hint="one per line" value={drill.progressions}
            onChange={(v) => patch({ progressions: v })} placeholder={'Limit to 2 touches\nAdd a defender'} />
        </aside>
      </div>
    </div>
  );
}

function TextArea({
  label,
  hint,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>
        {label} {hint && <em>({hint})</em>}
      </span>
      <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

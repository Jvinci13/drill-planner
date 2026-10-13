import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR_KEYS, COLORS, PITCH_PRESETS, uid } from '../constants';
import type { Arrow, ArrowKind, Diagram, DiagramElement, ElementKind, PitchType } from '../types';
import { ArrowIcon, DiagramSVG, ElementIcon } from './DiagramSVG';
import { arrowShape, unitScale, viewBox } from './geometry';

type Tool =
  | { t: 'select' }
  | { t: 'place'; kind: ElementKind; color: string; label?: string }
  | { t: 'arrow'; kind: ArrowKind }
  | { t: 'zone' };

type Drag =
  | { type: 'move'; id: string; start: Pt; before: Diagram }
  | { type: 'handle'; id: string; handle: 'start' | 'end' | 'ctrl' | 'resize'; before: Diagram }
  | { type: 'newArrow'; id: string; before: Diagram }
  | { type: 'newZone'; id: string; start: Pt; before: Diagram };

type Pt = { x: number; y: number };

const PLAYER_TOOLS: { color: string; label: string; title: string; key: string }[] = [
  { color: 'red', label: '', title: 'Red team player', key: '1' },
  { color: 'blue', label: '', title: 'Blue team player', key: '2' },
  { color: 'yellow', label: 'N', title: 'Neutral / floater', key: '3' },
  { color: 'orange', label: 'GK', title: 'Goalkeeper', key: '4' },
  { color: 'black', label: 'C', title: 'Coach', key: '5' },
];

const EQUIPMENT: { kind: ElementKind; color: string; title: string; key: string }[] = [
  { kind: 'cone', color: 'orange', title: 'Cone', key: 'C' },
  { kind: 'ball', color: 'auto', title: 'Ball', key: 'B' },
  { kind: 'goal', color: 'auto', title: 'Full-size goal', key: 'G' },
  { kind: 'minigoal', color: 'auto', title: 'Mini goal', key: 'M' },
  { kind: 'mannequin', color: 'yellow', title: 'Mannequin', key: 'D' },
  { kind: 'pole', color: 'red', title: 'Pole', key: 'O' },
  { kind: 'ladder', color: 'yellow', title: 'Agility ladder', key: 'L' },
];

const ARROWS: { kind: ArrowKind; title: string; key: string }[] = [
  { kind: 'pass', title: 'Pass (solid)', key: 'P' },
  { kind: 'run', title: 'Run without ball (dashed)', key: 'R' },
  { kind: 'dribble', title: 'Dribble (wavy)', key: 'W' },
  { kind: 'shot', title: 'Shot (thick)', key: 'S' },
];

/** Single-key tool shortcuts (no modifiers), active whenever focus isn't in a text field. */
const HOTKEYS: Record<string, Tool> = {
  V: { t: 'select' },
  A: { t: 'zone' },
  T: { t: 'place', kind: 'text', color: 'auto' },
  ...Object.fromEntries(
    PLAYER_TOOLS.map((p) => [p.key, { t: 'place', kind: 'player', color: p.color, label: p.label } as Tool]),
  ),
  ...Object.fromEntries(EQUIPMENT.map((q) => [q.key, { t: 'place', kind: q.kind, color: q.color } as Tool])),
  ...Object.fromEntries(ARROWS.map((a) => [a.key, { t: 'arrow', kind: a.kind } as Tool])),
};

const ROTATABLE = new Set<ElementKind>(['goal', 'minigoal', 'mannequin', 'ladder', 'text', 'cone']);

const HINTS: Record<Tool['t'], string> = {
  select: 'Click to select · drag to move · Del delete · Ctrl+D duplicate · letter keys pick tools (hover a tool to see its key)',
  place: 'Click the pitch to place · keep clicking to add more · Esc to finish',
  arrow: 'Drag to draw · drag the middle handle to curve · Esc to finish',
  zone: 'Drag to draw an area · Esc to finish',
};

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function DiagramEditor({ value, onChange }: { value: Diagram; onChange: (d: Diagram) => void }) {
  const [tool, setTool] = useState<Tool>({ t: 'select' });
  const [selected, setSelected] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const undo = useRef<Diagram[]>([]);
  const redo = useRef<Diagram[]>([]);
  const [, bump] = useState(0);

  const commit = useCallback(
    (next: Diagram, before: Diagram = valueRef.current) => {
      undo.current.push(before);
      if (undo.current.length > 200) undo.current.shift();
      redo.current = [];
      onChange(next);
      bump((n) => n + 1);
    },
    [onChange],
  );

  const doUndo = useCallback(() => {
    const prev = undo.current.pop();
    if (!prev) return;
    redo.current.push(valueRef.current);
    onChange(prev);
    bump((n) => n + 1);
  }, [onChange]);

  const doRedo = useCallback(() => {
    const next = redo.current.pop();
    if (!next) return;
    undo.current.push(valueRef.current);
    onChange(next);
    bump((n) => n + 1);
  }, [onChange]);

  const pitch = value.pitch;
  const s = unitScale(pitch);
  const selEl = value.elements.find((e) => e.id === selected);
  const selArrow = value.arrows.find((a) => a.id === selected);

  const updateEl = (id: string, patch: Partial<DiagramElement>) =>
    commit({ ...value, elements: value.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const updateArrow = (id: string, patch: Partial<Arrow>) =>
    commit({ ...value, arrows: value.arrows.map((a) => (a.id === id ? { ...a, ...patch } : a)) });

  const removeSelected = useCallback(() => {
    const v = valueRef.current;
    if (!selected) return;
    commit({
      ...v,
      elements: v.elements.filter((e) => e.id !== selected),
      arrows: v.arrows.filter((a) => a.id !== selected),
    });
    setSelected(null);
  }, [selected, commit]);

  const duplicateSelected = useCallback(() => {
    const v = valueRef.current;
    const off = 2 * unitScale(v.pitch);
    const el = v.elements.find((e) => e.id === selected);
    const ar = v.arrows.find((a) => a.id === selected);
    if (el) {
      const copy = { ...el, id: uid(), x: el.x + off, y: el.y + off };
      commit({ ...v, elements: [...v.elements, copy] });
      setSelected(copy.id);
    } else if (ar) {
      const copy = {
        ...ar,
        id: uid(),
        x1: ar.x1 + off,
        y1: ar.y1 + off,
        x2: ar.x2 + off,
        y2: ar.y2 + off,
        cx: ar.cx === undefined ? undefined : ar.cx + off,
        cy: ar.cy === undefined ? undefined : ar.cy + off,
      };
      commit({ ...v, arrows: [...v.arrows, copy] });
      setSelected(copy.id);
    }
  }, [selected, commit]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const v = valueRef.current;
      if (!selected) return;
      commit({
        ...v,
        elements: v.elements.map((e) => (e.id === selected ? { ...e, x: e.x + dx, y: e.y + dy } : e)),
        arrows: v.arrows.map((a) => (a.id === selected ? shiftArrow(a, dx, dy) : a)),
      });
    },
    [selected, commit],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
      } else if (ctrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        doRedo();
      } else if (ctrl && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selected) {
          e.preventDefault();
          removeSelected();
        }
      } else if (e.key === 'Escape') {
        setTool({ t: 'select' });
        setSelected(null);
      } else if (e.key.startsWith('Arrow') && selected) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (d) nudge(d[0], d[1]);
      } else if (!ctrl && !e.altKey && HOTKEYS[e.key.toUpperCase()]) {
        e.preventDefault();
        setTool(HOTKEYS[e.key.toUpperCase()]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, duplicateSelected, removeSelected, nudge, selected]);

  const toPt = (e: React.PointerEvent): Pt => {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const r = p.matrixTransform(svg.getScreenCTM()!.inverse());
    const vb = viewBox(valueRef.current.pitch);
    return {
      x: round(Math.min(vb.x + vb.w, Math.max(vb.x, r.x))),
      y: round(Math.min(vb.y + vb.h, Math.max(vb.y, r.y))),
    };
  };

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const v = valueRef.current;
    const pt = toPt(e);
    const target = e.target as Element;
    const capture = () => svgRef.current?.setPointerCapture(e.pointerId);

    const handle = target.closest('[data-handle]');
    if (handle) {
      drag.current = {
        type: 'handle',
        id: handle.getAttribute('data-id')!,
        handle: handle.getAttribute('data-handle') as 'start' | 'end' | 'ctrl' | 'resize',
        before: v,
      };
      capture();
      return;
    }

    if (tool.t === 'place') {
      const el: DiagramElement = { id: uid(), kind: tool.kind, x: pt.x, y: pt.y, color: tool.color };
      if (tool.kind === 'player') {
        const same = v.elements.filter((x) => x.kind === 'player' && x.color === tool.color).length;
        el.label = tool.label || String(same + 1);
      }
      if (tool.kind === 'text') el.label = 'Text';
      commit({ ...v, elements: [...v.elements, el] });
      setSelected(el.id);
      if (tool.kind === 'text') {
        setTool({ t: 'select' });
        requestAnimationFrame(() => document.getElementById('prop-label')?.focus());
      }
      return;
    }

    if (tool.t === 'arrow') {
      const a: Arrow = { id: uid(), kind: tool.kind, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, color: 'auto' };
      drag.current = { type: 'newArrow', id: a.id, before: v };
      onChange({ ...v, arrows: [...v.arrows, a] });
      setSelected(a.id);
      capture();
      return;
    }

    if (tool.t === 'zone') {
      const z: DiagramElement = { id: uid(), kind: 'zone', x: pt.x, y: pt.y, w: 0, h: 0, color: 'auto' };
      drag.current = { type: 'newZone', id: z.id, start: pt, before: v };
      onChange({ ...v, elements: [...v.elements, z] });
      setSelected(z.id);
      capture();
      return;
    }

    const hit = target.closest('[data-id]');
    if (hit) {
      const id = hit.getAttribute('data-id')!;
      setSelected(id);
      drag.current = { type: 'move', id, start: pt, before: v };
      capture();
    } else {
      setSelected(null);
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const pt = toPt(e);
    const b = d.before;
    let next: Diagram = valueRef.current;

    if (d.type === 'move') {
      const dx = pt.x - d.start.x;
      const dy = pt.y - d.start.y;
      next = {
        ...next,
        elements: b.elements.map((el) => (el.id === d.id ? { ...el, x: round(el.x + dx), y: round(el.y + dy) } : el)),
        arrows: b.arrows.map((a) => (a.id === d.id ? shiftArrow(a, dx, dy) : a)),
      };
    } else if (d.type === 'handle') {
      next = {
        ...next,
        arrows: next.arrows.map((a) => {
          if (a.id !== d.id) return a;
          if (d.handle === 'start') return { ...a, x1: pt.x, y1: pt.y };
          if (d.handle === 'end') return { ...a, x2: pt.x, y2: pt.y };
          if (d.handle === 'ctrl') {
            // The handle sits on the curve at t=0.5; solve for the control point.
            return { ...a, cx: round(2 * pt.x - (a.x1 + a.x2) / 2), cy: round(2 * pt.y - (a.y1 + a.y2) / 2) };
          }
          return a;
        }),
        elements: next.elements.map((el) =>
          el.id === d.id && d.handle === 'resize'
            ? { ...el, w: round(Math.max(1, pt.x - el.x)), h: round(Math.max(1, pt.y - el.y)) }
            : el,
        ),
      };
    } else if (d.type === 'newArrow') {
      next = { ...next, arrows: next.arrows.map((a) => (a.id === d.id ? { ...a, x2: pt.x, y2: pt.y } : a)) };
    } else if (d.type === 'newZone') {
      next = {
        ...next,
        elements: next.elements.map((el) =>
          el.id === d.id
            ? {
                ...el,
                x: Math.min(d.start.x, pt.x),
                y: Math.min(d.start.y, pt.y),
                w: round(Math.abs(pt.x - d.start.x)),
                h: round(Math.abs(pt.y - d.start.y)),
              }
            : el,
        ),
      };
    }
    onChange(next);
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const v = valueRef.current;
    if (d.type === 'newArrow') {
      const a = v.arrows.find((x) => x.id === d.id);
      if (!a || Math.hypot(a.x2 - a.x1, a.y2 - a.y1) < 1) {
        onChange(d.before);
        setSelected(null);
        return;
      }
    }
    if (d.type === 'newZone') {
      const z = v.elements.find((x) => x.id === d.id);
      if (!z || (z.w ?? 0) < 1 || (z.h ?? 0) < 1) {
        onChange(d.before);
        setSelected(null);
        return;
      }
    }
    if (v !== d.before) commit(v, d.before);
  };

  const setPitchType = (type: PitchType) => {
    const p = PITCH_PRESETS[type];
    commit({ ...value, pitch: { ...value.pitch, type, width: p.width, height: p.height } });
  };

  const handleR = 0.75 * s;
  const handleProps = { r: handleR, fill: '#ffffff', stroke: '#1a73e8', strokeWidth: 0.25 * s, style: { cursor: 'grab' } };

  return (
    <div className="editor">
      <div className="toolbar" role="toolbar" aria-label="Diagram tools">
        <ToolButton active={tool.t === 'select'} title="Select / move" hotkey="V" onClick={() => setTool({ t: 'select' })}>
          <svg viewBox="0 0 24 24" width={22} height={22}>
            <path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor" />
          </svg>
        </ToolButton>
        <div className="toolbar-label">Players</div>
        {PLAYER_TOOLS.map((p) => (
          <ToolButton
            key={p.color}
            title={p.title}
            hotkey={p.key}
            active={tool.t === 'place' && tool.kind === 'player' && tool.color === p.color}
            onClick={() => setTool({ t: 'place', kind: 'player', color: p.color, label: p.label })}
          >
            <ElementIcon el={{ kind: 'player', color: p.color, label: p.label || '1' }} />
          </ToolButton>
        ))}
        <div className="toolbar-label">Kit</div>
        {EQUIPMENT.map((q) => (
          <ToolButton
            key={q.kind}
            title={q.title}
            hotkey={q.key}
            active={tool.t === 'place' && tool.kind === q.kind}
            onClick={() => setTool({ t: 'place', kind: q.kind, color: q.color })}
          >
            <ElementIcon el={{ kind: q.kind, color: q.color }} />
          </ToolButton>
        ))}
        <div className="toolbar-label">Lines</div>
        {ARROWS.map((a) => (
          <ToolButton
            key={a.kind}
            title={a.title}
            hotkey={a.key}
            active={tool.t === 'arrow' && tool.kind === a.kind}
            onClick={() => setTool({ t: 'arrow', kind: a.kind })}
          >
            <ArrowIcon kind={a.kind} />
          </ToolButton>
        ))}
        <div className="toolbar-label">Mark</div>
        <ToolButton active={tool.t === 'zone'} title="Area / zone" hotkey="A" onClick={() => setTool({ t: 'zone' })}>
          <ElementIcon el={{ kind: 'zone', color: 'blue' }} />
        </ToolButton>
        <ToolButton
          active={tool.t === 'place' && tool.kind === 'text'}
          title="Text label"
          hotkey="T"
          onClick={() => setTool({ t: 'place', kind: 'text', color: 'auto' })}
        >
          <span className="text-icon">T</span>
        </ToolButton>
      </div>

      <div className="canvas-wrap">
        <div className="canvas-top">
          <button className="btn ghost sm" onClick={doUndo} disabled={!undo.current.length} title="Undo (Ctrl+Z)">
            ↶ Undo
          </button>
          <button className="btn ghost sm" onClick={doRedo} disabled={!redo.current.length} title="Redo (Ctrl+Y)">
            ↷ Redo
          </button>
          <span className="hint">{HINTS[tool.t]}</span>
        </div>
        <DiagramSVG
          diagram={value}
          interactive
          svgRef={svgRef}
          className={`canvas tool-${tool.t}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ touchAction: 'none' }}
        >
          {selEl && selEl.kind === 'zone' && (
            <>
              <rect
                x={selEl.x}
                y={selEl.y}
                width={selEl.w}
                height={selEl.h}
                fill="none"
                stroke="#1a73e8"
                strokeWidth={0.2 * s}
                strokeDasharray={`${0.5 * s} ${0.4 * s}`}
                pointerEvents="none"
              />
              <circle
                cx={selEl.x + (selEl.w ?? 0)}
                cy={selEl.y + (selEl.h ?? 0)}
                data-id={selEl.id}
                data-handle="resize"
                {...handleProps}
                style={{ cursor: 'nwse-resize' }}
              />
            </>
          )}
          {selEl && selEl.kind !== 'zone' && (
            <circle
              cx={selEl.x}
              cy={selEl.y}
              r={(selEl.kind === 'goal' ? 4.4 : selEl.kind === 'ladder' ? 2.6 * s : 1.9 * s)}
              fill="none"
              stroke="#1a73e8"
              strokeWidth={0.2 * s}
              strokeDasharray={`${0.5 * s} ${0.4 * s}`}
              pointerEvents="none"
            />
          )}
          {selArrow && (
            <>
              <circle cx={selArrow.x1} cy={selArrow.y1} data-id={selArrow.id} data-handle="start" {...handleProps} />
              <circle cx={selArrow.x2} cy={selArrow.y2} data-id={selArrow.id} data-handle="end" {...handleProps} />
              {(() => {
                const m = arrowShape(selArrow, s).mid;
                return (
                  <circle
                    cx={m.x}
                    cy={m.y}
                    data-id={selArrow.id}
                    data-handle="ctrl"
                    {...handleProps}
                    fill="#1a73e8"
                    stroke="#ffffff"
                  />
                );
              })()}
            </>
          )}
        </DiagramSVG>
      </div>

      <div className="props">
        {selEl ? (
          <>
            <h4>{labelFor(selEl.kind)}</h4>
            {(selEl.kind === 'player' || selEl.kind === 'text') && (
              <label className="field">
                <span>{selEl.kind === 'player' ? 'Label' : 'Text'}</span>
                <input
                  id="prop-label"
                  value={selEl.label ?? ''}
                  maxLength={selEl.kind === 'player' ? 3 : 60}
                  onChange={(e) => updateEl(selEl.id, { label: e.target.value })}
                />
              </label>
            )}
            {selEl.kind !== 'ball' && (
              <div className="field">
                <span>Colour</span>
                <Swatches
                  value={selEl.color}
                  allowAuto={selEl.kind !== 'player'}
                  onChange={(c) => updateEl(selEl.id, { color: c })}
                />
              </div>
            )}
            {selEl.kind === 'text' && (
              <label className="field">
                <span>Size</span>
                <input
                  type="range"
                  min={0.5}
                  max={3}
                  step={0.1}
                  value={selEl.size ?? 1}
                  onChange={(e) => updateEl(selEl.id, { size: Number(e.target.value) })}
                />
              </label>
            )}
            {ROTATABLE.has(selEl.kind) && (
              <div className="field">
                <span>Rotation {Math.round(selEl.rotation ?? 0)}°</span>
                <input
                  type="range"
                  min={-180}
                  max={180}
                  step={5}
                  value={selEl.rotation ?? 0}
                  onChange={(e) => updateEl(selEl.id, { rotation: Number(e.target.value) })}
                />
                <div className="row">
                  {[0, 90, 180, -90].map((r) => (
                    <button key={r} className="btn ghost xs" onClick={() => updateEl(selEl.id, { rotation: r })}>
                      {r}°
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selEl.kind === 'zone' && (
              <div className="field">
                <span>Size (m)</span>
                <div className="row">
                  <input
                    type="number"
                    min={1}
                    value={selEl.w}
                    onChange={(e) => updateEl(selEl.id, { w: Math.max(1, Number(e.target.value)) })}
                  />
                  ×
                  <input
                    type="number"
                    min={1}
                    value={selEl.h}
                    onChange={(e) => updateEl(selEl.id, { h: Math.max(1, Number(e.target.value)) })}
                  />
                </div>
              </div>
            )}
            <SelectionActions onDuplicate={duplicateSelected} onDelete={removeSelected} />
          </>
        ) : selArrow ? (
          <>
            <h4>Line</h4>
            <label className="field">
              <span>Type</span>
              <select value={selArrow.kind} onChange={(e) => updateArrow(selArrow.id, { kind: e.target.value as ArrowKind })}>
                {ARROWS.map((a) => (
                  <option key={a.kind} value={a.kind}>
                    {a.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="field">
              <span>Colour</span>
              <Swatches value={selArrow.color} allowAuto onChange={(c) => updateArrow(selArrow.id, { color: c })} />
            </div>
            <div className="row">
              <button
                className="btn ghost xs"
                disabled={selArrow.cx === undefined}
                onClick={() => updateArrow(selArrow.id, { cx: undefined, cy: undefined })}
              >
                Straighten
              </button>
              <button
                className="btn ghost xs"
                onClick={() =>
                  updateArrow(selArrow.id, {
                    x1: selArrow.x2,
                    y1: selArrow.y2,
                    x2: selArrow.x1,
                    y2: selArrow.y1,
                  })
                }
              >
                Reverse
              </button>
            </div>
            <SelectionActions onDuplicate={duplicateSelected} onDelete={removeSelected} />
          </>
        ) : (
          <>
            <h4>Pitch</h4>
            <label className="field">
              <span>Layout</span>
              <select value={pitch.type} onChange={(e) => setPitchType(e.target.value as PitchType)}>
                {(Object.keys(PITCH_PRESETS) as PitchType[]).map((k) => (
                  <option key={k} value={k}>
                    {PITCH_PRESETS[k].label}
                  </option>
                ))}
              </select>
            </label>
            {pitch.type === 'grid' && (
              <div className="field">
                <span>Size (m)</span>
                <div className="row">
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={pitch.width}
                    onChange={(e) =>
                      commit({ ...value, pitch: { ...pitch, width: clampDim(Number(e.target.value)) } })
                    }
                  />
                  ×
                  <input
                    type="number"
                    min={5}
                    max={120}
                    value={pitch.height}
                    onChange={(e) =>
                      commit({ ...value, pitch: { ...pitch, height: clampDim(Number(e.target.value)) } })
                    }
                  />
                </div>
              </div>
            )}
            <div className="field">
              <span>Style</span>
              <div className="seg">
                {(['grass', 'plain'] as const).map((st) => (
                  <button
                    key={st}
                    className={pitch.style === st ? 'on' : ''}
                    onClick={() => commit({ ...value, pitch: { ...pitch, style: st } })}
                  >
                    {st === 'grass' ? 'Grass' : 'Print-friendly'}
                  </button>
                ))}
              </div>
            </div>
            <button
              className="btn ghost xs danger"
              disabled={!value.elements.length && !value.arrows.length}
              onClick={() => commit({ ...value, elements: [], arrows: [] })}
            >
              Clear diagram
            </button>
            <p className="muted small">
              Select a player, piece of kit or line to edit it. Undo with Ctrl+Z.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function ToolButton({
  active,
  title,
  hotkey,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  hotkey: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`tool${active ? ' active' : ''}`}
      title={`${title} (${hotkey})`}
      aria-label={title}
      aria-keyshortcuts={hotkey}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
      <kbd>{hotkey}</kbd>
    </button>
  );
}

function Swatches({ value, onChange, allowAuto }: { value: string; onChange: (c: string) => void; allowAuto?: boolean }) {
  return (
    <div className="swatches">
      {allowAuto && (
        <button
          className={`swatch auto${value === 'auto' ? ' on' : ''}`}
          title="Auto (white on grass, black when printing)"
          onClick={() => onChange('auto')}
        >
          A
        </button>
      )}
      {COLOR_KEYS.map((k) => (
        <button
          key={k}
          className={`swatch${value === k ? ' on' : ''}`}
          style={{ background: COLORS[k] }}
          title={k}
          aria-label={k}
          onClick={() => onChange(k)}
        />
      ))}
    </div>
  );
}

function SelectionActions({ onDuplicate, onDelete }: { onDuplicate: () => void; onDelete: () => void }) {
  return (
    <div className="row sel-actions">
      <button className="btn ghost xs" onClick={onDuplicate}>
        Duplicate
      </button>
      <button className="btn ghost xs danger" onClick={onDelete}>
        Delete
      </button>
    </div>
  );
}

function labelFor(kind: ElementKind) {
  return (
    {
      player: 'Player',
      cone: 'Cone',
      ball: 'Ball',
      goal: 'Goal',
      minigoal: 'Mini goal',
      mannequin: 'Mannequin',
      pole: 'Pole',
      ladder: 'Ladder',
      text: 'Text',
      zone: 'Area',
    } as const
  )[kind];
}

function shiftArrow(a: Arrow, dx: number, dy: number): Arrow {
  return {
    ...a,
    x1: round(a.x1 + dx),
    y1: round(a.y1 + dy),
    x2: round(a.x2 + dx),
    y2: round(a.y2 + dy),
    cx: a.cx === undefined ? undefined : round(a.cx + dx),
    cy: a.cy === undefined ? undefined : round(a.cy + dy),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;
const clampDim = (n: number) => Math.min(120, Math.max(5, n || 5));

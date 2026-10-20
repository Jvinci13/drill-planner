import { useCallback, useEffect, useRef, useState } from 'react';
import { COLOR_KEYS, COLORS, PITCH_PRESETS, uid } from '../constants';
import type { Arrow, ArrowKind, Diagram, DiagramElement, ElementKind, Pitch, PitchType } from '../types';
import { ArrowIcon, DiagramSVG, ElementIcon, ElementShape } from './DiagramSVG';
import { NumberField } from '../NumberField';
import { arrowShape, getBend, unitScale, viewBox, withBend } from './geometry';

type Tool =
  | { t: 'select' }
  | { t: 'place'; kind: ElementKind; color: string; label?: string }
  /** `plain` draws a solid line with no arrowhead (the Line tool). */
  | { t: 'arrow'; kind: ArrowKind; plain?: boolean }
  | { t: 'zone' };

type Drag =
  /** Moves every item in `ids`; `primary` (the one grabbed) is what snaps to the guides. */
  | { type: 'move'; ids: string[]; primary: string; start: Pt; before: Diagram }
  /** Selection box; `base` is what was already selected when Shift-dragging. */
  | { type: 'marquee'; start: Pt; base: string[] }
  | { type: 'handle'; id: string; handle: 'start' | 'end' | 'ctrl' | 'resize'; before: Diagram }
  | { type: 'newArrow'; id: string; before: Diagram }
  | { type: 'newZone'; id: string; start: Pt; before: Diagram };

type Pt = { x: number; y: number };
/** Centre lines currently being snapped to (pitch coordinates). */
type Guides = { x?: number; y?: number };

type Clip = { elements: DiagramElement[]; arrows: Arrow[] };
type Rect = { x: number; y: number; w: number; h: number };

/** Module-level so you can copy in one diagram or drill and paste into another. */
let clipboard: Clip | null = null;
let pasteCount = 0;

/** How close (in screen pixels) an object must be to a centre line to snap onto it. */
const SNAP_PX = 8;
const GUIDE_COLOR = '#ff2fa0';

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

/** Goalkeeping and agility equipment, in its own toolbar group. */
const GK_KIT: { kind: ElementKind; color: string; title: string; key: string }[] = [
  { kind: 'hurdle', color: 'yellow', title: 'Mini hurdle', key: 'U' },
  { kind: 'hurdleTall', color: 'red', title: 'Tall hurdle', key: 'Y' },
  { kind: 'rebounder', color: 'auto', title: 'Rebound net (thick edge = face)', key: 'E' },
  { kind: 'ring', color: 'yellow', title: 'Agility ring', key: 'K' },
  { kind: 'mat', color: 'blue', title: 'Crash mat', key: 'X' },
  { kind: 'flag', color: 'yellow', title: 'Tall pole / flag stick', key: 'F' },
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
  ...Object.fromEntries(
    [...EQUIPMENT, ...GK_KIT].map((q) => [q.key, { t: 'place', kind: q.kind, color: q.color } as Tool]),
  ),
  ...Object.fromEntries(ARROWS.map((a) => [a.key, { t: 'arrow', kind: a.kind } as Tool])),
  I: { t: 'arrow', kind: 'pass', plain: true },
};

/** Order the cone tool steps through when C is pressed again. */
const CONE_COLORS = ['orange', 'yellow', 'red', 'blue', 'green', 'white', 'purple', 'black'];
/** Bend given to lines drawn while "Curved" is on. */
const DEFAULT_BEND = 0.25;

const ROTATABLE = new Set<ElementKind>([
  'goal',
  'minigoal',
  'mannequin',
  'ladder',
  'text',
  'cone',
  'hurdle',
  'hurdleTall',
  'rebounder',
  'mat',
  'flag',
]);

/** Items whose rotation should be reflected when mirrored (symmetric shapes like cones are left alone). */
const MIRROR_ROTATES = new Set<ElementKind>([
  'goal',
  'minigoal',
  'mannequin',
  'ladder',
  'hurdle',
  'hurdleTall',
  'rebounder',
  'mat',
  'flag',
]);

const HINTS: Record<Tool['t'], string> = {
  select:
    'Click or drag a box to select · Shift+click to add · drag to move (Alt = no snapping) · Ctrl+C / Ctrl+V copy & paste · Del delete',
  place: 'Click the pitch to place · keep clicking to add more · Esc to finish',
  arrow: 'Drag to draw · Q curved on/off · H arrowhead on/off · drag the middle handle to bend · Esc to finish',
  zone: 'Drag to draw an area · Esc to finish',
};

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export function DiagramEditor({ value, onChange }: { value: Diagram; onChange: (d: Diagram) => void }) {
  const [tool, setTool] = useState<Tool>({ t: 'select' });
  const [selIds, setSelIds] = useState<string[]>([]);
  const selRef = useRef(selIds);
  selRef.current = selIds;
  /** The single selected item, which the properties panel edits; null when none or several. */
  const selected = selIds.length === 1 ? selIds[0] : null;
  const setSelected = useCallback((id: string | null) => setSelIds(id ? [id] : []), []);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  // Drawing defaults for new lines and cones; they persist while switching tools.
  const [curved, setCurved] = useState(false);
  const [heads, setHeads] = useState(true);
  const [coneColor, setConeColor] = useState('orange');
  const [focusLabel, setFocusLabel] = useState(false);
  const [guides, setGuides] = useState<Guides | null>(null);
  // Cursor position while a placing tool is active, for the placement preview.
  const [hover, setHover] = useState<Pt | null>(null);
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
  const updateArrowRef = useRef(updateArrow);
  updateArrowRef.current = updateArrow;

  /** The selected items, in drawing order. */
  const selection = (): Clip => {
    const ids = new Set(selRef.current);
    const v = valueRef.current;
    return { elements: v.elements.filter((e) => ids.has(e.id)), arrows: v.arrows.filter((a) => ids.has(a.id)) };
  };

  /** Adds the given items with fresh ids and selects them. */
  const insert = useCallback(
    (c: Clip) => {
      const v = valueRef.current;
      const elements = c.elements.map((e) => ({ ...e, id: uid() }));
      const arrows = c.arrows.map((a) => ({ ...a, id: uid() }));
      if (!elements.length && !arrows.length) return;
      commit({ ...v, elements: [...v.elements, ...elements], arrows: [...v.arrows, ...arrows] });
      setSelIds([...elements, ...arrows].map((x) => x.id));
    },
    [commit],
  );

  /** Replaces selected items in place (same ids), e.g. after moving or flipping. */
  const replaceSelected = useCallback(
    (map: (c: Clip) => Clip) => {
      const v = valueRef.current;
      const changed = map(selection());
      const els = new Map(changed.elements.map((e) => [e.id, e]));
      const ars = new Map(changed.arrows.map((a) => [a.id, a]));
      if (!els.size && !ars.size) return;
      commit({
        ...v,
        elements: v.elements.map((e) => els.get(e.id) ?? e),
        arrows: v.arrows.map((a) => ars.get(a.id) ?? a),
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit],
  );

  const removeSelected = useCallback(() => {
    const v = valueRef.current;
    const gone = new Set(selRef.current);
    if (!gone.size) return;
    commit({ ...v, elements: v.elements.filter((e) => !gone.has(e.id)), arrows: v.arrows.filter((a) => !gone.has(a.id)) });
    setSelIds([]);
  }, [commit]);

  const duplicateSelected = useCallback(() => {
    const off = 2 * unitScale(valueRef.current.pitch);
    insert(shiftClip(selection(), off, off));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insert]);

  const copySelected = useCallback(() => {
    const c = selection();
    if (!c.elements.length && !c.arrows.length) return false;
    clipboard = structuredClone(c);
    pasteCount = 0;
    bump((n) => n + 1);
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paste = useCallback(() => {
    if (!clipboard) return;
    pasteCount += 1;
    const off = 2 * unitScale(valueRef.current.pitch) * pasteCount;
    insert(shiftClip(clipboard, off, off));
  }, [insert]);

  /** Adds a reflected copy of the selection across the pitch's centre line. */
  const mirrorCopy = useCallback(
    (axis: 'h' | 'v') => insert(mirrorClip(selection(), axis, valueRef.current.pitch)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [insert],
  );
  /** Reflects the selection in place across the pitch's centre line. */
  const flipSelected = useCallback(
    (axis: 'h' | 'v') => replaceSelected((c) => mirrorClip(c, axis, valueRef.current.pitch)),
    [replaceSelected],
  );

  const nudge = useCallback(
    (dx: number, dy: number) => replaceSelected((c) => shiftClip(c, dx, dy)),
    [replaceSelected],
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
      } else if (ctrl && e.key.toLowerCase() === 'c') {
        if (copySelected()) e.preventDefault();
      } else if (ctrl && e.key.toLowerCase() === 'x') {
        if (copySelected()) {
          e.preventDefault();
          removeSelected();
        }
      } else if (ctrl && e.key.toLowerCase() === 'v') {
        if (clipboard) {
          e.preventDefault();
          paste();
        }
      } else if (ctrl && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        const v = valueRef.current;
        setTool({ t: 'select' });
        setSelIds([...v.elements, ...v.arrows].map((x) => x.id));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selRef.current.length) {
          e.preventDefault();
          removeSelected();
        }
      } else if (e.key === 'Escape') {
        setTool({ t: 'select' });
        setSelected(null);
      } else if (e.key.startsWith('Arrow') && selRef.current.length) {
        e.preventDefault();
        const step = e.shiftKey ? 2 : 0.5;
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (d) nudge(d[0], d[1]);
      } else if (ctrl || e.altKey) {
        return;
      } else if (e.key.toUpperCase() === 'C') {
        e.preventDefault();
        // First press picks the cone tool; further presses cycle its colour.
        if (tool.t === 'place' && tool.kind === 'cone') {
          const next = CONE_COLORS[(CONE_COLORS.indexOf(coneColor) + 1) % CONE_COLORS.length];
          setConeColor(next);
          setTool({ t: 'place', kind: 'cone', color: next });
        } else {
          setTool({ t: 'place', kind: 'cone', color: coneColor });
        }
      } else if (e.key.toUpperCase() === 'Q') {
        e.preventDefault();
        const a = valueRef.current.arrows.find((x) => x.id === selected);
        if (a) updateArrowRef.current(a.id, withBend(a, getBend(a) ? 0 : DEFAULT_BEND));
        else setCurved((c) => !c);
      } else if (e.key.toUpperCase() === 'H') {
        e.preventDefault();
        const a = valueRef.current.arrows.find((x) => x.id === selected);
        if (a) updateArrowRef.current(a.id, { head: a.head === false });
        else setHeads((h) => !h);
      } else if (HOTKEYS[e.key.toUpperCase()]) {
        e.preventDefault();
        setTool(HOTKEYS[e.key.toUpperCase()]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, duplicateSelected, removeSelected, copySelected, paste, nudge, selected, tool, coneColor, setSelected]);

  // After placing a text label, focus its input with the placeholder selected so typing replaces it.
  useEffect(() => {
    if (!focusLabel) return;
    setFocusLabel(false);
    const input = document.getElementById('prop-label') as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }, [focusLabel]);

  useEffect(() => {
    setHover(null);
    setGuides(null);
  }, [tool]);

  /**
   * Snaps a point onto the pitch's vertical/horizontal centre line when it is
   * within SNAP_PX on screen, and shows the matching guide. Alt disables it.
   */
  const snap = (x: number, y: number, e: { altKey: boolean }) => {
    const p = valueRef.current.pitch;
    const m = svgRef.current?.getScreenCTM();
    // Capped in metres so a very small canvas doesn't snap from far away.
    const tol = Math.min(2, m && m.a ? SNAP_PX / m.a : 1);
    const g: Guides = {};
    if (!e.altKey) {
      if (Math.abs(x - p.width / 2) <= tol) x = g.x = p.width / 2;
      if (Math.abs(y - p.height / 2) <= tol) y = g.y = p.height / 2;
    }
    setGuides(g.x === undefined && g.y === undefined ? null : g);
    return { x, y };
  };

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
      const el = newElement(tool, snap(pt.x, pt.y, e), v);
      setGuides(null);
      commit({ ...v, elements: [...v.elements, el] });
      setSelected(el.id);
      if (tool.kind === 'text') {
        // Keep the browser from moving focus to the page on mousedown, which would
        // steal it back from the label input focused below.
        e.preventDefault();
        setTool({ t: 'select' });
        setFocusLabel(true);
      }
      return;
    }

    if (tool.t === 'arrow') {
      const start = snap(pt.x, pt.y, e);
      const a: Arrow = {
        id: uid(),
        kind: tool.kind,
        x1: start.x,
        y1: start.y,
        x2: start.x,
        y2: start.y,
        color: 'auto',
        ...(heads && !tool.plain ? {} : { head: false }),
      };
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
      if (e.shiftKey) {
        setSelIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
        return;
      }
      // Grabbing part of a multi-selection drags the whole group.
      const ids = selRef.current.includes(id) ? selRef.current : [id];
      setSelIds(ids);
      drag.current = { type: 'move', ids, primary: id, start: pt, before: v };
      capture();
    } else {
      drag.current = { type: 'marquee', start: pt, base: e.shiftKey ? selRef.current : [] };
      if (!e.shiftKey) setSelIds([]);
      capture();
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) {
      // Not dragging: preview where a placement (or a line's start) would land.
      if (tool.t === 'place') setHover(snap(...xy(toPt(e)), e));
      else if (tool.t === 'arrow') snap(...xy(toPt(e)), e);
      else if (guides) setGuides(null);
      return;
    }
    let pt = toPt(e);
    if (d.type === 'marquee') {
      const r = rectBetween(d.start, pt);
      setMarquee(r);
      const inside = itemsInRect(valueRef.current, r);
      setSelIds([...d.base, ...inside.filter((id) => !d.base.includes(id))]);
      return;
    }
    const b = d.before;
    let next: Diagram = valueRef.current;
    if (d.type === 'newArrow' || (d.type === 'handle' && (d.handle === 'start' || d.handle === 'end'))) {
      pt = snap(pt.x, pt.y, e);
    }

    if (d.type === 'move') {
      let dx = pt.x - d.start.x;
      let dy = pt.y - d.start.y;
      // Snap the object's centre (a zone's centre, not its corner) to the centre lines.
      const orig = b.elements.find((el) => el.id === d.primary);
      if (orig) {
        const ox = orig.kind === 'zone' ? orig.x + (orig.w ?? 0) / 2 : orig.x;
        const oy = orig.kind === 'zone' ? orig.y + (orig.h ?? 0) / 2 : orig.y;
        const c = snap(ox + dx, oy + dy, e);
        dx = c.x - ox;
        dy = c.y - oy;
      }
      const ids = new Set(d.ids);
      next = {
        ...next,
        elements: b.elements.map((el) => (ids.has(el.id) ? { ...el, x: round(el.x + dx), y: round(el.y + dy) } : el)),
        arrows: b.arrows.map((a) => (ids.has(a.id) ? shiftArrow(a, dx, dy) : a)),
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
      next = {
        ...next,
        arrows: next.arrows.map((a) => {
          if (a.id !== d.id) return a;
          const moved = { ...a, x2: pt.x, y2: pt.y };
          return curved ? withBend(moved, DEFAULT_BEND) : moved;
        }),
      };
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
    setGuides(null);
    setMarquee(null);
    if (!d || d.type === 'marquee') return;
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

  const onPointerLeave = () => {
    if (drag.current) return;
    setHover(null);
    setGuides(null);
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
        <div className="tool-group">
        <ToolButton active={tool.t === 'select'} title="Select / move" hotkey="V" onClick={() => setTool({ t: 'select' })}>
          <svg viewBox="0 0 24 24" width={22} height={22}>
            <path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor" />
          </svg>
        </ToolButton>
        </div>
        <div className="tool-group">
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
        </div>
        <div className="tool-group">
          <div className="toolbar-label">Kit</div>
        {EQUIPMENT.map((q) => (
          <ToolButton
            key={q.kind}
            title={q.title}
            hotkey={q.key}
            active={tool.t === 'place' && tool.kind === q.kind}
            onClick={() => setTool({ t: 'place', kind: q.kind, color: q.kind === 'cone' ? coneColor : q.color })}
          >
            <ElementIcon el={{ kind: q.kind, color: q.kind === 'cone' ? coneColor : q.color }} />
          </ToolButton>
        ))}
        </div>
        <div className="tool-group">
          <div className="toolbar-label">GK &amp; agility</div>
        {GK_KIT.map((q) => (
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
        </div>
        <div className="tool-group">
          <div className="toolbar-label">Lines</div>
        {ARROWS.map((a) => (
          <ToolButton
            key={a.kind}
            title={a.title}
            hotkey={a.key}
            active={tool.t === 'arrow' && tool.kind === a.kind && !tool.plain}
            onClick={() => setTool({ t: 'arrow', kind: a.kind })}
          >
            <ArrowIcon kind={a.kind} curved={curved} head={heads} />
          </ToolButton>
        ))}
        <ToolButton
          title="Line (no arrowhead)"
          hotkey="I"
          active={tool.t === 'arrow' && !!tool.plain}
          onClick={() => setTool({ t: 'arrow', kind: 'pass', plain: true })}
        >
          <ArrowIcon kind="pass" curved={curved} head={false} />
        </ToolButton>
        </div>
        <div className="tool-group">
          <div className="toolbar-label">Line style</div>
        <ToolButton
          active={curved}
          title="Draw curved lines (or curve the selected line)"
          hotkey="Q"
          onClick={() =>
            selArrow
              ? updateArrow(selArrow.id, withBend(selArrow, getBend(selArrow) ? 0 : DEFAULT_BEND))
              : setCurved(!curved)
          }
        >
          <ArrowIcon kind="pass" curved head={false} />
        </ToolButton>
        <ToolButton
          active={heads}
          title="Arrowheads on/off (or toggle the selected line's)"
          hotkey="H"
          onClick={() => (selArrow ? updateArrow(selArrow.id, { head: selArrow.head === false }) : setHeads(!heads))}
        >
          <ArrowIcon kind="pass" />
        </ToolButton>
        </div>
        <div className="tool-group">
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
          label="Drill diagram editor"
          svgRef={svgRef}
          className={`canvas tool-${tool.t}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          style={{ touchAction: 'none' }}
        >
          {tool.t === 'place' && hover && (
            <g opacity={0.45} pointerEvents="none">
              <ElementShape el={newElement(tool, hover, value)} pitch={pitch} />
            </g>
          )}
          {guides?.x !== undefined && (
            <line
              x1={guides.x}
              y1={viewBox(pitch).y}
              x2={guides.x}
              y2={viewBox(pitch).y + viewBox(pitch).h}
              stroke={GUIDE_COLOR}
              strokeWidth={0.15 * s}
              strokeDasharray={`${0.8 * s} ${0.5 * s}`}
              pointerEvents="none"
            />
          )}
          {guides?.y !== undefined && (
            <line
              x1={viewBox(pitch).x}
              y1={guides.y}
              x2={viewBox(pitch).x + viewBox(pitch).w}
              y2={guides.y}
              stroke={GUIDE_COLOR}
              strokeWidth={0.15 * s}
              strokeDasharray={`${0.8 * s} ${0.5 * s}`}
              pointerEvents="none"
            />
          )}
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
          {selIds.length > 1 &&
            value.elements
              .filter((el) => selIds.includes(el.id))
              .map((el) =>
                el.kind === 'zone' ? (
                  <rect
                    key={el.id}
                    x={el.x}
                    y={el.y}
                    width={el.w}
                    height={el.h}
                    fill="none"
                    stroke="#1a73e8"
                    strokeWidth={0.2 * s}
                    strokeDasharray={`${0.5 * s} ${0.4 * s}`}
                    pointerEvents="none"
                  />
                ) : (
                  <circle
                    key={el.id}
                    cx={el.x}
                    cy={el.y}
                    r={selectionRadius(el, s)}
                    fill="none"
                    stroke="#1a73e8"
                    strokeWidth={0.2 * s}
                    strokeDasharray={`${0.5 * s} ${0.4 * s}`}
                    pointerEvents="none"
                  />
                ),
              )}
          {selIds.length > 1 &&
            value.arrows
              .filter((a) => selIds.includes(a.id))
              .map((a) => (
                <path
                  key={a.id}
                  d={arrowShape(a, s).centre}
                  fill="none"
                  stroke="#1a73e8"
                  strokeOpacity={0.6}
                  strokeWidth={0.9 * s}
                  strokeLinecap="round"
                  pointerEvents="none"
                />
              ))}
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="#1a73e8"
              fillOpacity={0.08}
              stroke="#1a73e8"
              strokeWidth={0.12 * s}
              strokeDasharray={`${0.5 * s} ${0.35 * s}`}
              pointerEvents="none"
            />
          )}
          {selEl && selEl.kind !== 'zone' && (
            <circle
              cx={selEl.x}
              cy={selEl.y}
              r={selectionRadius(selEl, s)}
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
        {selIds.length > 1 ? (
          <>
            <h4>{selIds.length} items selected</h4>
            <div className="field">
              <span>Colour (all)</span>
              <Swatches
                value=""
                allowAuto
                onChange={(c) =>
                  replaceSelected((sel) => ({
                    // Balls have no colour, and players always need a real team colour.
                    elements: sel.elements
                      .filter((el) => el.kind !== 'ball' && !(el.kind === 'player' && c === 'auto'))
                      .map((el) => ({ ...el, color: c })),
                    arrows: sel.arrows.map((a) => ({ ...a, color: c })),
                  }))
                }
              />
            </div>
            <SelectionActions
              onCopy={copySelected}
              onDuplicate={duplicateSelected}
              onDelete={removeSelected}
              onMirror={mirrorCopy}
              onFlip={flipSelected}
            />
          </>
        ) : selEl ? (
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
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur();
                  }}
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
                  <NumberField
                    aria-label="Area width"
                    min={1}
                    max={120}
                    value={selEl.w ?? 10}
                    onChange={(w) => updateEl(selEl.id, { w })}
                  />
                  ×
                  <NumberField
                    aria-label="Area height"
                    min={1}
                    max={120}
                    value={selEl.h ?? 10}
                    onChange={(h) => updateEl(selEl.id, { h })}
                  />
                </div>
              </div>
            )}
            <SelectionActions
              onCopy={copySelected}
              onDuplicate={duplicateSelected}
              onDelete={removeSelected}
              onMirror={mirrorCopy}
              onFlip={flipSelected}
            />
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
            <label className="field">
              <span>Bend</span>
              <input
                type="range"
                min={-0.8}
                max={0.8}
                step={0.05}
                value={Math.max(-0.8, Math.min(0.8, getBend(selArrow)))}
                onChange={(e) => updateArrow(selArrow.id, withBend(selArrow, Number(e.target.value)))}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={selArrow.head !== false}
                onChange={(e) => updateArrow(selArrow.id, { head: e.target.checked })}
              />
              Arrowhead
            </label>
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
            <SelectionActions
              onCopy={copySelected}
              onDuplicate={duplicateSelected}
              onDelete={removeSelected}
              onMirror={mirrorCopy}
              onFlip={flipSelected}
            />
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
                  <NumberField
                    aria-label="Pitch width"
                    min={5}
                    max={120}
                    value={pitch.width}
                    onChange={(width) => commit({ ...value, pitch: { ...pitch, width } })}
                  />
                  ×
                  <NumberField
                    aria-label="Pitch height"
                    min={5}
                    max={120}
                    value={pitch.height}
                    onChange={(height) => commit({ ...value, pitch: { ...pitch, height } })}
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
            {clipboard && (
              <button className="btn ghost xs" onClick={paste}>
                Paste ({clipboard.elements.length + clipboard.arrows.length} items) · Ctrl+V
              </button>
            )}
            <p className="muted small">
              Select an item to edit it, or drag a box on empty pitch to select several. Undo with Ctrl+Z.
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

function SelectionActions({
  onCopy,
  onDuplicate,
  onDelete,
  onMirror,
  onFlip,
}: {
  onCopy: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMirror: (axis: 'h' | 'v') => void;
  onFlip: (axis: 'h' | 'v') => void;
}) {
  return (
    <>
      <div className="field sel-actions">
        <span>Mirror copy across centre</span>
        <div className="row">
          <button className="btn ghost xs" onClick={() => onMirror('h')} title="Add a copy reflected left ↔ right">
            ↔ Left / right
          </button>
          <button className="btn ghost xs" onClick={() => onMirror('v')} title="Add a copy reflected top ↕ bottom">
            ↕ Top / bottom
          </button>
        </div>
      </div>
      <div className="field">
        <span>Flip in place</span>
        <div className="row">
          <button className="btn ghost xs" onClick={() => onFlip('h')}>
            ↔ Flip
          </button>
          <button className="btn ghost xs" onClick={() => onFlip('v')}>
            ↕ Flip
          </button>
        </div>
      </div>
      <div className="row">
        <button className="btn ghost xs" onClick={onCopy} title="Ctrl+C">
          Copy
        </button>
        <button className="btn ghost xs" onClick={onDuplicate} title="Ctrl+D">
          Duplicate
        </button>
        <button className="btn ghost xs danger" onClick={onDelete} title="Del">
          Delete
        </button>
      </div>
    </>
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
      hurdle: 'Mini hurdle',
      hurdleTall: 'Tall hurdle',
      rebounder: 'Rebound net',
      ring: 'Agility ring',
      mat: 'Crash mat',
      flag: 'Tall pole / flag',
      text: 'Text',
      zone: 'Area',
    } as const
  )[kind];
}

/** The element a placing tool would create at `pt` (players get the next free number). */
function newElement(tool: Extract<Tool, { t: 'place' }>, pt: Pt, v: Diagram): DiagramElement {
  const el: DiagramElement = { id: uid(), kind: tool.kind, x: pt.x, y: pt.y, color: tool.color };
  if (tool.kind === 'player') {
    const same = v.elements.filter((x) => x.kind === 'player' && x.color === tool.color).length;
    el.label = tool.label || String(same + 1);
  }
  if (tool.kind === 'text') el.label = 'Text';
  return el;
}

const xy = (p: Pt) => [p.x, p.y] as const;

function selectionRadius(el: DiagramElement, s: number) {
  if (el.kind === 'goal') return 4.4;
  if (el.kind === 'ladder') return 2.6 * s;
  if (el.kind === 'mat' || el.kind === 'rebounder') return 1.6 * s;
  return 1.9 * s;
}

function shiftClip(c: Clip, dx: number, dy: number): Clip {
  return {
    elements: c.elements.map((e) => ({ ...e, x: round(e.x + dx), y: round(e.y + dy) })),
    arrows: c.arrows.map((a) => shiftArrow(a, dx, dy)),
  };
}

const normalizeAngle = (r: number) => ((((r + 180) % 360) + 360) % 360) - 180;

/** Reflects items across the pitch's vertical ('h': left↔right) or horizontal ('v': top↕bottom) centre line. */
function mirrorClip(c: Clip, axis: 'h' | 'v', p: Pitch): Clip {
  const fx = (x: number) => (axis === 'h' ? round(p.width - x) : x);
  const fy = (y: number) => (axis === 'v' ? round(p.height - y) : y);
  return {
    elements: c.elements.map((e) => {
      const m: DiagramElement = { ...e };
      if (e.kind === 'zone') {
        // Zones are anchored by their top-left corner.
        if (axis === 'h') m.x = round(p.width - e.x - (e.w ?? 0));
        else m.y = round(p.height - e.y - (e.h ?? 0));
      } else {
        m.x = fx(e.x);
        m.y = fy(e.y);
      }
      if (MIRROR_ROTATES.has(e.kind)) {
        const r = e.rotation ?? 0;
        m.rotation = normalizeAngle(axis === 'h' ? -r : 180 - r);
      }
      return m;
    }),
    arrows: c.arrows.map((a) => ({
      ...a,
      x1: fx(a.x1),
      y1: fy(a.y1),
      x2: fx(a.x2),
      y2: fy(a.y2),
      cx: a.cx === undefined ? undefined : fx(a.cx),
      cy: a.cy === undefined ? undefined : fy(a.cy),
    })),
  };
}

function rectBetween(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}

/** Items fully inside a selection box: an element's centre, or both ends of a line. */
function itemsInRect(v: Diagram, r: Rect) {
  const inside = (x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  return [
    ...v.elements
      .filter((e) => (e.kind === 'zone' ? inside(e.x + (e.w ?? 0) / 2, e.y + (e.h ?? 0) / 2) : inside(e.x, e.y)))
      .map((e) => e.id),
    ...v.arrows.filter((a) => inside(a.x1, a.y1) && inside(a.x2, a.y2)).map((a) => a.id),
  ];
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

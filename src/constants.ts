import type { Diagram, Drill, Pitch, PitchType, Session } from './types';

export const COLORS: Record<string, string> = {
  red: '#d93a3a',
  blue: '#2f6fd8',
  yellow: '#f5c518',
  orange: '#f08a1c',
  green: '#2fa84f',
  purple: '#8a4fd8',
  black: '#222222',
  white: '#f7f7f7',
};

export const COLOR_KEYS = Object.keys(COLORS);

/** Colours whose fill needs dark text/outline on top of it. */
const LIGHT = new Set(['yellow', 'white', 'orange']);

export function isLight(key: string) {
  return LIGHT.has(key);
}

/** Resolve a colour key against the pitch style ('auto' adapts to the background). */
export function resolveColor(key: string, style: Pitch['style']) {
  if (key === 'auto' || !COLORS[key]) return style === 'grass' ? '#ffffff' : '#222222';
  return COLORS[key];
}

export const CATEGORIES = [
  'Warm-up',
  'Technical',
  'Passing',
  'Possession',
  'Finishing',
  'Attacking',
  'Defending',
  'Transition',
  'Small-sided game',
  'Set pieces',
  'Goalkeeping',
  'Fitness',
  'Cool-down',
];

/** Muted colours used for session timelines and PDF category tags. */
export const CATEGORY_COLORS: Record<string, string> = {
  'Warm-up': '#f2a541',
  Technical: '#5b8def',
  Passing: '#3fa7a3',
  Possession: '#2f7d3b',
  Finishing: '#d9534f',
  Attacking: '#e0703a',
  Defending: '#4a5a8c',
  Transition: '#9b59b6',
  'Small-sided game': '#6c9a2f',
  'Set pieces': '#b5873a',
  Goalkeeping: '#3a3a3a',
  Fitness: '#c0392b',
  'Cool-down': '#7fa7c9',
};

export function categoryColor(cat: string) {
  return CATEGORY_COLORS[cat] ?? '#7a8794';
}

export const PITCH_PRESETS: Record<PitchType, { label: string; width: number; height: number }> = {
  full: { label: 'Full pitch', width: 105, height: 68 },
  half: { label: 'Half pitch', width: 68, height: 52.5 },
  third: { label: 'Final third', width: 68, height: 35 },
  grid: { label: 'Grid / area', width: 30, height: 20 },
};

export const uid = () => crypto.randomUUID();

export function newDiagram(caption = '', pitch?: Pitch): Diagram {
  return {
    id: uid(),
    caption,
    pitch: pitch ? { ...pitch } : { type: 'grid', width: 30, height: 20, style: 'grass' },
    elements: [],
    arrows: [],
  };
}

export function newDrill(): Drill {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    category: 'Technical',
    ageGroup: '',
    players: '',
    duration: 15,
    area: '',
    tags: [],
    objective: '',
    setup: '',
    instructions: '',
    coachingPoints: '',
    progressions: '',
    diagrams: [newDiagram('Setup')],
    createdAt: now,
    updatedAt: now,
  };
}

export function newSession(): Session {
  const now = Date.now();
  return {
    id: uid(),
    title: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '',
    team: '',
    objective: '',
    notes: '',
    plannedDuration: 90,
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Deep copy with fresh ids so a duplicate never shares identity with its source. */
export function cloneDrill(d: Drill): Drill {
  const now = Date.now();
  return {
    ...structuredClone(d),
    id: uid(),
    title: d.title ? `${d.title} (copy)` : '',
    diagrams: d.diagrams.map((g) => ({ ...structuredClone(g), id: uid() })),
    createdAt: now,
    updatedAt: now,
  };
}

export function lines(text: string) {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*[-•*]\s*/, '').trim())
    .filter(Boolean);
}

export function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'untitled'
  );
}

export function formatMinutes(total: number) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m} min`;
}

/** "18:00" + 25 → "18:25"; returns '' when no start time is set. */
export function addClock(start: string, minutes: number) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(start);
  if (!m) return '';
  const t = (Number(m[1]) * 60 + Number(m[2]) + minutes) % (24 * 60);
  return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`;
}

export type PitchType = 'full' | 'half' | 'third' | 'grid';
export type PitchStyle = 'grass' | 'plain';

/** Pitch dimensions are in metres; all diagram coordinates share that unit. */
export interface Pitch {
  type: PitchType;
  width: number;
  height: number;
  style: PitchStyle;
}

export type ElementKind =
  | 'player'
  | 'cone'
  | 'ball'
  | 'goal'
  | 'minigoal'
  | 'mannequin'
  | 'pole'
  | 'ladder'
  | 'text'
  | 'zone';

export interface DiagramElement {
  id: string;
  kind: ElementKind;
  /** Centre point, except for zones where it is the top-left corner. */
  x: number;
  y: number;
  rotation?: number;
  /** A key into COLORS, or 'auto' (white on grass, dark on plain). */
  color: string;
  /** Player number/initials, or the text of a text label. */
  label?: string;
  /** Zone size in metres. */
  w?: number;
  h?: number;
  /** Text size multiplier. */
  size?: number;
}

export type ArrowKind = 'pass' | 'run' | 'dribble' | 'shot';

export interface Arrow {
  id: string;
  kind: ArrowKind;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Optional quadratic-curve control point. */
  cx?: number;
  cy?: number;
  color: string;
}

export interface Diagram {
  id: string;
  caption: string;
  pitch: Pitch;
  elements: DiagramElement[];
  arrows: Arrow[];
}

export interface Drill {
  id: string;
  title: string;
  category: string;
  ageGroup: string;
  players: string;
  duration: number;
  area: string;
  tags: string[];
  objective: string;
  setup: string;
  instructions: string;
  /** One point per line. */
  coachingPoints: string;
  /** One progression per line. */
  progressions: string;
  diagrams: Diagram[];
  createdAt: number;
  updatedAt: number;
}

export interface SessionItem {
  id: string;
  drillId: string;
  duration: number;
  notes: string;
}

export interface Session {
  id: string;
  title: string;
  date: string;
  startTime: string;
  team: string;
  objective: string;
  notes: string;
  plannedDuration: number;
  items: SessionItem[];
  createdAt: number;
  updatedAt: number;
}

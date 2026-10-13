import type { Arrow, Pitch } from '../types';

export const PAD = 3;

export function viewBox(p: Pitch) {
  return { x: -PAD, y: -PAD, w: p.width + PAD * 2, h: p.height + PAD * 2 };
}

/**
 * Symbol size multiplier. Players and cones drawn at real-world size would be
 * specks on a full pitch and blobs on a small grid, so symbols scale with the
 * pitch's longest side.
 */
export function unitScale(p: Pitch) {
  return Math.min(1.5, Math.max(0.4, Math.max(p.width, p.height) / 70));
}

type Pt = { x: number; y: number };

function control(a: Arrow): Pt {
  return { x: a.cx ?? (a.x1 + a.x2) / 2, y: a.cy ?? (a.y1 + a.y2) / 2 };
}

function bezier(a: Arrow, t: number): Pt {
  const c = control(a);
  const u = 1 - t;
  return {
    x: u * u * a.x1 + 2 * u * t * c.x + t * t * a.x2,
    y: u * u * a.y1 + 2 * u * t * c.y + t * t * a.y2,
  };
}

const fmt = (n: number) => Math.round(n * 1000) / 1000;

function toPath(pts: Pt[]) {
  return pts.map((p, i) => `${i ? 'L' : 'M'}${fmt(p.x)} ${fmt(p.y)}`).join(' ');
}

/**
 * Builds the shaft path and arrowhead polygon for an arrow. The curve is
 * sampled into a polyline so it can be trimmed for the head and, for
 * dribbles, given a wave without relying on SVG features that PDF export
 * handles poorly.
 */
export function arrowShape(a: Arrow, s: number) {
  const N = 80;
  const samples: Pt[] = [];
  const dist: number[] = [0];
  for (let i = 0; i <= N; i++) {
    samples.push(bezier(a, i / N));
    if (i) {
      const p = samples[i - 1];
      const q = samples[i];
      dist.push(dist[i - 1] + Math.hypot(q.x - p.x, q.y - p.y));
    }
  }
  const total = dist[N];
  const headLen = (a.kind === 'shot' ? 1.9 : 1.4) * s;
  const headW = (a.kind === 'shot' ? 1.5 : 1.1) * s;

  const end = samples[N];
  // Direction at the tip, from a point one head-length back along the curve.
  let back = samples[0];
  for (let i = N; i >= 0; i--) {
    if (total - dist[i] >= headLen) {
      back = samples[i];
      break;
    }
  }
  let dx = end.x - back.x;
  let dy = end.y - back.y;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;
  const base = { x: end.x - dx * headLen, y: end.y - dy * headLen };
  const head = [
    end,
    { x: base.x - dy * (headW / 2), y: base.y + dx * (headW / 2) },
    { x: base.x + dy * (headW / 2), y: base.y - dx * (headW / 2) },
  ];

  const hasHead = a.head !== false;
  const stop = hasHead ? Math.max(0, total - headLen * 0.85) : total;
  const shaft: Pt[] = [];
  const amp = 0.45 * s;
  const wave = 1.7 * s;
  const waveEnd = hasHead ? stop - headLen * 0.6 : total;
  for (let i = 0; i <= N; i++) {
    if (dist[i] > stop) {
      // Interpolate the exact trim point so the shaft meets the head cleanly.
      const p = samples[i - 1];
      const q = samples[i];
      const f = (stop - dist[i - 1]) / (dist[i] - dist[i - 1] || 1);
      shaft.push({ x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f });
      break;
    }
    let p = samples[i];
    if (a.kind === 'dribble' && dist[i] < waveEnd && i > 0 && i < N) {
      const q = samples[i + 1];
      const tx = q.x - samples[i - 1].x;
      const ty = q.y - samples[i - 1].y;
      const tl = Math.hypot(tx, ty) || 1;
      const off = amp * Math.sin((2 * Math.PI * dist[i]) / wave);
      p = { x: p.x - (ty / tl) * off, y: p.y + (tx / tl) * off };
    }
    shaft.push(p);
  }

  return {
    shaft: toPath(shaft),
    head: hasHead ? head.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ') : '',
    /** Plain centre-line path, used for hit-testing in the editor. */
    centre: toPath(samples),
    mid: bezier(a, 0.5),
  };
}

/**
 * How far the curve bows out, as a fraction of the line's length (signed:
 * positive bends to the left of the direction of travel). 0 = straight.
 */
export function getBend(a: Arrow) {
  if (a.cx === undefined || a.cy === undefined) return 0;
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const L = Math.hypot(dx, dy) || 1;
  const mx = (a.x1 + a.x2) / 2;
  const my = a.y1 + dy / 2;
  return ((a.cx - mx) * (dy / L) - (a.cy - my) * (dx / L)) / L;
}

/** Control point for a given bend (see getBend); undefined control = straight. */
export function withBend(a: Arrow, bend: number): Arrow {
  if (Math.abs(bend) < 0.01) return { ...a, cx: undefined, cy: undefined };
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const L = Math.hypot(dx, dy) || 1;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    ...a,
    cx: r((a.x1 + a.x2) / 2 + (dy / L) * bend * L),
    cy: r((a.y1 + a.y2) / 2 - (dx / L) * bend * L),
  };
}

export function strokeWidth(kind: Arrow['kind'], s: number) {
  return (kind === 'shot' ? 0.4 : 0.24) * s;
}

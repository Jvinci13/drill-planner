import type { ReactNode, Ref } from 'react';
import { COLORS, isLight, resolveColor } from '../constants';
import type { Arrow, Diagram, DiagramElement, Pitch } from '../types';
import { arrowShape, strokeWidth, unitScale, viewBox } from './geometry';

// Everything here uses presentation attributes only (no CSS classes, filters,
// patterns or markers) so the same markup renders identically on screen and
// through svg2pdf into the PDF export.

const FONT = 'Helvetica, Arial, sans-serif';

const GRASS = { surround: '#3b8445', a: '#4a9b54', b: '#43914d', line: '#ffffff' };
const PLAIN = { surround: '#ffffff', a: '#ffffff', b: '#ffffff', line: '#9aa3ad' };

function PitchLayer({ pitch }: { pitch: Pitch }) {
  const pal = pitch.style === 'grass' ? GRASS : PLAIN;
  const { width: W, height: H, type } = pitch;
  const vb = viewBox(pitch);
  const lw = Math.max(0.15, 0.22 * unitScale(pitch));
  const line = { stroke: pal.line, strokeWidth: lw, fill: 'none' } as const;

  // Mowing stripes run across the pitch's long axis.
  const stripes: ReactNode[] = [];
  if (pitch.style === 'grass') {
    const horizontal = W >= H;
    const span = horizontal ? W : H;
    const n = Math.max(4, Math.round(span / 7) * 2 || 2);
    const step = span / n;
    for (let i = 0; i < n; i++) {
      stripes.push(
        horizontal ? (
          <rect key={i} x={i * step} y={0} width={step} height={H} fill={i % 2 ? pal.b : pal.a} />
        ) : (
          <rect key={i} x={0} y={i * step} width={W} height={step} fill={i % 2 ? pal.b : pal.a} />
        ),
      );
    }
  }

  return (
    <g>
      <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill={pal.surround} />
      {pitch.style === 'grass' ? stripes : <rect x={0} y={0} width={W} height={H} fill={pal.a} />}
      <rect x={0} y={0} width={W} height={H} {...line} />
      {type === 'full' && (
        <>
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} {...line} />
          <circle cx={W / 2} cy={H / 2} r={9.15} {...line} />
          <circle cx={W / 2} cy={H / 2} r={0.35} fill={pal.line} />
          <GoalEnd transform={`translate(0 ${H / 2}) rotate(-90)`} line={line} color={pal.line} />
          <GoalEnd transform={`translate(${W} ${H / 2}) rotate(90)`} line={line} color={pal.line} />
        </>
      )}
      {(type === 'half' || type === 'third') && (
        <GoalEnd transform={`translate(${W / 2} 0)`} line={line} color={pal.line} />
      )}
      {type === 'half' && (
        <>
          <path d={`M${W / 2 - 9.15} ${H} A9.15 9.15 0 0 1 ${W / 2 + 9.15} ${H}`} {...line} />
          <circle cx={W / 2} cy={H} r={0.35} fill={pal.line} />
        </>
      )}
    </g>
  );
}

/** Penalty area, goal area, spot, arc and goal, drawn with the goal line on y=0 and the pitch towards +y. */
function GoalEnd({
  transform,
  line,
  color,
}: {
  transform: string;
  line: { stroke: string; strokeWidth: number; fill: 'none' };
  color: string;
}) {
  return (
    <g transform={transform}>
      <rect x={-20.16} y={0} width={40.32} height={16.5} {...line} />
      <rect x={-9.16} y={0} width={18.32} height={5.5} {...line} />
      <circle cx={0} cy={11} r={0.3} fill={color} />
      <path d="M-7.312 16.5 A9.15 9.15 0 0 0 7.312 16.5" {...line} />
      <rect x={-3.66} y={-2} width={7.32} height={2} {...line} />
    </g>
  );
}

function ElementShape({ el, pitch }: { el: DiagramElement; pitch: Pitch }) {
  const s = unitScale(pitch);
  const fill = resolveColor(el.color, pitch.style);
  const outline = pitch.style === 'grass' ? '#ffffff' : '#333333';
  const rot = el.rotation ? ` rotate(${el.rotation})` : '';
  const at = `translate(${el.x} ${el.y})${rot}`;

  switch (el.kind) {
    case 'player': {
      const r = 1.25 * s;
      const light = isLight(el.color);
      const label = el.label ?? '';
      const fs = (label.length > 2 ? 1.0 : 1.3) * s;
      return (
        <g transform={`translate(${el.x} ${el.y})`}>
          <circle r={r} fill={fill} stroke={light ? '#333333' : '#ffffff'} strokeWidth={0.18 * s} />
          {label && (
            <text
              y={fs * 0.36}
              textAnchor="middle"
              fontFamily={FONT}
              fontWeight="bold"
              fontSize={fs}
              fill={light ? '#222222' : '#ffffff'}
            >
              {label}
            </text>
          )}
        </g>
      );
    }
    case 'cone':
      return (
        <g transform={at}>
          <polygon
            points={`0,${-0.85 * s} ${0.7 * s},${0.5 * s} ${-0.7 * s},${0.5 * s}`}
            fill={fill}
            stroke="#000000"
            strokeOpacity={0.35}
            strokeWidth={0.1 * s}
          />
        </g>
      );
    case 'ball':
      return (
        <g transform={at}>
          <circle r={0.6 * s} fill="#ffffff" stroke="#222222" strokeWidth={0.12 * s} />
          <circle r={0.2 * s} fill="#222222" />
        </g>
      );
    case 'goal':
    case 'minigoal': {
      const w = el.kind === 'goal' ? 7.32 : 3;
      const d = el.kind === 'goal' ? 2 : 1.2;
      const frame = el.color === 'auto' ? outline : fill;
      return (
        <g transform={at}>
          <rect x={-w / 2} y={-d} width={w} height={d} fill={frame} fillOpacity={0.2} stroke={frame} strokeWidth={0.12} />
          <line x1={-w / 2} y1={0} x2={w / 2} y2={0} stroke={frame} strokeWidth={0.35} strokeLinecap="round" />
        </g>
      );
    }
    case 'mannequin':
      return (
        <g transform={at}>
          <ellipse rx={0.85 * s} ry={0.38 * s} fill={fill} stroke="#222222" strokeWidth={0.1 * s} />
          <circle r={0.3 * s} fill="#222222" />
        </g>
      );
    case 'pole':
      return (
        <g transform={at}>
          <circle r={0.38 * s} fill={fill} stroke={outline} strokeWidth={0.12 * s} />
          <circle r={0.12 * s} fill={outline} />
        </g>
      );
    case 'ladder': {
      const L = 4 * s;
      const half = 0.45 * s;
      const rungs = [];
      for (let i = 1; i < 8; i++) {
        const x = -L / 2 + (L / 8) * i;
        rungs.push(<line key={i} x1={x} y1={-half} x2={x} y2={half} stroke={fill} strokeWidth={0.1 * s} />);
      }
      return (
        <g transform={at}>
          <rect x={-L / 2} y={-half} width={L} height={half * 2} fill="none" stroke={fill} strokeWidth={0.14 * s} />
          {rungs}
        </g>
      );
    }
    case 'text': {
      const fs = 1.6 * s * (el.size ?? 1);
      return (
        <g transform={at}>
          <text
            y={fs * 0.35}
            textAnchor="middle"
            fontFamily={FONT}
            fontWeight="bold"
            fontSize={fs}
            fill={fill}
          >
            {el.label || 'Text'}
          </text>
        </g>
      );
    }
    case 'zone': {
      const zc = el.color === 'auto' ? (pitch.style === 'grass' ? '#ffffff' : COLORS.blue) : fill;
      return (
        <rect
          x={el.x}
          y={el.y}
          width={el.w ?? 10}
          height={el.h ?? 10}
          fill={zc}
          fillOpacity={0.18}
          stroke={zc}
          strokeWidth={0.18 * s}
          strokeDasharray={`${0.9 * s} ${0.6 * s}`}
        />
      );
    }
  }
}

function ArrowShape({ a, pitch }: { a: Arrow; pitch: Pitch }) {
  const s = unitScale(pitch);
  const color = resolveColor(a.color, pitch.style);
  const shape = arrowShape(a, s);
  return (
    <g>
      <path
        d={shape.shaft}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth(a.kind, s)}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={a.kind === 'run' ? `${0.9 * s} ${0.65 * s}` : undefined}
      />
      <polygon points={shape.head} fill={color} />
    </g>
  );
}

/** Zones sit under everything; arrows go above equipment but below players. */
const LAYER: Record<DiagramElement['kind'], number> = {
  zone: 0,
  ladder: 1,
  goal: 1,
  minigoal: 1,
  cone: 2,
  pole: 2,
  mannequin: 2,
  text: 4,
  player: 5,
  ball: 6,
};

export interface DiagramSVGProps {
  diagram: Diagram;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  /** Pixel size attributes; omitted on screen so CSS controls the size. */
  width?: number;
  height?: number;
  /** Adds data-id hooks and invisible hit areas for the editor. */
  interactive?: boolean;
  /** Editor overlay (selection outlines, handles, previews). */
  children?: ReactNode;
  onPointerDown?: React.PointerEventHandler<SVGSVGElement>;
  onPointerMove?: React.PointerEventHandler<SVGSVGElement>;
  onPointerUp?: React.PointerEventHandler<SVGSVGElement>;
  style?: React.CSSProperties;
}

export function DiagramSVG({
  diagram,
  className,
  svgRef,
  width,
  height,
  interactive,
  children,
  style,
  ...handlers
}: DiagramSVGProps) {
  const { pitch } = diagram;
  // Fills any letterboxing around the pitch when the SVG box has a different aspect ratio.
  const bg = pitch.style === 'grass' ? GRASS.surround : PLAIN.surround;
  const vb = viewBox(pitch);
  const s = unitScale(pitch);
  const sorted = [...diagram.elements].sort((a, b) => LAYER[a.kind] - LAYER[b.kind]);
  const below = sorted.filter((e) => LAYER[e.kind] < 4);
  const above = sorted.filter((e) => LAYER[e.kind] >= 4);

  const renderEl = (el: DiagramElement) => (
    <g key={el.id} data-id={interactive ? el.id : undefined} style={interactive ? { cursor: 'move' } : undefined}>
      <ElementShape el={el} pitch={pitch} />
      {interactive && el.kind !== 'zone' && el.kind !== 'player' && (
        <circle cx={el.x} cy={el.y} r={1.6 * s} fill="#000" fillOpacity={0} />
      )}
    </g>
  );

  return (
    <svg
      ref={svgRef}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      width={width}
      height={height}
      className={className}
      style={width ? style : { background: bg, ...style }}
      {...handlers}
    >
      <PitchLayer pitch={pitch} />
      {below.map(renderEl)}
      {diagram.arrows.map((a) => (
        <g key={a.id} data-id={interactive ? a.id : undefined} style={interactive ? { cursor: 'move' } : undefined}>
          <ArrowShape a={a} pitch={pitch} />
          {interactive && (
            <path
              d={arrowShape(a, s).centre}
              fill="none"
              stroke="#000"
              strokeOpacity={0}
              strokeWidth={1.8 * s}
            />
          )}
        </g>
      ))}
      {above.map(renderEl)}
      {children}
    </svg>
  );
}

/** Small swatch-style icon of a single element, for toolbars. */
export function ElementIcon({ el, size = 28 }: { el: Omit<DiagramElement, 'id' | 'x' | 'y'>; size?: number }) {
  // Goals are drawn behind their goal line (y <= 0), so nudge them down to centre the icon.
  const y = el.kind === 'goal' ? 1 : el.kind === 'minigoal' ? 0.6 : 0;
  const shown: DiagramElement = { ...el, id: 'icon', x: 0, y };
  // Render at a fixed symbol scale (s = 1) with dark outlines for the light toolbar.
  const scaledPitch: Pitch = { type: 'grid', width: 70, height: 70, style: 'plain' };
  const frame = el.kind === 'goal' ? 9 : el.kind === 'ladder' ? 5.2 : el.kind === 'zone' ? 12 : 3.4;
  const target = el.kind === 'zone' ? { ...shown, x: -5, y: -4, w: 10, h: 8 } : shown;
  return (
    <svg viewBox={`${-frame / 2} ${-frame / 2} ${frame} ${frame}`} width={size} height={size}>
      <ElementShape el={target} pitch={scaledPitch} />
    </svg>
  );
}

export function ArrowIcon({ kind, size = 28 }: { kind: Arrow['kind']; size?: number }) {
  const pitch: Pitch = { type: 'grid', width: 70, height: 70, style: 'plain' };
  const a: Arrow = { id: 'icon', kind, x1: -3.8, y1: 3.2, x2: 3.8, y2: -3.2, color: 'black' };
  return (
    <svg viewBox="-5 -5 10 10" width={size} height={size}>
      <ArrowShape a={a} pitch={pitch} />
    </svg>
  );
}

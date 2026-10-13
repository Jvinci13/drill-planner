import { uid } from './constants';
import type { Arrow, DiagramElement, Drill } from './types';

const el = (kind: DiagramElement['kind'], x: number, y: number, color: string, extra: Partial<DiagramElement> = {}): DiagramElement => ({
  id: uid(),
  kind,
  x,
  y,
  color,
  ...extra,
});
const p = (x: number, y: number, color: string, label: string) => el('player', x, y, color, { label });
const cone = (x: number, y: number, color = 'orange') => el('cone', x, y, color);
const arrow = (kind: Arrow['kind'], x1: number, y1: number, x2: number, y2: number, c?: [number, number], color = 'auto'): Arrow => ({
  id: uid(),
  kind,
  x1,
  y1,
  x2,
  y2,
  cx: c?.[0],
  cy: c?.[1],
  color,
});

export function sampleDrills(): Drill[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      title: 'Rondo 4v2',
      category: 'Possession',
      ageGroup: 'U10+',
      players: '6 (4v2)',
      duration: 12,
      area: '15 x 15 m',
      tags: ['rondo', 'warm-up', 'pressing'],
      objective: 'Keep possession under pressure with quick, accurate passing and good support angles.',
      setup: 'Mark a 15 x 15 m square with cones. Four attackers on the outside, two defenders inside.',
      instructions:
        'Attackers keep the ball on the outside of the square. Defenders try to win it or force it out of the area.\n\nIf a defender wins the ball, the attacker who lost it swaps in with the defender who has been in the middle longest.',
      coachingPoints: 'Open body shape to see both options\nPass to the far foot\nMove to create a passing angle after every pass\nDefenders press as a pair: one presses, one covers',
      progressions: 'Two-touch limit\nTen passes in a row = one point\nShrink the area to 12 x 12 m',
      diagrams: [
        {
          id: uid(),
          caption: 'Setup',
          pitch: { type: 'grid', width: 15, height: 15, style: 'grass' },
          elements: [
            cone(0, 0), cone(15, 0), cone(0, 15), cone(15, 15),
            p(7.5, 0.8, 'red', '1'), p(14.2, 7.5, 'red', '2'), p(7.5, 14.2, 'red', '3'), p(0.8, 7.5, 'red', '4'),
            p(6, 6.5, 'blue', '1'), p(9, 8.7, 'blue', '2'),
            el('ball', 8.6, 1.4, 'auto'),
          ],
          arrows: [
            arrow('pass', 8.3, 1.8, 13.4, 6.6, [12.3, 2.8]),
            arrow('run', 6.8, 7.2, 10.2, 4.6, undefined, 'yellow'),
          ],
        },
      ],
      createdAt: now - 3000,
      updatedAt: now - 3000,
    },
    {
      id: uid(),
      title: 'Passing square with overlap',
      category: 'Passing',
      ageGroup: 'U12+',
      players: '8-12',
      duration: 15,
      area: '20 x 20 m',
      tags: ['passing', 'third man', 'overlap'],
      objective: 'Combination play: pass, follow and overlap, with quality of first touch.',
      setup: 'Four cones in a 20 x 20 m square, 2-3 players at each cone, one ball.',
      instructions:
        'A passes to B and follows the pass. B lays the ball back to A, who plays into C. B overlaps around C to receive the ball and dribble to D.',
      coachingPoints: 'Receive across the body on the back foot\nCommunicate: call for the ball\nTiming of the overlap: go when the pass is played',
      progressions: 'Work in both directions\nAdd a passive defender in the middle',
      diagrams: [
        {
          id: uid(),
          caption: 'Pattern',
          pitch: { type: 'grid', width: 20, height: 20, style: 'grass' },
          elements: [
            cone(2, 18), cone(2, 2), cone(18, 2), cone(18, 18),
            p(2, 16.8, 'red', 'A'), p(2, 3.2, 'red', 'B'), p(16.8, 2, 'red', 'C'), p(18, 16.8, 'red', 'D'),
            el('ball', 3.2, 15.8, 'auto'),
          ],
          arrows: [
            arrow('pass', 2.6, 15.6, 2.6, 5.2),
            arrow('run', 1.2, 15.5, 1.2, 6.5, undefined, 'yellow'),
            arrow('pass', 3.6, 6.4, 15.2, 2.8),
            arrow('run', 3.4, 2.6, 15, 6.2, [11, -1.5], 'yellow'),
            arrow('dribble', 16.2, 7.2, 17.6, 15),
          ],
        },
      ],
      createdAt: now - 2000,
      updatedAt: now - 2000,
    },
    {
      id: uid(),
      title: 'Wall pass and finish',
      category: 'Finishing',
      ageGroup: 'U11+',
      players: '6-10 + GK',
      duration: 15,
      area: 'Final third',
      tags: ['finishing', 'one-two', 'shooting'],
      objective: 'Finish first time after a combination on the edge of the box.',
      setup: 'Use the final third. Line of attackers 30 m out with balls, a server on the edge of the box, goalkeeper in goal.',
      instructions:
        'Attacker dribbles at the mannequin, plays a wall pass with the server and finishes first time. Server rotates after five reps.',
      coachingPoints: 'Pass with the outside of the foot to disguise it\nAccelerate after the pass\nLook at the goalkeeper before shooting\nStrike across the goalkeeper towards the far post',
      progressions: 'Defender recovers from behind\nFinish with the weaker foot',
      diagrams: [
        {
          id: uid(),
          caption: 'Setup',
          pitch: { type: 'third', width: 68, height: 35, style: 'grass' },
          elements: [
            p(34, 1.8, 'orange', 'GK'),
            el('mannequin', 30, 20, 'yellow'), el('mannequin', 32, 20, 'yellow'),
            p(26, 17, 'blue', 'S'),
            p(36, 31, 'red', '1'), p(38.5, 32.5, 'red', '2'), p(41, 34, 'red', '3'),
            el('ball', 35, 29.6, 'auto'),
          ],
          arrows: [
            arrow('dribble', 35, 28.6, 33, 23.2),
            arrow('pass', 32, 22.6, 27.5, 18.4),
            arrow('pass', 27.4, 16, 33.5, 14),
            arrow('run', 34.6, 22.4, 35.2, 15.2, [37, 18.5], 'yellow'),
            arrow('shot', 35, 13, 37.4, 1.2),
          ],
        },
      ],
      createdAt: now - 1000,
      updatedAt: now - 1000,
    },
  ];
}

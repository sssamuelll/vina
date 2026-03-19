import { describe, it, expect } from 'vitest';
import {
  computeBoundingBox,
  computeHandlePositions,
  scaleOutline,
  rotateOutline,
} from '../../../utils/geometry/transform';
import type { PathCommand, PatternPiece } from '../../../types/types';

const makeRect = (x: number, y: number, w: number, h: number): PathCommand[] => [
  { type: 'M', values: [x, y] },
  { type: 'L', values: [x + w, y] },
  { type: 'L', values: [x + w, y + h] },
  { type: 'L', values: [x, y + h] },
  { type: 'Z', values: [] },
];

const makePiece = (id: string, outline: PathCommand[], pos = { x: 0, y: 0 }): PatternPiece => ({
  id,
  name: id,
  outline,
  internals: [],
  position: pos,
  rotation: 0,
  mirrored: false,
  seamAllowance: 10,
  layer: 1,
  sublayer: 0,
  createdAt: 0,
  updatedAt: 0,
});

describe('computeBoundingBox', () => {
  it('returns bbox for a single piece at origin', () => {
    const pieces = [makePiece('p1', makeRect(0, 0, 100, 50))];
    const bbox = computeBoundingBox(pieces, ['p1']);
    expect(bbox).toEqual({ x: 0, y: 0, width: 100, height: 50 });
  });

  it('accounts for piece position offset', () => {
    const pieces = [makePiece('p1', makeRect(0, 0, 100, 50), { x: 30, y: 20 })];
    const bbox = computeBoundingBox(pieces, ['p1']);
    expect(bbox).toEqual({ x: 30, y: 20, width: 100, height: 50 });
  });

  it('returns combined bbox for multiple pieces', () => {
    const pieces = [
      makePiece('p1', makeRect(0, 0, 100, 50)),
      makePiece('p2', makeRect(0, 0, 80, 60), { x: 120, y: 10 }),
    ];
    const bbox = computeBoundingBox(pieces, ['p1', 'p2']);
    expect(bbox).toEqual({ x: 0, y: 0, width: 200, height: 70 });
  });

  it('returns null when no pieces selected', () => {
    const bbox = computeBoundingBox([], []);
    expect(bbox).toBeNull();
  });

  it('handles bezier curves by extracting all coordinate values', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, -20, 90, -20, 100, 0] },
      { type: 'L', values: [100, 50] },
      { type: 'L', values: [0, 50] },
      { type: 'Z', values: [] },
    ];
    const pieces = [makePiece('p1', outline)];
    const bbox = computeBoundingBox(pieces, ['p1']);
    // Control points extend to y=-20
    expect(bbox!.y).toBe(-20);
    expect(bbox!.height).toBe(70);
  });
});

describe('computeHandlePositions', () => {
  it('returns 9 handles for a bbox', () => {
    const handles = computeHandlePositions({ x: 0, y: 0, width: 100, height: 50 });
    expect(handles).toHaveLength(9);
    expect(handles.map(h => h.id)).toEqual([
      'nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se', 'rotate',
    ]);
  });

  it('positions corners correctly', () => {
    const handles = computeHandlePositions({ x: 10, y: 20, width: 100, height: 50 });
    const nw = handles.find(h => h.id === 'nw')!;
    const se = handles.find(h => h.id === 'se')!;
    expect(nw.pos).toEqual({ x: 10, y: 20 });
    expect(se.pos).toEqual({ x: 110, y: 70 });
  });

  it('positions rotation handle above top-center', () => {
    const handles = computeHandlePositions({ x: 0, y: 0, width: 100, height: 50 });
    const rot = handles.find(h => h.id === 'rotate')!;
    expect(rot.pos.x).toBe(50); // center X
    expect(rot.pos.y).toBeLessThan(0); // above top
  });
});

describe('scaleOutline', () => {
  it('scales a rectangle by 2x around center', () => {
    const outline = makeRect(0, 0, 100, 50);
    const center = { x: 50, y: 25 };
    const result = scaleOutline(outline, center, 2, 2);
    // M: (0,0) -> center + (0-50)*2, (0-25)*2 = (-50, -25)
    expect(result[0].values).toEqual([-50, -25]);
    // L: (100,0) -> center + (100-50)*2, (0-25)*2 = (150, -25)
    expect(result[1].values).toEqual([150, -25]);
  });

  it('scales only X axis with midpoint handles', () => {
    const outline = makeRect(0, 0, 100, 50);
    const center = { x: 50, y: 25 };
    const result = scaleOutline(outline, center, 1.5, 1);
    // Y values unchanged relative to center
    expect(result[0].values[1]).toBe(0); // (0-25)*1 + 25 = 0
    // X values scaled by 1.5
    expect(result[0].values[0]).toBe(-25); // (0-50)*1.5 + 50 = -25
  });

  it('scales cubic bezier control points', () => {
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [10, -20, 90, -20, 100, 0] },
      { type: 'Z', values: [] },
    ];
    const center = { x: 50, y: 0 };
    const result = scaleOutline(outline, center, 2, 2);
    // C: cp1x=10 -> (10-50)*2+50 = -30
    expect(result[1].values[0]).toBe(-30);
    // C: cp1y=-20 -> (-20-0)*2+0 = -40
    expect(result[1].values[1]).toBe(-40);
  });
});

describe('rotateOutline', () => {
  it('rotates 90 degrees around center', () => {
    const outline = makeRect(0, 0, 100, 100);
    const center = { x: 50, y: 50 };
    const result = rotateOutline(outline, center, Math.PI / 2);
    // M: (0,0) -> rotated 90deg around (50,50)
    // dx=-50, dy=-50 -> x'=50+(-50*0 - -50*1)=100, y'=50+(-50*1 + -50*0)=0
    expect(result[0].values[0]).toBeCloseTo(100);
    expect(result[0].values[1]).toBeCloseTo(0);
  });

  it('rotation by 0 returns same coordinates', () => {
    const outline = makeRect(10, 20, 100, 50);
    const center = { x: 60, y: 45 };
    const result = rotateOutline(outline, center, 0);
    expect(result[0].values).toEqual(outline[0].values);
  });
});

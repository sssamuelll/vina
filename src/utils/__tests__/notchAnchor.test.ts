import { describe, it, expect } from 'vitest';
import { detectCorners, computeNotchAnchor, resolveNotchAnchor, outlinePerimeter } from '../notchAnchor';
import type { PathCommand } from '../../types/types';

/** 100×100 closed square, stored vertex order: (0,0)→(100,0)→(100,100)→(0,100). */
const SQUARE: PathCommand[] = [
  { type: 'M', values: [0, 0] },
  { type: 'L', values: [100, 0] },
  { type: 'L', values: [100, 100] },
  { type: 'L', values: [0, 100] },
  { type: 'Z', values: [] },
];

/** Dense 36-gon circle r=50 centered (50,50) — no corner exceeds ~10°. */
function circle36(): PathCommand[] {
  const cmds: PathCommand[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const x = 50 + 50 * Math.cos(a);
    const y = 50 + 50 * Math.sin(a);
    cmds.push({ type: i === 0 ? 'M' : 'L', values: [x, y] });
  }
  cmds.push({ type: 'Z', values: [] });
  return cmds;
}

describe('detectCorners', () => {
  it('finds the 4 corners of a square', () => {
    const corners = detectCorners(SQUARE);
    expect(corners).toHaveLength(4);
    const has = (x: number, y: number) =>
      corners.some(c => Math.hypot(c.x - x, c.y - y) < 0.01);
    expect(has(0, 0)).toBe(true);
    expect(has(100, 0)).toBe(true);
    expect(has(100, 100)).toBe(true);
    expect(has(0, 100)).toBe(true);
  });

  it('finds no corners on a dense circle (every turn ~10° < threshold)', () => {
    expect(detectCorners(circle36())).toHaveLength(0);
  });

  it('survives consecutive duplicate vertices AT the corners (CLO export quirk)', () => {
    // María's real DXF doubles the vertex exactly at each corner (curve
    // segment endpoints) — a naive wedge loop sees a zero-length side and
    // skips precisely the corner vertices, reporting 0 corners on every
    // piece (found via diagnostic on temp.dxf: 17 verts → 9 deduped,
    // dedupTopDev 90°).
    const doubled: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [0, 0] },     // duplicate corner vertex
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 0] },   // duplicate
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [100, 100] }, // duplicate
      { type: 'L', values: [0, 100] },
      { type: 'L', values: [0, 100] },   // duplicate
      { type: 'Z', values: [] },
    ];
    const corners = detectCorners(doubled);
    expect(corners).toHaveLength(4);
  });

  it('a notched-rectangle outline only reports true corners, not gentle curve samples', () => {
    // Rectangle with one edge replaced by a shallow 3-segment chamfer (~14° turns)
    const outline: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [40, 0] },
      { type: 'L', values: [50, 2] },   // shallow
      { type: 'L', values: [60, 0] },   // shallow
      { type: 'L', values: [100, 0] },
      { type: 'L', values: [100, 100] },
      { type: 'L', values: [0, 100] },
      { type: 'Z', values: [] },
    ];
    const corners = detectCorners(outline);
    // 4 rectangle corners only; the ±~11° chamfer vertices stay below 30°
    expect(corners).toHaveLength(4);
  });
});

describe('outlinePerimeter', () => {
  it('measures the closed-ring perimeter (modal distance ceiling)', () => {
    expect(outlinePerimeter(SQUARE)).toBeCloseTo(400, 5);
  });

  it('returns 0 for degenerate outlines', () => {
    expect(outlinePerimeter([{ type: 'M', values: [0, 0] }])).toBe(0);
  });
});

describe('computeNotchAnchor', () => {
  it('anchors a top-edge point to the nearest corner with forward direction', () => {
    const anchor = computeNotchAnchor(SQUARE, { x: 30, y: 0 });
    expect(anchor).not.toBeNull();
    expect(anchor!.refPoint).toEqual({ x: 0, y: 0 });
    expect(anchor!.direction).toBe('cw'); // along stored vertex order
    expect(anchor!.distanceMm).toBeCloseTo(30, 5);
  });

  it('switches reference corner and direction past the midpoint of an edge', () => {
    const anchor = computeNotchAnchor(SQUARE, { x: 90, y: 0 });
    expect(anchor).not.toBeNull();
    expect(anchor!.refPoint).toEqual({ x: 100, y: 0 });
    expect(anchor!.direction).toBe('ccw'); // against stored vertex order
    expect(anchor!.distanceMm).toBeCloseTo(10, 5);
  });

  it('returns null on a cornerless outline (circle)', () => {
    expect(computeNotchAnchor(circle36(), { x: 100, y: 50 })).toBeNull();
  });
});

describe('resolveNotchAnchor', () => {
  it('round-trips: compute → resolve recovers the snap point and inward normal', () => {
    const snap = { x: 30, y: 0 };
    const anchor = computeNotchAnchor(SQUARE, snap)!;
    const resolved = resolveNotchAnchor(SQUARE, anchor);
    expect(resolved).not.toBeNull();
    expect(resolved!.point.x).toBeCloseTo(30, 5);
    expect(resolved!.point.y).toBeCloseTo(0, 5);
    // Square interior is below the top edge (y-down pattern space)
    expect(resolved!.normal.x).toBeCloseTo(0, 5);
    expect(resolved!.normal.y).toBeCloseTo(1, 5);
  });

  it('resolves a user-edited distance along the same edge', () => {
    const anchor = computeNotchAnchor(SQUARE, { x: 30, y: 0 })!;
    const moved = resolveNotchAnchor(SQUARE, { ...anchor, distanceMm: 42 });
    expect(moved).not.toBeNull();
    expect(moved!.point.x).toBeCloseTo(42, 5);
    expect(moved!.point.y).toBeCloseTo(0, 5);
  });

  it('walks around a corner when the distance exceeds the edge length', () => {
    // From corner (0,0) cw (stored order) 130mm: 100 along top edge + 30 down the right edge
    const resolved = resolveNotchAnchor(SQUARE, {
      refPoint: { x: 0, y: 0 },
      direction: 'cw',
      distanceMm: 130,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.point.x).toBeCloseTo(100, 5);
    expect(resolved!.point.y).toBeCloseTo(30, 5);
    // Inward on the right edge points -x
    expect(resolved!.normal.x).toBeCloseTo(-1, 5);
    expect(resolved!.normal.y).toBeCloseTo(0, 5);
  });

  it('resolves ccw distances against the stored vertex order', () => {
    // From corner (100,0) ccw 10mm → back along the top edge to (90,0)
    const resolved = resolveNotchAnchor(SQUARE, {
      refPoint: { x: 100, y: 0 },
      direction: 'ccw',
      distanceMm: 10,
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.point.x).toBeCloseTo(90, 5);
    expect(resolved!.point.y).toBeCloseTo(0, 5);
  });

  it('returns null when the refPoint does not lie on the outline', () => {
    const resolved = resolveNotchAnchor(SQUARE, {
      refPoint: { x: 500, y: 500 },
      direction: 'cw',
      distanceMm: 10,
    });
    expect(resolved).toBeNull();
  });

  it('wraps distances longer than the perimeter', () => {
    const resolved = resolveNotchAnchor(SQUARE, {
      refPoint: { x: 0, y: 0 },
      direction: 'cw',
      distanceMm: 430, // perimeter 400 + 30
    });
    expect(resolved).not.toBeNull();
    expect(resolved!.point.x).toBeCloseTo(30, 5);
    expect(resolved!.point.y).toBeCloseTo(0, 5);
  });
});

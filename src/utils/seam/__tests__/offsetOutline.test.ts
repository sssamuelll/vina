import { describe, it, expect } from 'vitest';
import type { PathCommand, Point2D } from '../../../types/types';
import { offsetOutline } from '../cornerTypes';

const ptsOf = (cmds: PathCommand[] | null): Point2D[] =>
  (cmds ?? []).filter(c => c.type === 'M' || c.type === 'L').map(c => ({ x: c.values[0], y: c.values[1] }));

function area(pts: Point2D[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    a += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(a / 2);
}

const bbox = (pts: Point2D[]) => ({
  minX: Math.min(...pts.map(p => p.x)), maxX: Math.max(...pts.map(p => p.x)),
  minY: Math.min(...pts.map(p => p.y)), maxY: Math.max(...pts.map(p => p.y)),
});

function rect(x: number, y: number, w: number, h: number): PathCommand[] {
  return [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x + w, y] },
    { type: 'L', values: [x + w, y + h] },
    { type: 'L', values: [x, y + h] },
    { type: 'Z', values: [] },
  ];
}

/** Same rectangle, wound the other way. */
function rectReversed(x: number, y: number, w: number, h: number): PathCommand[] {
  return [
    { type: 'M', values: [x, y] },
    { type: 'L', values: [x, y + h] },
    { type: 'L', values: [x + w, y + h] },
    { type: 'L', values: [x + w, y] },
    { type: 'Z', values: [] },
  ];
}

describe('offsetOutline', () => {
  it('outward miter on a rectangle hits the four exact corners', () => {
    const out = ptsOf(offsetOutline(rect(100, 100, 300, 150), 10, 'miter'));
    expect(out).toHaveLength(4);
    expect(area(out)).toBeCloseTo(320 * 170, 0);
    const b = bbox(out);
    expect(b.minX).toBeCloseTo(90, 1);
    expect(b.maxX).toBeCloseTo(410, 1);
    expect(b.minY).toBeCloseTo(90, 1);
    expect(b.maxY).toBeCloseTo(260, 1);
  });

  it('inward miter shrinks the rectangle by the same amount', () => {
    const out = ptsOf(offsetOutline(rect(100, 100, 300, 150), -10, 'miter'));
    expect(out).toHaveLength(4);
    expect(area(out)).toBeCloseTo(280 * 130, 0);
    const b = bbox(out);
    expect(b.minX).toBeCloseTo(110, 1);
    expect(b.maxX).toBeCloseTo(390, 1);
    expect(b.minY).toBeCloseTo(110, 1);
    expect(b.maxY).toBeCloseTo(240, 1);
  });

  it('winding does not decide the direction — outward is outward either way', () => {
    const a = ptsOf(offsetOutline(rect(0, 0, 200, 100), 10, 'miter'));
    const b = ptsOf(offsetOutline(rectReversed(0, 0, 200, 100), 10, 'miter'));
    expect(area(a)).toBeCloseTo(220 * 120, 0);
    expect(area(b)).toBeCloseTo(220 * 120, 0);
  });

  it('round join adds arc points at the corners, miter does not', () => {
    const miter = ptsOf(offsetOutline(rect(0, 0, 200, 100), 20, 'miter'));
    const round = ptsOf(offsetOutline(rect(0, 0, 200, 100), 20, 'round'));
    expect(round.length).toBeGreaterThan(miter.length);
    // Every arc point is exactly one radius from its corner, and the rounded
    // area is strictly between the un-offset rect and the mitered offset.
    expect(area(round)).toBeGreaterThan(200 * 100);
    expect(area(round)).toBeLessThan(area(miter));
  });

  it('square (bevel) join cuts each corner with a single chord', () => {
    const bevel = ptsOf(offsetOutline(rect(0, 0, 200, 100), 20, 'square'));
    const miter = ptsOf(offsetOutline(rect(0, 0, 200, 100), 20, 'miter'));
    // Two points per corner instead of one.
    expect(bevel).toHaveLength(8);
    expect(area(bevel)).toBeLessThan(area(miter));
  });

  it('distance 0 returns the outline unchanged', () => {
    const src = rect(10, 20, 30, 40);
    expect(offsetOutline(src, 0)).toEqual(src);
  });

  it('an inward offset that eats the shape returns null instead of garbage', () => {
    // 40mm inward on a 60x60 square leaves nothing.
    expect(offsetOutline(rect(0, 0, 60, 60), -40, 'miter')).toBeNull();
  });

  it('handles a concave L-shape without self-intersecting', () => {
    const lShape: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [120, 0] },
      { type: 'L', values: [120, 40] },
      { type: 'L', values: [40, 40] },
      { type: 'L', values: [40, 120] },
      { type: 'L', values: [0, 120] },
      { type: 'Z', values: [] },
    ];
    const inArea = area(ptsOf(lShape));
    const grown = ptsOf(offsetOutline(lShape, 10, 'miter'));
    const shrunk = ptsOf(offsetOutline(lShape, -10, 'miter'));

    expect(area(grown)).toBeGreaterThan(inArea);
    expect(area(shrunk)).toBeLessThan(inArea);
    expect(area(shrunk)).toBeGreaterThan(0);
  });

  it('a curved outline offsets outward without collapsing', () => {
    const curved: PathCommand[] = [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [-30, 40, -30, 80, 0, 120] },
      { type: 'L', values: [120, 120] },
      { type: 'L', values: [120, 0] },
      { type: 'Z', values: [] },
    ];
    const grown = offsetOutline(curved, 10, 'round');
    expect(grown).not.toBeNull();
    expect(area(ptsOf(grown))).toBeGreaterThan(area(ptsOf(curved)));
  });
});

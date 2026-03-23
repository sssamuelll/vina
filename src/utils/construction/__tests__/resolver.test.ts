import { describe, it, expect } from 'vitest';
import { resolveConstructionPoints } from '../resolver';
import type { CPoint } from '../../../types/construction';

function makePoint(id: string, label: string, def: CPoint['definition']): CPoint {
  return { id, label, x: 0, y: 0, definition: def, visible: true };
}

describe('Construction Resolver', () => {
  const measurements = { chest: 960, waist: 820, height: 1800 };
  const variables = {};

  it('resolves absolute points', () => {
    const points = [makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 })];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[0]).toEqual({ id: 'p1', x: 0, y: 0 });
    expect(result.errors).toHaveLength(0);
  });

  it('resolves manual points', () => {
    const points = [makePoint('p1', 'A', { type: 'manual', x: 100, y: 200 })];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[0]).toEqual({ id: 'p1', x: 100, y: 200 });
  });

  it('resolves endLine points', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'B', { type: 'endLine', basePoint: 'A', angle: 0, length: 100 }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[1].x).toBeCloseTo(100, 1);
    expect(result.resolved[1].y).toBeCloseTo(0, 1);
  });

  it('resolves endLine at 270 degrees (down)', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'B', { type: 'endLine', basePoint: 'A', angle: 270, length: 100 }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[1].x).toBeCloseTo(0, 1);
    expect(result.resolved[1].y).toBeCloseTo(100, 1); // Y down
  });

  it('resolves alongLine points', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'B', { type: 'absolute', x: 200, y: 0 }),
      makePoint('p3', 'C', { type: 'alongLine', from: 'A', to: 'B', length: 100 }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[2].x).toBeCloseTo(100, 1);
    expect(result.resolved[2].y).toBeCloseTo(0, 1);
  });

  it('resolves midpoint', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'B', { type: 'absolute', x: 200, y: 100 }),
      makePoint('p3', 'M', { type: 'midpoint', from: 'A', to: 'B' }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[2]).toEqual({ id: 'p3', x: 100, y: 50 });
  });

  it('resolves intersectionXY', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 100, y: 50 }),
      makePoint('p2', 'B', { type: 'absolute', x: 200, y: 300 }),
      makePoint('p3', 'C', { type: 'intersectionXY', xFrom: 'A', yFrom: 'B' }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[2]).toEqual({ id: 'p3', x: 100, y: 300 });
  });

  it('resolves line-line intersection', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'B', { type: 'absolute', x: 100, y: 100 }),
      makePoint('p3', 'C', { type: 'absolute', x: 100, y: 0 }),
      makePoint('p4', 'D', { type: 'absolute', x: 0, y: 100 }),
      makePoint('p5', 'X', { type: 'intersection', line1Start: 'A', line1End: 'B', line2Start: 'C', line2End: 'D' }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[4].x).toBeCloseTo(50, 1);
    expect(result.resolved[4].y).toBeCloseTo(50, 1);
  });

  it('handles chain of dependent points', () => {
    const points = [
      makePoint('p1', 'origin', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'right', { type: 'endLine', basePoint: 'origin', angle: 0, length: 240 }),
      makePoint('p3', 'down', { type: 'endLine', basePoint: 'origin', angle: 270, length: 450 }),
      makePoint('p4', 'corner', { type: 'intersectionXY', xFrom: 'right', yFrom: 'down' }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.resolved[3].x).toBeCloseTo(240, 1);
    expect(result.resolved[3].y).toBeCloseTo(450, 1);
  });

  it('reports errors for missing references', () => {
    const points = [
      makePoint('p1', 'A', { type: 'endLine', basePoint: 'MISSING', angle: 0, length: 100 }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].error).toContain('not found');
  });

  it('resolves with variables', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'B', { type: 'endLine', basePoint: 'A', angle: 0, length: 100 }),
    ];
    const vars = { halfChest: 480 };
    const result = resolveConstructionPoints(points, measurements, vars);
    expect(result.resolved).toHaveLength(2);
  });

  it('resolves normal (perpendicular) points', () => {
    const points = [
      makePoint('p1', 'A', { type: 'absolute', x: 0, y: 0 }),
      makePoint('p2', 'B', { type: 'absolute', x: 100, y: 0 }),
      makePoint('p3', 'N', { type: 'normal', from: 'A', to: 'B', angle: 90, length: 50 }),
    ];
    const result = resolveConstructionPoints(points, measurements, variables);
    // Normal at 90° from horizontal line → should go up (negative Y in screen coords)
    expect(result.resolved[2].x).toBeCloseTo(0, 0);
    expect(Math.abs(result.resolved[2].y)).toBeCloseTo(50, 0);
  });
});

describe('resolveConstructionPoints — resolutionError propagation', () => {
  it('omits resolutionError on successful resolution', () => {
    const points = [makePoint('p1', 'A', { type: 'manual', x: 100, y: 200 })];
    const result = resolveConstructionPoints(points, {}, {});
    expect(result.resolved[0].resolutionError).toBeUndefined();
    expect(result.errors).toHaveLength(0);
  });

  it('includes resolutionError on failed resolution', () => {
    const points = [
      makePoint('p1', 'B', { type: 'endLine', basePoint: 'nonexistent', angle: 0, length: 10 }),
    ];
    const result = resolveConstructionPoints(points, {}, {});
    expect(result.resolved[0].resolutionError).toBeDefined();
    expect(result.resolved[0].x).toBe(0);
    expect(result.resolved[0].y).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].error).toMatch(/nonexistent/i);
  });

  it('downstream points can still resolve after an upstream failure', () => {
    const points = [
      makePoint('p1', 'Broken', { type: 'endLine', basePoint: 'ghost', angle: 0, length: 10 }),
      makePoint('p2', 'OK', { type: 'manual', x: 50, y: 60 }),
    ];
    const result = resolveConstructionPoints(points, {}, {});
    expect(result.resolved[0].resolutionError).toBeDefined();
    expect(result.resolved[1].resolutionError).toBeUndefined();
    expect(result.resolved[1].x).toBe(50);
  });
});

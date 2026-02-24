import { describe, it, expect } from 'vitest';
import { resolveConstruction, type ConstructionStep } from '../constructionResolver';
import type { FormulaContext } from '../formulaEvaluator';

describe('resolveConstruction', () => {
  const emptyCtx: FormulaContext = { measurements: {}, variables: {} };

  it('resolves a single point', () => {
    const steps: ConstructionStep[] = [
      { id: 1, name: 'Origin', type: 'single', x: 0, y: 0 },
    ];
    const { points } = resolveConstruction(steps, emptyCtx);
    expect(points.get(1)).toEqual({ x: 0, y: 0 });
  });

  it('resolves a single point with coordinates', () => {
    const steps: ConstructionStep[] = [
      { id: 1, name: 'P1', type: 'single', x: 10.5, y: 20.3 },
    ];
    const { points } = resolveConstruction(steps, emptyCtx);
    expect(points.get(1)).toEqual({ x: 10.5, y: 20.3 });
  });

  it('resolves endLine: angle 270 (down), length 50', () => {
    const steps: ConstructionStep[] = [
      { id: 1, name: 'Origin', type: 'single', x: 0, y: 0 },
      { id: 2, name: 'Down', type: 'endLine', basePoint: 1, angle: 270, length: 50 },
    ];
    const { points } = resolveConstruction(steps, emptyCtx);
    const p = points.get(2)!;
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(50); // Y-down in screen coords
  });

  it('resolves endLine: angle 0 (right), length 30', () => {
    const steps: ConstructionStep[] = [
      { id: 1, name: 'Origin', type: 'single', x: 0, y: 0 },
      { id: 2, name: 'Right', type: 'endLine', basePoint: 1, angle: 0, length: 30 },
    ];
    const { points } = resolveConstruction(steps, emptyCtx);
    const p = points.get(2)!;
    expect(p.x).toBeCloseTo(30);
    expect(p.y).toBeCloseTo(0);
  });

  it('resolves endLine with formula length', () => {
    const ctx: FormulaContext = {
      measurements: {},
      variables: { '#L': 106 },
    };
    const steps: ConstructionStep[] = [
      { id: 1, name: 'Top', type: 'single', x: 0, y: 0 },
      { id: 2, name: 'Bottom', type: 'endLine', basePoint: 1, angle: 270, length: '#L' },
    ];
    const { points } = resolveConstruction(steps, ctx);
    expect(points.get(2)!.y).toBeCloseTo(106);
  });

  it('resolves alongLine between two points', () => {
    const steps: ConstructionStep[] = [
      { id: 1, name: 'A', type: 'single', x: 0, y: 0 },
      { id: 2, name: 'B', type: 'single', x: 100, y: 0 },
      { id: 3, name: 'Mid', type: 'alongLine', firstPoint: 1, secondPoint: 2, length: 40 },
    ];
    const { points } = resolveConstruction(steps, emptyCtx);
    const p = points.get(3)!;
    expect(p.x).toBeCloseTo(40);
    expect(p.y).toBeCloseTo(0);
  });

  it('resolves pointOfIntersection (x from first, y from second)', () => {
    const steps: ConstructionStep[] = [
      { id: 1, name: 'A', type: 'single', x: 30, y: 10 },
      { id: 2, name: 'B', type: 'single', x: 50, y: 80 },
      { id: 3, name: 'C', type: 'pointOfIntersection', firstPoint: 1, secondPoint: 2 },
    ];
    const { points } = resolveConstruction(steps, emptyCtx);
    expect(points.get(3)).toEqual({ x: 30, y: 80 });
  });

  it('resolves normal point', () => {
    // Normal to a horizontal line with userAngle=0 → perpendicular up (90° from line)
    const steps: ConstructionStep[] = [
      { id: 1, name: 'A', type: 'single', x: 0, y: 50 },
      { id: 2, name: 'B', type: 'single', x: 100, y: 50 },
      { id: 3, name: 'N', type: 'normal', firstPoint: 1, secondPoint: 2, angle: 0, length: 20 },
    ];
    const { points } = resolveConstruction(steps, emptyCtx);
    const p = points.get(3)!;
    // Line A→B is at math angle 0°. Normal = 0 + 90 + 0 = 90°.
    // angleToOffset(90, 20) → x=0, y=-20 (up in screen). So point = (0, 50-20) = (0, 30)
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(30);
  });

  it('generates spline curves', () => {
    const steps: ConstructionStep[] = [
      { id: 1, name: 'A', type: 'single', x: 0, y: 0 },
      { id: 2, name: 'B', type: 'single', x: 100, y: 100 },
      { id: 3, name: '', type: 'spline', point1: 1, point4: 2, angle1: 0, angle2: 180 },
    ];
    const { curves } = resolveConstruction(steps, emptyCtx);
    expect(curves.length).toBe(2);
    expect(curves[0].type).toBe('M');
    expect(curves[1].type).toBe('C');
    expect(curves[1].values.length).toBe(6); // cp1x,cp1y,cp2x,cp2y,x,y
  });
});

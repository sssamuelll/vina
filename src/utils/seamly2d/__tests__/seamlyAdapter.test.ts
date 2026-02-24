import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { adaptSeamlyPattern, type SeamlyPattern } from '../seamlyAdapter';

function loadPattern(name: string): SeamlyPattern {
  const raw = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'tools', 'seamly2d-converter', 'output', `${name}.json`),
    'utf-8',
  );
  return JSON.parse(raw) as SeamlyPattern;
}

describe('male_shirt integration', () => {
  const pattern = loadPattern('male_shirt');
  const result = adaptSeamlyPattern(pattern);

  it('resolves all 188 construction steps', () => {
    // The pattern has 188 steps total, but some (line, spline, splinePath) don't produce points
    const pointStepTypes = new Set([
      'single', 'endLine', 'alongLine', 'normal', 'pointOfIntersection',
      'intersectXY', 'lineIntersectAxis', 'lineIntersect', 'height',
      'curveIntersectAxis', 'shoulder', 'cutSpline', 'bisector',
    ]);
    const pointSteps = pattern.construction.filter(s => pointStepTypes.has(s.type));
    expect(result.points.length).toBe(pointSteps.length);
  });

  it('no resolved points at (0,0) except origin', () => {
    const originsAtZero = result.points.filter(
      p => p.x === 0 && p.y === 0,
    );
    // Only origin points (single type at 0,0) should be at origin
    const originSteps = pattern.construction.filter(
      s => s.type === 'single' && (s.x ?? 0) === 0 && (s.y ?? 0) === 0,
    );
    expect(originsAtZero.length).toBeLessThanOrEqual(originSteps.length);
  });

  it('produces all 17 pieces', () => {
    expect(result.pieces.length).toBe(17);
  });

  it('all pieces have non-zero bounding boxes', () => {
    for (const piece of result.pieces) {
      const xs = piece.nodes
        .map(n => result.points.find(p => p.label === n.pointId))
        .filter(Boolean)
        .map(p => p!.x);
      const ys = piece.nodes
        .map(n => result.points.find(p => p.label === n.pointId))
        .filter(Boolean)
        .map(p => p!.y);
      if (xs.length < 2) continue;
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      // At least one dimension should be non-zero (some pieces like Cuff may be vertical strips)
      expect(
        width > 0 || height > 0,
        `Piece "${piece.name}" has zero width and height`,
      ).toBe(true);
    }
  });

  it('has no adapter errors', () => {
    expect(result.errors).toEqual([]);
  });

  it('curveIntersectAxis points are not at (0,0)', () => {
    const ciaSteps = pattern.construction.filter(s => s.type === 'curveIntersectAxis');
    for (const step of ciaSteps) {
      const pt = result.points.find(p => p.label === step.name);
      expect(pt, `curveIntersectAxis point ${step.name} should exist`).toBeDefined();
      if (pt) {
        expect(
          pt.x !== 0 || pt.y !== 0,
          `curveIntersectAxis ${step.name} should not be at origin`,
        ).toBe(true);
      }
    }
  });

  it('shoulder point is not at (0,0)', () => {
    const pt = result.points.find(p => p.label === 'C4');
    expect(pt).toBeDefined();
    expect(pt!.x !== 0 || pt!.y !== 0).toBe(true);
  });

  it('cutSpline point is not at (0,0)', () => {
    const pt = result.points.find(p => p.label === 'D10');
    expect(pt).toBeDefined();
    expect(pt!.x !== 0 || pt!.y !== 0).toBe(true);
  });
});

describe('tshirt_test integration', () => {
  const pattern = loadPattern('tshirt_test');
  const result = adaptSeamlyPattern(pattern);

  it('no points are NaN', () => {
    for (const pt of result.points) {
      expect(Number.isNaN(pt.x), `${pt.label} has NaN x`).toBe(false);
      expect(Number.isNaN(pt.y), `${pt.label} has NaN y`).toBe(false);
    }
  });

  it('no points at (0,0) except actual origin points', () => {
    const originsAtZero = result.points.filter(p => p.x === 0 && p.y === 0);
    const originSteps = pattern.construction.filter(
      s => s.type === 'single' && (s.x ?? 0) === 0 && (s.y ?? 0) === 0,
    );
    expect(originsAtZero.length).toBeLessThanOrEqual(originSteps.length);
  });

  it('sleeve points have varying X coordinates (bug #54 fix)', () => {
    // Sleeve points start with C
    const sleevePoints = result.points.filter(p => p.label.startsWith('C'));
    expect(sleevePoints.length).toBeGreaterThan(3);
    const uniqueX = new Set(sleevePoints.map(p => Math.round(p.x * 10) / 10));
    expect(uniqueX.size, 'Sleeve points should have varying X, not all the same').toBeGreaterThan(2);
  });

  it('all 5 pieces have non-degenerate bounding boxes', () => {
    expect(result.pieces.length).toBe(5);
    for (const piece of result.pieces) {
      const pts = piece.nodes
        .map(n => result.points.find(p => p.label === n.pointId))
        .filter(Boolean);
      const xs = pts.map(p => p!.x);
      const ys = pts.map(p => p!.y);
      const width = Math.max(...xs) - Math.min(...xs);
      const height = Math.max(...ys) - Math.min(...ys);
      expect(width > 1 && height > 1, `Piece "${piece.name}" is degenerate: ${width}x${height}`).toBe(true);
    }
  });

  it('cutSplinePath points C10 and C11 are not at (0,0) (bug #56)', () => {
    const c10 = result.points.find(p => p.label === 'C10');
    const c11 = result.points.find(p => p.label === 'C11');
    expect(c10, 'C10 should exist').toBeDefined();
    expect(c11, 'C11 should exist').toBeDefined();
    if (c10) expect(c10.x !== 0 || c10.y !== 0, 'C10 should not be at origin').toBe(true);
    if (c11) expect(c11.x !== 0 || c11.y !== 0, 'C11 should not be at origin').toBe(true);
  });

  it('has no adapter errors', () => {
    expect(result.errors).toEqual([]);
  });
});

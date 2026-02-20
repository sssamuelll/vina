import { describe, it, expect } from 'vitest';
import {
  generateSeamAllowance,
  flattenPath,
  equidistant,
  checkLoops,
  isClockwise,
  AngleType,
} from '../utils/seam';
import type { SAPoint } from '../utils/seam';
import type { PathCommand, Point2D } from '../types/types';

function makeSAPoints(pts: Point2D[]): SAPoint[] {
  return pts.map(p => ({ ...p, saBefore: -1, saAfter: -1, angleType: AngleType.ByLength }));
}

function dist(a: Point2D, b: Point2D): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

// Distance from point to line segment
function pointToSegmentDist(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// Min distance from point to polygon edges
function minDistToPolygon(p: Point2D, poly: Point2D[]): number {
  let min = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    min = Math.min(min, pointToSegmentDist(p, poly[i], poly[j]));
  }
  return min;
}

describe('Seam Allowance Engine', () => {
  describe('1. Square 100x100 with SA 10', () => {
    it('produces an expanded square ~120x120', () => {
      // CCW square
      const square: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const result = equidistant(makeSAPoints(square), 10);
      expect(result.length).toBeGreaterThanOrEqual(4);

      // Find bounding box
      const xs = result.map(p => p.x);
      const ys = result.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);

      expect(minX).toBeCloseTo(-10, 0);
      expect(maxX).toBeCloseTo(110, 0);
      expect(minY).toBeCloseTo(-10, 0);
      expect(maxY).toBeCloseTo(110, 0);
    });
  });

  describe('2. Triangle with SA 10', () => {
    it('offsets all edges by ~10mm', () => {
      const triangle: Point2D[] = [
        { x: 50, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const result = equidistant(makeSAPoints(triangle), 10);
      expect(result.length).toBeGreaterThanOrEqual(3);

      // Each original edge should be ~10mm from closest offset edge
      for (const orig of triangle) {
        const d = minDistToPolygon(orig, result);
        expect(d).toBeGreaterThan(9);
        expect(d).toBeLessThan(35); // corners can be further
      }
    });
  });

  describe('3. L-shape (concave corner)', () => {
    it('handles concave corner without crash', () => {
      // L-shape (CCW)
      const lShape: Point2D[] = [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 80 },
        { x: 0, y: 80 },
      ];
      const result = equidistant(makeSAPoints(lShape), 5);
      expect(result.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('4. Collinear points', () => {
    it('cleans collinear points and still generates SA', () => {
      const pts: Point2D[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },  // collinear
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ];
      const result = equidistant(makeSAPoints(pts), 10);
      expect(result.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('5. Degenerate inputs', () => {
    it('single point returns empty', () => {
      expect(equidistant(makeSAPoints([{ x: 0, y: 0 }]), 10)).toEqual([]);
    });

    it('two points returns empty', () => {
      expect(equidistant(makeSAPoints([{ x: 0, y: 0 }, { x: 10, y: 0 }]), 10)).toEqual([]);
    });
  });

  describe('6. Variable SA per point', () => {
    it('respects different saBefore/saAfter', () => {
      const pts: SAPoint[] = [
        { x: 0, y: 0, saBefore: 15, saAfter: 15, angleType: AngleType.ByLength },
        { x: 100, y: 0, saBefore: 15, saAfter: 10, angleType: AngleType.ByLength },
        { x: 100, y: 100, saBefore: 10, saAfter: 10, angleType: AngleType.ByLength },
        { x: 0, y: 100, saBefore: 10, saAfter: 15, angleType: AngleType.ByLength },
      ];
      const result = equidistant(pts, 10);
      expect(result.length).toBeGreaterThanOrEqual(4);

      const xs = result.map(p => p.x);
      const minX = Math.min(...xs);
      // Left edge has SA=15, so should be around -15
      expect(minX).toBeCloseTo(-15, 0);
    });
  });

  describe('7. Dart (acute angle)', () => {
    it('handles very acute angle without extreme offset', () => {
      // Narrow triangle (dart-like, ~20° angle at top)
      const dart: Point2D[] = [
        { x: 50, y: 0 },
        { x: 60, y: 100 },
        { x: 40, y: 100 },
      ];
      const result = equidistant(makeSAPoints(dart), 10);
      expect(result.length).toBeGreaterThanOrEqual(3);

      // The top point shouldn't be extremely far (ByLength should cap it)
      const ys = result.map(p => p.y);
      const minY = Math.min(...ys);
      expect(minY).toBeGreaterThan(-100); // shouldn't go crazy
    });
  });

  describe('8. Clockwise detection', () => {
    it('detects CW polygon (math convention)', () => {
      // CW in math convention (Y up) = this order in standard coords
      expect(isClockwise([
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
      ])).toBe(true);
    });

    it('detects CCW polygon (math convention)', () => {
      expect(isClockwise([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ])).toBe(false);
    });
  });

  describe('9. flattenPath', () => {
    it('flattens cubic bezier to ~12 segments', () => {
      const cmds: PathCommand[] = [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [33, 0, 66, 100, 100, 100] },
      ];
      const pts = flattenPath(cmds);
      // 1 (M) + 12 (C segments) = 13
      expect(pts.length).toBe(13);
      expect(pts[0]).toEqual({ x: 0, y: 0 });
      expect(pts[pts.length - 1].x).toBeCloseTo(100);
      expect(pts[pts.length - 1].y).toBeCloseTo(100);
    });
  });

  describe('10. Round trip generateSeamAllowance', () => {
    it('returns valid PathCommand[] starting with M and ending with Z', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'L', values: [0, 100] },
        { type: 'Z', values: [] },
      ];
      const result = generateSeamAllowance(outline, 10);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('M');
      expect(result[result.length - 1].type).toBe('Z');
    });
  });

  describe('11. Zero width', () => {
    it('returns empty', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'Z', values: [] },
      ];
      expect(generateSeamAllowance(outline, 0)).toEqual([]);
    });
  });

  describe('12. Negative width', () => {
    it('returns empty', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [100, 0] },
        { type: 'L', values: [100, 100] },
        { type: 'Z', values: [] },
      ];
      expect(generateSeamAllowance(outline, -5)).toEqual([]);
    });
  });

  describe('13. checkLoops', () => {
    it('removes self-intersecting loops', () => {
      // A bowtie/figure-8 shape that has a crossing
      const bowtie: Point2D[] = [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
        { x: 100, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 0 },
      ];
      const result = checkLoops(bowtie);
      // Should have fewer points (loop removed)
      expect(result.length).toBeLessThan(bowtie.length);
    });
  });
});

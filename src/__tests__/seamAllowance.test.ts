import { describe, it, expect } from 'vitest';
import {
  generateSeamAllowance,
  flattenPath,
} from '../utils/seam';
import type { PathCommand, Point2D } from '../types/types';

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

function makeSquareOutline(size: number): PathCommand[] {
  return [
    { type: 'M', values: [0, 0] },
    { type: 'L', values: [size, 0] },
    { type: 'L', values: [size, size] },
    { type: 'L', values: [0, size] },
    { type: 'Z', values: [] },
  ];
}

function extractPoints(cmds: PathCommand[]): Point2D[] {
  return cmds
    .filter(c => c.type === 'M' || c.type === 'L')
    .map(c => ({ x: c.values[0], y: c.values[1] }));
}

describe('Seam Allowance Engine (Clipper2)', () => {
  describe('Square 100x100 with SA 10', () => {
    it('produces an expanded shape ~120x120', () => {
      const result = generateSeamAllowance(makeSquareOutline(100), 10, 'round');
      expect(result.length).toBeGreaterThan(0);
      const pts = extractPoints(result);
      const xs = pts.map(p => p.x);
      const ys = pts.map(p => p.y);
      expect(Math.min(...xs)).toBeCloseTo(-10, 0);
      expect(Math.max(...xs)).toBeCloseTo(110, 0);
      expect(Math.min(...ys)).toBeCloseTo(-10, 0);
      expect(Math.max(...ys)).toBeCloseTo(110, 0);
    });
  });

  describe('Triangle with SA 10', () => {
    it('offsets all edges outward', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [50, 0] },
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

  describe('L-shape (concave corner)', () => {
    it('handles concave corner without crash', () => {
      const outline: PathCommand[] = [
        { type: 'M', values: [0, 0] },
        { type: 'L', values: [60, 0] },
        { type: 'L', values: [60, 40] },
        { type: 'L', values: [40, 40] },
        { type: 'L', values: [40, 80] },
        { type: 'L', values: [0, 80] },
        { type: 'Z', values: [] },
      ];
      const result = generateSeamAllowance(outline, 5);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('flattenPath', () => {
    it('flattens cubic bezier to ~12 segments', () => {
      const cmds: PathCommand[] = [
        { type: 'M', values: [0, 0] },
        { type: 'C', values: [33, 0, 66, 100, 100, 100] },
      ];
      const pts = flattenPath(cmds);
      expect(pts.length).toBe(13);
      expect(pts[0]).toEqual({ x: 0, y: 0 });
      expect(pts[pts.length - 1].x).toBeCloseTo(100);
      expect(pts[pts.length - 1].y).toBeCloseTo(100);
    });
  });

  describe('Valid PathCommand output', () => {
    it('returns valid PathCommand[] starting with M and ending with Z', () => {
      const result = generateSeamAllowance(makeSquareOutline(100), 10);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].type).toBe('M');
      expect(result[result.length - 1].type).toBe('Z');
    });
  });

  describe('Zero width', () => {
    it('returns empty', () => {
      expect(generateSeamAllowance(makeSquareOutline(100), 0)).toEqual([]);
    });
  });

  describe('Negative width', () => {
    it('returns empty', () => {
      expect(generateSeamAllowance(makeSquareOutline(100), -5)).toEqual([]);
    });
  });

  describe('Join types', () => {
    it('round join produces more points than miter', () => {
      const outline = makeSquareOutline(100);
      const round = generateSeamAllowance(outline, 10, 'round');
      const miter = generateSeamAllowance(outline, 10, 'miter');
      expect(round.length).toBeGreaterThan(miter.length);
    });
  });
});

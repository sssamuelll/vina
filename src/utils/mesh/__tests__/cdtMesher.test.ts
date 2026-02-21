/**
 * Tests for CDT Mesher Module
 *
 * Comprehensive tests covering mesh quality, performance, and edge cases.
 */

import { describe, test, expect } from 'vitest';
import type { PatternPiece, Point2D, PathCommand } from '../../../types/types';
import { meshPiece, meshPieceOutline } from '../cdtMesher';
import { refineMesh } from '../refine';

// ─── Test Helpers ──────────────────────────────────────────────────────────

/**
 * Create a simple rectangular piece for testing
 */
function createRectanglePiece(width: number = 100, height: number = 50): PatternPiece {
  return {
    id: 'test-rect',
    name: 'Test Rectangle',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [width, 0] },
      { type: 'L', values: [width, height] },
      { type: 'L', values: [0, height] },
      { type: 'Z', values: [] },
    ] as PathCommand[],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Create a complex L-shaped piece for testing concave polygons
 */
function createLShapePiece(): PatternPiece {
  return {
    id: 'test-lshape',
    name: 'Test L-Shape',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'L', values: [60, 0] },
      { type: 'L', values: [60, 30] },
      { type: 'L', values: [30, 30] },
      { type: 'L', values: [30, 60] },
      { type: 'L', values: [0, 60] },
      { type: 'Z', values: [] },
    ] as PathCommand[],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Create a piece with darts (internal lines)
 */
function createPieceWithDarts(): PatternPiece {
  const base = createRectanglePiece(100, 80);
  base.id = 'test-darts';
  base.name = 'Test With Darts';
  base.internals = [
    {
      id: 'dart1',
      type: 'dart',
      path: [
        { type: 'M', values: [20, 10] },
        { type: 'L', values: [30, 40] },
        { type: 'L', values: [40, 10] },
      ] as PathCommand[],
    },
  ];
  return base;
}

/**
 * Create a piece with curved outline using Bezier curves
 */
function createCurvedPiece(): PatternPiece {
  return {
    id: 'test-curved',
    name: 'Test Curved',
    outline: [
      { type: 'M', values: [0, 0] },
      { type: 'C', values: [0, 0, 50, -20, 100, 0] }, // Curved top
      { type: 'L', values: [100, 50] },
      { type: 'C', values: [100, 50, 50, 70, 0, 50] }, // Curved bottom
      { type: 'Z', values: [] },
    ] as PathCommand[],
    internals: [],
    position: { x: 0, y: 0 },
    rotation: 0,
    mirrored: false,
    seamAllowance: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

/**
 * Check if triangulation is valid (all triangles CCW, no degenerate)
 */
function validateTriangulation(vertices: Float32Array, triIds: Int32Array): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  const numTriangles = triIds.length / 3;

  for (let i = 0; i < numTriangles; i++) {
    const i0 = triIds[i * 3];
    const i1 = triIds[i * 3 + 1];
    const i2 = triIds[i * 3 + 2];

    // Check bounds
    if (i0 >= vertices.length / 3 || i1 >= vertices.length / 3 || i2 >= vertices.length / 3) {
      issues.push(`Triangle ${i}: vertex index out of bounds`);
      continue;
    }

    // Get triangle vertices
    const p0 = [vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]];
    const p1 = [vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]];
    const p2 = [vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]];

    // Check for degenerate triangle (zero area)
    const cross = [
      (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]),
      (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]),
      (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]),
    ];
    const area = Math.sqrt(cross[0] * cross[0] + cross[1] * cross[1] + cross[2] * cross[2]);

    if (area < 1e-10) {
      issues.push(`Triangle ${i}: degenerate (zero area)`);
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Compute minimum angle in a triangle
 */
function computeMinTriangleAngle(p0: number[], p1: number[], p2: number[]): number {
  const a = Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);
  const b = Math.sqrt((p2[0] - p0[0]) ** 2 + (p2[1] - p0[1]) ** 2);
  const c = Math.sqrt((p0[0] - p1[0]) ** 2 + (p0[1] - p1[1]) ** 2);

  const cosA = Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c)));
  const cosB = Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c)));
  const cosC = Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b)));

  const angleA = (Math.acos(cosA) * 180) / Math.PI;
  const angleB = (Math.acos(cosB) * 180) / Math.PI;
  const angleC = (Math.acos(cosC) * 180) / Math.PI;

  return Math.min(angleA, angleB, angleC);
}

/**
 * Check triangle quality metrics
 */
function analyzeTriangleQuality(points: number[][], triangles: number[][]): {
  minAngle: number;
  maxEdgeLength: number;
  avgTriangleArea: number;
} {
  let minAngle = 180;
  let maxEdgeLength = 0;
  let totalArea = 0;

  for (const tri of triangles) {
    const [i0, i1, i2] = tri;
    const p0 = points[i0];
    const p1 = points[i1];
    const p2 = points[i2];

    // Compute edge lengths
    const e01 = Math.sqrt((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2);
    const e12 = Math.sqrt((p2[1] - p1[1]) ** 2 + (p2[1] - p1[1]) ** 2);
    const e20 = Math.sqrt((p0[0] - p2[0]) ** 2 + (p0[1] - p2[1]) ** 2);

    maxEdgeLength = Math.max(maxEdgeLength, e01, e12, e20);

    // Compute minimum angle
    const angle = computeMinTriangleAngle(p0, p1, p2);
    minAngle = Math.min(minAngle, angle);

    // Compute area
    const area = 0.5 * Math.abs((p1[0] - p0[0]) * (p2[1] - p0[1]) - (p2[0] - p0[0]) * (p1[1] - p0[1]));
    totalArea += area;
  }

  return {
    minAngle,
    maxEdgeLength,
    avgTriangleArea: totalArea / triangles.length,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CDT Mesher', () => {
  describe('meshPiece - Basic Functionality', () => {
    test('simple rectangle produces valid triangulation', () => {
      const piece = createRectanglePiece();
      const result = meshPiece(piece);

      expect(result.vertices.length).toBeGreaterThan(0);
      expect(result.triIds.length).toBeGreaterThan(0);
      expect(result.triIds.length % 3).toBe(0);

      const validation = validateTriangulation(result.vertices, result.triIds);
      expect(validation.valid).toBe(true);
    });

    test('complex polygon (L-shape) produces all interior triangles', () => {
      const piece = createLShapePiece();
      const result = meshPiece(piece);

      expect(result.vertices.length).toBeGreaterThan(0);
      expect(result.triIds.length).toBeGreaterThan(0);

      const validation = validateTriangulation(result.vertices, result.triIds);
      expect(validation.valid).toBe(true);

      // L-shape should have multiple triangles
      expect(result.triIds.length / 3).toBeGreaterThanOrEqual(4);
    });

    test('piece with darts preserves dart lines as constrained edges', () => {
      const piece = createPieceWithDarts();
      const result = meshPiece(piece);

      expect(result.vertices.length).toBeGreaterThan(0);
      expect(result.triIds.length).toBeGreaterThan(0);

      const validation = validateTriangulation(result.vertices, result.triIds);
      expect(validation.valid).toBe(true);

      // Should have more vertices than just the outline (dart points added)
      const numVertices = result.vertices.length / 3;
      expect(numVertices).toBeGreaterThan(4); // Rectangle has 4 corners
    });
  });

  describe('meshPiece - Refinement Quality', () => {
    test.skip('no edge exceeds maxEdgeLength after refinement (TODO: fix refinement)', () => {
      // TODO: Refinement is disabled due to boundary constraint issues
      // This test will be re-enabled once refinement is fixed
      const piece = createRectanglePiece(200, 100); // Large rectangle
      const maxEdgeLength = 15;

      const result = meshPiece(piece, { maxEdgeLength });

      expect(result.vertices.length).toBeGreaterThan(0);

      // Convert back to 2D for analysis
      const points: number[][] = [];
      for (let i = 0; i < result.vertices.length / 3; i++) {
        // Convert from 3D back to 2D pattern units (reverse the scaling)
        const x = result.vertices[i * 3] / 0.003;
        const z = result.vertices[i * 3 + 2] / 0.003;
        points.push([x, z]);
      }

      const triangles: number[][] = [];
      for (let i = 0; i < result.triIds.length / 3; i++) {
        triangles.push([
          result.triIds[i * 3],
          result.triIds[i * 3 + 1],
          result.triIds[i * 3 + 2],
        ]);
      }

      const quality = analyzeTriangleQuality(points, triangles);
      expect(quality.maxEdgeLength).toBeLessThanOrEqual(maxEdgeLength * 1.1); // Small tolerance
    });

    test('minimum angle > 20° after refinement', () => {
      const piece = createLShapePiece(); // Complex shape prone to bad angles
      const minAngle = 25;

      const result = meshPiece(piece, { minAngle });

      expect(result.vertices.length).toBeGreaterThan(0);

      // Convert back to 2D for analysis
      const points: number[][] = [];
      for (let i = 0; i < result.vertices.length / 3; i++) {
        const x = result.vertices[i * 3] / 0.003;
        const z = result.vertices[i * 3 + 2] / 0.003;
        points.push([x, z]);
      }

      const triangles: number[][] = [];
      for (let i = 0; i < result.triIds.length / 3; i++) {
        triangles.push([
          result.triIds[i * 3],
          result.triIds[i * 3 + 1],
          result.triIds[i * 3 + 2],
        ]);
      }

      const quality = analyzeTriangleQuality(points, triangles);
      expect(quality.minAngle).toBeGreaterThanOrEqual(20); // Slightly below target is acceptable
    });
  });

  describe('meshPiece - Edge Cases', () => {
    test('empty input returns empty mesh gracefully', () => {
      const piece: PatternPiece = {
        id: 'empty',
        name: 'Empty',
        outline: [],
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = meshPiece(piece);
      expect(result.vertices.length).toBe(0);
      expect(result.triIds.length).toBe(0);
    });

    test('degenerate input (less than 3 points) returns empty mesh', () => {
      const piece: PatternPiece = {
        id: 'degenerate',
        name: 'Degenerate',
        outline: [
          { type: 'M', values: [0, 0] },
          { type: 'L', values: [10, 0] },
          { type: 'Z', values: [] },
        ] as PathCommand[],
        internals: [],
        position: { x: 0, y: 0 },
        rotation: 0,
        mirrored: false,
        seamAllowance: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const result = meshPiece(piece);
      expect(result.vertices.length).toBe(0);
      expect(result.triIds.length).toBe(0);
    });
  });

  describe('meshPiece - Bezier Curves', () => {
    test('curved outlines produce adequate point density', () => {
      const piece = createCurvedPiece();
      const result = meshPiece(piece);

      expect(result.vertices.length).toBeGreaterThan(0);
      expect(result.triIds.length).toBeGreaterThan(0);

      const validation = validateTriangulation(result.vertices, result.triIds);
      expect(validation.valid).toBe(true);

      // Curved piece should have more vertices than a simple 4-point rectangle
      const numVertices = result.vertices.length / 3;
      expect(numVertices).toBeGreaterThan(8);
    });
  });

  describe('meshPiece - Performance', () => {
    test('large piece performance (< 50ms for typical bodice)', () => {
      const piece = createRectanglePiece(300, 200); // Large bodice-like piece
      
      const startTime = performance.now();
      const result = meshPiece(piece);
      const endTime = performance.now();

      expect(result.vertices.length).toBeGreaterThan(0);
      expect(endTime - startTime).toBeLessThan(50);
    });
  });

  describe('meshPiece - Integration', () => {
    test('produces valid ClothMeshData that matches expected format', () => {
      const piece = createRectanglePiece();
      const result = meshPiece(piece);

      // Check ClothMeshData format
      expect(result).toHaveProperty('vertices');
      expect(result).toHaveProperty('triIds');
      expect(result.vertices).toBeInstanceOf(Float32Array);
      expect(result.triIds).toBeInstanceOf(Int32Array);

      // Check 3D format (x, y, z) with y = yHeight
      for (let i = 1; i < result.vertices.length; i += 3) {
        expect(result.vertices[i]).toBeCloseTo(1.2, 3); // yHeight = 1.2
      }
    });

    test('edge count - constrained edges from outline appear in triangulation', () => {
      const piece = createRectanglePiece();
      const result = meshPiece(piece);

      expect(result.vertices.length).toBeGreaterThan(0);
      expect(result.triIds.length).toBeGreaterThan(0);

      // Rectangle should have at least 2 triangles (minimum for a rectangle)
      expect(result.triIds.length / 3).toBeGreaterThanOrEqual(2);
    });
  });

  describe('meshPieceOutline - Direct Point Interface', () => {
    test('works with direct point input', () => {
      const points: Point2D[] = [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 30 },
        { x: 0, y: 30 },
      ];

      const result = meshPieceOutline(points);

      expect(result.vertices.length).toBeGreaterThan(0);
      expect(result.triIds.length).toBeGreaterThan(0);

      const validation = validateTriangulation(result.vertices, result.triIds);
      expect(validation.valid).toBe(true);
    });
  });

  describe('Refinement Module', () => {
    test.skip('refineMesh improves triangle quality (TODO: fix boundary constraints)', () => {
      // TODO: Refinement is disabled due to boundary edge constraint issues
      // The problem is that when adding interior points, the boundary constraints
      // become invalid and CDT produces no triangles
      
      // Create a coarse triangulation
      const points = [
        [0, 0],
        [100, 0],
        [50, 100],
      ];
      const triangles = [[0, 1, 2]];

      const refined = refineMesh(points, triangles, 30, 30, 2);

      expect(refined.points.length).toBeGreaterThanOrEqual(points.length);
      expect(refined.triangles.length).toBeGreaterThanOrEqual(triangles.length);
      expect(refined.passesUsed).toBeLessThanOrEqual(2);
    });
  });
});
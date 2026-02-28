import { describe, it, expect } from 'vitest';
import { distance3D, computeBoundingBox3D, boundingBoxesOverlap, findMinimumDistance } from '../spatialDescriber';

describe('Spatial Describer - Distance Functions', () => {
  it('should calculate 3D distance between two points', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 3, y: 4, z: 0 };
    expect(distance3D(p1, p2)).toBeCloseTo(5);
  });

  it('should calculate 3D distance with z component', () => {
    const p1 = { x: 0, y: 0, z: 0 };
    const p2 = { x: 1, y: 2, z: 2 };
    expect(distance3D(p1, p2)).toBeCloseTo(3);
  });

  it('should compute bounding box from vertices', () => {
    const vertices = new Float32Array([
      0, 0, 0,
      100, 0, 0,
      100, 50, 0,
      0, 50, 0,
    ]);
    const bbox = computeBoundingBox3D(vertices);
    expect(bbox.minX).toBe(0);
    expect(bbox.maxX).toBe(100);
    expect(bbox.minY).toBe(0);
    expect(bbox.maxY).toBe(50);
    expect(bbox.minZ).toBe(0);
    expect(bbox.maxZ).toBe(0);
  });

  it('should detect overlapping bounding boxes', () => {
    const box1 = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    const box2 = { minX: 5, maxX: 15, minY: 5, maxY: 15, minZ: 5, maxZ: 15 };
    expect(boundingBoxesOverlap(box1, box2)).toBe(true);
  });

  it('should detect non-overlapping bounding boxes', () => {
    const box1 = { minX: 0, maxX: 10, minY: 0, maxY: 10, minZ: 0, maxZ: 10 };
    const box2 = { minX: 20, maxX: 30, minY: 20, maxY: 30, minZ: 20, maxZ: 30 };
    expect(boundingBoxesOverlap(box1, box2)).toBe(false);
  });
});

describe('Spatial Describer - Vertex Distance', () => {
  it('should find minimum distance between two vertex sets', () => {
    const verticesA = new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]);
    const verticesB = new Float32Array([20, 0, 0, 30, 0, 0, 30, 10, 0, 20, 10, 0]);

    const result = findMinimumDistance(verticesA, verticesB);
    expect(result.distance).toBeCloseTo(10);
    expect(result.indexA).toBeDefined();
    expect(result.indexB).toBeDefined();
  });

  it('should detect overlapping vertices (distance ~0)', () => {
    const verticesA = new Float32Array([0, 0, 0, 5, 5, 0]);
    const verticesB = new Float32Array([5, 5, 0, 10, 10, 0]);

    const result = findMinimumDistance(verticesA, verticesB);
    expect(result.distance).toBeCloseTo(0);
  });

  it('should handle empty vertex arrays', () => {
    const empty = new Float32Array([]);
    const vertices = new Float32Array([0, 0, 0]);

    const result = findMinimumDistance(empty, vertices);
    expect(result.distance).toBe(Infinity);
  });
});

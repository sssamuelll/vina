import { describe, it, expect } from 'vitest';
import { extractCollisionMesh } from '../collisionMesh';

type GeometryInput = Parameters<typeof extractCollisionMesh>[0];

function makeSingleTriGeometry(): GeometryInput {
  return {
    attributes: {
      position: {
        array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
        count: 3,
      },
    },
    index: { array: new Uint32Array([0, 1, 2]), count: 3 },
  };
}

function makeQuadGeometry(): GeometryInput {
  return {
    attributes: {
      position: {
        array: new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]),
        count: 4,
      },
    },
    index: { array: new Uint32Array([0, 1, 2, 0, 2, 3]), count: 6 },
  };
}

describe('extractCollisionMesh', () => {
  it('extracts vertices from a single triangle', () => {
    const geo = makeSingleTriGeometry();
    const result = extractCollisionMesh(geo);
    expect(result.triCount).toBe(1);
    expect(result.vertices.length).toBe(9);
    expect(result.vertices[0]).toBe(0);
    expect(result.vertices[3]).toBe(1);
    expect(result.vertices[7]).toBe(1);
  });

  it('computes face normals correctly for XY-plane triangle', () => {
    const geo = makeSingleTriGeometry();
    const result = extractCollisionMesh(geo);
    expect(result.normals.length).toBe(3);
    expect(result.normals[0]).toBeCloseTo(0);
    expect(result.normals[1]).toBeCloseTo(0);
    expect(result.normals[2]).toBeCloseTo(1);
  });

  it('extracts correct triangle count for quad', () => {
    const geo = makeQuadGeometry();
    const result = extractCollisionMesh(geo);
    expect(result.triCount).toBe(2);
    expect(result.vertices.length).toBe(18);
    expect(result.normals.length).toBe(6);
  });

  it('returns zero triCount for empty geometry', () => {
    const geo: GeometryInput = {
      attributes: { position: { array: new Float32Array([]), count: 0 } },
      index: { array: new Uint32Array([]), count: 0 },
    };
    const result = extractCollisionMesh(geo);
    expect(result.triCount).toBe(0);
    expect(result.vertices.length).toBe(0);
    expect(result.normals.length).toBe(0);
  });

  it('handles non-indexed geometry (no index)', () => {
    const geo: GeometryInput = {
      attributes: {
        position: {
          array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
          count: 3,
        },
      },
      index: null,
    };
    const result = extractCollisionMesh(geo);
    expect(result.triCount).toBe(1);
    expect(result.vertices.length).toBe(9);
  });
});

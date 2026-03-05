import { describe, it, expect } from 'vitest';
import {
  TriangleSpatialHash,
  solveTriangleCollision,
  pointToTriangleDist,
} from '../triangleCollision';
import type { CollisionMeshData } from '../collisionMesh';

function makeFloorTriangle(): CollisionMeshData {
  const vertices = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const normals = new Float32Array([0, 0, 1]);
  return { vertices, normals, triCount: 1 };
}

function makeFloorPlane(): CollisionMeshData {
  const vertices = new Float32Array([
    -5, 0, -5,  5, 0, -5,  5, 0, 5,
    -5, 0, -5,  5, 0, 5,  -5, 0, 5,
  ]);
  const normals = new Float32Array([0, 1, 0, 0, 1, 0]);
  return { vertices, normals, triCount: 2 };
}

describe('pointToTriangleDist', () => {
  it('returns zero distance for point on triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, 0, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0, 5);
  });

  it('returns perpendicular distance for point above triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, 0.5, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0.5, 5);
    expect(result.side).toBeGreaterThan(0);
  });

  it('returns perpendicular distance for point below triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(0.25, 0.25, -0.3, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(0.3, 5);
    expect(result.side).toBeLessThan(0);
  });

  it('returns edge distance for point outside triangle', () => {
    const mesh = makeFloorTriangle();
    const result = pointToTriangleDist(2, 0, 0, mesh.vertices, 0, mesh.normals, 0);
    expect(result.dist).toBeCloseTo(1.0, 5);
  });
});

describe('TriangleSpatialHash', () => {
  it('returns triangle index for nearby query', () => {
    const mesh = makeFloorTriangle();
    const hash = new TriangleSpatialHash(mesh, 0.5);
    const result = hash.query(0.25, 0.25, 0);
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(0);
  });

  it('returns empty for far-away query', () => {
    const mesh = makeFloorTriangle();
    const hash = new TriangleSpatialHash(mesh, 0.5);
    const result = hash.query(100, 100, 100);
    expect(result.length).toBe(0);
  });

  it('handles multiple triangles', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 1.0);
    const result = hash.query(0, 0, 0);
    expect(result.length).toBe(2);
  });
});

describe('solveTriangleCollision', () => {
  it('pushes particle below floor plane up to collision margin', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(margin, 3);
  });

  it('does not move particle above collision margin', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, 1.0, 0]);
    const invMass = new Float32Array([1.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(1.0, 5);
  });

  it('skips pinned particles (invMass === 0)', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([0, -0.01, 0]);
    const invMass = new Float32Array([0.0]);
    solveTriangleCollision(pos, invMass, 1, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(-0.01, 5);
  });

  it('handles multiple particles', () => {
    const mesh = makeFloorPlane();
    const hash = new TriangleSpatialHash(mesh, 2.0);
    const margin = 0.005;
    const pos = new Float32Array([
      0, -0.02, 0,
      0,  1.00, 0,
      0,  0.003, 0,
    ]);
    const invMass = new Float32Array([1.0, 1.0, 1.0]);
    solveTriangleCollision(pos, invMass, 3, mesh, hash, margin);
    expect(pos[1]).toBeCloseTo(margin, 3);
    expect(pos[4]).toBeCloseTo(1.0, 5);
    expect(pos[7]).toBeCloseTo(margin, 3);
  });
});

import { describe, it, expect } from 'vitest';
import {
  buildFacePokeMetricBody,
  computeFacePokeMetric,
  facePokeStrideFor,
} from '../facePokeMetric';
import type { CollisionMeshData } from '../collisionMesh';

/** One body triangle in the y=yBase plane with one vert lifted to yPoke. */
function bumpBody(yBase: number, yPoke: number): CollisionMeshData {
  // Small triangle centered near origin, normal +Y.
  const vertices = new Float32Array([
    0, yPoke, 0, // A — the bump vert (projects inside the cloth face below)
    0.5, yBase, 0.02,
    0.02, yBase, 0.5,
  ]);
  const normals = new Float32Array([0, 1, 0]);
  return { vertices, normals, triCount: 1 };
}

/** One big cloth face in the y=0 plane covering the origin. `flip` reverses winding. */
function clothFace(flip = false): { pos: Float32Array; idx: Uint32Array } {
  const pos = new Float32Array([
    -1, 0, -1,
    1, 0, -1,
    0, 0, 1.5,
  ]);
  const idx = flip ? new Uint32Array([0, 2, 1]) : new Uint32Array([0, 1, 2]);
  return { pos, idx };
}

const MARGIN = 0.008;

describe('facePokeMetric', () => {
  it('counts a body vert poking through the cloth face as visible', () => {
    const body = buildFacePokeMetricBody(bumpBody(-0.2, 0.01))!;
    const { pos, idx } = clothFace();
    const m = computeFacePokeMetric(pos, idx, body, { margin: MARGIN });
    expect(m.visible).toBe(1);
    expect(m.maxDepth).toBeCloseTo(0.01, 5);
    // Base verts sit 0.2 below → outside the −margin band, not `near`.
    expect(m.near).toBe(0);
  });

  it('winding-invariant: a flipped cloth face reports the same poke', () => {
    const body = buildFacePokeMetricBody(bumpBody(-0.2, 0.01))!;
    const { pos, idx } = clothFace(true);
    const m = computeFacePokeMetric(pos, idx, body, { margin: MARGIN });
    expect(m.visible).toBe(1);
    expect(m.maxDepth).toBeCloseTo(0.01, 5);
  });

  it('counts a vert just under the cloth (inside the margin band) as near, not visible', () => {
    const body = buildFacePokeMetricBody(bumpBody(-0.2, -0.004))!;
    const { pos, idx } = clothFace();
    const m = computeFacePokeMetric(pos, idx, body, { margin: MARGIN });
    expect(m.visible).toBe(0);
    expect(m.near).toBe(1);
  });

  it('ignores verts projecting outside the face and beyond the band', () => {
    // Bump vert far to the side: above the plane but outside the face.
    const outside: CollisionMeshData = {
      vertices: new Float32Array([5, 0.01, 5, 5.5, -0.2, 5, 5, -0.2, 5.5]),
      normals: new Float32Array([0, 1, 0]),
      triCount: 1,
    };
    const bodyOut = buildFacePokeMetricBody(outside)!;
    const { pos, idx } = clothFace();
    expect(computeFacePokeMetric(pos, idx, bodyOut, { margin: MARGIN }).visible).toBe(0);
    // Deep above the band (20cm > bandAbove 12cm) → missed by design.
    const bodyDeep = buildFacePokeMetricBody(bumpBody(-0.3, 0.2))!;
    expect(computeFacePokeMetric(pos, idx, bodyDeep, { margin: MARGIN }).visible).toBe(0);
  });

  it('welds soup multiplicity: a vert shared by 2 tris counts once', () => {
    // Two body tris sharing the bump vert at the same position.
    const shared: CollisionMeshData = {
      vertices: new Float32Array([
        0, 0.01, 0, 0.5, -0.2, 0.02, 0.02, -0.2, 0.5,
        0, 0.01, 0, -0.5, -0.2, 0.02, 0.02, -0.2, -0.5,
      ]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0]),
      triCount: 2,
    };
    const body = buildFacePokeMetricBody(shared)!;
    const { pos, idx } = clothFace();
    expect(computeFacePokeMetric(pos, idx, body, { margin: MARGIN }).visible).toBe(1);
  });

  it('stride budget: María-scale face count gets a >1 stride', () => {
    expect(facePokeStrideFor(57000)).toBeGreaterThan(1);
    expect(facePokeStrideFor(1000)).toBe(1);
  });
});

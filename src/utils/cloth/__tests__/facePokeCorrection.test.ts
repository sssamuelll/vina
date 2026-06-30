// src/utils/cloth/__tests__/facePokeCorrection.test.ts
import { it, expect } from 'vitest';
import { facePokeCorrection } from '../facePokeCorrection';
import type { CollisionMeshData } from '../collisionMesh';
import { buildBodyPseudonormals } from '../bodyPseudonormals';

// One body vertex poking up (+y) through a flat cloth quad lying in the y=0.1 plane,
// cloth normal +y. We test ONE cloth triangle whose 3 corners are all OUTSIDE
// (above) the body vertex but whose interior is pierced.
function bodyVertexBump(): CollisionMeshData {
  // A tiny body "tent" whose apex vertex is at (0,0.2,0): 4 tris around the apex.
  // For the test we only need the apex vertex's position + a +y-ish pseudonormal,
  // so a single upward-facing tri with the apex as a corner suffices.
  const vertices = new Float32Array([
    0, 0.2, 0,  1, 0, 1,  -1, 0, 1, // tri with apex (0,0.2,0)
  ]);
  const normals = new Float32Array([0, 1, 0]);
  return { vertices, normals, triCount: 1 };
}

it('cube-poke: all 3 corners of a pierced cloth face lift +n; control face untouched', () => {
  const body = bodyVertexBump();
  const pn = buildBodyPseudonormals(body, 1e-6);
  // cloth triangle in the y=0.1 plane, corners around the apex's xz=(0,0), all outside (y=0.1 > nothing; apex y=0.2 is ABOVE the face → poking through from below is the mirror; use margin so apex at 0.2 vs face 0.1 with outward +y → signed = (0.2-0.1) = +0.1, inside band):
  const A = [-1, 0.1, -1], B = [1, 0.1, -1], C = [0, 0.1, 1];
  const margin = 0.15;
  const r = facePokeCorrection(
    A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2],
    body.vertices, pn.vertex, margin,
  );
  // apex projects inside the triangle and is within margin on the +y (outward) side → push all corners +y.
  expect(r.dA[1]).toBeGreaterThan(0);
  expect(r.dB[1]).toBeGreaterThan(0);
  expect(r.dC[1]).toBeGreaterThan(0);

  // CONTROL: a cloth face far away (xz offset by +10) — apex does not project inside → zero.
  const r2 = facePokeCorrection(
    9,0.1,9, 11,0.1,9, 10,0.1,11,
    body.vertices, pn.vertex, margin,
  );
  expect(r2.dA[0]).toBe(0); expect(r2.dA[1]).toBe(0); expect(r2.dA[2]).toBe(0);
});

it('a body vertex safely behind the face yields ZERO correction (sign discriminator)', () => {
  const body = bodyVertexBump();
  const pn = buildBodyPseudonormals(body, 1e-6);
  // Face well OUTWARD of the apex: face at y=0.5, apex at y=0.2 → apex sits 0.3
  // behind the outward (+y) face, > margin → must NOT be pushed. A wrong
  // `depth = margin - signed` would push it (harder the deeper it sits) and fail here.
  const A = [-1, 0.5, -1], B = [1, 0.5, -1], C = [0, 0.5, 1];
  const margin = 0.15;
  const r = facePokeCorrection(A[0],A[1],A[2], B[0],B[1],B[2], C[0],C[1],C[2], body.vertices, pn.vertex, margin);
  expect(r.dA[1]).toBe(0); expect(r.dB[1]).toBe(0); expect(r.dC[1]).toBe(0);
});

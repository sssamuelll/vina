// src/utils/cloth/__tests__/bodyPseudonormals.test.ts
import { it, expect } from 'vitest';
import { weldAndCountManifold, buildBodyPseudonormals } from '../bodyPseudonormals';

// Two triangles sharing edge B–C, forming a 90° concave valley (a "V" pointing
// up): tri0 in the +x plane, tri1 in the +z plane, hinge along the y axis.
// soup layout: 9 floats/tri (A,B,C), 3 floats/tri face normal.
function makeConcaveValley() {
  // tri0: A0(1,0,0) B(0,0,0) C(0,1,0), face normal +z-ish (outward of the +x wall)
  // tri1: A1(0,0,1) B(0,0,0) C(0,1,0), face normal +x-ish (outward of the +z wall)
  // Shared edge B(0,0,0)–C(0,1,0). The interior wedge (between the walls) is the
  // region x>0,z>0; a point there is "outside" both walls but a single face normal
  // of either wall misclassifies it.
  const vertices = new Float32Array([
    1, 0, 0,  0, 0, 0,  0, 1, 0, // tri0 A0,B,C
    0, 0, 1,  0, 0, 0,  0, 1, 0, // tri1 A1,B,C
  ]);
  // Outward normals (point away from the wedge interior x>0,z>0):
  // tri0 (the +x wall) faces -z... choose consistent outward = (0,0,-1)? See note.
  const normals = new Float32Array([0, 0, -1,  -1, 0, 0]);
  return { vertices, normals, triCount: 2 };
}

it('welds the shared edge B–C into a manifold (1 non-boundary edge shared by 2 tris)', () => {
  const r = weldAndCountManifold(makeConcaveValley(), 1e-6);
  expect(r.welded).toBe(4); // 6 soup verts → 4 unique (B and C shared)
  expect(r.nonManifoldEdges).toBe(0);
  expect(r.boundaryEdges).toBe(4); // the 4 outer edges (each in 1 tri); B–C is shared
});

it('edge pseudonormal of the shared edge = normalized sum of the two face normals', () => {
  const mesh = makeConcaveValley(); // face normals (0,0,-1) and (-1,0,0)
  const pn = buildBodyPseudonormals(mesh, 1e-6);
  // tri0 edge BC is edge index 1 (AB=0, BC=1, CA=2). Its pseudonormal = normalize(
  // n0 + n1) = normalize((0,0,-1)+(-1,0,0)) = (-1,0,-1)/√2.
  const e = pn.edge; const base = 0 * 9 + 1 * 3;
  const inv = 1 / Math.SQRT2;
  expect(e[base]).toBeCloseTo(-inv, 5);
  expect(e[base + 1]).toBeCloseTo(0, 5);
  expect(e[base + 2]).toBeCloseTo(-inv, 5);
});

/**
 * Face-poke CSR/geometry packing validation (corr≈0 diagnosis, plan §Fase 2.1).
 *
 * The GPU face-poke `correct` kernel reads THREE packed regions out of ONE
 * uint storage buffer (offsets/list/triIds — `packFacePokeCsr`) plus ONE
 * interleaved float buffer (verts+pseudonormals — `packFacePokeBodyGeom`).
 * A packing bug — fCount=0 everywhere, wrong region base, transposed
 * interleave — is one of the corr≈0 suspects: these tests drive the ACTUAL
 * packing functions with a tiny synthetic scene (2 cloth triangles sharing
 * verts + 2 body tris) and replay the kernel's EXACT indexing
 * (tslFacePoke.ts makeFacePokeCorrectNode) on the packed arrays.
 */
import { describe, it, expect, vi } from 'vitest';

// three/webgpu and three/tsl resolve to the same bundle; mock both (same
// setup as tslBuffers.test.ts — needed to import createTslBuffers, whose
// transitive atomicStorage module-load probe calls storage().setAtomic).
vi.mock('three/webgpu', () => ({
  StorageBufferAttribute: class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    count: number;
    itemSize: number;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  },
}));

vi.mock('three/tsl', () => ({
  StorageBufferAttribute: class MockSBA {
    array: Float32Array | Uint32Array | Int32Array;
    count: number;
    itemSize: number;
    constructor(array: Float32Array | Uint32Array | Int32Array, itemSize: number) {
      this.array = array;
      this.count = array.length / itemSize;
      this.itemSize = itemSize;
    }
  },
  storage: () => ({ setAtomic: function () { return this; } }),
  atomicLoad: () => undefined,
}));

import { packFacePokeCsr, packFacePokeBodyGeom } from '../tslFacePoke';
import { buildClothVertexFaces } from '../../clothVertexFaces';
import { createTslBuffers } from '../tslBuffers';
import type { ClothMeshData, BendConstraints } from '../gpuBuffers';
import { colorConstraints } from '../gpuBuffers';

// ─── Synthetic scene: 2 cloth triangles sharing an edge (verts 0-2) ─────────
const N = 4;
const TRIS = new Uint32Array([0, 1, 2, 0, 2, 3]);
const NUM_TRIS = 2;

/**
 * Replays the kernel's packed-CSR indexing and returns every structural
 * violation found. Mirrors makeFacePokeCorrectNode exactly:
 *   fStart = csr[i]; fEnd = csr[i+1]
 *   t      = csr[listBase + k]           (listBase = N+1, k in [fStart,fEnd))
 *   ids    = csr[triIdsBase + t*3 .. +2] (triIdsBase = listBase + numTris*3)
 * An empty return = the kernel would see sound inputs.
 */
function checkPackedCsrInvariants(csr: Uint32Array, numParticles: number, numTris: number): string[] {
  const violations: string[] = [];
  const listBase = numParticles + 1;
  const triIdsBase = listBase + numTris * 3;
  if (csr.length !== triIdsBase + numTris * 3) {
    violations.push(`length ${csr.length} != expected ${triIdsBase + numTris * 3}`);
  }
  for (let p = 0; p < numParticles; p++) {
    if (csr[p + 1] < csr[p]) violations.push(`offsets not monotone at particle ${p}`);
  }
  if (csr[numParticles] !== numTris * 3) {
    violations.push(`offsets[N]=${csr[numParticles]} != numTris*3=${numTris * 3}`);
  }
  let totalIncidence = 0;
  for (let i = 0; i < numParticles; i++) {
    const fStart = csr[i];
    const fEnd = csr[i + 1];
    totalIncidence += fEnd - fStart;
    for (let k = fStart; k < fEnd; k++) {
      const t = csr[listBase + k];
      if (t >= numTris) {
        violations.push(`particle ${i}: incident-face entry ${t} out of range [0,${numTris})`);
        continue;
      }
      const ids = [csr[triIdsBase + t * 3], csr[triIdsBase + t * 3 + 1], csr[triIdsBase + t * 3 + 2]];
      if (ids.some((v) => v >= numParticles)) {
        violations.push(`tri ${t}: vertex id out of range (${ids.join(',')})`);
      }
      if (!ids.includes(i)) {
        violations.push(`particle ${i}: incident tri ${t}=(${ids.join(',')}) does not contain ${i}`);
      }
    }
  }
  if (totalIncidence === 0) violations.push('fCount = 0 for EVERY particle (degenerate CSR — corr≈0 suspect)');
  return violations;
}

describe('packFacePokeCsr (packed cloth CSR — the correct kernel input)', () => {
  const { offsets, faces } = buildClothVertexFaces(TRIS, N);
  const csr = packFacePokeCsr(offsets, faces, TRIS, N);

  it('buildClothVertexFaces: offsets monotone with the exact incident-face counts', () => {
    // v0 in tris {0,1}, v1 in {0}, v2 in {0,1}, v3 in {1}
    expect(Array.from(offsets)).toEqual([0, 2, 3, 5, 6]);
  });

  it('every cloth vert has a correct incident-face list (fCount > 0 for all used verts)', () => {
    const expected: Record<number, number[]> = { 0: [0, 1], 1: [0], 2: [0, 1], 3: [1] };
    for (let v = 0; v < N; v++) {
      const list = Array.from(faces.slice(offsets[v], offsets[v + 1])).sort();
      expect(list).toEqual(expected[v]);
      expect(offsets[v + 1] - offsets[v]).toBeGreaterThan(0); // fCount=0 suspect
    }
  });

  it('packed regions sit at the kernel bases: [offsets(N+1) | list(numTris*3) | triIds(numTris*3)]', () => {
    const listBase = N + 1;
    const triIdsBase = listBase + NUM_TRIS * 3;
    expect(csr.length).toBe(triIdsBase + NUM_TRIS * 3);
    expect(Array.from(csr.slice(0, listBase))).toEqual(Array.from(offsets));
    expect(Array.from(csr.slice(listBase, triIdsBase))).toEqual(Array.from(faces));
    expect(Array.from(csr.slice(triIdsBase))).toEqual(Array.from(TRIS));
  });

  it('replaying the kernel indexing on the packed array finds no violations', () => {
    expect(checkPackedCsrInvariants(csr, N, NUM_TRIS)).toEqual([]);
  });

  it('triIds are all in range [0, numParticles)', () => {
    const triIdsBase = N + 1 + NUM_TRIS * 3;
    for (let k = triIdsBase; k < csr.length; k++) {
      expect(csr[k]).toBeLessThan(N);
    }
  });

  it('NEGATIVE CONTROL: a degenerate packing (all-zero offsets → fCount=0) is FLAGGED', () => {
    // Proves these tests would catch the fCount=0 corr≈0 suspect: same layout,
    // but the offsets region is zeroed (every particle sees an empty face list).
    const broken = csr.slice();
    broken.fill(0, 0, N + 1);
    const violations = checkPackedCsrInvariants(broken, N, NUM_TRIS);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.join('; ')).toContain('fCount = 0 for EVERY particle');
  });
});

describe('packFacePokeBodyGeom (interleaved body verts + pseudonormals)', () => {
  it('lays out 18 floats/tri as [verts 9][pseudo 9] — exactly where the kernel reads', () => {
    const numBodyTris = 2;
    const triVerts = Float32Array.from({ length: numBodyTris * 9 }, (_, i) => i); // 0..17
    const pseudo = Float32Array.from({ length: numBodyTris * 9 }, (_, i) => 100 + i); // 100..117
    const out = packFacePokeBodyGeom(triVerts, pseudo, numBodyTris);

    expect(out.length).toBe(numBodyTris * 18);
    for (let t = 0; t < numBodyTris; t++) {
      for (let lv = 0; lv < 3; lv++) {
        for (let c = 0; c < 3; c++) {
          // Kernel: vert at [bt*18 + lv*3 + c], pseudonormal at [bt*18 + 9 + lv*3 + c].
          expect(out[t * 18 + lv * 3 + c]).toBe(triVerts[t * 9 + lv * 3 + c]);
          expect(out[t * 18 + 9 + lv * 3 + c]).toBe(pseudo[t * 9 + lv * 3 + c]);
        }
      }
    }
  });
});

describe('production wiring: createTslBuffers builds facePokeCsrSBA with this exact packing', () => {
  it('facePokeCsrSBA.array equals packFacePokeCsr(buildClothVertexFaces(mesh.triangles))', () => {
    const mesh: ClothMeshData = {
      positions: new Float32Array([
        -0.5, 1.0, 0.0, 0.5, 1.0, 0.0, 0.5, 0.0, 0.0, -0.5, 0.0, 0.0,
      ]),
      triangles: TRIS,
      invMass: new Float32Array([1, 1, 1, 1]),
    };
    const stretchIds = new Uint32Array([0, 1, 1, 2, 2, 3, 3, 0]);
    const colored = colorConstraints(stretchIds, new Float32Array([1, 1, 1, 1]), 4);
    const bend: BendConstraints = {
      ids: new Uint32Array([0, 2, 1, 3]),
      restAngles: new Float32Array([Math.PI]),
      edgeTypes: new Uint8Array([1]),
    };
    const buffers = createTslBuffers(mesh, colored, bend, null);

    const { offsets, faces } = buildClothVertexFaces(TRIS, N);
    const reference = packFacePokeCsr(offsets, faces, TRIS, N);
    expect(buffers.facePokeCsrSBA.itemSize).toBe(1);
    expect(Array.from(buffers.facePokeCsrSBA.array)).toEqual(Array.from(reference));
    expect(checkPackedCsrInvariants(buffers.facePokeCsrSBA.array as Uint32Array, N, NUM_TRIS)).toEqual([]);

    // A4 contact slots: one uint per cloth face, zero-seeded (0 = no contact;
    // Pass A writes soupIdx+1, Pass B reads).
    expect(buffers.facePokeContactSBA.itemSize).toBe(1);
    expect(buffers.facePokeContactSBA.array.length).toBe(NUM_TRIS);
  });
});

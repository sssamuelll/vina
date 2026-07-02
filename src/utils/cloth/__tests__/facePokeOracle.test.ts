/**
 * CPU-oracle canonical poke (corr≈0 diagnosis, plan §Fase 2.1).
 *
 * The GPU face-poke kernel mirrors `facePokeCorrection.ts` line-by-line, so
 * if the ORACLE produces corr≈0 on the canonical poke scene, the corr≈0
 * symptom is a SPEC bug (a predicate kills all contacts), not TSL codegen.
 * These tests pin the oracle's contract on that scene: one cloth face whose
 * 3 verts are all OUTSIDE the body, with a convex body vertex protruding
 * THROUGH the face interior.
 *
 * The second block cross-checks `computeExpectedFacePokeCorrections` (the
 * probe's expected-side accumulator in gpu/facePokeDebug.ts) against direct
 * oracle calls, driving the REAL packing functions — this is what the
 * @gpu-local probe compares GPU readback-diffs against.
 */
import { describe, it, expect, vi } from 'vitest';

// tslFacePoke imports three/tsl at module scope for its kernel builders; the
// pack functions under test are pure and never touch those imports.
vi.mock('three/tsl', () => ({}));

import { facePokeCorrection } from '../facePokeCorrection';
import { buildClothVertexFaces } from '../clothVertexFaces';
import { packFacePokeCsr, packFacePokeBodyGeom } from '../gpu/tslFacePoke';
import { computeExpectedFacePokeCorrections } from '../gpu/facePokeDebug';

// ─── Canonical poke scene ────────────────────────────────────────────────────
// Cloth face in the y=0 plane; centroid at the origin. Face raw normal
// (B-A)×(C-A) = (0,-6,0) → outward flips to +y (body pseudonormal is +y).
const A = [-1, 0, -1] as const;
const B = [1, 0, -1] as const;
const C = [0, 0, 2] as const;

/** Production avatar margin (AVATAR_MARGIN in gpuSolverClient.ts). */
const MARGIN = 0.008;

/**
 * One body triangle: apex protruding `apexY` above the face plane, projecting
 * exactly onto the face CENTROID (α=β=γ=1/3 → each corner's push = depth,
 * per the (α/Σα²)·depth math). The two base verts sit 0.5 m BEHIND the
 * outward face plane (signed=-0.5 ≤ -margin → skipped) AND outside the
 * barycentric footprint — doubly non-contributing.
 */
function bodySoup(apexY: number): { verts: Float32Array; pseudo: Float32Array } {
  return {
    verts: new Float32Array([0, apexY, 0, 5, -0.5, 1, -5, -0.5, 1]),
    pseudo: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
  };
}

describe('facePokeCorrection oracle — canonical poke', () => {
  const apexY = 0.01;
  const depth = apexY + MARGIN; // signed + margin, per the documented math
  const body = bodySoup(apexY);
  const r = facePokeCorrection(
    A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2],
    body.verts, body.pseudo, MARGIN,
  );

  it('produces corr != 0 on ALL 3 face verts (a zero here = spec bug, not codegen)', () => {
    for (const d of [r.dA, r.dB, r.dC]) {
      expect(Math.hypot(d[0], d[1], d[2])).toBeGreaterThan(1e-7);
    }
  });

  it('pushes the face OUTWARD — along +y, the side the body vertex pokes to', () => {
    for (const d of [r.dA, r.dB, r.dC]) {
      expect(d[1]).toBeGreaterThan(0);
      expect(d[0]).toBeCloseTo(0, 10);
      expect(d[2]).toBeCloseTo(0, 10);
    }
  });

  it('magnitude matches the documented math: centroid poke → each corner moves exactly depth', () => {
    // α=β=γ=1/3, s=1/3 → k = (α/s)·depth = depth for every corner.
    expect(r.dA[1]).toBeCloseTo(depth, 6);
    expect(r.dB[1]).toBeCloseTo(depth, 6);
    expect(r.dC[1]).toBeCloseTo(depth, 6);
    // Interpolated face point at the contact bary coords moves exactly depth·n:
    // α·dA + β·dB + γ·dC = depth (algebraic identity of the (α/Σα²) weights).
    const lifted = (r.dA[1] + r.dB[1] + r.dC[1]) / 3;
    expect(lifted).toBeCloseTo(depth, 6);
  });

  it('body verts safely behind the face contribute NOTHING (base verts alone → zero)', () => {
    const baseOnly = new Float32Array([5, -0.5, 1, -5, -0.5, 1]);
    const basePseudo = new Float32Array([0, 1, 0, 0, 1, 0]);
    const r2 = facePokeCorrection(
      A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2],
      baseOnly, basePseudo, MARGIN,
    );
    expect(r2.dA).toEqual([0, 0, 0]);
    expect(r2.dB).toEqual([0, 0, 0]);
    expect(r2.dC).toEqual([0, 0, 0]);
  });
});

describe('computeExpectedFacePokeCorrections (probe expected-side) vs direct oracle', () => {
  // Pack the canonical scene exactly as production does: 3 cloth verts, 1 tri.
  const numParticles = 3;
  const clothTris = new Uint32Array([0, 1, 2]);
  const positions = new Float32Array([...A, ...B, ...C]);
  const { offsets, faces } = buildClothVertexFaces(clothTris, numParticles);
  const csr = packFacePokeCsr(offsets, faces, clothTris, numParticles);

  function expectedFor(apexY: number, invMass: Float32Array | null = null) {
    const body = bodySoup(apexY);
    const bodyGeom = packFacePokeBodyGeom(body.verts, body.pseudo, 1);
    return computeExpectedFacePokeCorrections(positions, {
      csr,
      bodyGeom,
      invMass,
      numParticles,
      numClothTriangles: 1,
      numBodyTris: 1,
      margin: MARGIN,
    });
  }

  it('matches the direct oracle on the packed scene (unclamped regime)', () => {
    const apexY = 0.01;
    const { corr, facesWithContact, stats } = expectedFor(apexY);
    expect(facesWithContact).toBe(1);
    expect(stats.movedCount).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(corr[i * 3 + 0]).toBeCloseTo(0, 10);
      expect(corr[i * 3 + 1]).toBeCloseTo(apexY + MARGIN, 6);
      expect(corr[i * 3 + 2]).toBeCloseTo(0, 10);
    }
  });

  it('applies the kernel MAX_PUSH_DIST clamp (0.05) that the raw oracle does not', () => {
    const apexY = 0.06; // depth 0.068 > 0.05 → clamped per particle
    const raw = facePokeCorrection(
      A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2],
      bodySoup(apexY).verts, bodySoup(apexY).pseudo, MARGIN,
    );
    expect(raw.dA[1]).toBeCloseTo(apexY + MARGIN, 6); // oracle: unclamped
    const { corr } = expectedFor(apexY);
    for (let i = 0; i < 3; i++) {
      expect(corr[i * 3 + 1]).toBeCloseTo(0.05, 6); // probe expected: kernel clamp
    }
  });

  it('zeroes pinned particles (invMass=0), mirroring the kernel w>0 gate', () => {
    const { corr } = expectedFor(0.01, new Float32Array([0, 1, 1]));
    expect(corr[0]).toBe(0);
    expect(corr[1]).toBe(0);
    expect(corr[2]).toBe(0);
    expect(corr[4]).toBeCloseTo(0.018, 6); // unpinned verts still move
    expect(corr[7]).toBeCloseTo(0.018, 6);
  });
});

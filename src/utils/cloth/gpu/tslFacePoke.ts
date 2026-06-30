/**
 * TSL Face-Poke — body-vertex-vs-cloth-face collision correction (face-poke v1).
 *
 * Vertex-vs-triangle body collision is structurally blind to a convex body
 * feature poking up *between* the 3 verts of a flat cloth face (all 3 outside
 * the body, yet the face interior is pierced). This pass closes that gap on the
 * GPU tier: dispatched OVER PARTICLES once per frame, each particle gathers its
 * incident cloth faces, queries the existing body BVH for nearby body vertices,
 * and pushes ONLY ITSELF out along the outward cloth-face normal so the face
 * tents over the bump.
 *
 * Two kernels, dispatched in order each frame (BOTH over numParticles):
 *   1. snapshot — copy posBuf → facePokeSnapshotBuf. Runs FIRST so the
 *      correction reads frozen (immutable) corner positions, never the live
 *      posBuf it is writing. THIS IS THE B1 DETERMINISM FIX (a gather over
 *      mutable co-owned face corners would re-open the #921 non-determinism
 *      axis). Mirrors `makeSnapshotPreCollisionFn` (tslSolver.ts).
 *   2. correct — per particle i: accumulate i's barycentric share of the
 *      penetration depth over every poking body vertex into a local `corr`,
 *      clamp |corr| to MAX_PUSH_DIST, add corr to BOTH posBuf and prevPosBuf
 *      (velocity-neutral: pos−prevPos unchanged, so the tent holds without
 *      injecting speed).
 *
 * **CPU↔GPU parity contract.** The per-body-vertex math (sign convention,
 * barycentric projection, `(α/Σα²)·depth·n_outward` distribution, soup
 * multiplicity) MIRRORS `src/utils/cloth/facePokeCorrection.ts` EXACTLY — that
 * committed CPU function is the reference + CI oracle. A body vertex shared by
 * k returned BVH triangles is accumulated k times (soup multiplicity), exactly
 * as the CPU reference loops `bodyVerts.length/3` candidate points. v1 adds NO
 * single-winner reduction / de-dup (the M8 reduction is a deferred refinement
 * applied to BOTH tiers later) — that would diverge from the oracle.
 *
 * The BVH traversal (stackless escape-pointer walk, AABB-overlap descent)
 * mirrors `findBestNode` in tslCollision.ts, but queries with the cloth FACE's
 * AABB (union of its 3 snapshot corners ± band) and runs the port-math for
 * EVERY body triangle whose AABB overlaps (enumerate leaves) instead of
 * tracking a single closest contact.
 *
 * Spec: docs/superpowers/specs/2026-06-30-cloth-face-poke-collision-design.md.
 * GPU-only in v1 (A7 GPU-ahead divergence, like strain-limit / tether).
 *
 * @module tslFacePoke
 */

import {
  Break,
  Fn,
  If,
  Loop,
  compute,
  storage,
  uniform,
  float,
  uint,
  int,
  vec3,
  select,
  instanceIndex,
} from 'three/tsl';
import type { StorageBufferAttribute } from 'three/webgpu';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';

// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

/**
 * Maximum total face-poke push per particle per frame (meters). Mirrors
 * `MAX_PUSH_DIST` in tslCollision.ts — prevents a degenerate accumulation from
 * launching a particle (NaN cascade guard). CPU `facePokeCorrection` does not
 * clamp; this is a GPU-tier safety bound applied to the accumulated total.
 */
const MAX_PUSH_DIST = 0.05;

/**
 * Build the snapshot kernel: copy posBuf → facePokeSnapshotBuf over
 * numParticles. Dispatch this BEFORE the correction kernel each frame so the
 * correction reads frozen corner positions (the B1 determinism fix).
 *
 * @param posBuf - shared vec3 position storage node (from the solver)
 * @param snapshotSBA - facePokeSnapshotSBA (vec3, numParticles)
 * @param numParticles - dispatch count
 */
export function makeFacePokeSnapshotNode(
  posBuf: TslNode,
  snapshotSBA: StorageBufferAttribute,
  numParticles: number,
): ComputeNode {
  const snapBuf = storage(snapshotSBA, 'vec3', numParticles);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (Fn as any)(() => {
    snapBuf.element(instanceIndex).assign(posBuf.element(instanceIndex));
  })();
  return compute(fn, numParticles, [64]);
}

export interface FacePokeCorrectParams {
  /** Shared vec3 position storage node (written: posBuf += corr). */
  posBuf: TslNode;
  /** Shared vec3 previous-position node (written: prevPosBuf += corr, velocity-neutral). */
  prevPosBuf: TslNode;
  /** Shared float inverse-mass node (0 = pinned → skipped). */
  invMassBuf: TslNode;
  /** facePokeSnapshotSBA (vec3, numParticles) — the immutable read source for face corners. */
  snapshotSBA: StorageBufferAttribute;
  /** incidentFaceOffsetsSBA (uint, numParticles+1) — CSR row pointers. */
  incidentOffsetsSBA: StorageBufferAttribute;
  /** incidentFaceListSBA (uint, numClothTriangles*3) — CSR column data (triangle indices). */
  incidentListSBA: StorageBufferAttribute;
  /** triangleIdsSBA (uint, numClothTriangles*3) — cloth topology (vertex ids per triangle). */
  triIdsSBA: StorageBufferAttribute;
  /** BVH nodes (float, numBvhNodes*8). */
  bvhNodesSBA: StorageBufferAttribute;
  /** BVH escape pointers (uint, numBvhNodes). */
  bvhSkipSBA: StorageBufferAttribute;
  /** Body triangle verts (float, numBodyTris*9), BVH-leaf order. */
  triVertsSBA: StorageBufferAttribute;
  /** Body vertex pseudonormals (float, numBodyTris*9 — A,B,C × xyz), BVH-leaf order. */
  vertexPseudoSBA: StorageBufferAttribute;
  numParticles: number;
  /** Number of CLOTH triangles (sizes triIds + incident-face CSR). */
  numClothTriangles: number;
  /** Number of BVH nodes. */
  numBvhNodes: number;
  /** Number of BODY triangles. */
  numBodyTris: number;
  /** Body collision margin (meters) — same value as the body's collision margin. */
  margin: number;
}

/**
 * Build the correction kernel. Per particle i: gather incident cloth faces,
 * traverse the body BVH per face, accumulate i's own barycentric share of every
 * poking body vertex into `corr`, clamp, and apply to pos + prevPos.
 *
 * The math mirrors `facePokeCorrection.ts` line-by-line (see the parity
 * contract in the module header).
 */
export function makeFacePokeCorrectNode(p: FacePokeCorrectParams): ComputeNode {
  const {
    posBuf,
    prevPosBuf,
    invMassBuf,
    numParticles,
    numClothTriangles,
    numBvhNodes,
    numBodyTris,
    margin,
  } = p;

  // ─── Wrap SBAs as TSL storage nodes ──────────────────────────────────────
  // facePokeSnapshotSBA is also wrapped (write side) inside the snapshot
  // kernel; both wraps reference the same GPU buffer (snapshot writes → correct
  // reads), exactly like triangleIdsSBA is wrapped by both normals + wind.
  const snapBuf = storage(p.snapshotSBA, 'vec3', numParticles);
  const incidentOffsetsBuf = storage(p.incidentOffsetsSBA, 'uint', numParticles + 1);
  const incidentListBuf = storage(p.incidentListSBA, 'uint', numClothTriangles * 3);
  const triIdsBuf = storage(p.triIdsSBA, 'uint', numClothTriangles * 3);
  const bvhBuf = storage(p.bvhNodesSBA, 'float', numBvhNodes * 8);
  const skipBuf = storage(p.bvhSkipSBA, 'uint', numBvhNodes);
  const triVertBuf = storage(p.triVertsSBA, 'float', numBodyTris * 9);
  const vertexPseudoBuf = storage(p.vertexPseudoSBA, 'float', numBodyTris * 9);

  const uMargin = uniform(margin);
  // BVH AABB query band — same calibration as tslCollision.ts findBest
  // (max(margin, 0.03)). band ≥ margin guarantees every body vertex within
  // `margin` of the face plane lands inside a leaf AABB the query reaches.
  const uBand = uniform(Math.max(margin, 0.03));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fn = (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      // i's accumulated correction (i's own barycentric share, summed over every
      // poking body vertex of every incident face). Atomic-free: per-particle
      // self-write + immutable snapshot read (design §A1).
      const corr = vec3(0, 0, 0).toVar('fpCorr');

      // ── Incident-face loop (CSR; mirrors the self-collision adjacency loop:
      //    start = offsets[i], count = offsets[i+1] − start, index start+k) ──
      const fStart = incidentOffsetsBuf.element(uint(i));
      const fEnd = incidentOffsetsBuf.element(uint(i).add(uint(1)));
      const fCount = fEnd.sub(fStart);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Loop({ start: uint(0), end: fCount, type: 'uint', condition: '<' }, ({ i: fk }: { i: any }) => {
        const t = incidentListBuf.element(fStart.add(fk)); // cloth triangle index
        const triBase = t.mul(uint(3));
        const id0 = triIdsBuf.element(triBase).toVar('fpId0');
        const id1 = triIdsBuf.element(triBase.add(uint(1))).toVar('fpId1');
        const id2 = triIdsBuf.element(triBase.add(uint(2))).toVar('fpId2');

        // Face corners A,B,C from the SNAPSHOT (NOT live posBuf) — B1 fix.
        const A = snapBuf.element(id0);
        const B = snapBuf.element(id1);
        const C = snapBuf.element(id2);
        const ax = A.x.toVar('fpAx'); const ay = A.y.toVar('fpAy'); const az = A.z.toVar('fpAz');
        const bx = B.x.toVar('fpBx'); const by = B.y.toVar('fpBy'); const bz = B.z.toVar('fpBz');
        const cx = C.x.toVar('fpCx'); const cy = C.y.toVar('fpCy'); const cz = C.z.toVar('fpCz');

        // e1 = B−A, e2 = C−A (mirror facePokeCorrection.ts).
        const e1x = bx.sub(ax).toVar('fpE1x'); const e1y = by.sub(ay).toVar('fpE1y'); const e1z = bz.sub(az).toVar('fpE1z');
        const e2x = cx.sub(ax).toVar('fpE2x'); const e2y = cy.sub(ay).toVar('fpE2y'); const e2z = cz.sub(az).toVar('fpE2z');

        // Barycentric precompute (cached edge dot products).
        const d00 = e1x.mul(e1x).add(e1y.mul(e1y)).add(e1z.mul(e1z)).toVar('fpD00');
        const d01 = e1x.mul(e2x).add(e1y.mul(e2y)).add(e1z.mul(e2z)).toVar('fpD01');
        const d11 = e2x.mul(e2x).add(e2y.mul(e2y)).add(e2z.mul(e2z)).toVar('fpD11');
        const denom = d00.mul(d11).sub(d01.mul(d01)).toVar('fpDenom');

        // CPU: `if (denom === 0) return`. Guard with the house degeneracy
        // epsilon (1e-12, same as findBest); a degenerate cloth triangle is
        // skipped on both tiers. Face normal + AABB + traversal live inside so
        // the normalize divide never sees a zero length.
        If(denom.abs().greaterThan(float(1e-12)), () => {
          // Face plane normal n = normalize((B−A) × (C−A)).
          const rnx = e1y.mul(e2z).sub(e1z.mul(e2y));
          const rny = e1z.mul(e2x).sub(e1x.mul(e2z));
          const rnz = e1x.mul(e2y).sub(e1y.mul(e2x));
          const invNl = float(1.0).div(rnx.mul(rnx).add(rny.mul(rny)).add(rnz.mul(rnz)).sqrt().max(float(1e-20)));
          const nx = rnx.mul(invNl).toVar('fpNx');
          const ny = rny.mul(invNl).toVar('fpNy');
          const nz = rnz.mul(invNl).toVar('fpNz');

          // Face AABB (union of the 3 corners), expanded by uBand in the
          // overlap test against each node AABB.
          const fminx = ax.min(bx).min(cx).toVar('fpMinX');
          const fmaxx = ax.max(bx).max(cx).toVar('fpMaxX');
          const fminy = ay.min(by).min(cy).toVar('fpMinY');
          const fmaxy = ay.max(by).max(cy).toVar('fpMaxY');
          const fminz = az.min(bz).min(cz).toVar('fpMinZ');
          const fmaxz = az.max(bz).max(cz).toVar('fpMaxZ');

          // ── Stackless BVH traversal (escape pointers), mirror of findBestNode.
          //    AABB hit on internal → descend left (slot 6); miss or processed
          //    leaf → jump to skip[node]. Loop(numNodes) is the hard bound; the
          //    cursor strictly increases so each node is visited at most once. ──
          const nodeIdx = uint(0).toVar('fpNode');
          Loop(numBvhNodes, () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            If((nodeIdx as any).greaterThanEqual(uint(numBvhNodes)), () => { Break(); });

            const nodeBase = nodeIdx.mul(uint(8)).toVar('fpNB');
            const nMinX = bvhBuf.element(nodeBase);
            const nMinY = bvhBuf.element(nodeBase.add(uint(1)));
            const nMinZ = bvhBuf.element(nodeBase.add(uint(2)));
            const nMaxX = bvhBuf.element(nodeBase.add(uint(3)));
            const nMaxY = bvhBuf.element(nodeBase.add(uint(4)));
            const nMaxZ = bvhBuf.element(nodeBase.add(uint(5)));
            const triCnt = bvhBuf.element(nodeBase.add(uint(7)));

            // AABB overlap: face box (± uBand) vs node box.
            If(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (fminx.sub(uBand) as any).lessThanEqual(nMaxX)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fmaxx.add(uBand) as any).greaterThanEqual(nMinX))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fminy.sub(uBand) as any).lessThanEqual(nMaxY))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fmaxy.add(uBand) as any).greaterThanEqual(nMinY))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fminz.sub(uBand) as any).lessThanEqual(nMaxZ))
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .and((fmaxz.add(uBand) as any).greaterThanEqual(nMinZ)),
              () => {
                If(triCnt.greaterThan(float(0)), () => {
                  // Leaf — enumerate its triangles, run the port-math for each
                  // (no single-winner reduction; soup multiplicity preserved).
                  const triStart = bvhBuf.element(nodeBase.add(uint(6)));
                  const cnt = int(triCnt);

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  Loop({ start: int(0), end: cnt, type: 'int', condition: '<' }, ({ i: ti }: { i: any }) => {
                    const bt = uint(int(triStart).add(ti)); // body triangle index

                    // Each of the body triangle's 3 verts is a candidate body
                    // point (mirror: CPU loops bodyVerts.length/3 = triCount*3).
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    Loop({ start: uint(0), end: uint(3), type: 'uint', condition: '<' }, ({ i: lv }: { i: any }) => {
                      const vBase = bt.mul(uint(9)).add(lv.mul(uint(3)));
                      const px = triVertBuf.element(vBase);
                      const py = triVertBuf.element(vBase.add(uint(1)));
                      const pz = triVertBuf.element(vBase.add(uint(2)));
                      const pnx = vertexPseudoBuf.element(vBase);
                      const pny = vertexPseudoBuf.element(vBase.add(uint(1)));
                      const pnz = vertexPseudoBuf.element(vBase.add(uint(2)));

                      // Outward orientation: flip n if n·pseudonormal < 0 so it
                      // points away from the body (M11 sign fix).
                      const dotPn = nx.mul(pnx).add(ny.mul(pny)).add(nz.mul(pnz));
                      const flip = dotPn.lessThan(float(0.0));
                      const ox = select(flip, nx.negate(), nx);
                      const oy = select(flip, ny.negate(), ny);
                      const oz = select(flip, nz.negate(), nz);

                      // signed = (P−A)·n_outward; w = P−A reused for barycentric.
                      const wpx = px.sub(ax); const wpy = py.sub(ay); const wpz = pz.sub(az);
                      const signed = wpx.mul(ox).add(wpy.mul(oy)).add(wpz.mul(oz));

                      // CPU: `if (signed <= -margin) continue` → process when
                      // signed > -margin (body vert within margin of, or past,
                      // the face on the outward side).
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      If(signed.greaterThan((uMargin as any).negate()), () => {
                        const d20 = wpx.mul(e1x).add(wpy.mul(e1y)).add(wpz.mul(e1z));
                        const d21 = wpx.mul(e2x).add(wpy.mul(e2y)).add(wpz.mul(e2z));
                        const beta = d11.mul(d20).sub(d01.mul(d21)).div(denom);
                        const gamma = d00.mul(d21).sub(d01.mul(d20)).div(denom);
                        const alpha = float(1.0).sub(beta).sub(gamma);

                        // Projects inside the triangle (all barycentrics ≥ 0).
                        If(
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (alpha as any).greaterThanEqual(float(0.0))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .and((beta as any).greaterThanEqual(float(0.0)))
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            .and((gamma as any).greaterThanEqual(float(0.0))),
                          () => {
                            const depth = signed.add(uMargin); // > 0
                            const s = alpha.mul(alpha).add(beta.mul(beta)).add(gamma.mul(gamma));
                            If(s.greaterThan(float(0.0)), () => {
                              // i's own barycentric weight: whichever corner is i.
                              const alphaSelf = select(
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                (uint(i) as any).equal(id0),
                                alpha,
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                select((uint(i) as any).equal(id1), beta, gamma),
                              );
                              const k = alphaSelf.div(s).mul(depth);
                              // corr += (α_self / Σα²)·depth·n_outward.
                              corr.addAssign(vec3(ox, oy, oz).mul(k));
                            });
                          },
                        );
                      });
                    });
                  });

                  // Leaf processed → escape past this subtree.
                  nodeIdx.assign(skipBuf.element(nodeIdx));
                }).Else(() => {
                  // Internal hit → descend into the left child (slot 6 == nodeIdx+1).
                  nodeIdx.assign(uint(bvhBuf.element(nodeBase.add(uint(6)))));
                });
              },
            ).Else(() => {
              // Miss → skip the whole subtree.
              nodeIdx.assign(skipBuf.element(nodeIdx));
            });
          });
        });
      });

      // Clamp |corr| to MAX_PUSH_DIST, then apply velocity-neutral (pos AND
      // prevPos move by the same corr → pos−prevPos unchanged). The `> 0` gate
      // skips the no-op common case AND NaN (NaN > 0 is false), so a degenerate
      // accumulation never corrupts pos/prevPos.
      const corrLen = corr.length().toVar('fpLen');
      If(corrLen.greaterThan(float(0.0)), () => {
        If(corrLen.greaterThan(float(MAX_PUSH_DIST)), () => {
          corr.assign(corr.mul(float(MAX_PUSH_DIST).div(corrLen)));
        });
        posBuf.element(i).addAssign(corr);
        prevPosBuf.element(i).addAssign(corr);
      });
    });
  })();

  return compute(fn, numParticles, [64]);
}

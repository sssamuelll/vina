/**
 * TSL Collision Kernel -- BVH-accelerated body collision for the TSL compute solver.
 *
 * Per particle, iterates all linearized BVH nodes; for each leaf whose AABB
 * overlaps the particle ± margin, computes point-to-triangle distance for
 * every triangle in the leaf, tracks the closest (regardless of margin), and
 * pushes the particle out if it is **penetrating** (`bestSide < 0`) or
 * **within margin** (`bestDist < margin`). Applies position-based friction.
 *
 * Detection semantics match `triangleCollision.ts:solveTriangleCollision`
 * (CPU+WASM reference, A4 § 2.4): the loop tracks the closest triangle
 * regardless of plane distance, then the push branch fires on either
 * penetration or proximity. This is the #733 fix — the prior version
 * margin-gated triangle iteration and missed deep penetrations entirely
 * (cloth fell through avatar to floor).
 *
 * Point-to-triangle distance includes the **3-edge fallback** for cases
 * where the particle's plane projection lies outside the triangle's
 * barycentric region: closest point on each of edges AB, AC, BC with
 * parameter clamp [0,1]; minimum-distance edge wins. Mirrors CPU
 * `pointToTriangleDist` (lines 58–92 of triangleCollision.ts).
 *
 * Per-tier acceleration structure divergence is intentional: CPU+WASM share
 * `TriangleSpatialHash` (rebuilt per body, JS-side); GPU TSL uses a
 * BVH (built via `three-mesh-bvh` once per body, uploaded to GPU as a
 * flat StorageBufferAttribute). A4 § 2.4 ratifies the CPU+WASM convention;
 * #733 ratifies the GPU divergence as canonical for this tier.
 *
 * BVH node format (8 floats per node, stored in a flat StorageBufferAttribute):
 *   [minX, minY, minZ, maxX, maxY, maxZ, child/triStart, triCount]
 *   Internal node: triCount=0, child=leftChildIndex (right=left+1)
 *   Leaf node: triCount>0, child=triStart (index into triVerts)
 *
 * Triangle format (9 floats per triangle): [v0x,v0y,v0z, v1x,v1y,v1z, v2x,v2y,v2z]
 * Normal format (3 floats per triangle): [nx,ny,nz]
 *
 * @module tslCollision
 */

import {
  Fn,
  If,
  Loop,
  compute,
  storage,
  uniform,
  float,
  uint,
  int,
  instanceIndex,
} from 'three/tsl';
import type { StorageBufferAttribute } from 'three/webgpu';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TslCollisionBody {
  id: string;
  collisionNode: ComputeNode;
  margin: number;
  friction: number;
  nodeCount: number;
  triCount: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum push distance per collision (meters). Prevents NaN cascade. Matches CPU solver. */
const MAX_PUSH_DIST = 0.05;

// ─── Kernel factory ─────────────────────────────────────────────────────────

/**
 * Create a TSL collision compute kernel for one collision body.
 *
 * @param posBuf - Cloth particle positions (read-write, shared with solver)
 * @param prevPosBuf - Previous positions (read-only, for friction computation)
 * @param invMassBuf - Inverse mass per particle (read-only, 0 = pinned)
 * @param bvhNodesSBA - Linearized BVH nodes (8 floats per node)
 * @param triVertsSBA - Expanded triangle vertices (9 floats per tri)
 * @param triNormalsSBA - Face normals (3 floats per tri)
 * @param numParticles - Number of cloth particles (dispatch count)
 * @param numNodes - Number of BVH nodes
 * @param numTris - Number of collision triangles
 * @param id - Collision body identifier
 * @param margin - Collision margin (meters)
 * @param friction - Friction coefficient (0-1)
 */
export function createTslCollisionBody(
  posBuf: TslNode,
  prevPosBuf: TslNode,
  invMassBuf: TslNode,
  bvhNodesSBA: StorageBufferAttribute,
  triVertsSBA: StorageBufferAttribute,
  triNormalsSBA: StorageBufferAttribute,
  numParticles: number,
  numNodes: number,
  numTris: number,
  id: string,
  margin: number = 0.005,
  friction: number = 0.3,
): TslCollisionBody {
  // Wrap SBAs as storage nodes (flat float access — itemSize=1, no vec4 padding)
  const bvhBuf = storage(bvhNodesSBA, 'float', numNodes * 8);
  const triVertBuf = storage(triVertsSBA, 'float', numTris * 9);
  const triNormBuf = storage(triNormalsSBA, 'float', numTris * 3);

  const uMargin = uniform(margin);
  const uFriction = uniform(friction);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const collisionFn = (Fn as any)(() => {
    const i = instanceIndex;

    // Skip pinned particles (invMass == 0)
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      const px = posBuf.element(i).x.toVar('px');
      const py = posBuf.element(i).y.toVar('py');
      const pz = posBuf.element(i).z.toVar('pz');

      // NaN guard: NaN != NaN
      If(px.equal(px), () => {
        // Track closest collision across ALL leaves (regardless of margin).
        // CPU semantics: push if `bestSide < 0` (penetrating) OR
        // `bestDist < margin` (close). See triangleCollision.ts:298.
        const bestDist = float(1e10).toVar('bestDist');
        const bestNx = float(0).toVar('bestNx');
        const bestNy = float(0).toVar('bestNy');
        const bestNz = float(0).toVar('bestNz');
        const bestSide = float(1).toVar('bestSide');
        const found = int(0).toVar('found');

        // Iterate all BVH nodes, test only leaves whose AABB overlaps particle
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Loop(numNodes, ({ i: nodeIdx }: { i: any }) => {
          const nodeBase = uint(nodeIdx).mul(uint(8));

          // Read AABB bounds
          const nMinX = bvhBuf.element(nodeBase);
          const nMinY = bvhBuf.element(nodeBase.add(uint(1)));
          const nMinZ = bvhBuf.element(nodeBase.add(uint(2)));
          const nMaxX = bvhBuf.element(nodeBase.add(uint(3)));
          const nMaxY = bvhBuf.element(nodeBase.add(uint(4)));
          const nMaxZ = bvhBuf.element(nodeBase.add(uint(5)));
          const triCount = bvhBuf.element(nodeBase.add(uint(7)));

          // Only process leaf nodes (triCount > 0)
          If(triCount.greaterThan(float(0)), () => {
            // AABB overlap test (point +/- margin vs node AABB).
            // This is intentionally conservative: a particle inside the AABB
            // always passes (margin extends both ways), and a particle close
            // to the AABB along any axis also passes. The tightness of the
            // per-triangle test below determines correctness.
            If(
              px.add(uMargin).greaterThanEqual(nMinX)
                .and(px.sub(uMargin).lessThanEqual(nMaxX))
                .and(py.add(uMargin).greaterThanEqual(nMinY))
                .and(py.sub(uMargin).lessThanEqual(nMaxY))
                .and(pz.add(uMargin).greaterThanEqual(nMinZ))
                .and(pz.sub(uMargin).lessThanEqual(nMaxZ)),
              () => {
                // Test each triangle in this leaf
                const triStart = bvhBuf.element(nodeBase.add(uint(6)));
                const count = int(triCount);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Loop({ start: int(0), end: count, type: 'int', condition: '<' }, ({ i: ti }: { i: any }) => {
                  const triIdx = uint(int(triStart).add(ti));

                  // Read triangle vertices (9 floats per tri)
                  const tvBase = triIdx.mul(uint(9));
                  const ax = triVertBuf.element(tvBase);
                  const ay = triVertBuf.element(tvBase.add(uint(1)));
                  const az = triVertBuf.element(tvBase.add(uint(2)));
                  const bx = triVertBuf.element(tvBase.add(uint(3)));
                  const by = triVertBuf.element(tvBase.add(uint(4)));
                  const bz = triVertBuf.element(tvBase.add(uint(5)));
                  const cx = triVertBuf.element(tvBase.add(uint(6)));
                  const cy = triVertBuf.element(tvBase.add(uint(7)));
                  const cz = triVertBuf.element(tvBase.add(uint(8)));

                  // Read face normal (3 floats per tri)
                  const tnBase = triIdx.mul(uint(3));
                  const nnx = triNormBuf.element(tnBase);
                  const nny = triNormBuf.element(tnBase.add(uint(1)));
                  const nnz = triNormBuf.element(tnBase.add(uint(2)));

                  // ─── Per-triangle distance + side computation ────────────
                  // Mirrors CPU `pointToTriangleDist` semantically:
                  //   1. Compute signed plane distance `dot`.
                  //   2. Project point onto plane.
                  //   3. Barycentric u, v.
                  //   4. If projection inside triangle → use plane distance.
                  //   5. Else → 3-edge fallback (clamped t projection on each
                  //      edge; minimum-distance edge wins; side from `(p-cp)·n`).
                  //   6. If degenerate triangle (denom ≈ 0) → distance to vertex A.
                  //
                  // Per-triangle output state:
                  const triDist = float(1e10).toVar('triDist');
                  const triSide = float(1).toVar('triSide');
                  const triValid = int(0).toVar('triValid');

                  const apx = px.sub(ax);
                  const apy = py.sub(ay);
                  const apz = pz.sub(az);

                  // Signed plane distance
                  const dot = apx.mul(nnx).add(apy.mul(nny)).add(apz.mul(nnz));

                  // Project onto triangle plane
                  const projx = px.sub(dot.mul(nnx));
                  const projy = py.sub(dot.mul(nny));
                  const projz = pz.sub(dot.mul(nnz));

                  const v0x = projx.sub(ax);
                  const v0y = projy.sub(ay);
                  const v0z = projz.sub(az);

                  const abx = bx.sub(ax); const aby = by.sub(ay); const abz = bz.sub(az);
                  const acx = cx.sub(ax); const acy = cy.sub(ay); const acz = cz.sub(az);

                  const d00 = abx.mul(abx).add(aby.mul(aby)).add(abz.mul(abz));
                  const d01 = abx.mul(acx).add(aby.mul(acy)).add(abz.mul(acz));
                  const d02 = abx.mul(v0x).add(aby.mul(v0y)).add(abz.mul(v0z));
                  const d11 = acx.mul(acx).add(acy.mul(acy)).add(acz.mul(acz));
                  const d12 = acx.mul(v0x).add(acy.mul(v0y)).add(acz.mul(v0z));

                  const denom = d00.mul(d11).sub(d01.mul(d01));

                  If(denom.abs().greaterThan(float(1e-12)), () => {
                    const invD = float(1).div(denom);
                    const u = d11.mul(d02).sub(d01.mul(d12)).mul(invD);
                    const v = d00.mul(d12).sub(d01.mul(d02)).mul(invD);

                    If(
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (u as any).greaterThanEqual(float(0))
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .and((v as any).greaterThanEqual(float(0)))
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .and((u.add(v) as any).lessThanEqual(float(1))),
                      () => {
                        // Inside triangle: plane distance is meaningful
                        triDist.assign(dot.abs());
                        triSide.assign(dot);
                        triValid.assign(int(1));
                      },
                    ).Else(() => {
                      // Outside triangle: 3-edge fallback (mirrors
                      // pointToTriangleDist:58–92).
                      const minDsq = float(1e10).toVar('minDsq');
                      const cpx = ax.toVar('cpx');
                      const cpy = ay.toVar('cpy');
                      const cpz = az.toVar('cpz');

                      // Edge AB
                      If(d00.greaterThan(float(1e-12)), () => {
                        const tABraw = apx.mul(abx).add(apy.mul(aby)).add(apz.mul(abz)).div(d00);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const tAB = (tABraw as any).max(float(0)).min(float(1));
                        const ex = ax.add(tAB.mul(abx));
                        const ey = ay.add(tAB.mul(aby));
                        const ez = az.add(tAB.mul(abz));
                        const dx = px.sub(ex);
                        const dy = py.sub(ey);
                        const dz = pz.sub(ez);
                        const dsq = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
                        If(dsq.lessThan(minDsq), () => {
                          minDsq.assign(dsq);
                          cpx.assign(ex);
                          cpy.assign(ey);
                          cpz.assign(ez);
                        });
                      });

                      // Edge AC
                      If(d11.greaterThan(float(1e-12)), () => {
                        const tACraw = apx.mul(acx).add(apy.mul(acy)).add(apz.mul(acz)).div(d11);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const tAC = (tACraw as any).max(float(0)).min(float(1));
                        const ex = ax.add(tAC.mul(acx));
                        const ey = ay.add(tAC.mul(acy));
                        const ez = az.add(tAC.mul(acz));
                        const dx = px.sub(ex);
                        const dy = py.sub(ey);
                        const dz = pz.sub(ez);
                        const dsq = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
                        If(dsq.lessThan(minDsq), () => {
                          minDsq.assign(dsq);
                          cpx.assign(ex);
                          cpy.assign(ey);
                          cpz.assign(ez);
                        });
                      });

                      // Edge BC
                      const bcx = cx.sub(bx);
                      const bcy = cy.sub(by);
                      const bcz = cz.sub(bz);
                      const bcLenSq = bcx.mul(bcx).add(bcy.mul(bcy)).add(bcz.mul(bcz));
                      If(bcLenSq.greaterThan(float(1e-12)), () => {
                        const bpx = px.sub(bx);
                        const bpy = py.sub(by);
                        const bpz = pz.sub(bz);
                        const tBCraw = bpx.mul(bcx).add(bpy.mul(bcy)).add(bpz.mul(bcz)).div(bcLenSq);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const tBC = (tBCraw as any).max(float(0)).min(float(1));
                        const ex = bx.add(tBC.mul(bcx));
                        const ey = by.add(tBC.mul(bcy));
                        const ez = bz.add(tBC.mul(bcz));
                        const dx = px.sub(ex);
                        const dy = py.sub(ey);
                        const dz = pz.sub(ez);
                        const dsq = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));
                        If(dsq.lessThan(minDsq), () => {
                          minDsq.assign(dsq);
                          cpx.assign(ex);
                          cpy.assign(ey);
                          cpz.assign(ez);
                        });
                      });

                      // edgeSide = (p - cp)·n — sign tells us which side of
                      // the plane the closest edge point is on (matches CPU).
                      const edgeSide = px.sub(cpx).mul(nnx)
                        .add(py.sub(cpy).mul(nny))
                        .add(pz.sub(cpz).mul(nnz));
                      triDist.assign(minDsq.sqrt());
                      triSide.assign(edgeSide);
                      triValid.assign(int(1));
                    });
                  }).Else(() => {
                    // Degenerate triangle (zero area): fall back to vertex A.
                    // CPU does the same (triangleCollision.ts:46–48).
                    const dvx = px.sub(ax);
                    const dvy = py.sub(ay);
                    const dvz = pz.sub(az);
                    triDist.assign(dvx.mul(dvx).add(dvy.mul(dvy)).add(dvz.mul(dvz)).sqrt());
                    triSide.assign(float(1));
                    triValid.assign(int(1));
                  });

                  // Update best across all triangles
                  If(triValid.equal(int(1)).and(triDist.lessThan(bestDist)), () => {
                    bestDist.assign(triDist);
                    bestSide.assign(triSide);
                    bestNx.assign(nnx);
                    bestNy.assign(nny);
                    bestNz.assign(nnz);
                    found.assign(int(1));
                  });
                });
              },
            );
          });
        });

        // ─── Apply collision response ───────────────────────────────
        // CPU semantics (triangleCollision.ts:299): push if `bestSide < 0`
        // (particle is behind the closest triangle, i.e. penetrating) OR
        // `bestDist < margin` (particle is close to the surface).
        If(
          found.equal(int(1)).and(
            bestSide.lessThan(float(0)).or(bestDist.lessThan(uMargin)),
          ),
          () => {
            // pushDist = bestSide < 0 ? margin + bestDist : margin - bestDist
            //   Penetrating: push out by depth + margin.
            //   Close: push to margin distance.
            const pushDist = float(0).toVar('pushDist');
            If(bestSide.lessThan(float(0)), () => {
              pushDist.assign(uMargin.add(bestDist));
            }).Else(() => {
              pushDist.assign(uMargin.sub(bestDist));
            });
            // Clamp to MAX_PUSH_DIST to prevent NaN cascade on extreme
            // penetrations (matches CPU triangleCollision.ts:305).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            pushDist.assign((pushDist as any).min(float(MAX_PUSH_DIST)));

            If(pushDist.greaterThan(float(0)), () => {
              // Push particle out along normal
              posBuf.element(i).x.addAssign(bestNx.mul(pushDist));
              posBuf.element(i).y.addAssign(bestNy.mul(pushDist));
              posBuf.element(i).z.addAssign(bestNz.mul(pushDist));

              // Position-based friction (matches CPU
              // triangleCollision.ts:312–322)
              If(uFriction.greaterThan(float(0)), () => {
                // Displacement since substep start (post-push)
                const dx = posBuf.element(i).x.sub(prevPosBuf.element(i).x);
                const dy = posBuf.element(i).y.sub(prevPosBuf.element(i).y);
                const dz = posBuf.element(i).z.sub(prevPosBuf.element(i).z);

                // Normal component of displacement
                const vn = dx.mul(bestNx).add(dy.mul(bestNy)).add(dz.mul(bestNz));

                // Tangential component
                const tx = dx.sub(vn.mul(bestNx));
                const ty = dy.sub(vn.mul(bestNy));
                const tz = dz.sub(vn.mul(bestNz));

                // Reduce tangential displacement by friction
                posBuf.element(i).x.subAssign(uFriction.mul(tx));
                posBuf.element(i).y.subAssign(uFriction.mul(ty));
                posBuf.element(i).z.subAssign(uFriction.mul(tz));
              });
            });
          },
        );
      });
    });
  })();

  const collisionNode = compute(collisionFn, numParticles, [64]);

  return {
    id,
    collisionNode,
    margin,
    friction,
    nodeCount: numNodes,
    triCount: numTris,
  };
}

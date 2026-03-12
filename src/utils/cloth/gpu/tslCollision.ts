/**
 * TSL Collision Kernel -- BVH-accelerated body collision for the TSL compute solver.
 *
 * Per particle, iterates all linearized BVH nodes to find the closest penetrating
 * collision triangle. Pushes the particle out along the face normal and
 * applies position-based friction.
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
import type StorageBufferNode from 'three/src/nodes/accessors/StorageBufferNode.js';

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
  posBuf: StorageBufferNode<'vec3'>,
  prevPosBuf: StorageBufferNode<'vec3'>,
  invMassBuf: StorageBufferNode<'float'>,
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

  const collisionFn = Fn(() => {
    const i = instanceIndex;

    // Skip pinned particles (invMass == 0)
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      const px = posBuf.element(i).x.toVar('px');
      const py = posBuf.element(i).y.toVar('py');
      const pz = posBuf.element(i).z.toVar('pz');

      // NaN guard: NaN != NaN
      If(px.equal(px), () => {
        // Track closest collision — mutable variables for shader
        const bestDist = float(1e10).toVar('bestDist');
        const bestNx = float(0).toVar('bestNx');
        const bestNy = float(0).toVar('bestNy');
        const bestNz = float(0).toVar('bestNz');
        const bestSide = float(1).toVar('bestSide');
        const collided = int(0).toVar('collided');

        // Iterate all BVH nodes, test only leaves whose AABB overlaps particle
        Loop(numNodes, ({ i: nodeIdx }) => {
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
            // AABB overlap test (point +/- margin vs node AABB)
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

                Loop({ start: int(0), end: count, type: 'int', condition: '<' }, ({ i: ti }) => {
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

                  // ─── Point-to-triangle signed distance ─────────────────
                  const apx = px.sub(ax);
                  const apy = py.sub(ay);
                  const apz = pz.sub(az);

                  // Signed distance from point to triangle plane
                  const dot = apx.mul(nnx).add(apy.mul(nny)).add(apz.mul(nnz));
                  const absDot = dot.abs();

                  // Early out: too far from plane
                  If(absDot.lessThan(uMargin), () => {
                    // Project point onto triangle plane
                    const projx = px.sub(dot.mul(nnx));
                    const projy = py.sub(dot.mul(nny));
                    const projz = pz.sub(dot.mul(nnz));

                    // Barycentric coordinates via Cramer's rule
                    const abx = bx.sub(ax); const aby = by.sub(ay); const abz = bz.sub(az);
                    const acx = cx.sub(ax); const acy = cy.sub(ay); const acz = cz.sub(az);
                    const v0x = projx.sub(ax); const v0y = projy.sub(ay); const v0z = projz.sub(az);

                    const d00 = abx.mul(abx).add(aby.mul(aby)).add(abz.mul(abz));
                    const d01 = abx.mul(acx).add(aby.mul(acy)).add(abz.mul(acz));
                    const d02 = abx.mul(v0x).add(aby.mul(v0y)).add(abz.mul(v0z));
                    const d11 = acx.mul(acx).add(acy.mul(acy)).add(acz.mul(acz));
                    const d12 = acx.mul(v0x).add(acy.mul(v0y)).add(acz.mul(v0z));

                    const denom = d00.mul(d11).sub(d01.mul(d01));

                    If(denom.abs().greaterThan(float(1e-10)), () => {
                      const invD = float(1).div(denom);
                      const u = d11.mul(d02).sub(d01.mul(d12)).mul(invD);
                      const v = d00.mul(d12).sub(d01.mul(d02)).mul(invD);

                      // Inside triangle?
                      If(
                        u.greaterThanEqual(float(0))
                          .and(v.greaterThanEqual(float(0)))
                          .and(u.add(v).lessThanEqual(float(1))),
                        () => {
                          // Track closest collision
                          If(absDot.lessThan(bestDist), () => {
                            bestDist.assign(absDot);
                            bestNx.assign(nnx);
                            bestNy.assign(nny);
                            bestNz.assign(nnz);
                            bestSide.assign(dot);
                            collided.assign(int(1));
                          });
                        },
                      );
                    });
                  });
                });
              },
            );
          });
        });

        // ─── Apply collision response ───────────────────────────────
        If(collided.equal(int(1)), () => {
          // Push particle to margin distance from surface along normal.
          // pushDist = margin - signedDistance
          //   Front side (dot > 0, within margin): margin - dot > 0 (small push)
          //   Back side (dot < 0, penetrating): margin - dot > margin (larger push)
          const pushDist = uMargin.sub(bestSide).min(float(MAX_PUSH_DIST)).toVar('pushDist');

          If(pushDist.greaterThan(float(0)), () => {
            // Push particle out along normal
            posBuf.element(i).x.addAssign(bestNx.mul(pushDist));
            posBuf.element(i).y.addAssign(bestNy.mul(pushDist));
            posBuf.element(i).z.addAssign(bestNz.mul(pushDist));

            // Position-based friction
            If(uFriction.greaterThan(float(0)), () => {
              // Displacement since substep start
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
        });
      });
    });
  })();

  const collisionNode = compute(collisionFn, numParticles);

  return {
    id,
    collisionNode,
    margin,
    friction,
    nodeCount: numNodes,
    triCount: numTris,
  };
}

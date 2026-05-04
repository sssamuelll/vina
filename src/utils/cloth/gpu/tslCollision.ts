/**
 * TSL Collision Kernel — BVH-accelerated body collision via B.3 atomic emulation.
 *
 * **Algorithm (#733 Phase 2, B.3 atomic emulation)**: 2-pass per-particle kernel
 * with per-body atomic scratch buffers. Sidesteps the TSL `outer-toVar.assign(
 * storage-derived-value)` codegen issue by using `atomicMin` + `atomicStore`
 * directly on storage instead of accumulating "best so far" into outer-scope
 * `toVar` slots inside nested `If`s. See `docs/reports/2026-05-04-733-gpu-body-collision-design.md`
 * § 7.2 + § 8.3 for the rationale (Path B.3 was the recommended next direction
 * after B.2 ran into 197 WGSL validation warnings).
 *
 * Pass 1 — `findBestNode`: per particle, scan BVH leaves (flat iteration —
 *   no parent/child descent), for each leaf-matched triangle compute
 *   closest-point distance with edge fallback. Issue
 *   `atomicMin` against `bestDistBuf[i]` (fixed-point i32 distance scaled by
 *   1e6); when this thread's value won the min, `atomicStore` the triangle
 *   index into `bestTriIdxBuf[i]`. Distance is computed via two branches
 *   (inside-projection vs. edge-min); only the chosen branch issues an
 *   atomicMin, so the per-triangle work is O(1) atomics.
 *
 * Pass 2 — `applyPushNode`: per particle, `atomicLoad bestTriIdx` at function
 *   top (avoids the nested-If pitfall). When a triangle was found, re-read its
 *   vertices + normal, recompute signed plane distance + edge fallback for
 *   SIDE determination, push particle along normal, apply position-based
 *   friction. Always reset atomic scratch (`bestDistBuf[i] = INT32_MAX`,
 *   `bestTriIdxBuf[i] = -1`) for the next substep, regardless of collision.
 *
 * Detection semantics match `triangleCollision.ts:solveTriangleCollision`
 * (CPU+WASM reference, A4 § 2.4): push when `bestSide < 0` (penetrating) OR
 * `bestDist < margin` (close). Push direction = winning triangle's normal.
 * Friction is position-based, applied after push.
 *
 * Per-tier acceleration structure divergence is intentional: CPU+WASM share
 * `TriangleSpatialHash` (rebuilt per body, JS-side); GPU TSL uses a BVH
 * (built via `three-mesh-bvh` once per body, uploaded to GPU as flat
 * `StorageBufferAttribute`s). A4 § 2.4 ratifies the CPU+WASM convention;
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
 * Distance scaling: float dist (meters) → i32 fixed-point via `× 1e6`, mirroring
 * the precedent in `tslSelfCollision.ts` (`COLLISION_SCALE = 1e6`). Precision
 * 1 µm; range up to ~2100 m before i32 overflow (well beyond any realistic
 * body collision distance).
 *
 * @module tslCollision
 */

import { StorageBufferAttribute } from 'three/webgpu';
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
  atomicLoad,
  atomicStore,
  atomicMin,
} from 'three/tsl';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TslCollisionBody {
  id: string;
  /** Pass 1: per-particle BVH walk, atomic min on distance, atomic store on tri idx. */
  findBestNode: ComputeNode;
  /** Pass 2: per-particle apply push using atomic load on best tri idx, then reset scratch. */
  applyPushNode: ComputeNode;
  margin: number;
  friction: number;
  nodeCount: number;
  triCount: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Maximum push distance per collision (meters). Prevents NaN cascade. Matches CPU solver. */
const MAX_PUSH_DIST = 0.05;

/**
 * Fixed-point scale for atomic<i32> distance accumulation (WGSL has no atomic<f32>).
 * Matches `COLLISION_SCALE` in `tslSelfCollision.ts`. Precision 1 µm; range up
 * to ~2100 m before i32 overflow.
 */
const DIST_SCALE = 1000000.0;

/** Sentinel for "no triangle found" in the atomic best-tri-idx scratch buffer. */
const NO_TRI = -1;

/** Sentinel for "no distance recorded" in the atomic best-dist scratch buffer. */
const INT32_MAX = 0x7FFFFFFF;

// ─── Kernel factory ─────────────────────────────────────────────────────────

/**
 * Create the TSL body-collision kernels for one collision body using the
 * #733 Phase 2 B.3 atomic-emulation pattern. Returns two compute nodes that
 * MUST be dispatched in order per substep: `findBestNode` first, then
 * `applyPushNode`. The pair shares per-body atomic scratch buffers
 * (`bestDistBuf`, `bestTriIdxBuf`) sized `numParticles` × i32. Reset is
 * folded into `applyPushNode`'s tail, so the next substep always sees a
 * clean scratch state.
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
  // ─── Per-body atomic scratch SBAs (sentinel-initialized) ────────────────
  // bestDist init = INT32_MAX so any candidate distance wins atomicMin on first call.
  // bestTriIdx init = -1 so "no collision found" is the natural sentinel for pass 2.
  const bestDistInit = new Int32Array(numParticles).fill(INT32_MAX);
  const bestTriIdxInit = new Int32Array(numParticles).fill(NO_TRI);
  const bestDistSBA = new StorageBufferAttribute(bestDistInit, 1);
  const bestTriIdxSBA = new StorageBufferAttribute(bestTriIdxInit, 1);

  // Wrap input SBAs as storage nodes (flat float access — itemSize=1, no vec4 padding).
  const bvhBuf = storage(bvhNodesSBA, 'float', numNodes * 8);
  const triVertBuf = storage(triVertsSBA, 'float', numTris * 9);
  const triNormBuf = storage(triNormalsSBA, 'float', numTris * 3);

  // Atomic scratch — `setAtomic(true)` forces WGSL `array<atomic<i32>>` binding
  // declaration with `read_write` access, which is what makes the B.3 emulation
  // work (sidesteps the toVar/storage-derived codegen issue per § 7.2).
  // `'int' as any` works around @types/three lacking 'int' in storage() type
  // (verified in three@0.183.2; same workaround as tslSelfCollision.ts).
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const bestDistBuf = (storage(bestDistSBA, 'int' as any, numParticles) as any).setAtomic(true);
  const bestTriIdxBuf = (storage(bestTriIdxSBA, 'int' as any, numParticles) as any).setAtomic(true);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const uMargin = uniform(margin);
  const uFriction = uniform(friction);
  const uDistScale = uniform(DIST_SCALE);
  // BVH AABB filter expansion: terminal-velocity per-substep displacement is
  // ~11mm at 9.81m/s² × (1/900s)², well above margin (5mm). Empirically (#733
  // Phase 2 e2e), an AABB margin of 5mm leaves cloth at floor — too tight to
  // catch fast-falling particles before they tunnel past surface leaves. 30mm
  // catches them at shin level. 100mm catches them at body — matches the CPU
  // spatial hash's effective query radius (~3 × cellSize, default 30-50mm)
  // plus headroom for the largest expected per-frame displacement. Per-
  // triangle exact distance test inside the leaf is unchanged; wider AABB
  // just means more candidate triangles considered (negligible perf cost
  // since the BVH still culls most leaves).
  const uAabbMargin = uniform(Math.max(margin, 0.1));

  // ─── Pass 1: findBestNode ───────────────────────────────────────────────
  // Per particle: scan BVH leaves (flat Loop over all nodes; internal nodes
  // skipped by `triCount > 0` filter). For each candidate triangle compute
  // distance, atomicMin on bestDistBuf[i], atomicStore triIdx if won.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findBestFn = (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    If(w.greaterThan(float(0.0)), () => {
      const px = posBuf.element(i).x.toVar('px');
      const py = posBuf.element(i).y.toVar('py');
      const pz = posBuf.element(i).z.toVar('pz');

      // NaN guard: NaN != NaN.
      If(px.equal(px), () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Loop(numNodes, ({ i: nodeIdx }: { i: any }) => {
          const nodeBase = uint(nodeIdx).mul(uint(8));
          const nMinX = bvhBuf.element(nodeBase);
          const nMinY = bvhBuf.element(nodeBase.add(uint(1)));
          const nMinZ = bvhBuf.element(nodeBase.add(uint(2)));
          const nMaxX = bvhBuf.element(nodeBase.add(uint(3)));
          const nMaxY = bvhBuf.element(nodeBase.add(uint(4)));
          const nMaxZ = bvhBuf.element(nodeBase.add(uint(5)));
          const triCount = bvhBuf.element(nodeBase.add(uint(7)));

          If(triCount.greaterThan(float(0)), () => {
            // AABB overlap test (point ± uAabbMargin vs leaf AABB).
            // See uAabbMargin definition above for the calibration rationale.
            If(
              px.add(uAabbMargin).greaterThanEqual(nMinX)
                .and(px.sub(uAabbMargin).lessThanEqual(nMaxX))
                .and(py.add(uAabbMargin).greaterThanEqual(nMinY))
                .and(py.sub(uAabbMargin).lessThanEqual(nMaxY))
                .and(pz.add(uAabbMargin).greaterThanEqual(nMinZ))
                .and(pz.sub(uAabbMargin).lessThanEqual(nMaxZ)),
              () => {
                const triStart = bvhBuf.element(nodeBase.add(uint(6)));
                const count = int(triCount);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                Loop({ start: int(0), end: count, type: 'int', condition: '<' }, ({ i: ti }: { i: any }) => {
                  const triIdx = uint(int(triStart).add(ti));

                  // Read triangle vertices (9 floats per tri) and normal (3 floats per tri).
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

                  const tnBase = triIdx.mul(uint(3));
                  const nnx = triNormBuf.element(tnBase);
                  const nny = triNormBuf.element(tnBase.add(uint(1)));
                  const nnz = triNormBuf.element(tnBase.add(uint(2)));

                  // Edge vectors and AP.
                  const abx = bx.sub(ax); const aby = by.sub(ay); const abz = bz.sub(az);
                  const acx = cx.sub(ax); const acy = cy.sub(ay); const acz = cz.sub(az);
                  const apx = px.sub(ax); const apy = py.sub(ay); const apz = pz.sub(az);

                  // Signed plane distance.
                  const dot = apx.mul(nnx).add(apy.mul(nny)).add(apz.mul(nnz));

                  // Project point onto plane.
                  const projx = px.sub(dot.mul(nnx));
                  const projy = py.sub(dot.mul(nny));
                  const projz = pz.sub(dot.mul(nnz));

                  // Barycentric coordinates of projection (Cramer's rule).
                  const v0x = projx.sub(ax); const v0y = projy.sub(ay); const v0z = projz.sub(az);
                  const d00 = abx.mul(abx).add(aby.mul(aby)).add(abz.mul(abz));
                  const d01 = abx.mul(acx).add(aby.mul(acy)).add(abz.mul(acz));
                  const d02 = abx.mul(v0x).add(aby.mul(v0y)).add(abz.mul(v0z));
                  const d11 = acx.mul(acx).add(acy.mul(acy)).add(acz.mul(acz));
                  const d12 = acx.mul(v0x).add(acy.mul(v0y)).add(acz.mul(v0z));
                  const denom = d00.mul(d11).sub(d01.mul(d01));

                  // Skip degenerate triangles (denom ≈ 0).
                  If(denom.abs().greaterThan(float(1e-12)), () => {
                    const invD = float(1).div(denom);
                    const u = d11.mul(d02).sub(d01.mul(d12)).mul(invD);
                    const v = d00.mul(d12).sub(d01.mul(d02)).mul(invD);

                    // Branch on inside-projection vs edge-fallback. Each branch
                    // computes its own distance and issues atomicMin directly —
                    // no outer-scope toVar tracking, no select(). Storage WRITES
                    // (atomicMin / atomicStore) inside nested Ifs DO propagate
                    // (per § 8.1 + tslSelfCollision precedent).
                    // greaterThanEqual/lessThanEqual missing from @types/three at runtime.
                    If(
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (u as any).greaterThanEqual(float(0))
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .and((v as any).greaterThanEqual(float(0)))
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        .and((u.add(v) as any).lessThanEqual(float(1))),
                      () => {
                        // Inside-projection: dist = |dot|.
                        const distI32 = int(dot.abs().mul(uDistScale));
                        const oldDist = atomicMin(bestDistBuf.element(i), distI32);
                        If(oldDist.greaterThan(distI32), () => {
                          atomicStore(bestTriIdxBuf.element(i), int(triIdx));
                        });
                      },
                    ).Else(() => {
                      // Outside-projection: closest point on each edge with
                      // parameter clamp [0,1]; min wins. Mirrors CPU
                      // pointToTriangleDist:58–92 (3-edge fallback).

                      // Edge AB
                      const tABraw = apx.mul(abx).add(apy.mul(aby)).add(apz.mul(abz)).div(d00.max(float(1e-12)));
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const tAB = (tABraw as any).max(float(0)).min(float(1));
                      const eABx = ax.add(tAB.mul(abx));
                      const eABy = ay.add(tAB.mul(aby));
                      const eABz = az.add(tAB.mul(abz));
                      const dABx = px.sub(eABx); const dABy = py.sub(eABy); const dABz = pz.sub(eABz);
                      const dsqAB = dABx.mul(dABx).add(dABy.mul(dABy)).add(dABz.mul(dABz));

                      // Edge AC
                      const tACraw = apx.mul(acx).add(apy.mul(acy)).add(apz.mul(acz)).div(d11.max(float(1e-12)));
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const tAC = (tACraw as any).max(float(0)).min(float(1));
                      const eACx = ax.add(tAC.mul(acx));
                      const eACy = ay.add(tAC.mul(acy));
                      const eACz = az.add(tAC.mul(acz));
                      const dACx = px.sub(eACx); const dACy = py.sub(eACy); const dACz = pz.sub(eACz);
                      const dsqAC = dACx.mul(dACx).add(dACy.mul(dACy)).add(dACz.mul(dACz));

                      // Edge BC
                      const bcx = cx.sub(bx); const bcy = cy.sub(by); const bcz = cz.sub(bz);
                      const bpx = px.sub(bx); const bpy = py.sub(by); const bpz = pz.sub(bz);
                      const bcLenSq = bcx.mul(bcx).add(bcy.mul(bcy)).add(bcz.mul(bcz));
                      const tBCraw = bpx.mul(bcx).add(bpy.mul(bcy)).add(bpz.mul(bcz)).div(bcLenSq.max(float(1e-12)));
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const tBC = (tBCraw as any).max(float(0)).min(float(1));
                      const eBCx = bx.add(tBC.mul(bcx));
                      const eBCy = by.add(tBC.mul(bcy));
                      const eBCz = bz.add(tBC.mul(bcz));
                      const dBCx = px.sub(eBCx); const dBCy = py.sub(eBCy); const dBCz = pz.sub(eBCz);
                      const dsqBC = dBCx.mul(dBCx).add(dBCy.mul(dBCy)).add(dBCz.mul(dBCz));

                      // Min of the three edge dsq, sqrt'd, atomicMin'd.
                      const minEdgeDsq = dsqAB.min(dsqAC).min(dsqBC);
                      const distI32 = int(minEdgeDsq.sqrt().mul(uDistScale));
                      const oldDist = atomicMin(bestDistBuf.element(i), distI32);
                      If(oldDist.greaterThan(distI32), () => {
                        atomicStore(bestTriIdxBuf.element(i), int(triIdx));
                      });
                    });
                  });
                });
              },
            );
          });
        });
      });
    });
  })();

  const findBestNode = compute(findBestFn, numParticles, [64]);

  // ─── Pass 2: applyPushNode ──────────────────────────────────────────────
  // Per particle: atomicLoad bestTriIdx; if found, re-read winning triangle,
  // compute SIDE, push, friction. Always reset atomic scratch for next substep.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyPushFn = (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    // Atomic load at function-top — direct WGSL atomicLoad call, not a nested
    // toVar.assign(storage_read). Safe per the codegen analysis in § 7.2.
    const bestTriIdxLoaded = atomicLoad(bestTriIdxBuf.element(i));

    If(w.greaterThan(float(0.0)).and(bestTriIdxLoaded.greaterThanEqual(int(0))), () => {
      const px = posBuf.element(i).x.toVar('apx');
      const py = posBuf.element(i).y.toVar('apy');
      const pz = posBuf.element(i).z.toVar('apz');

      // Re-read winning triangle's vertices + normal via dynamic indexing.
      const triIdxU = uint(bestTriIdxLoaded);
      const tvBase = triIdxU.mul(uint(9));
      const ax = triVertBuf.element(tvBase);
      const ay = triVertBuf.element(tvBase.add(uint(1)));
      const az = triVertBuf.element(tvBase.add(uint(2)));
      const bx = triVertBuf.element(tvBase.add(uint(3)));
      const by = triVertBuf.element(tvBase.add(uint(4)));
      const bz = triVertBuf.element(tvBase.add(uint(5)));
      const cx = triVertBuf.element(tvBase.add(uint(6)));
      const cy = triVertBuf.element(tvBase.add(uint(7)));
      const cz = triVertBuf.element(tvBase.add(uint(8)));

      const tnBase = triIdxU.mul(uint(3));
      const nnx = triNormBuf.element(tnBase);
      const nny = triNormBuf.element(tnBase.add(uint(1)));
      const nnz = triNormBuf.element(tnBase.add(uint(2)));

      // Recompute SIDE + DIST for the winning triangle. Mirrors CPU
      // pointToTriangleDist (triangleCollision.ts:16–93). Uses two function-
      // top toVars (`bestSide`, `bestDist`) — not nested-If outer toVars
      // assigned from a deeply nested loop, so the § 7.2 pitfall does not
      // apply here.
      const apx = px.sub(ax); const apy = py.sub(ay); const apz = pz.sub(az);
      const dot = apx.mul(nnx).add(apy.mul(nny)).add(apz.mul(nnz));

      const projx = px.sub(dot.mul(nnx));
      const projy = py.sub(dot.mul(nny));
      const projz = pz.sub(dot.mul(nnz));

      const abx = bx.sub(ax); const aby = by.sub(ay); const abz = bz.sub(az);
      const acx = cx.sub(ax); const acy = cy.sub(ay); const acz = cz.sub(az);
      const v0x = projx.sub(ax); const v0y = projy.sub(ay); const v0z = projz.sub(az);
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

        const bestSide = float(0).toVar('bestSide');
        const bestDist = float(0).toVar('bestDist');

        // greaterThanEqual/lessThanEqual missing from @types/three at runtime.
        If(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (u as any).greaterThanEqual(float(0))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .and((v as any).greaterThanEqual(float(0)))
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .and((u.add(v) as any).lessThanEqual(float(1))),
          () => {
            // Inside-projection: dist = |dot|, side = dot.
            bestDist.assign(dot.abs());
            bestSide.assign(dot);
          },
        ).Else(() => {
          // Outside-projection: closest edge point + edge side via normal.
          // Edge AB
          const tABraw = apx.mul(abx).add(apy.mul(aby)).add(apz.mul(abz)).div(d00.max(float(1e-12)));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tAB = (tABraw as any).max(float(0)).min(float(1));
          const eABx = ax.add(tAB.mul(abx));
          const eABy = ay.add(tAB.mul(aby));
          const eABz = az.add(tAB.mul(abz));
          const dABx = px.sub(eABx); const dABy = py.sub(eABy); const dABz = pz.sub(eABz);
          const dsqAB = dABx.mul(dABx).add(dABy.mul(dABy)).add(dABz.mul(dABz));

          // Edge AC
          const tACraw = apx.mul(acx).add(apy.mul(acy)).add(apz.mul(acz)).div(d11.max(float(1e-12)));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tAC = (tACraw as any).max(float(0)).min(float(1));
          const eACx = ax.add(tAC.mul(acx));
          const eACy = ay.add(tAC.mul(acy));
          const eACz = az.add(tAC.mul(acz));
          const dACx = px.sub(eACx); const dACy = py.sub(eACy); const dACz = pz.sub(eACz);
          const dsqAC = dACx.mul(dACx).add(dACy.mul(dACy)).add(dACz.mul(dACz));

          // Edge BC
          const bcx = cx.sub(bx); const bcy = cy.sub(by); const bcz = cz.sub(bz);
          const bpx = px.sub(bx); const bpy = py.sub(by); const bpz = pz.sub(bz);
          const bcLenSq = bcx.mul(bcx).add(bcy.mul(bcy)).add(bcz.mul(bcz));
          const tBCraw = bpx.mul(bcx).add(bpy.mul(bcy)).add(bpz.mul(bcz)).div(bcLenSq.max(float(1e-12)));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const tBC = (tBCraw as any).max(float(0)).min(float(1));
          const eBCx = bx.add(tBC.mul(bcx));
          const eBCy = by.add(tBC.mul(bcy));
          const eBCz = bz.add(tBC.mul(bcz));
          const dBCx = px.sub(eBCx); const dBCy = py.sub(eBCy); const dBCz = pz.sub(eBCz);
          const dsqBC = dBCx.mul(dBCx).add(dBCy.mul(dBCy)).add(dBCz.mul(dBCz));

          // Pick the closest edge via cascaded If/ElseIf/Else.
          // greaterThanEqual/lessThanEqual missing from @types/three at runtime.
          If(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (dsqAB as any).lessThanEqual(dsqAC)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .and((dsqAB as any).lessThanEqual(dsqBC)),
            () => {
              bestDist.assign(dsqAB.sqrt());
              bestSide.assign(dABx.mul(nnx).add(dABy.mul(nny)).add(dABz.mul(nnz)));
            },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ).ElseIf((dsqAC as any).lessThanEqual(dsqBC), () => {
            bestDist.assign(dsqAC.sqrt());
            bestSide.assign(dACx.mul(nnx).add(dACy.mul(nny)).add(dACz.mul(nnz)));
          }).Else(() => {
            bestDist.assign(dsqBC.sqrt());
            bestSide.assign(dBCx.mul(nnx).add(dBCy.mul(nny)).add(dBCz.mul(nnz)));
          });
        });

        // Push decision (matches CPU triangleCollision.ts:299–309):
        //   penetrating (side < 0): pushDist = margin + dist
        //   close (side ≥ 0, dist < margin): pushDist = margin - dist
        //   else: no push
        // Clamp to MAX_PUSH_DIST to prevent NaN cascade.
        const pushDist = float(0).toVar('pushDist');
        If(bestSide.lessThan(float(0)), () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pushDist.assign((uMargin.add(bestDist) as any).min(float(MAX_PUSH_DIST)));
        }).Else(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pushDist.assign((uMargin.sub(bestDist) as any).max(float(0)).min(float(MAX_PUSH_DIST)));
        });

        If(pushDist.greaterThan(float(0)), () => {
          // Push particle out along normal (storage write — propagates per § 8.1).
          posBuf.element(i).x.addAssign(nnx.mul(pushDist));
          posBuf.element(i).y.addAssign(nny.mul(pushDist));
          posBuf.element(i).z.addAssign(nnz.mul(pushDist));

          // Position-based friction (matches CPU triangleCollision.ts:312–323).
          If(uFriction.greaterThan(float(0)), () => {
            const dx = posBuf.element(i).x.sub(prevPosBuf.element(i).x);
            const dy = posBuf.element(i).y.sub(prevPosBuf.element(i).y);
            const dz = posBuf.element(i).z.sub(prevPosBuf.element(i).z);

            const vn = dx.mul(nnx).add(dy.mul(nny)).add(dz.mul(nnz));
            const tx = dx.sub(vn.mul(nnx));
            const ty = dy.sub(vn.mul(nny));
            const tz = dz.sub(vn.mul(nnz));

            posBuf.element(i).x.subAssign(uFriction.mul(tx));
            posBuf.element(i).y.subAssign(uFriction.mul(ty));
            posBuf.element(i).z.subAssign(uFriction.mul(tz));
          });
        });
      });
    });

    // Reset atomic scratch for next substep — always, even when no collision.
    // Direct atomicStore at function-tail; same pattern as tslSelfCollision's
    // applyCorrections reset block.
    atomicStore(bestTriIdxBuf.element(i), int(NO_TRI));
    atomicStore(bestDistBuf.element(i), int(INT32_MAX));
  })();

  const applyPushNode = compute(applyPushFn, numParticles, [64]);

  return {
    id,
    findBestNode,
    applyPushNode,
    margin,
    friction,
    nodeCount: numNodes,
    triCount: numTris,
  };
}

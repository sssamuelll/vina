/**
 * TSL Collision Kernel — BVH-accelerated body collision via atomic emulation.
 *
 * **Algorithm (atomic emulation)**: 2-pass per-particle kernel with per-body
 * atomic scratch buffers. Sidesteps the TSL `outer-toVar.assign(
 * storage-derived-value)` codegen pitfall by using `atomicMin` + `atomicStore`
 * directly on storage instead of accumulating "best so far" into outer-scope
 * `toVar` slots inside nested `If`s. See
 * `docs/reports/2026-05-04-733-gpu-body-collision-design.md` for the rationale
 * (a prior toVar-based attempt produced ~200 WGSL validation warnings; the
 * atomic-emulation pattern below was the recommended fix).
 *
 * Pass 1 — `findBestNode`: per particle, threaded BVH traversal via escape
 *   (skip) pointers (#897 F4.3b — the previous flat Loop over ALL nodes was
 *   93% of the frame on the María fixture: 29,338 particles × 11,955 avatar
 *   nodes × 15 substeps ≈ 5.3B AABB tests/frame). The cursor starts at the
 *   root; AABB hit on an internal node descends into the left child (slot 6,
 *   preorder = parent+1); AABB miss — or a processed leaf — jumps to
 *   `skip[i]`, the first preorder node outside i's subtree (see bvh.ts). For
 *   each leaf-matched triangle compute closest-point distance with edge
 *   fallback. Issue `atomicMin` against `bestDistBuf[i]` (fixed-point i32
 *   distance scaled by 1e6); when this thread's value won the min,
 *   `atomicStore` the triangle index into `bestTriIdxBuf[i]`. Distance is
 *   computed via two branches (inside-projection vs. edge-min); only the
 *   chosen branch issues an atomicMin, so the per-triangle work is O(1)
 *   atomics. Parent AABBs contain child AABBs, so gating descent on the same
 *   margin-expanded test reaches exactly the leaves the flat scan matched.
 *
 * Pass 2 — `applyPushNode`: per particle, `atomicLoad bestTriIdx` at function
 *   top (avoids the nested-If pitfall). When a triangle was found, re-read its
 *   vertices + normal, recompute signed plane distance + edge fallback for
 *   SIDE determination, push particle along normal, apply position-based
 *   friction. Always reset atomic scratch (`bestDistBuf[i] = INT32_MAX`,
 *   `bestTriIdxBuf[i] = -1`) for the next substep, regardless of collision.
 *
 * Detection semantics match `triangleCollision.ts:solveTriangleCollision`
 * (CPU+WASM reference): push when `bestSide < 0` (penetrating) OR
 * `bestDist < margin` (close). Push direction = winning triangle's normal.
 * Friction is position-based, applied after push.
 *
 * Per-tier acceleration structure divergence is intentional: CPU+WASM share
 * `TriangleSpatialHash` (rebuilt per body, JS-side); GPU TSL uses a BVH
 * (built via `three-mesh-bvh` once per body, uploaded to GPU as flat
 * `StorageBufferAttribute`s).
 *
 * BVH node format (8 floats per node, stored in a flat StorageBufferAttribute):
 *   [minX, minY, minZ, maxX, maxY, maxZ, child/triStart, triCount]
 *   Internal node: triCount=0, child=leftChildIndex (== parent+1, preorder;
 *     the right child is found implicitly via skip[leftChildIndex])
 *   Leaf node: triCount>0, child=triStart (index into triVerts)
 *   Skip buffer (1 uint per node): escape pointer — first preorder node
 *     outside node i's subtree; root escapes to numNodes (terminate sentinel)
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
  select,
  instanceIndex,
  atomicLoad,
  atomicStore,
  atomicMin,
} from 'three/tsl';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import { disposeStorageBufferAttribute } from './tslBuffers';
import { makeAtomicStorage } from './atomicStorage';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TslCollisionBody {
  id: string;
  /** Pass 1: per-particle threaded BVH traversal (escape pointers), atomic min on distance, atomic store on tri idx. */
  findBestNode: ComputeNode;
  /** Pass 2: per-particle apply push using atomic load on best tri idx, then reset scratch. */
  applyPushNode: ComputeNode;
  margin: number;
  friction: number;
  nodeCount: number;
  triCount: number;
  /**
   * Release the per-body atomic scratch SBAs (`bestDistSBA`, `bestTriIdxSBA`)
   * created inside `createTslCollisionBody`. Best-effort without a renderer
   * (mirrors `disposeStorageBufferAttribute`): drops references only — the
   * GPUBuffer is freed when the renderer's `_attributes` WeakMap entry is
   * cleared, which requires the renderer reference to route through.
   *
   * The BVH input SBAs (`bvhNodesSBA`, `bvhSkipSBA`, `triVertsSBA`,
   * `triNormalsSBA`) are NOT freed here — they're caller-owned (see
   * `GpuSolverClient.collisionBodySBAs`).
   */
  dispose(renderer?: unknown): void;
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
 * atomic-emulation pattern. Returns two compute nodes that
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
 * @param bvhSkipSBA - Escape pointers (1 uint per node) for threaded traversal (#897 F4.3b)
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
  bvhSkipSBA: StorageBufferAttribute,
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
  // Escape pointers (#897 F4.3b): skipBuf[i] = first preorder node outside
  // node i's subtree; root escapes to numNodes (terminate sentinel).
  const skipBuf = storage(bvhSkipSBA, 'uint', numNodes);
  const triVertBuf = storage(triVertsSBA, 'float', numTris * 9);
  const triNormBuf = storage(triNormalsSBA, 'float', numTris * 3);

  // Atomic scratch — array<atomic<i32>> binding with read_write access is what
  // makes the atomic-emulation pattern work (sidesteps the outer-toVar /
  // storage-derived codegen pitfall described in the file-header rationale).
  const bestDistBuf = makeAtomicStorage(bestDistSBA, 'int', numParticles);
  const bestTriIdxBuf = makeAtomicStorage(bestTriIdxSBA, 'int', numParticles);

  const uMargin = uniform(margin);
  const uFriction = uniform(friction);
  const uDistScale = uniform(DIST_SCALE);
  // BVH AABB query expansion — the breadth driver of the traversal: wider
  // margin ⇒ more subtree visited per particle per substep (same hits; the
  // per-triangle exact distance test inside the leaf is unchanged).
  //
  // History: the original calibration (design doc §9 era: 5mm → cloth at
  // floor; 30mm → shin; 100mm → knee) PREDATES the F2 fixes. The tunneling
  // that demanded 100mm was caused by the velocity bug F2 removed (collision
  // push leaked into velocity; with inelastic response + velocity exclusion
  // + damping 0.99 + M4-D calibration, particles no longer accelerate
  // through the surface). That table is obsolete — 100mm was a workaround,
  // not a requirement.
  //
  // F4.3c sweep (2026-06-13, María fixture 29,338 particles, post-F4.3b
  // escape-pointer traversal, headed Chromium + real GPU, medians over ≥26
  // 30-frame windows; drape sampled per window so values compare at MATCHED
  // sim-time — the tier steps fixed dt per frame, so wall-clock marks are
  // not comparable across fps):
  //
  //   floor   frameMs   fps    drape vs 0.1-control at matched sim-time
  //   0.1     117.8     8.5    control (M4 green at settle, ~2s sim)
  //   0.05     46.5    21.5    indistinguishable from control
  //   0.03     30.7/31.3 32.6/32.0 (n=2) indistinguishable from control
  //   0.02     24.6/24.4 40.7/41.0 (n=2) REPRODUCIBLY degraded post-settle:
  //            faster creep (+5-7% belowHip from ~4s sim), early shoulder
  //            slip (maxY < 1.3 by ~9s sim in rep2) — the cliff edge.
  //
  // Physical floor: the margin bounds the maximum rescuable penetration
  // depth. Push margin (8mm, M4-D) + terminal per-substep displacement
  // (~11mm at sdt=1/900) ≈ 19mm — 0.02 sits ~1mm above that sum and shows
  // it; 0.03 keeps ~11mm headroom and tracks the control through settle,
  // creep, and slide (n=2). Known issue, margin-INDEPENDENT: a slow creep
  // (garment slides down the avatar from ~3s sim) exists at every value
  // including 0.1 — that is a separate physics item, not a query-radius one.
  const uAabbMargin = uniform(Math.max(margin, 0.03));

  // ─── Pass 1: findBestNode ───────────────────────────────────────────────
  // Per particle: threaded BVH traversal via escape pointers (#897 F4.3b).
  // Internal-node AABB hit → descend (left child, slot 6); miss or processed
  // leaf → jump to skipBuf[node] (past the subtree). For each candidate
  // triangle compute distance, atomicMin on bestDistBuf[i], atomicStore
  // triIdx if won.
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
        // Threaded traversal cursor (#897 F4.3b): every step strictly
        // increases it — descend goes to nodeIdx+1 (preorder left child),
        // miss/leaf jumps past the subtree (skip > nodeIdx) — so each node is
        // visited at most once and Loop(numNodes) is a hard bound, not the
        // visit count. Termination therefore does NOT depend on skip-array
        // integrity. Replaces the flat scan over ALL nodes that profiled at
        // 93% of the frame on the María fixture (29,338 particles × 11,955
        // avatar nodes × 15 substeps ≈ 5.3B AABB tests/frame).
        const nodeIdx = uint(0).toVar('nodeIdx');
        Loop(numNodes, () => {
          // Cursor walked off the tree (root escape sentinel = numNodes).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          If((nodeIdx as any).greaterThanEqual(uint(numNodes)), () => { Break(); });

          // Snapshot the slot base BEFORE the cursor is reassigned below —
          // TSL inlines operator nodes at each use site, so a bare
          // `nodeIdx.mul(8)` read after `nodeIdx.assign(...)` would address
          // the NEXT node's slots.
          const nodeBase = nodeIdx.mul(uint(8)).toVar('nodeBase');
          const nMinX = bvhBuf.element(nodeBase);
          const nMinY = bvhBuf.element(nodeBase.add(uint(1)));
          const nMinZ = bvhBuf.element(nodeBase.add(uint(2)));
          const nMaxX = bvhBuf.element(nodeBase.add(uint(3)));
          const nMaxY = bvhBuf.element(nodeBase.add(uint(4)));
          const nMaxZ = bvhBuf.element(nodeBase.add(uint(5)));
          const triCount = bvhBuf.element(nodeBase.add(uint(7)));

          // AABB overlap test (point ± uAabbMargin vs node AABB) — the same
          // test the flat scan applied to leaves, now also gating descent.
          // Parent AABBs contain child AABBs, so the margin-expanded test
          // reaches exactly the leaves the flat scan matched (wider margin →
          // more subtree visits, same hits). See uAabbMargin definition above
          // for the calibration rationale.
          If(
            px.add(uAabbMargin).greaterThanEqual(nMinX)
              .and(px.sub(uAabbMargin).lessThanEqual(nMaxX))
              .and(py.add(uAabbMargin).greaterThanEqual(nMinY))
              .and(py.sub(uAabbMargin).lessThanEqual(nMaxY))
              .and(pz.add(uAabbMargin).greaterThanEqual(nMinZ))
              .and(pz.sub(uAabbMargin).lessThanEqual(nMaxZ)),
            () => {
              If(triCount.greaterThan(float(0)), () => {
                // Leaf — per-triangle processing below is byte-identical to
                // the pre-F4.3b flat scan (barycentric + edge fallback + F2
                // NaN guard/clamp + atomicMin); only the node-iteration
                // mechanism changed.
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
                    // no outer-scope toVar tracking, no cross-branch select()
                    // (the value-level select() below is a per-branch NaN guard,
                    // not branch selection). Storage WRITES
                    // (atomicMin / atomicStore) inside nested Ifs DO propagate
                    // (mirrors the tslSelfCollision precedent).
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
                        // §9 cand. 5+6 (#897 F2): NaN→i32 es UB en WGSL — un triángulo
                        // degenerado envenenaría el atomicMin con un mínimo fantasma; y
                        // >2.147m desborda i32 a escala 1e6. NaN ≠ NaN ⇒ equal(self) falso.
                        // TSL select(cond, ifTrue, ifFalse) — cond va PRIMERO
                        // (ConditionalNode), orden opuesto al select(f, t, cond) de WGSL.
                        const distFloat = dot.abs();
                        const distClamped = distFloat.min(float(2.0));
                        const distI32 = select(
                          distFloat.equal(distFloat),
                          int(distClamped.mul(uDistScale)),
                          int(INT32_MAX),
                        );
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
                      // §9 cand. 5+6 (#897 F2): mismo guard que la rama
                      // inside-projection — NaN→i32 es UB en WGSL; >2.147m
                      // desborda i32 a escala 1e6. NaN ≠ NaN ⇒ equal(self) falso.
                      const minEdgeDsq = dsqAB.min(dsqAC).min(dsqBC);
                      const distFloat = minEdgeDsq.sqrt();
                      const distClamped = distFloat.min(float(2.0));
                      const distI32 = select(
                        distFloat.equal(distFloat),
                        int(distClamped.mul(uDistScale)),
                        int(INT32_MAX),
                      );
                      const oldDist = atomicMin(bestDistBuf.element(i), distI32);
                      If(oldDist.greaterThan(distI32), () => {
                        atomicStore(bestTriIdxBuf.element(i), int(triIdx));
                      });
                    });
                  });
                });

                // Leaf processed → escape past this subtree.
                nodeIdx.assign(skipBuf.element(nodeIdx));
              }).Else(() => {
                // Internal hit → descend into the left child (slot 6 == nodeIdx+1, preorder).
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
    // toVar.assign(storage_read). Safe per the codegen analysis in the design
    // doc referenced at the top of this file.
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
      // assigned from a deeply nested loop, so the outer-toVar codegen pitfall
      // does not apply here.
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
          // Push particle out along normal (storage write — propagates per the tslSelfCollision precedent).
          posBuf.element(i).x.addAssign(nnx.mul(pushDist));
          posBuf.element(i).y.addAssign(nny.mul(pushDist));
          posBuf.element(i).z.addAssign(nnz.mul(pushDist));

          // Coulomb position-based friction con stiction (#902) — espejo de CPU
          // triangleCollision.ts. Presupuesta la corrección tangencial por la
          // profundidad de corrección normal (pushDist): scale = min(μ·depth/|t|, 1).
          // scale==1 ⇒ stick total (sin creep); <1 ⇒ deslizamiento cinético.
          // Div-guard branch-free vía max(|t|, 1e-8) (si |t|→0 el slide ya es ~0).
          If(uFriction.greaterThan(float(0)), () => {
            const dx = posBuf.element(i).x.sub(prevPosBuf.element(i).x);
            const dy = posBuf.element(i).y.sub(prevPosBuf.element(i).y);
            const dz = posBuf.element(i).z.sub(prevPosBuf.element(i).z);

            const vn = dx.mul(nnx).add(dy.mul(nny)).add(dz.mul(nnz));
            const tx = dx.sub(vn.mul(nnx));
            const ty = dy.sub(vn.mul(nny));
            const tz = dz.sub(vn.mul(nnz));

            const tLen = tx.mul(tx).add(ty.mul(ty)).add(tz.mul(tz)).sqrt();
            const scale = uFriction.mul(pushDist).div(tLen.max(float(1e-8))).min(float(1.0));

            posBuf.element(i).x.subAssign(tx.mul(scale));
            posBuf.element(i).y.subAssign(ty.mul(scale));
            posBuf.element(i).z.subAssign(tz.mul(scale));
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
    dispose(renderer?: unknown): void {
      // Release the per-body atomic scratch SBAs captured by closure. These are
      // the only SBAs created inside the factory; bvh/triVerts/triNormals are
      // caller-owned. Routes through `disposeStorageBufferAttribute` for the
      // same renderer-routing rationale documented in tslBuffers.ts.
      disposeStorageBufferAttribute(bestDistSBA, renderer);
      disposeStorageBufferAttribute(bestTriIdxSBA, renderer);
    },
  };
}

/**
 * TSL Collision Kernel — BVH-accelerated body collision via atomic emulation.
 *
 * **Algorithm (atomic emulation)**: 2-pass per-particle kernel with a per-body
 * atomic scratch buffer. Sidesteps the TSL `outer-toVar.assign(
 * storage-derived-value)` codegen pitfall by using `atomicMin` directly on
 * storage instead of accumulating "best so far" into outer-scope `toVar` slots
 * inside nested `If`s. The winner is recorded as a composite sort key (#921
 * Eje A — see the `TRI_BITS` block) so contact selection is order-independent. See
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
 *   fallback, pack it into the composite key `(distQ << TRI_BITS) | triIdx`, and
 *   `atomicMin` that against `bestDistBuf[i]` (which now holds the sort KEY, not a
 *   raw distance). Distance is computed via two branches (inside-projection vs.
 *   edge-min); only the chosen branch issues an atomicMin, so the per-triangle
 *   work is O(1) atomics. Parent AABBs contain child AABBs, so gating descent on
 *   the same margin-expanded test reaches exactly the leaves the flat scan matched.
 *
 * Pass 2 — `applyPushNode`: per particle, `atomicLoad bestDistBuf` at function
 *   top (avoids the nested-If pitfall). When a key < sentinel was recorded,
 *   decode `triIdx = key & TRI_MASK`, re-read the winning triangle's vertices +
 *   normal, recompute signed plane distance + edge fallback for SIDE
 *   determination, push particle along normal, apply position-based friction.
 *   Always reset scratch (`bestDistBuf[i] = INT32_MAX`) for the next substep,
 *   regardless of collision.
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
 * Selection key: the winning triangle is a composite i32 sort key
 * `(distQ << TRI_BITS) | triIdx` (#921 Eje A — see the `TRI_BITS` block). distQ is
 * the closest-point distance clamped to 2.0 m and quantized to ~244 µm/level; pass 2
 * recomputes the exact distance, so the quantization is selection-only (it only
 * breaks near-equidistant ties deterministically by lowest triIdx).
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
  /** Pass 1: per-particle threaded BVH traversal (escape pointers), atomic min on the composite contact key. */
  findBestNode: ComputeNode;
  /** Pass 2: per-particle apply push using atomic load of the best-contact key, then reset scratch. */
  applyPushNode: ComputeNode;
  margin: number;
  friction: number;
  nodeCount: number;
  triCount: number;
  /**
   * Release the per-body atomic scratch SBA (`bestDistSBA`, the composite-key buffer)
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
 * #921 Eje A — deterministic contact selection via a single composite-key atomicMin.
 *
 * The old design recorded the winner as TWO unfused atomics: `atomicMin` on the i32
 * distance, then a disjoint `If(oldDist > distI32) atomicStore(bestTriIdx)`. That was
 * non-deterministic two ways: (1) on an EXACT quantized-distance tie neither writer
 * stores, so the recorded index is whichever thread first reached that distance; and
 * (2) across DISTINCT distances the min and the store are not atomic together, so a
 * thread that improved the distance can still have its index overwritten by a slower
 * thread from a WORSE distance (the store-vs-min window). Identical input → different
 * winning triangle → different push normal, amplified over ~15 substeps × ~9000 frames.
 *
 * Fix: pack the winner into one i32 sort key — `key = (distQ << TRI_BITS) | triIdx` —
 * and `atomicMin` that. `atomicMin` is order-independent, so the GPU now selects the
 * same winner (min distQ, then LOWEST triIdx on ties) on every run of a given device —
 * making contact selection DETERMINISTIC, the prerequisite for the parity-oracle role.
 * It does NOT make selection bit-identical to CPU/WASM: the CPU breaks ties by
 * spatial-hash scan order with a strict `<` on UNquantized distance, and the two tiers
 * walk different acceleration structures (BVH vs hash). The win here is run-to-run
 * reproducibility on the default tier, not exact cross-tier equality. Pass 2 decodes
 * `triIdx = key & TRI_MASK`; it recomputes the distance itself, so the coarse `distQ`
 * quantization is selection-only (≈244 µm/level — it merely turns near-equidistant
 * non-deterministic flips into deterministic lowest-index ties).
 */
const TRI_BITS = 18; // ≤ 262 144 collision triangles packed in the low bits
const TRI_MASK = 0x3ffff; // (1 << TRI_BITS) - 1
const MAX_PACKABLE_TRI = 1 << TRI_BITS;
const DIST_QUANT_MAX = 8190; // 13 bits; max key = (8190<<18)|TRI_MASK < INT32_MAX
const DIST_PACK_SCALE = DIST_QUANT_MAX / 2.0; // distClamped ∈ [0,2.0] m → distQ ∈ [0,8190]

/** Sentinel "no contact": the max key; nothing wins `atomicMin` against it. */
const INT32_MAX = 0x7fffffff;

// Static invariant (#921 Eje A): the largest packable key must stay strictly below
// the sentinel so a real contact always wins atomicMin against "no contact". Guards
// future edits to TRI_BITS / DIST_QUANT_MAX from silently colliding with the sentinel.
if (((DIST_QUANT_MAX << TRI_BITS) | TRI_MASK) >= INT32_MAX) {
  throw new Error('tslCollision: composite-key range overflows the INT32_MAX sentinel (#921 Eje A)');
}

// ─── Kernel factory ─────────────────────────────────────────────────────────

/**
 * Create the TSL body-collision kernels for one collision body using the
 * atomic-emulation pattern. Returns two compute nodes that
 * MUST be dispatched in order per substep: `findBestNode` first, then
 * `applyPushNode`. The pair shares per-body atomic scratch buffers
 * (`bestDistBuf`, the composite-key buffer) sized `numParticles` × i32. Reset is
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
 * @param edgePseudoSBA - Edge pseudonormals (9 floats per tri: AB,BC,CA × xyz, BVH-leaf order)
 * @param vertexPseudoSBA - Vertex pseudonormals (9 floats per tri: A,B,C × xyz, BVH-leaf order)
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
  edgePseudoSBA: StorageBufferAttribute,
  vertexPseudoSBA: StorageBufferAttribute,
  numParticles: number,
  numNodes: number,
  numTris: number,
  id: string,
  margin: number = 0.005,
  friction: number = 0.3,
): TslCollisionBody {
  // ─── Per-body atomic scratch SBA (sentinel-initialized) ─────────────────
  // Holds the composite contact key (distQ<<TRI_BITS | triIdx), NOT a raw distance.
  // init = INT32_MAX (sentinel "no contact") so any real candidate key wins atomicMin.
  // #921 Eje A: triIdx is packed into the low TRI_BITS, so the collision mesh must fit —
  // guard here rather than silently corrupting the distance bits on overflow.
  if (numTris > MAX_PACKABLE_TRI) {
    throw new Error(
      `tslCollision: ${numTris} collision triangles exceed the composite-key cap ` +
        `${MAX_PACKABLE_TRI} (#921 Eje A). Raise TRI_BITS or fall back to WASM/CPU.`,
    );
  }
  const bestDistInit = new Int32Array(numParticles).fill(INT32_MAX);
  const bestDistSBA = new StorageBufferAttribute(bestDistInit, 1);

  // Wrap input SBAs as storage nodes (flat float access — itemSize=1, no vec4 padding).
  const bvhBuf = storage(bvhNodesSBA, 'float', numNodes * 8);
  // Escape pointers (#897 F4.3b): skipBuf[i] = first preorder node outside
  // node i's subtree; root escapes to numNodes (terminate sentinel).
  const skipBuf = storage(bvhSkipSBA, 'uint', numNodes);
  const triVertBuf = storage(triVertsSBA, 'float', numTris * 9);
  const triNormBuf = storage(triNormalsSBA, 'float', numTris * 3);
  // Pseudonormal buffers for closest-feature inside/outside sign (Task 3).
  // Layout: triIdx*9 + featureIdx*3 = {AB=0,BC=1,CA=2}×xyz for edges;
  //         triIdx*9 + vertexIdx*3 = {A=0,B=1,C=2}×xyz for vertices.
  const edgePseudoBuf = storage(edgePseudoSBA, 'float', numTris * 9);
  const vertexPseudoBuf = storage(vertexPseudoSBA, 'float', numTris * 9);

  // Atomic scratch — array<atomic<i32>> binding with read_write access is what
  // makes the atomic-emulation pattern work (sidesteps the outer-toVar /
  // storage-derived codegen pitfall described in the file-header rationale).
  const bestDistBuf = makeAtomicStorage(bestDistSBA, 'int', numParticles);

  const uMargin = uniform(margin);
  const uFriction = uniform(friction);
  const uDistScale = uniform(DIST_PACK_SCALE);
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
  // triangle compute distance, pack (distQ<<TRI_BITS | triIdx) into a composite
  // key, and atomicMin that key on bestDistBuf[i] (no separate index store).
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
                    // (atomicMin) inside nested Ifs DO propagate
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
                        // degenerado envenenaría el atomicMin con un mínimo fantasma.
                        // distClamped acota a 2.0m (distQ ∈ [0,8190]). NaN ≠ NaN ⇒ equal(self) falso.
                        // TSL select(cond, ifTrue, ifFalse) — cond va PRIMERO
                        // (ConditionalNode), orden opuesto al select(f, t, cond) de WGSL.
                        const distFloat = dot.abs();
                        const distClamped = distFloat.min(float(2.0));
                        // Composite key: distQ in the high bits, triIdx in the low
                        // TRI_BITS, so atomicMin selects min distance then LOWEST triIdx
                        // on ties — order-independent (#921 Eje A). NaN guard
                        // (NaN ≠ NaN ⇒ equal(self) false) maps to the sentinel so a
                        // degenerate triangle never wins.
                        const distQ = int(distClamped.mul(uDistScale));
                        const key = select(
                          distFloat.equal(distFloat),
                          // greaterThanEqual/lessThanEqual/bit-ops missing from @types/three at runtime.
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          (distQ as any).shiftLeft(int(TRI_BITS)).bitOr(int(triIdx)),
                          int(INT32_MAX),
                        );
                        atomicMin(bestDistBuf.element(i), key);
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

                      // Min of the three edge dsq, sqrt'd, packed + atomicMin'd.
                      // §9 cand. 5+6 (#897 F2): mismo guard que la rama
                      // inside-projection — NaN→i32 es UB en WGSL; distClamped acota
                      // a 2.0m (distQ ∈ [0,8190]). NaN ≠ NaN ⇒ equal(self) falso.
                      const minEdgeDsq = dsqAB.min(dsqAC).min(dsqBC);
                      const distFloat = minEdgeDsq.sqrt();
                      const distClamped = distFloat.min(float(2.0));
                      // Composite key — same packing as the inside-projection branch
                      // (#921 Eje A): min distance, then lowest triIdx on ties.
                      const distQ = int(distClamped.mul(uDistScale));
                      const key = select(
                        distFloat.equal(distFloat),
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (distQ as any).shiftLeft(int(TRI_BITS)).bitOr(int(triIdx)),
                        int(INT32_MAX),
                      );
                      atomicMin(bestDistBuf.element(i), key);
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
  // Per particle: atomicLoad the composite key from bestDistBuf; if a contact was
  // recorded (key < sentinel), decode triIdx and re-read the winning triangle,
  // compute SIDE, push, friction. Always reset atomic scratch for next substep.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyPushFn = (Fn as any)(() => {
    const i = instanceIndex;
    const w = invMassBuf.element(i);

    // Atomic load at function-top — direct WGSL atomicLoad call, not a nested
    // toVar.assign(storage_read). Safe per the codegen analysis in the design
    // doc referenced at the top of this file.
    const bestKeyLoaded = atomicLoad(bestDistBuf.element(i));

    // key < sentinel ⇒ a contact was recorded. Decode triIdx from the low TRI_BITS
    // (#921 Eje A — bestDistBuf holds the composite key, not a raw distance).
    If(w.greaterThan(float(0.0)).and(bestKeyLoaded.lessThan(int(INT32_MAX))), () => {
      const px = posBuf.element(i).x.toVar('apx');
      const py = posBuf.element(i).y.toVar('apy');
      const pz = posBuf.element(i).z.toVar('apz');

      // Re-read winning triangle's vertices + normal via dynamic indexing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const triIdxU = uint((bestKeyLoaded as any).bitAnd(int(TRI_MASK)));
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
      // Base offset into the pseudonormal buffers for this triangle.
      // Both edge and vertex buffers are laid out as triIdx*9 + featureIdx*3.
      const tpBase = triIdxU.mul(uint(9));

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
          // For each branch, derive bestSide from the closest-feature pseudonormal
          // instead of the face normal — mirrors CPU triangleCollision.ts (55d882b3):
          //   t ≤ EPS_VERT → start-vertex pseudonormal
          //   t ≥ 1-EPS_VERT → end-vertex pseudonormal
          //   otherwise → edge-interior pseudonormal
          // Edge→builder-index: AB=0 (offsets 0-2), BC=1 (3-5), CA=2 (6-8).
          // Vertex order: A=0 (offsets 0-2), B=1 (3-5), C=2 (6-8).
          // greaterThanEqual/lessThanEqual missing from @types/three at runtime.
          If(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (dsqAB as any).lessThanEqual(dsqAC)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .and((dsqAB as any).lessThanEqual(dsqBC)),
            () => {
              // Edge AB (builder index 0): t≈0 → A(0), t≈1 → B(1), else edge 0.
              bestDist.assign(dsqAB.sqrt());
              const snABx = float(0).toVar('snABx');
              const snABy = float(0).toVar('snABy');
              const snABz = float(0).toVar('snABz');
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              If((tAB as any).lessThanEqual(float(1e-6)), () => {
                // t ≈ 0 → vertex A (offset 0)
                snABx.assign(vertexPseudoBuf.element(tpBase));
                snABy.assign(vertexPseudoBuf.element(tpBase.add(uint(1))));
                snABz.assign(vertexPseudoBuf.element(tpBase.add(uint(2))));
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              }).ElseIf((tAB as any).greaterThanEqual(float(1 - 1e-6)), () => {
                // t ≈ 1 → vertex B (offset 3)
                snABx.assign(vertexPseudoBuf.element(tpBase.add(uint(3))));
                snABy.assign(vertexPseudoBuf.element(tpBase.add(uint(4))));
                snABz.assign(vertexPseudoBuf.element(tpBase.add(uint(5))));
              }).Else(() => {
                // edge interior → edge AB (offset 0)
                snABx.assign(edgePseudoBuf.element(tpBase));
                snABy.assign(edgePseudoBuf.element(tpBase.add(uint(1))));
                snABz.assign(edgePseudoBuf.element(tpBase.add(uint(2))));
              });
              bestSide.assign(dABx.mul(snABx).add(dABy.mul(snABy)).add(dABz.mul(snABz)));
            },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ).ElseIf((dsqAC as any).lessThanEqual(dsqBC), () => {
            // Edge AC/CA (builder index 2): t≈0 → A(0), t≈1 → C(2), else edge 2.
            bestDist.assign(dsqAC.sqrt());
            const snACx = float(0).toVar('snACx');
            const snACy = float(0).toVar('snACy');
            const snACz = float(0).toVar('snACz');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            If((tAC as any).lessThanEqual(float(1e-6)), () => {
              // t ≈ 0 → vertex A (offset 0)
              snACx.assign(vertexPseudoBuf.element(tpBase));
              snACy.assign(vertexPseudoBuf.element(tpBase.add(uint(1))));
              snACz.assign(vertexPseudoBuf.element(tpBase.add(uint(2))));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }).ElseIf((tAC as any).greaterThanEqual(float(1 - 1e-6)), () => {
              // t ≈ 1 → vertex C (offset 6)
              snACx.assign(vertexPseudoBuf.element(tpBase.add(uint(6))));
              snACy.assign(vertexPseudoBuf.element(tpBase.add(uint(7))));
              snACz.assign(vertexPseudoBuf.element(tpBase.add(uint(8))));
            }).Else(() => {
              // edge interior → edge CA (offset 6)
              snACx.assign(edgePseudoBuf.element(tpBase.add(uint(6))));
              snACy.assign(edgePseudoBuf.element(tpBase.add(uint(7))));
              snACz.assign(edgePseudoBuf.element(tpBase.add(uint(8))));
            });
            bestSide.assign(dACx.mul(snACx).add(dACy.mul(snACy)).add(dACz.mul(snACz)));
          }).Else(() => {
            // Edge BC (builder index 1): t≈0 → B(1), t≈1 → C(2), else edge 1.
            bestDist.assign(dsqBC.sqrt());
            const snBCx = float(0).toVar('snBCx');
            const snBCy = float(0).toVar('snBCy');
            const snBCz = float(0).toVar('snBCz');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            If((tBC as any).lessThanEqual(float(1e-6)), () => {
              // t ≈ 0 → vertex B (offset 3)
              snBCx.assign(vertexPseudoBuf.element(tpBase.add(uint(3))));
              snBCy.assign(vertexPseudoBuf.element(tpBase.add(uint(4))));
              snBCz.assign(vertexPseudoBuf.element(tpBase.add(uint(5))));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }).ElseIf((tBC as any).greaterThanEqual(float(1 - 1e-6)), () => {
              // t ≈ 1 → vertex C (offset 6)
              snBCx.assign(vertexPseudoBuf.element(tpBase.add(uint(6))));
              snBCy.assign(vertexPseudoBuf.element(tpBase.add(uint(7))));
              snBCz.assign(vertexPseudoBuf.element(tpBase.add(uint(8))));
            }).Else(() => {
              // edge interior → edge BC (offset 3)
              snBCx.assign(edgePseudoBuf.element(tpBase.add(uint(3))));
              snBCy.assign(edgePseudoBuf.element(tpBase.add(uint(4))));
              snBCz.assign(edgePseudoBuf.element(tpBase.add(uint(5))));
            });
            bestSide.assign(dBCx.mul(snBCx).add(dBCy.mul(snBCy)).add(dBCz.mul(snBCz)));
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

          // Hybrid Coulomb friction with stiction (#902) — mirror of CPU
          // triangleCollision.ts. scale = min(1, max(friction, friction*pushDist/|t|)).
          // max(friction, …) keeps the old kinetic floor so the garment holds during
          // the high-motion settling phase; the depth-budgeted Coulomb term raises
          // scale → 1 as motion slows (stiction at rest → no creep). scale ∈
          // [friction, 1] → PBD-safe. Div-guard branch-free via max(|t|, 1e-8).
          If(uFriction.greaterThan(float(0)), () => {
            const dx = posBuf.element(i).x.sub(prevPosBuf.element(i).x);
            const dy = posBuf.element(i).y.sub(prevPosBuf.element(i).y);
            const dz = posBuf.element(i).z.sub(prevPosBuf.element(i).z);

            const vn = dx.mul(nnx).add(dy.mul(nny)).add(dz.mul(nnz));
            const tx = dx.sub(vn.mul(nnx));
            const ty = dy.sub(vn.mul(nny));
            const tz = dz.sub(vn.mul(nnz));

            const tLen = tx.mul(tx).add(ty.mul(ty)).add(tz.mul(tz)).sqrt();
            const scale = uFriction.mul(pushDist).div(tLen.max(float(1e-8))).max(uFriction).min(float(1.0));

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
      // Release the per-body atomic scratch SBA captured by closure. This is
      // the only SBA created inside the factory; bvh/triVerts/triNormals are
      // caller-owned. Routes through `disposeStorageBufferAttribute` for the
      // same renderer-routing rationale documented in tslBuffers.ts.
      disposeStorageBufferAttribute(bestDistSBA, renderer);
    },
  };
}

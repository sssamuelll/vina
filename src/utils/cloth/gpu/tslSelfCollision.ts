/**
 * TSL Self-Collision — atomic i32 accumulation for race-free self-collision on GPU.
 *
 * Creates StorageBufferAttributes for the spatial hash + correction buffers,
 * and compute()-wrapped TSL nodes for the 4-pass fixed-capacity-bucket
 * pipeline (#897 F3, H-BP1 redesign — replaces the 5-pass counting-sort
 * layout whose SERIAL prefix-sum pass ran 1 GPU thread × tableSize iterations
 * per substep: 180-900ms/frame at María scale, dead-on-arrival for ≥30fps).
 *
 * Pipeline passes (the FULL sequence must run EVERY substep — cellClear
 * resets the counters scatter accumulates into):
 *   1. cellClear — atomicStore 0 into every cellCount      (dispatch: tableSize)
 *   2. scatter   — hash particle pos → cell h; claim slot via
 *                  atomicAdd(cellCount[h], 1); write particle index into
 *                  cellEntries[h*K + slot] if slot < K     (dispatch: N)
 *   3. resolve   — detect pairs in the 27-cell neighborhood, atomicAdd
 *                  i32 fixed-point corrections             (dispatch: N)
 *   4. apply     — drain deltas, average, apply to positions, reset
 *                  delta/corrCount                         (dispatch: N)
 *
 * cellEntries is tableSize × CELL_CAPACITY: no prefix sum, no cellStart, no
 * separate count pass. Cells with more than CELL_CAPACITY particles truncate
 * candidates (ratified divergence vs unbounded CPU/WASM — see CELL_CAPACITY).
 *
 * Adjacency is pre-uploaded (CSR flat list + offsets) to skip connected neighbors.
 *
 * Race-free: resolve uses atomicAdd on i32 delta buffers (scaled by 1e6)
 * for BOTH particles in each pair. No direct position writes in resolve pass.
 *
 * @module tslSelfCollision
 */

import { StorageBufferAttribute } from 'three/webgpu';
import {
  Fn,
  storage,
  compute,
  uniform,
  instanceIndex,
  uint,
  int,
  float,
  If,
  Loop,
  atomicAdd,
  atomicLoad,
  atomicStore,
} from 'three/tsl';
import type ComputeNode from 'three/src/nodes/gpgpu/ComputeNode.js';
import { makeAtomicStorage } from './atomicStorage';
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SelfCollisionBufferSet {
  // Spatial hash (fixed-capacity buckets)
  cellCountSBA: StorageBufferAttribute;   // Uint32Array, tableSize (atomic)
  cellEntriesSBA: StorageBufferAttribute; // Uint32Array, tableSize * CELL_CAPACITY

  // Adjacency (CSR)
  adjOffsetsSBA: StorageBufferAttribute;  // Uint32Array, numParticles+1
  adjNeighborsSBA: StorageBufferAttribute; // Uint32Array, totalNeighbors

  // Atomic correction buffers
  deltaSBA: StorageBufferAttribute;       // Int32Array, numParticles*3
  corrCountSBA: StorageBufferAttribute;   // Uint32Array, numParticles

  // Metadata
  tableSize: number;
  numParticles: number;
}

/**
 * The 4 compute()-wrapped nodes of the bucket pipeline, ready for
 * `renderer.compute(node)` dispatch. Dispatch counts are baked in:
 * [tableSize, N, N, N] with [64] workgroups (module convention — same as
 * tslSolver / tslWind / tslBrush).
 */
export interface SelfCollisionComputeNodes {
  /** Zero cellCount — MUST run every substep before scatter (dispatch: tableSize) */
  cellClearNode: ComputeNode;
  /** Hash particles into fixed-capacity cell buckets (dispatch: numParticles) */
  scatterNode: ComputeNode;
  /** Pair detection + atomic i32 correction accumulation (dispatch: numParticles) */
  resolveNode: ComputeNode;
  /** Average + apply corrections, reset delta/corrCount (dispatch: numParticles) */
  applyNode: ComputeNode;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Capacidad por celda. 27 celdas × 8 = 216 candidatos/partícula máximo.
 *  A 5mm de spacing con celda = thickness (2mm), >8 partículas/celda solo
 *  ocurre en interpenetración masiva — truncar ahí es aceptable (divergencia
 *  ratificada vs CPU/WASM unbounded; plan B: port Blelloch del WGSL legacy).
 *  Sustituye al prefix-sum serial: 1 hilo × ~59k iter × 15 substeps era
 *  180-900ms/frame — inviable para el DoD ≥30fps (#897 H-BP1). */
export const CELL_CAPACITY = 8;

/**
 * Fixed-point scale for atomic<i32> accumulation (WGSL has no atomic<f32>).
 * Matches COLLISION_SCALE in selfCollision.wgsl.
 * Precision: 1e-6. Overflow: safe for up to ~2100 collisions per particle.
 */
const COLLISION_SCALE = 1000000.0;

/**
 * Hash primes for spatial hashing (Müller "Ten Minute Physics").
 * These must match the constants in selfCollision.wgsl.
 */
const HASH_PRIME_X = 92837111;
const HASH_PRIME_Y = 689287499;
const HASH_PRIME_Z = 283923481;

/**
 * Maximum adjacency neighbors to check per particle.
 * Prevents infinite loops in the generated WGSL — TSL Loop needs a
 * compile-time upper bound for variable-count loops.
 */
const MAX_ADJ_NEIGHBORS = 64;

// ─── Buffer Factory ─────────────────────────────────────────────────────────

/**
 * Create all StorageBufferAttributes for TSL self-collision.
 */
export function createSelfCollisionBuffers(
  numParticles: number,
  tableSize: number,
  adjacencyOffsets: Uint32Array,
  adjacencyNeighbors: Uint32Array,
): SelfCollisionBufferSet {
  return {
    cellCountSBA: new StorageBufferAttribute(new Uint32Array(tableSize), 1),
    cellEntriesSBA: new StorageBufferAttribute(
      new Uint32Array(tableSize * CELL_CAPACITY),
      1,
    ),
    adjOffsetsSBA: new StorageBufferAttribute(new Uint32Array(adjacencyOffsets), 1),
    // Copy the neighbor DATA — `new Uint32Array(length)` allocates zeros and
    // silently breaks adjacency exclusion (every lookup misses). Empty
    // adjacency still needs a 1-element buffer: WGSL forbids zero-sized
    // storage bindings.
    adjNeighborsSBA: new StorageBufferAttribute(
      adjacencyNeighbors.length > 0 ? new Uint32Array(adjacencyNeighbors) : new Uint32Array(1),
      1,
    ),
    deltaSBA: new StorageBufferAttribute(new Int32Array(numParticles * 3), 1),
    corrCountSBA: new StorageBufferAttribute(new Uint32Array(numParticles), 1),
    tableSize,
    numParticles,
  };
}

/**
 * Release the GPU buffers backing a SelfCollisionBufferSet.
 *
 * Three.js 0.183's `StorageBufferAttribute` has no `dispose()` — the underlying
 * `GPUBuffer` lives on `renderer.backend.get(attr).buffer`. Passing the
 * `WebGPURenderer` lets us route through `renderer._attributes.delete(attr)`
 * which calls `backend.destroyAttribute(attr)` → `data.buffer.destroy()`. When
 * `renderer` is omitted (e.g. dispose() ran before any frame consumed these
 * SBAs), this is a no-op — the SBAs become GC-eligible once the caller drops
 * its references but the GPUBuffer is not actively freed.
 */
export function destroySelfCollisionBuffers(
  buffers: SelfCollisionBufferSet,
  renderer?: unknown,
): void {
  if (!renderer) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const attrs = (renderer as any)?._attributes;
  if (!attrs || typeof attrs.delete !== 'function') return;
  const sbas: StorageBufferAttribute[] = [
    buffers.cellCountSBA,
    buffers.cellEntriesSBA,
    buffers.adjOffsetsSBA,
    buffers.adjNeighborsSBA,
    buffers.deltaSBA,
    buffers.corrCountSBA,
  ];
  for (const sba of sbas) {
    try {
      attrs.delete(sba);
    } catch {
      // best-effort: dispose paths must not throw
    }
  }
}

// ─── Compute Node Factory ───────────────────────────────────────────────────

/**
 * Create the 4 compute()-wrapped TSL nodes for the bucket self-collision
 * pipeline. Dispatch ALL FOUR per substep, in order: cellClear → scatter →
 * resolve → apply.
 *
 * @param positionBufNode  - Cloth particle positions (vec3 storage, shared with solver)
 * @param invMassBufNode   - Inverse mass per particle (float storage, 0 = pinned)
 * @param buffers          - Self-collision buffer set from createSelfCollisionBuffers()
 * @param thickness        - Cloth thickness in meters (cell size for spatial hash)
 */
export function makeSelfCollisionComputeNodes(
  positionBufNode: TslNode,
  invMassBufNode: TslNode,
  buffers: SelfCollisionBufferSet,
  thickness: number,
): SelfCollisionComputeNodes {
  const N = buffers.numParticles;
  const T = buffers.tableSize;
  const adjNeighborCount = buffers.adjNeighborsSBA.array.length;

  // ─── Wrap SBAs as TSL storage nodes ──────────────────────────────
  // cellCount/delta/corrCount need atomic access for atomicAdd/atomicStore.
  const cellCountBuf = makeAtomicStorage(buffers.cellCountSBA, 'int', T);
  const cellEntriesBuf = storage(buffers.cellEntriesSBA, 'uint', T * CELL_CAPACITY);
  const adjOffsetsBuf = storage(buffers.adjOffsetsSBA, 'uint', N + 1);
  const adjNeighborsBuf = storage(buffers.adjNeighborsSBA, 'uint', adjNeighborCount);
  const deltaBuf = makeAtomicStorage(buffers.deltaSBA, 'int', N * 3);
  const corrCountBuf = makeAtomicStorage(buffers.corrCountSBA, 'int', N);

  // ─── Uniforms ────────────────────────────────────────────────────
  const uNumParticles = uniform(N);
  const uTableSize = uniform(T);
  const uThickness = uniform(thickness);

  // ─── Pass 1: cellClear ───────────────────────────────────────────
  // Zero cellCount so scatter's atomicAdd starts from 0. MUST run every
  // substep before scatter — there is no other reset (the legacy 5-pass
  // layout reset counters inside prefixSum; buckets have no such pass).
  // Dispatch: tableSize cells.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cellClearFn = (Fn as any)(() => {
    const i = instanceIndex;

    If(uint(i).lessThan(uint(uTableSize)), () => {
      // toVar() forces explicit i32 in WGSL — bare int(0) emits AbstractInt
      // which some WebGPU implementations reject for atomicStore (same
      // idiom as makeNormalZeroFn in tslSolver.ts).
      atomicStore(cellCountBuf.element(i), int(0).toVar());
    });
  })();
  const cellClearNode = compute(cellClearFn, T, [64]);

  // ─── Pass 2: scatter ─────────────────────────────────────────────
  // Hash each particle position to a cell, claim a slot via atomicAdd, and
  // write the particle index into the cell's fixed-capacity bucket. Slots
  // beyond CELL_CAPACITY are truncated (counter keeps counting; the write
  // is skipped). Dispatch: N particles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scatterFn = (Fn as any)(() => {
    const i = instanceIndex;

    If(uint(i).lessThan(uint(uNumParticles)), () => {
      const invCS = float(1.0).div(uThickness);

      // Read position as vec3
      const pos = positionBufNode.element(i);

      // intCoord: floor(v * invCellSize) → int
      const xi = int(pos.x.mul(invCS).floor());
      const yi = int(pos.y.mul(invCS).floor());
      const zi = int(pos.z.mul(invCS).floor());

      // hashCoords: ((xi * P1) ^ (yi * P2) ^ (zi * P3)) % tableSize
      const rawHash = xi.mul(int(HASH_PRIME_X))
        .bitXor(yi.mul(int(HASH_PRIME_Y)))
        .bitXor(zi.mul(int(HASH_PRIME_Z)));
      const tSize = int(uTableSize);
      // .mod, no .modInt: ambos operandos ya son i32, emite el mismo `%`
      // WGSL bit-idéntico; modInt está deprecado desde three r175.
      const modded = rawHash.mod(tSize);
      // Ensure non-negative: if modded < 0, add tableSize
      const hVar = uint(0).toVar('hScatter');
      If(modded.lessThan(int(0)), () => {
        hVar.assign(uint(modded.add(tSize)));
      }).Else(() => {
        hVar.assign(uint(modded));
      });

      // atomicAdd returns the OLD value (= the claimed slot) as i32 — same
      // old-value contract tslCollision.ts relies on for atomicMin. toVar()
      // materializes it so the two uses below don't re-emit the atomic op.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slot = (atomicAdd(cellCountBuf.element(hVar), int(1)) as any).toVar('slot');
      If(slot.lessThan(int(CELL_CAPACITY)), () => {
        // Inside this branch slot ∈ [0, CELL_CAPACITY) → i32→u32 cast is
        // safe; index math stays in uint like every entries access.
        cellEntriesBuf
          .element(hVar.mul(uint(CELL_CAPACITY)).add(uint(slot)))
          .assign(uint(i));
      });
    });
  })();
  const scatterNode = compute(scatterFn, N, [64]);

  // ─── Pass 3: resolveCollisions ───────────────────────────────────
  // For each particle, query 27 neighbor cells. For each pair (i<j),
  // compute correction and atomicAdd to delta buffers.
  // Dispatch: N particles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveFn = (Fn as any)(() => {
    const i = instanceIndex;

    If(uint(i).lessThan(uint(uNumParticles)), () => {
      const wi = invMassBufNode.element(i);

      If(wi.greaterThan(float(0.0)), () => {
        const invCS = float(1.0).div(uThickness);

        // Read position as vec3
        const pos = positionBufNode.element(i);
        const px = pos.x.toVar('rpx');
        const py = pos.y.toVar('rpy');
        const pz = pos.z.toVar('rpz');

        // Cell coordinates minus 1 (to iterate 27 neighbors)
        const xi0 = int(px.mul(invCS).floor()).sub(int(1));
        const yi0 = int(py.mul(invCS).floor()).sub(int(1));
        const zi0 = int(pz.mul(invCS).floor()).sub(int(1));

        const thickSq = uThickness.mul(uThickness);
        const iIdx3 = uint(i).mul(uint(3));

        // Triple nested loop: 3x3x3 = 27 neighbor cells
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Loop({ start: int(0), end: int(3), type: 'int', condition: '<' }, ({ i: dxi }: { i: any }) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          Loop({ start: int(0), end: int(3), type: 'int', condition: '<' }, ({ i: dyi }: { i: any }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            Loop({ start: int(0), end: int(3), type: 'int', condition: '<' }, ({ i: dzi }: { i: any }) => {
              // Hash the neighbor cell
              const cxi = xi0.add(dxi);
              const cyi = yi0.add(dyi);
              const czi = zi0.add(dzi);

              const rawHash = cxi.mul(int(HASH_PRIME_X))
                .bitXor(cyi.mul(int(HASH_PRIME_Y)))
                .bitXor(czi.mul(int(HASH_PRIME_Z)));
              const tSize = int(uTableSize);
              // .mod, no .modInt — mismo razonamiento que en scatter.
              const modded = rawHash.mod(tSize);
              // Compute hash: handle negative modulo
              const hVar = uint(0).toVar('hResolve');
              If(modded.lessThan(int(0)), () => {
                hVar.assign(uint(modded.add(tSize)));
              }).Else(() => {
                hVar.assign(uint(modded));
              });

              // Bucket iteration: clamp to CELL_CAPACITY — the counter keeps
              // counting past the bucket (scatter truncates writes, not the
              // count), so entries beyond K-1 don't exist.
              // atomicLoad required because cellCountBuf is array<atomic<i32>> (#554).
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const cellCount = (uint(atomicLoad(cellCountBuf.element(hVar))) as any)
                .min(uint(CELL_CAPACITY));
              const entriesBase = hVar.mul(uint(CELL_CAPACITY));

              // Iterate entries in this cell's bucket
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Loop({ start: uint(0), end: cellCount, type: 'uint', condition: '<' }, ({ i: ki }: { i: any }) => {
                const j = cellEntriesBuf.element(entriesBase.add(ki));

                // Only process pairs where j > i to avoid duplicates
                If(j.greaterThan(uint(i)), () => {
                  const wj = invMassBufNode.element(j);

                  If(wj.greaterThan(float(0.0)), () => {
                    // ─── Adjacency check (inline) ──────────────────
                    // Check if particles i and j are mesh-adjacent (skip if so)
                    const adjStart = adjOffsetsBuf.element(uint(i));
                    const adjEnd = adjOffsetsBuf.element(uint(i).add(uint(1)));
                    const isAdj = int(0).toVar('isAdj');

                    // Loop through adjacency list with fixed max bound
                    const adjCount = adjEnd.sub(adjStart);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    Loop({ start: uint(0), end: (adjCount as any).min(uint(MAX_ADJ_NEIGHBORS)), type: 'uint', condition: '<' }, ({ i: ak }: { i: any }) => {
                      const neighbor = adjNeighborsBuf.element(adjStart.add(ak));
                      If(neighbor.equal(j), () => {
                        isAdj.assign(int(1));
                      });
                    });

                    If(isAdj.equal(int(0)), () => {
                      // ─── Distance check ──────────────────────────
                      const posJ = positionBufNode.element(j);
                      const dx = px.sub(posJ.x);
                      const dy = py.sub(posJ.y);
                      const dz = pz.sub(posJ.z);
                      const dist2 = dx.mul(dx).add(dy.mul(dy)).add(dz.mul(dz));

                      If(dist2.lessThan(thickSq).and(dist2.greaterThanEqual(float(1e-12))), () => {
                        const dist = dist2.sqrt();
                        const invDist = float(1.0).div(dist);
                        const nx = dx.mul(invDist);
                        const ny = dy.mul(invDist);
                        const nz = dz.mul(invDist);

                        const wSum = wi.add(wj);
                        const corr = uThickness.sub(dist).div(wSum);
                        const scale = float(COLLISION_SCALE);

                        // Particle i: pushed in +n direction
                        const ciX = int(nx.mul(corr).mul(wi).mul(scale));
                        const ciY = int(ny.mul(corr).mul(wi).mul(scale));
                        const ciZ = int(nz.mul(corr).mul(wi).mul(scale));

                        atomicAdd(deltaBuf.element(iIdx3), ciX);
                        atomicAdd(deltaBuf.element(iIdx3.add(uint(1))), ciY);
                        atomicAdd(deltaBuf.element(iIdx3.add(uint(2))), ciZ);
                        atomicAdd(corrCountBuf.element(uint(i)), int(1));

                        // Particle j: pushed in -n direction
                        const jIdx3 = j.mul(uint(3));
                        const cjX = int(nx.negate().mul(corr).mul(wj).mul(scale));
                        const cjY = int(ny.negate().mul(corr).mul(wj).mul(scale));
                        const cjZ = int(nz.negate().mul(corr).mul(wj).mul(scale));

                        atomicAdd(deltaBuf.element(jIdx3), cjX);
                        atomicAdd(deltaBuf.element(jIdx3.add(uint(1))), cjY);
                        atomicAdd(deltaBuf.element(jIdx3.add(uint(2))), cjZ);
                        atomicAdd(corrCountBuf.element(j), int(1));
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  })();
  const resolveNode = compute(resolveFn, N, [64]);

  // ─── Pass 4: applyCorrections ────────────────────────────────────
  // Drain atomic deltas, average by correction count, add to positions.
  // Always reset buffers for next substep.
  // Dispatch: N particles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFn = (Fn as any)(() => {
    const i = instanceIndex;

    If(uint(i).lessThan(uint(uNumParticles)), () => {
      const idx3 = uint(i).mul(uint(3));
      // atomicLoad required because corrCountBuf and deltaBuf are
      // array<atomic<i32>> (post-`.setAtomic(true)` for #554 fix). WGSL spec
      // requires atomicLoad for atomic<T> access even in read-only contexts.
      // Previous note ("TSL doesn't export atomicLoad") was outdated —
      // verified Three.TSL.js:63 exports atomicLoad in three@0.183.2.
      const count = atomicLoad(corrCountBuf.element(uint(i)));

      If(int(count).greaterThan(int(0)), () => {
        const invScale = float(1.0).div(float(count).mul(float(COLLISION_SCALE)));

        const dx = float(atomicLoad(deltaBuf.element(idx3))).mul(invScale);
        const dy = float(atomicLoad(deltaBuf.element(idx3.add(uint(1))))).mul(invScale);
        const dz = float(atomicLoad(deltaBuf.element(idx3.add(uint(2))))).mul(invScale);

        positionBufNode.element(i).x.addAssign(dx);
        positionBufNode.element(i).y.addAssign(dy);
        positionBufNode.element(i).z.addAssign(dz);
      });

      // Reset for next substep — always, even if count == 0
      const zeroI32 = int(0).toVar();
      atomicStore(deltaBuf.element(idx3), zeroI32);
      atomicStore(deltaBuf.element(idx3.add(uint(1))), zeroI32);
      atomicStore(deltaBuf.element(idx3.add(uint(2))), zeroI32);
      atomicStore(corrCountBuf.element(uint(i)), zeroI32);
    });
  })();
  const applyNode = compute(applyFn, N, [64]);

  return {
    cellClearNode,
    scatterNode,
    resolveNode,
    applyNode,
  };
}

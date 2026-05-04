/**
 * TSL Self-Collision — atomic i32 accumulation for race-free self-collision on GPU.
 *
 * Creates StorageBufferAttributes for the spatial hash + correction buffers,
 * and TSL Fn() compute nodes for the 5-pass pipeline.
 *
 * Pipeline passes:
 *   1. hashCount    — hash particle position to cell, atomicAdd cellCount
 *   2. prefixSum    — serial exclusive prefix sum over cellCount → cellStart
 *   3. scatter      — scatter particle indices into cellEntries via cellStart + atomicAdd
 *   4. resolve      — detect pairs in 27-cell neighborhood, atomicAdd i32 corrections
 *   5. apply        — drain deltas, average, apply to positions, reset buffers
 *
 * Adjacency is pre-uploaded (CSR flat list + offsets) to skip connected neighbors.
 *
 * Race-free: resolveCollisions uses atomicAdd on i32 delta buffers (scaled by 1e6)
 * for BOTH particles in each pair. No direct position writes in resolve pass.
 *
 * @module tslSelfCollision
 */

import { StorageBufferAttribute } from 'three/webgpu';
import {
  Fn,
  storage,
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
// TSL node types vary across @types/three versions; use loose types for stability.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TslNode = any;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SelfCollisionBufferSet {
  // Spatial hash
  cellCountSBA: StorageBufferAttribute;   // Uint32Array, tableSize
  cellStartSBA: StorageBufferAttribute;   // Uint32Array, tableSize
  cellEntriesSBA: StorageBufferAttribute; // Uint32Array, numParticles

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

export interface SelfCollisionComputeNodes {
  /** TSL node returned by Fn(...)() — typed loosely because Fn is cast to any for void-returning compute kernels */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hashCountNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prefixSumNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scatterNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  resolveNode: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  applyNode: any;
}

// ─── Constants ──────────────────────────────────────────────────────────────

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
    cellStartSBA: new StorageBufferAttribute(new Uint32Array(tableSize), 1),
    cellEntriesSBA: new StorageBufferAttribute(new Uint32Array(numParticles), 1),
    adjOffsetsSBA: new StorageBufferAttribute(new Uint32Array(adjacencyOffsets), 1),
    adjNeighborsSBA: new StorageBufferAttribute(
      new Uint32Array(Math.max(adjacencyNeighbors.length, 1)),
      1,
    ),
    deltaSBA: new StorageBufferAttribute(new Int32Array(numParticles * 3), 1),
    corrCountSBA: new StorageBufferAttribute(new Uint32Array(numParticles), 1),
    tableSize,
    numParticles,
  };
}

// ─── Compute Node Factory ───────────────────────────────────────────────────

/**
 * Create the 5 TSL Fn() compute nodes for the self-collision pipeline.
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
  // `'int' as any` works around @types/three lacking 'int' in storage() type;
  // `as any` on the storage(...) result calls .setAtomic(true) which @types/three
  // mistypes as `setAtmoic` (typo). Both casts required per #554 fix.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const cellCountBuf = (storage(buffers.cellCountSBA, 'int' as any, T) as any).setAtomic(true);
  const cellStartBuf = storage(buffers.cellStartSBA, 'uint', T);
  const cellEntriesBuf = storage(buffers.cellEntriesSBA, 'uint', N);
  const adjOffsetsBuf = storage(buffers.adjOffsetsSBA, 'uint', N + 1);
  const adjNeighborsBuf = storage(buffers.adjNeighborsSBA, 'uint', adjNeighborCount);
  const deltaBuf = (storage(buffers.deltaSBA, 'int' as any, N * 3) as any).setAtomic(true);
  const corrCountBuf = (storage(buffers.corrCountSBA, 'int' as any, N) as any).setAtomic(true);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ─── Uniforms ────────────────────────────────────────────────────
  const uNumParticles = uniform(N);
  const uTableSize = uniform(T);
  const uThickness = uniform(thickness);

  // ─── Pass 1: hashCount ───────────────────────────────────────────
  // Hash each particle position to a cell, atomicAdd cellCount.
  // Dispatch: N particles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hashCountNode = (Fn as any)(() => {
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
      const modded = rawHash.modInt(tSize);
      // Ensure non-negative: if modded < 0, add tableSize
      const h = If(modded.lessThan(int(0)), () => {
        const hVal = uint(modded.add(tSize)).toVar('hVal1');
        atomicAdd(cellCountBuf.element(hVal), int(1));
      }).Else(() => {
        const hVal = uint(modded).toVar('hVal2');
        atomicAdd(cellCountBuf.element(hVal), int(1));
      });
      void h;
    });
  })();

  // ─── Pass 2: prefixSum ───────────────────────────────────────────
  // Serial exclusive prefix sum over cellCount → cellStart.
  // Dispatch: 1 thread. Resets cellCount for the scatter pass.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prefixSumNode = (Fn as any)(() => {
    const runningSum = int(0).toVar('runningSum');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Loop(T, ({ i: cellIdx }: { i: any }) => {
      // atomicLoad required because cellCountBuf is array<atomic<i32>> (#554).
      const count = atomicLoad(cellCountBuf.element(cellIdx));
      cellStartBuf.element(cellIdx).assign(uint(runningSum));
      runningSum.addAssign(count);
      // Reset cellCount to 0 for scatter pass
      atomicStore(cellCountBuf.element(cellIdx), int(0).toVar());
    });
  })();

  // ─── Pass 3: scatter ─────────────────────────────────────────────
  // Each particle writes its index into cellEntries at the correct offset.
  // Dispatch: N particles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scatterNode = (Fn as any)(() => {
    const i = instanceIndex;

    If(uint(i).lessThan(uint(uNumParticles)), () => {
      const invCS = float(1.0).div(uThickness);

      const pos = positionBufNode.element(i);

      const xi = int(pos.x.mul(invCS).floor());
      const yi = int(pos.y.mul(invCS).floor());
      const zi = int(pos.z.mul(invCS).floor());

      const rawHash = xi.mul(int(HASH_PRIME_X))
        .bitXor(yi.mul(int(HASH_PRIME_Y)))
        .bitXor(zi.mul(int(HASH_PRIME_Z)));
      const tSize = int(uTableSize);
      const modded = rawHash.modInt(tSize);

      If(modded.lessThan(int(0)), () => {
        const h = uint(modded.add(tSize)).toVar('hScatter1');
        const offset = uint(atomicAdd(cellCountBuf.element(h), int(1)));
        cellEntriesBuf.element(cellStartBuf.element(h).add(offset)).assign(uint(i));
      }).Else(() => {
        const h = uint(modded).toVar('hScatter2');
        const offset = uint(atomicAdd(cellCountBuf.element(h), int(1)));
        cellEntriesBuf.element(cellStartBuf.element(h).add(offset)).assign(uint(i));
      });
    });
  })();

  // ─── Pass 4: resolveCollisions ───────────────────────────────────
  // For each particle, query 27 neighbor cells. For each pair (i<j),
  // compute correction and atomicAdd to delta buffers.
  // Dispatch: N particles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resolveNode = (Fn as any)(() => {
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
              const modded = rawHash.modInt(tSize);
              // Compute hash: handle negative modulo
              const hVar = uint(0).toVar('hResolve');
              If(modded.lessThan(int(0)), () => {
                hVar.assign(uint(modded.add(tSize)));
              }).Else(() => {
                hVar.assign(uint(modded));
              });

              const cellStart = cellStartBuf.element(hVar);
              // atomicLoad required because cellCountBuf is array<atomic<i32>> (#554).
              const cellCount = uint(atomicLoad(cellCountBuf.element(hVar)));

              // Iterate entries in this cell
              // Use a fixed max bound; break early via flag
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Loop({ start: uint(0), end: cellCount, type: 'uint', condition: '<' }, ({ i: ki }: { i: any }) => {
                const entryIdx = cellStart.add(ki);
                const j = cellEntriesBuf.element(entryIdx);

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

  // ─── Pass 5: applyCorrections ────────────────────────────────────
  // Drain atomic deltas, average by correction count, add to positions.
  // Always reset buffers for next substep.
  // Dispatch: N particles.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyNode = (Fn as any)(() => {
    const i = instanceIndex;

    If(uint(i).lessThan(uint(uNumParticles)), () => {
      const idx3 = uint(i).mul(uint(3));
      // atomicLoad required because corrCountBuf and deltaBuf are
      // array<atomic<i32>> (post-`.setAtomic(true)` for #554 fix). WGSL spec
      // requires atomicLoad for atomic<T> access even in read-only contexts.
      // Previous note ("TSL doesn't export atomicLoad") was outdated —
      // verified Three.TSL.js:63 exports atomicLoad in 0.183.2.
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

  return {
    hashCountNode,
    prefixSumNode,
    scatterNode,
    resolveNode,
    applyNode,
  };
}

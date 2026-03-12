/**
 * TSL Self-Collision — atomic i32 accumulation for race-free self-collision on GPU.
 *
 * Creates StorageBufferAttributes for the spatial hash + correction buffers,
 * and TSL Fn() compute nodes for the 5-pass pipeline.
 *
 * @module tslSelfCollision
 */

import { StorageBufferAttribute } from 'three/webgpu';

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

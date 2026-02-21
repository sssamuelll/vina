/**
 * Self-Collision Detection & Resolution for XPBD Cloth Solver
 *
 * Based on Matthias Müller's "Ten Minute Physics" spatial hashing approach.
 * Uses a spatial hash grid to efficiently find nearby particle pairs,
 * then pushes overlapping non-connected particles apart.
 *
 * @module selfCollision
 */

// ─── Adjacency ──────────────────────────────────────────────────────────────

/**
 * Build adjacency lookup: for each particle, the set of particles sharing a triangle.
 */
export function buildAdjacency(triIds: Int32Array, numParticles: number): Set<number>[] {
  const adj: Set<number>[] = new Array(numParticles);
  for (let i = 0; i < numParticles; i++) adj[i] = new Set();

  const numTris = triIds.length / 3;
  for (let t = 0; t < numTris; t++) {
    const a = triIds[t * 3];
    const b = triIds[t * 3 + 1];
    const c = triIds[t * 3 + 2];
    adj[a].add(b); adj[a].add(c);
    adj[b].add(a); adj[b].add(c);
    adj[c].add(a); adj[c].add(b);
  }

  return adj;
}

// ─── Spatial Hash Grid ──────────────────────────────────────────────────────

/** Find a prime >= n. */
function nextPrime(n: number): number {
  if (n <= 2) return 2;
  let candidate = n % 2 === 0 ? n + 1 : n;
  while (true) {
    let isPrime = true;
    const limit = Math.floor(Math.sqrt(candidate));
    for (let d = 3; d <= limit; d += 2) {
      if (candidate % d === 0) { isPrime = false; break; }
    }
    if (isPrime) return candidate;
    candidate += 2;
  }
}

/**
 * Spatial hash grid for O(n) rebuild, O(1) amortized neighbor queries.
 */
export class SpatialHashGrid {
  private invCellSize: number;
  private tableSize: number;

  // Counting-sort arrays
  private cellStart: Int32Array;
  private cellEntries: Int32Array;
  private cellCount: Int32Array;

  constructor(cellSize: number) {
    this.invCellSize = 1.0 / cellSize;
    this.tableSize = 1;
    this.cellStart = new Int32Array(0);
    this.cellEntries = new Int32Array(0);
    this.cellCount = new Int32Array(0);
  }

  private hashCoords(xi: number, yi: number, zi: number): number {
    const h = ((xi * 92837111) ^ (yi * 689287499) ^ (zi * 283923481)) % this.tableSize;
    return h < 0 ? h + this.tableSize : h;
  }

  private intCoord(v: number): number {
    return Math.floor(v * this.invCellSize);
  }

  /**
   * Rebuild the hash from current positions. O(n).
   */
  build(positions: Float32Array, numParticles: number): void {
    this.tableSize = nextPrime(numParticles * 2);

    // Ensure arrays are large enough
    if (this.cellCount.length < this.tableSize) {
      this.cellCount = new Int32Array(this.tableSize);
      this.cellStart = new Int32Array(this.tableSize);
    } else {
      this.cellCount.fill(0, 0, this.tableSize);
    }

    if (this.cellEntries.length < numParticles) {
      this.cellEntries = new Int32Array(numParticles);
    }

    // Count particles per cell
    for (let i = 0; i < numParticles; i++) {
      const h = this.hashCoords(
        this.intCoord(positions[i * 3]),
        this.intCoord(positions[i * 3 + 1]),
        this.intCoord(positions[i * 3 + 2]),
      );
      this.cellCount[h]++;
    }

    // Prefix sum → cellStart
    let start = 0;
    for (let i = 0; i < this.tableSize; i++) {
      this.cellStart[i] = start;
      start += this.cellCount[i];
      this.cellCount[i] = 0; // reset for scatter
    }

    // Scatter particles into entries
    for (let i = 0; i < numParticles; i++) {
      const h = this.hashCoords(
        this.intCoord(positions[i * 3]),
        this.intCoord(positions[i * 3 + 1]),
        this.intCoord(positions[i * 3 + 2]),
      );
      const idx = this.cellStart[h] + this.cellCount[h];
      this.cellEntries[idx] = i;
      this.cellCount[h]++;
    }
  }

  /**
   * Query all particles in the 3³ neighborhood of (x, y, z).
   * Returns particle indices via callback for zero-allocation.
   */
  query(x: number, y: number, z: number, callback: (particleIndex: number) => void): void {
    const xi0 = this.intCoord(x) - 1;
    const yi0 = this.intCoord(y) - 1;
    const zi0 = this.intCoord(z) - 1;

    for (let xi = xi0; xi <= xi0 + 2; xi++) {
      for (let yi = yi0; yi <= yi0 + 2; yi++) {
        for (let zi = zi0; zi <= zi0 + 2; zi++) {
          const h = this.hashCoords(xi, yi, zi);
          const s = this.cellStart[h];
          const e = s + this.cellCount[h];
          for (let k = s; k < e; k++) {
            callback(this.cellEntries[k]);
          }
        }
      }
    }
  }

  /**
   * Query returning an array (convenience, allocates).
   */
  queryArray(x: number, y: number, z: number): number[] {
    const result: number[] = [];
    this.query(x, y, z, (idx) => result.push(idx));
    return result;
  }
}

// ─── Self-Collision Solver ──────────────────────────────────────────────────

/**
 * Solve self-collision constraints using spatial hashing.
 *
 * For each particle pair closer than `thickness` that don't share a triangle,
 * push them apart along the connecting direction, weighted by inverse mass.
 */
export function solveSelfCollision(
  positions: Float32Array,
  _prevPositions: Float32Array,
  invMass: Float32Array,
  numParticles: number,
  triIds: Int32Array,
  thickness: number,
  grid: SpatialHashGrid,
  adjacency?: Set<number>[],
): void {
  // Rebuild spatial hash
  grid.build(positions, numParticles);

  // Build adjacency if not provided
  const adj = adjacency ?? buildAdjacency(triIds, numParticles);

  const thicknessSq = thickness * thickness;

  for (let i = 0; i < numParticles; i++) {
    if (invMass[i] === 0.0) continue;

    const ix = i * 3;
    const px = positions[ix];
    const py = positions[ix + 1];
    const pz = positions[ix + 2];

    grid.query(px, py, pz, (j) => {
      if (j <= i) return; // avoid duplicates
      if (invMass[j] === 0.0) return; // skip pinned
      if (adj[i].has(j)) return; // skip connected neighbors

      const jx = j * 3;
      const dx = positions[ix] - positions[jx];
      const dy = positions[ix + 1] - positions[jx + 1];
      const dz = positions[ix + 2] - positions[jx + 2];
      const dist2 = dx * dx + dy * dy + dz * dz;

      if (dist2 >= thicknessSq || dist2 === 0.0) return;

      const dist = Math.sqrt(dist2);
      const invDist = 1.0 / dist;

      // Normal from j → i
      const nx = dx * invDist;
      const ny = dy * invDist;
      const nz = dz * invDist;

      const wi = invMass[i];
      const wj = invMass[j];
      const wSum = wi + wj;

      const corr = (thickness - dist) / wSum;

      // Push apart weighted by inverse mass
      positions[ix] += nx * corr * wi;
      positions[ix + 1] += ny * corr * wi;
      positions[ix + 2] += nz * corr * wi;

      positions[jx] -= nx * corr * wj;
      positions[jx + 1] -= ny * corr * wj;
      positions[jx + 2] -= nz * corr * wj;
    });
  }
}

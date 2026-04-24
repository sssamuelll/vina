/**
 * Long Range Attachments (LRA) — prevents super-stretching by enforcing
 * geodesic distance limits from pinned particles.
 *
 * Reference: Kim & Delaney 2013 / Müller "Long Range Attachments"
 *
 * @module longRangeAttachments
 */

export interface LRAConstraint {
  particleIndex: number;
  attachmentIndex: number;
  maxDistance: number;
}

/**
 * Build LRA constraints via Dijkstra from pinned particles through the mesh graph.
 *
 * Uses a binary min-heap over typed arrays for the priority queue, so the
 * overall cost is O((V + E) log V) instead of the previous O(V^2) that came
 * from an insertion-sorted array queue. Ties in distance are broken by node
 * index so the output is deterministic regardless of pinned-set insertion
 * order.
 */
export function buildLRAConstraints(
  restPositions: Float32Array,
  numParticles: number,
  triIds: Int32Array,
  pinnedParticles: Set<number>,
  slack: number = 1.1,
): LRAConstraint[] {
  if (pinnedParticles.size === 0) return [];

  const adj: Array<Set<number>> = new Array(numParticles);
  for (let i = 0; i < numParticles; i++) adj[i] = new Set();

  const numTris = triIds.length / 3;
  for (let t = 0; t < numTris; t++) {
    const i0 = triIds[3 * t];
    const i1 = triIds[3 * t + 1];
    const i2 = triIds[3 * t + 2];
    adj[i0].add(i1); adj[i0].add(i2);
    adj[i1].add(i0); adj[i1].add(i2);
    adj[i2].add(i0); adj[i2].add(i1);
  }

  function edgeLength(a: number, b: number): number {
    const ai = a * 3, bi = b * 3;
    const dx = restPositions[ai] - restPositions[bi];
    const dy = restPositions[ai + 1] - restPositions[bi + 1];
    const dz = restPositions[ai + 2] - restPositions[bi + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  const dist = new Float32Array(numParticles);
  dist.fill(Infinity);
  const attachedTo = new Int32Array(numParticles);
  attachedTo.fill(-1);
  const visited = new Uint8Array(numParticles);

  // Upper bound for heap pushes: each directed half-edge can enqueue at most
  // once per successful relaxation, plus one seed entry per pinned particle.
  let adjTotal = 0;
  for (let i = 0; i < numParticles; i++) adjTotal += adj[i].size;
  const heapCapacity = adjTotal + pinnedParticles.size;

  const heapKeys = new Float64Array(heapCapacity);
  const heapValues = new Int32Array(heapCapacity);
  let heapSize = 0;

  // Lexicographic compare: (key, value). Returns true iff a < b.
  function lt(keyA: number, valueA: number, keyB: number, valueB: number): boolean {
    if (keyA < keyB) return true;
    if (keyA > keyB) return false;
    return valueA < valueB;
  }

  function swap(i: number, j: number): void {
    const tk = heapKeys[i]; heapKeys[i] = heapKeys[j]; heapKeys[j] = tk;
    const tv = heapValues[i]; heapValues[i] = heapValues[j]; heapValues[j] = tv;
  }

  function siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (lt(heapKeys[parent], heapValues[parent], heapKeys[i], heapValues[i])) return;
      if (heapKeys[parent] === heapKeys[i] && heapValues[parent] === heapValues[i]) return;
      swap(i, parent);
      i = parent;
    }
  }

  function siftDown(i: number): void {
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let smallest = i;
      if (l < heapSize && lt(heapKeys[l], heapValues[l], heapKeys[smallest], heapValues[smallest])) {
        smallest = l;
      }
      if (r < heapSize && lt(heapKeys[r], heapValues[r], heapKeys[smallest], heapValues[smallest])) {
        smallest = r;
      }
      if (smallest === i) return;
      swap(i, smallest);
      i = smallest;
    }
  }

  function heapPush(key: number, value: number): void {
    heapKeys[heapSize] = key;
    heapValues[heapSize] = value;
    heapSize++;
    siftUp(heapSize - 1);
  }

  function heapPop(): void {
    heapSize--;
    if (heapSize > 0) {
      heapKeys[0] = heapKeys[heapSize];
      heapValues[0] = heapValues[heapSize];
      siftDown(0);
    }
  }

  for (const p of pinnedParticles) {
    dist[p] = 0;
    attachedTo[p] = p;
    heapPush(0, p);
  }

  while (heapSize > 0) {
    const uKey = heapKeys[0];
    const u = heapValues[0];
    heapPop();
    if (visited[u]) continue;
    if (uKey > dist[u]) continue;
    visited[u] = 1;

    for (const v of adj[u]) {
      const newDist = dist[u] + edgeLength(u, v);
      if (newDist < dist[v]) {
        dist[v] = newDist;
        attachedTo[v] = attachedTo[u];
        heapPush(newDist, v);
      }
    }
  }

  const constraints: LRAConstraint[] = [];
  for (let i = 0; i < numParticles; i++) {
    if (pinnedParticles.has(i)) continue;
    if (attachedTo[i] < 0 || !isFinite(dist[i])) continue;
    constraints.push({
      particleIndex: i,
      attachmentIndex: attachedTo[i],
      maxDistance: dist[i] * slack,
    });
  }

  return constraints;
}

/**
 * Enforce LRA: pull particles back if they exceed maxDistance from attachment.
 */
export function solveLRA(
  positions: Float32Array,
  invMass: Float32Array,
  constraints: LRAConstraint[],
): void {
  for (let c = 0; c < constraints.length; c++) {
    const { particleIndex: pi, attachmentIndex: ai, maxDistance } = constraints[c];
    if (invMass[pi] === 0.0) continue;

    const pIdx = pi * 3, aIdx = ai * 3;
    const dx = positions[pIdx] - positions[aIdx];
    const dy = positions[pIdx + 1] - positions[aIdx + 1];
    const dz = positions[pIdx + 2] - positions[aIdx + 2];
    const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (currentDist > maxDistance && currentDist > 0) {
      const correction = 1.0 - maxDistance / currentDist;
      positions[pIdx] -= correction * dx;
      positions[pIdx + 1] -= correction * dy;
      positions[pIdx + 2] -= correction * dz;
    }
  }
}

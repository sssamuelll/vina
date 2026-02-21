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
 */
export function buildLRAConstraints(
  restPositions: Float32Array,
  numParticles: number,
  triIds: Int32Array,
  pinnedParticles: Set<number>,
  slack: number = 1.1,
): LRAConstraint[] {
  if (pinnedParticles.size === 0) return [];

  // Build adjacency graph from triangles
  const adj: Map<number, Set<number>> = new Map();
  for (let i = 0; i < numParticles; i++) adj.set(i, new Set());

  const numTris = triIds.length / 3;
  for (let t = 0; t < numTris; t++) {
    const i0 = triIds[3 * t];
    const i1 = triIds[3 * t + 1];
    const i2 = triIds[3 * t + 2];
    adj.get(i0)!.add(i1); adj.get(i0)!.add(i2);
    adj.get(i1)!.add(i0); adj.get(i1)!.add(i2);
    adj.get(i2)!.add(i0); adj.get(i2)!.add(i1);
  }

  // Edge rest-length helper
  function edgeLength(a: number, b: number): number {
    const ai = a * 3, bi = b * 3;
    const dx = restPositions[ai] - restPositions[bi];
    const dy = restPositions[ai + 1] - restPositions[bi + 1];
    const dz = restPositions[ai + 2] - restPositions[bi + 2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Dijkstra from all pinned particles simultaneously
  const dist = new Float32Array(numParticles);
  dist.fill(Infinity);
  const attachedTo = new Int32Array(numParticles);
  attachedTo.fill(-1);

  // Simple priority queue (array-based, sufficient for cloth meshes)
  const queue: Array<{ node: number; dist: number }> = [];
  const visited = new Uint8Array(numParticles);

  for (const p of pinnedParticles) {
    dist[p] = 0;
    attachedTo[p] = p;
    queue.push({ node: p, dist: 0 });
  }

  // Sort descending so we can pop from end
  queue.sort((a, b) => b.dist - a.dist);

  while (queue.length > 0) {
    const { node: u, dist: d } = queue.pop()!;
    if (visited[u]) continue;
    if (d > dist[u]) continue;
    visited[u] = 1;

    for (const v of adj.get(u)!) {
      const newDist = dist[u] + edgeLength(u, v);
      if (newDist < dist[v]) {
        dist[v] = newDist;
        attachedTo[v] = attachedTo[u];
        queue.push({ node: v, dist: newDist });
        // Maintain sorted order (insertion sort from end)
        let i = queue.length - 1;
        while (i > 0 && queue[i].dist > queue[i - 1].dist) {
          [queue[i], queue[i - 1]] = [queue[i - 1], queue[i]];
          i--;
        }
      }
    }
  }

  // Build constraints for non-pinned particles
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

/**
 * Compute Euclidean rest lengths for stretch constraint edges.
 *
 * Given vertex positions and edge pairs (stretchingIds), returns an array
 * of distances. Used to update solver constraints on dimension-only edits.
 */
export function computeRestLengths(
  vertices: Float32Array,
  stretchingIds: Int32Array,
): Float32Array {
  const numEdges = stretchingIds.length / 2;
  const lengths = new Float32Array(numEdges);
  for (let i = 0; i < numEdges; i++) {
    const id0 = stretchingIds[2 * i];
    const id1 = stretchingIds[2 * i + 1];
    const dx = vertices[id1 * 3] - vertices[id0 * 3];
    const dy = vertices[id1 * 3 + 1] - vertices[id0 * 3 + 1];
    const dz = vertices[id1 * 3 + 2] - vertices[id0 * 3 + 2];
    lengths[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return lengths;
}

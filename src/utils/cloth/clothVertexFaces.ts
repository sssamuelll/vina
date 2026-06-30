/** Per-vertex incident-face list in CSR form, built once from static cloth topology. */
export interface ClothVertexFaces {
  /** numParticles+1; particle p's faces are faces[offsets[p]..offsets[p+1]]. */
  offsets: Uint32Array;
  /** numTriangles*3 triangle indices, grouped by vertex. */
  faces: Uint32Array;
}

export function buildClothVertexFaces(
  triangleIds: Uint32Array,
  numParticles: number,
): ClothVertexFaces {
  const numTris = triangleIds.length / 3;
  // Pass 1: count incidences per vertex.
  const counts = new Uint32Array(numParticles);
  for (let i = 0; i < triangleIds.length; i++) counts[triangleIds[i]]++;
  // Prefix sum → offsets.
  const offsets = new Uint32Array(numParticles + 1);
  for (let p = 0; p < numParticles; p++) offsets[p + 1] = offsets[p] + counts[p];
  // Pass 2: scatter triangle indices into faces using a moving cursor.
  const faces = new Uint32Array(numTris * 3);
  const cursor = offsets.slice(0, numParticles); // copy; cursor[p] is next write slot for vertex p
  for (let t = 0; t < numTris; t++) {
    for (let k = 0; k < 3; k++) {
      const v = triangleIds[t * 3 + k];
      faces[cursor[v]++] = t;
    }
  }
  return { offsets, faces };
}

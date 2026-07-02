import { describe, it, expect } from 'vitest';
import { buildClothVertexFaces } from '../clothVertexFaces';

describe('buildClothVertexFaces', () => {
  it('CSR: a shared vertex lists both incident triangles', () => {
    // two tris sharing edge (1,2): tri0=(0,1,2), tri1=(1,3,2)
    const triangleIds = new Uint32Array([0, 1, 2, 1, 3, 2]);
    const { offsets, faces } = buildClothVertexFaces(triangleIds, 4);
    expect(offsets.length).toBe(5); // numParticles+1
    const facesOf = (p: number) => Array.from(faces.slice(offsets[p], offsets[p + 1])).sort();
    expect(facesOf(0)).toEqual([0]);       // vertex 0 in tri0 only
    expect(facesOf(1)).toEqual([0, 1]);    // vertex 1 shared
    expect(facesOf(2)).toEqual([0, 1]);    // vertex 2 shared
    expect(facesOf(3)).toEqual([1]);       // vertex 3 in tri1 only
    expect(faces.length).toBe(6);          // numTriangles*3 total incidences
  });
});

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { exportToFBX } from '../fbxExporter';

function makeTestMesh(): THREE.Group {
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0, 0, 0,  100, 0, 0,  100, 100, 0,
    0, 0, 0,  100, 100, 0,  0, 100, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff0000 }));
  mesh.name = 'test_piece';
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

describe('exportToFBX', () => {
  it('returns an ArrayBuffer', () => {
    const result = exportToFBX(makeTestMesh());
    expect(result).toBeInstanceOf(ArrayBuffer);
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('starts with FBX binary magic', () => {
    const result = exportToFBX(makeTestMesh());
    const view = new Uint8Array(result);
    const magic = String.fromCharCode(...view.slice(0, 20));
    expect(magic).toContain('Kaydara FBX Binary');
  });

  it('works with different scale', () => {
    const result = exportToFBX(makeTestMesh(), { scale: 0.001 });
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it('handles empty group', () => {
    const result = exportToFBX(new THREE.Group());
    expect(result).toBeInstanceOf(ArrayBuffer);
  });
});

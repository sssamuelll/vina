import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { exportToOBJ } from '../objExporter';

function makeTestMesh(): THREE.Group {
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0, 0, 0,  100, 0, 0,  100, 100, 0,  // triangle 1
    0, 0, 0,  100, 100, 0,  0, 100, 0,   // triangle 2
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
  mesh.name = 'test_piece';
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

describe('exportToOBJ', () => {
  it('produces valid OBJ with vertices and faces', () => {
    const group = makeTestMesh();
    const obj = exportToOBJ(group);

    expect(obj).toContain('# Vina OBJ Export');
    expect(obj).toContain('o test_piece');
    // 6 vertices
    const vLines = obj.split('\n').filter(l => l.startsWith('v '));
    expect(vLines.length).toBe(6);
    // 2 faces
    const fLines = obj.split('\n').filter(l => l.startsWith('f '));
    expect(fLines.length).toBe(2);
  });

  it('applies scale factor', () => {
    const group = makeTestMesh();
    // Scale 0.1 = mm→cm: vertex at 100mm → 10cm
    const obj = exportToOBJ(group, { scale: 0.1 });
    const firstV = obj.split('\n').find(l => l.startsWith('v ') && !l.includes('0.000000 0.000000 0.000000'));
    expect(firstV).toContain('10.000000');
  });

  it('includes normals by default', () => {
    const group = makeTestMesh();
    const obj = exportToOBJ(group);
    const vnLines = obj.split('\n').filter(l => l.startsWith('vn '));
    expect(vnLines.length).toBeGreaterThan(0);
  });

  it('excludes normals when disabled', () => {
    const group = makeTestMesh();
    const obj = exportToOBJ(group, { normals: false });
    const vnLines = obj.split('\n').filter(l => l.startsWith('vn '));
    expect(vnLines.length).toBe(0);
  });

  it('handles empty group', () => {
    const group = new THREE.Group();
    const obj = exportToOBJ(group);
    expect(obj).toContain('# Vina OBJ Export');
    const fLines = obj.split('\n').filter(l => l.startsWith('f '));
    expect(fLines.length).toBe(0);
  });
});

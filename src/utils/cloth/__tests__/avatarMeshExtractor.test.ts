/**
 * Tests for avatarMeshExtractor utility.
 *
 * Tests the mesh extraction functions that extract world-space vertices
 * and indices from Three.js scenes.
 */

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { extractMeshData } from '../avatarMeshExtractor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a simple box mesh scene for testing. */
function makeBoxScene(size = 1): THREE.Group {
  const geo = new THREE.BoxGeometry(size, size, size);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

/** Create a scene with a transformed mesh. */
function makeTransformedScene(): THREE.Group {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(2, 3, 4);
  mesh.scale.setScalar(2);
  const group = new THREE.Group();
  group.add(mesh);
  group.updateMatrixWorld(true);
  return group;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('extractMeshData', () => {
  it('extracts vertices and indices from a simple box', () => {
    const scene = makeBoxScene(1);
    const { vertices, indices } = extractMeshData(scene);

    // BoxGeometry has 24 vertices (4 per face × 6 faces) and 36 indices
    expect(vertices.length).toBe(24 * 3);
    expect(indices.length).toBe(36);
    expect(vertices).toBeInstanceOf(Float32Array);
    expect(indices).toBeInstanceOf(Uint32Array);
  });

  it('applies world transforms to vertices', () => {
    const scene = makeTransformedScene();
    const { vertices } = extractMeshData(scene);

    // All vertices should be around (2,3,4) ± 1 (scaled box)
    for (let i = 0; i < vertices.length; i += 3) {
      expect(vertices[i]).toBeGreaterThanOrEqual(1);     // x: 2 - 1
      expect(vertices[i]).toBeLessThanOrEqual(3);         // x: 2 + 1
      expect(vertices[i + 1]).toBeGreaterThanOrEqual(2);  // y: 3 - 1
      expect(vertices[i + 1]).toBeLessThanOrEqual(4);     // y: 3 + 1
      expect(vertices[i + 2]).toBeGreaterThanOrEqual(3);  // z: 4 - 1
      expect(vertices[i + 2]).toBeLessThanOrEqual(5);     // z: 4 + 1
    }
  });

  it('returns empty arrays for empty scene', () => {
    const group = new THREE.Group();
    group.updateMatrixWorld(true);
    const { vertices, indices } = extractMeshData(group);
    expect(vertices.length).toBe(0);
    expect(indices.length).toBe(0);
  });
});

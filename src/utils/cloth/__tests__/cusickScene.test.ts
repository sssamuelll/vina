/**
 * B2: escena del gate Cusick virtual — disco de 30 cm por el mesher CDT REAL
 * de producción (meshPieceOutline) + pedestal cilíndrico de 18 cm como
 * CollisionMeshData manifold (apto para buildBodyPseudonormals).
 *
 * Determinismo (Halberg #9): el jitter de rompimiento de simetría es un LCG
 * sembrado — dos builds con la misma seed son bit-idénticos; el disco
 * perfectamente simétrico es la escena metastable canónica y el jitter clava
 * la cuenca.
 */
import { describe, it, expect } from 'vitest';
import { buildCusickDiscMesh, buildCusickPedestal } from '../cusickScene';
import { extractOrderedBoundaryLoop } from '../cusickMetric';
import { buildBodyPseudonormals, weldAndCountManifold } from '../bodyPseudonormals';

describe('buildCusickDiscMesh', () => {
  it('meshes a ~30cm disc at the requested height with sim-grade density', () => {
    const disc = buildCusickDiscMesh({ y: 0.9 });
    const n = disc.mesh.vertices.length / 3;
    expect(n).toBeGreaterThan(1200);
    expect(n).toBeLessThan(6000);
    expect(disc.mesh.triIds.length).toBeGreaterThan(0);

    // Horizontal: todos los verts a la altura pedida.
    for (let i = 0; i < n; i++) {
      expect(disc.mesh.vertices[i * 3 + 1]).toBeCloseTo(0.9, 6);
    }

    // Radio del hem ≈ 0.15 m (centrado en el origen por el mesher).
    const loop = extractOrderedBoundaryLoop(new Uint32Array(disc.mesh.triIds));
    expect(loop.length).toBeGreaterThan(48);
    for (let i = 0; i < loop.length; i++) {
      const x = disc.mesh.vertices[loop[i] * 3];
      const z = disc.mesh.vertices[loop[i] * 3 + 2];
      expect(Math.hypot(x, z)).toBeGreaterThan(0.145);
      expect(Math.hypot(x, z)).toBeLessThan(0.155);
    }
  });

  // Timeout: el runner de CI mallea el disco en ~4s (dev ~0.5s); este test
  // construye DOS mallas. Presupuesto holgado, no es un perf gate.
  it('is deterministic: same seed → bit-identical mesh', { timeout: 30_000 }, () => {
    const a = buildCusickDiscMesh({ y: 0.9, seed: 42 });
    const b = buildCusickDiscMesh({ y: 0.9, seed: 42 });
    expect(Array.from(a.mesh.vertices)).toEqual(Array.from(b.mesh.vertices));
    expect(Array.from(a.mesh.triIds)).toEqual(Array.from(b.mesh.triIds));
  });

  it('symmetry-breaking: different seeds → different outlines', { timeout: 30_000 }, () => {
    const a = buildCusickDiscMesh({ y: 0.9, seed: 42 });
    const b = buildCusickDiscMesh({ y: 0.9, seed: 43 });
    expect(Array.from(a.mesh.vertices)).not.toEqual(Array.from(b.mesh.vertices));
  });
});

describe('buildCusickPedestal', () => {
  it('builds a closed (manifold) cylinder collision mesh of 18cm diameter', () => {
    const ped = buildCusickPedestal({ topY: 0.85 });
    const { boundaryEdges } = weldAndCountManifold(ped, 1e-6);
    expect(boundaryEdges).toBe(0); // watertight — pseudonormales válidas

    // Radio 0.09 en la pared; tapa superior a topY.
    let maxY = -Infinity;
    let maxR = 0;
    for (let i = 0; i < ped.vertices.length / 3; i++) {
      const x = ped.vertices[i * 3];
      const y = ped.vertices[i * 3 + 1];
      const z = ped.vertices[i * 3 + 2];
      maxY = Math.max(maxY, y);
      maxR = Math.max(maxR, Math.hypot(x, z));
    }
    expect(maxY).toBeCloseTo(0.85, 6);
    expect(maxR).toBeGreaterThan(0.089);
    expect(maxR).toBeLessThan(0.091);
  });

  it('pseudonormals build without degenerate output', () => {
    const ped = buildCusickPedestal({ topY: 0.85 });
    const pn = buildBodyPseudonormals(ped);
    expect(pn).toBeTruthy();
  });
});

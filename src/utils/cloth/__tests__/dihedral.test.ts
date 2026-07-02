/**
 * P1 dihedral (spec docs/superpowers/specs/2026-07-02-dihedral-bend-design.md §4).
 *
 * Una sola función TS es la verdad del ángulo REST (extractor) y del RUNTIME
 * (kernel CPU; Rust/TSL la transcriben). Convención: FLAT = φ = 0, signo por
 * atan2 (Tissu) — no acos. Guards load-bearing (one-sided stretch hace
 * slivers más probables): elen, |n|², denom.
 */
import { describe, it, expect } from 'vitest';
import { dihedralAngle, solveDihedralQuad } from '../dihedral';

/** Quad canónico: arista (a,b) en x, alas c (+y) y d (−y). θ pliega d alrededor de la arista. */
function quad(theta: number): Float32Array {
  // d parte en (0.5,−1,0); rotación alrededor del eje x por θ: (y,z) → (−cosθ, sinθ)...
  // representamos d = (0.5, −cos(θ), sin(θ)) — θ=0 plano, θ>0 pliegue hacia +z.
  return new Float32Array([
    0, 0, 0, // a
    1, 0, 0, // b
    0.5, 1, 0, // c
    0.5, -Math.cos(theta), Math.sin(theta), // d
  ]);
}
const A = 0, B = 1, C = 2, D = 3;

function angleOf(pos: Float32Array): number {
  const r = dihedralAngle(pos, A, B, C, D);
  expect(r).not.toBeNull();
  return r!;
}

describe('dihedralAngle', () => {
  it('flat quad → φ = 0 (NOT π — the convention flip)', () => {
    expect(Math.abs(angleOf(quad(0)))).toBeLessThan(1e-6);
  });

  it('folded quads → |φ| = θ, sign flips with fold direction', () => {
    for (const theta of [0.3, Math.PI / 2, 2.5]) {
      const up = angleOf(quad(theta));
      const down = angleOf(quad(-theta));
      expect(Math.abs(Math.abs(up) - theta)).toBeLessThan(1e-5);
      expect(Math.abs(Math.abs(down) - theta)).toBeLessThan(1e-5);
      expect(Math.sign(up)).not.toBe(Math.sign(down));
    }
  });

  it('degenerate configurations → null (never NaN, never π)', () => {
    // Arista colapsada.
    const zeroEdge = new Float32Array([0, 0, 0, 0, 0, 0, 0.5, 1, 0, 0.5, -1, 0]);
    expect(dihedralAngle(zeroEdge, A, B, C, D)).toBeNull();
    // Ala colineal con la arista (triángulo de área cero).
    const sliver = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 0, 0, 0.5, -1, 0]);
    expect(dihedralAngle(sliver, A, B, C, D)).toBeNull();
  });
});

describe('solveDihedralQuad (XPBD projection)', () => {
  const INV_MASS = new Float32Array([1, 1, 1, 1]);

  it('reduces |φ − φ*| toward a FLAT rest from BOTH fold directions', () => {
    for (const theta of [0.6, -0.6]) {
      const pos = quad(theta);
      const before = Math.abs(angleOf(pos));
      for (let i = 0; i < 30; i++) {
        solveDihedralQuad(pos, INV_MASS, A, B, C, D, 0, 0);
      }
      const after = Math.abs(angleOf(pos));
      expect(after, `theta=${theta}`).toBeLessThan(before * 0.2);
    }
  });

  it('folds a flat quad TOWARD a crease target (creaseAngle semantics)', () => {
    const target = Math.PI / 3;
    const pos = quad(0.01); // sesgo mínimo para elegir rama de pliegue
    for (let i = 0; i < 60; i++) {
      solveDihedralQuad(pos, INV_MASS, A, B, C, D, target, 0);
    }
    expect(Math.abs(angleOf(pos) - target)).toBeLessThan(0.05);
  });

  it('respects pinned vertices (w=0 does not move)', () => {
    const pos = quad(0.8);
    const pinned = new Float32Array([0, 0, 1, 1]); // a,b clavados
    const ax0 = pos[A * 3];
    const bx0 = pos[B * 3];
    for (let i = 0; i < 20; i++) {
      solveDihedralQuad(pos, pinned, A, B, C, D, 0, 0);
    }
    expect(pos[A * 3]).toBe(ax0);
    expect(pos[B * 3]).toBe(bx0);
    expect(Math.abs(angleOf(pos))).toBeLessThan(0.8); // y aún así redujo el ángulo
  });

  it('high compliance (alphaTilde) weakens the correction (XPBD semantics)', () => {
    const rigid = quad(0.6);
    const soft = quad(0.6);
    solveDihedralQuad(rigid, INV_MASS, A, B, C, D, 0, 0);
    solveDihedralQuad(soft, INV_MASS, A, B, C, D, 0, 50); // α̃ grande
    const phiRigid = Math.abs(angleOf(rigid));
    const phiSoft = Math.abs(angleOf(soft));
    expect(phiRigid).toBeLessThan(phiSoft);
    expect(phiSoft).toBeLessThan(0.6 + 1e-9); // soft se movió poco o nada, jamás empeora
  });

  it('is a no-op on degenerate quads (guards, not NaN)', () => {
    const sliver = new Float32Array([0, 0, 0, 1, 0, 0, 0.5, 0, 0, 0.5, -1, 0]);
    const beforeCopy = Array.from(sliver);
    solveDihedralQuad(sliver, INV_MASS, A, B, C, D, 0, 0);
    expect(Array.from(sliver)).toEqual(beforeCopy);
  });
});

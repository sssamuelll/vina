/**
 * B5 (P1-A, plan drape profesional 2026-07-02): stretch ONE-SIDED.
 *
 * El stretch two-sided resistía compresión → la membrana no podía juntarse →
 * el pandeo fuera de plano (pliegues) era imposible (diagnóstico 2026-06-26,
 * "la tela es un GLOBO"). Gate: corregir SOLO cuando C = len − rest > 0
 * (tensión); compresión libre — el buckling lo gobierna el dihedral (P1-B).
 * Seams y strain-limit intactos (kernels propios; el cap ya era one-sided en
 * tensión). Espejo Rust en lib.rs (test cargo) y TSL (transcripción).
 */
import { describe, it, expect } from 'vitest';
import { XPBDClothSolver } from '../xpbdSolver';

/** Triángulo equilátero de lado `s` en el plano XZ (sin bend — 1 tri). */
function makeTriangle(side: number): Float32Array {
  return new Float32Array([
    0, 1, 0,
    side, 1, 0,
    side / 2, 1, (side * Math.sqrt(3)) / 2,
  ]);
}

function edgeLen(pos: Float32Array, a: number, b: number): number {
  return Math.hypot(
    pos[b * 3] - pos[a * 3],
    pos[b * 3 + 1] - pos[a * 3 + 1],
    pos[b * 3 + 2] - pos[a * 3 + 2],
  );
}

function makeSolver(positions: Float32Array) {
  return new XPBDClothSolver(
    { vertices: positions, triIds: new Int32Array([0, 1, 2]) },
    // Gravedad 0 + ground lejos + substeps fijos: aísla el stretch.
    { gravity: [0, 0, 0], groundY: -100, selfCollision: false, enableLRA: false, adaptiveSubsteps: false },
  );
}

describe('one-sided stretch (P1-A)', () => {
  it('a COMPRESSED edge is NOT pushed back apart (compression is free)', () => {
    // Rest = triángulo de lado 0.1 (el constructor captura rest de las
    // posiciones); luego comprimimos todo al 80% y dejamos correr.
    const rest = makeTriangle(0.1);
    const solver = makeSolver(rest);
    const compressed = makeTriangle(0.08);
    solver.pos.set(compressed);
    solver.prevPos.set(compressed);

    for (let i = 0; i < 5; i++) solver.step();

    for (const [a, b] of [[0, 1], [1, 2], [0, 2]] as const) {
      // Sin expansión: la arista queda comprimida (tolerancia por damping).
      expect(edgeLen(solver.pos, a, b)).toBeLessThan(0.08 * 1.02);
    }
  });

  it('a STRETCHED edge is still pulled back toward rest (tension resists)', () => {
    const rest = makeTriangle(0.1);
    const solver = makeSolver(rest);
    const stretched = makeTriangle(0.13);
    solver.pos.set(stretched);
    solver.prevPos.set(stretched);

    for (let i = 0; i < 5; i++) solver.step();

    for (const [a, b] of [[0, 1], [1, 2], [0, 2]] as const) {
      expect(edgeLen(solver.pos, a, b)).toBeLessThan(0.13 * 0.9);
    }
  });
});

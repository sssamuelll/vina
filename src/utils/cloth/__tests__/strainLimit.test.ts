/**
 * Backport A7 STEP-4 (pre-merge #924): hard strain limit en el solver CPU —
 * espejo del cap fusionado del GPU (tslSolver makeDistanceConstraintFn) y del
 * Rust (lib.rs `stretch_hard_cap_at_max_strain`). Tras el solve compliant
 * one-sided, un clamp RÍGIDO (alpha=0) devuelve el edge a rest·(1+maxStrain).
 * Default 0.02 (2% woven, el mismo default GPU); 0 deshabilita.
 */
import { describe, it, expect } from 'vitest';
import { XPBDClothSolver } from '../xpbdSolver';

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

// Compliance de stretch enorme → el solve compliant es ~no-op y solo el cap
// rígido puede corregir: aísla el strain-limit del resto de la física.
function makeSolver(positions: Float32Array, maxStrain?: number) {
  return new XPBDClothSolver(
    { vertices: positions, triIds: new Int32Array([0, 1, 2]) },
    {
      gravity: [0, 0, 0], groundY: -100, selfCollision: false, enableLRA: false,
      adaptiveSubsteps: false,
      stretchComplianceWarp: 1e6, stretchComplianceWeft: 1e6, stretchComplianceShear: 1e6,
      ...(maxStrain !== undefined ? { maxStrain } : {}),
    },
  );
}

describe('hard strain limit (backport A7 STEP-4)', () => {
  it('rigidly caps a stretched edge at rest·(1+maxStrain) despite huge compliance', () => {
    const rest = makeTriangle(0.1);
    const solver = makeSolver(rest);
    const stretched = makeTriangle(0.15); // +50%, muy sobre el cap del 2%
    solver.pos.set(stretched);
    solver.prevPos.set(stretched);

    solver.step();

    for (const [a, b] of [[0, 1], [1, 2], [0, 2]] as const) {
      expect(edgeLen(solver.pos, a, b)).toBeLessThanOrEqual(0.1 * 1.02 + 1e-5);
    }
  });

  it('maxStrain=0 disables the cap (huge compliance leaves the edge stretched)', () => {
    const rest = makeTriangle(0.1);
    const solver = makeSolver(rest, 0);
    const stretched = makeTriangle(0.15);
    solver.pos.set(stretched);
    solver.prevPos.set(stretched);

    solver.step();

    // Sin cap y con compliance ~infinita, la arista queda casi sin corregir.
    expect(edgeLen(solver.pos, 0, 1)).toBeGreaterThan(0.1 * 1.1);
  });

  it('does not touch compressed edges (one-sided intact)', () => {
    const rest = makeTriangle(0.1);
    const solver = makeSolver(rest);
    const compressed = makeTriangle(0.08);
    solver.pos.set(compressed);
    solver.prevPos.set(compressed);

    solver.step();

    for (const [a, b] of [[0, 1], [1, 2], [0, 2]] as const) {
      expect(edgeLen(solver.pos, a, b)).toBeLessThan(0.08 * 1.02);
    }
  });
});

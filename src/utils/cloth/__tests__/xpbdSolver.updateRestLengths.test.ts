import { describe, it, expect } from 'vitest';
import { XPBDClothSolver } from '../xpbdSolver';

function makeQuadMesh() {
  const vertices = new Float32Array([
    0, 1, 0,
    0.1, 1, 0,
    0, 1, 0.1,
    0.1, 1, 0.1,
  ]);
  const triIds = new Int32Array([0, 1, 2, 1, 3, 2]);
  return { vertices, triIds };
}

describe('XPBDClothSolver.updateRestLengths', () => {
  it('updates stretching rest lengths in-place', () => {
    const solver = new XPBDClothSolver(makeQuadMesh());
    const { stretchingLengths } = solver.getEdgeData();
    const original = new Float32Array(stretchingLengths);

    const doubled = new Float32Array(stretchingLengths.length);
    for (let i = 0; i < doubled.length; i++) doubled[i] = original[i] * 2;

    solver.updateRestLengths(doubled);
    const { stretchingLengths: updated } = solver.getEdgeData();
    for (let i = 0; i < updated.length; i++) {
      expect(updated[i]).toBeCloseTo(original[i] * 2, 5);
    }
  });

  it('ignores extra entries if newLengths is longer', () => {
    const solver = new XPBDClothSolver(makeQuadMesh());
    const count = solver.getEdgeData().stretchingLengths.length;
    const newLengths = new Float32Array(count + 5);
    newLengths.fill(0.5);
    solver.updateRestLengths(newLengths);
    const { stretchingLengths: updated } = solver.getEdgeData();
    expect(updated.length).toBe(count);
    for (let i = 0; i < count; i++) expect(updated[i]).toBeCloseTo(0.5, 5);
  });

  it('does not change positions or velocities', () => {
    const solver = new XPBDClothSolver(makeQuadMesh());
    const posBefore = new Float32Array(solver.pos);
    const velBefore = new Float32Array(solver.vel);
    const newLengths = new Float32Array(solver.getEdgeData().stretchingLengths.length);
    newLengths.fill(0.5);
    solver.updateRestLengths(newLengths);
    expect(solver.pos).toEqual(posBefore);
    expect(solver.vel).toEqual(velBefore);
  });
});

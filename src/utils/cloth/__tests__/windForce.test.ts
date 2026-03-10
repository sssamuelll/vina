import { describe, it, expect } from 'vitest';
import { XPBDClothSolver, type ClothMeshData } from '../xpbdSolver';

/**
 * Helper: create a minimal single-triangle cloth mesh.
 * Triangle in the XZ plane at y=1, area = 0.5 m².
 */
function makeMinimalMesh(): ClothMeshData {
  return {
    vertices: new Float32Array([
      0, 1, 0,   // v0
      1, 1, 0,   // v1
      0, 1, 1,   // v2
    ]),
    triIds: new Int32Array([0, 1, 2]),
  };
}

describe('wind force', () => {
  it('config accepts windForce with default [0,0,0]', () => {
    const solver = new XPBDClothSolver(makeMinimalMesh());
    expect(solver.config.windForce).toEqual([0, 0, 0]);
  });

  it('setWind updates the wind force', () => {
    const solver = new XPBDClothSolver(makeMinimalMesh());
    solver.setWind([5, 0, 2]);
    expect(solver.config.windForce).toEqual([5, 0, 2]);
  });

  it('wind force affects particle velocities', () => {
    const solver = new XPBDClothSolver(makeMinimalMesh(), {
      gravity: [0, 0, 0],
      damping: 1.0,
      internalDamping: 0.0,
      dragCoefficient: 1.0,
      selfCollision: false,
      numSubsteps: 1,
    });

    // Apply wind in -Y direction (normal to the XZ-plane triangle)
    solver.setWind([0, -5, 0]);
    solver.step();

    // With wind force in -Y and triangle normal pointing in Y direction,
    // particles should have acquired some -Y velocity
    let totalVelY = 0;
    for (let i = 0; i < 3; i++) {
      totalVelY += solver.vel[i * 3 + 1];
    }
    expect(totalVelY).toBeLessThan(0);
  });

  it('zero wind force does not alter velocities beyond gravity/drag', () => {
    const solver = new XPBDClothSolver(makeMinimalMesh(), {
      gravity: [0, 0, 0],
      damping: 1.0,
      internalDamping: 0.0,
      dragCoefficient: 0.0,
      selfCollision: false,
      numSubsteps: 1,
    });

    // Wind is default [0,0,0], no gravity, no drag
    solver.step();

    // All velocities should remain zero
    for (let i = 0; i < solver.vel.length; i++) {
      expect(solver.vel[i]).toBeCloseTo(0, 5);
    }
  });
});

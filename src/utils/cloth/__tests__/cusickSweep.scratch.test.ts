/** SCRATCH — sweep K_bend (no commitear). */
import { describe, it } from 'vitest';
import { buildCusickDiscMesh, buildCusickPedestal } from '../cusickScene';
import { extractOrderedBoundaryLoop, computeDrapeCoefficient, countFolds } from '../cusickMetric';
import { XPBDClothSolver } from '../xpbdSolver';
import { toXPBDParams, getPhysicalFabric } from '../physicalFabric';

const DT = 1 / 60;
function run(fabricId: string, kMul: number) {
  const pf = getPhysicalFabric(fabricId)!;
  const xpbd = toXPBDParams(pf);
  const { mesh } = buildCusickDiscMesh({ y: 0.855, seed: 42 });
  const pedestal = buildCusickPedestal({ topY: 0.85 });
  const solver = new XPBDClothSolver(mesh, {
    numSubsteps: 15, adaptiveSubsteps: false, dt: DT, gravity: [0, -9.81, 0],
    stretchComplianceWarp: 0.0, stretchComplianceWeft: 0.0, stretchComplianceShear: 0.001,
    bendComplianceWarp: xpbd.bendComplianceWarp * kMul,
    bendComplianceWeft: xpbd.bendComplianceWeft * kMul,
    internalDamping: pf.internalDamping,
    fabricDensity: xpbd.density,
  });
  solver.setCollisionMesh(pedestal);
  for (let f = 0; f < 300; f++) solver.step();
  const loop = extractOrderedBoundaryLoop(new Uint32Array(mesh.triIds));
  const dc = computeDrapeCoefficient(solver.pos, loop, { supportRadius: 0.09, specimenRadius: 0.15 });
  const folds = countFolds(solver.pos, loop);
  console.log(`[sweep] ${fabricId} kMul=${kMul} DC=${dc.toFixed(1)} folds=${folds}`);
}

describe('sweep', () => {
  it('runs', () => {
    for (const kMul of [100, 10000]) {
      run('chiffon', kMul);
      run('canvas-12oz', kMul);
    }
  }, 300_000);
});

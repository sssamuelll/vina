import { describe, it, expect } from 'vitest';
import type { TslSolver } from '../../../utils/cloth/gpu/tslSolver';
import { nodosDelSubpaso, REPASOS_DE_ESTIRAMIENTO } from '../nodosDelSubpaso';

/** Un solver de mentira: cada kernel es su nombre, para leer el orden del subpaso. */
function solver(over: Partial<Record<string, unknown>> = {}): TslSolver {
  return {
    preSolve: 'pre',
    windNodes: null,
    stretchColors: ['st0', 'st1'],
    bendColors: ['b0'],
    seamColors: ['se0'],
    selfCollisionNodes: { cellClearNode: 'scClear', scatterNode: 'scScatter', resolveNode: 'scResolve', applyNode: 'scApply' },
    tether: 'tether',
    groundClamp: 'ground',
    grabNodes: { grabNode: 'grab' },
    snapshotPreCollision: 'snap',
    collisionBodies: [{ findBestNode: 'find', applyPushNode: 'push' }],
    facePokeNodes: { generate: 'fpGen', solve: 'fpSolve' },
    postSolve: 'post',
    ...over,
  } as unknown as TslSolver;
}

describe('nodosDelSubpaso: el orden de un subpaso del solver de GPU', () => {
  it('es el de siempre, más los repasos del estiramiento entre la colisión y el cierre', () => {
    const nodos = nodosDelSubpaso(solver(), { tether: true, grab: true, facePoke: true }) as unknown as string[];
    expect(nodos).toEqual([
      'pre', 'st0', 'st1', 'b0', 'se0', 'scClear', 'scScatter', 'scResolve', 'scApply', 'tether', 'ground', 'grab', 'snap',
      'find', 'push', 'fpSolve',
      ...Array.from({ length: REPASOS_DE_ESTIRAMIENTO }, () => ['st0', 'st1']).flat(),
      'post',
    ]);
  });

  it('repasa el estiramiento tres veces: medido con la camisa de María (18 % → 3,9 % de aristas sobre el 8 %)', () => {
    expect(REPASOS_DE_ESTIRAMIENTO).toBe(3);
    const nodos = nodosDelSubpaso(solver(), { tether: false, grab: false, facePoke: false }) as unknown as string[];
    const ultimaColision = nodos.lastIndexOf('push');
    const cierre = nodos.indexOf('post');
    // Lo que la colisión vuelve a estirar se corrige en el mismo subpaso, antes del cierre.
    expect(nodos.slice(ultimaColision + 1, cierre)).toEqual(Array.from({ length: 3 }, () => ['st0', 'st1']).flat());
  });

  it('sin tirante, sin agarre y sin face-poke, esos pasos no están', () => {
    const nodos = nodosDelSubpaso(solver(), { tether: false, grab: false, facePoke: false }) as unknown as string[];
    expect(nodos).not.toContain('tether');
    expect(nodos).not.toContain('grab');
    expect(nodos).not.toContain('fpSolve');
  });
});

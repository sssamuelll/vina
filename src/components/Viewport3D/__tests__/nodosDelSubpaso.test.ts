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
  it('es el de siempre, más los repasos del estiramiento entre el suelo y el agarre', () => {
    const nodos = nodosDelSubpaso(solver(), { tether: true, grab: true, facePoke: true }) as unknown as string[];
    expect(nodos).toEqual([
      'pre', 'st0', 'st1', 'b0', 'se0', 'scClear', 'scScatter', 'scResolve', 'scApply', 'tether', 'ground',
      ...Array.from({ length: REPASOS_DE_ESTIRAMIENTO }, () => ['st0', 'st1']).flat(),
      'grab', 'snap', 'find', 'push', 'fpSolve', 'post',
    ]);
  });

  it('repasa el estiramiento tres veces ANTES de la colisión: la velocidad y la fricción lo ven (revisión de los repasos)', () => {
    expect(REPASOS_DE_ESTIRAMIENTO).toBe(3);
    const nodos = nodosDelSubpaso(solver(), { tether: false, grab: false, facePoke: false }) as unknown as string[];
    // Entre el suelo y el snapshot: como toda restricción, entra en la velocidad
    // (postSolve la saca de preCollisionPos) y la fricción de la colisión la ve.
    // Tras la colisión, la prenda subía 2,8 cm en 8 s y el cierre tomaba la
    // corrección por empuje; aquí la tela queda quieta (medido el 10-10).
    expect(nodos.slice(nodos.indexOf('ground') + 1, nodos.indexOf('snap'))).toEqual(Array.from({ length: 3 }, () => ['st0', 'st1']).flat());
    expect(nodos.slice(nodos.lastIndexOf('push') + 1)).toEqual(['post']);
  });

  it('sin tirante, sin agarre y sin face-poke, esos pasos no están', () => {
    const nodos = nodosDelSubpaso(solver(), { tether: false, grab: false, facePoke: false }) as unknown as string[];
    expect(nodos).not.toContain('tether');
    expect(nodos).not.toContain('grab');
    expect(nodos).not.toContain('fpSolve');
  });

  const viento = (x: number, y: number, z: number) => ({
    windNodes: { accumNode: 'wAcc', applyNode: 'wApp', windX: { value: x }, windY: { value: y }, windZ: { value: z } },
  });

  it('sin viento no despacha el viento: con fuerza cero sumaba ceros con atómicas en cada triángulo y cada subpaso', () => {
    const nodos = nodosDelSubpaso(solver(viento(0, 0, 0)), { tether: false, grab: false, facePoke: false }) as unknown as string[];
    expect(nodos).not.toContain('wAcc');
    expect(nodos).not.toContain('wApp');
  });

  it('con viento, lo despacha justo después de preSolve', () => {
    const nodos = nodosDelSubpaso(solver(viento(0, 0, 2)), { tether: false, grab: false, facePoke: false }) as unknown as string[];
    expect(nodos.slice(0, 3)).toEqual(['pre', 'wAcc', 'wApp']);
  });
});
